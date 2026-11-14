"""Approval, idempotency, replay, artifact privacy and recovery on real PostgreSQL."""

import io
import json
import os
import zipfile
from dataclasses import replace
from hashlib import sha256
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from nova_ember.api import jobs
from nova_ember.api.artifacts import publish_artifact, read_artifact
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus
from nova_ember.api.seed import seed
from nova_ember.workers.__main__ import run_once

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def settings(tmp_path_factory):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for actual PostgreSQL workflow checks.")
    original = Settings.from_environment()
    if url == original.database_url:
        raise RuntimeError("Use a separate disposable test database.")
    settings = replace(
        original, database_url=url, object_directory=tmp_path_factory.mktemp("workflow-objects")
    )
    seed(settings)
    return settings


@pytest.fixture
def clients(settings):
    first, second = TestClient(create_app(settings)), TestClient(create_app(settings))
    yield first, second
    receipt = first.cookies.get("nova_browser_receipt")
    if receipt:
        with connect(settings.database_url) as c:
            digest = sha256(receipt.encode()).hexdigest()
            c.execute("DELETE FROM jobs WHERE receipt_sha256 = %s", (digest,))
            c.execute("DELETE FROM execution_sessions WHERE receipt_sha256 = %s", (digest,))


def selection(settings):
    corpus = Corpus(settings)
    snapshot = corpus.snapshot()
    asset = next(
        asset
        for asset in snapshot["manifest"]["assets"]
        if asset["file_name"] == "PSI-99_Experimental table_SAFFIRE-2.csv"
    )
    return {
        "snapshot_id": snapshot["snapshot_id"],
        "case_id": str(uuid4()),
        "revision": 1,
        "question": "Which Saffire source dimensions are reported?",
        "notes": "Private working note",
        "queries": [
            {
                "snapshot_id": snapshot["snapshot_id"],
                "asset_sha256": asset["sha256"],
                "source_rows": [2, 3],
                "columns": [2, 3],
                "representation": "canonical",
            }
        ],
        "assumptions": ["The source dimensions describe the listed specimens"],
        "limitations": ["These source records do not establish independent trials or safety"],
        "include_original_bytes": True,
    }


def test_export_waits_for_exact_scoped_approval_then_recovers(clients, settings):
    client, other = clients
    request = {"selection": selection(settings)}
    created = client.post("/v1/exports", json=request)
    assert created.status_code == 202
    job = created.json()
    assert job["status"] == "waiting_approval"
    assert client.cookies.get("nova_browser_receipt")
    assert other.get(f"/v1/workflows/{job['id']}").status_code == 404
    pending = client.get(f"/v1/workflows/{job['id']}").json()
    assert pending["approval"]["inputs_sha256"]
    assert (
        client.post(
            f"/v1/workflows/{job['id']}/approve",
            json={"expected_revision": 1, "inputs_sha256": pending["approval"]["inputs_sha256"]},
        ).status_code
        == 409
    )
    approved = client.post(
        f"/v1/workflows/{job['id']}/approve",
        json={"expected_revision": 0, "inputs_sha256": pending["approval"]["inputs_sha256"]},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "queued"
    assert run_once(settings)
    completed = client.get(f"/v1/workflows/{job['id']}")
    assert completed.status_code == 200 and completed.json()["status"] == "succeeded"
    artifact = completed.json()["result"]["artifact"]
    url = f"/v1/workflows/{job['id']}/artifacts/{artifact['id']}"
    assert other.get(url).status_code == 404
    exported = client.get(url)
    assert exported.status_code == 200
    assert exported.headers["content-security-policy"].startswith("sandbox")
    with zipfile.ZipFile(io.BytesIO(exported.content)) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
        assert manifest["limitations"] == request["selection"]["limitations"]
        assert manifest["assumptions"] == request["selection"]["assumptions"]
        assert manifest["independent_run_count"] is None
        checksums = json.loads(bundle.read("CHECKSUMS.json"))
        assert all(
            sha256(bundle.read(name)).hexdigest() == digest for name, digest in checksums.items()
        )
        assert "data/query-1.parquet" in bundle.namelist()
        assert not any(".env" in name for name in bundle.namelist())
    events = client.get(f"/v1/workflows/{job['id']}/events", headers={"Last-Event-ID": "1"})
    assert "event: approved" in events.text
    assert "event: succeeded" in events.text
    assert client.delete(f"/v1/workflows/{job['id']}").status_code == 204
    assert client.get(url).status_code == 404


def test_browser_scoped_idempotency_does_not_duplicate_exports(clients, settings):
    client, _ = clients
    request = {"selection": selection(settings), "confirmed_selected_private_data": True}
    initial = client.post("/v1/exports", json=request).json()
    first = client.post("/v1/exports", json=request, headers={"Idempotency-Key": "fixed-operation"})
    second = client.post(
        "/v1/exports", json=request, headers={"Idempotency-Key": "fixed-operation"}
    )
    assert first.status_code == second.status_code == 202
    assert first.json()["id"] == second.json()["id"]
    assert second.json()["reused"] is True
    request["selection"]["revision"] = 2
    assert (
        client.post(
            "/v1/exports", json=request, headers={"Idempotency-Key": "fixed-operation"}
        ).status_code
        == 409
    )
    client.post(f"/v1/workflows/{initial['id']}/cancel")
    client.post(f"/v1/workflows/{first.json()['id']}/cancel")


def test_completed_step_is_reused_and_uncertain_step_is_not_replayed(settings):
    snapshot_id = Corpus(settings).snapshot()["snapshot_id"]
    item = jobs.create_job(settings.database_url, snapshot_id)
    try:
        claimed = jobs.claim_job(settings.database_url)
        assert claimed["id"] == item["id"]
        assert (
            jobs.begin_step(settings.database_url, item["id"], claimed["attempt"], "retrieve")
            is None
        )
        assert jobs.finish_step(
            settings.database_url, item["id"], claimed["attempt"], "retrieve", {"value": 42}
        )
        assert jobs.begin_step(
            settings.database_url, item["id"], claimed["attempt"], "retrieve"
        ) == {"value": 42}
        jobs.begin_step(settings.database_url, item["id"], claimed["attempt"], "provider")
        jobs.finish_step(
            settings.database_url,
            item["id"],
            claimed["attempt"],
            "provider",
            None,
            uncertain=True,
            provider_request_id="request-safe-reference",
        )
        with pytest.raises(jobs.JobConflict, match="uncertain"):
            jobs.begin_step(settings.database_url, item["id"], claimed["attempt"], "provider")
    finally:
        jobs.delete_job(settings.database_url, item["id"], item["receipt"])


def test_partial_artifact_stays_labeled_and_canceled_attempt_cannot_publish(settings):
    snapshot_id = Corpus(settings).snapshot()["snapshot_id"]
    item = jobs.create_job(settings.database_url, snapshot_id)
    try:
        claimed = jobs.claim_job(settings.database_url)
        artifact = publish_artifact(
            settings.database_url,
            settings.object_directory,
            item["id"],
            claimed["attempt"],
            operation_key="result",
            data=b'{"value":42}',
            media_type="application/json",
            file_name="result.json",
            provenance={"snapshot_id": snapshot_id},
        )
        partial, data = read_artifact(
            settings.database_url,
            settings.object_directory,
            item["id"],
            artifact["id"],
            item["receipt"],
        )
        assert partial["publication_status"] == "incomplete"
        assert partial["job_status"] == "running" and data == b'{"value":42}'

        jobs.cancel_job(settings.database_url, item["id"], item["receipt"])
        assert (
            publish_artifact(
                settings.database_url,
                settings.object_directory,
                item["id"],
                claimed["attempt"],
                operation_key="late",
                data=b"late",
                media_type="text/plain",
                file_name="late.txt",
                provenance={},
            )
            is None
        )
        assert not jobs.finish_job(
            settings.database_url, item["id"], claimed["attempt"], {"artifact": artifact}
        )
    finally:
        jobs.delete_job(settings.database_url, item["id"], item["receipt"])


def test_internal_continuation_uses_stored_owner_hash_without_returning_a_credential(settings):
    from hashlib import sha256

    snapshot_id = Corpus(settings).snapshot()["snapshot_id"]
    receipt = "browser-private-continuation-credential"
    digest = sha256(receipt.encode()).hexdigest()
    first = jobs.create_job_for_receipt_hash(
        settings.database_url,
        snapshot_id,
        digest,
        kind="research",
        inputs={"selection": "frozen"},
        idempotency_key="continuation-1",
    )
    try:
        second = jobs.create_job_for_receipt_hash(
            settings.database_url,
            snapshot_id,
            digest,
            kind="research",
            inputs={"selection": "frozen"},
            idempotency_key="continuation-1",
        )
        assert first["id"] == second["id"] and second["reused"]
        assert "receipt" not in first
        assert jobs.read_job(settings.database_url, first["id"], receipt)["status"] == "queued"
        with pytest.raises(jobs.JobNotFound):
            jobs.read_job(settings.database_url, first["id"], digest)
    finally:
        jobs.delete_job(settings.database_url, first["id"], receipt)


def test_refresh_does_not_start_a_second_thread_and_stops_cooperatively(settings, monkeypatch):
    from threading import Event

    from nova_ember.workers.__main__ import SourceRefresh

    calls, entered = [], Event()

    def refresh(_settings, *, stop_event):
        calls.append("started")
        entered.set()
        stop_event.wait(5)

    monkeypatch.setattr("nova_ember.api.discovery.refresh_public_sources", refresh)
    runner = SourceRefresh(settings, Event())
    assert runner.start_if_due()
    assert entered.wait(2)
    assert not runner.start_if_due()
    runner.stop()
    assert runner.thread is not None and not runner.thread.is_alive()
    assert calls == ["started"]


def test_worker_kind_filters_keep_long_transfer_jobs_out_of_the_interactive_queue(settings):
    snapshot_id = Corpus(settings).snapshot()["snapshot_id"]
    source = jobs.create_job(
        settings.database_url, snapshot_id, kind="source_acquisition", inputs={"selected": "source"}
    )
    interactive = jobs.create_job(settings.database_url, snapshot_id)
    try:
        first = jobs.claim_job(
            settings.database_url, exclude_kinds=frozenset({"source_acquisition"})
        )
        assert first["id"] == interactive["id"]
        second = jobs.claim_job(settings.database_url, kinds=frozenset({"source_acquisition"}))
        assert second["id"] == source["id"]
    finally:
        jobs.delete_job(settings.database_url, source["id"], source["receipt"])
        jobs.delete_job(settings.database_url, interactive["id"], interactive["receipt"])


def test_method_charts_are_receipt_scoped_frozen_dashboard_export_dependencies(clients, settings):
    from nova_ember.analysis.fits import fit_trace
    from nova_ember.api.exporting import CaseExport, build_export
    from test_methods_fits import trace_request

    client, other = clients
    receipt = "method-chart-" + uuid4().hex
    client.cookies.set("nova_browser_receipt", receipt)
    snapshot = Corpus(settings).snapshot()["snapshot_id"]
    result = fit_trace(trace_request())
    created = jobs.create_job(
        settings.database_url,
        snapshot,
        kind="registered_analysis",
        inputs={"method": "trace-fit"},
        receipt=receipt,
    )
    claimed = jobs.claim_job(settings.database_url, kinds=frozenset({"registered_analysis"}))
    assert claimed["id"] == created["id"]
    jobs.finish_job(
        settings.database_url,
        claimed["id"],
        claimed["attempt"],
        result={
            "result": result.model_dump(mode="json"),
            "resources": {"implementation_sha256": "c" * 64},
        },
    )
    definition = {"title": "Stored physical fit", "job_ids": [created["id"]], "view": "fit"}
    plotted = client.post("/v1/charts/method", json=definition)
    assert plotted.status_code == 200
    assert plotted.json()["plot"]["rows"][2]["y"] == pytest.approx(0.009)
    assert plotted.headers["cache-control"] == "no-store"
    assert other.post("/v1/charts/method", json=definition).status_code == 404
    dashboard = {
        "dashboard_id": str(uuid4()),
        "revision": 1,
        "question": "Source-specific fit",
        "corpus_snapshot_id": snapshot,
        "components": [
            {
                "component_id": "fit",
                "type": "measurement_chart",
                "title": "Stored physical fit",
                "method_chart": definition,
                "empty_state": "Selected fit unavailable",
            }
        ],
    }
    rendered = client.post("/v1/dashboards/validate", json={"dashboard": dashboard})
    assert rendered.status_code == 200
    assert rendered.json()["components"]["fit"]["plot"]["rows"][2]["fitted"] == pytest.approx(0.009)
    selected = CaseExport(
        snapshot_id=snapshot,
        case_id="method-chart",
        revision=1,
        question="Source-specific fit",
        method_charts=[definition],
        limitations=["A descriptive fit does not predict another run"],
    )
    content, _, _, _ = build_export(
        Corpus(settings), selected, receipt_sha256=sha256(receipt.encode()).hexdigest()
    )
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert (
            manifest["method_chart_provenance"][0][0]["calculation"]["context"]["input_origin"]
            == "synthetic_reference"
        )
        assert "figures/chart-1.pdf" in archive.namelist()
        assert "figures/chart-1-values.csv" in archive.namelist()
    with connect(settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET expires_at = now() - interval '1 second' WHERE id = %s",
            (created["id"],),
        )
    assert client.post("/v1/charts/method", json=definition).status_code == 404

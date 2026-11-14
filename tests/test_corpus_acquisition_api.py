"""Receipt-scoped source acquisition, streamed reads and frozen analysis/export inputs."""

import io
import json
import os
from dataclasses import replace
from hashlib import sha256
from zipfile import ZipFile

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from nova_ember.adapters.psi import manifest_files
from nova_ember.api import jobs
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.repository import Corpus, MissingSource
from nova_ember.api.seed import seed
from nova_ember.api.source_acquisition import (
    LimitedSource,
    PreviewByteLimit,
    acquired_execution_references,
    acquired_source_for_receipt_hash,
    create_source_acquisition_router,
    read_acquired_execution_input,
)
from nova_ember.api.workflows import create_workflow_router
from nova_ember.workers.__main__ import run_once

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    database = os.environ.get("NOVA_SOURCE_TEST_DATABASE_URL") or os.environ.get(
        "NOVA_TEST_DATABASE_URL"
    )
    if not database:
        pytest.skip("A separate PostgreSQL test database is required.")
    defaults = Settings.from_environment()
    if database == defaults.database_url:
        raise RuntimeError("Source workflow tests need a separate database.")
    settings = replace(
        defaults,
        database_url=database,
        object_directory=tmp_path_factory.mktemp("source-api") / "objects",
    )
    snapshot = seed(settings)
    corpus = Corpus(settings)
    application = FastAPI()
    application.include_router(create_source_acquisition_router(settings))
    application.include_router(create_workflow_router(settings))

    @application.exception_handler(ValueError)
    async def invalid(_request, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @application.exception_handler(MissingSource)
    @application.exception_handler(jobs.JobNotFound)
    async def absent(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    client = TestClient(application)
    yield settings, corpus, snapshot, client


def selection(corpus, snapshot, name):
    document = corpus.snapshot(snapshot)["manifest"]
    reference = next(row for row in document["manifests"] if row["accession"] == "PSI-69")
    rows = manifest_files((corpus.settings.fixture_directory / reference["path"]).read_bytes())
    row = next(row for row in rows if row["key"].rsplit("/", 1)[-1] == name)
    return {
        "snapshot_id": snapshot,
        "accession": "PSI-69",
        "investigation_version": 5,
        "file_name": name,
        "file_version": row["version"],
        "manifest_key": row["key"],
        "manifest_sha256": reference["sha256"],
        "declared_bytes": int(row["bytes_size"]),
    }


def create_source(setup, name="PSI-69_Experimental table_FLEX.csv", **changes):
    settings, corpus, snapshot, client = setup
    inputs = {**selection(corpus, snapshot, name), **changes}
    response = client.post("/v1/source-acquisitions", json=inputs)
    assert response.status_code == 202, response.json()
    item = response.json()
    assert run_once(settings, kinds=frozenset({"source_acquisition"}), maintenance=False)
    result = client.get(f"/v1/workflows/{item['id']}").json()
    assert result["status"] == "succeeded", result
    return item, result


def test_manifest_identity_size_and_public_scope_are_checked_before_queueing(setup):
    _settings, corpus, snapshot, client = setup
    inputs = selection(corpus, snapshot, "PSI-69_Experimental table_FLEX.csv")
    assert (
        client.post(
            "/v1/source-acquisitions",
            json={**inputs, "declared_bytes": inputs["declared_bytes"] + 1},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/source-acquisitions", json={**inputs, "manifest_sha256": "a" * 64}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/v1/source-acquisitions", json={**inputs, "file_name": "unselected.csv"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/v1/source-acquisitions", json={**inputs, "url": "https://elsewhere.example"}
        ).status_code
        == 422
    )
    policy = client.get("/v1/source-acquisitions/profile").json()
    assert policy["max_transfer_bytes"] > 5 * 1024 * 1024


def test_retained_source_workflow_streams_exact_original_with_receipt_and_range(setup):
    settings, _corpus, snapshot, client = setup
    item, job = create_source(setup)
    result = job["result"]
    assert result["sha256"] == "37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"
    assert result["network_bytes"] == 0
    assert result["canonical_measurements_changed"] is False
    assert result["snapshot_id"] == snapshot
    response = client.get(
        f"/v1/source-acquisitions/{item['id']}/content", headers={"Range": "bytes=0-15"}
    )
    assert response.status_code == 206
    expected = (
        settings.fixture_directory / "assets" / "PSI-69_Experimental table_FLEX.csv"
    ).read_bytes()
    assert response.content == expected[:16]
    raw = client.get(f"/v1/source-acquisitions/{item['id']}/content")
    assert sha256(raw.content).hexdigest() == result["sha256"]
    other = TestClient(client.app)
    assert other.get(f"/v1/source-acquisitions/{item['id']}/content").status_code == 404
    preview = client.get(
        f"/v1/source-acquisitions/{item['id']}/table-preview",
        params={"encoding": "cp1252", "limit": 3},
    ).json()
    assert len(preview["rows"]) == 3
    assert preview["rows"][0]["source_row"] == 2
    assert preview["total_source_records"] is None and preview["independent_run_count"] is None
    owner = sha256(item["receipt"].encode()).hexdigest()
    refs = acquired_execution_references(settings, snapshot, [item["id"]], owner)
    name, data, metadata = read_acquired_execution_input(settings, refs[0], owner)
    assert name == "PSI-69_Experimental table_FLEX.csv" and data == expected
    assert metadata["sha256"] == result["sha256"]
    with pytest.raises(jobs.JobNotFound):
        acquired_source_for_receipt_hash(settings, item["id"], "f" * 64)
    with pytest.raises(ValueError):
        acquired_execution_references(settings, "e" * 64, [item["id"]], owner)


def test_selected_original_camera_frame_is_a_source_preview_without_calibration(setup):
    settings, _corpus, _snapshot, client = setup
    item, job = create_source(
        setup,
        "PSI-69_Raw Data_Droplet View Movie.mp4",
        preview={"kind": "frame", "time_seconds": 1.0},
    )
    result = job["result"]
    assert result["network_bytes"] == 0
    assert result["preview"]["status"] == "available", result["preview"]
    artifact = result["preview"]["artifact"]
    assert artifact["provenance"]["scientific_measurement_ready"] is False
    assert artifact["provenance"]["spatial_calibration"] is None
    image = client.get(f"/v1/workflows/{item['id']}/artifacts/{artifact['id']}")
    assert image.status_code == 200 and image.content.startswith(b"\x89PNG")
    assert artifact["provenance"]["source_sha256"] == result["sha256"]


def test_cancel_delete_and_expired_source_receipts_cannot_read_cached_data(setup):
    settings, corpus, snapshot, client = setup
    inputs = selection(corpus, snapshot, "PSI-69_Experimental table_FLEX.csv")
    pending = client.post("/v1/source-acquisitions", json=inputs).json()
    assert client.post(f"/v1/workflows/{pending['id']}/cancel").json()["status"] == "canceled"
    assert client.get(f"/v1/source-acquisitions/{pending['id']}/content").status_code == 404
    item, _job = create_source(setup)
    with connect(settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET expires_at=now()-interval '1 second' WHERE id=%s", (item["id"],)
        )
    assert client.get(f"/v1/source-acquisitions/{item['id']}/content").status_code == 404
    assert client.delete(f"/v1/workflows/{pending['id']}").status_code == 204


def test_acquired_source_case_bundle_keeps_exact_original_and_source_manifest(setup):
    settings, _corpus, snapshot, client = setup
    item, _job = create_source(setup)
    response = client.post(
        "/v1/exports",
        json={
            "selection": {
                "snapshot_id": snapshot,
                "case_id": "source-bundle-test",
                "revision": 1,
                "question": "Inspect the exact source test labels.",
                "limitations": ["Rows are source records, not independent trials."],
                "source_job_ids": [item["id"]],
                "include_original_bytes": True,
                "format": "bundle",
            },
            "confirmed_selected_private_data": True,
        },
    )
    assert response.status_code == 202, response.json()
    export = response.json()
    assert run_once(settings, kinds=frozenset({"export_case"}), maintenance=False)
    job = client.get(f"/v1/workflows/{export['id']}").json()
    assert job["status"] == "succeeded", job
    artifact = job["result"]["artifact"]
    bundle = client.get(f"/v1/workflows/{export['id']}/artifacts/{artifact['id']}")
    with ZipFile(io.BytesIO(bundle.content)) as archive:
        original = "inputs/37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"
        assert original in archive.namelist()
        assert (
            sha256(archive.read(original)).hexdigest()
            == "37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"
        )
        records = [name for name in archive.namelist() if name.endswith(".json")]
        assert any("source_job" in archive.read(name).decode("utf-8") for name in records)


def test_raw_csv_byte_limit_cannot_turn_a_truncated_record_into_a_complete_value():
    import csv

    original = b"a,b\n1,complete\n2,truncated-value\n"
    stream = LimitedSource(io.BytesIO(original), len(original), 20)
    rows = []
    with io.TextIOWrapper(io.BufferedReader(stream), encoding="utf-8", newline="") as text:
        reader = csv.reader(text)
        with pytest.raises(PreviewByteLimit):
            for row in reader:
                rows.append(row)
    assert rows == [["a", "b"], ["1", "complete"]]


def test_acquired_original_is_a_frozen_input_in_the_actual_isolated_python_session(setup):
    from nova_ember.workers.__main__ import clean_sessions

    settings, _corpus, snapshot, client = setup
    item, _job = create_source(setup)
    response = client.post(
        "/v1/execution/sessions", json={"snapshot_id": snapshot, "source_job_ids": [item["id"]]}
    )
    assert response.status_code == 201, response.json()
    session = response.json()["id"]
    try:
        code = """import collections, csv, json
from pathlib import Path
manifest = json.loads(Path('/inputs/input-manifest.json').read_text())
asset = next(item for item in manifest['assets'] if item.get('source_job_id'))
with (Path('/inputs') / asset['input_name']).open(encoding='cp1252', newline='') as stream:
    rows = list(csv.DictReader(stream))
print(json.dumps({
    'source_records': len(rows),
    'labels': dict(collections.Counter(row['Test end'] for row in rows)),
}))
"""
        started = client.post(
            f"/v1/execution/sessions/{session}/commands", json={"language": "python", "code": code}
        )
        assert started.status_code == 202, started.json()
        assert run_once(settings, kinds=frozenset({"execute_code"}), maintenance=False)
        result = client.get(f"/v1/workflows/{started.json()['id']}").json()
        assert result["status"] == "succeeded", result
        assert result["result"]["exit_code"] == 0, result["result"]
        output = json.loads(result["result"]["stdout"])
        assert output == {
            "source_records": 274,
            "labels": {"Extinction": 186, "Disruption": 61, "Completion": 27},
        }
        assert result["result"]["scientific_origin"] == "exploratory_execution"
    finally:
        client.delete(f"/v1/execution/sessions/{session}")
        clean_sessions(settings)


def test_selected_camera_clip_preserves_the_explicit_requested_interval(setup):
    settings, _corpus, _snapshot, client = setup
    item, job = create_source(
        setup,
        "PSI-69_Raw Data_Droplet View Movie.mp4",
        preview={"kind": "clip", "time_seconds": 1.0, "duration_seconds": 0.5},
    )
    assert job["result"]["preview"]["status"] == "available", job["result"]["preview"]
    artifact = job["result"]["preview"]["artifact"]
    assert artifact["media_type"] == "video/mp4"
    # One source video frame plus one encoded AAC packet bounds endpoint padding.
    tolerance = 1001 / 60000 + 1024 / 48000
    assert artifact["provenance"]["preview_duration_seconds"] == pytest.approx(0.5, abs=tolerance)
    result = client.get(f"/v1/workflows/{item['id']}/artifacts/{artifact['id']}")
    assert result.status_code == 200 and result.content[4:8] == b"ftyp"
    assert artifact["provenance"]["camera_to_experiment_clock_alignment"] is None

"""Private upload lifecycle, exact bytes, isolated use and selected export without services."""

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
from nova_ember.api import jobs
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.exporting import CaseExport, build_export
from nova_ember.api.repository import Corpus, MissingSource
from nova_ember.api.seed import seed
from nova_ember.api.uploads import (
    cleanup_expired_uploads,
    create_upload_router,
    private_upload_execution_references,
    private_upload_for_receipt_hash,
    read_private_upload_execution_input,
)
from nova_ember.api.workflows import create_workflow_router
from nova_ember.workers.__main__ import clean_sessions, run_once

pytestmark = pytest.mark.integration
ORIGINAL = b"test,pressure_kPa\r\nA,101.325\r\nB,98.750\r\n"


@pytest.fixture(scope="module")
def setup(tmp_path_factory):
    database = os.environ.get("NOVA_SOURCE_TEST_DATABASE_URL") or os.environ.get(
        "NOVA_TEST_DATABASE_URL"
    )
    if not database:
        pytest.skip("A separate PostgreSQL test database is required.")
    defaults = Settings.from_environment()
    if database == defaults.database_url:
        raise RuntimeError("Upload workflow tests require a separate database.")
    settings = replace(
        defaults,
        database_url=database,
        object_directory=tmp_path_factory.mktemp("private-upload-api") / "objects",
    )
    snapshot = seed(settings)
    application = FastAPI()
    application.include_router(create_upload_router(settings))
    application.include_router(create_workflow_router(settings))

    @application.exception_handler(ValueError)
    async def invalid(_request, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @application.exception_handler(MissingSource)
    @application.exception_handler(jobs.JobNotFound)
    async def absent(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    return settings, snapshot, application


def prepare(client, snapshot, content=ORIGINAL, **changes):
    return client.post(
        "/v1/uploads",
        json={
            "snapshot_id": snapshot,
            "file_name": "pressure.csv",
            "byte_size": len(content),
            "sha256": sha256(content).hexdigest(),
            "intended_use": "analysis",
            "license": "CC0-1.0",
            "rights_assertion": "I created this synthetic fixture and permit processing.",
            "confirmed_temporary_processing": True,
            **changes,
        },
    )


def finalize(client, prepared, content=ORIGINAL):
    identifier = prepared["upload_id"]
    response = client.put(f"/v1/uploads/{identifier}/chunks?offset=0", content=content)
    assert response.status_code == 200, response.json()
    return client.post(
        f"/v1/uploads/{identifier}/finalize",
        json={
            "sha256": prepared["sha256"],
            "confirmed_submit": True,
        },
    )


def test_upload_admission_discloses_processing_rights_and_supported_limits(setup):
    _settings, snapshot, application = setup
    with TestClient(application) as client:
        profile = client.get("/v1/uploads/profile").json()
        assert profile["max_file_bytes"] == 64 * 1024 * 1024
        assert profile["external_provider_submission"] is False
        assert profile["retention_hours"] == 24
        assert prepare(client, snapshot, confirmed_temporary_processing=False).status_code == 422
        assert prepare(client, snapshot, file_name="../pressure.csv").status_code == 422
        assert prepare(client, snapshot, file_name="run.exe").status_code == 422
        assert prepare(client, snapshot, rights_assertion="   ").status_code == 422
        assert prepare(client, snapshot, byte_size=profile["max_file_bytes"] + 1).status_code == 422
        prepared = prepare(client, snapshot).json()
        assert prepared["status"] == "receiving"
        assert prepared["rights_status"] == "user_asserted"
        assert prepared["received_bytes"] == 0
        assert "receipt_sha256" not in prepared
        assert prepared["canonical_promotion"] is False
        assert client.delete(f"/v1/uploads/{prepared['upload_id']}").status_code == 204


def test_resume_recovers_uncommitted_tail_and_keeps_exact_bytes_private(setup):
    settings, snapshot, application = setup
    with TestClient(application) as client, TestClient(application) as other:
        item = prepare(client, snapshot).json()
        identifier = item["upload_id"]
        route = f"/v1/uploads/{identifier}"
        assert other.get(route).status_code == 404
        assert other.get("/v1/uploads").json() == {"uploads": []}
        assert (
            client.post(
                route + "/finalize",
                json={
                    "sha256": item["sha256"],
                    "confirmed_submit": True,
                },
            ).status_code
            == 422
        )
        assert (
            client.put(route + "/chunks?offset=0", content=ORIGINAL[:10]).json()["received_bytes"]
            == 10
        )
        path = settings.object_directory / "private_uploads" / identifier / "original"
        with path.open("ab") as stream:
            stream.write(b"uncommitted-tail")
        assert client.put(route + "/chunks?offset=0", content=b"x").status_code == 409
        assert client.put(route + "/chunks?offset=10", content=ORIGINAL[10:]).status_code == 200
        assert path.read_bytes() == ORIGINAL
        assert path.stat().st_mode & 0o777 == 0o600
        assert other.put(route + "/chunks?offset=0", content=b"x").status_code == 404
        assert client.post(route + "/finalize", json={"sha256": item["sha256"]}).status_code == 422
        submitted = client.post(
            route + "/finalize",
            json={
                "sha256": item["sha256"],
                "confirmed_submit": True,
            },
        )
        assert submitted.json()["status"] == "ready"
        assert submitted.json()["validation"]["original_bytes_transformed"] is False
        assert client.get(route + "/content").content == ORIGINAL
        assert other.get(route + "/content").status_code == 404
        ranged = client.get(route + "/content", headers={"Range": "bytes=0-9"})
        assert ranged.status_code == 206 and ranged.content == ORIGINAL[:10]
        assert ranged.headers["cache-control"] == "no-store"
        assert client.put(route + "/chunks?offset=0", content=ORIGINAL).status_code == 409
        assert (
            client.delete(route, headers={"Origin": "https://another.example"}).status_code == 403
        )
        assert client.delete(route).status_code == 204
        assert not path.exists() and client.get(route).status_code == 404


def test_private_execution_references_recheck_owner_snapshot_and_immutable_bytes(setup):
    settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot).json()
        owner = sha256(client.cookies.get("nova_browser_receipt").encode()).hexdigest()
        with pytest.raises(jobs.JobNotFound):
            private_upload_for_receipt_hash(settings, item["upload_id"], owner)
        assert finalize(client, item).status_code == 200
        references = private_upload_execution_references(
            settings, snapshot, [item["upload_id"]], owner
        )
        file_name, content, metadata = read_private_upload_execution_input(
            settings, references[0], owner
        )
        assert file_name == "pressure.csv" and content == ORIGINAL
        assert metadata["scientific_origin"] == "user_supplied_original_bytes"
        assert metadata["rights_status"] == "user_asserted"
        with pytest.raises(jobs.JobNotFound):
            private_upload_for_receipt_hash(settings, item["upload_id"], "f" * 64)
        with pytest.raises(ValueError, match="snapshot"):
            private_upload_execution_references(settings, "e" * 64, [item["upload_id"]], owner)
        with pytest.raises(ValueError, match="immutable"):
            read_private_upload_execution_input(
                settings, {**references[0], "license": "changed"}, owner
            )
        _, path = private_upload_for_receipt_hash(settings, item["upload_id"], owner)
        path.write_bytes(b"x" * len(ORIGINAL))
        with pytest.raises(ValueError, match="checksum"):
            read_private_upload_execution_input(settings, references[0], owner)
        client.delete(f"/v1/uploads/{item['upload_id']}")


def test_bad_checksum_rejects_submission_without_exposing_unqualified_content(setup):
    _settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot, sha256="0" * 64).json()
        response = finalize(client, item)
        assert response.status_code == 422 and "checksum" in response.json()["detail"]
        route = f"/v1/uploads/{item['upload_id']}"
        assert client.get(route).json()["status"] == "rejected"
        assert client.get(route + "/content").status_code == 404
        assert client.delete(route).status_code == 204


@pytest.mark.parametrize(
    "file_name,content",
    [
        ("image.png", b"plain text with a misleading suffix"),
        ("data.csv", b"a,b\n1,\x00\n"),
        ("data.csv", b"MZexecutable signature"),
        ("data.json", b'{"nested":'),
    ],
)
def test_unsupported_content_is_rejected_after_exact_transfer(setup, file_name, content):
    _settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot, content, file_name=file_name).json()
        assert finalize(client, item, content).status_code == 422
        client.delete(f"/v1/uploads/{item['upload_id']}")


@pytest.mark.parametrize("member", ["../escape.txt", "payload.exe", "word/vbaProject.bin"])
def test_archive_traversal_and_active_members_never_reach_host_paths(setup, member):
    _settings, snapshot, application = setup
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(member, b"untrusted")
    content = buffer.getvalue()
    with TestClient(application) as client:
        item = prepare(client, snapshot, content, file_name="sources.zip").json()
        assert finalize(client, item, content).status_code == 422
        client.delete(f"/v1/uploads/{item['upload_id']}")


def test_actual_nasa_docx_is_a_private_copy_without_canonical_promotion(setup):
    settings, snapshot, application = setup
    corpus = Corpus(settings)
    assets = corpus.snapshot(snapshot)["manifest"]["assets"]
    match = next(row for row in assets if row["file_name"].endswith("FLEX DoD.docx"))
    original = (settings.object_directory / match["sha256"]).read_bytes()
    with TestClient(application) as client:
        item = prepare(client, snapshot, original, file_name="FLEXDoD.docx").json()
        submitted = finalize(client, item, original)
        assert submitted.status_code == 200, submitted.json()
        assert submitted.json()["validation"]["archive_members"] > 0
        assert client.get(f"/v1/uploads/{item['upload_id']}/content").content == original
        assert len(corpus.snapshot(snapshot)["manifest"]["assets"]) == len(assets)
        client.delete(f"/v1/uploads/{item['upload_id']}")


def test_chunk_limit_storage_reservation_and_expiry_cleanup_are_real(setup, monkeypatch):
    settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot).json()
        route = f"/v1/uploads/{item['upload_id']}"
        assert (
            client.put(route + "/chunks?offset=0", content=b"x" * (1024 * 1024 + 1)).status_code
            == 413
        )
        assert client.get(route).json()["received_bytes"] == 0
        assert finalize(client, item).status_code == 200
        session_response = client.post(
            "/v1/execution/sessions",
            json={
                "snapshot_id": snapshot,
                "upload_ids": [item["upload_id"]],
            },
        )
        assert session_response.status_code == 201, session_response.json()
        session = session_response.json()["id"]
        path = settings.object_directory / "private_uploads" / item["upload_id"] / "original"
        with connect(settings.database_url) as connection:
            connection.execute(
                "UPDATE private_uploads SET expires_at=now()-interval '1 second' WHERE id=%s",
                (item["upload_id"],),
            )
        assert client.get(route).status_code == 404
        assert client.get(route + "/content").status_code == 404
        assert cleanup_expired_uploads(settings) >= 1
        assert not path.exists()
        assert client.get(f"/v1/execution/sessions/{session}").json()["status"] == "closed"
        clean_sessions(settings)
        # Removal interrupted after committing its row deletion must not retain private bytes.
        path.parent.mkdir()
        path.write_bytes(ORIGINAL)
        assert cleanup_expired_uploads(settings) >= 1
        assert not path.exists()
        monkeypatch.setenv("NOVA_UPLOAD_FILE_BYTES", str(len(ORIGINAL)))
        monkeypatch.setenv("NOVA_UPLOAD_BROWSER_BYTES", str(len(ORIGINAL)))
        another = prepare(client, snapshot).json()
        denied = prepare(client, snapshot)
        assert denied.status_code == 422 and "reserved" in denied.json()["detail"]
        client.delete(f"/v1/uploads/{another['upload_id']}")


def test_private_license_label_does_not_override_explicit_original_omission(setup):
    settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot, redistribution_allowed=False).json()
        assert finalize(client, item).status_code == 200
        owner = sha256(client.cookies.get("nova_browser_receipt").encode()).hexdigest()
        selection = CaseExport.model_validate(
            {
                "snapshot_id": snapshot,
                "case_id": "rights-selection",
                "revision": 1,
                "question": "Retain an exact reference without private bytes.",
                "limitations": ["Synthetic fixture."],
                "upload_ids": [item["upload_id"]],
                "include_original_bytes": True,
                "format": "bundle",
            }
        )
        content, _, _, _ = build_export(Corpus(settings), selection, receipt_sha256=owner)
        with ZipFile(io.BytesIO(content)) as archive:
            assert "inputs/" + item["sha256"] not in archive.namelist()
            manifest = json.loads(archive.read("manifest.json"))
            assert manifest["selected_private_uploads"][0]["rights_status"] == "user_asserted"
            assert (
                manifest["originals_omitted"][0]["reason"]
                == "private_upload_export_permission_not_granted"
            )
        client.delete(f"/v1/uploads/{item['upload_id']}")


def test_selected_private_upload_runs_in_actual_guest_and_exports_exact_authorized_bytes(setup):
    settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot, redistribution_allowed=True).json()
        assert finalize(client, item).status_code == 200
        response = client.post(
            "/v1/execution/sessions",
            json={
                "snapshot_id": snapshot,
                "upload_ids": [item["upload_id"]],
            },
        )
        assert response.status_code == 201, response.json()
        session = response.json()["id"]
        try:
            code = """import csv, json
from decimal import Decimal
from pathlib import Path
manifest = json.loads(Path('/inputs/input-manifest.json').read_text())
asset = next(item for item in manifest['assets'] if item.get('upload_id'))
with (Path('/inputs') / asset['input_name']).open(newline='') as stream:
    values = [Decimal(row['pressure_kPa']) for row in csv.DictReader(stream)]
print(json.dumps({'delta_kPa': str(values[0] - values[1]), 'origin': asset['scientific_origin']}))
"""
            started = client.post(
                f"/v1/execution/sessions/{session}/commands",
                json={
                    "language": "python",
                    "code": code,
                },
            )
            assert started.status_code == 202, started.json()
            assert run_once(settings, kinds=frozenset({"execute_code"}), maintenance=False)
            result = client.get(f"/v1/workflows/{started.json()['id']}").json()
            assert result["status"] == "succeeded", result
            assert result["result"]["exit_code"] == 0, result["result"]
            assert json.loads(result["result"]["stdout"]) == {
                "delta_kPa": "2.575",
                "origin": "user_supplied_original_bytes",
            }
            assert client.delete(f"/v1/uploads/{item['upload_id']}").status_code == 204
            assert client.get(f"/v1/execution/sessions/{session}").json()["status"] == "closed"
            denied = client.post(
                f"/v1/execution/sessions/{session}/commands",
                json={
                    "language": "python",
                    "code": "print('revoked')",
                },
            )
            assert denied.status_code == 404
            clean_sessions(settings)
            with connect(settings.database_url) as connection:
                row = connection.execute(
                    "SELECT terminated_at FROM execution_sessions WHERE id=%s",
                    (session,),
                ).fetchone()
            assert row["terminated_at"] is not None
        finally:
            client.delete(f"/v1/execution/sessions/{session}")
            clean_sessions(settings)
        item = prepare(client, snapshot, redistribution_allowed=True).json()
        assert finalize(client, item).status_code == 200
        exported = client.post(
            "/v1/exports",
            json={
                "selection": {
                    "snapshot_id": snapshot,
                    "case_id": "private-source",
                    "revision": 1,
                    "question": "Inspect selected synthetic pressure records.",
                    "limitations": ["Synthetic fixture, not NASA measurements."],
                    "upload_ids": [item["upload_id"]],
                    "include_original_bytes": True,
                    "format": "bundle",
                },
                "confirmed_selected_private_data": True,
            },
        )
        assert exported.status_code == 202, exported.json()
        assert run_once(settings, kinds=frozenset({"export_case"}), maintenance=False)
        job = client.get(f"/v1/workflows/{exported.json()['id']}").json()
        assert job["status"] == "succeeded", job
        artifact = job["result"]["artifact"]
        content = client.get(f"/v1/workflows/{job['id']}/artifacts/{artifact['id']}").content
        with ZipFile(io.BytesIO(content)) as archive:
            assert archive.read("inputs/" + item["sha256"]) == ORIGINAL
        client.delete(f"/v1/uploads/{item['upload_id']}")

"""NASA research flows on PostgreSQL with actual retained sources and reviewed tables."""

import io
import json
import os
import zipfile
from dataclasses import replace
from hashlib import sha256

import httpx
import pytest
from fastapi.testclient import TestClient
from nova_ember.adapters.documents import NtrsClient, capture_ntrs_document
from nova_ember.api.config import Settings
from nova_ember.api.exporting import CaseExport, build_export
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus
from nova_ember.api.seed import seed
from test_evidence_documents import metadata, pdf_source

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def research_api(tmp_path_factory):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for separate PostgreSQL checks.")
    settings = Settings.from_environment()
    if url == settings.database_url:
        raise RuntimeError("NASA integration checks require the separate test database.")
    settings = replace(
        settings,
        database_url=url,
        object_directory=tmp_path_factory.mktemp("nasa-research") / "objects",
        openai_api_key=None,
    )
    snapshot_id = seed(settings)
    return TestClient(create_app(settings)), settings, snapshot_id


def find_asset(client, snapshot, accession, name):
    result = client.get(f"/v1/investigations/{accession}", params={"snapshot_id": snapshot})
    assert result.status_code == 200
    return next(asset for asset in result.json()["assets"] if name in asset["file_name"])


def test_question_discovers_nasa_source_with_inspectable_field_and_program_children(research_api):
    client, _, snapshot = research_api
    result = client.post(
        "/v1/discovery/investigations", json={"text": "Saffire", "snapshot_id": snapshot}
    )
    assert result.status_code == 200
    ids = {item["accession"] for item in result.json()["items"]}
    assert {"NASA-SAFFIRE-IV", "NASA-SAFFIRE-V", "NASA-SAFFIRE-VI"}.issubset(ids)
    dossier = client.get(
        "/v1/investigations/NASA-SAFFIRE-VI/dossier", params={"snapshot_id": snapshot}
    ).json()
    objective = dossier["source_fields"]["objective"]
    assert objective["anchor"]["source_kind"] == "nasa"
    inspected = client.post("/v1/evidence/read", json=objective["anchor"])
    assert inspected.status_code == 200
    assert inspected.json()["text"] == objective["value"]
    assert inspected.json()["source_origin"] == "curated_nasa_research_excerpt"
    assert inspected.json()["upstream_sources"][0]["source_sha256"]
    assert dossier["literature_sources"]
    program = client.get(
        "/v1/investigations/NASA-SOFIE/dossier", params={"snapshot_id": snapshot}
    ).json()
    assert {item["accession"] for item in program["child_investigations"]} == {
        "NASA-SOFIE-RTDFS",
        "NASA-SOFIE-NCA",
        "NASA-SOFIE-GEL",
        "NASA-SOFIE-MIST",
        "NASA-SOFIE-SMURF",
    }
    manifest = client.get(
        "/v1/investigations/NASA-FLARE/manifest", params={"snapshot_id": snapshot}
    ).json()
    assert manifest["manifest_kind"] == "curated_nasa_sources"
    assert all(item["key"] is None for item in manifest["items"])


def test_nasa_record_query_and_analysis_preserve_planned_conditions_and_source_proof(research_api):
    client, _, snapshot = research_api
    response = client.post(
        "/v1/discovery/records",
        json={"snapshot_id": snapshot, "accessions": ["NASA-FM2"]},
    )
    assert response.status_code == 200
    records = response.json()
    assert records["total"] == 4
    assert records["independent_run_count"] is None
    assert {item["record"]["row_kind"] for item in records["items"]} == {"condition_record"}
    anchor = {**records["items"][0]["anchor"], "column": 1}
    assert anchor["source_kind"] == "nasa" and anchor["asset_id"]
    cell = client.post("/v1/evidence/read", json=anchor)
    assert cell.status_code == 200
    assert cell.json()["text"] == "8.2"
    assert cell.json()["source_origin"] == "planned_conditions"
    assert cell.json()["upstream_sources"]
    wrong_kind = {**anchor, "source_kind": "psi"}
    assert client.post("/v1/evidence/read", json=wrong_kind).status_code == 422
    asset = records["items"][0]["asset"]
    queried = client.post(
        "/v1/queries",
        json={
            "snapshot_id": snapshot,
            "asset_sha256": asset["sha256"],
            "columns": [1, 3],
            "representation": "canonical",
        },
    )
    assert queried.status_code == 200
    data = queried.json()
    assert [row["column_3"] for row in data["values"]] == [0.37, 0.33, 0.29, 0.25]
    assert data["values"][0]["column_1"] == pytest.approx(56537.0098039776)
    assert data["columns"][0]["units"] == ["Pa"]
    assert data["columns"][1]["source_value_kinds"] == ["condition"]
    assert data["asset"]["origin"] == "planned_conditions"


def test_reported_table_can_be_charted_compared_and_exported_with_provenance(research_api):
    client, settings, snapshot = research_api
    comparison = client.post(
        "/v1/comparisons", json={"investigation_ids": ["PSI-99", "NASA-SAFFIRE-VI"]}
    )
    assert comparison.status_code == 200
    assert comparison.json()["suitability"]["quantitative_pooling"] == "unsupported"
    asset = find_asset(client, snapshot, "NASA-SAFFIRE-VI", "vi-results")
    query = {
        "snapshot_id": snapshot,
        "asset_sha256": asset["sha256"],
        "columns": [2, 3],
        "representation": "canonical",
    }
    chart = client.post(
        "/v1/charts/validate",
        json={
            "title": "Reported Saffire VI calorimetry",
            "query": query,
            "x_column": 2,
            "y_column": 3,
            "x_unit": "s",
            "y_unit": "W",
        },
    )
    assert chart.status_code == 200
    assert chart.json()["data"]["values"][0]["column_3"] == 3217
    spec = CaseExport.model_validate(
        {
            "snapshot_id": snapshot,
            "case_id": "saffire-vi-evidence",
            "revision": 1,
            "question": "What heat release was reported in Saffire VI?",
            "queries": [query],
            "limitations": ["Published summary values; unmatched conditions prevent pooling."],
            "include_original_bytes": True,
        }
    )
    content, media_type, _, _ = build_export(Corpus(settings), spec)
    assert media_type == "application/zip"
    with zipfile.ZipFile(io.BytesIO(content)) as bundle:
        manifest = json.loads(bundle.read("manifest.json"))
        assert (
            manifest["sources"][asset["sha256"]]["source_provenance"] == asset["source_provenance"]
        )
        assert "data/query-1.parquet" in bundle.namelist()
        assert manifest["independent_run_count"] is None
        assert not any(name.startswith("originals/") for name in bundle.namelist())
        assert "redistribution_rights_unresolved" in str(manifest)


def test_new_catalog_does_not_rewrite_old_snapshot_or_accept_another_report_revision(research_api):
    client, settings, snapshot = research_api
    base = sha256((settings.fixture_directory / "snapshot.json").read_bytes()).hexdigest()
    original = client.get(f"/v1/snapshots/{base}").json()
    assert original["investigation_count"] == 24 and original["program_count"] == 0
    assert (
        client.get("/v1/investigations/NASA-LUCI", params={"snapshot_id": base}).status_code == 404
    )
    identifier = "20240002981"
    fixture_metadata = metadata()
    fixture_metadata["id"] = int(identifier)
    fixture_metadata["downloads"][0]["links"]["pdf"] = (
        f"/api/citations/{identifier}/downloads/test.pdf"
    )

    def handler(request):
        if request.url.path.endswith(".pdf"):
            return httpx.Response(200, content=pdf_source("Different report revision"))
        return httpx.Response(200, json=fixture_metadata)

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        record = capture_ntrs_document(
            NtrsClient(transport),
            identifier,
            base,
            ("NASA-SAFFIRE-VI",),
            settings.object_directory.parent / "evidence-documents",
        )
    response = client.post(
        "/v1/evidence/read",
        json={
            "snapshot_id": snapshot,
            "source_kind": "ntrs",
            "document_id": identifier,
            "capture_id": record["capture_id"],
            "source_sha256": record["pdf"]["sha256"],
            "kind": "document_page",
            "page": 1,
            "start": 0,
            "end": 8,
        },
    )
    assert response.status_code == 404
    assert "outside the reviewed" in response.json()["detail"]

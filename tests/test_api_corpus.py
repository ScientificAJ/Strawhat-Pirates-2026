"""Real PostgreSQL and retained NASA inputs; opt in with a separate test database."""

import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.seed import seed

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def corpus_settings(tmp_path_factory):
    database_url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for real PostgreSQL tests.")
    settings = Settings.from_environment()
    if database_url == settings.database_url:
        raise RuntimeError("Integration tests require a separate database.")
    settings = replace(
        settings,
        database_url=database_url,
        object_directory=tmp_path_factory.mktemp("corpus-objects"),
        openai_api_key=None,
    )
    seed(settings)
    return settings


@pytest.fixture(scope="module")
def corpus_client(corpus_settings):
    return TestClient(create_app(corpus_settings))


def test_database_version_extensions_and_checksum_revisions(corpus_client, corpus_settings):
    health = corpus_client.get("/v1/health").json()
    assert int(health["postgresql_version"]) // 10000 == 17
    assert health["pgvector"]
    assert health["openai"] == "not_configured"
    with connect(corpus_settings.database_url) as connection:
        revisions = connection.execute(
            "SELECT revision FROM schema_migrations ORDER BY revision"
        ).fetchall()
    assert [item["revision"] for item in revisions] == [
        "001_corpus",
        "002_jobs",
        "003_source_search",
        "005_workflows",
        "006_models",
        "007_execution_inputs",
        "008_model_registry",
        "009_execution_termination",
        "010_source_acquisition",
        "011_private_uploads",
        "012_semantic_passages",
    ]


def test_seed_is_idempotent_and_catalog_survives_new_api_process(corpus_client, corpus_settings):
    first = corpus_client.get("/v1/snapshots/current").json()
    assert first["investigation_count"] == 24
    assert seed(corpus_settings) == first["snapshot_id"]
    new_client = TestClient(create_app(corpus_settings))
    catalog = new_client.get("/v1/investigations?limit=100").json()
    assert catalog["total"] == 24
    assert len({item["accession"] for item in catalog["items"]}) == 24
    assert catalog["snapshot_id"] == first["snapshot_id"]


def test_full_text_search_and_untrusted_query(corpus_client):
    matching = corpus_client.get("/v1/investigations", params={"q": "FLEX"}).json()
    assert "PSI-69" in {item["accession"] for item in matching["items"]}
    assert matching["total"] < 24
    response = corpus_client.get("/v1/investigations", params={"q": "'; DROP TABLE snapshots; --"})
    assert response.status_code == 200
    assert corpus_client.get("/v1/snapshots/current").status_code == 200


def test_flex_labels_reproduce_audit_and_preserve_unknown_independence(corpus_client):
    result = corpus_client.get("/v1/analyses/flex-endpoints").json()
    assert {item["label"]: item["count"] for item in result["counts"]} == {
        "Completion": 27,
        "Disruption": 61,
        "Extinction": 186,
    }
    assert result["total_rows"] == 274
    assert result["independent_run_count"] is None
    assert result["asset"]["accession"] == "PSI-69"
    assert len(result["asset"]["sha256"]) == 64
    assert len(result["source_rows"]) == 274
    assert result["limitations"]
    assert result["origin"] == "derived_from_source_table"


def test_source_rows_download_and_export_share_exact_asset(corpus_client):
    analysis = corpus_client.get("/v1/analyses/flex-endpoints").json()
    digest = analysis["asset"]["sha256"]
    table = corpus_client.get(f"/v1/assets/{digest}/table?limit=2&offset=1").json()
    assert table["encoding"] == "cp1252"
    assert table["total_rows"] == 274
    assert table["rows"][0]["row_number"] == analysis["source_rows"][1]["row_number"]
    assert len(table["rows"]) == 2
    raw = corpus_client.get(f"/v1/assets/{digest}/raw")
    assert raw.status_code == 200
    from hashlib import sha256

    assert sha256(raw.content).hexdigest() == digest
    export = corpus_client.get("/v1/exports/flex-endpoints")
    assert export.json() == analysis
    assert "attachment" in export.headers["content-disposition"]


def test_catalog_level_comparison_cannot_claim_run_level_pooling(corpus_client):
    response = corpus_client.post(
        "/v1/comparisons", json={"investigation_ids": ["PSI-69", "PSI-25"]}
    )
    assert response.status_code == 200
    assert response.json()["suitability"]["quantitative_pooling"] == "unsupported"
    assert all(row["status"] == "unknown" for row in response.json()["conditions"])
    assert "predicted_value" not in response.json()


def test_missing_asset_is_not_substituted(corpus_client):
    response = corpus_client.get("/v1/assets/" + "0" * 64 + "/table")
    assert response.status_code == 404


def test_source_and_analysis_can_reopen_the_recorded_snapshot(corpus_client):
    analysis = corpus_client.get("/v1/analyses/flex-endpoints").json()
    snapshot = analysis["snapshot_id"]
    assert corpus_client.get(f"/v1/snapshots/{snapshot}").status_code == 200
    frozen = corpus_client.get("/v1/analyses/flex-endpoints", params={"snapshot_id": snapshot})
    assert frozen.json() == analysis
    digest = analysis["asset"]["sha256"]
    table = corpus_client.get(
        f"/v1/assets/{digest}/table", params={"snapshot_id": snapshot, "limit": 1}
    )
    assert table.status_code == 200
    missing = corpus_client.get("/v1/analyses/flex-endpoints", params={"snapshot_id": "0" * 64})
    assert missing.status_code == 404


def test_corrupt_retained_source_cannot_produce_a_scientific_result(corpus_client, corpus_settings):
    analysis = corpus_client.get("/v1/analyses/flex-endpoints").json()
    object_path = corpus_settings.object_directory / analysis["asset"]["sha256"]
    original = object_path.read_bytes()
    try:
        object_path.write_bytes(b"changed scientific source bytes")
        response = corpus_client.get("/v1/analyses/flex-endpoints")
        assert response.status_code == 409
        assert "counts" not in response.json()
    finally:
        object_path.write_bytes(original)
    assert corpus_client.get("/v1/analyses/flex-endpoints").json() == analysis

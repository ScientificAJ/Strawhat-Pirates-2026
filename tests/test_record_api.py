"""Source-role interpretation and exact row selections on real retained NASA bytes."""

import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.main import create_app
from nova_ember.api.seed import seed

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def source_client(tmp_path_factory):
    database_url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for real PostgreSQL tests.")
    settings = Settings.from_environment()
    if database_url == settings.database_url:
        raise RuntimeError("Record tests need a separate database.")
    settings = replace(
        settings,
        database_url=database_url,
        object_directory=tmp_path_factory.mktemp("record-objects"),
    )
    seed(settings)
    return TestClient(create_app(settings))


def source_asset(client, accession, name_fragment):
    investigation = client.get(f"/v1/investigations/{accession}").json()
    return next(asset for asset in investigation["assets"] if name_fragment in asset["file_name"])


def test_saffire_sample_selection_excludes_flow_rows_and_notes(source_client):
    asset = source_asset(source_client, "PSI-99", "SAFFIRE-2")
    response = source_client.get(
        f"/v1/assets/{asset['sha256']}/records", params={"row_kind": "sample_record"}
    )
    assert response.status_code == 200
    page = response.json()
    assert page["source_record_count"] == 15
    assert page["total_records"] == 9
    assert page["independent_run_count"] is None
    assert [record["source_row"] for record in page["records"]] == list(range(2, 11))
    assert page["records"][0]["raw_cells"][2] == "0.27 mm"
    assert page["records"][0]["raw_cells"][6] == "~ 21.5"
    assert page["row_kind_counts"]["flow_visualization"] == 2
    assert page["row_kind_counts"]["note"] == 4


def test_inverse_blank_physical_rows_are_not_experimental_records(source_client):
    asset = source_asset(source_client, "PSI-159", "Inverse Flames")
    result = source_client.get(
        f"/v1/assets/{asset['sha256']}/records", params={"limit": 250}
    ).json()
    assert result["source_record_count"] == 154
    assert result["empty_record_count"] == 861
    assert len(result["records"]) == 154
    assert result["independent_run_count"] is None
    assert result["records"][0]["raw_cells"][14] == "0"
    assert result["records"][0]["raw_cells"][15] == "-"


def test_unknown_grain_is_not_replaced_with_an_independent_run_count(source_client):
    expectations = [
        ("PSI-20", "ACME BRE", "daily_summary", 18),
        ("PSI-68", "Flex2", "range_summary", 8),
        ("PSI-47", "DAFT", "session_record", 2),
    ]
    for accession, name, kind, count in expectations:
        asset = source_asset(source_client, accession, name)
        result = source_client.get(f"/v1/assets/{asset['sha256']}/records").json()
        assert result["row_kind_counts"] == {kind: count}
        assert result["independent_run_count"] is None
        assert result["limitations"]


def test_frozen_selection_is_ordered_reproducible_and_not_a_pooling_certificate(source_client):
    asset = source_asset(source_client, "PSI-69", "FLEX.csv")
    snapshot = source_client.get("/v1/snapshots/current").json()["snapshot_id"]
    request = {
        "snapshot_id": snapshot,
        "selections": [{"asset_sha256": asset["sha256"], "source_rows": [3, 2]}],
    }
    response = source_client.post("/v1/cohorts/resolve", json=request)
    assert response.status_code == 200
    result = response.json()
    assert result["grain"] == "source_records"
    assert result["selected_record_count"] == 2
    assert result["independent_run_count"] is None
    assert result["selections"][0]["source_rows"] == [2, 3]
    records = result["resolved_sources"][0]["records"]
    assert [row["raw_cells"][1] for row in records] == ["20CAL08", "20CAL10"]
    request["selections"][0]["source_rows"] = [2, 3]
    assert source_client.post("/v1/cohorts/resolve", json=request).json() == result
    assert "predictions" not in result


def test_selection_rejects_duplicate_rows_and_fabricated_or_mismatched_source(source_client):
    asset = source_asset(source_client, "PSI-69", "FLEX.csv")
    snapshot = source_client.get("/v1/snapshots/current").json()["snapshot_id"]
    body = {
        "snapshot_id": snapshot,
        "selections": [{"asset_sha256": asset["sha256"], "source_rows": [2, 2]}],
    }
    assert source_client.post("/v1/cohorts/resolve", json=body).status_code == 422
    body["selections"][0]["source_rows"] = [999999]
    assert source_client.post("/v1/cohorts/resolve", json=body).status_code == 404
    body["selections"][0]["source_rows"] = [2]
    body["snapshot_id"] = "0" * 64
    assert source_client.post("/v1/cohorts/resolve", json=body).status_code == 404


def test_record_pages_honor_original_snapshot_and_hash_checks(source_client):
    asset = source_asset(source_client, "PSI-69", "FLEX.csv")
    snapshot = source_client.get("/v1/snapshots/current").json()["snapshot_id"]
    page = source_client.get(
        f"/v1/assets/{asset['sha256']}/records",
        params={"snapshot_id": snapshot, "limit": 1, "offset": 1},
    ).json()
    assert page["snapshot_id"] == snapshot
    assert page["asset"]["sha256"] == asset["sha256"]
    assert page["records"][0]["source_row"] == 3
    assert page["records"][0]["raw_cells"][1] == "20CAL10"
    assert page["source_sha256"] == asset["sha256"]
    assert page["total_records"] == 274

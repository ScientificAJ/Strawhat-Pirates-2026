"""Verify supporting evidence through the same frozen public corpus boundary."""

import json
import os
from dataclasses import replace
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.main import create_app
from nova_ember.api.seed import seed

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def evidence_client(tmp_path_factory):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for real PostgreSQL tests.")
    settings = Settings.from_environment()
    if url == settings.database_url:
        raise RuntimeError("Supporting-source tests require a separate database.")
    settings = replace(
        settings,
        database_url=url,
        object_directory=tmp_path_factory.mktemp("supporting-objects"),
        media_directory=None,
        methods_directory=None,
    )
    assert settings.supporting_directory is not None
    seed(settings)
    return TestClient(create_app(settings)), settings


def test_successor_adds_evidence_without_altering_or_hiding_the_original_release(evidence_client):
    client, settings = evidence_client
    base_id = sha256((settings.fixture_directory / "snapshot.json").read_bytes()).hexdigest()
    original = client.get(f"/v1/snapshots/{base_id}").json()
    current = client.get("/v1/snapshots/current").json()
    assert original["asset_count"] == 10
    assert current["asset_count"] == 15
    assert current["snapshot_id"] != base_id
    assert seed(settings) == current["snapshot_id"]
    previous = client.get("/v1/analyses/flex-endpoints", params={"snapshot_id": base_id}).json()
    latest = client.get("/v1/analyses/flex-endpoints").json()
    assert previous["counts"] == latest["counts"]
    assert previous["asset"]["sha256"] == latest["asset"]["sha256"]
    assert previous["snapshot_id"] == base_id


def test_fan_workbook_cells_retain_formula_and_cached_result_separately(evidence_client):
    client, _ = evidence_client
    digest = "bc0dca3efdef44a7774d8dd37aebc0cedae8d67d7bae8c9cbde9590014a3c983"
    result = client.get(f"/v1/assets/{digest}/workbook", params={"limit": 250}).json()
    assert result["selected_sheet"] == "Fan Calibration data"
    assert result["total_cells"] == 1755
    cell = next(cell for cell in result["cells"] if cell["coordinate"] == "E7")
    assert cell["formula"] == "1.0066*C7"
    assert cell["cached_value"] == "29.191399999999998"
    assert cell["has_formula"]
    assert result["asset"]["sha256"] == digest
    assert result["limitations"]
    assert client.get(f"/v1/assets/{digest}/workbook?sheet=Unknown").status_code == 404


def test_large_results_workbook_reads_only_the_selected_sheet(evidence_client):
    client, _ = evidence_client
    digest = "6d3a539ccf425b1fa8edc19cc75d828f57d650c7ce734d4e7aa686fea9593218"
    result = client.get(f"/v1/assets/{digest}/workbook?limit=2").json()
    assert len(result["sheets"]) == 43
    assert result["selected_sheet"] == "DBP"
    assert result["total_cells"] == 1047
    assert len(result["cells"]) == 2
    assert result["sheets"][0]["cell_count"] == 1047
    assert all(sheet["cell_count"] is None for sheet in result["sheets"][1:])


def test_text_lines_open_exact_test_sheet_and_trace_evidence_withholds_a_fit(evidence_client):
    client, _ = evidence_client
    digest = "cb748242c189bca59b861d0bb0f406fb7a80aee1710cee363f7620c43d66e2a0"
    text = client.get(f"/v1/assets/{digest}/text?offset=18&limit=1").json()
    assert text["lines"][0]["line_number"] == 19
    assert text["lines"][0]["text"] == "\tkavg  (mm2/s) = \t0.68 "
    evidence = client.get("/v1/analyses/flex-007-source").json()
    assert len(evidence["records"]) == 141
    assert evidence["fit_value"] is None
    assert evidence["fit_status"] == "requires_source_validation"
    assert any("obscuration" in text for text in evidence["limitations"])


def test_bass_identity_join_does_not_invent_velocity_or_calibration_validity(evidence_client):
    client, _ = evidence_client
    response = client.get(
        "/v1/analyses/bass-calibration",
        params={"investigator": "Bhattacharjee", "test_number": "B1"},
    )
    assert response.status_code == 200
    evidence = response.json()
    assert evidence["status"] == "calibration_unresolved"
    assert evidence["velocity"] is None
    assert evidence["matrix_matches"]
    assert evidence["reasons"]
    assert client.get("/v1/analyses/bass-calibration?test_number=B1").status_code == 422


def test_a_supporting_pack_cannot_be_attached_to_an_unrelated_base(evidence_client):
    from nova_ember.api.seed import enrich_snapshot

    _, settings = evidence_client
    assert settings.supporting_directory is not None
    original = json.loads((settings.fixture_directory / "snapshot.json").read_bytes())
    with pytest.raises(ValueError, match="different source snapshot"):
        enrich_snapshot(settings, original, "0" * 64)

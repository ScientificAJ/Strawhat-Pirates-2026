"""Known-answer calculations through the actual backend boundaries, without model calls."""

import os
from dataclasses import replace
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient
from nova_ember.api import jobs
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus
from nova_ember.api.research_tools import ResearchTools
from nova_ember.api.scientific_toolbox import ScientificToolbox, ScientificToolCall
from nova_ember.api.seed import seed
from nova_ember.api.trusted_analysis import execute_analysis_job
from nova_ember.contracts.research import WorkspaceContext

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def backend(tmp_path_factory):
    database = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for the separate PostgreSQL test database.")
    settings = Settings.from_environment()
    if database == settings.database_url:
        raise RuntimeError("Backend checks require the separate test database.")
    settings = replace(
        settings,
        database_url=database,
        object_directory=tmp_path_factory.mktemp("backend-methods"),
        openai_api_key=None,
    )
    snapshot = seed(settings)
    return TestClient(create_app(settings)), settings, snapshot


def trace_parameters(slope):
    return {
        "kind": "flame_front",
        "points": [
            {
                "source_locator": f"reference-point:{time}",
                "time": float(time),
                "value": 5.0 + slope * time,
            }
            for time in range(4)
        ],
        "time_unit": "s",
        "length_unit": "mm",
        "interval_start": 0.0,
        "interval_end": 3.0,
        "interval_justification": "Independent analytical reference after the excluded transient",
        "spatial_calibration_reference": "analytical millimetre scale",
        "time_calibration_reference": "analytical seconds",
        "time_origin": "reference zero",
        "observable": "specified analytical front",
        "direction": "increasing coordinate",
        "viewing_geometry": "reference orthographic plane",
        "ignition_transient_treatment": "No ignition transient in this synthetic reference",
        "context": {
            "input_origin": "synthetic_reference",
            "sources": [
                {"source_id": "independent-line-reference", "locator": "x(t)=5+slope*t millimetres"}
            ],
        },
    }


def test_two_distinct_fits_in_one_research_job_keep_their_inputs_and_resources(backend):
    _client, settings, snapshot = backend
    operation = jobs.create_job(settings.database_url, snapshot, kind="research", inputs={})
    with connect(settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET status='running',attempt=1,"
            "lease_until=now()+interval '60 seconds' WHERE id=%s",
            (operation["id"],),
        )
    base = {"id": operation["id"], "attempt": 1}
    try:
        results = [
            execute_analysis_job(
                settings,
                {**base, "inputs": {"method": "trace-fit", "parameters": trace_parameters(slope)}},
            )
            for slope in (2.0, 3.0)
        ]
        assert results[0]["result"]["value"] == pytest.approx(0.002, rel=1e-12)
        assert results[1]["result"]["value"] == pytest.approx(0.003, rel=1e-12)
        for item in results:
            assert item["result"]["unit"] == "m/s"
            assert item["result"]["independent_run_count"] is None
            assert item["result"]["request"]["context"]["input_origin"] == "synthetic_reference"
            assert item["resources"]["peak_rss_kib"] <= 512 * 1024
            assert item["resources"]["wall_seconds"] < 30
            assert len(item["resources"]["implementation_sha256"]) == 64
        with connect(settings.database_url) as connection:
            steps = connection.execute(
                "SELECT result FROM job_steps WHERE job_id=%s ORDER BY step_key", (operation["id"],)
            ).fetchall()
        assert len(steps) == 2
    finally:
        jobs.delete_job(settings.database_url, operation["id"], operation["receipt"])


def test_public_fitting_is_receipt_scoped_and_does_not_execute_in_the_api_thread(backend):
    client, settings, _snapshot = backend
    response = client.post(
        "/v1/methods/calculate", json={"method": "trace-fit", "parameters": trace_parameters(2.0)}
    )
    assert response.status_code == 202
    operation = response.json()
    assert operation["status"] == "queued"
    assert "httponly" in response.headers["set-cookie"].casefold()
    assert client.get(f"/v1/jobs/{operation['id']}").status_code == 404
    authorized = client.get(
        f"/v1/jobs/{operation['id']}", headers={"X-Job-Receipt": operation["receipt"]}
    )
    assert authorized.status_code == 200
    assert authorized.json()["result"] is None
    jobs.delete_job(settings.database_url, operation["id"], operation["receipt"])


def test_released_models_are_real_versions_not_an_activated_placeholder(backend):
    client, _settings, _snapshot = backend
    response = client.get("/v1/models")
    assert response.status_code == 200
    assert {method["id"] for method in response.json()["descriptive_methods"]} == {
        "flame-front-speed",
        "droplet-burning-rate",
    }
    assert not response.json()["regressions"]
    assert client.post("/v1/models/register", json={}).status_code in {404, 405}


def test_identical_original_bytes_preserve_distinct_nasa_source_identities(backend):
    client, settings, snapshot = backend
    assets = Corpus(settings).snapshot(snapshot)["manifest"]["assets"]
    copies = [
        asset for asset in assets if "SAFFIRE-I and SAFFIRE-III Readme.docx" in asset["file_name"]
    ]
    assert len(copies) == 2
    assert copies[0]["sha256"] == copies[1]["sha256"]
    digest = copies[0]["sha256"]
    assert (
        client.get(f"/v1/assets/{digest}/raw", params={"snapshot_id": snapshot}).status_code == 409
    )
    for asset in copies:
        response = client.get(
            f"/v1/assets/{digest}/raw",
            params={"snapshot_id": snapshot, "accession": asset["accession"]},
        )
        assert response.status_code == 200
        assert sha256(response.content).hexdigest() == digest
    selected = WorkspaceContext(
        context_version="same-bytes-distinct-sources",
        snapshot_id=snapshot,
        selected_sources=[
            {
                "asset_sha256": asset["sha256"],
                "accession": asset["accession"],
                "asset_id": asset["id"],
            }
            for asset in copies
        ],
    )
    resolved = ResearchTools(Corpus(settings), selected).resolve_context()
    assert len(resolved["selected_sources"]) == 2
    assert {item["accession"] for item in resolved["selected_sources"]} == {
        asset["accession"] for asset in copies
    }


def test_advanced_tools_bind_the_frozen_context_and_keep_distinct_cohort_grain(backend):
    _client, settings, snapshot = backend
    toolbox = ScientificToolbox(
        Corpus(settings), WorkspaceContext(context_version="tool-check", snapshot_id=snapshot)
    )
    source = next(
        asset
        for asset in Corpus(settings).snapshot(snapshot)["manifest"]["assets"]
        if asset["file_name"] == "PSI-69_Experimental table_FLEX.csv"
    )
    record = toolbox.dispatch(
        ScientificToolCall(
            name="get_run", parameters={"asset_sha256": source["sha256"], "source_row": 275}
        )
    )
    assert record["records"][0]["source_row"] == 275
    assert record["independent_run_count"] is None
    selection = {
        "snapshot_id": snapshot,
        "selections": [{"asset_sha256": source["sha256"], "source_rows": [2, 3]}],
    }
    comparison = toolbox.dispatch(
        ScientificToolCall(
            name="compare_cohort",
            parameters={
                "left": selection,
                "right": selection,
                "question": "Inspect the same pinned selection",
            },
        )
    )
    assert comparison["grain"] == "frozen_source_records"
    assert comparison["suitability"]["quantitative_pooling"] == "unresolved"
    with pytest.raises(ValueError, match="different frozen"):
        toolbox.dispatch(
            ScientificToolCall(name="search_runs", parameters={"snapshot_id": "f" * 64})
        )
    with pytest.raises(ValueError, match="column"):
        ResearchTools(
            Corpus(settings),
            WorkspaceContext(
                context_version="invalid-column-without-rows",
                snapshot_id=snapshot,
                selected_sources=[{"asset_sha256": source["sha256"], "columns": [999]}],
            ),
        ).resolve_context()

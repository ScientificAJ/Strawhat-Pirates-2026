"""Educational-model API and research-tool boundaries, without paid model calls."""

import json
import os
from dataclasses import replace
from hashlib import sha256
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from nova_ember.adapters.supporting import load_supporting_snapshot
from nova_ember.analysis.visualization import DropletVisualizationRequest
from nova_ember.api.claim_support import source_backed
from nova_ember.api.config import Settings
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus, MissingSource
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import (
    EvidenceInput,
    ResearchTools,
    SourceAnalysisInput,
    model_fact_payload,
)
from nova_ember.api.scientific_toolbox import ScientificToolbox, ScientificToolCall
from nova_ember.api.seed import seed
from nova_ember.api.source_files import source_text
from nova_ember.api.visualization import SourceDropletVisualizationRequest
from nova_ember.contracts.research import EvidenceFact, ResearchAnswer, WorkspaceContext

SNAPSHOT = "a" * 64


class ReferenceCorpus:
    """An explicitly synthetic frozen repository for HTTP boundary regressions."""

    def __init__(self, settings):
        self.settings = settings
        self.resolved = []

    def snapshot(self, snapshot_id=None):
        if snapshot_id != SNAPSHOT:
            raise MissingSource("The synthetic reference snapshot is absent.")
        self.resolved.append(("snapshot", snapshot_id))
        return {"snapshot_id": SNAPSHOT}

    def investigation(self, accession, snapshot_id):
        if snapshot_id != SNAPSHOT or accession not in {"PSI-69", "PSI-68", "PSI-25"}:
            raise MissingSource("The synthetic reference investigation is absent.")
        self.resolved.append((accession, snapshot_id))
        return {"accession": accession, "title": "Synthetic investigation reference"}


def inputs(**updates):
    result = {
        "investigation_accession": "PSI-69",
        "initial_diameter_mm": 2.0,
        "burning_constant_mm2_s": 0.5,
        "sample_count": 5,
        "context": {
            "input_origin": "analyst_input",
            "source_snapshot": SNAPSHOT,
            "sources": [{"source_id": "teaching-assumptions", "locator": "D0 and K are assigned"}],
        },
    }
    result.update(updates)
    return result


@pytest.fixture
def reference_backend(tmp_path, monkeypatch):
    settings = Settings("unused-reference-database", tmp_path, tmp_path, openai_api_key=None)
    corpus = ReferenceCorpus(settings)
    monkeypatch.setattr("nova_ember.api.main.Corpus", lambda _: corpus)
    return TestClient(create_app(settings)), corpus


def test_http_calculation_pins_context_and_never_claims_to_launch_or_validate_a_simulation(
    reference_backend,
):
    client, corpus = reference_backend
    assert corpus.resolved == []
    assert client.get("/v1/visualizations/droplet").status_code == 405
    assert corpus.resolved == []
    response = client.post("/v1/visualizations/droplet", json=inputs())
    assert response.status_code == 200
    result = response.json()
    assert result["request"]["context"]["source_snapshot"] == SNAPSHOT
    assert corpus.resolved == [("snapshot", SNAPSHOT), ("PSI-69", SNAPSHOT)]
    assert result["artifact_type"] == "educational_simulation"
    assert result["origin"] == "deterministic_calculation"
    assert result["parameter_origin"] == "analyst_assumptions"
    assert result["requires_open"] is True
    assert result["autoplay"] is False
    assert result["summaries"] == {
        "initial_diameter": {"value": 2.0, "unit": "mm"},
        "burning_constant": {"value": 0.5, "unit": "mm^2/s"},
        "initial_diameter_squared": {"value": 4.0, "unit": "mm^2"},
        "idealized_endpoint": {"value": 8.0, "unit": "s"},
    }
    assert result["point_count"] == len(result["points"]) == 5
    assert result["points"][-1]["diameter_mm"] == 0
    assert result["points"][-1]["time_s"] == 8
    assert "not NASA measurements" in result["scientific_qualification"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    ("updates", "status"),
    [
        ({"sample_count": 602}, 422),
        ({"initial_diameter_mm": -1}, 422),
        ({"parameter_origin": "measured"}, 422),
        ({"investigation_accession": "../private-file"}, 422),
        ({"investigation_accession": "PSI-9999"}, 404),
        ({"investigation_accession": "PSI-25"}, 409),
        ({"context": {**inputs()["context"], "source_snapshot": "b" * 64}}, 404),
        ({"context": {**inputs()["context"], "source_snapshot": None}}, 409),
        ({"context": {**inputs()["context"], "input_origin": "measured"}}, 422),
    ],
)
def test_http_invalid_sources_parameters_or_measured_relabelling_are_refused(
    reference_backend, updates, status
):
    client, _corpus = reference_backend
    response = client.post("/v1/visualizations/droplet", json=inputs(**updates))
    assert response.status_code == status
    assert "points" not in response.json()


def test_http_origin_check_runs_before_model_preparation(reference_backend):
    client, corpus = reference_backend
    response = client.post(
        "/v1/visualizations/droplet",
        json=inputs(),
        headers={"Origin": "https://unrelated.example"},
    )
    assert response.status_code == 403
    assert corpus.resolved == []


def workspace():
    return WorkspaceContext(
        context_version="explicit-teaching-selection",
        snapshot_id=SNAPSHOT,
        investigations=["PSI-69"],
    )


def test_tool_merges_the_workspace_snapshot_and_keeps_the_whole_fact_outside_the_model_preview(
    reference_backend,
):
    _client, corpus = reference_backend
    context = {**inputs()["context"], "source_snapshot": None}
    tools = ResearchTools(corpus, workspace())
    fact = tools.run_scientific_tool(
        ScientificToolCall(
            name="prepare_simulation", parameters=inputs(context=context, sample_count=601)
        )
    )
    assert fact["origin"] == "deterministic_calculation"
    assert tools.facts[fact["id"]].content["context"]["source_snapshot"] == SNAPSHOT
    assert len(tools.facts[fact["id"]].content["points"]) == 601
    preview = json.loads(model_fact_payload(fact))
    assert preview["content"]["summaries"]["idealized_endpoint"] == {"value": 8.0, "unit": "s"}
    assert len(tools.facts[fact["id"]].content["points"]) == 601
    assert not source_backed(tools.facts[fact["id"]])


def test_tool_checks_frozen_and_selected_investigation_before_computing(reference_backend):
    _client, corpus = reference_backend
    toolbox = ScientificToolbox(corpus, workspace())
    bad_context = {**inputs()["context"], "source_snapshot": "b" * 64}
    with pytest.raises(ValueError, match="different frozen"):
        toolbox.dispatch(
            ScientificToolCall(name="prepare_simulation", parameters=inputs(context=bad_context))
        )
    assert corpus.resolved == []
    with pytest.raises(ValueError, match="explicitly selected"):
        toolbox.dispatch(
            ScientificToolCall(
                name="prepare_simulation", parameters=inputs(investigation_accession="PSI-68")
            )
        )
    assert not any(accession == "PSI-68" for accession, _snapshot in corpus.resolved)
    generic = toolbox.dispatch(
        ScientificToolCall(
            name="prepare_simulation", parameters=inputs(investigation_accession=None)
        )
    )
    assert generic["request"]["investigation_accession"] is None
    assert generic["requires_open"] is True


def test_contextual_source_links_cannot_launder_assumed_numbers_into_nasa_observations(
    reference_backend,
):
    _client, corpus = reference_backend
    tools = ResearchTools(corpus, workspace())
    fact = tools.run_scientific_tool(
        ScientificToolCall(name="prepare_simulation", parameters=inputs())
    )
    with_contextual_link = EvidenceFact.model_validate(
        {**fact, "sources": [{"accession": "PSI-69", "snapshot_id": SNAPSHOT}]}
    )
    assert not source_backed(with_contextual_link)
    tools.facts[fact["id"]] = with_contextual_link
    answer = ResearchAnswer(
        title="Assigned analytical example",
        claims=[
            {
                "statement": "For these assumptions, the idealized endpoint is 8 s.",
                "origin": "calculated",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
            {
                "statement": "NASA measured a lifetime of 8 s.",
                "origin": "source_summary",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    verified = verify_answer(answer, tools)
    assert len(verified["claims"]) == 1
    assert verified["claims"][0]["origin"] == "calculated"
    assert len(verified["withheld_claims"]) == 1


@pytest.mark.parametrize("unit", ["mm²/s", "mm2/s", "mm^2/s"])
def test_assumed_coefficient_narration_preserves_equivalent_square_unit_spellings(
    reference_backend, unit
):
    _client, corpus = reference_backend
    tools = ResearchTools(corpus, workspace())
    fact = tools.prepare_simulation(DropletVisualizationRequest.model_validate(inputs()))
    result = verify_answer(
        ResearchAnswer(
            title="Unit-preserving assumed coefficient",
            claims=[
                {
                    "statement": f"The assumed coefficient is 0.5 {unit}.",
                    "origin": "calculated",
                    "fact_ids": [fact["id"]],
                    "limitations": [],
                }
            ],
            contradictions=[],
            next_actions=[],
            limitations=[],
        ),
        tools,
    )
    assert len(result["claims"]) == 1
    assert result["withheld_claims"] == []


class SupportingReferenceCorpus(ReferenceCorpus):
    """Actual retained source bytes with synthetic repository identities for boundary tests."""

    def __init__(self, settings):
        super().__init__(settings)
        directory = Path(__file__).parent / "fixtures" / "nasa-psi-supporting"
        source = load_supporting_snapshot(directory)
        self.assets = [
            {**asset, "id": f"PSI-69:v{asset['investigation_version']}:{asset['sha256']}"}
            for asset in source["assets"]
            if asset["accession"] == "PSI-69"
        ]
        self.contents = {
            asset["file_name"]: (directory / asset["path"]).read_bytes() for asset in self.assets
        }

    def snapshot(self, snapshot_id=None):
        return {
            **super().snapshot(snapshot_id),
            "manifest": {
                "assets": self.assets,
                "investigations": [{"accession": "PSI-69", "version": 5}],
            },
        }

    def investigation(self, accession, snapshot_id):
        return {
            **super().investigation(accession, snapshot_id),
            "assets": self.assets if accession == "PSI-69" else [],
        }

    def asset(self, digest, snapshot_id, *, accession=None, asset_id=None):
        if snapshot_id != SNAPSHOT:
            raise MissingSource("The synthetic supporting snapshot is absent.")
        matches = [
            asset
            for asset in self.assets
            if asset["sha256"] == digest
            and (accession is None or asset["accession"] == accession)
            and (asset_id is None or asset["id"] == asset_id)
        ]
        if len(matches) != 1:
            raise MissingSource("The selected supporting asset is absent or ambiguous.")
        return matches[0]

    def asset_bytes(self, asset):
        return self.contents[asset["file_name"]]

    def change_sheet(self, transform, *, update_digest=True):
        sheet = next(asset for asset in self.assets if "FLEX-007_TestSheet" in asset["file_name"])
        content = transform(self.contents[sheet["file_name"]])
        self.contents[sheet["file_name"]] = content
        if update_digest:
            sheet["sha256"] = sha256(content).hexdigest()
            sheet["byte_size"] = len(content)
            sheet["id"] = f"PSI-69:v{sheet['investigation_version']}:{sheet['sha256']}"


@pytest.fixture
def supporting_backend(tmp_path, monkeypatch):
    settings = Settings("unused-supporting-reference-database", tmp_path, tmp_path)
    corpus = SupportingReferenceCorpus(settings)
    monkeypatch.setattr("nova_ember.api.main.Corpus", lambda _: corpus)
    return TestClient(create_app(settings)), corpus


def test_source_profile_reads_reported_parameters_and_exact_anchors_without_refitting(
    supporting_backend,
):
    client, corpus = supporting_backend
    response = client.post(
        "/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT, "sample_count": 5}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["parameter_origin"] == "source_reported_nominal"
    assert result["request"]["parameter_origin"] == "source_reported_nominal"
    assert result["request"]["initial_diameter_mm"] == 1.82
    assert result["request"]["burning_constant_mm2_s"] == 0.68
    assert result["idealized_endpoint_s"] == pytest.approx(4.871176470588235)
    assert "not a newly calibrated fit" in result["scientific_qualification"]
    assert not any(
        "Every displayed model parameter is an analyst assumption" in item
        for item in result["assumptions"]
    )
    for name, symbol in [("initial_diameter", "D0"), ("burning_constant", "kavg")]:
        parameter = result["parameter_sources"][name]
        anchor = parameter["anchor"]
        asset = corpus.asset(
            anchor["source_sha256"], SNAPSHOT, accession="PSI-69", asset_id=anchor["asset_id"]
        )
        line = corpus.asset_bytes(asset).decode("utf-8").splitlines()[anchor["source_row"] - 1]
        assert parameter["source_text"] == line
        assert symbol in line
        assert parameter["origin"] == "source_reported_nominal"
    assert any("obscur" in item for item in result["source_record_limitations"])
    assert any("disruption" in item for item in result["source_record_limitations"])
    assert result["requires_open"] is True
    assert result["autoplay"] is False


@pytest.mark.parametrize(
    "transform",
    [
        lambda content: content.replace(b"kavg  (mm2/s)", b"kavg  (cm2/s)"),
        lambda content: b"\n".join(line for line in content.split(b"\n") if b"kavg" not in line),
        lambda content: content + b"\nkavg (mm2/s) = 0.68\n",
        lambda content: content.replace(b"FLEX-007", b"FLEX-008"),
        lambda content: content.replace(b"Disruption", b"Unknown"),
    ],
)
def test_source_profile_refuses_changed_units_missing_or_ambiguous_fields_and_unknown_qualification(
    supporting_backend, transform
):
    client, corpus = supporting_backend
    corpus.change_sheet(transform)
    response = client.post("/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT})
    assert response.status_code == 409
    assert "points" not in response.json()


def test_source_profile_rejects_hash_mismatch_and_caller_supplied_reported_values(
    supporting_backend,
):
    client, corpus = supporting_backend
    assert (
        client.post(
            "/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT, "initial_diameter_mm": 5}
        ).status_code
        == 422
    )
    corpus.change_sheet(lambda content: content.replace(b"1.82", b"9.99"), update_digest=False)
    response = client.post("/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT})
    assert response.status_code == 409
    assert "points" not in response.json()


def test_source_tool_is_direct_and_reported_model_values_are_not_source_observations(
    supporting_backend,
):
    _client, corpus = supporting_backend
    tools = ResearchTools(corpus, workspace())
    registry = {tool.name: tool for tool in tools.registry()}
    assert "prepare_source_simulation" in registry
    assert "prepare_simulation" in registry
    fact = tools.prepare_source_simulation(
        SourceDropletVisualizationRequest(snapshot_id=SNAPSHOT, sample_count=5)
    )
    assert fact["origin"] == "deterministic_calculation"
    assert fact["content"]["parameter_origin"] == "source_reported_nominal"
    assert len(fact["sources"]) >= 2
    assert not source_backed(tools.facts[fact["id"]])
    assert fact["content"]["source_record_limitations"]
    assert not tools.actions


def test_source_parameter_facts_and_calculated_summaries_have_distinct_numeric_support(
    supporting_backend,
):
    _client, corpus = supporting_backend
    tools = ResearchTools(corpus, workspace())
    artifact = tools.prepare_source_simulation(
        SourceDropletVisualizationRequest(snapshot_id=SNAPSHOT)
    )
    reported_ids = artifact["content"]["reported_parameter_fact_ids"]
    assert len(reported_ids) == 8
    assert all(source_backed(tools.facts[identifier]) for identifier in reported_ids)
    assert all(tools.facts[identifier].origin == "source_text" for identifier in reported_ids)
    assert not source_backed(tools.facts[artifact["id"]])
    answer = ResearchAnswer(
        title="Source-parameterized trajectory with exact provenance",
        claims=[
            {
                "statement": "The retained test sheet reports nominal D0 = 1.82 mm "
                "and kavg = 0.68 mm²/s.",
                "origin": "source_summary",
                "fact_ids": reported_ids,
                "limitations": [],
            },
            {
                "statement": "The calculated initial diameter squared is 3.3124 mm²; "
                "the model returns 241 calculated states.",
                "origin": "calculated",
                "fact_ids": [artifact["id"]],
                "limitations": [],
            },
            {
                "statement": "NASA measured extinction at 4.87117647059 s.",
                "origin": "source_summary",
                "fact_ids": reported_ids + [artifact["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    verified = verify_answer(answer, tools)
    assert len(verified["claims"]) == 2
    assert {claim["origin"] for claim in verified["claims"]} == {"source_summary", "calculated"}
    assert len(verified["withheld_claims"]) == 1


def test_source_profile_preserves_every_reviewed_ambient_quantity_and_zero_fraction(
    supporting_backend,
):
    client, corpus = supporting_backend
    response = client.post("/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT})
    assert response.status_code == 200
    conditions = response.json()["condition_sources"]
    expected = {
        "ambient_pressure": (1.0, "atm"),
        "ambient_temperature": (300.44, "K"),
        "oxygen_mole_fraction": (0.21, "1"),
        "nitrogen_mole_fraction": (0.79, "1"),
        "carbon_dioxide_mole_fraction": (0.0, "1"),
        "helium_mole_fraction": (0.0, "1"),
    }
    assert set(conditions) == set(expected)
    for name, (value, unit) in expected.items():
        quantity = conditions[name]
        assert quantity["value"] == value
        assert quantity["unit"] == unit
        assert quantity["origin"] == "source_reported_nominal"
        if unit == "1":
            assert quantity["composition_basis"] == "mole"
        if unit == "atm":
            assert quantity["pressure_reference"] == "unreported"
        anchor = quantity["anchor"]
        asset = corpus.asset(
            anchor["source_sha256"], SNAPSHOT, accession="PSI-69", asset_id=anchor["asset_id"]
        )
        line = corpus.asset_bytes(asset).decode("utf-8").splitlines()[anchor["source_row"] - 1]
        assert quantity["source_text"] == line
        assert "Test Date" not in line and "Test Time" not in line


@pytest.mark.parametrize(
    "transform",
    [
        lambda content: content.replace(b"Pressure (atm)", b"Pressure (kPa)"),
        lambda content: content.replace(b"Temperature (K)", b"Temperature (C)"),
        lambda content: content.replace(b"O2 Mole Fraction", b"O2 Mass Fraction"),
        lambda content: content.replace(b" 1.00", b" 0.00"),
        lambda content: content.replace(b" 300.44", b" 0.00"),
        lambda content: content.replace(b" 0.21", b" 1.01"),
        lambda content: content.replace(b" 0.21", b" -0.01"),
        lambda content: content.replace(b" 0.21", b" 1e999"),
        lambda content: content.replace(b" 0.21", b" 1e-999"),
        lambda content: b"\n".join(
            line for line in content.split(b"\n") if b"He Mole Fraction" not in line
        ),
        lambda content: content + b"\nO2 Mole Fraction = 0.21\n",
    ],
)
def test_unresolved_units_basis_missing_or_invalid_conditions_do_not_become_typed_quantities(
    supporting_backend, transform
):
    client, corpus = supporting_backend
    corpus.change_sheet(transform)
    assert (
        client.post("/v1/visualizations/flex-007", json={"snapshot_id": SNAPSHOT}).status_code
        == 409
    )
    tools = ResearchTools(corpus, workspace())
    trace = tools.analyze_source(SourceAnalysisInput(method="flex_007_trace_evidence"))
    assert trace["content"]["reported_quantities_status"] == "unresolved"
    assert trace["content"]["reported_quantities"] == {}
    assert trace["content"]["reported_quantities_issues"]


def test_original_trace_fact_carries_unit_aware_conditions_without_inferred_pressure_reference(
    supporting_backend,
):
    _client, corpus = supporting_backend
    tools = ResearchTools(corpus, workspace())
    trace = tools.analyze_source(SourceAnalysisInput(method="flex_007_trace_evidence"))
    assert trace["content"]["reported_quantities_status"] == "parsed"
    assert (
        trace["content"]["reported_quantities"]["ambient_pressure"]["pressure_reference"]
        == "unreported"
    )
    answer = ResearchAnswer(
        title="Reviewed nominal atmosphere",
        claims=[
            {
                "statement": "The test sheet reports pressure 1.0 atm and temperature 300.44 K.",
                "origin": "source_summary",
                "fact_ids": [trace["id"]],
                "limitations": [],
            },
            {
                "statement": "The source oxygen mole fraction is 0.21 and the carbon dioxide "
                "and helium mole fractions are 0.",
                "origin": "source_summary",
                "fact_ids": [trace["id"]],
                "limitations": [],
            },
            {
                "statement": "The source reports pressure 1.0 Pa.",
                "origin": "source_summary",
                "fact_ids": [trace["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    verified = verify_answer(answer, tools)
    assert len(verified["claims"]) == 2
    assert len(verified["withheld_claims"]) == 1


def test_reviewed_text_reader_projects_only_requested_unit_bearing_parameter_lines(
    supporting_backend,
):
    _client, corpus = supporting_backend
    sheet = next(asset for asset in corpus.assets if "FLEX-007_TestSheet" in asset["file_name"])
    result = source_text(corpus, sheet["sha256"], SNAPSHOT, 2, 17)
    assert [line["line_number"] for line in result["lines"]] == [18, 19]
    assert set(result["reported_quantities"]) == {"initial_diameter", "burning_constant"}
    assert result["reported_quantities"]["initial_diameter"]["value"] == 1.82
    assert result["reported_quantities"]["initial_diameter"]["unit"] == "mm"
    assert result["reported_quantities"]["burning_constant"]["value"] == 0.68
    assert result["reported_quantities"]["burning_constant"]["unit"] == "mm^2/s"
    assert all(
        value["anchor"]["source_row"] in {18, 19}
        for value in result["reported_quantities"].values()
    )


def test_text_projection_does_not_expose_other_windows_or_guess_units_for_another_file(
    supporting_backend,
):
    _client, corpus = supporting_backend
    sheet = next(asset for asset in corpus.assets if "FLEX-007_TestSheet" in asset["file_name"])
    result = source_text(corpus, sheet["sha256"], SNAPSHOT, 1, 0)
    assert result["reported_quantities"] == {}
    assert len(result["lines"]) == 1
    assert "1.82" not in json.dumps(result)
    original = sheet["file_name"]
    sheet["file_name"] = "Unreviewed_text_copy.txt"
    corpus.contents[sheet["file_name"]] = corpus.contents[original]
    copied = source_text(corpus, sheet["sha256"], SNAPSHOT, 2, 17)
    assert "reported_quantities" not in copied
    assert len(copied["lines"]) == 2


def test_read_evidence_pins_actual_span_for_locators_and_preserves_strict_units(supporting_backend):
    _client, corpus = supporting_backend
    sheet = next(asset for asset in corpus.assets if "FLEX-007_TestSheet" in asset["file_name"])
    tools = ResearchTools(corpus, workspace())
    fact = tools.read_evidence(
        EvidenceInput(asset_sha256=sheet["sha256"], format="text", offset=17)
    )
    spans = [item for item in fact["sources"] if item.get("kind") == "text_lines"]
    assert len(spans) == 1
    assert spans[0]["source_row"] == 18
    assert spans[0]["line_end"] == fact["content"]["lines"][-1]["line_number"]
    answer = ResearchAnswer(
        title="Requested source lines",
        claims=[
            {
                "statement": "Lines 18 and 19 report nominal diameter 1.82 mm and kavg 0.68 mm²/s.",
                "origin": "source_summary",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
            {
                "statement": "Line 1 reports nominal diameter 1.82 mm.",
                "origin": "source_summary",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
            {
                "statement": "The source reports nominal diameter 1.82 Pa.",
                "origin": "source_summary",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    verified = verify_answer(answer, tools)
    assert len(verified["claims"]) == 1
    assert len(verified["withheld_claims"]) == 2


@pytest.mark.integration
def test_route_with_a_real_imported_frozen_snapshot_without_provider_access(tmp_path):
    database = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database:
        pytest.skip("A separate NOVA_TEST_DATABASE_URL is required for the real corpus check.")
    settings = Settings.from_environment()
    if database == settings.database_url:
        raise RuntimeError("Visualization integration tests require the separate test database.")
    settings = replace(
        settings, database_url=database, object_directory=tmp_path, openai_api_key=None
    )
    snapshot = seed(settings)
    client = TestClient(create_app(settings))
    context = {**inputs()["context"], "source_snapshot": snapshot}
    response = client.post("/v1/visualizations/droplet", json=inputs(context=context))
    assert response.status_code == 200
    assert response.json()["request"]["investigation_accession"] == "PSI-69"
    assert Corpus(settings).investigation("PSI-69", snapshot)["accession"] == "PSI-69"
    source = client.post(
        "/v1/visualizations/flex-007", json={"snapshot_id": snapshot, "sample_count": 5}
    )
    assert source.status_code == 200
    assert source.json()["parameter_origin"] == "source_reported_nominal"
    tools = ResearchTools(
        Corpus(settings),
        WorkspaceContext(
            snapshot_id=snapshot, context_version="real-source-profile", investigations=["PSI-69"]
        ),
    )
    fact = tools.prepare_source_simulation(
        SourceDropletVisualizationRequest(snapshot_id=snapshot, sample_count=5)
    )
    assert fact["content"]["request"]["initial_diameter_mm"] == 1.82
    assert fact["content"]["request"]["burning_constant_mm2_s"] == 0.68
    assert len(fact["sources"]) >= 2
    assert not source_backed(tools.facts[fact["id"]])

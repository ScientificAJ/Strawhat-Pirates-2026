"""Known-answer provenance checks; none of these fixtures establishes real combustion data."""

from types import SimpleNamespace

from nova_ember.api import research_tools
from nova_ember.api.claim_support import numeric_mentions
from nova_ember.api.discovery import Discovery
from nova_ember.api.records import CohortInputs
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import InvestigationInput, ResearchTools, SourceAnalysisInput
from nova_ember.contracts.research import EvidenceFact, ResearchAnswer, WorkspaceContext
from nova_ember.evidence.contracts import EvidenceAnchor


def fact(identifier, origin, content):
    return EvidenceFact(
        id=identifier,
        origin=origin,
        label="Offline provenance fixture",
        content=content,
        sources=[{"accession": "PSI-69", "snapshot_id": "a" * 64}],
        limitations=[],
    )


def check(facts, statements):
    answer = ResearchAnswer(
        title="Offline origin audit",
        claims=[
            {"statement": text, "origin": origin, "fact_ids": ids, "limitations": []}
            for text, origin, ids in statements
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    return verify_answer(answer, SimpleNamespace(facts={value.id: value for value in facts}))


def test_metadata_and_refusals_do_not_establish_a_completed_calculation():
    metadata = fact("metadata", "source_metadata", {"record_count": 274})
    refusal = fact(
        "refusal", "deterministic_calculation", {"status": "needs_data", "required_count": 274}
    )
    result = check(
        [metadata, refusal],
        [
            ("Calculated effectiveness is 274.", "calculated", ["metadata"]),
            ("The calculation established effectiveness.", "calculated", ["metadata"]),
            ("Calculated effectiveness is 274.", "calculated", ["refusal"]),
        ],
    )
    assert not result["claims"]
    assert len(result["withheld_claims"]) == 3


def test_metadata_numerals_cannot_fill_a_missing_calculated_result():
    calculation = fact("calculation", "deterministic_calculation", {"value": 2.0, "unit": "mm"})
    metadata = fact("metadata", "source_metadata", {"value": 999.0, "unit": "mm"})
    result = check(
        [calculation, metadata],
        [
            ("The calculated diameter is 2 mm.", "calculated", ["calculation", "metadata"]),
            ("The calculated diameter is 999 mm.", "calculated", ["calculation", "metadata"]),
        ],
    )
    assert [claim["statement"] for claim in result["claims"]] == [
        "The calculated diameter is 2 mm."
    ]
    assert len(result["withheld_claims"]) == 1


def test_prediction_numerals_require_the_registered_predictive_result_itself():
    prediction = fact(
        "prediction", "prediction", {"status": "predicted", "value": 2.0, "unit": "mm"}
    )
    metadata = fact("metadata", "source_metadata", {"value": 999.0, "unit": "mm"})
    result = check(
        [prediction, metadata],
        [
            ("The predicted diameter is 2 mm.", "predicted", ["prediction", "metadata"]),
            ("The predicted diameter is 999 mm.", "predicted", ["prediction", "metadata"]),
        ],
    )
    assert len(result["claims"]) == 1
    assert result["claims"][0]["numeric_support"][0]["origin"] == "prediction"
    assert len(result["withheld_claims"]) == 1


def test_qualitative_measured_assertions_need_a_reviewed_measurement_field():
    metadata = fact("metadata", "source_metadata", {"title": "FLEX"})
    nominal = fact(
        "nominal",
        "source_measurement",
        {
            "fields": [
                {
                    "source_value_kind": "setting",
                    "status": "normalized",
                    "canonical_value": 2.0,
                    "canonical_unit": "mm",
                }
            ]
        },
    )
    measurement = fact(
        "measurement",
        "source_measurement",
        {
            "fields": [
                {
                    "source_value_kind": "measurement",
                    "status": "normalized",
                    "canonical_value": 2.0,
                    "canonical_unit": "mm",
                }
            ]
        },
    )
    result = check(
        [metadata, nominal, measurement],
        [
            ("NASA measured a droplet diameter.", "source_summary", ["metadata"]),
            ("NASA measured a droplet diameter.", "source_summary", ["nominal"]),
            ("The source measured a droplet diameter.", "source_summary", ["measurement"]),
            (
                "This was not measured, but NASA measured suppression success.",
                "source_summary",
                ["metadata"],
            ),
        ],
    )
    assert len(result["claims"]) == 1
    assert result["claims"][0]["fact_ids"] == ["measurement"]
    assert len(result["withheld_claims"]) == 3


def test_local_negation_preserves_honest_model_and_source_qualifications():
    calculation = fact("calculation", "deterministic_calculation", {"value": 8.0, "unit": "s"})
    metadata = fact("metadata", "source_metadata", {"title": "FLEX"})
    result = check(
        [calculation, metadata],
        [
            (
                "The calculated endpoint is 8 s, not a measured burn time.",
                "calculated",
                ["calculation"],
            ),
            (
                "The source does not contain a measured suppression result.",
                "source_summary",
                ["metadata"],
            ),
        ],
    )
    assert len(result["claims"]) == 2
    assert not result["withheld_claims"]


def test_source_inspection_and_real_selection_calculations_keep_their_origins(monkeypatch):
    context = WorkspaceContext(snapshot_id="a" * 64, context_version="offline-origin-fixture")
    asset = {"accession": "PSI-69", "sha256": "b" * 64}
    corpus = SimpleNamespace(asset=lambda *args: asset)
    metadata_anchor = EvidenceAnchor(
        snapshot_id=context.snapshot_id,
        accession="PSI-69",
        investigation_version=5,
        source_sha256="c" * 64,
        kind="metadata_field",
        field="objective",
    )
    metadata = {
        "accession": "PSI-69",
        "source_fields": {"objective": {"value": "Study flame growth", "anchor": metadata_anchor}},
        "findings": None,
    }
    read = []
    monkeypatch.setattr(Discovery, "dossier", lambda *args: metadata)
    monkeypatch.setattr(Discovery, "read_anchor", lambda self, anchor: read.append(anchor))
    dossier = ResearchTools(corpus, context).get_investigation(
        InvestigationInput(accession="PSI-69")
    )
    assert dossier["origin"] == "source_metadata"
    assert dossier["content"]["findings"] is None
    assert dossier["sources"] == [metadata_anchor.model_dump(mode="json")]
    assert read == [metadata_anchor]

    tools = ResearchTools(corpus, context)
    tools.retained_sources = lambda content: [{**asset, "snapshot_id": context.snapshot_id}]
    monkeypatch.setattr(research_tools, "flex_endpoints", lambda *args: {"total_rows": 274})
    nominal = {"value": 1.82, "unit": "mm", "fit_status": "not_attempted"}
    monkeypatch.setattr(research_tools, "flex_trace", lambda *args: nominal)
    monkeypatch.setattr(research_tools, "bass_calibration", lambda *args: nominal)
    monkeypatch.setattr(
        research_tools, "freeze_selection", lambda *args: {"selected_record_count": 2}
    )
    counts = tools.analyze_source(SourceAnalysisInput(method="flex_source_events"))
    inspections = [
        tools.analyze_source(SourceAnalysisInput(method=method))
        for method in ("flex_007_trace_evidence", "bass_calibration_evidence")
    ]
    cohort = tools.create_cohort(
        CohortInputs(
            snapshot_id=context.snapshot_id,
            selections=[{"asset_sha256": "b" * 64, "source_rows": [2, 3]}],
        )
    )
    assert counts["origin"] == cohort["origin"] == "deterministic_calculation"
    assert all(item["origin"] == "source_text" for item in inspections)
    result = check(
        list(tools.facts.values()),
        [
            ("The calculated table count is 274.", "calculated", [counts["id"]]),
            ("The frozen selection contains 2 records.", "calculated", [cohort["id"]]),
            (
                "The source reports a nominal diameter of 1.82 mm.",
                "source_summary",
                [inspections[0]["id"]],
            ),
            ("The calculated diameter is 1.82 mm.", "calculated", [inspections[0]["id"]]),
        ],
    )
    assert len(result["claims"]) == 3
    assert len(result["withheld_claims"]) == 1


def test_recognized_caret_units_do_not_create_extra_scientific_values():
    assert numeric_mentions("The computed K is 0.68 mm^2/s.") == [("0.68", "mm2/s")]
    assert numeric_mentions("The computed K is 0.68 mm²/s.") == [("0.68", "mm2/s")]
    assert numeric_mentions("The time is 2 s and the area is 3.3124 mm^2.") == [
        ("2", "s"),
        ("3.3124", "mm2"),
    ]
    assert ("2.3", None) in numeric_mentions("The area is 3.3124 mm^2.3.")
    assert ("2.3", None) in numeric_mentions("The computed K is 0.68 mm^2.3/s.")
    calculation = fact(
        "calculation",
        "deterministic_calculation",
        {
            "coefficient": {"value": 0.68, "unit": "mm^2/s"},
            "area": {"value": 3.3124, "unit": "mm^2"},
        },
    )
    result = check(
        [calculation],
        [
            ("The computed K is 0.68 mm^2/s.", "calculated", ["calculation"]),
            ("The computed K is 0.68 mm²/s.", "calculated", ["calculation"]),
            ("The computed area is 3.3124 mm^2.", "calculated", ["calculation"]),
            ("The computed K is 0.68 m^2/s.", "calculated", ["calculation"]),
            ("The computed K is 0.69 mm^2/s.", "calculated", ["calculation"]),
            ("The computed K is 0.68 mm^2.3/s.", "calculated", ["calculation"]),
        ],
    )
    assert len(result["claims"]) == 3
    assert len(result["withheld_claims"]) == 3

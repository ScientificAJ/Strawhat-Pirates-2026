"""A model failure retains useful work without inventing completion or source quantities."""

from types import SimpleNamespace

from nova_ember.api.research import retained_evidence_answer
from nova_ember.contracts.research import EvidenceFact


def fact(identifier, origin, content, label="Retained evidence"):
    return EvidenceFact(
        id=identifier,
        origin=origin,
        label=label,
        content=content,
        sources=[{"accession": "PSI-25", "snapshot_id": "a" * 64}],
        limitations=[],
    )


def fallback(facts, question):
    return retained_evidence_answer(SimpleNamespace(facts={f.id: f for f in facts}), question)


def test_prepared_simulation_is_reported_without_claiming_an_unfinished_prediction():
    output = fact(
        "prepared",
        "deterministic_calculation",
        {"artifact_type": "educational_simulation", "status": "illustrative_model"},
    )
    unfinished = fact(
        "not-predicted", "prediction", {"status": "outside_validated_domain", "value": 999}
    )
    answer = fallback([unfinished, output], "Create a droplet visualization.")
    assert len(answer["claims"]) == 1
    claim = answer["claims"][0]
    assert (
        claim["statement"]
        == "Prepared the analytical droplet visualization from its recorded model inputs."
    )
    assert claim["origin"] == "calculated"
    assert claim["fact_ids"] == ["prepared"]
    assert "999" not in str(answer["claims"])
    assert not answer["limitations"]


def test_failed_calculation_falls_through_to_exact_relevant_source_passage():
    unfinished = fact(
        "unfinished", "deterministic_calculation", {"status": "needs_data", "value": 999}
    )
    dossier = fact(
        "bass",
        "source_metadata",
        {
            "acronym": "BASS-II",
            "title": "Burning and Suppression of Solids - II",
            "approach": "Airflow was set to 40 cm/s. "
            "The investigation examines solid-fuel flame spread in microgravity.",
        },
    )
    answer = fallback([unfinished, dossier], "Explain the BASS-II approach.")
    assert answer["claims"][0]["statement"] == (
        "The investigation examines solid-fuel flame spread in microgravity."
    )
    assert answer["claims"][0]["fact_ids"] == ["bass"]
    assert answer["claims"][0]["origin"] == "source_summary"
    assert "999" not in str(answer["claims"])
    assert "40" not in str(answer["claims"])
    assert "calculated" not in str(answer["claims"])


def test_planned_reviewed_table_value_is_useful_and_keeps_condition_origin():
    table = fact(
        "plan",
        "source_metadata",
        {
            "source_table_origin": "planned_conditions",
            "records": [
                {
                    "fields": [
                        {
                            "source_column": "Oxygen (%)",
                            "raw_text": "37",
                            "original_unit": "%",
                            "canonical_unit": "1",
                            "canonical_value": 0.37,
                            "source_value_kind": "condition",
                            "status": "normalized",
                        },
                        {
                            "source_column": "Measured temperature (K)",
                            "raw_text": "999",
                            "original_unit": "K",
                            "canonical_value": None,
                            "source_value_kind": "measurement",
                            "status": "unresolved",
                        },
                    ]
                }
            ],
        },
    )
    answer = fallback([table], "What planned oxygen condition is available?")
    assert answer["claims"][0]["statement"] == "Planned condition — Oxygen: 37 %."
    assert answer["claims"][0]["numeric_support"][0]["origin"] == "condition"
    assert answer["claims"][0]["fact_ids"] == ["plan"]
    assert "999" not in str(answer["claims"])


def test_tool_contract_and_unfinished_results_do_not_become_a_supported_answer():
    schema = fact("schema", "tool_contract", {"description": "Flame temperature is 999 K."})
    unfinished = fact(
        "unfinished", "deterministic_calculation", {"status": "needs_data", "value": 999}
    )
    proposal = fact(
        "proposal",
        "model_proposal",
        {"artifact_type": "source_media_visualization", "status": "prepared"},
    )
    assert fallback([schema, unfinished, proposal], "Calculate flame temperature.") is None


def test_completed_source_count_result_keeps_actual_counts_and_record_grain():
    counts = fact(
        "counted",
        "deterministic_calculation",
        {"counts": [{"label": "Extinction", "count": 186}], "independent_run_count": None},
        label="FLEX source event counts",
    )
    answer = fallback([counts], "How many extinction labels are in the source?")
    assert answer["claims"][0]["statement"] == "Source label Extinction: 186 records."
    assert answer["claims"][0]["fact_ids"] == ["counted"]
    assert answer["claims"][0]["numeric_support"][0]["stored_value"] == "186"

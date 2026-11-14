"""Exact source positions are audited locators, never physical measurements."""

from types import SimpleNamespace

import pytest
from nova_ember.api.research import verify_answer
from nova_ember.contracts.research import EvidenceFact, ResearchAnswer


def line_fact(identifier, line, *, source="a", value=1.82, unit="mm", **extra):
    return EvidenceFact(
        id=identifier,
        origin="source_text",
        label="Registered source-parameter fixture",
        content={"reported_parameter": {"value": value, "unit": unit}, **extra},
        sources=[
            {
                "snapshot_id": "b" * 64,
                "source_sha256": source * 64,
                "accession": "PSI-69",
                "investigation_version": 5,
                "asset_id": f"PSI-69:fixture-{source}",
                "kind": "text_lines",
                "source_row": line,
                "line_end": line,
            }
        ],
        limitations=["Synthetic anchor fixture, not a NASA observation."],
    )


def check(statement, facts):
    return verify_answer(
        ResearchAnswer(
            title="Source locator check",
            claims=[
                {
                    "statement": statement,
                    "origin": "source_summary",
                    "fact_ids": [fact.id for fact in facts],
                    "limitations": [],
                }
            ],
            contradictions=[],
            next_actions=[],
            limitations=[],
        ),
        SimpleNamespace(facts={fact.id: fact for fact in facts}),
    )


@pytest.mark.parametrize(
    "locator", ["line 18", "line18", "lines 18–19", "lines18-19", "lines 18 and 19"]
)
def test_exact_same_source_line_coverage_is_recorded_separately_from_quantity_support(locator):
    facts = [line_fact("diameter", 18), line_fact("coefficient", 19, value=0.68, unit="mm^2/s")]
    checked = check(f"PSI-69 reports nominal diameter 1.82 mm at {locator}.", facts)
    assert not checked["withheld_claims"]
    claim = checked["claims"][0]
    assert [item["display"] for item in claim["numeric_support"]] == ["1.82"]
    recorded = claim["source_locator_support"][0]
    assert recorded["locator"] == locator
    assert all(
        item["anchor"]["source_sha256"] == "a" * 64 for item in recorded["supporting_anchors"]
    )


@pytest.mark.parametrize(
    "locator", ["line 999", "lines 18–20", "lines 19–18", "line 18.5", "line -18"]
)
def test_invalid_locator_is_withheld_even_if_its_number_occurs_as_unrelated_source_data(locator):
    fact = line_fact("source", 18, unrelated_values=[999, 18, 19, 20, 18.5, -18])
    checked = check(f"The reported nominal diameter is 1.82 mm at {locator}.", [fact])
    assert not checked["claims"]
    reasons = checked["withheld_claims"][0]["reasons"]
    assert any("source-line locator" in reason for reason in reasons)


def test_line_range_cannot_be_completed_by_anchors_from_different_sources():
    facts = [line_fact("first", 18, source="a"), line_fact("second", 19, source="c")]
    checked = check("The source reports nominal diameter 1.82 mm at lines 18–19.", facts)
    assert not checked["claims"]
    assert any("same-source" in reason for reason in checked["withheld_claims"][0]["reasons"])


def test_unit_bearing_line_length_is_still_a_physical_quantity():
    source = line_fact("source", 18, value=18, unit="mm")
    accepted = check("The described line is a line 18 mm long.", [source])
    assert not accepted["withheld_claims"]
    assert accepted["claims"][0]["source_locator_support"] == []
    assert accepted["claims"][0]["numeric_support"][0]["stored_value"] == "18"
    wrong_units = check("The described line is a line 18 s long.", [source])
    assert not wrong_units["claims"]


def test_non_anchor_metadata_cannot_launder_a_source_line_citation():
    source = line_fact("source", 18, unrelated_values=[18])
    source = source.model_copy(
        update={"sources": [{"accession": "PSI-69", "snapshot_id": "b" * 64}]}
    )
    checked = check("The source describes the nominal diameter at line 18.", [source])
    assert not checked["claims"]

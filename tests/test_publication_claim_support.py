"""Publication positions are verified locators, never substitute physical values."""

from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from nova_ember.adapters.nasa_research import interpret_publication_table, load_collection
from nova_ember.adapters.psi import read_csv_asset
from nova_ember.api.claim_support import check_publication_locators, numeric_mentions
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import ResearchTools
from nova_ember.contracts.research import EvidenceFact, ProposedClaim, ResearchAnswer
from nova_ember.evidence.contracts import EvidenceAnchor

COLLECTION = Path(__file__).resolve().parents[1] / "data/nasa-research"
SNAPSHOT = "a" * 64


@pytest.fixture
def publication_fact():
    collection = load_collection(COLLECTION)

    def make(suffix="saffire-iv-v-vi-results", sample="VI-2", accession="NASA-SAFFIRE-VI"):
        asset = next(
            item
            for item in collection["assets"]
            if item["accession"] == accession and item["file_name"].endswith(f"_{suffix}.csv")
        )
        table = interpret_publication_table(asset, read_csv_asset(COLLECTION, asset))
        rows = [row for row in table.records if row.raw_cells[0] == sample]
        identity = {key: value for key, value in asset.items() if key != "table_definition"}
        anchors = [
            EvidenceAnchor(
                snapshot_id=SNAPSHOT,
                source_kind="nasa",
                accession=asset["accession"],
                investigation_version=1,
                source_sha256=asset["sha256"],
                asset_id=asset["id"],
                kind="table_cell",
                source_row=row.source_row,
                column=field.column_index,
            ).model_dump(mode="json", exclude_none=True)
            for row in rows
            for field in row.fields
            if field.raw_text.strip()
        ]
        return EvidenceFact(
            id=f"{suffix}-{sample}",
            origin="source_text",
            label="Retained published Saffire table",
            content={
                **table.model_dump(exclude={"records"}),
                "snapshot_id": SNAPSHOT,
                "asset": identity,
                "records": [row.model_dump() for row in rows],
            },
            sources=[{**identity, "snapshot_id": SNAPSHOT}, *anchors],
            limitations=table.limitations,
        )

    return make


def checked(statement, facts):
    answer = ResearchAnswer(
        title="Publication verification",
        claims=[
            ProposedClaim(
                statement=statement,
                origin="source_summary",
                fact_ids=[fact.id for fact in facts],
                limitations=[],
            )
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    tools = cast(ResearchTools, SimpleNamespace(facts={fact.id: fact for fact in facts}))
    return verify_answer(answer, tools)


@pytest.mark.parametrize(
    "value,expected", [("3,650", "3650"), ("3,650.25", "3650.25"), ("1,234,567", "1234567")]
)
def test_conventional_grouping_is_one_numeric_scalar_with_its_unit(value, expected):
    assert numeric_mentions(f"The reported heat release is {value} W.") == [(expected, "W")]


def test_live_saffire_calorimetry_phrasing_keeps_only_physical_values_numeric(publication_fact):
    fact = publication_fact()
    statement = (
        "Oxygen-consumption calorimetry reported a peak heat release of 3217 W. "
        "The exact cell is Table 2, page 6, row VI-2, column Oxygen Consumption "
        "Calorimetry / Peak Heat Release (W)."
    )
    result = checked(statement, [fact])
    assert not result["withheld_claims"]
    claim = result["claims"][0]
    assert [item["display"] for item in claim["numeric_support"]] == ["3217"]
    assert {item["locator"] for item in claim["source_locator_support"]} == {
        "Table 2",
        "page 6",
        "row VI-2",
    }
    assert {item["document_id"] for item in claim["source_locator_support"]} == {"20240002981"}
    assert all(item["supporting_anchors"] for item in claim["source_locator_support"])
    average = checked(
        "Fuel-consumption calorimetry reported average heat release of 3,650 W "
        "in Table2, page6, sample VI-2.",
        [fact],
    )
    assert not average["withheld_claims"]
    assert average["claims"][0]["numeric_support"][0]["stored_value"] == "3650.0"


@pytest.mark.parametrize(
    "locator,accession,table,sample,quantity,expected",
    [
        ("VI-2 row", "NASA-SAFFIRE-VI", "saffire-iv-v-vi-results", "VI-2", "3217 W", "3217"),
        ("VI-2 sample", "NASA-SAFFIRE-VI", "saffire-iv-v-vi-results", "VI-2", "3,650 W", "3650"),
        ('"1" case', "NASA-SOFIE-GEL", "gel-20240007628-table-1", "1", "0.36 W/cm²", "0.36"),
        ("1409B sample", "NASA-SOFIE-GEL", "gel-20240007628-table-1", "1", "3.63 1/s", "3.63"),
    ],
)
def test_reversed_locators_use_the_same_selected_field_anchors(
    publication_fact, locator, accession, table, sample, quantity, expected
):
    fact = publication_fact(table, sample, accession)
    result = checked(f"The publication reports {quantity} in the {locator}.", [fact])
    assert not result["withheld_claims"]
    claim = result["claims"][0]
    assert [item["display"] for item in claim["numeric_support"]] == [expected]
    assert [item["locator"] for item in claim["source_locator_support"]] == [locator]
    assert claim["source_locator_support"][0]["supporting_anchors"]


@pytest.mark.parametrize("locator", ["VI-120 row", "VI-120 sample", '"120" case', "VI-2.5 row"])
def test_fabricated_reversed_locators_cannot_borrow_unrelated_physical_numbers(
    publication_fact, locator
):
    fact = publication_fact()
    fact.content["unrelated_value"] = 2.5
    result = checked(f"The publication reports 3217 W in the {locator}.", [fact])
    assert not result["claims"]
    assert any(
        "publication locator" in reason for reason in result["withheld_claims"][0]["reasons"]
    )


@pytest.mark.parametrize("phrase", ["2 samples", "1 case", "6mm row"])
def test_reverse_grammar_does_not_turn_counts_or_unit_bearing_scalars_into_identifiers(
    publication_fact, phrase
):
    spans, support, errors = check_publication_locators(phrase, [publication_fact()])
    assert not spans and not support and not errors
    assert numeric_mentions(phrase, locator_spans=spans)


@pytest.mark.parametrize("value", ["3,65", "36,50", "3,650.1", "3,651"])
def test_grouping_does_not_relax_exact_numeric_support(publication_fact, value):
    result = checked(f"The reported average heat release is {value} W.", [publication_fact()])
    assert not result["claims"]
    assert any(
        "numerical statement" in reason for reason in result["withheld_claims"][0]["reasons"]
    )


@pytest.mark.parametrize(
    "locator", ["Table 3217", "page 3217", "row VI-120", "sample VI-120", "Table -2", "page 6.5"]
)
def test_fabricated_locators_fail_even_when_their_numbers_occur_in_physical_data(
    publication_fact, locator
):
    result = checked(
        f"The source reports peak heat release 3217 W at {locator}.", [publication_fact()]
    )
    assert not result["claims"]
    assert any(
        "publication locator" in reason for reason in result["withheld_claims"][0]["reasons"]
    )


def test_locator_identity_cannot_mix_tables_and_pages_from_different_facts(publication_fact):
    facts = [publication_fact(), publication_fact("saffire-iv-v-vi-conditions")]
    result = checked("Peak heat release is 3217 W in Table 2, page 3, row VI-2.", facts)
    assert not result["claims"]
    assert any("same-publication" in reason for reason in result["withheld_claims"][0]["reasons"])


def test_row_locator_cannot_expand_the_selected_sample_scope(publication_fact):
    result = checked(
        "Peak heat release is 3080 W in Table 2, page 6, row VI-2.",
        [publication_fact(sample="VI-3")],
    )
    assert not result["claims"]
    assert any(
        "publication locator" in reason for reason in result["withheld_claims"][0]["reasons"]
    )


@pytest.mark.parametrize(
    "failure", ["missing_anchors", "wrong_hash", "wrong_row_text", "unanchored_code"]
)
def test_publication_metadata_and_raw_labels_require_matching_field_anchors(
    publication_fact, failure
):
    fact = publication_fact()
    if failure == "missing_anchors":
        fact.sources[:] = fact.sources[:1]
    elif failure == "wrong_hash":
        for source in fact.sources[1:]:
            source["source_sha256"] = "b" * 64
    elif failure == "wrong_row_text":
        fact.content["records"][0]["raw_cells"][0] = "VI-999"
    else:
        fact.sources[:] = [source for source in fact.sources if source.get("column") != 0]
    spans, support, errors = check_publication_locators("Table 2, page 6, row VI-2", [fact])
    assert not spans and not support and errors


@pytest.mark.parametrize("phrase", ["page6mm", "page6 mm", "page 6 mm", "Table2W", "sample120kJ"])
def test_units_after_reference_words_remain_checked_physical_quantities(publication_fact, phrase):
    spans, support, errors = check_publication_locators(phrase, [publication_fact()])
    assert not spans and not support and not errors
    mentions = numeric_mentions(phrase, locator_spans=spans)
    assert mentions
    assert mentions[0][1] is not None
    result = checked(f"The publication reports {phrase}.", [publication_fact()])
    assert not result["claims"]


@pytest.mark.parametrize("locator", ["row VI-2.5", "page6,000"])
def test_partial_number_matches_cannot_turn_a_fabricated_locator_into_a_valid_one(
    publication_fact, locator
):
    fact = publication_fact()
    fact.content["unrelated_values"] = [2.5, 6000]
    result = checked(f"Peak heat release is 3217 W at {locator}.", [fact])
    assert not result["claims"]


def test_locators_do_not_support_wrong_values_or_borrow_units(publication_fact):
    for quantity in ["3218 W", "3217 kJ", "3650 kJ"]:
        result = checked(
            f"The publication reports {quantity} in Table 2, page 6, row VI-2.",
            [publication_fact()],
        )
        assert not result["claims"]
        assert any(
            "numerical statement" in reason for reason in result["withheld_claims"][0]["reasons"]
        )


def test_locator_check_does_not_modify_retained_facts(publication_fact):
    fact = publication_fact()
    original = deepcopy(fact)
    check_publication_locators("Table 2, page 6, row VI-2", [fact])
    assert fact == original

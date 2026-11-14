"""Known-condition evidence relations and source-location contract checks."""

import pytest
from nova_ember.evidence.contracts import Claim, EvidenceAnchor, EvidenceRelation, Hypothesis
from nova_ember.evidence.research import compare_claims, invalidated_dependents, plan_hypothesis
from pydantic import ValidationError

HASH = "a" * 64


def anchor(**changes):
    return EvidenceAnchor.model_validate(
        {
            "snapshot_id": HASH,
            "accession": "PSI-69",
            "investigation_version": 5,
            "source_sha256": "b" * 64,
            "kind": "table_cell",
            "source_row": 2,
            "column": 1,
            **changes,
        }
    )


def source_claim(identifier, value, **changes):
    return Claim(
        id=identifier,
        text=f"Source-reported value {value}",
        origin="source_reported",
        anchors=(anchor(),),
        endpoint="reported_duration",
        unit="s",
        numeric_value=value,
        conditions={
            "material": "A",
            "material_formulation": "reported-formulation-A",
            "geometry": "sheet",
            "thickness": "reported-thickness-A",
            "scale": "reported-scale-A",
            "support": "reported-support-A",
            "backing": "reported-backing-A",
            "oxygen": "source-condition-A",
            "oxygen_fraction": "reported-oxygen-A",
            "atmosphere": "reported-mixture-A",
            "dry_wet_basis": "dry",
            "composition_basis": "mole",
            "composition_location": "chamber",
            "pressure": "source-condition-A",
            "pressure_reference": "absolute",
            "temperature": "reported-temperature-A",
            "diluent_composition": "reported-diluents-A",
            "flow": "source-condition-A",
            "flow_direction": "reported-direction-A",
            "flow_velocity": "reported-velocity-A",
            "flow_reference_conditions": "reported-reference-A",
            "gravity": "microgravity",
            "gravity_time_history": "reported-time-history-A",
            "gravity_magnitude": "reported-gravity-A",
            "gravity_direction": "reported-vector-A",
            "confinement": "reported-enclosure-A",
            "ignition_protocol": "reported-ignition-A",
            "sensor_response": "reported-response-A",
            "observation_window": "reported-window-A",
            "endpoint_definition": "reported-duration-definition-A",
            "data_processing": "reported-method-A",
            "endpoint": "reported_duration",
            "measurement": "reported-duration-protocol-A",
            "apparatus": "same-config",
            "protocol": "same-protocol",
        },
        **changes,
    )


def test_source_anchor_requires_exact_locator_and_valid_interval():
    with pytest.raises(ValidationError):
        anchor(column=None)
    with pytest.raises(ValidationError):
        anchor(start=3, end=2)
    with pytest.raises(ValidationError):
        anchor(start=3)
    with pytest.raises(ValidationError):
        anchor(kind="text_lines", source_row=8, line_end=7)
    assert anchor(column=0).column == 0


def test_claim_origin_cannot_replace_numerical_provenance():
    with pytest.raises(ValidationError):
        Claim(id="x", text="calculated", origin="derived", numeric_value=2, unit="m")
    with pytest.raises(ValidationError):
        Claim(id="x", text="predicted", origin="predicted", numeric_value=2, unit="m")
    with pytest.raises(ValidationError):
        Claim(id="x", text="measured", origin="measured", anchors=())
    with pytest.raises(ValidationError):
        source_claim("bad", float("nan"))


def test_different_conditions_are_not_flattened_into_a_contradiction():
    left, right = source_claim("a", 3), source_claim("b", 8)
    different = right.model_copy(update={"conditions": {**right.conditions, "flow": "other-flow"}})
    result = compare_claims(left, different)
    assert result["status"] == "condition_difference"
    assert (
        next(row for row in result["condition_matrix"] if row["dimension"] == "flow")["status"]
        == "different"
    )
    unknown = right.model_copy(update={"conditions": {**right.conditions, "oxygen": None}})
    assert compare_claims(left, unknown)["status"] == "unresolved"
    unknown_text = left.model_copy(update={"conditions": {**left.conditions, "oxygen": "unknown"}})
    assert compare_claims(unknown_text, unknown_text)["status"] == "unresolved"
    assert compare_claims(left, right)["status"] == "potential_conflict"
    assert compare_claims(left, left)["status"] == "same_reported_value"
    assert (
        compare_claims(left, right)["scientific_verification"]
        == "not_established_by_this_comparison"
    )


def test_transitive_invalidation_is_stable_and_cycle_safe():
    relations = tuple(
        EvidenceRelation(source=a, target=b, relation="depends_on", explanation="frozen dependency")
        for a, b in [
            ("chart", "calculation"),
            ("calculation", "source"),
            ("case", "chart"),
            ("chart", "case"),
        ]
    )
    assert invalidated_dependents({"source"}, relations) == ["calculation", "case", "chart"]
    assert invalidated_dependents({"unrelated"}, relations) == []


def test_hypothesis_keeps_falsifier_and_does_not_invent_information_gain():
    hypothesis = Hypothesis(
        question="Which mechanism explains the observed endpoint?",
        mechanism="Competing transport mechanism",
        supporting=(source_claim("a", 3),),
        contrary=(source_claim("b", 8),),
        predicted_observation="A distinct source-supported trend",
        falsifier="The trend reverses under matched conditions",
        assumptions=("Conditions can be matched",),
        variables_to_characterize=("flow", "oxygen"),
    )
    result = plan_hypothesis(hypothesis)
    assert result["status"] == "research_proposal"
    assert result["information_gain"] is None
    assert result["hypothesis"].falsifier == hypothesis.falsifier

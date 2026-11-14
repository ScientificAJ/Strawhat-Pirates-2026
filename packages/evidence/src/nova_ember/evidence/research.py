"""Deterministic evidence-ledger tools without fabricated scientific adjudication."""

from __future__ import annotations

from typing import Any

from nova_ember.domain.scientific import COMPARISON_FIELDS

from .contracts import Claim, ControlCandidate, EarthTransfer, EvidenceRelation, Hypothesis

REQUIRED_COMPARISON_CONDITIONS = COMPARISON_FIELDS
UNRESOLVED_CONDITION_LABELS = {
    "",
    "unknown",
    "unreported",
    "not reported",
    "not measured",
    "not specified",
    "not available",
    "undetermined",
    "unspecified",
    "unresolved",
    "conflicting",
    "missing",
    "nan",
    "n/a",
    "not applicable",
}


def unresolved_condition(value: object) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        label = " ".join(value.casefold().replace("_", " ").replace("-", " ").split())
        return label in UNRESOLVED_CONDITION_LABELS
    return False


def compare_claims(left: Claim, right: Claim) -> dict[str, Any]:
    """Expose condition differences before labeling an apparent contradiction."""
    dimensions = sorted(
        set(REQUIRED_COMPARISON_CONDITIONS) | set(left.conditions) | set(right.conditions)
    )
    matrix = []
    for dimension in dimensions:
        a, b = left.conditions.get(dimension), right.conditions.get(dimension)
        absent = any(unresolved_condition(value) for value in (a, b))
        status = "unknown" if absent else "matched" if a == b else "different"
        matrix.append({"dimension": dimension, "left": a, "right": b, "status": status})
    unknown = any(row["status"] == "unknown" for row in matrix)
    different = any(row["status"] == "different" for row in matrix)
    endpoint_match = left.endpoint is not None and left.endpoint == right.endpoint
    unit_match = left.unit is not None and left.unit == right.unit
    if not endpoint_match:
        status = "unresolved"
        explanation = (
            "Missing endpoint or condition identity prevents a scientific contradiction "
            "determination."
        )
    elif different:
        status = "condition_difference"
        explanation = (
            "The claims concern different conditions; inspect mechanisms before treating "
            "them as contradictory."
        )
    elif unknown:
        status = "unresolved"
        explanation = (
            "Missing condition identity prevents a scientific contradiction determination."
        )
    elif left.numeric_value is not None and right.numeric_value is not None and unit_match:
        status = (
            "potential_conflict"
            if left.numeric_value != right.numeric_value
            else "same_reported_value"
        )
        explanation = (
            "Equal nominal conditions and units permit comparison; measurement "
            "uncertainty and dependence still need assessment."
        )
    else:
        status = "requires_interpretation"
        explanation = (
            "Textual claims require source interpretation; string disagreement does not "
            "establish physical contradiction."
        )
    return {
        "left": left,
        "right": right,
        "status": status,
        "condition_matrix": matrix,
        "explanation": explanation,
        "scientific_verification": "not_established_by_this_comparison",
        "possible_explanations": [
            "Different endpoint or measurement definition",
            "Unreported condition or calibration difference",
            "Within-run dependence or duplicate publication",
            "Measurement uncertainty or genuine disagreement",
        ],
    }


def invalidated_dependents(
    changed_ids: set[str], relations: tuple[EvidenceRelation, ...]
) -> list[str]:
    """Return stable transitive dependents; tolerate cycles without losing nodes."""
    invalidated = set(changed_ids)
    pending = list(changed_ids)
    dependents: dict[str, set[str]] = {}
    for edge in relations:
        if edge.relation in {"depends_on", "derived_from"}:
            dependents.setdefault(edge.target, set()).add(edge.source)
    while pending:
        for dependent in dependents.get(pending.pop(), set()):
            if dependent not in invalidated:
                invalidated.add(dependent)
                pending.append(dependent)
    return sorted(invalidated - changed_ids)


def plan_hypothesis(hypothesis: Hypothesis) -> dict[str, Any]:
    return {
        "hypothesis": hypothesis,
        "status": "research_proposal",
        "competing_explanations_required": True,
        "evidence_to_discriminate": {
            "expected_observation": hypothesis.predicted_observation,
            "falsifying_observation": hypothesis.falsifier,
            "variables": hypothesis.variables_to_characterize,
        },
        "information_gain": None,
        "information_gain_reason": "No validated probabilistic observation model was supplied.",
        "execution_scope": (
            "A scientific planning record; it does not authorize or prescribe physical "
            "experimental operation."
        ),
        "limitations": [
            (
                "An evidence gap may reflect unreleased or uningested data rather than an "
                "unstudied phenomenon."
            ),
            (
                "Supporting and contrary claims retain their original scientific status and "
                "source versions."
            ),
        ],
    }


def assess_control(candidate: ControlCandidate) -> dict[str, Any]:
    unknown = sorted(
        key
        for key, value in candidate.applicable_configuration.items()
        if unresolved_condition(value)
    )
    return {
        "candidate": candidate,
        "status": "research_evidence",
        "unknown_configuration": unknown,
        "operational_suitability": "not_established",
        "validation_required": candidate.necessary_validation,
        "limitations": [
            "No universal hazard score, equipment sizing, crew limit or certification is inferred.",
            (
                "Candidate mechanisms, countereffects and interactions must be assessed for "
                "the stated configuration."
            ),
        ],
    }


def assess_transfer(transfer: EarthTransfer) -> dict[str, Any]:
    return {
        "transfer": transfer,
        "unknown_constraints": sorted(
            key
            for key, value in transfer.transfer_constraints.items()
            if unresolved_condition(value)
        ),
        "evidence_status": transfer.status,
        "automatic_equivalence": False,
        "limitations": [
            (
                "Shared terminology or hardware does not establish equivalent gravity, "
                "ventilation, scale, atmosphere or exposure."
            ),
            "A research hypothesis remains distinct from a documented application.",
        ],
    }

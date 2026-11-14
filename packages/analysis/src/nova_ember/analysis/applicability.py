"""Condition comparison and discovery policies; heuristic scores are not hazard probabilities."""

from __future__ import annotations

import re
from typing import Literal

from nova_ember.domain.scientific import (
    COMPARISON_FIELDS,
    Finite,
    Fraction,
    Identifier,
    MethodContext,
    Nonnegative,
    ScientificInput,
)
from pydantic import Field, model_validator

ConditionStatus = Literal["matched", "different", "unknown", "incompatible", "unresolved"]

CORE_COMPARISON_FIELDS = COMPARISON_FIELDS


class ConditionValue(ScientificInput):
    value: str | Finite | None = Field(default=None)
    unit: str | None = None
    reference_basis: str | None = None
    status: Literal[
        "measured",
        "nominal",
        "derived",
        "not_reported",
        "not_applicable",
        "unresolved",
        "conflicting",
    ]
    source_locator: Identifier | None = None

    @model_validator(mode="after")
    def declared_value(self) -> ConditionValue:
        known = self.status in ("measured", "nominal", "derived")
        if known and (self.value is None or self.source_locator is None):
            raise ValueError("Known conditions require a value and source locator.")
        if not known and self.value is not None:
            raise ValueError("Unresolved/unknown conditions cannot masquerade as known values.")
        if self.status == "not_applicable" and (
            not self.source_locator or not self.reference_basis
        ):
            raise ValueError(
                "An inapplicable condition requires its source and domain justification."
            )
        if isinstance(self.value, str) and not self.value.strip():
            raise ValueError("An empty string is not a known scientific condition.")
        if isinstance(self.value, str):
            normalized = re.sub(r"[_\s-]+", " ", self.value.strip().casefold())
            if re.match(
                r"^(?:unknown|unresolved|unreported|not reported|not measured|not specified|"
                r"unspecified|not available|undetermined|missing|n/a|not applicable)"
                r"(?:$|[\s:;,()/])",
                normalized,
            ):
                raise ValueError(
                    "A missing or unresolved condition needs its explicit status, "
                    "not a known value."
                )
        if isinstance(self.value, float) and not self.unit:
            raise ValueError("A numeric condition requires a unit, including 1 for dimensionless.")
        return self


class RunProfile(ScientificInput):
    run_id: Identifier
    independent_unit_id: Identifier | None = None
    dependency_group_id: Identifier | None = None
    conditions: dict[str, ConditionValue] = Field(default_factory=dict, max_length=100)
    context: MethodContext


class ConditionRule(ScientificInput):
    field: Identifier
    critical: bool = Field(default=True, strict=True)
    absolute_tolerance: Nonnegative = 0.0
    tolerance_justification: Identifier | None = None
    difference_is_incompatible: bool = Field(default=True, strict=True)

    @model_validator(mode="after")
    def justified_tolerance(self) -> ConditionRule:
        if self.absolute_tolerance > 0 and not self.tolerance_justification:
            raise ValueError("A numeric matching tolerance requires a domain justification.")
        return self


class ComparisonRequest(ScientificInput):
    profiles: tuple[RunProfile, ...] = Field(min_length=2, max_length=100)
    rules: tuple[ConditionRule, ...] = Field(
        default_factory=lambda: tuple(ConditionRule(field=name) for name in CORE_COMPARISON_FIELDS),
        min_length=1,
        max_length=100,
    )
    pooling_protocol_reference: Identifier | None = None
    dependency_correction_reference: Identifier | None = None

    @model_validator(mode="after")
    def unique_fields(self) -> ComparisonRequest:
        if len({item.run_id for item in self.profiles}) != len(self.profiles):
            raise ValueError("Select distinct run IDs for comparison.")
        if len({rule.field for rule in self.rules}) != len(self.rules):
            raise ValueError("Condition rules must be unique.")
        return self


class ConditionDifference(ScientificInput):
    field: str
    status: ConditionStatus
    critical: bool
    values_by_run: dict[str, ConditionValue | None]
    explanation: str
    rule: ConditionRule


class ComparisonResult(ScientificInput):
    method_id: Literal["explicit-condition-comparison-v1"] = "explicit-condition-comparison-v1"
    status: ConditionStatus
    conditions: tuple[ConditionDifference, ...]
    suitability: dict[str, str]
    independent_unit_count: int | None
    limitations: tuple[str, ...]
    request: ComparisonRequest


def compare_profiles(request: ComparisonRequest) -> ComparisonResult:
    differences = []
    for rule in request.rules:
        values = {
            profile.run_id: profile.conditions.get(rule.field) for profile in request.profiles
        }
        selected = list(values.values())
        status: ConditionStatus
        if any(value is None or value.status == "not_reported" for value in selected):
            status, reason = "unknown", "At least one required condition is not reported."
        elif any(value.status in ("unresolved", "conflicting") for value in selected if value):
            status, reason = "unresolved", "Source interpretation or conflict is unresolved."
        else:
            known = [value for value in selected if value is not None]
            first = known[0]
            if any(
                value.unit != first.unit
                or value.reference_basis != first.reference_basis
                or value.status != first.status
                for value in known[1:]
            ):
                status, reason = (
                    "unresolved",
                    "Units, reference basis or measured/nominal/derived representations differ.",
                )
            else:
                raw = [value.value for value in known]
                if all(isinstance(value, float) for value in raw):
                    numeric = [value for value in raw if isinstance(value, float)]
                    matched = max(numeric) - min(numeric) <= rule.absolute_tolerance
                else:
                    matched = all(value == raw[0] for value in raw[1:])
                if matched:
                    status, reason = "matched", "Declared values match the explicit condition rule."
                else:
                    status = "incompatible" if rule.difference_is_incompatible else "different"
                    reason = "Declared values differ under the selected scientific condition rule."
        differences.append(
            ConditionDifference(
                field=rule.field,
                status=status,
                critical=rule.critical,
                values_by_run=values,
                explanation=reason,
                rule=rule,
            )
        )
    statuses = {difference.status for difference in differences}
    priority: tuple[ConditionStatus, ...] = ("incompatible", "unresolved", "unknown", "different")
    overall: ConditionStatus = next(
        (status for status in priority if status in statuses),
        "matched",
    )
    units = [profile.independent_unit_id for profile in request.profiles]
    independence_known = all(units) and len(set(units)) == len(units)
    groups = [profile.dependency_group_id for profile in request.profiles]
    group_structure_known = all(groups)
    shared_group = group_structure_known and len(set(groups)) != len(groups)
    by_field = {difference.field: difference for difference in differences}
    core_fields_checked = all(
        name in by_field and by_field[name].critical and by_field[name].status == "matched"
        for name in CORE_COMPARISON_FIELDS
    )
    critical_matched = all(
        difference.status == "matched" for difference in differences if difference.critical
    )
    can_pool = (
        critical_matched
        and core_fields_checked
        and independence_known
        and group_structure_known
        and (not shared_group or request.dependency_correction_reference is not None)
        and request.pooling_protocol_reference is not None
    )
    return ComparisonResult(
        status=overall,
        conditions=tuple(differences),
        suitability={
            "side_by_side": "supported_with_visible_condition_differences",
            "qualitative_synthesis": "requires_explicit_condition_limits",
            "common_calculation": "condition_compatible"
            if core_fields_checked and critical_matched
            else "not_established",
            "quantitative_pooling": "eligible_for_declared_protocol"
            if can_pool
            else "not_established",
        },
        independent_unit_count=len(units) if independence_known else None,
        limitations=(
            "Matching supplied conditions does not establish causal equivalence or certified "
            "safety.",
            "A table row, repeated frame or campaign name is not an independent experimental unit.",
            "Pooling needs complete core conditions, group identities and its own declared "
            "protocol.",
            "Only the supplied rules and source-anchored profiles were assessed.",
        ),
        request=request,
    )


POLICY_WEIGHTS: dict[str, dict[str, float]] = {
    "question-relevance-v1": {
        "question_outcome": 0.30,
        "material_geometry": 0.25,
        "environment": 0.25,
        "measurement": 0.10,
        "scale_protocol": 0.10,
    },
    "scenario-applicability-v1": {
        "endpoint": 0.25,
        "material_geometry": 0.20,
        "atmosphere": 0.20,
        "flow_gravity": 0.20,
        "apparatus_measurement": 0.15,
    },
}


class RankCandidate(ScientificInput):
    item_id: Identifier
    exact_filters_passed: bool = Field(strict=True)
    components: dict[str, Fraction | None] = Field(max_length=10)
    component_evidence: dict[str, str] = Field(max_length=10)
    critical_mismatches: tuple[str, ...] = ()
    evidence_support: Literal["supported", "limited", "conflicting", "unknown"] = "unknown"
    modeling_readiness: Literal["ready", "blocked", "unknown"] = "unknown"


class RankingRequest(ScientificInput):
    policy: Literal["question-relevance-v1", "scenario-applicability-v1"]
    candidates: tuple[RankCandidate, ...] = Field(max_length=10000)
    context: MethodContext

    @model_validator(mode="after")
    def valid_components(self) -> RankingRequest:
        fields = set(POLICY_WEIGHTS[self.policy])
        if len({candidate.item_id for candidate in self.candidates}) != len(self.candidates):
            raise ValueError("Ranking candidate IDs must be unique.")
        for candidate in self.candidates:
            if set(candidate.components) - fields or set(candidate.component_evidence) - fields:
                raise ValueError("A ranking component is outside the selected versioned policy.")
            for name, value in candidate.components.items():
                if value is not None and not candidate.component_evidence.get(name):
                    raise ValueError("A known component score requires its evidence/explanation.")
        return self


class RankedItem(ScientificInput):
    item_id: str
    score: Fraction | None
    known_weighted_contribution: Fraction
    maximum_with_unknown_components: Fraction
    known_weight_fraction: Fraction
    missing_components: tuple[str, ...]
    contributions: dict[str, float | None]
    critical_mismatches: tuple[str, ...]
    evidence_support: str
    modeling_readiness: str
    eligible_for_inference: bool


class RankingResult(ScientificInput):
    method_id: str
    origin: Literal["versioned_discovery_heuristic"] = "versioned_discovery_heuristic"
    context: MethodContext
    weights: dict[str, float]
    items: tuple[RankedItem, ...]
    excluded_ids: tuple[str, ...]
    ordering: str
    limitations: tuple[str, ...]


def rank_candidates(request: RankingRequest) -> RankingResult:
    weights = POLICY_WEIGHTS[request.policy]
    ranked, excluded = [], []
    for candidate in request.candidates:
        if not candidate.exact_filters_passed:
            excluded.append(candidate.item_id)
            continue
        contributions: dict[str, float | None] = {}
        for name, weight in weights.items():
            component = candidate.components.get(name)
            contributions[name] = weight * component if component is not None else None
        missing = tuple(name for name, value in contributions.items() if value is None)
        lower = sum(value for value in contributions.values() if value is not None)
        coverage = sum(weight for name, weight in weights.items() if name not in missing)
        # Clamp only floating-point summation noise at the representable 0/1 boundary.
        lower = min(1.0, max(0.0, lower))
        coverage = min(1.0, max(0.0, coverage))
        ranked.append(
            RankedItem(
                item_id=candidate.item_id,
                score=None if missing else lower,
                known_weighted_contribution=lower,
                maximum_with_unknown_components=min(1.0, lower + 1 - coverage),
                known_weight_fraction=coverage,
                missing_components=missing,
                contributions=contributions,
                critical_mismatches=candidate.critical_mismatches,
                evidence_support=candidate.evidence_support,
                modeling_readiness=candidate.modeling_readiness,
                eligible_for_inference=False,
            )
        )
    ranked.sort(key=lambda item: (-item.known_weighted_contribution, item.item_id))
    return RankingResult(
        method_id=request.policy,
        context=request.context,
        weights=dict(weights),
        items=tuple(ranked),
        excluded_ids=tuple(sorted(excluded)),
        ordering="Descending known weighted contribution; stable item ID breaks ties. "
        "Unknowns are not scored.",
        limitations=(
            "Scores are discovery heuristics, never safety probabilities or inference "
            "authorization.",
            "A high relevance score cannot override a critical condition mismatch or missing data.",
            "Missing components retain an interval of possible scores; no renormalization "
            "hides missingness.",
            "Evidence support and modeling readiness remain distinct from relevance/applicability.",
        ),
    )


class ScenarioPreset(ScientificInput):
    id: str
    title: str
    status: Literal["research_context", "hypothetical_research_example"]
    oxygen_percent: Finite | None = None
    absolute_pressure: Finite | None = None
    pressure_unit: str | None = None
    gravity_m_per_s2: Finite | None = None
    assumptions: tuple[str, ...]


def scenario_presets() -> tuple[ScenarioPreset, ...]:
    presets = [
        ScenarioPreset(
            id=identifier,
            title=title,
            status="research_context",
            assumptions=(
                "A research context, not an operational specification or universal atmosphere.",
                "Material, atmosphere, gravity history, ventilation and apparatus remain "
                "unspecified.",
            ),
        )
        for identifier, title in (
            ("spacecraft", "Spacecraft and station"),
            ("lunar", "Lunar research"),
            ("mars", "Mars research"),
            ("rover", "Rover"),
            ("suit", "Suit"),
            ("earth-transfer", "Earth transfer"),
        )
    ]
    presets.append(
        ScenarioPreset(
            id="illustrative-30-percent-10.2-psia",
            title="Illustrative oxygen-enriched reduced-pressure research atmosphere",
            status="hypothetical_research_example",
            oxygen_percent=30.0,
            absolute_pressure=10.2,
            pressure_unit="psia",
            assumptions=(
                "Hypothetical selected atmosphere: 30% oxygen by mole/ideal-gas volume at "
                "10.2 psia absolute.",
                "Not a universal mission standard; material, flow and gravity remain unspecified.",
            ),
        )
    )
    return tuple(presets)

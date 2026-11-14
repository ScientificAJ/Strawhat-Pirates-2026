import pytest
from nova_ember.analysis.applicability import POLICY_WEIGHTS, RankingRequest, rank_candidates
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "ranking policies"}],
}


def request(policy="question-relevance-v1", candidates=None):
    if candidates is None:
        candidates = [candidate("one", policy)]
    return RankingRequest.model_validate(
        {"policy": policy, "candidates": candidates, "context": CONTEXT}
    )


def candidate(identifier, policy="question-relevance-v1", **updates):
    data = {
        "item_id": identifier,
        "exact_filters_passed": True,
        "components": {name: 1.0 for name in POLICY_WEIGHTS[policy]},
        "component_evidence": {
            name: f"explicit evidence for {name}" for name in POLICY_WEIGHTS[policy]
        },
    }
    data.update(updates)
    return data


def test_question_policy_weights_match_preserved_plan():
    data = candidate("one")
    data["components"] = dict(
        zip(POLICY_WEIGHTS["question-relevance-v1"], [1.0, 0.8, 0.4, 0.5, 0.2], strict=True)
    )
    result = rank_candidates(request(candidates=[data]))
    assert result.items[0].score == pytest.approx(0.67)
    assert result.weights == {
        "question_outcome": 0.30,
        "material_geometry": 0.25,
        "environment": 0.25,
        "measurement": 0.10,
        "scale_protocol": 0.10,
    }


def test_scenario_policy_is_a_distinct_heuristic_not_a_renamed_question_score():
    policy = "scenario-applicability-v1"
    data = candidate("one", policy)
    data["components"] = dict(zip(POLICY_WEIGHTS[policy], [1.0, 0.8, 0.4, 0.5, 0.2], strict=True))
    result = rank_candidates(request(policy, [data]))
    assert result.items[0].score == pytest.approx(0.62)
    assert result.origin == "versioned_discovery_heuristic"


def test_missing_components_remain_unknown_not_renormalized_to_full_score():
    data = candidate("one")
    data["components"]["environment"] = None
    result = rank_candidates(request(candidates=[data]))
    item = result.items[0]
    assert item.score is None
    assert item.known_weight_fraction == 0.75
    assert item.known_weighted_contribution == 0.75
    assert item.maximum_with_unknown_components == 1.0
    assert item.missing_components == ("environment",)


def test_exact_filters_precede_scoring_and_ties_are_stable_by_id():
    candidates = [candidate("z"), candidate("excluded", exact_filters_passed=False), candidate("a")]
    result = rank_candidates(request(candidates=candidates))
    assert [item.item_id for item in result.items] == ["a", "z"]
    assert result.excluded_ids == ("excluded",)


def test_high_relevance_never_grants_inference_or_overrides_critical_mismatch():
    result = rank_candidates(
        request(
            candidates=[
                candidate(
                    "one",
                    critical_mismatches=["wrong endpoint"],
                    evidence_support="conflicting",
                    modeling_readiness="blocked",
                )
            ]
        )
    )
    item = result.items[0]
    assert item.score == 1.0
    assert not item.eligible_for_inference
    assert item.critical_mismatches == ("wrong endpoint",)
    assert item.evidence_support == "conflicting"
    assert item.modeling_readiness == "blocked"


def test_unrecognized_components_and_unexplained_scores_are_rejected():
    data = candidate("one")
    data["components"]["universal_safety"] = 0.8
    with pytest.raises(ValidationError, match="outside"):
        request(candidates=[data])
    data = candidate("one")
    data["component_evidence"] = {}
    with pytest.raises(ValidationError, match="evidence"):
        request(candidates=[data])

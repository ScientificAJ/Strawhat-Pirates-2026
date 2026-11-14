import copy

import pytest
from nova_ember.modeling.regression import (
    CONDITION_FIELDS,
    RegressionRequest,
    evaluate_regression,
    predict_regression,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "y = 2x + 1"}],
}


def request_data(qualified=True):
    conditions = {name: f"defined-{name}" for name in CONDITION_FIELDS}
    conditions["endpoint"] = "speed"
    conditions["protocol"] = "analytical-reference-protocol-v1"
    protocol = {
        "protocol_id": "analytical-reference-protocol-v1",
        "prespecification_reference": "frozen analytical test protocol",
        "endpoint": "speed",
        "endpoint_unit": "m/s",
        "predictor": "condition x",
        "predictor_unit": "1",
        "target_use": "known analytical reference, not NASA prediction",
        "exclusion_policy": "one outcome per independent group; no exclusions",
        "grouping_dimensions": ["campaign", "specimen", "publication"],
        "fixed_conditions": dict(conditions),
        "minimum_training_groups": 3,
        "minimum_held_out_groups": 2,
        "sample_size_justification": "Finite analytical reference for implementation "
        "verification only",
        "maximum_held_out_rmse": 0.2,
        "maximum_absolute_bias": 0.1,
        "minimum_rmse_improvement_fraction": 0.1,
        "error_model": "independent_normal_residuals",
    }
    if qualified:
        protocol.update(
            {
                "uncertainty_assessment_reference": "independent analytic interval check",
                "residual_review_reference": "known exact residual reference",
                "independent_validation_reference": "frozen analytical validation",
            }
        )
    observations = []
    for index, (x, split) in enumerate(
        [
            (0.0, "training"),
            (1.0, "training"),
            (2.0, "training"),
            (3.0, "training"),
            (0.5, "held_out"),
            (2.5, "held_out"),
        ]
    ):
        observations.append(
            {
                "independent_unit_id": f"unit{index}",
                "investigation_id": "analytical reference",
                "groups": {name: f"{name}{index}" for name in protocol["grouping_dimensions"]},
                "split": split,
                "predictor_value": x,
                "endpoint_value": 2 * x + 1,
                "conditions": dict(conditions),
                "source_locator": f"analytical-point:{index}",
            }
        )
    return {"protocol": protocol, "observations": observations, "context": CONTEXT}


def test_one_predictor_fit_uses_training_only_and_held_out_physical_unit_metrics():
    request = RegressionRequest.model_validate(request_data())
    result = evaluate_regression(request)
    assert result.status == "eligible_for_registration"
    assert result.slope == 2.0
    assert result.intercept_at_training_predictor_mean == 4.0
    assert result.training_predictor_mean == 1.5
    assert result.training_count == 4
    assert result.held_out_count == 2
    assert result.training_group_count == 4
    assert result.held_out_group_count == 2
    assert result.held_out_metrics.root_mean_square_error == 0.0
    assert result.held_out_baseline_metrics.root_mean_square_error == 2.0
    assert result.held_out_metrics.unit == "m/s"
    assert len(result.card_sha256) == 64
    assert result.context.input_origin == "synthetic_reference"


def test_even_qualified_candidate_cannot_predict_without_server_registration():
    request = RegressionRequest.model_validate(request_data())
    card = evaluate_regression(request)
    result = predict_regression(
        card, 1.5, request.protocol.fixed_conditions, request.context, accepted_registration_id=None
    )
    assert result.status == "unsupported"
    assert result.value is None


def test_registered_analytical_reference_predicts_only_inside_exact_joint_domain():
    request = RegressionRequest.model_validate(request_data())
    card = evaluate_regression(request)
    result = predict_regression(
        card,
        1.5,
        request.protocol.fixed_conditions,
        request.context,
        accepted_registration_id="server-record:analytical-reference",
    )
    assert result.status == "predicted"
    assert result.value == 4.0
    assert result.unit == "m/s"
    assert result.interval.lower == result.interval.upper == 4.0
    assert result.origin == "model_prediction"
    result = predict_regression(
        card,
        3.1,
        request.protocol.fixed_conditions,
        request.context,
        accepted_registration_id="server-record:analytical-reference",
    )
    assert result.status == "outside_validated_domain"
    assert result.value is None
    changed = {**request.protocol.fixed_conditions, "material": "different material"}
    result = predict_regression(
        card,
        1.5,
        changed,
        request.context,
        accepted_registration_id="server-record:analytical-reference",
    )
    assert result.status == "outside_validated_domain"
    assert result.value is None


def test_missing_uncertainty_or_independent_validation_stays_experimental():
    result = evaluate_regression(RegressionRequest.model_validate(request_data(qualified=False)))
    assert result.status == "experimental_candidate"
    assert len(result.qualification_failures) == 3
    assert any(
        "independent_validation_reference" in reason for reason in result.qualification_failures
    )


def test_duplicate_independent_units_and_condition_mismatches_rejected():
    data = request_data()
    data["observations"][1]["independent_unit_id"] = data["observations"][0]["independent_unit_id"]
    with pytest.raises(ValidationError, match="one endpoint"):
        RegressionRequest.model_validate(data)
    data = request_data()
    data["observations"][1]["conditions"] = {
        **data["observations"][1]["conditions"],
        "endpoint": "another endpoint",
    }
    with pytest.raises(ValidationError, match="domain"):
        RegressionRequest.model_validate(data)


def test_no_shared_dependency_can_cross_the_frozen_split_including_transitive_links():
    data = request_data()
    data["observations"][4]["groups"]["specimen"] = data["observations"][0]["groups"]["specimen"]
    with pytest.raises(ValueError, match="crosses"):
        evaluate_regression(RegressionRequest.model_validate(data))
    data = request_data()
    # Publication connects unit0 to unit1; specimen connects unit1 to held-out unit4.
    data["observations"][1]["groups"]["publication"] = data["observations"][0]["groups"][
        "publication"
    ]
    data["observations"][4]["groups"]["specimen"] = data["observations"][1]["groups"]["specimen"]
    with pytest.raises(ValueError, match="crosses"):
        evaluate_regression(RegressionRequest.model_validate(data))


def test_frames_or_many_rows_in_one_campaign_cannot_meet_group_requirement():
    data = request_data()
    for item in data["observations"][:4]:
        item["groups"]["campaign"] = "one shared campaign"
    result = evaluate_regression(RegressionRequest.model_validate(data))
    assert result.status == "needs_data"
    assert result.value is None


def test_held_out_scores_do_not_change_the_training_fit_or_preprocessing():
    first = request_data()
    altered = copy.deepcopy(first)
    altered["observations"][4]["endpoint_value"] = 100.0
    a = evaluate_regression(RegressionRequest.model_validate(first))
    b = evaluate_regression(RegressionRequest.model_validate(altered))
    assert a.slope == b.slope == 2.0
    assert a.training_predictor_mean == b.training_predictor_mean == 1.5
    assert a.intercept_at_training_predictor_mean == b.intercept_at_training_predictor_mean == 4.0
    assert b.status == "experimental_candidate"
    assert b.held_out_metrics.root_mean_square_error > 60.0
    assert a.card_sha256 != b.card_sha256


def test_cross_investigation_claim_needs_wholly_held_out_investigations():
    data = request_data()
    data["protocol"]["cross_investigation_claim"] = True
    result = evaluate_regression(RegressionRequest.model_validate(data))
    assert result.status == "experimental_candidate"
    assert any("held-out investigations" in reason for reason in result.qualification_failures)


def test_mutating_card_outputs_or_nested_provenance_breaks_immutable_digest():
    request = RegressionRequest.model_validate(request_data())
    card = evaluate_regression(request)
    altered = card.model_copy(update={"slope": 999.0})
    with pytest.raises(ValueError, match="immutable digest"):
        predict_regression(
            altered,
            1.5,
            request.protocol.fixed_conditions,
            request.context,
            accepted_registration_id="server-record",
        )


@pytest.mark.parametrize(
    "field",
    [
        "gravity",
        "oxygen_fraction",
        "pressure",
        "flow_velocity",
        "regime",
        "reference_units_location",
    ],
)
def test_missing_scientific_domain_cannot_qualify_a_protocol(field):
    data = request_data()
    del data["protocol"]["fixed_conditions"][field]
    with pytest.raises(ValidationError, match="every scientific domain"):
        RegressionRequest.model_validate(data)


@pytest.mark.parametrize("value", ["unknown", "unresolved", "not_reported", "unknown: source", " "])
def test_unknown_condition_is_not_a_known_fixed_domain(value):
    data = request_data()
    data["protocol"]["fixed_conditions"]["gravity"] = value
    with pytest.raises(ValidationError, match="Unknown or unresolved"):
        RegressionRequest.model_validate(data)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("gravity", "Martian partial gravity"),
        ("oxygen_fraction", "1"),
        ("pressure", "1000 bar"),
        ("unmodelled_condition", "another scientific regime"),
    ],
)
def test_unvalidated_gravity_atmosphere_or_extra_condition_has_no_prediction(field, value):
    request = RegressionRequest.model_validate(request_data())
    card = evaluate_regression(request)
    conditions = {**request.protocol.fixed_conditions, field: value}
    result = predict_regression(
        card, 1.5, conditions, request.context, accepted_registration_id="server-reference"
    )
    assert result.status == "outside_validated_domain"
    assert result.value is None


def test_observation_conditions_reject_extra_fields_and_unknown_values():
    for field, value in [("unmodelled_condition", "unvalidated"), ("gravity", "unknown")]:
        data = request_data()
        data["observations"][0]["conditions"][field] = value
        with pytest.raises(ValidationError, match="full scientific domain"):
            RegressionRequest.model_validate(data)


def non_applicable_data():
    data = request_data()
    data["protocol"]["fixed_conditions"]["backing"] = "not_applicable"
    data["protocol"]["not_applicable_conditions"] = {
        "backing": {
            "justification": "Synthetic free-standing specimen reference has no backing.",
            "source": copy.deepcopy(CONTEXT["sources"][0]),
        }
    }
    for item in data["observations"]:
        item["conditions"]["backing"] = "not_applicable"
    return data


def test_non_applicability_requires_specific_source_context_not_an_unknown_default():
    data = non_applicable_data()
    request = RegressionRequest.model_validate(data)
    assert evaluate_regression(request).status == "eligible_for_registration"
    data["protocol"].pop("not_applicable_conditions")
    with pytest.raises(ValidationError, match="source justification"):
        RegressionRequest.model_validate(data)
    data = non_applicable_data()
    data["protocol"]["not_applicable_conditions"]["backing"]["source"]["locator"] = "uncited page"
    with pytest.raises(ValidationError, match="source context"):
        RegressionRequest.model_validate(data)
    data = non_applicable_data()
    data["context"] = {**data["context"], "input_origin": "measured"}
    with pytest.raises(ValidationError, match="hash-linked physical source"):
        RegressionRequest.model_validate(data)


def test_critical_endpoint_identity_cannot_be_declared_non_applicable():
    data = non_applicable_data()
    data["protocol"]["fixed_conditions"]["regime"] = "not_applicable"
    data["protocol"]["not_applicable_conditions"]["regime"] = copy.deepcopy(
        data["protocol"]["not_applicable_conditions"]["backing"]
    )
    with pytest.raises(ValidationError, match="source justification"):
        RegressionRequest.model_validate(data)


def varying_predictor_data():
    data = request_data()
    data["protocol"].update(
        predictor="flow velocity", predictor_unit="m/s", predictor_condition="flow_velocity"
    )
    del data["protocol"]["fixed_conditions"]["flow_velocity"]
    for item in data["observations"]:
        item["conditions"]["flow_velocity"] = str(item["predictor_value"])
    return data


def test_one_physical_predictor_varies_without_being_falsely_fixed():
    request = RegressionRequest.model_validate(varying_predictor_data())
    card = evaluate_regression(request)
    assert card.status == "eligible_for_registration"
    assert card.slope == 2.0
    result = predict_regression(
        card,
        1.5,
        {**request.protocol.fixed_conditions, "flow_velocity": "1.5"},
        request.context,
        accepted_registration_id="server-reference",
    )
    assert result.status == "predicted"
    assert result.value == 4.0
    for value in ("2.5", "1.5 m/s", "unknown"):
        result = predict_regression(
            card,
            1.5,
            {**request.protocol.fixed_conditions, "flow_velocity": value},
            request.context,
            accepted_registration_id="server-reference",
        )
        assert result.status == "outside_validated_domain"
        assert result.value is None


def test_varying_predictor_cannot_have_a_fixed_or_mismatched_condition():
    data = varying_predictor_data()
    data["protocol"]["fixed_conditions"]["flow_velocity"] = "1.5"
    with pytest.raises(ValidationError, match="cannot also be fixed"):
        RegressionRequest.model_validate(data)
    data = varying_predictor_data()
    data["observations"][0]["conditions"]["flow_velocity"] = "999"
    with pytest.raises(ValidationError, match="full scientific domain"):
        RegressionRequest.model_validate(data)

import math

import pytest
from nova_ember.analysis.uncertainty import (
    InformationGainRequest,
    LinearUncertaintyRequest,
    MonteCarloRequest,
    expected_information_gain,
    propagate_linear,
    propagate_monte_carlo,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "known covariance"}],
}


def linear_request(**updates):
    data = {
        "input_estimates": [1.0, 2.0],
        "input_units": ["m", "m"],
        "covariance": [[0.04, 0.01], [0.01, 0.09]],
        "jacobian": [[2.0, 3.0]],
        "output_units": ["m"],
        "covariance_reference": "known covariance matrix",
        "jacobian_definition": "y = 2x1 + 3x2",
        "linearization_justification": "Exactly linear function",
        "uncertainty_kind": "measurement",
        "context": CONTEXT,
    }
    data.update(updates)
    return LinearUncertaintyRequest.model_validate(data)


def test_correlated_uncertainty_matches_known_matrix_product():
    result = propagate_linear(linear_request())
    assert result.output_covariance[0][0] == pytest.approx(1.09)
    assert result.output_standard_uncertainty[0] == pytest.approx(math.sqrt(1.09))
    result = propagate_linear(
        linear_request(jacobian=[[2.0, 0.0], [0.0, 3.0]], output_units=["m", "m"])
    )
    assert result.output_covariance[0] == pytest.approx((0.16, 0.06))
    assert result.output_covariance[1] == pytest.approx((0.06, 0.81))


@pytest.mark.parametrize(
    "covariance",
    [
        [[1.0, 2.0], [2.0, 1.0]],
        [[1.0, 0.5], [0.0, 1.0]],
        [[-1.0, 0.0], [0.0, 1.0]],
        [[1.0]],
        [[math.inf, 0.0], [0.0, 1.0]],
    ],
)
def test_invalid_covariance_is_not_repaired_or_assumed_independent(covariance):
    with pytest.raises(ValidationError):
        linear_request(covariance=covariance)


def test_sensitivity_ranges_do_not_become_measurement_uncertainty():
    result = propagate_linear(linear_request(uncertainty_kind="analyst_sensitivity"))
    assert "not measured uncertainty" in result.interpretation


def mc_request(**updates):
    data = {
        "function": "product",
        "input_means": [2.0, 3.0],
        "input_units": ["m", "m"],
        "covariance": [[0.04, 0.0], [0.0, 0.09]],
        "distribution_justification": "Independent known Gaussian analytical reference",
        "covariance_reference": "specified reference",
        "uncertainty_kind": "measurement",
        "sample_count": 100000,
        "seed": 314159,
        "context": CONTEXT,
    }
    data.update(updates)
    return MonteCarloRequest.model_validate(data)


def test_monte_carlo_product_matches_independent_analytical_moments_and_repeats():
    request = mc_request()
    first = propagate_monte_carlo(request)
    second = propagate_monte_carlo(request)
    # E[XY]=6; Var(XY)=4*.09 + 9*.04 + .04*.09 = .7236.
    assert first.value == pytest.approx(6.0, abs=0.01)
    assert first.standard_deviation == pytest.approx(math.sqrt(0.7236), rel=0.01)
    assert first.model_dump() == second.model_dump()
    assert first.converged
    assert first.numpy_version
    assert first.generator == "PCG64"
    assert first.central_output_interval.lower < first.value < first.central_output_interval.upper


def test_monte_carlo_zero_covariance_is_a_deterministic_point_not_random_error_bar():
    result = propagate_monte_carlo(
        mc_request(covariance=[[0.0, 0.0], [0.0, 0.0]], sample_count=1000)
    )
    assert result.value == 6.0
    assert result.standard_deviation == 0.0
    assert result.central_output_interval.lower == result.central_output_interval.upper == 6.0
    assert result.converged


def test_invalid_physical_draws_are_not_clipped_or_silently_resampled():
    request = mc_request(
        function="oxygen_partial_pressure",
        input_means=[0.5, 100000.0],
        input_units=["1", "Pa"],
        covariance=[[1.0, 0.0], [0.0, 1.0]],
        sample_count=1000,
    )
    with pytest.raises(ValueError, match="invalid composition"):
        propagate_monte_carlo(request)


def test_monte_carlo_function_is_a_closed_registry_not_arbitrary_expression():
    with pytest.raises(ValidationError):
        mc_request(function="__import__('os').system('anything')")
    with pytest.raises(ValidationError):
        mc_request(sample_count=100001)


def info_request(**updates):
    data = {
        "hypotheses": ["H1", "H2"],
        "outcomes": ["O1", "O2"],
        "prior": [0.5, 0.5],
        "outcome_likelihood_by_hypothesis": [[1.0, 0.0], [0.0, 1.0]],
        "probabilistic_model_justification": "Analytical distinguishable-hypothesis reference",
        "context": CONTEXT,
    }
    data.update(updates)
    return InformationGainRequest.model_validate(data)


def test_perfect_discriminator_has_one_bit_and_uninformative_observation_zero():
    informative = expected_information_gain(info_request())
    assert informative.expected_information_gain_bits == 1.0
    assert informative.posterior_by_outcome == ((1.0, 0.0), (0.0, 1.0))
    uninformative = expected_information_gain(
        info_request(outcome_likelihood_by_hypothesis=[[0.5, 0.5], [0.5, 0.5]])
    )
    assert uninformative.expected_information_gain_bits == 0.0
    assert uninformative.posterior_by_outcome == ((0.5, 0.5), (0.5, 0.5))


def test_probabilities_must_be_defensible_normalized_inputs():
    with pytest.raises(ValidationError, match="sum to one"):
        info_request(prior=[0.2, 0.2])


def test_large_variance_cannot_hide_invalid_zero_or_small_variance_covariance():
    with pytest.raises(ValidationError, match="zero-variance"):
        linear_request(covariance=[[0.0, 1e-16], [1e-16, 1.0]])
    with pytest.raises(ValidationError, match="standard-uncertainty product"):
        linear_request(covariance=[[1e-300, 2.0], [2.0, 1e300]])
    result = propagate_linear(
        linear_request(
            covariance=[[1e-300, 0.5], [0.5, 1e300]],
            jacobian=[[1e150, 1e-150]],
        )
    )
    assert result.output_covariance[0][0] == pytest.approx(3.0)

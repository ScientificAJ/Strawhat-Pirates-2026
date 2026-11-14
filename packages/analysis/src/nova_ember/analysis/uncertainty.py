"""Correlated uncertainty propagation for declared, bounded analytical functions."""

from __future__ import annotations

from typing import Literal

import numpy as np
from nova_ember.domain.scientific import (
    Finite,
    Fraction,
    Identifier,
    Interval,
    MethodContext,
    Nonnegative,
    ScientificInput,
)
from pydantic import Field, model_validator

from .derived import GAS_CONSTANT_J_PER_MOL_K

UncertaintyKind = Literal["measurement", "parameter", "analyst_sensitivity"]


def checked_covariance(values: tuple[tuple[float, ...], ...], size: int) -> np.ndarray:
    if len(values) != size or any(len(row) != size for row in values):
        raise ValueError("Covariance shape must match the declared inputs.")
    matrix = np.array(values, dtype=float)
    if not np.all(np.isfinite(matrix)):
        raise ValueError("Covariance entries must be finite.")
    if np.any(np.diag(matrix) < 0):
        raise ValueError("Variances cannot be negative.")
    diagonal = np.diag(matrix)
    zero_variance = diagonal == 0
    if np.any(matrix[zero_variance, :] != 0) or np.any(matrix[:, zero_variance] != 0):
        raise ValueError("A zero-variance input cannot have nonzero covariance.")
    positive = np.flatnonzero(diagonal > 0)
    if not positive.size:
        return matrix
    # Check correlation scale so a large variance cannot hide an invalid small-variance block.
    standard = np.sqrt(diagonal[positive].astype(np.longdouble))
    wide_covariance = matrix[np.ix_(positive, positive)].astype(np.longdouble)
    normalized = wide_covariance / standard[:, None] / standard[None, :]
    tolerance = np.finfo(float).eps * size * 16
    if np.max(np.abs(normalized)) > 1 + tolerance:
        raise ValueError("Covariance exceeds the corresponding standard-uncertainty product.")
    correlation = normalized.astype(float)
    if np.max(np.abs(correlation - correlation.T)) > tolerance:
        raise ValueError("A covariance matrix must be symmetric.")
    if float(np.linalg.eigvalsh(correlation).min()) < -tolerance:
        raise ValueError("A covariance matrix must be positive semidefinite.")
    return matrix


class LinearUncertaintyRequest(ScientificInput):
    input_estimates: tuple[Finite, ...] = Field(min_length=1, max_length=64)
    input_units: tuple[Identifier, ...] = Field(min_length=1, max_length=64)
    covariance: tuple[tuple[Finite, ...], ...] = Field(min_length=1, max_length=64)
    jacobian: tuple[tuple[Finite, ...], ...] = Field(min_length=1, max_length=64)
    output_units: tuple[Identifier, ...] = Field(min_length=1, max_length=64)
    covariance_reference: Identifier
    jacobian_definition: Identifier
    linearization_justification: Identifier
    uncertainty_kind: UncertaintyKind
    context: MethodContext

    @model_validator(mode="after")
    def dimensions(self) -> LinearUncertaintyRequest:
        size = len(self.input_estimates)
        if len(self.input_units) != size:
            raise ValueError("Each input estimate needs a unit.")
        if len(self.jacobian) != len(self.output_units):
            raise ValueError("Each Jacobian output needs a unit.")
        if any(len(row) != size for row in self.jacobian):
            raise ValueError("Jacobian columns must match input estimates.")
        checked_covariance(self.covariance, size)
        return self


class LinearUncertaintyResult(ScientificInput):
    status: Literal["calculated"] = "calculated"
    method_id: Literal["first-order-correlated-uncertainty-v1"] = (
        "first-order-correlated-uncertainty-v1"
    )
    context: MethodContext
    request: LinearUncertaintyRequest
    output_covariance: tuple[tuple[Finite, ...], ...]
    output_standard_uncertainty: tuple[Nonnegative, ...]
    definition: Literal["Sigma_output = J Sigma_input J^T"] = "Sigma_output = J Sigma_input J^T"
    interpretation: str
    limitations: tuple[str, ...]


def propagate_linear(request: LinearUncertaintyRequest) -> LinearUncertaintyResult:
    covariance = checked_covariance(request.covariance, len(request.input_estimates))
    jacobian = np.array(request.jacobian)
    with np.errstate(over="raise", invalid="raise"):
        try:
            output = jacobian @ covariance @ jacobian.T
        except FloatingPointError:
            raise ValueError("Propagated covariance exceeds finite numerical range.") from None
    if not np.all(np.isfinite(output)):
        raise ValueError("Propagated covariance must be finite.")
    if np.any(np.diag(output) < 0):
        raise ValueError("Numerical cancellation produced negative variance; rescale the inputs.")
    return LinearUncertaintyResult(
        context=request.context,
        request=request,
        output_covariance=tuple(tuple(float(value) for value in row) for row in output),
        output_standard_uncertainty=tuple(float(np.sqrt(value)) for value in np.diag(output)),
        interpretation=(
            "Analyst-declared sensitivity distribution; not measured uncertainty."
            if request.uncertainty_kind == "analyst_sensitivity"
            else f"First-order propagation of the supplied {request.uncertainty_kind} covariance."
        ),
        limitations=(
            "Validity depends on the supplied Jacobian, covariance and linearization "
            "justification.",
            "No unreported measurement uncertainty, run variability or model discrepancy is "
            "inferred.",
        ),
    )


FunctionName = Literal["product", "ratio", "oxygen_partial_pressure", "oxygen_molar_density"]
FUNCTION_INPUTS = {
    "product": ("left", "right"),
    "ratio": ("numerator", "denominator"),
    "oxygen_partial_pressure": ("oxygen_mole_fraction", "absolute_pressure_pa"),
    "oxygen_molar_density": (
        "oxygen_mole_fraction",
        "absolute_pressure_pa",
        "temperature_kelvin",
    ),
}
FUNCTION_UNITS = {
    "product": "product of supplied input units",
    "ratio": "ratio of supplied input units",
    "oxygen_partial_pressure": "Pa",
    "oxygen_molar_density": "mol/m^3",
}


class MonteCarloRequest(ScientificInput):
    function: FunctionName
    input_means: tuple[Finite, ...] = Field(min_length=2, max_length=3)
    input_units: tuple[Identifier, ...] = Field(min_length=2, max_length=3)
    covariance: tuple[tuple[Finite, ...], ...] = Field(min_length=2, max_length=3)
    distribution: Literal["multivariate_normal"] = "multivariate_normal"
    distribution_justification: Identifier
    covariance_reference: Identifier
    uncertainty_kind: UncertaintyKind
    sample_count: int = Field(default=20000, strict=True, ge=1000, le=100000)
    seed: int = Field(strict=True, ge=0, le=2**32 - 1)
    interval_level: float = Field(default=0.95, strict=True, gt=0, lt=1, allow_inf_nan=False)
    relative_std_convergence_tolerance: float = Field(
        default=0.05, strict=True, gt=0, le=0.5, allow_inf_nan=False
    )
    mean_mcse_multiplier: float = Field(default=4.0, strict=True, gt=0, le=10, allow_inf_nan=False)
    context: MethodContext

    @model_validator(mode="after")
    def dimensions(self) -> MonteCarloRequest:
        size = len(FUNCTION_INPUTS[self.function])
        if len(self.input_means) != size or len(self.input_units) != size:
            raise ValueError("Input means/units must match the registered function's named inputs.")
        if self.function in ("oxygen_partial_pressure", "oxygen_molar_density"):
            expected_units = ("1", "Pa", "K")[:size]
            if self.input_units != expected_units:
                raise ValueError("Registered oxygen propagation requires mole fraction, Pa and K.")
        checked_covariance(self.covariance, size)
        denominator_index = {"ratio": 1, "oxygen_molar_density": 2}.get(self.function)
        if denominator_index is not None:
            if self.covariance[denominator_index][denominator_index] != 0:
                raise ValueError(
                    "This moments-based propagation requires a fixed denominator: a Gaussian "
                    "denominator with nonzero variance does not generally give finite ratio "
                    "moments. A bounded justified distribution needs a separate method."
                )
            if self.input_means[denominator_index] == 0:
                raise ValueError("A fixed denominator must be nonzero.")
        return self


class MonteCarloResult(ScientificInput):
    status: Literal["calculated", "not_converged"]
    method_id: Literal["registered-function-monte-carlo-v1"] = "registered-function-monte-carlo-v1"
    context: MethodContext
    request: MonteCarloRequest
    input_order: tuple[str, ...]
    value: Finite
    unit: str
    standard_deviation: Nonnegative
    central_output_interval: Interval
    first_half_mean: Finite
    second_half_mean: Finite
    relative_std_difference: Nonnegative
    converged: bool
    numpy_version: str
    generator: Literal["PCG64"] = "PCG64"
    interpretation: str
    limitations: tuple[str, ...]


def registered_function_values(function: FunctionName, samples: np.ndarray) -> np.ndarray:
    """Evaluate only named methods; no expression, source code or filesystem is accepted."""
    with np.errstate(over="raise", divide="raise", invalid="raise"):
        try:
            if function == "product":
                result = samples[:, 0] * samples[:, 1]
            elif function == "ratio":
                result = samples[:, 0] / samples[:, 1]
            else:
                if np.any((samples[:, 0] < 0) | (samples[:, 0] > 1) | (samples[:, 1] <= 0)):
                    raise ValueError(
                        "Declared distribution includes invalid composition or pressure."
                    )
                result = samples[:, 0] * samples[:, 1]
                if function == "oxygen_molar_density":
                    if np.any(samples[:, 2] <= 0):
                        raise ValueError("Declared distribution includes nonpositive temperature.")
                    result = result / (GAS_CONSTANT_J_PER_MOL_K * samples[:, 2])
        except FloatingPointError:
            raise ValueError(
                "Propagation reached a singularity or non-finite numeric range."
            ) from None
    if not np.all(np.isfinite(result)):
        raise ValueError("Registered function output must be finite for every drawn input.")
    return result


def propagate_monte_carlo(request: MonteCarloRequest) -> MonteCarloResult:
    covariance = checked_covariance(request.covariance, len(request.input_means))
    generator = np.random.Generator(np.random.PCG64(request.seed))
    samples = generator.multivariate_normal(
        request.input_means, covariance, size=request.sample_count, check_valid="raise"
    )
    outputs = registered_function_values(request.function, samples)
    split = request.sample_count // 2
    halves = outputs[:split], outputs[split:]
    half_means = tuple(float(values.mean()) for values in halves)
    half_std = tuple(float(values.std(ddof=1)) for values in halves)
    std = float(outputs.std(ddof=1))
    relative = abs(half_std[0] - half_std[1]) / std if std > 0 else 0.0
    mean_error = np.sqrt(half_std[0] ** 2 / len(halves[0]) + half_std[1] ** 2 / len(halves[1]))
    converged = bool(
        abs(half_means[0] - half_means[1]) <= request.mean_mcse_multiplier * mean_error
        and relative <= request.relative_std_convergence_tolerance
    )
    tail = (1 - request.interval_level) / 2
    lower, upper = np.quantile(outputs, [tail, 1 - tail])
    return MonteCarloResult(
        status="calculated" if converged else "not_converged",
        context=request.context,
        request=request,
        input_order=FUNCTION_INPUTS[request.function],
        value=float(outputs.mean()),
        unit=FUNCTION_UNITS[request.function],
        standard_deviation=std,
        central_output_interval=Interval(
            lower=float(lower),
            upper=float(upper),
            level=request.interval_level,
            interpretation="Central output probability interval conditional on the declared "
            "inputs; "
            "not a confidence interval for scientific truth.",
        ),
        first_half_mean=half_means[0],
        second_half_mean=half_means[1],
        relative_std_difference=relative,
        converged=converged,
        numpy_version=np.__version__,
        interpretation=(
            "Analyst sensitivity, not measured uncertainty."
            if request.uncertainty_kind == "analyst_sensitivity"
            else f"Propagation of declared {request.uncertainty_kind} distributions."
        ),
        limitations=(
            "No samples were clipped, repaired or silently discarded.",
            "Half-sample mean/std agreement is a diagnostic, not proof of tail convergence.",
            "A seed alone does not guarantee reproducibility across runtime/library versions.",
        ),
    )


class InformationGainRequest(ScientificInput):
    hypotheses: tuple[Identifier, ...] = Field(min_length=2, max_length=100)
    outcomes: tuple[Identifier, ...] = Field(min_length=2, max_length=100)
    prior: tuple[Fraction, ...] = Field(min_length=2, max_length=100)
    outcome_likelihood_by_hypothesis: tuple[tuple[Fraction, ...], ...]
    probabilistic_model_justification: Identifier
    context: MethodContext

    @model_validator(mode="after")
    def probabilities(self) -> InformationGainRequest:
        if len(set(self.hypotheses)) != len(self.hypotheses):
            raise ValueError("Hypothesis IDs must be unique.")
        if len(set(self.outcomes)) != len(self.outcomes):
            raise ValueError("Outcome IDs must be unique.")
        if len(self.prior) != len(self.hypotheses):
            raise ValueError("Each hypothesis needs a prior probability.")
        rows = self.outcome_likelihood_by_hypothesis
        if len(rows) != len(self.hypotheses) or any(len(row) != len(self.outcomes) for row in rows):
            raise ValueError("Likelihood rows/columns must match hypotheses/outcomes.")
        # Floating-point summation tolerance for at most 100 normalized probabilities.
        tolerance = 128 * np.finfo(float).eps
        if abs(sum(self.prior) - 1) > tolerance or any(
            abs(sum(row) - 1) > tolerance for row in rows
        ):
            raise ValueError("Prior and each conditional likelihood row must sum to one.")
        return self


class InformationGainResult(ScientificInput):
    status: Literal["calculated"] = "calculated"
    method_id: Literal["discrete-expected-information-gain-v1"] = (
        "discrete-expected-information-gain-v1"
    )
    context: MethodContext
    request: InformationGainRequest
    expected_information_gain_bits: Nonnegative
    prior_entropy_bits: Nonnegative
    outcome_probabilities: tuple[Fraction, ...]
    posterior_by_outcome: tuple[tuple[Fraction, ...] | None, ...]
    limitations: tuple[str, ...]


def expected_information_gain(request: InformationGainRequest) -> InformationGainResult:
    prior = np.array(request.prior)
    likelihood = np.array(request.outcome_likelihood_by_hypothesis)
    # Normalize only accepted floating-point summation noise; raw probabilities remain in request.
    prior = prior / prior.sum()
    likelihood = likelihood / likelihood.sum(axis=1, keepdims=True)
    outcome_probability = prior @ likelihood

    def entropy(probabilities: np.ndarray) -> float:
        positive = probabilities[probabilities > 0]
        return float(-np.sum(positive * np.log2(positive)))

    initial_entropy = entropy(prior)
    posterior: list[tuple[float, ...] | None] = []
    final_entropy = 0.0
    for index, probability in enumerate(outcome_probability):
        if probability == 0:
            posterior.append(None)
        else:
            distribution = prior * likelihood[:, index] / probability
            posterior.append(tuple(float(value) for value in distribution))
            final_entropy += float(probability) * entropy(distribution)
    return InformationGainResult(
        context=request.context,
        request=request,
        expected_information_gain_bits=max(0.0, initial_entropy - final_entropy),
        prior_entropy_bits=initial_entropy,
        outcome_probabilities=tuple(float(value) for value in outcome_probability),
        posterior_by_outcome=tuple(posterior),
        limitations=(
            "Conditional on the justified supplied probabilistic model, not an empirical "
            "certainty.",
            "Scientific feasibility, cost, safety and falsifiers remain separate design "
            "considerations.",
        ),
    )

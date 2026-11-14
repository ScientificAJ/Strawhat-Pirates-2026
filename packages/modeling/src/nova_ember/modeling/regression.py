"""Fixed one-predictor OLS; held-out groups qualify a candidate, never an automatic release."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Literal

import numpy as np
from nova_ember.domain.scientific import (
    COMPARISON_FIELDS,
    EvidenceReference,
    Finite,
    Identifier,
    Interval,
    MethodContext,
    Nonnegative,
    Positive,
    Refusal,
    ScientificInput,
)
from pydantic import Field, model_validator
from scipy.stats import t as student_t  # type: ignore[import-untyped]

CONDITION_FIELDS = (*COMPARISON_FIELDS, "reference_units_location", "regime")
PREDICTOR_CONDITION_FIELDS = frozenset(
    {
        "thickness",
        "scale",
        "oxygen_fraction",
        "pressure",
        "temperature",
        "flow_velocity",
        "gravity_magnitude",
        "observation_window",
    }
)
REQUIRED_IDENTITIES = frozenset({"endpoint", "protocol", "reference_units_location", "regime"})
UNRESOLVED_CONDITIONS = (
    "unknown",
    "unresolved",
    "not reported",
    "not specified",
    "unspecified",
    "missing",
    "not available",
    "not known",
    "undetermined",
    "none",
    "null",
    "nan",
    "tbd",
)


def known_condition(value: str) -> bool:
    normalized = re.sub(r"[_\s-]+", " ", value.strip().casefold())
    return bool(normalized) and not any(
        re.match(rf"^{re.escape(marker)}(?:$|[\s:;,()/])", normalized)
        for marker in UNRESOLVED_CONDITIONS
    )


class NotApplicableCondition(ScientificInput):
    justification: Identifier
    source: EvidenceReference

    @model_validator(mode="after")
    def justified(self) -> NotApplicableCondition:
        if not known_condition(self.justification):
            raise ValueError("Non-applicability needs a specific source-backed justification.")
        return self


class RegressionProtocol(ScientificInput):
    protocol_id: Identifier
    prespecification_reference: Identifier
    endpoint: Identifier
    endpoint_unit: Identifier
    predictor: Identifier
    predictor_unit: Identifier
    target_use: Identifier
    exclusion_policy: Identifier
    grouping_dimensions: tuple[Identifier, ...] = Field(min_length=1, max_length=10)
    fixed_conditions: dict[str, Identifier] = Field(max_length=50)
    predictor_condition: Identifier | None = None
    not_applicable_conditions: dict[str, NotApplicableCondition] = Field(
        default_factory=dict, max_length=50
    )
    minimum_training_groups: int = Field(strict=True, ge=3, le=1000)
    minimum_held_out_groups: int = Field(strict=True, ge=2, le=1000)
    sample_size_justification: Identifier
    maximum_held_out_rmse: Positive
    maximum_absolute_bias: Nonnegative
    minimum_rmse_improvement_fraction: float = Field(strict=True, ge=0, lt=1, allow_inf_nan=False)
    error_model: Literal["unreported", "independent_normal_residuals"] = "unreported"
    uncertainty_assessment_reference: Identifier | None = None
    residual_review_reference: Identifier | None = None
    independent_validation_reference: Identifier | None = None
    cross_investigation_claim: bool = Field(default=False, strict=True)

    @model_validator(mode="after")
    def conditions(self) -> RegressionProtocol:
        if self.predictor_condition is not None:
            if self.predictor_condition not in PREDICTOR_CONDITION_FIELDS:
                raise ValueError("The predictor must map to one supported numeric condition field.")
            if self.predictor_condition in self.fixed_conditions:
                raise ValueError("The predictor condition varies and cannot also be fixed.")
        covered = set(self.fixed_conditions)
        if self.predictor_condition is not None:
            covered.add(self.predictor_condition)
        if not set(CONDITION_FIELDS) <= covered:
            raise ValueError("A regression protocol needs every scientific domain condition field.")
        for name, value in self.fixed_conditions.items():
            if value == "not_applicable":
                if name in REQUIRED_IDENTITIES or name not in self.not_applicable_conditions:
                    raise ValueError(
                        "Non-applicable domain conditions need their source justification."
                    )
            elif not known_condition(value) or re.sub(
                r"[_\s-]+", " ", value.strip().casefold()
            ) in {"n/a", "na", "not applicable"}:
                raise ValueError("Unknown or unresolved values cannot define a qualified domain.")
        if any(
            self.fixed_conditions.get(name) != "not_applicable"
            for name in self.not_applicable_conditions
        ):
            raise ValueError(
                "Non-applicability evidence must identify a fixed not_applicable field."
            )
        if self.fixed_conditions["endpoint"] != self.endpoint:
            raise ValueError(
                "The fixed endpoint identity must match the protocol's target endpoint."
            )
        if self.fixed_conditions["protocol"] != self.protocol_id:
            raise ValueError("The fixed protocol identity must match the prespecified protocol ID.")
        if len(set(self.grouping_dimensions)) != len(self.grouping_dimensions):
            raise ValueError("Grouping dimensions must be unique.")
        return self


def conditions_match(
    protocol: RegressionProtocol, conditions: dict[str, str], predictor_value: float
) -> bool:
    """Match the whole declared domain; no extra condition or implicit unit conversion."""
    expected = set(protocol.fixed_conditions)
    if protocol.predictor_condition is not None:
        expected.add(protocol.predictor_condition)
    if set(conditions) != expected:
        return False
    if any(conditions[name] != value for name, value in protocol.fixed_conditions.items()):
        return False
    if protocol.predictor_condition is not None:
        raw = conditions[protocol.predictor_condition].strip()
        if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", raw):
            return False
        value = float(raw)
        if not np.isfinite(value) or value != predictor_value:
            return False
    return True


class RegressionObservation(ScientificInput):
    independent_unit_id: Identifier
    investigation_id: Identifier
    groups: dict[str, Identifier] = Field(min_length=1, max_length=10)
    split: Literal["training", "held_out"]
    predictor_value: Finite
    endpoint_value: Finite
    conditions: dict[str, Identifier] = Field(max_length=50)
    source_locator: Identifier


class RegressionRequest(ScientificInput):
    protocol: RegressionProtocol
    observations: tuple[RegressionObservation, ...] = Field(min_length=1, max_length=5000)
    context: MethodContext

    @model_validator(mode="after")
    def independent_inputs(self) -> RegressionRequest:
        if len({item.independent_unit_id for item in self.observations}) != len(self.observations):
            raise ValueError("Use exactly one endpoint per independent experimental unit.")
        for exclusion in self.protocol.not_applicable_conditions.values():
            if exclusion.source not in self.context.sources:
                raise ValueError(
                    "Non-applicability evidence must be retained in the source context."
                )
            if self.context.input_origin == "measured" and not exclusion.source.asset_sha256:
                raise ValueError("Measured non-applicability needs a hash-linked physical source.")
        for item in self.observations:
            if any(dimension not in item.groups for dimension in self.protocol.grouping_dimensions):
                raise ValueError(
                    "Each observation needs every prespecified dependency-group identity."
                )
            if not conditions_match(self.protocol, item.conditions, item.predictor_value):
                raise ValueError("The supplied cohort does not meet its full scientific domain.")
        return self


class ErrorMetrics(ScientificInput):
    root_mean_square_error: Nonnegative
    mean_absolute_error: Nonnegative
    signed_bias: Finite
    unit: str


class RegressionResidual(ScientificInput):
    independent_unit_id: str
    split: Literal["training", "held_out"]
    observed: Finite
    predicted: Finite
    residual: Finite
    source_locator: str


class RegressionCard(ScientificInput):
    method_id: Literal["prespecified-single-predictor-ols-v1"] = (
        "prespecified-single-predictor-ols-v1"
    )
    card_sha256: str
    status: Literal["experimental_candidate", "eligible_for_registration"]
    context: MethodContext
    request: RegressionRequest
    slope: Finite
    intercept_at_training_predictor_mean: Finite
    training_predictor_mean: Finite
    training_predictor_sum_squared_deviation: Positive
    training_residual_standard_deviation: Nonnegative
    training_count: int
    held_out_count: int
    training_group_count: int
    held_out_group_count: int
    predictor_minimum: Finite
    predictor_maximum: Finite
    held_out_metrics: ErrorMetrics
    held_out_baseline_metrics: ErrorMetrics
    residuals: tuple[RegressionResidual, ...]
    qualification_failures: tuple[str, ...]
    numpy_version: str
    limitations: tuple[str, ...]


def dependency_components(request: RegressionRequest) -> list[str]:
    """Connect shared groups transitively, including repeated specimens/publications."""
    parents = list(range(len(request.observations)))

    def root(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    first_seen: dict[tuple[str, str], int] = {}
    for index, item in enumerate(request.observations):
        for dimension in request.protocol.grouping_dimensions:
            key = (dimension, item.groups[dimension])
            if key in first_seen:
                parents[root(index)] = root(first_seen[key])
            else:
                first_seen[key] = index
    return [str(root(index)) for index in range(len(parents))]


def error_metrics(errors: np.ndarray, unit: str) -> ErrorMetrics:
    with np.errstate(over="raise", invalid="raise"):
        try:
            return ErrorMetrics(
                root_mean_square_error=float(np.sqrt(np.mean(errors**2))),
                mean_absolute_error=float(np.mean(np.abs(errors))),
                signed_bias=float(np.mean(errors)),
                unit=unit,
            )
        except FloatingPointError:
            raise ValueError("Regression error metrics exceed finite numerical range.") from None


def evaluate_regression(request: RegressionRequest) -> RegressionCard | Refusal:
    method_id = "prespecified-single-predictor-ols-v1"
    groups = dependency_components(request)
    train = [index for index, item in enumerate(request.observations) if item.split == "training"]
    test = [index for index, item in enumerate(request.observations) if item.split == "held_out"]
    training_groups = {groups[index] for index in train}
    test_groups = {groups[index] for index in test}
    if training_groups & test_groups:
        raise ValueError("A shared dependency group crosses the frozen training/held-out split.")
    protocol = request.protocol
    missing = []
    if len(training_groups) < protocol.minimum_training_groups:
        missing.append("The training split lacks the prespecified independent group count.")
    if len(test_groups) < protocol.minimum_held_out_groups:
        missing.append("The held-out split lacks the prespecified independent group count.")
    if len(train) < 3 or len(test) < 2:
        missing.append(
            "Training residuals and held-out error require additional independent units."
        )
    if missing:
        return Refusal(
            status="needs_data",
            method_id=method_id,
            reasons=tuple(missing),
            context=request.context,
        )
    x = np.array([item.predictor_value for item in request.observations])
    y = np.array([item.endpoint_value for item in request.observations])
    x_mean, y_mean = float(x[train].mean()), float(y[train].mean())
    with np.errstate(over="raise", invalid="raise", divide="raise"):
        try:
            deviation = x[train] - x_mean
            sum_squared = float(np.dot(deviation, deviation))
            if sum_squared == 0:
                raise ValueError("Training groups have no predictor variation.")
            slope = float(np.dot(deviation, y[train] - y_mean) / sum_squared)
            predictions = y_mean + slope * (x - x_mean)
            residuals = y - predictions
            residual_std = float(
                np.sqrt(np.dot(residuals[train], residuals[train]) / (len(train) - 2))
            )
        except FloatingPointError:
            raise ValueError("Regression fit exceeds finite numerical range.") from None
    metrics = error_metrics(residuals[test], protocol.endpoint_unit)
    baseline = error_metrics(y[test] - y_mean, protocol.endpoint_unit)
    failures = []
    if len(train) != len(training_groups) or len(test) != len(test_groups):
        failures.append(
            "The IID interval requires one analyzed outcome per independent dependency group."
        )
    if metrics.root_mean_square_error > protocol.maximum_held_out_rmse:
        failures.append("Held-out RMSE exceeds the prespecified physical-unit limit.")
    if abs(metrics.signed_bias) > protocol.maximum_absolute_bias:
        failures.append("Held-out absolute bias exceeds the prespecified physical-unit limit.")
    if baseline.root_mean_square_error <= 0 or metrics.root_mean_square_error >= (
        baseline.root_mean_square_error * (1 - protocol.minimum_rmse_improvement_fraction)
    ):
        failures.append(
            "The candidate does not beat its frozen training-mean baseline as required."
        )
    x_min, x_max = float(x[train].min()), float(x[train].max())
    if any(x[index] < x_min or x[index] > x_max for index in test):
        failures.append(
            "Held-out predictor values leave the training domain; validation is extrapolative."
        )
    for name in (
        "uncertainty_assessment_reference",
        "residual_review_reference",
        "independent_validation_reference",
    ):
        if getattr(protocol, name) is None:
            failures.append(f"Missing qualification evidence: {name}.")
    if protocol.error_model != "independent_normal_residuals":
        failures.append("The registered predictive interval has no justified residual error model.")
    if protocol.cross_investigation_claim:
        training_investigations = {request.observations[index].investigation_id for index in train}
        held_out_investigations = {request.observations[index].investigation_id for index in test}
        if training_investigations & held_out_investigations:
            failures.append("Cross-investigation use needs wholly held-out investigations.")
    card = RegressionCard(
        card_sha256="0" * 64,
        status="experimental_candidate" if failures else "eligible_for_registration",
        context=request.context,
        request=request,
        slope=slope,
        intercept_at_training_predictor_mean=y_mean,
        training_predictor_mean=x_mean,
        training_predictor_sum_squared_deviation=sum_squared,
        training_residual_standard_deviation=residual_std,
        training_count=len(train),
        held_out_count=len(test),
        training_group_count=len(training_groups),
        held_out_group_count=len(test_groups),
        predictor_minimum=x_min,
        predictor_maximum=x_max,
        held_out_metrics=metrics,
        held_out_baseline_metrics=baseline,
        residuals=tuple(
            RegressionResidual(
                independent_unit_id=item.independent_unit_id,
                split=item.split,
                observed=item.endpoint_value,
                predicted=float(predictions[index]),
                residual=float(residuals[index]),
                source_locator=item.source_locator,
            )
            for index, item in enumerate(request.observations)
        ),
        qualification_failures=tuple(failures),
        numpy_version=np.__version__,
        limitations=(
            "Prespecification, endpoint mapping and evidence references require source "
            "verification.",
            "Eligibility is not registration; the application must store an accepted "
            "immutable record.",
            "Held-out scores do not establish transfer beyond the fixed joint condition domain.",
            "No model is fitted automatically to arbitrary cross-investigation tables or "
            "video frames.",
        ),
    )
    return card.model_copy(update={"card_sha256": regression_card_digest(card)})


def regression_card_digest(card: RegressionCard) -> str:
    frozen = json.dumps(
        card.model_dump(mode="json", exclude={"card_sha256"}),
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(frozen.encode()).hexdigest()


class RegressionPrediction(ScientificInput):
    status: Literal["predicted"] = "predicted"
    origin: Literal["model_prediction"] = "model_prediction"
    method_id: str
    card_sha256: str
    registration_id: str
    value: Finite
    unit: str
    predictor_value: Finite
    interval: Interval
    context: MethodContext
    limitations: tuple[str, ...]


def predict_regression(
    card: RegressionCard,
    predictor_value: float,
    conditions: dict[str, str],
    context: MethodContext,
    *,
    accepted_registration_id: str | None,
    interval_level: float = 0.95,
) -> RegressionPrediction | Refusal:
    """Registration ID must come from application-owned records, never a request parameter."""
    if not np.isfinite(predictor_value) or isinstance(predictor_value, bool):
        raise ValueError("Prediction requires a finite numeric predictor.")
    if not 0 < interval_level < 1 or not np.isfinite(interval_level):
        raise ValueError("Prediction interval level must lie strictly between zero and one.")
    if regression_card_digest(card) != card.card_sha256:
        raise ValueError("Regression card content differs from its immutable digest.")
    protocol = card.request.protocol
    if not accepted_registration_id or card.status != "eligible_for_registration":
        return Refusal(
            status="unsupported",
            method_id=card.method_id,
            reasons=("No accepted, evidence-qualified regression registration is active.",),
            context=context,
        )
    if (
        predictor_value < card.predictor_minimum
        or predictor_value > card.predictor_maximum
        or not conditions_match(protocol, conditions, predictor_value)
    ):
        return Refusal(
            status="outside_validated_domain",
            method_id=card.method_id,
            reasons=("Predictor or joint scientific conditions leave the registered domain.",),
            context=context,
        )
    value = card.intercept_at_training_predictor_mean + card.slope * (
        predictor_value - card.training_predictor_mean
    )
    standard_error = card.training_residual_standard_deviation * np.sqrt(
        1
        + 1 / card.training_count
        + (predictor_value - card.training_predictor_mean) ** 2
        / card.training_predictor_sum_squared_deviation
    )
    critical = float(student_t.ppf((1 + interval_level) / 2, card.training_count - 2))
    return RegressionPrediction(
        method_id=card.method_id,
        card_sha256=card.card_sha256,
        registration_id=accepted_registration_id,
        value=value,
        unit=protocol.endpoint_unit,
        predictor_value=predictor_value,
        interval=Interval(
            lower=value - critical * standard_error,
            upper=value + critical * standard_error,
            level=interval_level,
            interpretation="Single-new-run prediction interval conditional on the registered IID "
            "normal residual model and fixed domain; excludes unmodeled measurement error.",
        ),
        context=context,
        limitations=(
            "Predictive association for the registered endpoint and domain, not a causal or "
            "safety claim.",
            "Unreported calibration error and model discrepancy cannot be inferred from "
            "residuals alone.",
        ),
    )

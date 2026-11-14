"""Descriptive calibrated-trace fits; frame counts do not imply independent runs."""

from __future__ import annotations

import platform
from typing import Literal

import numpy as np
from nova_ember.domain.scientific import (
    Finite,
    Identifier,
    Interval,
    MethodContext,
    Nonnegative,
    Refusal,
    ScientificInput,
)
from pydantic import Field, model_validator
from scipy import __version__ as scipy_version  # type: ignore[import-untyped]
from scipy.stats import t as student_t  # type: ignore[import-untyped]

METHOD_VERSION = "1"
LENGTH_FACTORS = {"m": 1.0, "cm": 0.01, "mm": 0.001, "um": 0.000001}
TIME_FACTORS = {"s": 1.0, "ms": 0.001, "min": 60.0}


class TracePoint(ScientificInput):
    source_locator: Identifier
    time: Finite
    value: Finite
    exclude_reason: Identifier | None = None


class TraceFitRequest(ScientificInput):
    kind: Literal["flame_front", "droplet_d_squared"]
    points: tuple[TracePoint, ...] = Field(min_length=1, max_length=100000)
    time_unit: Literal["s", "ms", "min"]
    length_unit: Literal["m", "cm", "mm", "um"]
    interval_start: Finite
    interval_end: Finite
    interval_justification: Identifier
    spatial_calibration_reference: Identifier | None = None
    time_calibration_reference: Identifier | None = None
    time_origin: Identifier | None = None
    observable: Identifier
    direction: Identifier | None = None
    viewing_geometry: Identifier | None = None
    ignition_transient_treatment: Identifier | None = None
    regime: Identifier | None = None
    regime_reference: Identifier | None = None
    support_configuration: Identifier | None = None
    diameter_definition: Identifier | None = None
    error_model: Literal["unreported", "independent_normal_residuals"] = "unreported"
    error_model_justification: Identifier | None = None
    confidence_level: float = Field(default=0.95, strict=True, gt=0, lt=1, allow_inf_nan=False)
    independent_run_count: int | None = Field(default=None, strict=True, ge=1)
    context: MethodContext

    @model_validator(mode="after")
    def valid_interval(self) -> TraceFitRequest:
        if self.interval_start >= self.interval_end:
            raise ValueError("The selected interval must have positive duration.")
        if self.error_model != "unreported" and self.error_model_justification is None:
            raise ValueError("A residual error model needs a dependence/normality justification.")
        return self


class FitPoint(ScientificInput):
    source_locator: str
    time_seconds: Finite
    observed: Finite
    fitted: Finite
    residual: Finite


class FitResult(ScientificInput):
    status: Literal["descriptive_fit"] = "descriptive_fit"
    method_id: str
    origin: Literal["deterministic_calculation"] = "deterministic_calculation"
    context: MethodContext
    request: TraceFitRequest
    value: Finite
    unit: str
    definition: str
    signed_slope: Finite
    intercept_at_interval_start: Finite
    interval_start_seconds: Finite
    interval_end_seconds: Finite
    point_count: int
    independent_run_count: int | None
    independent_run_count_basis: str
    points: tuple[FitPoint, ...]
    excluded: tuple[dict[str, str], ...]
    root_mean_square_residual: Nonnegative
    residual_unit: str
    coefficient_of_determination: Finite | None
    residual_lag_one_correlation: Finite | None
    slope_standard_error: Nonnegative | None
    interval: Interval | None
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    runtime_versions: dict[str, str]


def fit_trace(request: TraceFitRequest) -> FitResult | Refusal:
    """Fit selected raw values in SI, centering time to avoid large-epoch cancellation.

    Squaring diameter is an explicit transform. It does not repair an ambiguous
    source burning-rate header or establish that an interval follows the D² law.
    """
    method_id = f"{request.kind}-linear-fit-v{METHOD_VERSION}"
    required = [
        name
        for name in ("spatial_calibration_reference", "time_calibration_reference", "time_origin")
        if not getattr(request, name)
    ]
    if request.kind == "flame_front":
        required += [
            name
            for name in ("direction", "viewing_geometry", "ignition_transient_treatment")
            if not getattr(request, name)
        ]
    else:
        required += [
            name
            for name in (
                "regime",
                "regime_reference",
                "support_configuration",
                "diameter_definition",
            )
            if not getattr(request, name)
        ]
    if required:
        return Refusal(
            status="needs_data",
            method_id=method_id,
            reasons=(
                "The selected measurement/regime is not sufficiently defined and calibrated.",
            ),
            required_inputs=tuple(required),
            context=request.context,
        )
    chosen = []
    excluded = []
    for point in request.points:
        reason = point.exclude_reason
        if reason is None and not request.interval_start <= point.time <= request.interval_end:
            reason = "outside_selected_interval"
        if reason:
            excluded.append({"source_locator": point.source_locator, "reason": reason})
        else:
            chosen.append(point)
    if len(chosen) < 3:
        return Refusal(
            status="needs_data",
            method_id=method_id,
            reasons=("At least three selected points are required for residual diagnostics.",),
            required_inputs=("three calibrated points in the declared interval",),
            context=request.context,
        )
    times = np.array([point.time * TIME_FACTORS[request.time_unit] for point in chosen])
    if any(point.time != 0 and times[index] == 0 for index, point in enumerate(chosen)):
        raise ValueError("A nonzero source timestamp underflows the converted numerical range.")
    if not np.all(np.isfinite(times)):
        raise ValueError("Converted timestamps exceed finite numerical range.")
    if np.any(np.diff(times) <= 0):
        raise ValueError("Selected timestamps must be strictly increasing; input is not reordered.")
    values = np.array([point.value * LENGTH_FACTORS[request.length_unit] for point in chosen])
    if any(point.value != 0 and values[index] == 0 for index, point in enumerate(chosen)):
        raise ValueError("A nonzero source position underflows the converted numerical range.")
    if request.kind == "droplet_d_squared" and np.any(values <= 0):
        raise ValueError("Selected measured droplet diameters must be positive.")
    with np.errstate(over="raise", invalid="raise", divide="raise", under="ignore"):
        try:
            response = values**2 if request.kind == "droplet_d_squared" else values
            if request.kind == "droplet_d_squared" and np.any(response == 0):
                raise ValueError("A positive diameter squared underflows the numerical range.")
            origin = request.interval_start * TIME_FACTORS[request.time_unit]
            centered_time = times - origin
            centered_x = centered_time - centered_time.mean()
            centered_y = response - response.mean()
            denominator = float(np.dot(centered_x, centered_x))
            if denominator <= 0 or not np.isfinite(denominator):
                raise ValueError("Selected time span cannot support a finite slope.")
            slope = float(np.dot(centered_x, centered_y) / denominator)
            intercept = float(response.mean() - slope * centered_time.mean())
            fitted = intercept + slope * centered_time
            residuals = response - fitted
            sum_squared_residuals = float(np.dot(residuals, residuals))
            sum_squared_response = float(np.dot(centered_y, centered_y))
            rms = float(np.sqrt(sum_squared_residuals / len(chosen)))
        except FloatingPointError:
            raise ValueError("Selected trace exceeds finite numerical range.") from None
    numbers = [slope, intercept, rms, *fitted, *residuals]
    if not np.all(np.isfinite(numbers)):
        raise ValueError("The descriptive fit is not finite.")
    if request.kind == "droplet_d_squared" and slope >= 0:
        return Refusal(
            status="unsupported",
            method_id=method_id,
            reasons=("Diameter squared does not decrease over the selected burning interval.",),
            context=request.context,
        )
    standard_error = None
    interval = None
    value = -slope if request.kind == "droplet_d_squared" else slope
    if request.error_model == "independent_normal_residuals":
        standard_error = float(np.sqrt(sum_squared_residuals / (len(chosen) - 2) / denominator))
        critical = float(student_t.ppf((1 + request.confidence_level) / 2, len(chosen) - 2))
        interval = Interval(
            lower=value - critical * standard_error,
            upper=value + critical * standard_error,
            level=request.confidence_level,
            interpretation="Conditional slope confidence interval under stated IID normal "
            "residuals; "
            "excludes unmodeled calibration uncertainty and within-run dependence.",
        )
    correlation = None
    if len(chosen) > 3 and np.std(residuals[:-1]) > 0 and np.std(residuals[1:]) > 0:
        correlation = float(np.corrcoef(residuals[:-1], residuals[1:])[0, 1])
        if not np.isfinite(correlation):
            correlation = None
    return FitResult(
        method_id=method_id,
        context=request.context,
        request=request,
        runtime_versions={
            "python": platform.python_version(),
            "numpy": np.__version__,
            "scipy": scipy_version,
        },
        value=value,
        unit="m^2/s" if request.kind == "droplet_d_squared" else "m/s",
        definition="K = -d(D^2)/dt" if request.kind == "droplet_d_squared" else "v_f = dx_f/dt",
        signed_slope=slope,
        intercept_at_interval_start=intercept,
        interval_start_seconds=origin,
        interval_end_seconds=request.interval_end * TIME_FACTORS[request.time_unit],
        point_count=len(chosen),
        independent_run_count=request.independent_run_count,
        independent_run_count_basis="Declared input identity; trace points are not "
        "independent runs.",
        points=tuple(
            FitPoint(
                source_locator=point.source_locator,
                time_seconds=float(times[index]),
                observed=float(response[index]),
                fitted=float(fitted[index]),
                residual=float(residuals[index]),
            )
            for index, point in enumerate(chosen)
        ),
        excluded=tuple(excluded),
        root_mean_square_residual=rms,
        residual_unit="m^2" if request.kind == "droplet_d_squared" else "m",
        coefficient_of_determination=(
            1 - sum_squared_residuals / sum_squared_response if sum_squared_response > 0 else None
        ),
        residual_lag_one_correlation=correlation,
        slope_standard_error=standard_error,
        interval=interval,
        assumptions=(request.interval_justification, *request.context.assumptions),
        limitations=(
            "Describes only the selected measured interval, observable and regime.",
            "A small residual does not establish correct calibration or physical validity.",
            "No run-to-run prediction or independence is inferred from trace point count.",
            "Measurement/calibration uncertainty remains unreported unless separately propagated.",
        ),
    )

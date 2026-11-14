"""Independent slopes and refusal cases for the two measured-trace methods."""

import math

import pytest
from nova_ember.analysis.fits import TraceFitRequest, fit_trace
from nova_ember.domain.scientific import Refusal
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "known-answer-lines", "locator": "analytical reference"}],
}


def trace_request(**updates):
    data = {
        "kind": "flame_front",
        "points": [
            {"source_locator": f"frame:{index}", "time": float(index), "value": 5.0 + 2 * index}
            for index in range(4)
        ],
        "time_unit": "s",
        "length_unit": "mm",
        "interval_start": 0.0,
        "interval_end": 3.0,
        "interval_justification": "Known straight line after an explicitly excluded ignition "
        "transient",
        "spatial_calibration_reference": "scale-reference",
        "time_calibration_reference": "clock-reference",
        "time_origin": "relative-to-ignition",
        "observable": "luminous leading edge",
        "direction": "positive specimen coordinate",
        "viewing_geometry": "orthographic calibrated specimen plane",
        "ignition_transient_treatment": "No ignition transient in the analytical reference",
        "context": CONTEXT,
    }
    data.update(updates)
    return TraceFitRequest.model_validate(data)


def test_front_speed_keeps_signed_slope_source_points_and_si_units():
    result = fit_trace(trace_request())
    assert result.status == "descriptive_fit"
    assert result.value == pytest.approx(0.002, rel=1e-12)
    assert result.intercept_at_interval_start == pytest.approx(0.005, rel=1e-12)
    assert result.unit == "m/s"
    assert result.point_count == 4
    assert result.independent_run_count is None
    assert result.interval is None
    assert result.slope_standard_error is None
    assert result.points[2].source_locator == "frame:2"
    assert result.points[2].observed == pytest.approx(0.009)
    assert result.root_mean_square_residual < 1e-15
    assert result.request.context.input_origin == "synthetic_reference"


def test_millisecond_time_conversion_does_not_refit_display_units():
    request = trace_request()
    data = request.model_dump()
    data["time_unit"] = "ms"
    data["interval_end"] = 3000.0
    for point in data["points"]:
        point["time"] *= 1000
    result = fit_trace(TraceFitRequest.model_validate(data))
    assert result.value == pytest.approx(0.002, rel=1e-12)
    assert result.interval_end_seconds == 3.0


def test_reverse_front_is_signed_not_silently_made_positive():
    request = trace_request(
        points=[
            {"source_locator": str(index), "time": float(index), "value": 6.0 - index}
            for index in range(4)
        ]
    )
    result = fit_trace(request)
    assert result.value == pytest.approx(-0.001)
    assert result.request.direction == "positive specimen coordinate"


def test_d_squared_burning_constant_uses_measured_diameter_not_source_header():
    result = fit_trace(
        trace_request(
            kind="droplet_d_squared",
            points=[
                {
                    "source_locator": str(index),
                    "time": float(index),
                    "value": math.sqrt(4 - 0.5 * index),
                }
                for index in range(4)
            ],
            regime="established hot-flame interval",
            regime_reference="source-labelled-interval",
            support_configuration="documented-fiber",
            diameter_definition="equivalent-volume diameter",
        )
    )
    assert result.status == "descriptive_fit"
    assert result.value == pytest.approx(0.5e-6, rel=1e-12)
    assert result.unit == "m^2/s"
    assert result.signed_slope == pytest.approx(-0.5e-6, rel=1e-12)
    assert result.points[0].observed == pytest.approx(4e-6)
    assert result.residual_unit == "m^2"


@pytest.mark.parametrize(
    "field",
    [
        "spatial_calibration_reference",
        "time_calibration_reference",
        "time_origin",
        "direction",
        "viewing_geometry",
        "ignition_transient_treatment",
    ],
)
def test_missing_calibration_or_observable_contract_refuses(field):
    result = fit_trace(trace_request(**{field: None}))
    assert isinstance(result, Refusal)
    assert field in result.required_inputs
    assert result.value is None


def test_droplet_missing_regime_or_definition_refuses():
    result = fit_trace(trace_request(kind="droplet_d_squared"))
    assert result.status == "needs_data"
    assert set(result.required_inputs) == {
        "regime",
        "regime_reference",
        "support_configuration",
        "diameter_definition",
    }


def test_exclusions_and_window_are_preserved_without_silent_resampling():
    request = trace_request()
    points = [point.model_dump() for point in request.points]
    points[1]["exclude_reason"] = "obscured front"
    points.append({"source_locator": "outside", "time": 9.0, "value": 100.0})
    result = fit_trace(trace_request(points=points))
    assert result.value == pytest.approx(0.002)
    assert result.point_count == 3
    assert result.excluded == (
        {"source_locator": "frame:1", "reason": "obscured front"},
        {"source_locator": "outside", "reason": "outside_selected_interval"},
    )


def test_too_few_points_refuses_instead_of_publishing_exact_two_point_slope():
    result = fit_trace(trace_request(interval_end=1.0))
    assert result.status == "needs_data"
    assert result.value is None


@pytest.mark.parametrize("times", [[0.0, 0.0, 1.0], [0.0, 2.0, 1.0]])
def test_duplicate_or_unsorted_times_are_not_reordered(times):
    with pytest.raises(ValueError, match="strictly increasing"):
        fit_trace(
            trace_request(
                points=[
                    {"source_locator": str(i), "time": t, "value": float(i)}
                    for i, t in enumerate(times)
                ]
            )
        )


def test_interval_error_model_requires_explicit_dependence_justification():
    with pytest.raises(ValidationError, match="justification"):
        trace_request(error_model="independent_normal_residuals")
    result = fit_trace(
        trace_request(
            error_model="independent_normal_residuals",
            error_model_justification="Analytical independent Gaussian errors, not repeated "
            "real video frames",
        )
    )
    assert result.interval is not None
    assert result.interval.lower <= result.value <= result.interval.upper
    assert "within-run dependence" in result.interval.interpretation


@pytest.mark.parametrize("value", [math.nan, math.inf, True])
def test_invalid_numeric_trace_values_are_rejected(value):
    with pytest.raises(ValidationError):
        trace_request(points=[{"source_locator": "bad", "time": 0.0, "value": value}])


def test_increasing_diameter_does_not_publish_positive_burning_constant():
    result = fit_trace(
        trace_request(
            kind="droplet_d_squared",
            regime="hot",
            regime_reference="protocol",
            support_configuration="free",
            diameter_definition="equivalent",
        )
    )
    assert result.status == "unsupported"
    assert result.value is None

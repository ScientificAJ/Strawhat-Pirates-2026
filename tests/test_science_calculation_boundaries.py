"""Small scientific-domain and arithmetic regressions from the 2026-11-15 audit."""

import pytest
from nova_ember.analysis.applicability import ConditionValue
from nova_ember.analysis.events import DetectorTimingRequest, detector_timing
from nova_ember.analysis.media import PixelTraceRequest, calibrate_pixel_trace
from nova_ember.analysis.oxygen import oxygen_partial_pressure
from nova_ember.analysis.uncertainty import MonteCarloRequest, propagate_monte_carlo
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "arithmetic-reference", "locator": "explicit known inputs"}],
}


def test_unknown_prose_cannot_match_as_a_known_comparison_condition():
    for value in ("unknown", "not measured", "not_reported", "unresolved: source conflict"):
        with pytest.raises(ValidationError, match="explicit status"):
            ConditionValue(value=value, status="nominal", source_locator="retained cell")
    assert ConditionValue(status="not_reported").value is None
    assert (
        ConditionValue(value=0.0, unit="1", status="measured", source_locator="cell").value == 0.0
    )


def test_detector_component_roundoff_is_not_a_physical_excess():
    inputs = {
        "start_time_seconds": 0.0,
        "alarm_time_seconds": 0.3,
        "start_event_definition": "specified start",
        "alarm_endpoint_definition": "specified alarm",
        "clock_synchronization_reference": "same clock",
        "transport_path_reference": "specified path",
        "instrument_response_reference": "specified response",
        "threshold_definition": "specified threshold",
        "measured_transport_delay_seconds": 0.1,
        "measured_instrument_delay_seconds": 0.2,
        "component_timing_reference": "sequential components",
        "context": CONTEXT,
    }
    result = detector_timing(DetectorTimingRequest.model_validate(inputs))
    assert result.total_delay_seconds == 0.3
    assert result.remaining_unallocated_delay_seconds == 0.0
    with pytest.raises(ValueError, match="exceed"):
        detector_timing(
            DetectorTimingRequest.model_validate(
                {**inputs, "measured_instrument_delay_seconds": 0.200000001}
            )
        )
    with pytest.raises(ValueError, match="exceed"):
        detector_timing(
            DetectorTimingRequest.model_validate(
                {
                    **inputs,
                    "alarm_time_seconds": 0.0,
                    "measured_transport_delay_seconds": 5e-324,
                    "measured_instrument_delay_seconds": 0.0,
                }
            )
        )
    with pytest.raises(ValueError, match="finite"):
        detector_timing(
            DetectorTimingRequest.model_validate(
                {**inputs, "start_time_seconds": -1e308, "alarm_time_seconds": 1e308}
            )
        )


def test_positive_partial_pressure_underflow_cannot_be_reported_as_zero_oxygen():
    with pytest.raises(ValueError, match="numeric range"):
        oxygen_partial_pressure(1.0, 5e-324, "Pa", "mole")
    assert oxygen_partial_pressure(0.0, 5e-324, "Pa", "mole")["value"] == 0.0
    assert oxygen_partial_pressure(21.0, 100000.0, "Pa", "mole")["value"] == 21000.0


def test_positive_pixel_diameter_underflow_cannot_be_a_zero_diameter_measurement():
    request = PixelTraceRequest.model_validate(
        {
            "points": [
                {
                    "source_locator": "frame:0",
                    "pixel_value": 0.5,
                    "time_seconds": 0.0,
                    "source_sha256": "a" * 64,
                }
            ],
            "calibration": {
                "metres_per_pixel": 5e-324,
                "calibration_reference": "numeric-boundary scale",
                "calibrated_image_width": 20,
                "calibrated_image_height": 20,
                "viewing_geometry": "planar_orthographic",
                "geometry_reference": "synthetic plane",
                "square_pixel_justification": "specified square pixels",
            },
            "observable": "projected_droplet_diameter",
            "diameter_definition": "axis_aligned_length",
            "coordinate_definition": "positive projected diameter",
            "time_origin_definition": "source time zero",
            "segmentation_validation_reference": "synthetic known boundary",
            "time_calibration_reference": "synthetic clock",
            "context": CONTEXT,
        }
    )
    with pytest.raises(ValueError, match="underflows"):
        calibrate_pixel_trace(request)


@pytest.mark.parametrize("function", ["ratio", "oxygen_molar_density"])
def test_gaussian_denominator_moments_are_refused_but_fixed_denominator_is_preserved(function):
    oxygen = function == "oxygen_molar_density"
    size = 3 if oxygen else 2
    covariance = [[0.0] * size for _ in range(size)]
    inputs = {
        "function": function,
        "input_means": [0.25, 100000.0, 300.0] if oxygen else [4.0, 2.0],
        "input_units": ["1", "Pa", "K"] if oxygen else ["m", "s"],
        "covariance": covariance,
        "distribution_justification": "degenerate normal known-answer reference",
        "covariance_reference": "specified synthetic covariance",
        "uncertainty_kind": "analyst_sensitivity",
        "sample_count": 1000,
        "seed": 7,
        "context": CONTEXT,
    }
    result = propagate_monte_carlo(MonteCarloRequest.model_validate(inputs))
    assert result.value == pytest.approx(10.0226962535605 if oxygen else 2.0)
    assert result.standard_deviation == pytest.approx(0.0, abs=1e-13)
    assert result.converged
    covariance[-1][-1] = 0.01
    with pytest.raises(ValidationError, match="fixed denominator"):
        MonteCarloRequest.model_validate(inputs)

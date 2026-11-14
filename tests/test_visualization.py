"""Known-answer calculations and provenance boundaries for the teaching model."""

import math

import pytest
from nova_ember.analysis.visualization import (
    DropletVisualizationRequest,
    calculate_droplet_visualization,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "analytical-known-answer", "locator": "D0=2 mm; K=0.5 mm^2/s"}],
    "source_snapshot": "test-snapshot",
    "conditions": {"investigation": "PSI-69; educational association only"},
}


def request(**updates):
    fields = {
        "initial_diameter_mm": 2.0,
        "burning_constant_mm2_s": 0.5,
        "sample_count": 5,
        "context": CONTEXT,
    }
    fields.update(updates)
    return DropletVisualizationRequest.model_validate(fields)


def test_known_diameter_and_mass_values_keep_the_model_endpoint_distinct_from_extinction():
    result = calculate_droplet_visualization(request())
    assert result.idealized_endpoint_s == 8.0
    assert [point.time_s for point in result.points] == [0.0, 2.0, 4.0, 6.0, 8.0]
    assert [point.diameter_squared_mm2 for point in result.points] == [4.0, 3.0, 2.0, 1.0, 0.0]
    assert result.points[1].diameter_mm == pytest.approx(math.sqrt(3), rel=1e-14)
    assert result.points[1].relative_mass == pytest.approx(3 * math.sqrt(3) / 8, rel=1e-14)
    assert result.points[2].relative_mass == pytest.approx(1 / (2 * math.sqrt(2)), rel=1e-14)
    assert result.points[-1].model_dump() == {
        "time_s": 8.0,
        "diameter_mm": 0.0,
        "diameter_squared_mm2": 0.0,
        "relative_mass": 0.0,
    }
    assert result.status == "illustrative_model"
    assert any("not a prediction of actual flame extinction" in text for text in result.limitations)


def test_scaling_diameter_or_assigned_coefficient_changes_the_ideal_lifetime():
    large = calculate_droplet_visualization(request(initial_diameter_mm=4.0))
    faster = calculate_droplet_visualization(request(burning_constant_mm2_s=1.0))
    assert large.idealized_endpoint_s == 32.0
    assert faster.idealized_endpoint_s == 4.0


@pytest.mark.parametrize("sample_count", [2, 7, 241, 601])
def test_samples_are_ordered_finite_and_preserve_spherical_mass_geometry(sample_count):
    result = calculate_droplet_visualization(request(sample_count=sample_count))
    assert len(result.points) == sample_count
    initial_volume = 4 / 3 * math.pi
    for earlier, later in zip(result.points, result.points[1:], strict=False):
        assert earlier.time_s < later.time_s
        assert earlier.diameter_mm >= later.diameter_mm
        assert earlier.relative_mass >= later.relative_mass
    for point in result.points:
        assert all(math.isfinite(value) for value in point.model_dump().values())
        volume = 4 / 3 * math.pi * (point.diameter_mm / 2) ** 3
        assert point.relative_mass == pytest.approx(volume / initial_volume, rel=1e-13, abs=1e-15)


def test_original_context_and_assumed_parameter_status_are_retained_without_measurement_claims():
    original = request()
    result = calculate_droplet_visualization(original)
    assert result.request == original
    assert result.context == original.context
    assert result.parameter_origin == "analyst_assumptions"
    assert result.origin == "deterministic_calculation"
    assert result.units["burning_constant_mm2_s"] == "mm^2/s"
    assert any("Burning rate; mm" in item for item in result.limitations)
    assert "soot_concentration_mg_m3" not in result.points[0].model_dump()


@pytest.mark.parametrize("field", ["initial_diameter_mm", "burning_constant_mm2_s"])
@pytest.mark.parametrize("value", [0.0, -1.0, float("nan"), float("inf"), True, "2.0"])
def test_invalid_parameters_are_rejected_instead_of_clamped(field, value):
    with pytest.raises(ValidationError):
        request(**{field: value})


@pytest.mark.parametrize("count", [1, 602, 3.5, True])
def test_sample_profile_is_bounded_and_integer(count):
    with pytest.raises(ValidationError):
        request(sample_count=count)


@pytest.mark.parametrize(
    "updates",
    [
        {"initial_diameter_mm": 1e200},
        {"initial_diameter_mm": 1e-200},
        {"burning_constant_mm2_s": 5e-324},
        {"initial_diameter_mm": 1e-161, "sample_count": 601},
        {"initial_diameter_mm": 1e-150, "burning_constant_mm2_s": 1e300},
    ],
)
def test_unsupported_derived_numeric_ranges_are_rejected(updates):
    with pytest.raises(ValidationError):
        request(**updates)


@pytest.mark.parametrize(
    "updates",
    [
        {"parameter_origin": "measured"},
        {"context": {**CONTEXT, "input_origin": "measured"}},
        {"model_id": "validated_nasa_prediction"},
        {"soot_ppm": 10.0},
    ],
)
def test_assumptions_cannot_be_relabelled_as_measured_or_enlarged_into_unsupported_outputs(updates):
    with pytest.raises(ValidationError):
        request(**updates)

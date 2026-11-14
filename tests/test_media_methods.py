"""Synthetic image geometry and source-clock cases with independently known dimensions."""

import hashlib
import io
import math

import numpy as np
import pytest
from nova_ember.analysis.media import (
    ImageMeasurementRequest,
    PixelTraceRequest,
    calibrate_pixel_trace,
    measure_image,
)
from PIL import Image
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "synthetic-pixel-reference", "locator": "analytical rectangle"}],
}
CALIBRATION = {
    "metres_per_pixel": 0.001,
    "calibration_reference": "known synthetic scale: 1 mm per pixel",
    "calibrated_image_width": 20,
    "calibrated_image_height": 10,
    "viewing_geometry": "planar_orthographic",
    "geometry_reference": "orthographic synthetic image",
    "square_pixel_justification": "square synthetic pixels",
}


def image_bytes(array=None):
    if array is None:
        array = np.zeros((10, 20), dtype=np.uint8)
        array[2:8, 3:7] = 255
    output = io.BytesIO()
    Image.fromarray(array).save(output, format="PNG")
    return output.getvalue()


def request(content, **updates):
    data = {
        "expected_sha256": hashlib.sha256(content).hexdigest(),
        "roi": {"left": 0, "top": 0, "right": 20, "bottom": 10},
        "observable": "luminous_edge",
        "measurement_axis": "x",
        "boundary_direction": "increasing",
        "intensity_channel": "grayscale",
        "threshold": 128,
        "foreground": "at_or_above",
        "calibration": CALIBRATION,
        "segmentation_validation_reference": "exact labeled synthetic rectangle",
        "observable_definition_reference": "synthetic luminous-edge stand-in, no NASA measurements",
        "context": CONTEXT,
    }
    data.update(updates)
    return ImageMeasurementRequest.model_validate(data)


def test_frozen_image_front_boundary_preserves_exact_pixels_scale_roi_and_hash():
    content = image_bytes()
    result = measure_image(request(content), content)
    assert result.status == "calibrated_measurement"
    assert result.value_metres == pytest.approx(0.006)
    assert result.median_boundary_coordinate_pixels == 6.0
    assert result.foreground_pixel_count == 24
    assert [(pixel.x, pixel.y) for pixel in result.boundary_pixels] == [
        (6, row) for row in range(2, 8)
    ]
    assert result.components[0].bounding_box.model_dump() == {
        "left": 3,
        "top": 2,
        "right": 7,
        "bottom": 8,
    }
    assert result.source_sha256 == hashlib.sha256(content).hexdigest()
    assert result.source_mode == "L"
    assert result.source_width == 20
    assert result.pillow_version
    assert result.context.input_origin == "synthetic_reference"


def test_opposite_boundary_direction_and_y_axis_use_declared_coordinate_definition():
    content = image_bytes()
    result = measure_image(request(content, boundary_direction="decreasing"), content)
    assert result.value_metres == pytest.approx(0.003)
    result = measure_image(request(content, measurement_axis="y"), content)
    assert result.value_metres == pytest.approx(0.007)
    assert result.median_boundary_coordinate_pixels == 7.0


def test_roi_coordinates_remain_original_image_coordinates_not_crop_local():
    content = image_bytes()
    result = measure_image(
        request(content, roi={"left": 2, "top": 1, "right": 10, "bottom": 9}), content
    )
    assert result.value_metres == pytest.approx(0.006)
    assert result.boundary_pixels[0].x == 6
    assert result.boundary_pixels[0].y == 2


def test_projected_area_equivalent_diameter_is_not_invented_volume_diameter():
    content = image_bytes()
    result = measure_image(request(content, observable="projected_droplet"), content)
    assert result.projected_area_equivalent_diameter_pixels == pytest.approx(
        2 * math.sqrt(24 / math.pi)
    )
    assert result.value_metres == pytest.approx(2 * math.sqrt(24 / math.pi) * 0.001)
    assert "not inferred volume diameter" in result.measurement_definition


def test_missing_scale_or_segmentation_validation_stays_a_proposal():
    content = image_bytes()
    uncalibrated = measure_image(request(content, calibration=None), content)
    assert uncalibrated.status == "measurement_proposal"
    assert uncalibrated.value_metres is None
    assert uncalibrated.calibrated_proposal_metres is None
    assert uncalibrated.median_boundary_coordinate_pixels == 6.0
    unvalidated = measure_image(request(content, segmentation_validation_reference=None), content)
    assert unvalidated.status == "measurement_proposal"
    assert unvalidated.value_metres is None
    assert unvalidated.calibrated_proposal_metres == pytest.approx(0.006)


def test_unresolved_viewing_geometry_never_creates_validated_metric_coordinate():
    content = image_bytes()
    result = measure_image(
        request(content, calibration={**CALIBRATION, "viewing_geometry": "unresolved"}), content
    )
    assert result.status == "measurement_proposal"
    assert result.value_metres is None
    assert result.boundary_pixels[0].coordinate_metres is None


def test_multiple_components_require_explicit_selection_not_largest_object_guess():
    array = np.zeros((10, 20), dtype=np.uint8)
    array[2:8, 3:7] = 255
    array[3, 15] = 255
    content = image_bytes(array)
    ambiguous = measure_image(request(content), content)
    assert ambiguous.component_count == 2
    assert ambiguous.status == "measurement_proposal"
    assert ambiguous.selected_component_id is None
    assert ambiguous.value_metres is None
    assert ambiguous.boundary_pixels == ()
    selected = measure_image(request(content, component_id=1), content)
    assert selected.status == "calibrated_measurement"
    assert selected.foreground_pixel_count == 24
    assert selected.value_metres == pytest.approx(0.006)
    with pytest.raises(ValueError, match="does not exist"):
        measure_image(request(content, component_id=3), content)


def test_empty_mask_is_not_reported_as_extinction_or_zero_length():
    content = image_bytes(np.zeros((10, 20), dtype=np.uint8))
    result = measure_image(request(content), content)
    assert result.status == "needs_data"
    assert result.value is None


def test_selected_rgb_channel_is_explicit_and_color_is_not_temperature():
    array = np.zeros((10, 20, 3), dtype=np.uint8)
    array[2:8, 3:7, 0] = 255
    content = image_bytes(array)
    result = measure_image(request(content, intensity_channel="red"), content)
    assert result.value_metres == pytest.approx(0.006)
    assert any("temperature" in limitation for limitation in result.limitations)
    assert (
        measure_image(request(content, intensity_channel="luminance_bt601"), content).status
        == "needs_data"
    )
    with pytest.raises(ValueError, match="color image"):
        measure_image(request(content), content)


def test_bad_image_hash_corrupt_bytes_and_calibration_size_are_rejected():
    content = image_bytes()
    with pytest.raises(ValueError, match="SHA-256"):
        measure_image(request(content, expected_sha256="a" * 64), content)
    broken = b"not a valid image"
    with pytest.raises(ValueError, match="supported complete"):
        measure_image(request(broken), broken)
    with pytest.raises(ValueError, match="dimensions differ"):
        measure_image(
            request(content, calibration={**CALIBRATION, "calibrated_image_width": 21}), content
        )


def test_outside_roi_and_16_bit_source_are_not_silently_clipped_or_downsampled():
    content = image_bytes()
    with pytest.raises(ValueError, match="ROI leaves"):
        measure_image(
            request(content, roi={"left": 0, "top": 0, "right": 21, "bottom": 10}), content
        )
    high_depth = image_bytes(np.zeros((10, 20), dtype=np.uint16))
    with pytest.raises(ValueError, match="8-bit"):
        measure_image(request(high_depth), high_depth)


def trace_request(**updates):
    data = {
        "points": [
            {
                "source_locator": f"frame:{index}",
                "pixel_value": pixel,
                "frame_index": index,
                "source_sha256": "a" * 64,
            }
            for index, pixel in [(0, 3.0), (30, 5.0), (60, 7.0)]
        ],
        "calibration": CALIBRATION,
        "observable": "luminous_edge",
        "coordinate_definition": "leading edge pixel center along x",
        "segmentation_validation_reference": "source-specific labeled tracks",
        "time_calibration_reference": "source clock calibration",
        "time_origin_definition": "frame zero at source time zero",
        "fps_numerator": 30,
        "fps_denominator": 1,
        "frame_timing_assumption": "fixed frame rate with no dropped frames",
        "context": CONTEXT,
    }
    data.update(updates)
    return PixelTraceRequest.model_validate(data)


def test_rational_frame_clock_and_pixel_scale_make_trace_without_inventing_runs():
    result = calibrate_pixel_trace(trace_request())
    assert result.status == "calibrated_trace"
    assert [point.time_seconds for point in result.points] == [0.0, 1.0, 2.0]
    assert [point.value_metres for point in result.points] == pytest.approx([0.003, 0.005, 0.007])
    assert result.points[1].original_pixel_value == 5.0
    assert result.points[1].source_locator == "frame:30"
    assert result.independent_run_count is None


def test_variable_rate_frames_keep_original_timestamps_and_missing_validation_is_visible():
    data = trace_request().model_dump()
    for point, timestamp in zip(data["points"], [0.0, 0.5, 1.75], strict=True):
        point["frame_index"] = None
        point["time_seconds"] = timestamp
    data["fps_numerator"] = data["fps_denominator"] = None
    data["frame_timing_assumption"] = None
    data["segmentation_validation_reference"] = None
    result = calibrate_pixel_trace(PixelTraceRequest.model_validate(data))
    assert result.status == "measurement_proposal"
    assert [point.time_seconds for point in result.points] == [0.0, 0.5, 1.75]
    assert "source-specific annotation/segmentation validation" in result.missing_requirements


def test_ambiguous_clock_missing_fps_and_unsorted_trace_are_rejected():
    with pytest.raises(ValidationError, match="rational frame rate"):
        trace_request(fps_numerator=None)
    points = [point.model_dump() for point in trace_request().points]
    points[1]["frame_index"] = 0
    with pytest.raises(ValueError, match="increase"):
        calibrate_pixel_trace(trace_request(points=points))
    points[1]["time_seconds"] = 1.0
    with pytest.raises(ValidationError, match="exactly one"):
        trace_request(points=points)


def test_annotation_outside_frozen_frame_is_not_extrapolated_to_physical_position():
    points = [point.model_dump() for point in trace_request().points]
    points[1]["pixel_value"] = 20.0
    with pytest.raises(ValueError, match="outside"):
        calibrate_pixel_trace(trace_request(points=points))


def axis_calibration():
    return {
        **{
            key: value
            for key, value in CALIBRATION.items()
            if key not in ("metres_per_pixel", "square_pixel_justification")
        },
        "metres_per_pixel_x": 0.002,
        "metres_per_pixel_y": 0.001,
        "x_calibration_reference": "synthetic horizontal scale",
        "y_calibration_reference": "synthetic vertical scale",
    }


def test_explicit_anisotropic_calibration_preserves_axis_positions_and_physical_area():
    content = image_bytes()
    x = measure_image(request(content, calibration=axis_calibration()), content)
    y = measure_image(
        request(content, calibration=axis_calibration(), measurement_axis="y"), content
    )
    assert x.value_metres == pytest.approx(0.012)
    assert y.value_metres == pytest.approx(0.007)
    assert x.foreground_area_square_metres == pytest.approx(48e-6)
    diameter = measure_image(
        request(content, calibration=axis_calibration(), observable="projected_droplet"), content
    )
    assert diameter.value_metres == pytest.approx(2 * math.sqrt(48e-6 / math.pi))
    assert diameter.value_metres != pytest.approx(
        diameter.projected_area_equivalent_diameter_pixels * 0.002
    )


def test_axis_calibration_needs_both_scale_references_and_cannot_mix_legacy_scales():
    content = image_bytes()
    with pytest.raises(ValidationError, match="both scales"):
        request(content, calibration={**axis_calibration(), "y_calibration_reference": None})
    with pytest.raises(ValidationError, match="not both"):
        request(content, calibration={**axis_calibration(), "metres_per_pixel": 0.001})
    with pytest.raises(ValidationError, match="square-pixel"):
        request(content, calibration={**CALIBRATION, "square_pixel_justification": None})


def test_anisotropic_trace_positions_and_diameter_definitions_are_explicit():
    x = calibrate_pixel_trace(trace_request(calibration=axis_calibration()))
    assert [point.value_metres for point in x.points] == pytest.approx([0.006, 0.010, 0.014])
    area_diameter = calibrate_pixel_trace(
        trace_request(
            calibration=axis_calibration(),
            observable="projected_droplet_diameter",
            diameter_definition="projected_area_equivalent",
        )
    )
    axis_diameter = calibrate_pixel_trace(
        trace_request(
            calibration=axis_calibration(),
            observable="projected_droplet_diameter",
            diameter_definition="axis_aligned_length",
            coordinate_axis="x",
        )
    )
    assert area_diameter.points[0].value_metres == pytest.approx(3 * math.sqrt(0.002 * 0.001))
    assert axis_diameter.points[0].value_metres == pytest.approx(0.006)


def test_unvalidated_mask_area_remains_a_calibration_proposal():
    content = image_bytes()
    result = measure_image(request(content, segmentation_validation_reference=None), content)
    assert result.status == "measurement_proposal"
    assert result.foreground_area_square_metres is None
    assert result.calibrated_area_proposal_square_metres == pytest.approx(24e-6)


def test_axis_length_uses_frame_extent_rather_than_area_equivalent_diameter_bound():
    calibration = {
        **axis_calibration(),
        "calibrated_image_width": 500,
        "calibrated_image_height": 2,
    }
    points = [point.model_dump() for point in trace_request().points]
    for point, value in zip(points, (100.0, 120.0, 140.0), strict=True):
        point["pixel_value"] = value
    result = calibrate_pixel_trace(
        trace_request(
            calibration=calibration,
            points=points,
            observable="projected_droplet_diameter",
            diameter_definition="axis_aligned_length",
            coordinate_axis="x",
        )
    )
    assert [point.value_metres for point in result.points] == pytest.approx([0.2, 0.24, 0.28])

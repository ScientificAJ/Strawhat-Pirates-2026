"""Bounded image measurements and time-series calibration with inspectable pixel origins."""

from __future__ import annotations

import hashlib
import io
from math import isfinite, pi, sqrt
from typing import Literal

import numpy as np
from nova_ember.domain.scientific import (
    Finite,
    Identifier,
    MethodContext,
    Positive,
    Refusal,
    ScientificInput,
)
from PIL import Image, UnidentifiedImageError
from pydantic import Field, model_validator
from scipy import ndimage  # type: ignore[import-untyped]

MAX_IMAGE_BYTES = 20 * 1024 * 1024
MAX_IMAGE_PIXELS = 8 * 1024 * 1024
MAX_ROI_PIXELS = 4 * 1024 * 1024


class PixelRegion(ScientificInput):
    left: int = Field(strict=True, ge=0, le=32768)
    top: int = Field(strict=True, ge=0, le=32768)
    right: int = Field(strict=True, ge=1, le=32768)
    bottom: int = Field(strict=True, ge=1, le=32768)

    @model_validator(mode="after")
    def nonempty(self) -> PixelRegion:
        if self.right <= self.left or self.bottom <= self.top:
            raise ValueError("ROI uses nonempty left/top-inclusive, right/bottom-exclusive bounds.")
        if (self.right - self.left) * (self.bottom - self.top) > MAX_ROI_PIXELS:
            raise ValueError("Selected ROI exceeds the bounded measurement pixel count.")
        if max(self.right - self.left, self.bottom - self.top) > 4096:
            raise ValueError("Select an ROI no larger than 4096 pixels on either axis.")
        return self


class SpatialCalibration(ScientificInput):
    metres_per_pixel: Positive | None = None
    metres_per_pixel_x: Positive | None = None
    metres_per_pixel_y: Positive | None = None
    x_calibration_reference: Identifier | None = None
    y_calibration_reference: Identifier | None = None
    calibration_reference: Identifier
    calibrated_image_width: int = Field(strict=True, ge=1, le=32768)
    calibrated_image_height: int = Field(strict=True, ge=1, le=32768)
    origin_pixel: Finite = 0.0
    origin_metres: Finite = 0.0
    viewing_geometry: Literal["planar_orthographic", "unresolved"]
    geometry_reference: Identifier
    square_pixel_justification: Identifier | None = None

    @model_validator(mode="after")
    def explicit_axes(self) -> SpatialCalibration:
        if self.metres_per_pixel is not None:
            if self.metres_per_pixel_x is not None or self.metres_per_pixel_y is not None:
                raise ValueError(
                    "Choose isotropic calibration or explicit x/y calibration, not both."
                )
            if self.square_pixel_justification is None:
                raise ValueError("Isotropic calibration requires its square-pixel justification.")
        elif (
            self.metres_per_pixel_x is None
            or self.metres_per_pixel_y is None
            or self.x_calibration_reference is None
            or self.y_calibration_reference is None
        ):
            raise ValueError(
                "Axis-specific calibration needs both scales and their source references."
            )
        return self

    def axis_scale(self, axis: Literal["x", "y"]) -> float:
        value = self.metres_per_pixel
        if value is None:
            value = self.metres_per_pixel_x if axis == "x" else self.metres_per_pixel_y
        if value is None:
            raise ValueError("The selected spatial calibration axis is unresolved.")
        return value


class ImageMeasurementRequest(ScientificInput):
    expected_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    frame_index: int = Field(default=0, strict=True, ge=0, le=10000)
    roi: PixelRegion
    observable: Literal["luminous_edge", "pyrolysis_front", "char_boundary", "projected_droplet"]
    measurement_axis: Literal["x", "y"] = "x"
    boundary_direction: Literal["increasing", "decreasing"] = "increasing"
    intensity_channel: Literal["luminance_bt601", "red", "green", "blue", "grayscale"]
    threshold: int = Field(strict=True, ge=0, le=255)
    foreground: Literal["at_or_above", "at_or_below"]
    component_id: int | None = Field(default=None, strict=True, ge=1, le=1000)
    calibration: SpatialCalibration | None = None
    segmentation_validation_reference: Identifier | None = None
    observable_definition_reference: Identifier | None = None
    context: MethodContext


class ComponentSummary(ScientificInput):
    component_id: int
    pixel_count: int
    bounding_box: PixelRegion


class BoundaryPixel(ScientificInput):
    x: int
    y: int
    coordinate_metres: Finite | None


class ImageMeasurementResult(ScientificInput):
    status: Literal["calibrated_measurement", "measurement_proposal"]
    method_id: Literal["roi-threshold-boundary-measurement-v1"] = (
        "roi-threshold-boundary-measurement-v1"
    )
    context: MethodContext
    request: ImageMeasurementRequest
    source_sha256: str
    source_format: str
    source_mode: str
    source_width: int
    source_height: int
    selected_frame_index: int
    frame_count: int
    component_count: int
    components: tuple[ComponentSummary, ...]
    selected_component_id: int | None
    foreground_pixel_count: int
    foreground_area_square_metres: Positive | None
    calibrated_area_proposal_square_metres: Positive | None
    boundary_pixels: tuple[BoundaryPixel, ...]
    median_boundary_coordinate_pixels: Finite | None
    projected_area_equivalent_diameter_pixels: Positive | None
    value_metres: Finite | None
    calibrated_proposal_metres: Finite | None
    measurement_definition: str
    missing_requirements: tuple[str, ...]
    pillow_version: str
    limitations: tuple[str, ...]


def measure_image(
    request: ImageMeasurementRequest, content: bytes
) -> ImageMeasurementResult | Refusal:
    """Read selected immutable bytes, never a path/URL, and never guess a physical scale.

    Pixels use original image coordinates and integer pixel centers. The image is
    not resized, auto-oriented or color-corrected before thresholding.
    """
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("Image exceeds the 20 MiB compressed-byte limit.")
    digest = hashlib.sha256(content).hexdigest()
    if digest != request.expected_sha256:
        raise ValueError("Image bytes differ from the selected immutable SHA-256.")
    try:
        with Image.open(io.BytesIO(content), formats=["PNG", "JPEG", "TIFF", "BMP"]) as image:
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError(
                    "Image exceeds the decoded-pixel limit; select a frozen crop first."
                )
            if image.getexif().get(274, 1) != 1:
                raise ValueError(
                    "Non-default EXIF orientation needs an explicitly transformed source."
                )
            frames = getattr(image, "n_frames", 1)
            if request.frame_index >= frames:
                raise ValueError("Selected image frame index is absent.")
            image.seek(request.frame_index)
            if image.width * image.height > MAX_IMAGE_PIXELS:
                raise ValueError("Selected frame exceeds the decoded-pixel limit.")
            image.load()
            width, height, mode = image.width, image.height, image.mode
            source_format = image.format or "unknown"
            if request.roi.right > width or request.roi.bottom > height:
                raise ValueError("ROI leaves the selected original image/frame.")
            if mode not in ("L", "RGB"):
                raise ValueError(
                    "Measurement requires explicit 8-bit L/RGB source conversion first."
                )
            if request.intensity_channel == "grayscale" and mode != "L":
                raise ValueError("A color image needs an explicitly selected channel or luminance.")
            if request.intensity_channel in ("red", "green", "blue") and mode != "RGB":
                raise ValueError("A single-channel source has no separately measured RGB channels.")
            roi_image = image.crop(
                (request.roi.left, request.roi.top, request.roi.right, request.roi.bottom)
            )
            if mode == "L":
                intensity = np.array(roi_image, dtype=np.uint8)
            elif request.intensity_channel == "luminance_bt601":
                intensity = np.array(roi_image.convert("L"), dtype=np.uint8)
            else:
                channel = {"red": 0, "green": 1, "blue": 2}[request.intensity_channel]
                intensity = np.array(roi_image.getchannel(channel), dtype=np.uint8)
    except (UnidentifiedImageError, OSError, EOFError, Image.DecompressionBombError) as error:
        raise ValueError("Source is not a supported complete bounded image.") from error
    calibration = request.calibration
    if calibration is not None and (
        calibration.calibrated_image_width != width or calibration.calibrated_image_height != height
    ):
        raise ValueError("Calibration image dimensions differ from the selected unresized frame.")
    mask = (
        intensity >= request.threshold
        if request.foreground == "at_or_above"
        else intensity <= request.threshold
    )
    labels, component_count = ndimage.label(mask)
    if component_count == 0:
        return Refusal(
            status="needs_data",
            method_id="roi-threshold-boundary-measurement-v1",
            reasons=(
                "The selected threshold/ROI contains no foreground; no physical boundary "
                "is inferred.",
            ),
            required_inputs=("inspect threshold, ROI and observable against original source",),
            context=request.context,
        )
    if component_count > 1000:
        return Refusal(
            status="unsupported",
            method_id="roi-threshold-boundary-measurement-v1",
            reasons=(
                "More than 1000 foreground components require an explicitly reviewed smaller ROI.",
            ),
            context=request.context,
        )
    if request.component_id is not None and request.component_id > component_count:
        raise ValueError(
            "Selected connected component does not exist in the frozen threshold mask."
        )
    objects = ndimage.find_objects(labels)
    counts = np.bincount(labels.ravel())
    components = tuple(
        ComponentSummary(
            component_id=index + 1,
            pixel_count=int(counts[index + 1]),
            bounding_box=PixelRegion(
                left=region[1].start + request.roi.left,
                top=region[0].start + request.roi.top,
                right=region[1].stop + request.roi.left,
                bottom=region[0].stop + request.roi.top,
            ),
        )
        for index, region in enumerate(objects)
        if region is not None
    )
    selected_id = request.component_id or (1 if component_count == 1 else None)
    missing = []
    if selected_id is None:
        missing.append("select one connected component explicitly")
    if calibration is None:
        missing.append("spatial calibration")
    elif calibration.viewing_geometry != "planar_orthographic":
        missing.append("validated planar orthographic viewing geometry")
    if request.segmentation_validation_reference is None:
        missing.append("source-specific validation against labeled segmentation frames")
    if request.observable_definition_reference is None:
        missing.append("source-specific physical observable definition")
    calibrated = calibration is not None and calibration.viewing_geometry == "planar_orthographic"
    boundary, coordinate, diameter, proposed_metres = [], None, None, None
    physical_area = None
    foreground_count = int(np.count_nonzero(mask))
    if selected_id is not None:
        selected_mask = labels == selected_id
        foreground_count = int(np.count_nonzero(selected_mask))
        traversed = selected_mask if request.measurement_axis == "x" else selected_mask.T
        for cross_axis, row in enumerate(traversed):
            coordinates = np.flatnonzero(row)
            if coordinates.size:
                along = int(
                    coordinates[-1]
                    if request.boundary_direction == "increasing"
                    else coordinates[0]
                )
                x = (along if request.measurement_axis == "x" else cross_axis) + request.roi.left
                y = (cross_axis if request.measurement_axis == "x" else along) + request.roi.top
                absolute_along = x if request.measurement_axis == "x" else y
                position = (
                    calibration.origin_metres
                    + (absolute_along - calibration.origin_pixel)
                    * calibration.axis_scale(request.measurement_axis)
                    if calibrated and calibration is not None
                    else None
                )
                boundary.append(BoundaryPixel(x=x, y=y, coordinate_metres=position))
        coordinate = float(
            np.median(
                [point.x if request.measurement_axis == "x" else point.y for point in boundary]
            )
        )
        diameter = 2 * sqrt(foreground_count / pi)
        if calibrated and calibration is not None:
            physical_area = (
                foreground_count * calibration.axis_scale("x") * calibration.axis_scale("y")
            )
            if not isfinite(physical_area) or physical_area <= 0:
                raise ValueError("Calibrated foreground area exceeds finite numerical range.")
            proposed_metres = (
                2 * sqrt(physical_area / pi)
                if request.observable == "projected_droplet"
                else calibration.origin_metres
                + (coordinate - calibration.origin_pixel)
                * calibration.axis_scale(request.measurement_axis)
            )
            if not isfinite(proposed_metres):
                raise ValueError("Calibrated image measurement exceeds finite numerical range.")
    return ImageMeasurementResult(
        status="calibrated_measurement" if not missing else "measurement_proposal",
        context=request.context,
        request=request,
        source_sha256=digest,
        source_format=source_format,
        source_mode=mode,
        source_width=width,
        source_height=height,
        selected_frame_index=request.frame_index,
        frame_count=frames,
        component_count=component_count,
        components=components,
        selected_component_id=selected_id,
        foreground_pixel_count=foreground_count,
        foreground_area_square_metres=physical_area if not missing else None,
        calibrated_area_proposal_square_metres=physical_area,
        boundary_pixels=tuple(boundary),
        median_boundary_coordinate_pixels=coordinate,
        projected_area_equivalent_diameter_pixels=diameter,
        value_metres=proposed_metres if not missing else None,
        calibrated_proposal_metres=proposed_metres,
        measurement_definition=(
            "Projected-area equivalent diameter = 2 sqrt(foreground pixel area / pi); not "
            "inferred volume diameter."
            if request.observable == "projected_droplet"
            else "Median selected leading-edge pixel-center coordinate across occupied ROI "
            "scan lines."
        ),
        missing_requirements=tuple(missing),
        pillow_version=Image.__version__,
        limitations=(
            "Threshold segmentation is a proposal until validated on labeled "
            "source-specific frames.",
            "The luminance_bt601 option is an 8-bit RGB luma-weighted grayscale transform, "
            "not a calibrated radiometric luminance measurement.",
            "Image color/intensity does not establish temperature or complete chemical extinction.",
            "Luminous edge, pyrolysis front and char boundary are different physical observables.",
            "Square-pixel planar calibration cannot correct unresolved perspective or "
            "depth motion.",
            "Pixel quantization/calibration uncertainty remains unreported unless "
            "separately supplied.",
        ),
    )


class PixelTracePoint(ScientificInput):
    source_locator: Identifier
    pixel_value: Finite
    frame_index: int | None = Field(default=None, strict=True, ge=0, le=10**9)
    time_seconds: Finite | None = None
    source_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    exclude_reason: Identifier | None = None

    @model_validator(mode="after")
    def one_time_basis(self) -> PixelTracePoint:
        if (self.frame_index is None) == (self.time_seconds is None):
            raise ValueError(
                "Each trace point requires exactly one frame index or source timestamp."
            )
        return self


class PixelTraceRequest(ScientificInput):
    points: tuple[PixelTracePoint, ...] = Field(min_length=1, max_length=100000)
    calibration: SpatialCalibration
    observable: Literal[
        "luminous_edge", "pyrolysis_front", "char_boundary", "projected_droplet_diameter"
    ]
    coordinate_definition: Identifier
    coordinate_axis: Literal["x", "y"] = "x"
    diameter_definition: Literal["projected_area_equivalent", "axis_aligned_length"] = (
        "projected_area_equivalent"
    )
    segmentation_validation_reference: Identifier | None = None
    time_calibration_reference: Identifier | None = None
    time_origin_definition: Identifier
    fps_numerator: int | None = Field(default=None, strict=True, ge=1, le=1000000)
    fps_denominator: int | None = Field(default=None, strict=True, ge=1, le=1000000)
    time_origin_frame: int = Field(default=0, strict=True, ge=0)
    time_origin_seconds: Finite = 0.0
    frame_timing_assumption: Identifier | None = None
    context: MethodContext

    @model_validator(mode="after")
    def frame_clock(self) -> PixelTraceRequest:
        if any(point.frame_index is not None for point in self.points) and (
            self.fps_numerator is None
            or self.fps_denominator is None
            or self.frame_timing_assumption is None
        ):
            raise ValueError(
                "Frame-index timing requires a declared rational frame rate and timing assumption."
            )
        if len({point.source_locator for point in self.points}) != len(self.points):
            raise ValueError("Each trace sample must have a unique original source locator.")
        return self


class CalibratedTracePoint(ScientificInput):
    source_locator: str
    source_sha256: str
    original_pixel_value: Finite
    time_seconds: Finite
    value_metres: Finite
    exclude_reason: str | None


class PixelTraceResult(ScientificInput):
    status: Literal["calibrated_trace", "measurement_proposal"]
    method_id: Literal["explicit-pixel-clock-calibration-v1"] = (
        "explicit-pixel-clock-calibration-v1"
    )
    context: MethodContext
    request: PixelTraceRequest
    points: tuple[CalibratedTracePoint, ...]
    missing_requirements: tuple[str, ...]
    independent_run_count: None = None
    limitations: tuple[str, ...]


def calibrate_pixel_trace(request: PixelTraceRequest) -> PixelTraceResult:
    missing = []
    if request.calibration.viewing_geometry != "planar_orthographic":
        missing.append("validated planar orthographic viewing geometry")
    if request.segmentation_validation_reference is None:
        missing.append("source-specific annotation/segmentation validation")
    if request.time_calibration_reference is None:
        missing.append("source clock/frame timebase calibration")
    points = []
    previous = None
    for point in request.points:
        extent = (
            request.calibration.calibrated_image_width
            if request.coordinate_axis == "x"
            else request.calibration.calibrated_image_height
        )
        if (
            request.observable != "projected_droplet_diameter"
            and not 0 <= point.pixel_value < extent
        ):
            raise ValueError("Annotated coordinate lies outside its original calibrated frame.")
        if (
            request.observable == "projected_droplet_diameter"
            and request.diameter_definition == "projected_area_equivalent"
            and point.pixel_value
            > 2
            * sqrt(
                request.calibration.calibrated_image_width
                * request.calibration.calibrated_image_height
                / pi
            )
        ):
            raise ValueError(
                "Projected-area diameter exceeds the entire frame's available pixel area."
            )
        if point.time_seconds is not None:
            time = point.time_seconds
        else:
            assert point.frame_index is not None
            assert request.fps_numerator is not None and request.fps_denominator is not None
            time = request.time_origin_seconds + (
                (point.frame_index - request.time_origin_frame)
                * request.fps_denominator
                / request.fps_numerator
            )
        if previous is not None and time <= previous:
            raise ValueError(
                "Calibrated trace time must increase; samples are not silently reordered."
            )
        previous = time
        if request.observable == "projected_droplet_diameter":
            if point.pixel_value <= 0:
                raise ValueError("A measured pixel diameter must be positive.")
            if request.diameter_definition == "axis_aligned_length":
                if point.pixel_value > extent:
                    raise ValueError("Axis-aligned diameter exceeds the calibrated frame extent.")
                scale = request.calibration.axis_scale(request.coordinate_axis)
            else:
                scale = sqrt(request.calibration.axis_scale("x")) * sqrt(
                    request.calibration.axis_scale("y")
                )
            value = point.pixel_value * scale
        else:
            value = request.calibration.origin_metres + (
                point.pixel_value - request.calibration.origin_pixel
            ) * request.calibration.axis_scale(request.coordinate_axis)
        if not isfinite(value) or not isfinite(time):
            raise ValueError("Calibrated trace exceeds finite numerical range.")
        if request.observable == "projected_droplet_diameter" and value <= 0:
            raise ValueError("A positive calibrated diameter underflows the numerical range.")
        points.append(
            CalibratedTracePoint(
                source_locator=point.source_locator,
                source_sha256=point.source_sha256,
                original_pixel_value=point.pixel_value,
                time_seconds=time,
                value_metres=value,
                exclude_reason=point.exclude_reason,
            )
        )
    return PixelTraceResult(
        status="measurement_proposal" if missing else "calibrated_trace",
        context=request.context,
        request=request,
        points=tuple(points),
        missing_requirements=tuple(missing),
        limitations=(
            "Repeated frames/samples do not establish independent experimental runs.",
            "Constant frame rate must be supported; variable-rate video requires original "
            "timestamps.",
            "No ignition transient, burning regime or fit interval is chosen automatically.",
            "A projected droplet diameter does not imply a volume-equivalent diameter "
            "without evidence.",
        ),
    )

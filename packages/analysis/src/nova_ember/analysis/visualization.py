"""An explicitly assumed D²-law teaching model, separate from experiment data."""

from __future__ import annotations

from math import isfinite, sqrt
from types import MappingProxyType
from typing import Annotated, Literal

from nova_ember.domain.scientific import (
    Fraction,
    MethodContext,
    Nonnegative,
    Positive,
    ScientificInput,
)
from pydantic import Field, model_validator

MODEL_ID: Literal["droplet_d_squared_v1"] = "droplet_d_squared_v1"
MODEL_UNITS = MappingProxyType(
    {
        "initial_diameter_mm": "mm",
        "burning_constant_mm2_s": "mm^2/s",
        "time_s": "s",
        "diameter_mm": "mm",
        "diameter_squared_mm2": "mm^2",
        "relative_mass": "1",
        "idealized_endpoint_s": "s",
    }
)
REFERENCES = (
    "https://ntrs.nasa.gov/citations/19890010934",
    "https://www.princeton.edu/~fldryer/nasa.dir/backgrnd.htm",
)


class DropletModelInputs(ScientificInput):
    """Use mm, mm²/s and explicit assumptions; no source coefficient is inferred.

    The sample-count bound is a response-size profile, not a validated physical
    domain. This educational path does not accept a measured-input designation.
    A calibrated fit and its applicability need a separately verified handoff.
    """

    model_id: Literal["droplet_d_squared_v1"] = MODEL_ID
    investigation_accession: Annotated[str, Field(pattern=r"^PSI-[1-9][0-9]{0,5}$")] | None = None
    initial_diameter_mm: Positive
    burning_constant_mm2_s: Positive
    sample_count: int = Field(default=241, strict=True, ge=2, le=601)
    context: MethodContext

    @model_validator(mode="after")
    def supported_numeric_profile(self) -> DropletModelInputs:
        if self.context.input_origin == "measured":
            raise ValueError(
                "This teaching model requires analyst_input or synthetic_reference context; "
                "its assumed parameters are not recorded measurements."
            )
        squared = self.initial_diameter_mm * self.initial_diameter_mm
        endpoint = squared / self.burning_constant_mm2_s
        if not isfinite(squared) or squared <= 0 or not isfinite(endpoint) or endpoint <= 0:
            raise ValueError(
                "The derived diameter square and endpoint must be finite and positive."
            )
        intervals = self.sample_count - 1
        if squared / intervals == 0:
            raise ValueError("The diameter-square samples underflow the supported numeric profile.")
        previous = 0.0
        for index in range(1, self.sample_count):
            time = endpoint * (index / intervals)
            if time <= previous:
                raise ValueError(
                    "The sample times cannot be represented in strictly increasing order."
                )
            previous = time
        return self


class DropletVisualizationRequest(DropletModelInputs):
    parameter_origin: Literal["analyst_assumptions"] = "analyst_assumptions"


class SourceReportedDropletInputs(DropletModelInputs):
    """Constructed by the source-profile reader, never accepted by the editable API."""

    parameter_origin: Literal["source_reported_nominal"] = "source_reported_nominal"
    source_profile_id: Literal["flex-007-nominal-v1"] = "flex-007-nominal-v1"


class DropletVisualizationPoint(ScientificInput):
    time_s: Nonnegative
    diameter_mm: Nonnegative
    diameter_squared_mm2: Nonnegative
    relative_mass: Fraction


class VisualizationQuantity(ScientificInput):
    value: Positive
    unit: Literal["mm", "mm^2", "mm^2/s", "s"]


class DropletVisualizationResult(ScientificInput):
    status: Literal["illustrative_model"] = "illustrative_model"
    method_id: Literal["droplet_d_squared_v1"] = MODEL_ID
    model_id: Literal["droplet_d_squared_v1"] = MODEL_ID
    origin: Literal["deterministic_calculation"] = "deterministic_calculation"
    parameter_origin: Literal["analyst_assumptions", "source_reported_nominal"]
    artifact_type: Literal["educational_simulation"] = "educational_simulation"
    scientific_qualification: str = (
        "An analytical teaching calculation using assumed parameters. This is not a NASA "
        "measurement, validated experimental reconstruction or operational safety prediction."
    )
    requires_open: Literal[True] = True
    autoplay: Literal[False] = False
    context: MethodContext
    request: DropletVisualizationRequest | SourceReportedDropletInputs
    initial_diameter_squared_mm2: Positive
    idealized_endpoint_s: Positive
    point_count: int = Field(strict=True, ge=2, le=601)
    summaries: dict[str, VisualizationQuantity]
    points: tuple[DropletVisualizationPoint, ...] = Field(min_length=2, max_length=601)
    equations: tuple[str, ...]
    units: dict[str, str]
    assumptions: tuple[str, ...]
    limitations: tuple[str, ...]
    references: tuple[str, ...]


def calculate_droplet_visualization(
    request: DropletVisualizationRequest | SourceReportedDropletInputs,
) -> DropletVisualizationResult:
    """Sample the classical constant-K model only on its idealized interval.

    The coefficient is assigned, not predicted from fuel, pressure, oxygen or
    gravity. Sampling by a normalized remaining fraction avoids subtractive
    cancellation at the endpoint; display rounding belongs to the frontend.
    """
    initial_squared = request.initial_diameter_mm * request.initial_diameter_mm
    endpoint = initial_squared / request.burning_constant_mm2_s
    intervals = request.sample_count - 1
    points = []
    for index in range(request.sample_count):
        progress = index / intervals
        remaining = (intervals - index) / intervals
        squared = initial_squared * remaining
        points.append(
            DropletVisualizationPoint(
                time_s=endpoint * progress,
                diameter_mm=sqrt(squared),
                diameter_squared_mm2=squared,
                relative_mass=remaining**1.5,
            )
        )
    return DropletVisualizationResult(
        parameter_origin=request.parameter_origin,
        scientific_qualification=(
            "An analytical teaching calculation using assumed parameters, not NASA measurements "
            "or a validated experimental reconstruction."
            if request.parameter_origin == "analyst_assumptions"
            else "A classical D²-law trajectory computed from source-reported nominal diameter "
            "and coefficient under a constant-K approximation. This is not a newly calibrated "
            "fit, experimental reconstruction or operational safety prediction."
        ),
        context=request.context,
        request=request,
        initial_diameter_squared_mm2=initial_squared,
        idealized_endpoint_s=endpoint,
        point_count=len(points),
        summaries={
            "initial_diameter": VisualizationQuantity(value=request.initial_diameter_mm, unit="mm"),
            "burning_constant": VisualizationQuantity(
                value=request.burning_constant_mm2_s, unit="mm^2/s"
            ),
            "initial_diameter_squared": VisualizationQuantity(value=initial_squared, unit="mm^2"),
            "idealized_endpoint": VisualizationQuantity(value=endpoint, unit="s"),
        },
        points=tuple(points),
        equations=(
            "D(t)^2 = D0^2 - K t, for 0 <= t <= D0^2/K",
            "D(t) = sqrt(D0^2 - K t)",
            "t_ideal = D0^2 / K",
            "m(t)/m0 = (D(t)/D0)^3 = (1 - t/t_ideal)^(3/2)",
            "K = -d(D^2)/dt is an assigned positive coefficient in this model",
        ),
        units=dict(MODEL_UNITS),
        assumptions=(
            "One isolated spherical single-component droplet in a large, quiescent environment.",
            "Negligible buoyancy, forced flow, droplet interactions and support effects.",
            "Quasi-steady gas transport, constant gas properties and an assigned constant K.",
            "Constant uniform liquid density and temperature; "
            "the initial heating transient is omitted.",
            "The classical reaction-sheet approximation assumes fast chemistry "
            "and unity Lewis number.",
            "Radiative heat loss, finite-rate chemistry and multicomponent "
            "composition changes are omitted.",
            "Relative mass follows spherical geometry at constant density; no density is inferred.",
            (
                "Every displayed model parameter is an analyst assumption, not a NASA measurement."
                if request.parameter_origin == "analyst_assumptions"
                else "Diameter and coefficient are source-reported nominal values; "
                "applying a constant-K law does not reproduce or validate the recorded history."
            ),
        ),
        limitations=(
            "The idealized zero-diameter endpoint is not a prediction of actual flame extinction.",
            "This model cannot predict ignition, finite-diameter extinction, "
            "cool flames or reignition.",
            "No flame temperature, soot concentration, species profile, "
            "flame radius or radiation is calculated.",
            "A rendered flame envelope and its colors or thickness are schematic display choices.",
            (
                "A source investigation or snapshot supplies context, "
                "not calibration of these assumed parameters."
                if request.parameter_origin == "analyst_assumptions"
                else "Source-reported nominal diameter and coefficient supply numerical inputs, "
                "not pixel/clock calibration or an independently reproduced fit."
            ),
            (
                "The ambiguous FLEX 'Burning rate; mm' header is not interpreted "
                "as a coefficient in mm^2/s."
                if request.parameter_origin == "analyst_assumptions"
                else "The source profile uses the unit-bearing test-sheet kavg, "
                "not the ambiguous FLEX CSV 'Burning rate; mm' column."
            ),
            "Agreement with this analytical law does not validate a recorded run "
            "or operational safety.",
            "Input uncertainty is unreported; no confidence or prediction interval is inferred.",
        ),
        references=REFERENCES,
    )

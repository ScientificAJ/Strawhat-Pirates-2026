"""Contracts shared by registered scientific methods, separate from source cells."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Finite = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Positive = Annotated[Finite, Field(gt=0)]
Nonnegative = Annotated[Finite, Field(ge=0)]
Fraction = Annotated[Finite, Field(ge=0, le=1)]
Identifier = Annotated[str, Field(min_length=1, max_length=512)]

COMPARISON_FIELDS = (
    "endpoint",
    "protocol",
    "material",
    "geometry",
    "atmosphere",
    "flow",
    "gravity",
    "apparatus",
    "measurement",
    "material_formulation",
    "thickness",
    "support",
    "backing",
    "scale",
    "oxygen_fraction",
    "composition_basis",
    "composition_location",
    "dry_wet_basis",
    "pressure",
    "pressure_reference",
    "temperature",
    "diluent_composition",
    "flow_velocity",
    "flow_direction",
    "flow_reference_conditions",
    "gravity_magnitude",
    "gravity_direction",
    "gravity_time_history",
    "confinement",
    "ignition_protocol",
    "sensor_response",
    "observation_window",
    "data_processing",
)


class ScientificInput(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class EvidenceReference(ScientificInput):
    source_id: Identifier
    locator: Identifier
    asset_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")] | None = None


class MethodContext(ScientificInput):
    """Provenance supplied with inputs; a synthetic reference is never a measurement."""

    input_origin: Literal["measured", "analyst_input", "synthetic_reference"]
    sources: tuple[EvidenceReference, ...] = Field(min_length=1, max_length=1000)
    source_snapshot: Annotated[str, Field(max_length=128)] | None = None
    conditions: dict[str, str] = Field(default_factory=dict, max_length=64)
    assumptions: tuple[str, ...] = Field(default=(), max_length=64)


class Refusal(ScientificInput):
    status: Literal["needs_data", "unsupported", "outside_validated_domain"]
    method_id: str
    reasons: tuple[str, ...]
    required_inputs: tuple[str, ...] = ()
    value: None = None
    context: MethodContext


class ScalarResult(ScientificInput):
    status: Literal["calculated"] = "calculated"
    method_id: str
    value: Finite
    unit: str
    definition: str
    origin: Literal["deterministic_calculation"] = "deterministic_calculation"
    context: MethodContext
    inputs: dict[str, object]
    assumptions: tuple[str, ...] = ()
    limitations: tuple[str, ...] = ()


class Interval(ScientificInput):
    lower: Finite
    upper: Finite
    level: Fraction
    interpretation: str

    @model_validator(mode="after")
    def ordered(self) -> Interval:
        if self.lower > self.upper:
            raise ValueError("Interval lower bound exceeds its upper bound.")
        return self

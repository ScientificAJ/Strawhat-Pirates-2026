"""Typed source locations and research objects; origin is distinct from support."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
Accession = Annotated[str, Field(pattern=r"^PSI-[1-9][0-9]{0,5}$")]
ScientificOrigin = Literal[
    "source_reported",
    "measured",
    "derived",
    "predicted",
    "synthesized",
    "hypothetical",
    "unknown",
    "conflicting",
]
CoverageState = Literal[
    "available",
    "catalog_only",
    "not_studied",
    "not_released",
    "not_ingested",
    "missing",
    "unusable",
    "outside_domain",
    "unknown",
]
ConditionKey = Annotated[str, Field(min_length=1, max_length=128)]
ConditionValue = (
    Annotated[str, Field(min_length=1, max_length=1000)]
    | Annotated[float, Field(strict=True)]
    | None
)


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)


class EvidenceAnchor(Contract):
    snapshot_id: Digest
    source_kind: Literal["psi", "ntrs"] = "psi"
    accession: Accession | None = None
    investigation_version: int | None = Field(default=None, ge=1)
    document_id: str | None = Field(default=None, pattern=r"^[0-9]{11}$")
    capture_id: Digest | None = None
    source_sha256: Digest
    asset_id: str | None = Field(default=None, min_length=1, max_length=1024)
    kind: Literal[
        "metadata_field",
        "table_cell",
        "text_lines",
        "workbook_cell",
        "document_page",
        "document_paragraph",
        "document_figure",
        "media_frame",
    ]
    field: str | None = Field(default=None, min_length=1, max_length=128)
    source_row: int | None = Field(default=None, ge=1)
    column: int | None = Field(default=None, ge=0, le=10000)
    line_end: int | None = Field(default=None, ge=1)
    sheet: str | None = Field(default=None, min_length=1, max_length=128)
    cell: str | None = Field(default=None, pattern=r"^[A-Z]{1,3}[1-9][0-9]{0,6}$")
    page: int | None = Field(default=None, ge=1, le=100000)
    paragraph: int | None = Field(default=None, ge=1, le=100000)
    member: str | None = Field(default=None, min_length=1, max_length=2048)
    member_sha256: Digest | None = None
    frame: int | None = Field(default=None, ge=0)
    start: int | None = Field(default=None, ge=0)
    end: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def require_locator(self) -> EvidenceAnchor:
        if self.source_kind == "psi":
            if self.accession is None or self.investigation_version is None:
                raise ValueError("A PSI anchor requires its accession and investigation version.")
            if self.document_id is not None or self.capture_id is not None:
                raise ValueError("A PSI source anchor cannot carry an NTRS document identity.")
        elif (
            self.document_id is None
            or self.capture_id is None
            or self.kind != "document_page"
            or self.accession is not None
            or self.investigation_version is not None
            or self.asset_id is not None
        ):
            raise ValueError(
                "An NTRS page anchor requires its document/capture IDs, not a PSI identity."
            )
        required = {
            "metadata_field": (self.field,),
            "table_cell": (self.source_row, self.column),
            "text_lines": (self.source_row, self.line_end),
            "workbook_cell": (self.sheet, self.cell),
            "document_page": (self.page,),
            "document_paragraph": (self.paragraph,),
            "document_figure": (self.member, self.member_sha256),
            "media_frame": (self.frame,),
        }
        if any(value is None for value in required[self.kind]):
            raise ValueError("Evidence kind requires its exact source locator.")
        if (
            self.line_end is not None
            and self.source_row is not None
            and self.line_end < self.source_row
        ):
            raise ValueError("Evidence line interval is reversed.")
        incomplete_span = (self.start is None) != (self.end is None)
        reversed_span = self.start is not None and self.end is not None and self.end <= self.start
        if incomplete_span or reversed_span:
            raise ValueError("An exact character range requires start < end.")
        return self


class Claim(Contract):
    id: str = Field(min_length=1, max_length=128)
    text: str = Field(min_length=1, max_length=8000)
    origin: ScientificOrigin
    anchors: tuple[EvidenceAnchor, ...] = Field(default=(), max_length=100)
    endpoint: str | None = Field(default=None, max_length=128)
    unit: str | None = Field(default=None, max_length=64)
    numeric_value: float | None = None
    calculation_id: str | None = Field(default=None, max_length=128)
    model_version: str | None = Field(default=None, max_length=128)
    conditions: dict[ConditionKey, ConditionValue] = Field(default_factory=dict, max_length=64)
    assumptions: tuple[str, ...] = Field(default=(), max_length=100)
    limitations: tuple[str, ...] = Field(default=(), max_length=100)

    @model_validator(mode="after")
    def validate_numerical_provenance(self) -> Claim:
        if any(isinstance(value, str) and not value.strip() for value in self.conditions.values()):
            raise ValueError("Blank condition text is not a known scientific condition.")
        condition_endpoint = self.conditions.get("endpoint")
        if self.endpoint is not None and condition_endpoint not in (None, self.endpoint):
            raise ValueError("The claim endpoint and its condition scope disagree.")
        if self.numeric_value is not None and not self.unit:
            raise ValueError("Numerical claims require an explicit unit, including dimensionless.")
        if self.origin in {"measured", "source_reported"} and not self.anchors:
            raise ValueError("Source-reported claims require source anchors.")
        if self.origin == "derived" and not self.calculation_id:
            raise ValueError("Derived claims require a calculation identifier.")
        if self.origin == "predicted" and not self.model_version:
            raise ValueError("Predicted claims require a model version.")
        return self


class EvidenceRelation(Contract):
    source: str = Field(min_length=1, max_length=128)
    target: str = Field(min_length=1, max_length=128)
    relation: Literal[
        "supports",
        "contradicts",
        "qualifies",
        "depends_on",
        "derived_from",
        "same_hardware_context",
        "related_investigation",
        "replicates",
        "duplicate_publication",
    ]
    anchors: tuple[EvidenceAnchor, ...] = Field(default=(), max_length=30)
    explanation: str = Field(min_length=1, max_length=4000)


class Hypothesis(Contract):
    question: str = Field(min_length=1, max_length=2000)
    mechanism: str = Field(min_length=1, max_length=4000)
    supporting: tuple[Claim, ...] = Field(default=(), max_length=30)
    contrary: tuple[Claim, ...] = Field(default=(), max_length=30)
    predicted_observation: str = Field(min_length=1, max_length=4000)
    falsifier: str = Field(min_length=1, max_length=4000)
    assumptions: tuple[str, ...] = Field(min_length=1, max_length=30)
    variables_to_characterize: tuple[str, ...] = Field(min_length=1, max_length=30)


class ControlCandidate(Contract):
    name: str = Field(min_length=1, max_length=200)
    mechanism: str = Field(min_length=1, max_length=4000)
    intended_outcome: str = Field(min_length=1, max_length=1000)
    evidence: tuple[Claim, ...] = Field(min_length=1, max_length=50)
    applicable_configuration: dict[str, str | float | None] = Field(max_length=30)
    countereffects: tuple[str, ...] = Field(default=(), max_length=30)
    interactions: tuple[str, ...] = Field(default=(), max_length=30)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=30)
    validation_status: Literal["source_reported", "research_hypothesis", "unresolved"]
    necessary_validation: tuple[str, ...] = Field(min_length=1, max_length=30)


class EarthTransfer(Contract):
    title: str = Field(min_length=1, max_length=300)
    status: Literal[
        "documented_application", "supported_engineering_connection", "research_hypothesis"
    ]
    evidence: tuple[Claim, ...] = Field(min_length=1, max_length=50)
    shared_mechanism: str = Field(min_length=1, max_length=3000)
    transfer_constraints: dict[str, str | None] = Field(min_length=1, max_length=30)
    limitations: tuple[str, ...] = Field(min_length=1, max_length=30)

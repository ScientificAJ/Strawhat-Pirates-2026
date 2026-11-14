"""Source-linked table interpretation, distinct from independent experimental runs."""

from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

RowKind = Literal[
    "source_test_record",
    "condition_record",
    "range_summary",
    "daily_summary",
    "session_record",
    "sample_record",
    "flow_visualization",
    "note",
    "unclassified_record",
]
FieldStatus = Literal["text", "normalized", "missing", "unresolved"]
MissingReason = Literal["not_reported", "not_applicable", "ambiguous", "invalid"]
SourceValueKind = Literal[
    "source_reported", "measurement", "condition", "setting", "derived", "code", "not_specified"
]


class SourceField(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)

    column_index: int = Field(ge=0)
    source_column: str | None
    raw_text: str
    quantity_kind: str | None = None
    original_unit: str | None = None
    canonical_value: float | None = None
    canonical_unit: str | None = None
    missing_reason: MissingReason | None = None
    qualifier: str | None = None
    status: FieldStatus = "text"
    notes: list[str] = Field(default_factory=list)
    location: str | None = None
    basis: str | None = None
    source_value_kind: SourceValueKind = "not_specified"
    transformation_id: str | None = None
    transformation_formula: str | None = None

    @model_validator(mode="after")
    def check_normalization(self) -> Self:
        if self.status == "normalized":
            if self.canonical_value is None or self.canonical_unit is None:
                raise ValueError("A normalized field requires its value and unit")
            if self.transformation_id is None or self.transformation_formula is None:
                raise ValueError("A normalized field requires its transformation provenance")
            if self.missing_reason is not None:
                raise ValueError("A normalized field cannot also be missing")
        elif self.canonical_value is not None or self.canonical_unit is not None:
            raise ValueError("An unresolved or textual field cannot contain a canonical value")
        return self


class SourceRecord(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    source_row: int = Field(ge=2)
    line_end: int = Field(ge=2)
    row_kind: RowKind
    raw_cells: list[str]
    fields: list[SourceField]

    @model_validator(mode="after")
    def check_source_lines(self) -> Self:
        if self.line_end < self.source_row:
            raise ValueError("The final source line cannot precede the first line")
        return self


class InterpretedTable(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: Literal[1] = 1
    adapter_id: str
    status: Literal["interpreted", "schema_unrecognized"]
    accession: str
    asset_id: str
    file_name: str
    file_version: int = Field(ge=1)
    source_sha256: str
    source_url: str
    headers: list[str]
    records: list[SourceRecord]
    row_kind_counts: dict[RowKind, int]
    source_record_count: int = Field(ge=0)
    independent_run_count: None = None
    empty_record_count: int = Field(ge=0)
    limitations: list[str]
    refusals: list[str] = Field(default_factory=list)

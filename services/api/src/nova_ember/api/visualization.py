"""Bounded educational calculations; opening an interactive view is separate."""

from typing import Literal

from fastapi import APIRouter
from nova_ember.analysis.visualization import (
    DropletVisualizationRequest,
    DropletVisualizationResult,
    SourceReportedDropletInputs,
    calculate_droplet_visualization,
)
from nova_ember.domain.scientific import MethodContext, Nonnegative, Positive
from nova_ember.evidence.contracts import Contract, Digest, EvidenceAnchor
from pydantic import Field, model_validator

from .repository import Corpus
from .source_files import flex_trace

DROPLET_INVESTIGATIONS = frozenset({"PSI-69", "PSI-68"})


class SourceDropletVisualizationRequest(Contract):
    snapshot_id: Digest
    sample_count: int = Field(default=241, strict=True, ge=2, le=601)


class ReportedVisualizationParameter(Contract):
    value: Positive
    unit: Literal["mm", "mm^2/s"]
    origin: Literal["source_reported_nominal"] = "source_reported_nominal"
    anchor: EvidenceAnchor
    source_text: str


class ReportedVisualizationCondition(Contract):
    value: Nonnegative
    unit: Literal["atm", "K", "1"]
    origin: Literal["source_reported_nominal"] = "source_reported_nominal"
    anchor: EvidenceAnchor
    source_text: str
    composition_basis: Literal["mole"] | None = None
    pressure_reference: Literal["unreported"] | None = None

    @model_validator(mode="after")
    def declared_quantity(self):
        if self.unit == "1":
            if self.value > 1 or self.composition_basis != "mole":
                raise ValueError("The reported mole fraction needs its explicit basis and range.")
        elif self.value <= 0:
            raise ValueError("The reported pressure or Kelvin temperature must be positive.")
        if self.unit == "atm" and self.pressure_reference != "unreported":
            raise ValueError("The original pressure reference is not independently established.")
        return self


class SourceDropletVisualizationResult(DropletVisualizationResult):
    source_profile_id: Literal["flex-007-nominal-v1"] = "flex-007-nominal-v1"
    parameter_sources: dict[str, ReportedVisualizationParameter]
    condition_sources: dict[str, ReportedVisualizationCondition]
    source_conditions: dict[str, str]
    source_record_limitations: tuple[str, ...]


def prepare_source_droplet_visualization(
    corpus: Corpus,
    request: SourceDropletVisualizationRequest,
    *,
    expected_snapshot: str | None = None,
    selected_investigations: list[str] | None = None,
) -> SourceDropletVisualizationResult:
    """Use only unit-bearing reported FLEX-007 values resolved by source readers."""
    if expected_snapshot is not None and request.snapshot_id != expected_snapshot:
        raise ValueError("The source profile belongs to a different frozen research context.")
    if selected_investigations is not None and "PSI-69" not in selected_investigations:
        raise ValueError("Select the FLEX investigation before preparing its source profile.")
    evidence = flex_trace(corpus, request.snapshot_id)
    if evidence["snapshot_id"] != request.snapshot_id:
        raise ValueError("The source profile snapshot was not resolved exactly.")
    sheet = evidence["test_sheet_asset"]
    if evidence["reported_quantities_status"] != "parsed":
        raise ValueError("; ".join(evidence["reported_quantities_issues"]))
    quantities = evidence["reported_quantities"]
    diameter = ReportedVisualizationParameter.model_validate(quantities["initial_diameter"])
    coefficient = ReportedVisualizationParameter.model_validate(quantities["burning_constant"])
    conditions = {
        name: ReportedVisualizationCondition.model_validate(value)
        for name, value in quantities.items()
        if name not in {"initial_diameter", "burning_constant"}
    }
    lines = [line["text"] for line in evidence["test_sheet_lines"]]
    parameters = SourceReportedDropletInputs(
        investigation_accession="PSI-69",
        initial_diameter_mm=diameter.value,
        burning_constant_mm2_s=coefficient.value,
        sample_count=request.sample_count,
        context=MethodContext.model_validate(
            {
                "input_origin": "analyst_input",
                "source_snapshot": request.snapshot_id,
                "sources": [
                    {
                        "source_id": "PSI-69 FLEX-007 nominal parameter profile",
                        "locator": f"Test sheet lines {diameter.anchor.source_row}, "
                        f"{coefficient.anchor.source_row}",
                        "asset_sha256": sheet["sha256"],
                    }
                ],
                "conditions": {
                    "investigation": "PSI-69",
                    "source_test": "FLEX-007",
                    "model_input_basis": "Source-reported values in an assumed constant-K model",
                },
            }
        ),
    )
    result = calculate_droplet_visualization(parameters)
    source_limits = tuple(evidence["limitations"])
    condition_names = (
        "Pressure (atm)",
        "O2 Mole Fraction",
        "N2 Mole Fraction",
        "CO2 Mole Fraction",
        "He Mole Fraction",
        "Temperature (K)",
        "Fuel:",
        "Fiber:",
        "Dext",
    )
    return SourceDropletVisualizationResult.model_validate(
        {
            **result.model_dump(mode="json"),
            "scientific_qualification": (
                "Source-parameterized classical D²-law trajectory computed from nominal D0 and "
                "kavg read from the retained FLEX-007 test sheet, with unit-bearing line anchors. "
                "The constant-K extension is a model assumption; this is not a newly calibrated "
                "fit or a validated reconstruction of actual extinction or disruption."
            ),
            "parameter_sources": {
                "initial_diameter": diameter.model_dump(mode="json"),
                "burning_constant": coefficient.model_dump(mode="json"),
            },
            "condition_sources": {
                name: value.model_dump(mode="json") for name, value in conditions.items()
            },
            "source_conditions": {
                name: line.strip()
                for name in condition_names
                for line in lines
                if line.strip().startswith(name)
            },
            "source_record_limitations": source_limits,
            "limitations": (*result.limitations, *source_limits),
            "references": (*result.references, sheet["source_url"]),
        }
    )


def prepare_droplet_visualization(
    corpus: Corpus,
    request: DropletVisualizationRequest,
    *,
    expected_snapshot: str | None = None,
    selected_investigations: list[str] | None = None,
) -> DropletVisualizationResult:
    """Validate frozen context without turning metadata into measured parameters.

    A standalone API request supplies its exact snapshot. A research-tool call
    may inherit the already frozen workspace snapshot but cannot replace it.
    An optional experiment association is educational, not a run qualification.
    """
    supplied = request.context.source_snapshot
    if expected_snapshot is not None and supplied is not None and supplied != expected_snapshot:
        raise ValueError("The visualization belongs to a different frozen research context.")
    snapshot_id = supplied or expected_snapshot
    if snapshot_id is None:
        raise ValueError("Select an exact source snapshot before preparing a visualization.")
    snapshot = corpus.snapshot(snapshot_id)
    if snapshot["snapshot_id"] != snapshot_id:
        raise ValueError("The requested visualization source snapshot was not resolved exactly.")
    accession = request.investigation_accession
    if accession is not None:
        if selected_investigations is not None and accession not in selected_investigations:
            raise ValueError(
                "Associate a visualization only with an explicitly selected investigation."
            )
        corpus.investigation(accession, snapshot_id)
        if accession not in DROPLET_INVESTIGATIONS:
            raise ValueError(
                "No droplet teaching visualization is registered for this investigation."
            )
    pinned = request.model_copy(
        update={"context": request.context.model_copy(update={"source_snapshot": snapshot_id})}
    )
    return calculate_droplet_visualization(pinned)


def create_visualization_router(corpus: Corpus) -> APIRouter:
    router = APIRouter(prefix="/v1/visualizations", tags=["educational visualizations"])

    @router.post("/droplet", response_model=DropletVisualizationResult)
    def droplet(inputs: DropletVisualizationRequest) -> DropletVisualizationResult:
        return prepare_droplet_visualization(corpus, inputs)

    @router.post("/flex-007", response_model=SourceDropletVisualizationResult)
    def flex_007(inputs: SourceDropletVisualizationRequest) -> SourceDropletVisualizationResult:
        return prepare_source_droplet_visualization(corpus, inputs)

    return router

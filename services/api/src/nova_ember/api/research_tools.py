"""One typed, bounded scientific tool registry for Studio, context and voice."""

import json
from collections.abc import Callable
from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID

from agents import FunctionTool, Tool
from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.records import interpret_table
from nova_ember.analysis.visualization import DropletVisualizationRequest
from nova_ember.contracts.research import Contract, EvidenceFact, WorkspaceContext
from nova_ember.domain.identifiers import InvestigationId
from nova_ember.evidence.contracts import EvidenceAnchor
from pydantic import BaseModel, Field

from .agent_capabilities import allowed_tool, require_tool
from .records import CohortInputs, freeze_selection
from .repository import Corpus
from .science import compare_investigations, flex_endpoints
from .scientific_toolbox import (
    BassFireIllustrationInput,
    Empty,
    ScientificToolbox,
    ScientificToolCall,
    SourceVisualizationInput,
    ToolName,
)
from .source_files import bass_calibration, flex_trace, source_text, source_workbook
from .visualization import SourceDropletVisualizationRequest


def dossier_model_payload(fact: dict, byte_limit: int) -> str:
    """Keep exact scientific excerpts readable when many dossiers share one prompt."""
    content = fact["content"]
    fields = ("objective", "approach")
    sources = [
        {key: value for key, value in source.items() if value is not None}
        for source in fact.get("sources", [])
        if source.get("field") in fields
    ]
    view = {
        "id": fact["id"],
        "label": fact["label"],
        "origin": fact["origin"],
        "content": {
            key: content[key]
            for key in (
                "accession",
                "title",
                "source_url",
                "source_kind",
                "origin",
                "record_type",
                "parent_accession",
                "research_status",
                "data_status",
            )
            if content.get(key) is not None
        },
        "sources": sources,
        "limitations": fact.get("limitations", []),
        "model_view": {
            "status": "partial_preview",
            "original_bytes": len(json.dumps(fact, default=str).encode()),
            "excerpts": {},
            "instruction": "Exact source excerpts, not reported outcomes. Truncation is recorded "
            "per field; omitted text and fields remain in the complete unchanged fact.",
        },
    }

    def encoded() -> str:
        return json.dumps(view, default=str, ensure_ascii=False)

    texts = {name: str(content.get(name) or "") for name in fields}
    for name, text in texts.items():
        view["content"][name] = ""
        view["model_view"]["excerpts"][name] = {
            "original_characters": len(text),
            "retained_characters": 0,
        }
    remaining = max(0, byte_limit - len(encoded().encode()) - 40)
    allocations = {name: remaining // len(fields) for name in fields}
    # A short field gives its unused space to the other scientific excerpt.
    for name in fields:
        unused = max(0, allocations[name] - len(texts[name].encode()))
        allocations[name] -= unused
        allocations[next(field for field in fields if field != name)] += unused
    for name, text in texts.items():
        excerpt = text.encode()[: allocations[name]].decode("utf-8", errors="ignore")
        if len(excerpt) < len(text) and " " in excerpt:
            excerpt = excerpt.rsplit(" ", 1)[0]
        view["content"][name] = excerpt
        view["model_view"]["excerpts"][name]["retained_characters"] = len(excerpt)

    def add_if_fits(name: str, value) -> None:
        view["content"][name] = value
        if len(encoded().encode()) > byte_limit:
            del view["content"][name]

    for name in ("acronym", "doi", "platform", "hardware", "findings_status"):
        if content.get(name):
            add_if_fits(name, content[name])
    for name in ("hypothesis", "researchImpacts"):
        source = content.get("source_fields", {}).get(name)
        if source and isinstance(source.get("value"), str):
            # These optional passages preserve their own exact source anchor.
            add_if_fits(
                name,
                {
                    "value": source["value"][:300],
                    "anchor": source.get("anchor"),
                    "original_characters": len(source["value"]),
                    "retained_characters": min(300, len(source["value"])),
                },
            )
    assets = [
        {
            key: asset[key]
            for key in ("id", "accession", "sha256", "file_name", "media_type", "kind", "origin")
            if key in asset
        }
        for asset in content.get("assets", [])[:8]
    ]
    if assets:
        add_if_fits("assets", assets)
        if "assets" in view["content"]:
            add_if_fits("retained_asset_count", len(content.get("assets", [])))
    literature = [
        {
            key: source.get(key)
            for key in (
                "document_id",
                "capture_id",
                "title",
                "source_url",
                "source_sha256",
                "status",
            )
        }
        for source in content.get("literature_sources", [])[:8]
    ]
    if literature:
        add_if_fits("literature_sources", literature)
    return encoded()


def publication_table_context(content: dict) -> tuple[dict, str | None]:
    """Keep reviewed transcriptions and plans distinct from original measurements."""
    assets = [content["asset"]] if isinstance(content.get("asset"), dict) else []
    assets.extend(
        item["asset"]
        for item in content.get("items", [])
        if isinstance(item, dict) and isinstance(item.get("asset"), dict)
    )
    tables = {asset["id"]: asset for asset in assets if asset.get("kind") == "publication_table"}
    if not tables:
        return content, None
    planned = all(
        asset.get("kind") == "publication_table" and asset.get("origin") == "planned_conditions"
        for asset in assets
    )
    return {
        **content,
        "source_table_origin": "planned_conditions" if planned else "published_table_transcription",
        "provenance": {
            **content.get("provenance", {}),
            "publication_tables": [
                {
                    "asset_id": asset["id"],
                    "accession": asset["accession"],
                    "source_kind": asset.get("source_kind"),
                    "origin": asset.get("origin"),
                    "source_provenance": asset.get("source_provenance", []),
                }
                for asset in tables.values()
            ],
        },
    }, "source_metadata" if planned else "source_text"


def publication_table_model_payload(fact: dict, byte_limit: int) -> str | None:
    """Compact repeated table provenance before reducing scientifically meaningful columns.

    The complete immutable fact retains every field and cell anchor. This model
    view keeps row/column identities and quantity definitions together; truncating
    all nested lists at the same index can otherwise hide the requested variable.
    """
    content = fact.get("content", {})
    if content.get("source_table_origin") not in {
        "planned_conditions",
        "published_table_transcription",
    } or not isinstance(content.get("records"), list):
        return None
    field_keys = {
        "column_index",
        "source_column",
        "raw_text",
        "quantity_kind",
        "source_value_kind",
        "original_unit",
        "canonical_value",
        "canonical_unit",
        "status",
        "missing_reason",
        "location",
        "basis",
        "transformation_id",
    }
    rows = [
        {
            "source_row": row["source_row"],
            "row_kind": row["row_kind"],
            "raw_cells": row["raw_cells"],
            "fields": [
                {
                    key: value
                    for key, value in field.items()
                    if key in field_keys and value is not None
                }
                for field in row["fields"]
            ],
        }
        for row in content["records"]
    ]
    asset = content.get("asset", {})
    identity = {
        key: asset[key]
        for key in (
            "id",
            "accession",
            "sha256",
            "source_kind",
            "investigation_version",
            "source_url",
            "origin",
            "source_provenance",
        )
        if key in asset
    }
    view = {
        "id": fact["id"],
        "label": fact["label"],
        "origin": fact["origin"],
        "sources": [{**identity, "snapshot_id": content["snapshot_id"]}],
        "limitations": fact.get("limitations", []),
        "content": {
            key: content[key]
            for key in (
                "snapshot_id",
                "asset_id",
                "source_sha256",
                "source_table_origin",
                "headers",
                "source_record_count",
                "row_kind_counts",
                "independent_run_count",
                "refusals",
            )
            if key in content
        },
    }
    for count in dict.fromkeys(
        (len(rows), min(8, len(rows)), min(3, len(rows)), min(1, len(rows)))
    ):
        view["content"]["records"] = rows[:count]
        view["model_view"] = {
            "status": "partial_preview",
            "original_records_in_fact": len(rows),
            "retained_records": count,
            "instruction": (
                "All columns of each retained row are preserved. Repeated cell anchors and "
                "transformation explanations remain in the complete unchanged fact. "
                "Use its fact ID for citations. Canonical values are registered conversions; "
                "preserve field value kinds and do not infer missing values or independent runs."
            ),
        }
        encoded = json.dumps(view, default=str, ensure_ascii=False)
        if len(encoded.encode()) <= byte_limit:
            return encoded
    return None


def model_fact_payload(fact: dict, byte_limit: int = 28000) -> str:
    """Bound the model view, preserving the full fact and its calculated summaries."""
    complete = json.dumps(fact, default=str)
    if fact.get("label") == "Investigation dossier" and byte_limit >= 2000:
        return dossier_model_payload(fact, byte_limit)
    if table_view := publication_table_model_payload(fact, byte_limit):
        return table_view
    encoded_view = json.dumps(fact, default=str)
    if len(encoded_view.encode()) <= byte_limit:
        return encoded_view
    references = {
        "id",
        "asset_id",
        "source_id",
        "sha256",
        "source_sha256",
        "asset_sha256",
        "snapshot_id",
        "source_url",
        "unit",
        "canonical_unit",
        "original_unit",
        "method_id",
        "model_id",
        "model_version",
        "context_version",
        "file_name",
    }
    for maximum_items, maximum_characters in ((8, 2000), (3, 1000), (1, 500)):
        omissions: list[dict] = []

        def preview(
            value,
            path="$",
            key="",
            depth=0,
            omissions=omissions,
            maximum_items=maximum_items,
            maximum_characters=maximum_characters,
        ):
            if isinstance(value, (dict, list)) and depth > 18:
                omissions.append({"path": path, "reason": "nested_value_omitted"})
                return None
            if isinstance(value, dict):
                return {
                    name: preview(item, f"{path}[{json.dumps(name)}]", name, depth + 1)
                    for name, item in value.items()
                }
            if isinstance(value, list):
                limit = (
                    len(value)
                    if key
                    in {
                        "counts",
                        "limitations",
                        "refusals",
                        "required_inputs",
                        "reasons",
                        "conditions",
                        "assumptions",
                        "quality_flags",
                        "source_columns",
                        "required",
                        "enum",
                        "oneOf",
                        "anyOf",
                        "allOf",
                        "prefixItems",
                    }
                    else maximum_items
                )
                if len(value) > limit:
                    omissions.append(
                        {
                            "path": path,
                            "original_items": len(value),
                            "retained_items": limit,
                        }
                    )
                return [
                    preview(item, f"{path}[{index}]", key, depth + 1)
                    for index, item in enumerate(value[:limit])
                ]
            if isinstance(value, str) and key not in references and len(value) > maximum_characters:
                omissions.append(
                    {
                        "path": path,
                        "original_characters": len(value),
                        "retained_characters": maximum_characters,
                    }
                )
                return value[:maximum_characters]
            return value

        bounded = preview(fact)
        bounded["model_view"] = {
            "status": "partial_preview",
            "original_bytes": len(complete.encode()),
            "omissions": omissions[:32],
            "omitted_description_count": max(0, len(omissions) - 32),
            "instruction": (
                "The complete fact remains stored under its unchanged ID. Retained summaries "
                "preserve their original scope and provenance; nothing was recomputed from "
                "this preview. Preview rows/text are "
                "partial and cannot establish complete counts, fitted results or complete cohorts. "
                "Use registered tools for further calculations, not arithmetic over this preview."
            ),
        }
        encoded = json.dumps(bounded, default=str)
        if len(encoded.encode()) <= byte_limit:
            return encoded
    return json.dumps(
        {
            "id": fact["id"],
            "label": fact["label"],
            "origin": fact["origin"],
            "status": "preview_too_large",
            "limitations": fact["limitations"],
            "instruction": (
                "Select a narrower source view. The complete fact remains stored unchanged."
            ),
        }
    )


class SearchInput(Contract):
    query: str = Field(max_length=500)
    limit: int = Field(default=8, ge=1, le=12)


class InvestigationInput(Contract):
    accession: InvestigationId


class DatasetInput(Contract):
    asset_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_rows: list[int] = Field(default_factory=list, max_length=30)


class EvidenceInput(DatasetInput):
    format: Literal["table", "text", "workbook"] = "table"
    sheet: str | None = Field(default=None, max_length=128)
    offset: int = Field(default=0, ge=0, le=200000)


class CompareInput(Contract):
    investigation_ids: list[str] = Field(min_length=2, max_length=8)


class QuantityInput(Contract):
    oxygen_percent: float = Field(ge=0, le=100)
    absolute_pressure: float = Field(gt=0)
    pressure_unit: Literal["Pa", "kPa", "bar", "psia"]
    fraction_basis: Literal["mole", "volume"]


class SourceAnalysisInput(Contract):
    method: Literal["flex_source_events", "bass_calibration_evidence", "flex_007_trace_evidence"]


class PrivateEvidenceInput(Contract):
    upload_id: UUID | None = None
    source_job_id: UUID | None = None
    offset: int = Field(default=0, ge=0, le=2000)
    limit: int = Field(default=20, ge=1, le=30)
    sheet: str | None = Field(default=None, min_length=1, max_length=128)


@dataclass
class ResearchTools:
    corpus: Corpus
    context: WorkspaceContext
    on_action: Any = None
    facts: dict[str, EvidenceFact] = field(default_factory=dict)
    actions: list[dict] = field(default_factory=list)
    calls: int = 0
    job: dict | None = None
    receipt_sha256: str | None = field(default=None, repr=False)
    capabilities: frozenset[str] | None = None

    def private_owner_hash(self) -> str:
        if self.job is not None:
            return ScientificToolbox(
                self.corpus, self.context, self.job, capabilities=self.capabilities
            )._owner_hash()
        if self.receipt_sha256 is None:
            raise ValueError("Selected temporary inputs require the originating browser's scope.")
        return self.receipt_sha256

    def selected_private_input(self, inputs: PrivateEvidenceInput):
        matches = [
            selected
            for selected in self.context.selected_private_inputs
            if selected.upload_id == inputs.upload_id
            and selected.source_job_id == inputs.source_job_id
        ]
        if len(matches) != 1:
            raise ValueError("Only an explicitly selected temporary input may be inspected.")
        from .private_context import resolve_private_input

        return resolve_private_input(
            self.corpus.settings, self.context.snapshot_id, matches[0], self.private_owner_hash()
        )

    def inspect_private_input(self, inputs: PrivateEvidenceInput) -> dict:
        from .private_context import inspect_private_bytes

        metadata, path = self.selected_private_input(inputs)
        content = inspect_private_bytes(
            metadata, path, offset=inputs.offset, limit=inputs.limit, sheet=inputs.sheet
        )
        if len(json.dumps(content, default=str).encode()) > 24000:
            raise ValueError("Private source excerpt is too large; select fewer rows/cells/lines.")
        return self.fact(
            "Explicitly selected temporary input",
            {"origin": "user_supplied_input", **content},
            [metadata],
            origin="user_supplied_input",
            limitations=[
                "Temporary bytes are untrusted inputs without canonical NASA attribution.",
                "Literal cells and labels do not qualify measurements, units or calibration.",
                "Model-sharing consent is separate from temporary host-processing consent.",
            ],
        )

    def retained_sources(self, content: dict) -> list[dict]:
        """Resolve result-contained source identities; a snapshot alone is not evidence."""
        sources: dict[str, dict] = {}

        def walk(value):
            if isinstance(value, BaseModel):
                value = value.model_dump(mode="json")
            if isinstance(value, dict):
                digest = (
                    value.get("sha256") or value.get("source_sha256") or value.get("asset_sha256")
                )
                accession = value.get("accession")
                if value.get("kind") in {
                    "metadata_field",
                    "table_cell",
                    "workbook_cell",
                    "text_lines",
                    "document_page",
                    "document_paragraph",
                    "media_frame",
                } and value.get("source_sha256"):
                    from .discovery import Discovery, EvidenceAnchor

                    anchor = EvidenceAnchor.model_validate(
                        {
                            name: item
                            for name, item in value.items()
                            if name in EvidenceAnchor.model_fields
                        }
                    )
                    if anchor.snapshot_id != self.context.snapshot_id:
                        raise ValueError("Evidence belongs to a different frozen research context.")
                    Discovery(self.corpus).read_anchor(anchor)
                    sources[anchor.model_dump_json()] = anchor.model_dump(mode="json")
                elif isinstance(digest, str) and len(digest) == 64 and accession:
                    if value.get("snapshot_id") not in {None, self.context.snapshot_id}:
                        raise ValueError("Source belongs to a different frozen research context.")
                    identity = f"{accession}:{digest}"
                    if identity not in sources:
                        identifier = value.get("asset_id") or value.get("id")
                        asset = self.corpus.asset(
                            digest,
                            self.context.snapshot_id,
                            accession=accession,
                            asset_id=identifier
                            if isinstance(identifier, str)
                            and identifier.startswith(f"{accession}:v")
                            else None,
                        )
                        sources[identity] = {**asset, "snapshot_id": self.context.snapshot_id}
                for nested in value.values():
                    if isinstance(nested, (BaseModel, dict, list)):
                        walk(nested)
            elif isinstance(value, list):
                for nested in value:
                    walk(nested)

        walk(content)
        return list(sources.values())[:64]

    def fact(
        self,
        label: str,
        content: dict,
        sources: list[dict],
        origin="source_metadata",
        limitations=None,
    ) -> dict:
        frozen = json.dumps(content, sort_keys=True, default=str)
        identifier = sha256((self.context.snapshot_id + label + frozen).encode()).hexdigest()
        fact = EvidenceFact(
            id=identifier,
            origin=origin,
            label=label,
            content=content,
            sources=sources,
            limitations=limitations or [],
        )
        self.facts[identifier] = fact
        return fact.model_dump(mode="json")

    def resolve_context(self) -> dict:
        self.corpus.snapshot(self.context.snapshot_id)
        investigations = [
            self.corpus.investigation(accession, self.context.snapshot_id)
            for accession in self.context.investigations
        ]
        for source in self.context.selected_sources:
            asset = self.corpus.asset(
                source.asset_sha256,
                self.context.snapshot_id,
                accession=source.accession,
                asset_id=source.asset_id,
            )
            if source.source_rows or source.columns:
                if not asset["file_name"].lower().endswith(".csv"):
                    raise ValueError("Physical table-row selections require a retained CSV source.")
                raw = parse_csv_bytes(self.corpus.asset_bytes(asset), asset["encoding"])
                rows = {row.row_number for row in raw.rows}
                if not set(source.source_rows) <= rows:
                    raise ValueError("A selected physical source row is absent from this snapshot.")
                if source.columns and max(source.columns) >= len(raw.headers):
                    raise ValueError("A selected source column is absent from this snapshot.")
        if len(json.dumps(self.context.scenario).encode()) > 12000:
            raise ValueError("Scenario context exceeds the selected-input limit.")
        private = []
        for selected in self.context.selected_private_inputs:
            metadata, _ = self.selected_private_input(
                PrivateEvidenceInput(
                    upload_id=selected.upload_id, source_job_id=selected.source_job_id
                )
            )
            private.append(
                {
                    **selected.model_dump(mode="json"),
                    "file_name": metadata["file_name"],
                    "byte_size": metadata["byte_size"],
                    "origin": "user_supplied_input",
                }
            )
        focused = self.resolve_focused_context()
        return {
            "snapshot_id": self.context.snapshot_id,
            "context_version": self.context.context_version,
            "investigations": [
                {
                    key: item.get(key)
                    for key in (
                        "accession",
                        "title",
                        "source_kind",
                        "record_type",
                        "research_status",
                        "data_status",
                    )
                }
                for item in investigations
            ],
            "selected_sources": [source.model_dump() for source in self.context.selected_sources],
            "selected_private_inputs": private,
            "scenario": self.context.scenario,
            "case_revision": self.context.case_revision,
            **focused,
        }

    def resolve_focused_context(self) -> dict:
        from .discovery import Discovery
        from .focused_context import resolve_focused_view, resolve_selected_artifact

        view, highlights, artifacts = None, [], []
        if self.context.focused_view is not None:
            selected = self.context.focused_view
            resolved = resolve_focused_view(self.corpus, self.context.snapshot_id, selected)
            fact = self.fact(
                "Focused source view",
                resolved["content"],
                [resolved["source"]],
                origin="deterministic_calculation",
                limitations=resolved["limitations"],
            )
            view = {
                "kind": selected.kind,
                "artifact_id": selected.artifact_id,
                "configuration": resolved["configuration"],
                "configuration_origin": "browser_selected_view_not_additional_measurements",
                "status": resolved["status"],
                "fact": json.loads(model_fact_payload(fact)),
            }
        for anchor in self.context.selected_evidence:
            if anchor.snapshot_id != self.context.snapshot_id:
                raise ValueError("Selected evidence belongs to another frozen context snapshot.")
            resolved = Discovery(self.corpus).read_anchor(anchor)
            fact = self.fact(
                "Highlighted source passage",
                resolved,
                [anchor.model_dump(mode="json")],
                origin="source_text",
                limitations=["Exact source text does not establish its interpretation."],
            )
            highlights.append(json.loads(model_fact_payload(fact, byte_limit=12000)))
        for selected_artifact in self.context.selected_artifacts:
            resolved = resolve_selected_artifact(
                self.corpus.settings,
                self.context.snapshot_id,
                selected_artifact,
                self.private_owner_hash(),
            )
            fact = self.fact(
                "Selected private analysis artifact",
                resolved,
                [{key: value for key, value in resolved.items() if key != "payload"}],
                origin="user_supplied_input",
                limitations=[
                    "Private artifacts retain their recorded origin and publication state.",
                    "Selecting an artifact does not establish canonical NASA measurements.",
                ],
            )
            artifacts.append(json.loads(model_fact_payload(fact, byte_limit=12000)))
        active = self.context.active_artifact_id
        matched = active is not None and (
            (view is not None and view["artifact_id"] == active)
            or any(str(item.artifact_id) == active for item in self.context.selected_artifacts)
        )
        return {
            "focused_view": view,
            "selected_evidence": highlights,
            "selected_artifacts": artifacts,
            "active_artifact_id": active,
            "active_artifact_resolution": "resolved"
            if matched
            else "unavailable"
            if active
            else "none",
            "active_artifact_note": None
            if matched or active is None
            else "Select a typed view or private reference to supply this local artifact's data.",
        }

    def search_investigations(self, inputs: SearchInput) -> dict:
        result = self.corpus.investigations(inputs.query, inputs.limit, 0, self.context.snapshot_id)
        items = [
            {
                key: item.get(key)
                for key in (
                    "accession",
                    "title",
                    "acronym",
                    "version",
                    "doi",
                    "objective",
                    "source_kind",
                    "record_type",
                    "parent_accession",
                    "research_status",
                    "data_status",
                )
            }
            for item in result["items"]
        ]
        return self.fact(
            "Investigation discovery",
            {"items": items, "total": result["total"]},
            [
                {
                    "snapshot_id": self.context.snapshot_id,
                    "accession": item["accession"],
                    "kind": "investigation_metadata",
                }
                for item in items
            ],
            limitations=["Metadata objectives do not establish measured outcomes."],
        )

    def get_investigation(self, inputs: InvestigationInput) -> dict:
        from .discovery import Discovery

        result = Discovery(self.corpus).dossier(inputs.accession, self.context.snapshot_id)
        limitations = [
            "Reported objectives and descriptions are distinct from experimental results."
        ]
        if result.get("source_kind") == "nasa":
            limitations.append(
                "This is a source-linked NASA research record, not a NASA PSI accession. "
                "Its research/data status distinguishes descriptions, reported results and plans."
            )
        return self.fact(
            "Investigation dossier",
            result,
            self.retained_sources(result),
            limitations=limitations,
        )

    def inspect_dataset(self, inputs: DatasetInput) -> dict:
        asset = self.corpus.asset(inputs.asset_sha256, self.context.snapshot_id)
        if not asset["file_name"].lower().endswith(".csv"):
            raise ValueError("Use read_evidence for retained text or workbook sources.")
        raw = parse_csv_bytes(self.corpus.asset_bytes(asset), asset["encoding"])
        result = interpret_table(asset, raw)
        rows = [
            row
            for row in result.records
            if not inputs.source_rows or row.source_row in inputs.source_rows
        ]
        if inputs.source_rows and len(rows) != len(set(inputs.source_rows)):
            raise ValueError("A requested physical source record is absent.")
        asset_identity = {key: value for key, value in asset.items() if key != "table_definition"}
        content = {
            **result.model_dump(exclude={"records"}),
            "asset": asset_identity,
            "snapshot_id": self.context.snapshot_id,
            "records": [row.model_dump() for row in rows[:30]],
            "preview_limited": len(rows) > 30,
        }
        content, publication_origin = publication_table_context(content)
        sources = [
            {
                **asset_identity,
                "snapshot_id": self.context.snapshot_id,
                "source_rows": [row.source_row for row in rows[:30]],
            }
        ]
        if publication_origin:
            for row in rows[:30]:
                for field in row.fields:
                    if not field.raw_text.strip():
                        continue
                    if len(sources) >= 65:
                        break
                    sources.append(
                        EvidenceAnchor(
                            snapshot_id=self.context.snapshot_id,
                            source_kind=asset.get("source_kind") or "psi",
                            accession=asset["accession"],
                            investigation_version=asset["investigation_version"],
                            source_sha256=asset["sha256"],
                            asset_id=asset["id"],
                            kind="table_cell",
                            source_row=row.source_row,
                            column=field.column_index,
                        ).model_dump(mode="json", exclude_none=True)
                    )
        return self.fact(
            "Planned research conditions"
            if publication_origin == "source_metadata"
            else "Published table records"
            if publication_origin
            else "Source-specific table records",
            content,
            sources,
            origin=publication_origin or "source_measurement",
            limitations=result.limitations,
        )

    def read_evidence(self, inputs: EvidenceInput) -> dict:
        if inputs.format == "table":
            return self.inspect_dataset(inputs)
        if inputs.format == "text":
            result = source_text(
                self.corpus, inputs.asset_sha256, self.context.snapshot_id, 30, inputs.offset
            )
        else:
            result = source_workbook(
                self.corpus,
                inputs.asset_sha256,
                self.context.snapshot_id,
                inputs.sheet,
                30,
                inputs.offset,
            )
        sources = [result["asset"]]
        if inputs.format == "text" and result["lines"]:
            from nova_ember.evidence.contracts import EvidenceAnchor

            asset = result["asset"]
            anchor = EvidenceAnchor(
                snapshot_id=self.context.snapshot_id,
                source_kind=asset.get("source_kind") or "psi",
                accession=asset["accession"],
                investigation_version=asset["investigation_version"],
                source_sha256=asset["sha256"],
                asset_id=asset["id"],
                kind="text_lines",
                source_row=result["lines"][0]["line_number"],
                line_end=result["lines"][-1]["line_number"],
            )
            sources.extend(self.retained_sources({"anchor": anchor.model_dump(mode="json")}))
        return self.fact(
            "Exact retained source evidence",
            result,
            sources,
            origin="source_text",
            limitations=result.get("limitations", []),
        )

    def compare_investigations(self, inputs: CompareInput) -> dict:
        if len(set(inputs.investigation_ids)) != len(inputs.investigation_ids):
            raise ValueError("Comparison identifiers must be distinct.")
        result = compare_investigations(
            self.corpus, inputs.investigation_ids, self.context.snapshot_id
        )
        return self.fact(
            "Investigation condition comparison",
            result,
            [
                {"accession": accession, "snapshot_id": self.context.snapshot_id}
                for accession in inputs.investigation_ids
            ],
            origin="deterministic_calculation",
            limitations=["Investigation-level records are not interchangeable independent runs."],
        )

    def compute_quantity(self, inputs: QuantityInput) -> dict:
        from nova_ember.analysis.oxygen import oxygen_partial_pressure

        result = oxygen_partial_pressure(**inputs.model_dump())
        return self.fact(
            "Oxygen partial pressure calculation",
            result,
            [],
            origin="deterministic_calculation",
            limitations=[
                "Partial pressure is not a flammability equivalence or safety assessment."
            ],
        )

    def create_cohort(self, inputs: CohortInputs) -> dict:
        if inputs.snapshot_id != self.context.snapshot_id:
            raise ValueError("The requested cohort belongs to another context snapshot.")
        result = freeze_selection(self.corpus, inputs)
        return self.fact(
            "Frozen source-record selection",
            result,
            [
                {
                    **self.corpus.asset(selection.asset_sha256, inputs.snapshot_id),
                    "snapshot_id": inputs.snapshot_id,
                    "source_rows": selection.source_rows,
                }
                for selection in inputs.selections
            ],
            origin="deterministic_calculation",
            limitations=["Freezing rows establishes neither independence nor pooling eligibility."],
        )

    def analyze_source(self, inputs: SourceAnalysisInput) -> dict:
        if inputs.method == "flex_source_events":
            result = flex_endpoints(self.corpus, self.context.snapshot_id)
        elif inputs.method == "bass_calibration_evidence":
            result = bass_calibration(self.corpus, self.context.snapshot_id)
        else:
            result = flex_trace(self.corpus, self.context.snapshot_id)
        return self.fact(
            inputs.method,
            result,
            self.retained_sources(result),
            origin="deterministic_calculation"
            if inputs.method == "flex_source_events"
            else "source_text",
            limitations=result.get("limitations", []),
        )

    def list_scientific_tools(self, _inputs: Empty) -> dict:
        return self.fact(
            "Scientific tool catalog",
            ScientificToolbox(self.corpus, self.context, capabilities=self.capabilities).menu(),
            [],
            origin="tool_contract",
        )

    def scientific_tool_schema(self, inputs: ToolName) -> dict:
        return self.fact(
            "Scientific tool contract",
            ScientificToolbox(self.corpus, self.context, capabilities=self.capabilities).schema(
                inputs.name
            ),
            [],
            origin="tool_contract",
        )

    def run_scientific_tool(self, inputs: ScientificToolCall) -> dict:
        result = ScientificToolbox(
            self.corpus, self.context, self.job, capabilities=self.capabilities
        ).dispatch(inputs)
        if inputs.name == "prepare_source_simulation":
            reported = [
                self.fact(
                    f"FLEX-007 source-reported {name}",
                    {
                        "reported_parameter": {
                            "value": parameter["value"],
                            "unit": parameter["unit"],
                            "origin": parameter["origin"],
                        },
                        "source_text": parameter["source_text"],
                        "anchor": parameter["anchor"],
                        "source_profile_id": result["source_profile_id"],
                    },
                    self.retained_sources(parameter),
                    origin="source_text",
                    limitations=result["source_record_limitations"],
                )
                for name, parameter in {
                    **result["parameter_sources"],
                    **result["condition_sources"],
                }.items()
            ]
            result = {
                **result,
                "reported_parameter_facts": reported,
                "reported_parameter_fact_ids": [fact["id"] for fact in reported],
            }
        origin = "deterministic_calculation"
        if inputs.name in {"search_runs", "get_run"}:
            result, publication_origin = publication_table_context(result)
            origin = publication_origin or "source_measurement"
        elif inputs.name in {"search_evidence", "search_semantic_evidence", "get_source_span"}:
            origin = "source_text"
        elif inputs.name == "method_catalog":
            origin = "tool_contract"
        elif inputs.name == "list_models":
            origin = "source_metadata"
        elif inputs.name.startswith("propose_") or inputs.name in {
            "assess_evidence",
            "compare_claims",
            "assess_control",
            "assess_earth_transfer",
            "execute_python",
            "export_case",
        }:
            origin = "model_proposal"
        elif inputs.name == "predict":
            origin = "prediction"
        elif inputs.name == "prepare_source_visualization":
            origin = "source_media"
        elif inputs.name == "prepare_bass_fire_illustration":
            origin = "model_proposal"
        return self.fact(
            inputs.name,
            result,
            self.retained_sources(result),
            origin=origin,
            limitations=result.get("limitations", []),
        )

    def prepare_simulation(self, inputs: DropletVisualizationRequest) -> dict:
        return self.run_scientific_tool(
            ScientificToolCall(name="prepare_simulation", parameters=inputs.model_dump(mode="json"))
        )

    def prepare_source_simulation(self, inputs: SourceDropletVisualizationRequest) -> dict:
        return self.run_scientific_tool(
            ScientificToolCall(
                name="prepare_source_simulation", parameters=inputs.model_dump(mode="json")
            )
        )

    def prepare_source_visualization(self, inputs: SourceVisualizationInput) -> dict:
        return self.run_scientific_tool(
            ScientificToolCall(
                name="prepare_source_visualization", parameters=inputs.model_dump(mode="json")
            )
        )

    def prepare_bass_fire_illustration(self, inputs: BassFireIllustrationInput) -> dict:
        return self.run_scientific_tool(
            ScientificToolCall(
                name="prepare_bass_fire_illustration", parameters=inputs.model_dump(mode="json")
            )
        )

    def registry(self, *, enabled: Callable[[], bool] | None = None) -> list[Tool]:
        enabled_turn_input: object | None = None
        enabled_for_turn = True

        def tool_enabled(context, _agent) -> bool:
            nonlocal enabled_turn_input, enabled_for_turn
            if enabled is None:
                return True
            # The SDK checks availability both before the model request and
            # before invoking its advertised tool. Keep that turn's decision
            # stable; the next model turn supplies a fresh turn_input list.
            if context.turn_input is not enabled_turn_input:
                enabled_turn_input = context.turn_input
                enabled_for_turn = enabled()
            return enabled_for_turn

        definitions: list[tuple[str, type[BaseModel], Callable[..., dict], str]] = [
            (
                "prepare_bass_fire_illustration",
                BassFireIllustrationInput,
                self.prepare_bass_fire_illustration,
                "Generate an animated BASS-II fire illustration with a retained test row as "
                "context. The image is illustrative, not a measurement or physical simulation. "
                "Use directly for BASS-II fire visualization requests, unless NASA imagery "
                "is requested. Pass a requested or selected PSI-25 asset and row when provided; "
                "otherwise the first retained test row is used.",
            ),
            (
                "prepare_source_visualization",
                SourceVisualizationInput,
                self.prepare_source_visualization,
                "Show original retained imagery from an investigation when an image or video "
                "from NASA is requested: it selects a "
                "source image by default and needs no calibration or simulation parameters. "
                "Returns a prepared inline image/video artifact, not a physical prediction.",
            ),
            (
                "prepare_simulation",
                DropletVisualizationRequest,
                self.prepare_simulation,
                "Prepare an optional, bounded D-squared droplet visualization using explicitly "
                "supplied illustrative diameter and burning coefficient. Keep units and "
                "assumptions; this neither launches a view nor infers missing inputs.",
            ),
            (
                "prepare_source_simulation",
                SourceDropletVisualizationRequest,
                self.prepare_source_simulation,
                "Inspect the selected FLEX-007 source profile and prepare a bounded teaching "
                "visualization using its exact unit-bearing reported diameter and coefficient. "
                "Preserve source anchors and obscuration/disruption limits; this neither "
                "launches a view nor produces a newly fitted or validated predictor.",
            ),
            (
                "inspect_private_input",
                PrivateEvidenceInput,
                self.inspect_private_input,
                "Read bounded original text/cells from an explicitly selected, separately "
                "model-consented temporary input. Uploaded values remain user-supplied inputs.",
            ),
            (
                "list_scientific_tools",
                Empty,
                self.list_scientific_tools,
                "List advanced source, run/cohort, calculation, model, dashboard, "
                "evidence and proposal tools.",
            ),
            (
                "scientific_tool_schema",
                ToolName,
                self.scientific_tool_schema,
                "Read the exact typed inputs for an advanced scientific operation before using it.",
            ),
            (
                "run_scientific_tool",
                ScientificToolCall,
                self.run_scientific_tool,
                "Use an inspected scientific tool contract. Schema validation and "
                "frozen-context checks are mandatory.",
            ),
            (
                "search_investigations",
                SearchInput,
                self.search_investigations,
                (
                    "Find public investigations in the frozen snapshot. "
                    "Objectives are not measured outcomes."
                ),
            ),
            (
                "get_investigation",
                InvestigationInput,
                self.get_investigation,
                (
                    "Read an exact investigation dossier, metadata, rights "
                    "and retained asset identities."
                ),
            ),
            (
                "inspect_dataset",
                DatasetInput,
                self.inspect_dataset,
                (
                    "Read physical source rows, reviewed field mappings, unit"
                    " conversions and limitations."
                ),
            ),
            (
                "read_evidence",
                EvidenceInput,
                self.read_evidence,
                (
                    "Read exact source cells, workbook formulas/caches or "
                    "physical text lines without evaluating formulas."
                ),
            ),
            (
                "compare_investigations",
                CompareInput,
                self.compare_investigations,
                (
                    "Compare investigation conditions conservatively; this is"
                    " not a run-pooling operation."
                ),
            ),
            (
                "compute_quantity",
                QuantityInput,
                self.compute_quantity,
                (
                    "Calculate oxygen partial pressure with explicit fraction"
                    " and absolute-pressure basis."
                ),
            ),
            (
                "create_cohort",
                CohortInputs,
                self.create_cohort,
                (
                    "Freeze explicitly selected physical records; does not "
                    "establish experimental independence."
                ),
            ),
            (
                "analyze_source",
                SourceAnalysisInput,
                self.analyze_source,
                (
                    "Run registered FLEX event-label counting or inspect BASS"
                    " calibration/FLEX trace eligibility."
                ),
            ),
        ]
        result: list[Tool] = []
        for name, schema, function, description in definitions:
            if not allowed_tool(name, self.capabilities):
                continue

            async def invoke(_context, arguments: str, name=name, schema=schema, function=function):
                self.calls += 1
                if self.calls > 12:
                    return json.dumps(
                        {
                            "status": "not_executed",
                            "reason": (
                                "The bounded tool-call allowance is exhausted. "
                                "Use the facts already collected."
                            ),
                        }
                    )
                if self.on_action:
                    self.on_action(name)
                inputs = schema.model_validate_json(arguments)
                try:
                    require_tool(name, self.capabilities)
                    output = function(inputs)
                except (ValueError, LookupError) as error:
                    return json.dumps({"status": "unsupported", "reason": str(error)[:500]})
                self.actions.append(
                    {
                        "tool": name,
                        "input_sha256": sha256(arguments.encode()).hexdigest(),
                        "inputs": inputs.model_dump(mode="json"),
                        "fact_id": output["id"],
                    }
                )
                return model_fact_payload(output)

            result.append(
                FunctionTool(
                    name=name,
                    description=description,
                    params_json_schema=schema.model_json_schema(),
                    on_invoke_tool=invoke,
                    strict_json_schema=False,
                    is_enabled=True if enabled is None else tool_enabled,
                )
            )
        return result

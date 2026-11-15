"""Typed public discovery, exact evidence resolution and research-ledger contracts."""

from __future__ import annotations

import base64
import json
import re
from collections import Counter
from dataclasses import asdict
from hashlib import sha256
from threading import Event
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Query, Response
from nova_ember.adapters.documents import (
    extract_pdf_pages_bounded,
    load_ntrs_document,
    read_document_pages,
)
from nova_ember.adapters.formats import (
    archive_index,
    docx_figure_bytes,
    docx_figures,
    docx_paragraphs,
    inspect_matlab,
    rtf_text,
    xls_cells,
)
from nova_ember.adapters.manifests import checked_json, exact_byte_count, load_collection
from nova_ember.adapters.media import inspect_media
from nova_ember.adapters.psi import manifest_files, parse_csv_bytes
from nova_ember.adapters.records import interpret_table
from nova_ember.adapters.refresh import (
    latest_observation,
    refresh_status,
)
from nova_ember.adapters.refresh import (
    refresh_public_sources as refresh_sources_callback,
)
from nova_ember.adapters.supporting import workbook_cells
from nova_ember.domain.identifiers import InvestigationId
from nova_ember.domain.records import RowKind, SourceField, SourceValueKind
from nova_ember.evidence.changes import manifest_changes, snapshot_changes
from nova_ember.evidence.contracts import (
    Claim,
    Contract,
    ControlCandidate,
    Digest,
    EarthTransfer,
    EvidenceAnchor,
    EvidenceRelation,
    Hypothesis,
)
from nova_ember.evidence.coverage import CoverageAxis, joint_coverage
from nova_ember.evidence.research import (
    assess_control,
    assess_transfer,
    compare_claims,
    invalidated_dependents,
    plan_hypothesis,
)
from pydantic import Field, model_validator

from .catalog_facets import (
    ANNOTATION_VERSION,
    FacetName,
    classifications,
    facet_counts,
    matches_facets,
)
from .config import Settings
from .repository import Corpus, MissingSource, public_asset, public_investigation

METADATA_FIELDS = (
    "title",
    "investigationAcronym",
    "description",
    "objective",
    "approach",
    "hypothesis",
    "researchImpacts",
    "experimentHardware",
    "researchArea",
    "subResearchArea",
    "related_glds",
    "flightProgram",
    "missionName",
    "missionStart",
    "missionEnd",
    "investigationStartDate",
    "investigationEndDate",
    "projectTitle",
    "publications",
    "licenseIdentifier",
    "versionMessage",
)
FACILITY_ALIASES = {
    "Advanced Combustion via Microgravity Experiments (ACME)": "ACME",
    "ACME": "ACME",
    "Combustion Integrated Rack (CIR)": "CIR",
    "Reconfiguration of Combustion Integrated Rack (CIR)": "CIR",
    "Combustion Integrated Rack (CIR)-Fluids and Combustion Facility (FCF)": "CIR",
    "Microgravity Science Glovebox (MSG)": "MSG",
    "Microgravity Science Glovebox": "MSG",
    "Multi-User Droplet Combustion Apparatus (MDCA)": "MDCA",
    "Multi-user Droplet Combustion Appartatus (MDCA)": "MDCA",
    "Comparitive Soot Diagnostic Hardware; Refer to final report": "SAME diagnostic hardware",
    "Comparitive Soot Diagnostic Hardware": "SAME diagnostic hardware",
}


class FieldPredicate(Contract):
    quantity_kind: str | None = Field(default=None, min_length=1, max_length=128)
    source_column: str | None = Field(default=None, max_length=256)
    location: str | None = Field(default=None, max_length=128)
    basis: str | None = Field(default=None, max_length=128)
    operator: Literal["eq", "lt", "lte", "gt", "gte", "contains", "missing", "present"]
    value: Annotated[float, Field(strict=True)] | str | None = None
    unit: str | None = Field(default=None, max_length=64)
    include_missing: bool = False
    source_value_kind: SourceValueKind | None = None

    @model_validator(mode="after")
    def validate_value(self) -> FieldPredicate:
        if self.quantity_kind is None and (
            not self.source_column
            or self.operator not in {"contains", "present"}
            or self.unit is not None
        ):
            raise ValueError(
                "An unclassified field requires its exact source column and "
                "a text/presence rule without inferred units."
            )
        if self.operator in {"eq", "lt", "lte", "gt", "gte"}:
            if not isinstance(self.value, float) or self.unit is None:
                raise ValueError(
                    "Numeric predicates require a finite numeric value and canonical unit."
                )
        elif self.operator == "contains":
            if not isinstance(self.value, str) or not self.value or len(self.value) > 256:
                raise ValueError("Text predicates require a nonempty bounded text value.")
        elif self.value is not None:
            raise ValueError("A presence/missingness predicate has no comparison value.")
        return self


CatalogFacetValues = Annotated[str, Field(min_length=1, max_length=1000)]
CatalogFacetOptions = Annotated[tuple[CatalogFacetValues, ...], Field(max_length=32)]
CatalogFacetSelection = dict[FacetName, CatalogFacetOptions]


class RecordQuery(Contract):
    snapshot_id: Digest | None = None
    accessions: tuple[InvestigationId, ...] = Field(default=(), max_length=64)
    text: str = Field(default="", max_length=500)
    row_kinds: tuple[RowKind, ...] = Field(default=(), max_length=10)
    predicates: tuple[FieldPredicate, ...] = Field(default=(), max_length=20)
    catalog_facets: CatalogFacetSelection = Field(default_factory=dict, max_length=8)
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=300)


class InvestigationQuery(Contract):
    snapshot_id: Digest | None = None
    text: str = Field(default="", max_length=500)
    accessions: tuple[InvestigationId, ...] = Field(default=(), max_length=64)
    hardware: str | None = Field(default=None, max_length=256)
    platform: str | None = Field(default=None, max_length=256)
    license: Literal["CC0-1.0", "unknown"] | None = None
    availability: Literal["catalog_only", "assets_available", "interpreted_table"] | None = None
    catalog_facets: CatalogFacetSelection = Field(default_factory=dict, max_length=8)
    limit: int = Field(default=50, ge=1, le=100)
    cursor: str | None = Field(default=None, max_length=300)


class EvidenceSearch(Contract):
    snapshot_id: Digest | None = None
    text: str = Field(min_length=1, max_length=500)
    accessions: tuple[InvestigationId, ...] = Field(default=(), max_length=64)
    fields: tuple[str, ...] = Field(default=(), max_length=20)
    limit: int = Field(default=20, ge=1, le=100)


class ClaimPair(Contract):
    left: Claim
    right: Claim


class DependencyQuery(Contract):
    changed_ids: tuple[str, ...] = Field(min_length=1, max_length=100)
    relations: tuple[EvidenceRelation, ...] = Field(max_length=1000)


class CoverageRequest(Contract):
    query: RecordQuery
    axes: tuple[CoverageAxis, ...] = Field(min_length=1, max_length=3)


def _literal_span(text: str, terms: list[str]) -> tuple[int, int] | None:
    """Map caseless matches back to original character offsets, including expansions."""
    folded = []
    original_offsets = []
    for index, character in enumerate(text):
        expansion = character.casefold()
        folded.append(expansion)
        original_offsets.extend([index] * len(expansion))
    searchable = "".join(folded)
    if not terms or not all(term in searchable for term in terms):
        return None
    first = min(original_offsets[searchable.index(term)] for term in terms)
    return max(0, first - 100), min(len(text), first + 700)


def _cursor_page(
    items: list, query: RecordQuery | InvestigationQuery, resolved_snapshot: str
) -> dict:
    definition = query.model_dump(mode="json", exclude={"cursor", "limit"})
    definition["snapshot_id"] = resolved_snapshot
    query_id = sha256(
        json.dumps(definition, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    cursor = getattr(query, "cursor", None)
    offset = 0
    if cursor:
        try:
            data = json.loads(base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)))
            if data["query"] != query_id or type(data["offset"]) is not int or data["offset"] < 0:
                raise ValueError
            offset = data["offset"]
        except (ValueError, KeyError, TypeError):
            raise ValueError("Cursor is invalid or belongs to a different frozen query.") from None
    limit = query.limit
    next_offset = offset + limit
    next_cursor = None
    if next_offset < len(items):
        next_cursor = (
            base64.urlsafe_b64encode(
                json.dumps({"query": query_id, "offset": next_offset}).encode()
            )
            .decode()
            .rstrip("=")
        )
    return {
        "snapshot_id": resolved_snapshot,
        "query_id": query_id,
        "query": definition,
        "items": items[offset:next_offset],
        "total": len(items),
        "limit": limit,
        "next_cursor": next_cursor,
    }


def _field_matches(field: SourceField, predicate: FieldPredicate) -> bool:
    if (
        predicate.source_value_kind is not None
        and field.source_value_kind != predicate.source_value_kind
    ):
        return False
    if field.quantity_kind != predicate.quantity_kind:
        return False
    if predicate.source_column is not None and field.source_column != predicate.source_column:
        return False
    if predicate.location is not None and field.location != predicate.location:
        return False
    if predicate.basis is not None and field.basis != predicate.basis:
        return False
    if predicate.operator == "contains":
        return str(predicate.value).casefold() in field.raw_text.casefold()
    if predicate.operator == "present":
        if predicate.unit is None:
            return bool(field.raw_text.strip()) and field.missing_reason is None
        if field.canonical_value is None:
            return predicate.include_missing
        return field.canonical_unit == predicate.unit
    missing = field.canonical_value is None
    if predicate.operator == "missing":
        return missing
    if missing:
        return predicate.include_missing
    if predicate.unit != field.canonical_unit:
        return False
    assert isinstance(predicate.value, float)
    value = predicate.value
    actual = field.canonical_value
    assert actual is not None
    return {
        "eq": actual == value,
        "lt": actual < value,
        "lte": actual <= value,
        "gt": actual > value,
        "gte": actual >= value,
    }[predicate.operator]


class Discovery:
    def __init__(self, corpus: Corpus):
        self.corpus = corpus

    def source_snapshot_id(self, snapshot: dict) -> str:
        visited = set()
        current = snapshot
        for _ in range(32):
            identifier = current["snapshot_id"]
            if identifier in visited:
                raise ValueError("Source snapshot lineage contains a cycle.")
            visited.add(identifier)
            manifest = current["manifest"]
            explicit = manifest.get("source_snapshot_id") or manifest.get("source_snapshot_sha256")
            if explicit:
                return explicit
            parent = manifest.get("parent_snapshot_id")
            if parent is None:
                return identifier
            current = self.corpus.snapshot(parent)
        raise ValueError("Source snapshot lineage exceeds the bounded lookup depth.")

    def public_refresh_status(self) -> dict:
        state = refresh_status(self.corpus.settings.object_directory.parent / "source-refresh")
        keys = (
            "status",
            "day",
            "started_at",
            "completed_at",
            "errors",
            "investigation_count",
            "total_catalog_records",
            "last_complete_observation_id",
            "last_complete_at",
            "last_complete_day",
            "scientific_snapshot_promoted",
            "scientific_asset_bytes_acquired",
        )
        return {
            **{key: state.get(key) for key in keys},
            "metadata_captured": sum(
                bool(row.get("metadata")) for row in state.get("entries", {}).values()
            ),
            "manifests_captured": sum(
                bool(row.get("manifest")) for row in state.get("entries", {}).values()
            ),
        }

    def source_changes(self, snapshot_id: str, against_id: str | None = None) -> dict:
        before, after = self.corpus.snapshot(snapshot_id), self.corpus.snapshot(against_id)
        released = snapshot_changes(before["manifest"], after["manifest"])
        directory = self.corpus.settings.object_directory.parent / "source-refresh"
        observation = latest_observation(directory)
        observed = []
        if observation is not None:
            originals = {
                row["accession"]: row
                for row in before["manifest"]["investigations"]
                if row["accession"].startswith("PSI-")
            }
            original_collection = self.manifest_collection(before)
            old_manifests = {
                row["accession"]: row
                for row in (
                    original_collection["manifests"]
                    if original_collection
                    else before["manifest"].get("manifests", [])
                )
            }
            observed_accessions = set(observation["entries"])
            for accession in sorted(observed_accessions | set(originals)):
                entry = observation["entries"].get(accession)
                if entry is None:
                    observed.append({"accession": accession, "status": "not_in_observed_catalog"})
                    continue
                if accession not in originals:
                    observed.append(
                        {
                            "accession": accession,
                            "status": "new_catalog_investigation",
                            "version": entry["investigation_version"],
                        }
                    )
                    continue
                original = originals[accession]
                change: dict[str, Any] = {"accession": accession, "status": "unchanged"}
                if entry["metadata"]["sha256"] != original["metadata_sha256"]:
                    new_metadata = checked_json(directory, entry["metadata"])
                    old_metadata = self._metadata(original)
                    fields = [
                        field
                        for field in (*METADATA_FIELDS, "version", "doi")
                        if old_metadata.get(field) != new_metadata.get(field)
                    ]
                    change.update(
                        status="metadata_observation_changed",
                        changed_fields=fields,
                        before_sha256=original["metadata_sha256"],
                        observed_sha256=entry["metadata"]["sha256"],
                        observed_version=entry["investigation_version"],
                    )
                old_manifest = old_manifests.get(accession)
                if entry.get("manifest") and (
                    old_manifest is None or entry["manifest"]["sha256"] != old_manifest["sha256"]
                ):
                    change["manifest_status"] = (
                        "new_manifest_observation"
                        if old_manifest is None
                        else "manifest_observation_changed"
                    )
                    change["manifest_sha256"] = entry["manifest"]["sha256"]
                    change["observed_file_count"] = entry["manifest"]["file_count"]
                    change["status"] = "source_observation_changed"
                    if old_manifest is not None:
                        old_directory = (
                            self.corpus.settings.object_directory.parent / "catalog-manifests"
                            if original_collection
                            else self.corpus.settings.fixture_directory
                        )
                        old_document = checked_json(old_directory, old_manifest)
                        new_document = checked_json(directory, entry["manifest"])
                        change["files"] = manifest_changes(
                            manifest_files(json.dumps(old_document).encode()),
                            manifest_files(json.dumps(new_document).encode()),
                        )
                if change["status"] != "unchanged":
                    observed.append(change)
        return {
            "pinned_snapshot_id": before["snapshot_id"],
            "current_scientific_snapshot_id": after["snapshot_id"],
            "released_changes": released,
            "refresh_status": self.public_refresh_status(),
            "latest_complete_source_observation_id": observation["observation_id"]
            if observation
            else None,
            "observed_changes": observed,
            "scientific_snapshot_promoted_by_refresh": False,
            "case_mutation": False,
            "limitations": [
                "Observed source changes are not automatically curated scientific corrections.",
                "Saved cases retain their pinned sources; decide whether to create a new revision.",
            ],
        }

    def _metadata(self, record: dict) -> dict:
        if record.get("source_kind") == "nasa":
            content = (
                self.corpus.settings.object_directory / record["metadata_sha256"]
            ).read_bytes()
            if sha256(content).hexdigest() != record["metadata_sha256"]:
                raise ValueError("Retained NASA metadata differs from its frozen checksum.")
            value = json.loads(content)
            if (
                value.get("accession") != record["accession"]
                or value.get("version") != record["version"]
            ):
                raise ValueError("NASA metadata identity differs from its frozen investigation.")
            return value
        root = self.corpus.settings.fixture_directory.resolve()
        path = (root / record["metadata_path"]).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Metadata reference is outside the retained source directory.")
        content = path.read_bytes()
        if sha256(content).hexdigest() != record["metadata_sha256"]:
            raise ValueError("Metadata bytes differ from the frozen source checksum.")
        value = json.loads(content)
        if (
            value.get("accession") != record["accession"]
            or value.get("version") != record["version"]
        ):
            raise ValueError("Metadata identity differs from its snapshot.")
        return value

    @staticmethod
    def metadata_anchor(snapshot: str, record: dict, field: str) -> EvidenceAnchor:
        return EvidenceAnchor(
            snapshot_id=snapshot,
            source_kind=record.get("source_kind") or "psi",
            accession=record["accession"],
            investigation_version=record["version"],
            source_sha256=record["metadata_sha256"],
            kind="metadata_field",
            field=field,
        )

    def dossier(self, accession: str, snapshot_id: str | None = None) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        record = next(
            (
                row
                for row in snapshot["manifest"]["investigations"]
                if row["accession"] == accession
            ),
            None,
        )
        if record is None:
            raise MissingSource("Investigation is not in this frozen snapshot.")
        metadata = self._metadata(record)
        fields = {
            field: {
                "value": metadata.get(field),
                "anchor": self.metadata_anchor(snapshot["snapshot_id"], record, field),
                "scientific_role": "objective"
                if field in {"objective", "hypothesis"}
                else "prospective_impact"
                if field == "researchImpacts"
                else "source_metadata",
                "source_origin": "curated_nasa_research_excerpt"
                if record.get("source_kind") == "nasa"
                else "source_reported_metadata",
            }
            for field in METADATA_FIELDS
            if field in metadata
        }
        return {
            **self.corpus.investigation(accession, snapshot["snapshot_id"]),
            "source_fields": fields,
            "findings": None,
            "findings_status": (
                "Not inferred from objectives or prospective impacts; consult source reports "
                "and measurements."
            ),
            "coverage": self.coverage(snapshot["snapshot_id"], accession)["items"][0],
            "child_investigations": [
                public_investigation(item)
                for item in snapshot["manifest"]["investigations"]
                if item.get("parent_accession") == accession
            ],
            "literature_sources": [
                item
                for item in self.documents(snapshot["snapshot_id"])["items"]
                if accession in item["associated_investigations"]
            ]
            if record.get("source_kind") == "nasa"
            else [],
        }

    def read_anchor(self, anchor: EvidenceAnchor) -> dict:
        snapshot = self.corpus.snapshot(anchor.snapshot_id)
        if anchor.source_kind == "ntrs":
            return self.read_document_anchor(anchor, snapshot)
        record = next(
            (
                row
                for row in snapshot["manifest"]["investigations"]
                if row["accession"] == anchor.accession
            ),
            None,
        )
        if record is None or record["version"] != anchor.investigation_version:
            raise MissingSource(
                "The anchor investigation/version is absent from its frozen snapshot."
            )
        expected_kind = record.get("source_kind") or "psi"
        if anchor.source_kind != expected_kind:
            raise MissingSource("The anchor source namespace differs from its investigation.")
        details: dict[str, Any] = {}
        if anchor.kind == "metadata_field":
            if (
                anchor.source_sha256 != record["metadata_sha256"]
                or anchor.field not in METADATA_FIELDS
            ):
                raise MissingSource("The metadata field or checksum is not in the source contract.")
            metadata = self._metadata(record)
            if anchor.field not in metadata:
                raise MissingSource("This source does not report the requested field.")
            raw = metadata[anchor.field]
            text = (
                raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False, sort_keys=True)
            )
            source_url = record["source_url"]
            details["raw_value"] = raw
            if expected_kind == "nasa":
                from nova_ember.adapters.nasa_research import metadata_sources

                details.update(
                    source_origin="curated_nasa_research_excerpt",
                    upstream_sources=metadata_sources(metadata, anchor.field),
                )
        else:
            candidates = [
                row
                for row in snapshot["manifest"]["assets"]
                if row["sha256"] == anchor.source_sha256
                and row["accession"] == anchor.accession
                and row["investigation_version"] == anchor.investigation_version
                and (anchor.asset_id is None or row["id"] == anchor.asset_id)
            ]
            if not candidates:
                raise MissingSource(
                    "The selected source does not belong to this investigation/version."
                )
            if len(candidates) > 1:
                raise MissingSource("Select the exact asset ID for identical source copies.")
            asset = public_asset(candidates[0])
            content = self.corpus.asset_bytes(asset)
            source_url = asset["source_url"]
            details["asset"] = asset
            if asset.get("source_kind") == "nasa":
                details.update(
                    source_origin=asset.get("origin"),
                    upstream_sources=[
                        {"label": item.get("title") or "Original NASA publication", **item}
                        for item in asset.get("source_provenance", [])
                    ],
                )
            if anchor.kind == "table_cell":
                table = parse_csv_bytes(content, asset["encoding"])
                row = next((row for row in table.rows if row.row_number == anchor.source_row), None)
                if row is None or anchor.column is None or anchor.column >= len(row.cells):
                    raise MissingSource("The selected physical source row or column is absent.")
                text = row.cells[anchor.column]
                details.update(
                    header=table.headers[anchor.column]
                    if anchor.column < len(table.headers)
                    else None,
                    line_end=row.line_end,
                )
            elif anchor.kind == "text_lines":
                if asset["encoding"] != "utf-8" or not asset["file_name"].endswith(".txt"):
                    raise MissingSource("This source has no reviewed plain-text line reader.")
                lines = content.decode("utf-8", errors="strict").splitlines()
                assert anchor.source_row is not None and anchor.line_end is not None
                if anchor.line_end > len(lines) or anchor.line_end - anchor.source_row > 100:
                    raise MissingSource("Text line interval is absent or exceeds 101 source lines.")
                text = "\n".join(lines[anchor.source_row - 1 : anchor.line_end])
            elif anchor.kind == "workbook_cell":
                if asset["file_name"].endswith(".xls"):
                    source = xls_cells(content, anchor.sheet, coordinate=anchor.cell)
                    details["cell"] = source["selected_cell"]
                    details["limitations"] = source["limitations"]
                    details["date_mode"] = source["date_mode"]
                    text = str(source["selected_cell"]["raw_value"])
                elif not asset["file_name"].endswith(".xlsx"):
                    raise MissingSource("This source has no reviewed workbook reader.")
                else:
                    sheets = workbook_cells(content, {str(anchor.sheet)})
                    cell = next(
                        (
                            cell
                            for sheet in sheets
                            for cell in sheet.cells
                            if cell.coordinate == anchor.cell
                        ),
                        None,
                    )
                    if cell is None:
                        raise MissingSource("The selected workbook cell is absent.")
                    details["cell"] = asdict(cell)
                    text = cell.text if cell.text is not None else cell.raw_value or ""
                    details["limitation"] = (
                        "Formula text and cached values are separate; no formula is executed."
                    )
            elif anchor.kind == "document_page":
                if not asset["file_name"].endswith(".pdf"):
                    raise MissingSource("This source has no registered PDF page reader.")
                pages = extract_pdf_pages_bounded(content)
                assert anchor.page is not None
                if anchor.page > len(pages):
                    raise MissingSource("The selected source PDF page is absent.")
                page = pages[anchor.page - 1]
                if page.extraction_error:
                    raise MissingSource(page.extraction_error)
                text = page.text
                details.update(
                    page_text_sha256=page.text_sha256, extraction_method="pypdf-plain-page-text-v2"
                )
            elif anchor.kind == "document_paragraph":
                assert anchor.paragraph is not None
                if asset["file_name"].endswith(".docx"):
                    paragraphs = docx_paragraphs(content)
                    if anchor.paragraph > len(paragraphs):
                        raise MissingSource("The selected DOCX paragraph is absent.")
                    paragraph = paragraphs[anchor.paragraph - 1]
                    text = paragraph.text
                    details["paragraph"] = asdict(paragraph)
                    details["extraction_method"] = "docx-xml-paragraph-v1"
                elif asset["file_name"].endswith(".rtf"):
                    extracted = rtf_text(content)
                    lines = extracted["text"].splitlines()
                    if anchor.paragraph > len(lines):
                        raise MissingSource("The selected extracted RTF paragraph is absent.")
                    text = lines[anchor.paragraph - 1]
                    details["extraction"] = {
                        key: value for key, value in extracted.items() if key != "text"
                    }
                    details["extraction_method"] = "rtf-text-paragraph-v1"
                else:
                    raise MissingSource("This source has no registered paragraph reader.")
            elif anchor.kind == "document_figure":
                if not asset["file_name"].endswith(".docx"):
                    raise MissingSource("This source has no registered embedded-figure reader.")
                assert anchor.member is not None
                raw, media_type = docx_figure_bytes(content, anchor.member)
                if sha256(raw).hexdigest() != anchor.member_sha256:
                    raise MissingSource("The selected embedded image differs from its frozen hash.")
                details.update(
                    content_kind="source_image",
                    member=anchor.member,
                    member_sha256=anchor.member_sha256,
                    media_type=media_type,
                    byte_size=len(raw),
                    scientific_measurement_ready=False,
                )
                text = ""
            elif anchor.kind == "media_frame":
                if anchor.frame != 0 or asset["media_type"] not in {"image/jpeg", "image/png"}:
                    raise MissingSource("Select frame zero of a retained still image.")
                media = self.media(
                    asset["sha256"],
                    snapshot["snapshot_id"],
                    accession=asset["accession"],
                    asset_id=asset["id"],
                )
                details.update(
                    content_kind="source_image",
                    media_type=asset["media_type"],
                    metadata=media["metadata"],
                    media_origin="original_source_bytes",
                )
                text = ""
            else:
                raise MissingSource(
                    "This source kind requires a registered calibrated document/media reader."
                )
        if anchor.start is not None:
            assert anchor.end is not None
            if anchor.end > len(text):
                raise MissingSource("Character span is outside its exact source text.")
            text = text[anchor.start : anchor.end]
        if len(text) > 24000:
            raise ValueError("Select a character span of at most 24,000 characters.")
        return {
            "anchor": anchor,
            "text": text,
            "source_url": source_url,
            "status": "source_resolved",
            "origin": "source_reported",
            **details,
        }

    def read_document_anchor(self, anchor: EvidenceAnchor, snapshot: dict) -> dict:
        directory = self.corpus.settings.object_directory.parent / "evidence-documents"
        base_id = self.source_snapshot_id(snapshot)
        assert anchor.document_id is not None
        record = load_ntrs_document(directory, anchor.document_id, base_id, anchor.capture_id)
        if record is None or record["pdf"] is None:
            raise MissingSource(
                "The frozen NTRS document capture is unavailable in this source scope."
            )
        if anchor.source_sha256 != record["pdf"]["sha256"]:
            raise MissingSource("The PDF checksum differs from the selected NTRS source capture.")
        declared = next(
            (
                item
                for item in snapshot["manifest"].get("nasa_research_documents", [])
                if item["document_id"] == anchor.document_id
            ),
            None,
        )
        if declared and record["pdf"]["sha256"] != (
            declared.get("expected_pdf_sha256") or declared.get("sha256")
        ):
            raise MissingSource("This PDF revision is outside the reviewed NASA source snapshot.")
        pages = read_document_pages(directory, record)
        if anchor.page is None or anchor.page > len(pages):
            raise MissingSource("The selected document page is absent.")
        page = pages[anchor.page - 1]
        if page.get("extraction_error"):
            raise MissingSource(page["extraction_error"])
        start = anchor.start or 0
        end = anchor.end if anchor.end is not None else min(start + 1000, len(page["text"]))
        if start > len(page["text"]) or end > len(page["text"]) or end - start > 1000:
            raise ValueError("Select a source-page excerpt of at most 1,000 characters.")
        return {
            "anchor": anchor.model_copy(update={"start": start, "end": end}),
            "text": page["text"][start:end],
            "source_url": record["pdf"]["source_url"] + f"#page={anchor.page}",
            "citation_url": record["source_url"],
            "title": record["title"],
            "page_text_sha256": page["text_sha256"],
            "status": "source_resolved",
            "extraction_method": record["extraction_method"],
            "copyright": record["copyright"],
            "redistribution": record["redistribution"],
            "original_bytes_served": False,
            "limitations": record["limitations"],
        }

    def documents(self, snapshot_id: str | None = None) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        base_id = self.source_snapshot_id(snapshot)
        directory = self.corpus.settings.object_directory.parent / "evidence-documents"
        declared = {
            item["document_id"]: item
            for item in snapshot["manifest"].get("nasa_research_documents", [])
        }
        identifiers = {path.stem for path in directory.glob("[0-9]" * 11 + ".json")}
        valid_ids = {item["accession"] for item in snapshot["manifest"]["investigations"]}
        records = []
        for identifier in sorted(identifiers | set(declared)):
            record = load_ntrs_document(directory, identifier, base_id)
            reference = declared.get(identifier)
            if reference and (
                record is None
                or record.get("pdf") is None
                or record["pdf"]["sha256"]
                != (reference.get("expected_pdf_sha256") or reference.get("sha256"))
            ):
                records.append(
                    {
                        **reference,
                        "source_id": "NTRS:" + identifier,
                        "status": "original_document_not_retained",
                        "associated_investigations": [
                            item
                            for item in reference["associated_investigations"]
                            if item in valid_ids
                        ],
                        "source_sha256": None,
                        "capture_id": None,
                        "page_count": None,
                        "limitations": [
                            "Official source reference retained; full page text is unavailable "
                            "until the expected original is captured."
                        ],
                    }
                )
                continue
            if record is None:
                continue
            associated = set(record["associated_investigations"])
            if reference:
                associated.update(reference["associated_investigations"])
            associated.intersection_update(valid_ids)
            if not associated:
                continue
            public = {
                key: record.get(key)
                for key in (
                    "document_id",
                    "capture_id",
                    "source_id",
                    "title",
                    "source_url",
                    "status",
                    "copyright",
                    "distribution",
                    "redistribution",
                    "associated_investigations",
                    "extraction_method",
                    "unavailable_text_pages",
                    "limitations",
                )
            }
            public["source_sha256"] = record["pdf"]["sha256"] if record["pdf"] else None
            public["page_count"] = record["pages"]["page_count"] if record["pages"] else None
            public["associated_investigations"] = sorted(associated)
            records.append(public)
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "items": records,
            "scope": (
                "Versioned NASA report captures and declared originals "
                "bound to this source snapshot."
            ),
        }

    def search_evidence(self, query: EvidenceSearch) -> dict:
        snapshot = self.corpus.snapshot(query.snapshot_id)
        fields = query.fields or METADATA_FIELDS
        if any(field not in (*METADATA_FIELDS, "ntrs_page_text") for field in fields):
            raise ValueError("An evidence field is outside the reviewed metadata contract.")
        terms = query.text.casefold().split()
        matches: list[dict[str, Any]] = []
        for record in snapshot["manifest"]["investigations"]:
            if query.accessions and record["accession"] not in query.accessions:
                continue
            metadata = self._metadata(record)
            for field in fields:
                raw = metadata.get(field)
                if not raw:
                    continue
                text = (
                    raw
                    if isinstance(raw, str)
                    else json.dumps(raw, ensure_ascii=False, sort_keys=True)
                )
                span = _literal_span(text, terms)
                if span is None:
                    continue
                start, end = span
                anchor = self.metadata_anchor(snapshot["snapshot_id"], record, field).model_copy(
                    update={"start": start, "end": end}
                )
                matches.append(
                    {
                        "anchor": anchor,
                        "text": text[start:end],
                        "field_role": "prospective_impact"
                        if field == "researchImpacts"
                        else "objective"
                        if field in {"objective", "hypothesis"}
                        else "source_metadata",
                        "match": (
                            "All literal query terms occur in this field; no outcome inference."
                        ),
                    }
                )
        if not query.fields or "ntrs_page_text" in query.fields:
            directory = self.corpus.settings.object_directory.parent / "evidence-documents"
            base_id = self.source_snapshot_id(snapshot)
            for public in self.documents(snapshot["snapshot_id"])["items"]:
                if not public.get("capture_id"):
                    continue
                record = load_ntrs_document(
                    directory, public["document_id"], base_id, public["capture_id"]
                )
                if record is None or record["pages"] is None:
                    continue
                if query.accessions and not set(query.accessions).intersection(
                    public["associated_investigations"]
                ):
                    continue
                for page in read_document_pages(directory, record):
                    span = _literal_span(page["text"], terms)
                    if span is None:
                        continue
                    start, end = span
                    anchor = EvidenceAnchor(
                        snapshot_id=snapshot["snapshot_id"],
                        source_kind="ntrs",
                        document_id=record["document_id"],
                        capture_id=record["capture_id"],
                        source_sha256=record["pdf"]["sha256"],
                        kind="document_page",
                        page=page["page"],
                        start=start,
                        end=end,
                    )
                    matches.append(
                        {
                            "anchor": anchor,
                            "text": page["text"][start:end],
                            "field_role": "source_document",
                            "match": "Literal source-page terms; interpretation remains separate.",
                        }
                    )
        matches.sort(
            key=lambda item: (
                item["anchor"].accession or "NTRS:" + str(item["anchor"].document_id),
                item["anchor"].field or f"page:{item['anchor'].page:06d}",
            )
        )
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "items": matches[: query.limit],
            "total": len(matches),
            "search_scope": (
                "Frozen PSI/NASA research metadata and captured NTRS page text; "
                "not a global literature or unacquired-document search."
            ),
            "retrieval_method": "literal-field-all-terms-v1",
        }

    def media(
        self,
        digest: str,
        snapshot_id: str | None = None,
        *,
        accession: str | None = None,
        asset_id: str | None = None,
    ) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        asset = self.corpus.asset(
            digest, snapshot["snapshot_id"], accession=accession, asset_id=asset_id
        )
        content = self.corpus.asset_bytes(asset)
        if asset["media_type"] not in {"image/jpeg", "image/png", "video/mp4"}:
            raise MissingSource("This source has no registered image/video metadata profile.")
        retained = next(row for row in snapshot["manifest"]["assets"] if row["id"] == asset["id"])
        result = retained.get("media") or inspect_media(content, asset["file_name"])
        if result["sha256"] != digest:
            raise ValueError("Media metadata belongs to different original bytes.")
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "asset": asset,
            "metadata": result,
            "source_run_association": retained.get("source_run_association"),
            "example_role": retained.get("example_role"),
            "media_origin": "original_source_bytes",
            "measurement_ready": False,
        }

    def source_format(
        self,
        digest: str,
        snapshot_id: str | None,
        sheet: str | None,
        limit: int,
        offset: int,
        *,
        accession: str | None = None,
        asset_id: str | None = None,
    ) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        asset = self.corpus.asset(
            digest, snapshot["snapshot_id"], accession=accession, asset_id=asset_id
        )
        content = self.corpus.asset_bytes(asset)
        filename = asset["file_name"].casefold()
        result: dict[str, Any]
        if filename.endswith(".docx"):
            paragraphs = docx_paragraphs(content)
            result = {
                "format": "docx",
                "paragraphs": [asdict(item) for item in paragraphs[offset : offset + limit]],
                "total_paragraphs": len(paragraphs),
                "extraction_method": "docx-xml-paragraph-v1",
                "embedded_figures": docx_figures(content),
                "limitations": [
                    "Paragraph indices and table positions refer to original document XML.",
                    (
                        "Tracked deletions remain separate; list numbering/layout "
                        "and embedded figures require original-document inspection."
                    ),
                ],
            }
        elif filename.endswith(".rtf"):
            extracted = rtf_text(content)
            paragraphs = extracted["text"].splitlines()
            result = {
                "format": "rtf",
                **{key: value for key, value in extracted.items() if key != "text"},
                "paragraphs": [
                    {"paragraph": index + 1, "text": paragraphs[index]}
                    for index in range(offset, min(len(paragraphs), offset + limit))
                ],
                "total_paragraphs": len(paragraphs),
                "extraction_method": "rtf-text-paragraph-v1",
            }
        elif filename.endswith(".pdf"):
            pages = extract_pdf_pages_bounded(content)
            result = {
                "format": "pdf",
                "pages": [
                    {
                        "page": page.page,
                        "preview_text": page.text[:1000],
                        "character_count": len(page.text),
                        "text_sha256": page.text_sha256,
                        "width_points": page.width_points,
                        "height_points": page.height_points,
                    }
                    for page in pages[offset : offset + limit]
                ],
                "total_pages": len(pages),
                "extraction_method": "pypdf-plain-page-text-v1",
                "limitations": [
                    "Page text does not establish table semantics, image measurements or OCR."
                ],
            }
        elif filename.endswith(".xls"):
            result = {"format": "xls", **xls_cells(content, sheet, limit, offset)}
        elif filename.endswith(".mat"):
            result = {"format": "matlab", **inspect_matlab(content)}
        elif filename.endswith((".zip", ".tar", ".tar.gz", ".tgz")):
            result = archive_index(content, filename)
            result["members"] = result["members"][offset : offset + limit]
            result["format"] = "archive"
        else:
            raise MissingSource("This source requires a different registered format reader.")
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "asset": asset,
            "limit": limit,
            "offset": offset,
            "scientific_normalization": "not_inferred_from_format_extraction",
            **result,
        }

    def catalog_classifications(self, snapshot: dict) -> dict:
        catalog = {}
        for record in snapshot["manifest"]["investigations"]:

            def anchor(field: str, record: dict = record) -> dict:
                return self.metadata_anchor(snapshot["snapshot_id"], record, field).model_dump(
                    mode="json"
                )

            catalog[record["accession"]] = classifications(
                record,
                self._metadata(record),
                anchor,
                FACILITY_ALIASES,
            )
        return catalog

    def matching_records(self, query: RecordQuery) -> tuple[list[dict], list[dict], dict]:
        snapshot = self.corpus.snapshot(query.snapshot_id)
        catalog = self.catalog_classifications(snapshot) if query.catalog_facets else None
        matches = []
        checked_assets = []
        for asset in sorted(
            snapshot["manifest"]["assets"], key=lambda item: (item["accession"], item["file_name"])
        ):
            if query.accessions and asset["accession"] not in query.accessions:
                continue
            if catalog is not None and not matches_facets(
                catalog[asset["accession"]], query.catalog_facets
            ):
                continue
            if not asset["file_name"].endswith(".csv") or not asset.get("encoding"):
                continue
            raw = parse_csv_bytes(self.corpus.asset_bytes(asset), asset["encoding"])
            table = interpret_table(asset, raw)
            checked_assets.append(
                {"sha256": asset["sha256"], "adapter_id": table.adapter_id, "status": table.status}
            )
            for record in table.records:
                if query.row_kinds and record.row_kind not in query.row_kinds:
                    continue
                if (
                    query.text
                    and query.text.casefold() not in " ".join(record.raw_cells).casefold()
                ):
                    continue
                if not all(
                    any(_field_matches(field, predicate) for field in record.fields)
                    for predicate in query.predicates
                ):
                    continue
                matches.append(
                    {
                        "accession": asset["accession"],
                        "asset": public_asset(asset),
                        "record": record,
                        "adapter_id": table.adapter_id,
                        "anchor": EvidenceAnchor(
                            snapshot_id=snapshot["snapshot_id"],
                            source_kind=asset.get("source_kind") or "psi",
                            accession=asset["accession"],
                            asset_id=asset["id"],
                            investigation_version=asset["investigation_version"],
                            source_sha256=asset["sha256"],
                            kind="table_cell",
                            source_row=record.source_row,
                            column=0,
                        ),
                        "match_explanation": (
                            "Explicit text, row-role and field predicates matched; "
                            "source records retain their original grain."
                        ),
                    }
                )
        return matches, checked_assets, snapshot

    def query_records(self, query: RecordQuery) -> dict:
        base, checked_assets, snapshot = self.matching_records(
            query.model_copy(update={"catalog_facets": {}})
        )
        catalog = self.catalog_classifications(snapshot)
        matches = [
            item
            for item in base
            if matches_facets(catalog[item["accession"]], query.catalog_facets)
        ]
        page = _cursor_page(matches, query, snapshot["snapshot_id"])
        return {
            **page,
            "catalog_facets": facet_counts(
                catalog,
                [item["accession"] for item in base],
                query.catalog_facets,
                "source_records",
            ),
            "catalog_classifications": {
                item["accession"]: catalog[item["accession"]] for item in page["items"]
            },
            "catalog_annotation_version": ANNOTATION_VERSION,
            "grain": "source_records",
            "independent_run_count": None,
            "sources_checked": checked_assets,
            "limitations": [
                (
                    "Range, day, condition, note and session records are not silently converted "
                    "into independent runs."
                ),
                (
                    "Numeric predicates use the displayed canonical unit and reviewed normalized "
                    "values only; unknown calibration/species remain unavailable."
                ),
                (
                    "No matching result means no match in the inspected frozen assets, not "
                    "global novelty or proof that the condition was never studied."
                ),
            ],
        }

    def condition_coverage(self, request: CoverageRequest) -> dict:
        if request.query.cursor is not None:
            raise ValueError("Coverage applies to the whole frozen query, not a paginated cursor.")
        matches, sources, snapshot = self.matching_records(request.query)
        return {
            **joint_coverage([row["record"] for row in matches], request.axes),
            "snapshot_id": snapshot["snapshot_id"],
            "query": request.query.model_dump(exclude={"cursor", "limit"}),
            "sources_checked": sources,
        }

    def query_investigations(self, query: InvestigationQuery) -> dict:
        snapshot = self.corpus.snapshot(query.snapshot_id)
        catalog = self.catalog_classifications(snapshot)
        assets_by_id: dict[str, list[dict]] = {}
        for asset in snapshot["manifest"]["assets"]:
            assets_by_id.setdefault(asset["accession"], []).append(asset)
        matches = []
        terms = query.text.casefold().split()
        for record in sorted(
            snapshot["manifest"]["investigations"],
            key=lambda item: (item["title"], item["accession"]),
        ):
            if query.accessions and record["accession"] not in query.accessions:
                continue
            searchable = " ".join(
                str(record.get(field) or "")
                for field in (
                    "title",
                    "accession",
                    "acronym",
                    "description",
                    "objective",
                    "approach",
                    "hardware",
                )
            )
            if not all(term in searchable.casefold() for term in terms):
                continue
            if (
                query.hardware
                and query.hardware.casefold() not in (record.get("hardware") or "").casefold()
            ):
                continue
            if (
                query.platform
                and query.platform.casefold() not in (record.get("platform") or "").casefold()
            ):
                continue
            license_value = record.get("license") or "unknown"
            if query.license and license_value != query.license:
                continue
            available = assets_by_id.get(record["accession"], [])
            has_table = any(
                asset["kind"] in {"experimental_table", "publication_table"} for asset in available
            )
            if query.availability == "catalog_only" and available:
                continue
            if query.availability == "assets_available" and not available:
                continue
            if query.availability == "interpreted_table" and not has_table:
                continue
            matches.append(
                {
                    **public_investigation(record),
                    "asset_count": len(available),
                    "coverage": "assets_available" if available else "catalog_only",
                    "match_explanation": (
                        "Explicit metadata predicates; missing values were not inferred from "
                        "semantic similarity."
                    ),
                }
            )
        base = matches
        matches = [
            item
            for item in base
            if matches_facets(catalog[item["accession"]], query.catalog_facets)
        ]
        page = _cursor_page(matches, query, snapshot["snapshot_id"])
        return {
            **page,
            "catalog_facets": facet_counts(
                catalog,
                [item["accession"] for item in base],
                query.catalog_facets,
                "investigations",
            ),
            "catalog_classifications": {
                item["accession"]: catalog[item["accession"]] for item in page["items"]
            },
            "catalog_annotation_version": ANNOTATION_VERSION,
            "retrieval_method": "typed-literal-discovery-v1",
            "ranking": "Title then accession; relevance/applicability policies are separate.",
        }

    def manifest_collection(self, snapshot: dict) -> dict | None:
        base_id = self.source_snapshot_id(snapshot)
        return load_collection(
            self.corpus.settings.object_directory.parent / "catalog-manifests", base_id
        )

    def coverage(self, snapshot_id: str | None = None, accession: str | None = None) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        collection = self.manifest_collection(snapshot)
        manifests = {
            row["accession"]: row
            for row in (
                collection["manifests"] if collection else snapshot["manifest"].get("manifests", [])
            )
        }
        items = []
        for record in snapshot["manifest"]["investigations"]:
            if accession and record["accession"] != accession:
                continue
            assets = [
                asset
                for asset in snapshot["manifest"]["assets"]
                if asset["accession"] == record["accession"]
            ]
            counts: Counter[str] = Counter()
            for asset in assets:
                if asset["file_name"].endswith(".csv") and asset.get("encoding"):
                    interpreted = interpret_table(
                        asset, parse_csv_bytes(self.corpus.asset_bytes(asset), asset["encoding"])
                    )
                    counts.update(interpreted.row_kind_counts)
            manifest = manifests.get(record["accession"])
            items.append(
                {
                    "accession": record["accession"],
                    "metadata": "available",
                    "source_kind": record.get("source_kind") or "psi",
                    "data_status": record.get("data_status"),
                    "manifest": "curated_nasa_sources"
                    if record.get("source_kind") == "nasa"
                    else "available"
                    if manifest
                    else "not_ingested",
                    "manifest_file_count": manifest.get("file_count") if manifest else None,
                    "acquired_assets": len(assets),
                    "row_roles": dict(counts),
                    "independent_run_count": None,
                    "calibration_status": "source_specific_assessment_required",
                    "model_readiness": "not_established_by_coverage",
                    "rights": record.get("license") or "unresolved",
                    "condition_gaps": (
                        "Query interpreted source records; metadata ranges "
                        "are not joint condition coverage."
                    ),
                    "status": "available" if assets else "catalog_only",
                }
            )
        if accession and not items:
            raise MissingSource("Investigation is absent from this frozen snapshot.")
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "items": items,
            "manifest_collection_id": collection["collection_id"] if collection else None,
            "scope": (
                "The inspected frozen snapshot and bound manifest collection; absent rows do "
                "not establish unstudied science."
            ),
        }

    def manifest(
        self, accession: str, snapshot_id: str | None = None, limit: int = 50, offset: int = 0
    ) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        investigation = self.corpus.investigation(accession, snapshot["snapshot_id"])
        if investigation.get("source_kind") == "nasa":
            sources = investigation.get("source_provenance") or []
            return {
                "snapshot_id": snapshot["snapshot_id"],
                "accession": accession,
                "source_kind": "nasa",
                "manifest_kind": "curated_nasa_sources",
                "manifest_sha256": None,
                "fetched_at": snapshot["fetched_at"],
                "items": [
                    {
                        **item,
                        "key": None,
                        "file_name": item.get("title") or "Official NASA source",
                        "kind": "publication_reference",
                        "acquisition_status": "official_source_reference",
                    }
                    for item in sources[offset : offset + limit]
                ],
                "total": len(sources),
                "limit": limit,
                "offset": offset,
                "rights": "Original publication rights remain attached to the NASA source.",
            }
        collection = self.manifest_collection(snapshot)
        if collection:
            reference = next(
                (row for row in collection["manifests"] if row["accession"] == accession), None
            )
            if reference is None:
                raise MissingSource("No manifest was captured for this investigation.")
            directory = self.corpus.settings.object_directory.parent / "catalog-manifests"
            document = checked_json(directory, reference)
        else:
            reference = next(
                (
                    row
                    for row in snapshot["manifest"].get("manifests", [])
                    if row["accession"] == accession
                ),
                None,
            )
            if reference is None:
                raise MissingSource("The manifest has not been ingested for this snapshot.")
            document = checked_json(self.corpus.settings.fixture_directory, reference)
        from nova_ember.adapters.psi import manifest_files

        files = manifest_files(json.dumps(document).encode())
        items = [
            {
                "key": row.get("key"),
                "file_name": row.get("file_name") or str(row.get("key", "")).rsplit("/", 1)[-1],
                "file_size": row.get("file_size", row.get("size")),
                "declared_bytes": exact_byte_count(row.get("bytes_size")),
                "version": row.get("version"),
                "restricted": row.get("restricted"),
                "visible": row.get("visible"),
                "kind": "manifest_entry",
                "acquisition_status": "not_acquired_by_manifest_read",
            }
            for row in files[offset : offset + limit]
        ]
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "accession": accession,
            "manifest_sha256": reference["sha256"],
            "fetched_at": reference["fetched_at"],
            "items": items,
            "total": len(files),
            "limit": limit,
            "offset": offset,
            "rights": (
                "Check asset-specific rights before acquisition/export; a manifest is not "
                "redistribution permission."
            ),
        }

    def lineage(self, snapshot_id: str | None = None) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        nodes = []
        relations = []
        seen_hardware = set()
        accessions = {record["accession"] for record in snapshot["manifest"]["investigations"]}
        for record in snapshot["manifest"]["investigations"]:
            metadata = self._metadata(record)
            nodes.append(
                {
                    "id": record["accession"],
                    "kind": "investigation",
                    "label": record["title"],
                    "version": record["version"],
                }
            )
            for target in re.findall(
                r"(?:PSI-[1-9][0-9]*|NASA-[A-Z][A-Z0-9-]*)",
                str(metadata.get("related_glds") or ""),
            ):
                if target in accessions:
                    relations.append(
                        {
                            "source": record["accession"],
                            "target": target,
                            "relation": "related_investigation",
                            "anchor": self.metadata_anchor(
                                snapshot["snapshot_id"], record, "related_glds"
                            ),
                            "limitation": (
                                "A related/reanalysis record is not automatically "
                                "a new independent experiment."
                            ),
                        }
                    )
            if record.get("parent_accession") in accessions:
                relations.append(
                    {
                        "source": record["accession"],
                        "target": record["parent_accession"],
                        "relation": "part_of_program",
                        "limitation": "Program membership does not identify independent trials.",
                    }
                )
            for raw_name in str(metadata.get("experimentHardware") or "").split(","):
                raw_name = raw_name.strip()
                if not raw_name:
                    continue
                name = FACILITY_ALIASES.get(raw_name, raw_name)
                hardware_id = "hardware:" + sha256(name.encode()).hexdigest()[:16]
                if hardware_id not in seen_hardware:
                    nodes.append(
                        {
                            "id": hardware_id,
                            "kind": "hardware_context",
                            "label": name,
                            "configuration": "not_resolved_by_name",
                        }
                    )
                    seen_hardware.add(hardware_id)
                relations.append(
                    {
                        "source": record["accession"],
                        "target": hardware_id,
                        "relation": "source_lists_hardware",
                        "source_label": raw_name,
                        "anchor": self.metadata_anchor(
                            snapshot["snapshot_id"], record, "experimentHardware"
                        ),
                        "limitation": (
                            "Shared hardware name does not establish "
                            "calibration/configuration equivalence."
                        ),
                    }
                )
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "nodes": nodes,
            "relations": relations,
            "mapping_version": "metadata-hardware-aliases-v1",
            "limitations": [
                (
                    "These are source-reported investigation/facility relations; sensor "
                    "placement, configuration versions and calibration require source-specific "
                    "evidence."
                ),
                "DAFT dust sessions and SAME smoke measurements remain separate datasets.",
            ],
        }

    def earth_collection(self, snapshot_id: str | None = None) -> dict:
        snapshot = self.corpus.snapshot(snapshot_id)
        items = []
        for record in snapshot["manifest"]["investigations"]:
            metadata = self._metadata(record)
            impacts = metadata.get("researchImpacts") or ""
            if any(
                term in impacts.casefold()
                for term in ("earth", "terrestrial", "submarine", "building")
            ):
                items.append(
                    {
                        "accession": record["accession"],
                        "title": record["title"],
                        "source_text": impacts,
                        "anchor": self.metadata_anchor(
                            snapshot["snapshot_id"], record, "researchImpacts"
                        ),
                        "status": "research_hypothesis",
                        "status_reason": (
                            "Prospective impact metadata is not a verified deployed application."
                        ),
                        "transfer_constraints": {
                            key: "requires_source_specific_assessment"
                            for key in (
                                "gravity",
                                "ventilation",
                                "scale",
                                "material",
                                "atmosphere",
                                "exposure",
                                "equipment",
                            )
                        },
                    }
                )
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "items": items,
            "status_vocabulary": [
                "documented_application",
                "supported_engineering_connection",
                "research_hypothesis",
            ],
            "limitations": [
                (
                    "No documented technology deployment is inferred from a future-tense impact "
                    "statement."
                ),
                (
                    "Additional primary application evidence can support a separately versioned "
                    "transfer assessment."
                ),
            ],
        }


def create_discovery_router(corpus: Corpus) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["Discovery and evidence"])
    service = Discovery(corpus)

    @router.get("/source-refresh/status")
    def source_refresh_status():
        return service.public_refresh_status()

    @router.get("/snapshots/{snapshot_id}/changes")
    def changes(snapshot_id: Digest, against_id: Digest | None = None):
        return service.source_changes(snapshot_id, against_id)

    @router.post("/discovery/investigations")
    def investigations(query: InvestigationQuery):
        return service.query_investigations(query)

    @router.post("/discovery/records")
    def records(query: RecordQuery):
        return service.query_records(query)

    @router.get("/investigations/{accession}/dossier")
    def dossier(accession: InvestigationId, snapshot_id: Digest | None = None):
        return service.dossier(accession, snapshot_id)

    @router.get("/investigations/{accession}/manifest")
    def manifest(
        accession: InvestigationId,
        snapshot_id: Digest | None = None,
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
    ):
        return service.manifest(accession, snapshot_id, limit, offset)

    @router.post("/evidence/read")
    def read_evidence(anchor: EvidenceAnchor):
        return service.read_anchor(anchor)

    @router.post("/evidence/search")
    def search_evidence(query: EvidenceSearch):
        return service.search_evidence(query)

    @router.get("/evidence/coverage")
    def coverage(snapshot_id: Digest | None = None, accession: InvestigationId | None = None):
        return service.coverage(snapshot_id, accession)

    @router.post("/evidence/condition-coverage")
    def condition_coverage(request: CoverageRequest):
        return service.condition_coverage(request)

    @router.get("/evidence/lineage")
    def lineage(snapshot_id: Digest | None = None):
        return service.lineage(snapshot_id)

    @router.get("/evidence/earth-applications")
    def earth_applications(snapshot_id: Digest | None = None):
        return service.earth_collection(snapshot_id)

    @router.get("/evidence/documents")
    def documents(snapshot_id: Digest | None = None):
        return service.documents(snapshot_id)

    @router.get("/assets/{digest}/media")
    def media(
        digest: Digest,
        snapshot_id: Digest | None = None,
        accession: InvestigationId | None = None,
        asset_id: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
    ):
        return service.media(digest, snapshot_id, accession=accession, asset_id=asset_id)

    @router.get("/assets/{digest}/format")
    def source_format(
        digest: Digest,
        snapshot_id: Digest | None = None,
        sheet: Annotated[str | None, Query(max_length=128)] = None,
        limit: Annotated[int, Query(ge=1, le=250)] = 50,
        offset: Annotated[int, Query(ge=0, le=200000)] = 0,
        accession: InvestigationId | None = None,
        asset_id: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
    ):
        return service.source_format(
            digest, snapshot_id, sheet, limit, offset, accession=accession, asset_id=asset_id
        )

    @router.get(
        "/assets/{digest}/embedded-figure",
        response_class=Response,
        responses={200: {"content": {"application/octet-stream": {}}}},
    )
    def embedded_figure(
        digest: Digest,
        member: Annotated[str, Query(min_length=1, max_length=2048)],
        snapshot_id: Digest | None = None,
        accession: InvestigationId | None = None,
        asset_id: Annotated[str | None, Query(min_length=1, max_length=1024)] = None,
    ):
        asset = corpus.asset(digest, snapshot_id, accession=accession, asset_id=asset_id)
        if not asset["file_name"].endswith(".docx"):
            raise MissingSource("Embedded-figure extraction requires a retained DOCX source.")
        content, media_type = docx_figure_bytes(corpus.asset_bytes(asset), member)
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "X-Content-Type-Options": "nosniff",
                "ETag": '"' + sha256(content).hexdigest() + '"',
            },
        )

    @router.post("/evidence/contradictions/compare")
    def contradictions(pair: ClaimPair):
        for claim in (pair.left, pair.right):
            for anchor in claim.anchors:
                service.read_anchor(anchor)
        return compare_claims(pair.left, pair.right)

    @router.post("/evidence/dependencies/invalidate")
    def dependencies(query: DependencyQuery):
        return {
            "changed": query.changed_ids,
            "invalidated": invalidated_dependents(set(query.changed_ids), query.relations),
            "mutation": False,
        }

    @router.post("/research/hypotheses/assess")
    def hypothesis_plan(hypothesis: Hypothesis):
        for claim in (*hypothesis.supporting, *hypothesis.contrary):
            for anchor in claim.anchors:
                service.read_anchor(anchor)
        return plan_hypothesis(hypothesis)

    @router.post("/research/controls/assess")
    def control(candidate: ControlCandidate):
        for claim in candidate.evidence:
            for anchor in claim.anchors:
                service.read_anchor(anchor)
        return assess_control(candidate)

    @router.post("/research/earth-transfer/assess")
    def transfer(transfer: EarthTransfer):
        for claim in transfer.evidence:
            for anchor in claim.anchors:
                service.read_anchor(anchor)
        return assess_transfer(transfer)

    return router


def refresh_public_sources(
    settings: Settings, force: bool = False, stop_event: Event | None = None
) -> dict:
    """Maintenance callback; no public endpoint may trigger acquisition or promotion."""
    return refresh_sources_callback(settings, force=force, stop_event=stop_event)

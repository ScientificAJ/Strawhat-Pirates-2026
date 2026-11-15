"""Reviewed NASA research excerpts and publication-table transcriptions.

These records supplement PSI; their application identifiers are not NASA PSI
accessions. Original captures, extracted text and curated views remain separate.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlsplit

from nova_ember.domain.identifiers import NASA_INVESTIGATION_PATTERN
from nova_ember.domain.quantities import conversion_formula, convert_source_scalar
from nova_ember.domain.records import InterpretedTable, SourceField, SourceRecord
from nova_ember.domain.source import RawTable

SOURCE_HOSTS = {"www.nasa.gov", "science.nasa.gov", "ntrs.nasa.gov"}
COLLECTION_SCHEMA = 1


def checked_file(directory: Path, reference: dict, limit: int = 32 * 1024 * 1024) -> bytes:
    root = directory.resolve()
    target = (root / reference["path"]).resolve()
    if not target.is_relative_to(root) or target.stat().st_size > limit:
        raise ValueError("NASA research source is outside the retained collection or size bound.")
    value = target.read_bytes()
    if sha256(value).hexdigest() != reference["sha256"]:
        raise ValueError("NASA research source differs from its recorded checksum.")
    if "byte_size" in reference and len(value) != reference["byte_size"]:
        raise ValueError("NASA research source differs from its recorded size.")
    return value


def official_source_url(value: str) -> bool:
    parsed = urlsplit(value)
    return parsed.scheme == "https" and parsed.netloc in SOURCE_HOSTS and not parsed.username


def load_metadata(directory: Path, record: dict) -> dict:
    value = json.loads(
        checked_file(
            directory,
            {"path": record["metadata_path"], "sha256": record["metadata_sha256"]},
            2 * 1024 * 1024,
        )
    )
    if value.get("accession") != record["accession"] or value.get("version") != record["version"]:
        raise ValueError("NASA research metadata identity differs from its catalog record.")
    return value


def load_collection(directory: Path) -> dict:
    """Verify the reviewed collection before it enters a successor scientific snapshot."""
    manifest = json.loads((directory / "collection.json").read_bytes())
    if manifest.get("schema_version") != COLLECTION_SCHEMA:
        raise ValueError("Unsupported NASA research collection schema.")
    sources = {}
    for source in manifest["sources"]:
        if not official_source_url(source["source_url"]) or source["id"] in sources:
            raise ValueError("NASA research requires a unique official source identity.")
        checked_file(directory, source)
        text = checked_file(directory, source["text"]).decode("utf-8")
        sources[source["id"]] = (source, text)
    identities = set()
    for record in manifest["investigations"]:
        identifier = record["accession"]
        if (
            not re.fullmatch(NASA_INVESTIGATION_PATTERN, identifier)
            or identifier in identities
            or record.get("source_kind") != "nasa"
            or record.get("record_type") not in {"program", "investigation"}
            or record.get("version") != 1
            or not official_source_url(record["source_url"])
        ):
            raise ValueError("Invalid or duplicate NASA research catalog record.")
        identities.add(identifier)
        metadata = load_metadata(directory, record)
        for field, references in metadata["field_provenance"].items():
            if field not in metadata or not references:
                raise ValueError("A curated metadata field requires its original source.")
            for reference in references:
                if reference["source_id"] not in sources:
                    raise ValueError("Metadata points to an unretained NASA source.")
                original, text = sources[reference["source_id"]]
                if reference.get("source_sha256") != original["sha256"]:
                    raise ValueError(
                        "Metadata field source checksum differs from its retained source."
                    )
                if (
                    reference.get("quote") not in text
                    or not reference.get("quote")
                    or reference.get("source_url") != original["source_url"]
                ):
                    raise ValueError("The metadata quotation is absent from its retained source.")
    programs = {
        record["accession"]
        for record in manifest["investigations"]
        if record["record_type"] == "program"
    }
    for record in manifest["investigations"]:
        if record.get("parent_accession") and record["parent_accession"] not in programs:
            raise ValueError("A NASA research child has no retained parent program.")
    asset_ids = set()
    for asset in manifest["assets"]:
        if asset["accession"] not in identities or asset["id"] in asset_ids:
            raise ValueError("NASA research table has an invalid investigation identity.")
        asset_ids.add(asset["id"])
        content = checked_file(directory, asset)
        if (
            asset.get("source_kind") != "nasa"
            or asset.get("kind") != "publication_table"
            or asset.get("origin") not in {"published_table_transcription", "planned_conditions"}
            or asset["table_definition"]["source_sha256"] != sha256(content).hexdigest()
        ):
            raise ValueError("A publication transcription requires its exact reviewed table.")
        for reference in asset["source_provenance"]:
            if not official_source_url(reference["source_url"]):
                raise ValueError("A publication table has no official upstream reference.")
    return manifest


def metadata_sources(metadata: dict, field: str) -> list[dict]:
    return [
        {
            "label": item.get("label") or "Original NASA source",
            "source_url": item["source_url"],
            "source_sha256": item.get("source_sha256"),
            "quote": item["quote"],
            "origin": item.get("origin", "source_excerpt"),
        }
        for item in metadata.get("field_provenance", {}).get(field, [])
    ]


def _published_number(raw: str) -> str | None:
    """Parse a printed scalar; commas are accepted only as conventional digit groups."""
    text = raw.strip()
    if re.fullmatch(r"[+-]?\d{1,3}(?:,\d{3})+(?:\.\d+)?", text):
        return text.replace(",", "")
    if re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?", text):
        return text
    return None


def interpret_publication_table(asset: dict, table: RawTable) -> InterpretedTable:
    """Normalize explicitly reviewed printed scalars; retain every original cell and locator."""
    definition = asset.get("table_definition", {})
    reviewed = (
        definition.get("source_sha256") == asset["sha256"]
        and definition.get("headers") == list(table.headers)
        and len(definition.get("rows", [])) == len(table.rows)
    )
    refusals = [] if reviewed else ["Published table differs from its reviewed transcription."]
    records = []
    for index, row in enumerate(table.rows):
        proof = definition["rows"][index] if reviewed else {}
        if reviewed and proof.get("raw_cells") != list(row.cells):
            raise ValueError("A published table row differs from its reviewed original text.")
        fields = []
        for column, raw in enumerate(row.cells):
            rule = definition["columns"][column] if reviewed else {}
            cell = proof.get("cells", {}).get(str(column), {})
            unit = rule.get("original_unit")
            notes = list(rule.get("notes", [])) + list(cell.get("notes", []))
            if proof:
                notes.append(
                    f"Published transcription: {proof['document_id']}, PDF page {proof['page']}, "
                    f"{proof['table']}, {proof['row_label']}."
                )
            values = {
                "column_index": column,
                "source_column": table.headers[column] if column < len(table.headers) else None,
                "raw_text": raw,
                "quantity_kind": rule.get("quantity_kind"),
                "original_unit": unit,
                "source_value_kind": rule.get("source_value_kind", "source_reported"),
                "basis": rule.get("basis"),
                "location": rule.get("location"),
                "notes": notes,
            }
            if not raw.strip() or cell.get("missing_reason"):
                values.update(
                    status="missing", missing_reason=cell.get("missing_reason") or "not_reported"
                )
            elif unit and (number := _published_number(raw)) is not None:
                expected = cell.get("numeric_value")
                try:
                    if expected is None or Decimal(number) != Decimal(str(expected)):
                        raise ValueError(
                            "The printed numeral and reviewed numeric companion differ."
                        )
                    canonical, canonical_unit = convert_source_scalar(number, unit)
                except (ValueError, InvalidOperation) as error:
                    values.update(status="unresolved", notes=[*notes, str(error)])
                else:
                    values.update(
                        status="normalized",
                        canonical_value=canonical,
                        canonical_unit=canonical_unit,
                        transformation_id="published-scalar-and-unit-conversion-v1",
                        transformation_formula=conversion_formula(unit)
                        + "; only grouping commas in a reviewed printed scalar are removed",
                    )
            elif unit:
                values.update(
                    status="unresolved",
                    notes=[*notes, "Printed qualifiers, tolerances and ranges are preserved."],
                )
            fields.append(SourceField(**values))
        records.append(
            SourceRecord(
                source_row=row.row_number,
                line_end=row.line_end,
                row_kind=definition.get("row_kind", "published_summary")
                if reviewed
                else "unclassified_record",
                raw_cells=list(row.cells),
                fields=fields,
            )
        )
    return InterpretedTable(
        adapter_id="reviewed-nasa-publication-table-v1",
        status="interpreted" if reviewed else "schema_unrecognized",
        accession=asset["accession"],
        asset_id=asset["id"],
        file_name=asset["file_name"],
        file_version=asset["file_version"],
        source_sha256=asset["sha256"],
        source_url=asset["source_url"],
        headers=list(table.headers),
        records=records,
        row_kind_counts=dict(Counter(row.row_kind for row in records)),
        source_record_count=len(records),
        empty_record_count=table.empty_record_count,
        limitations=[
            "Transcribed published summaries or planned conditions, not the raw sensor archive.",
            "A reported derived quantity remains source-derived; normalization is not calibration.",
            "Repeated experimental identifiers and multiple endpoints are not independent trials.",
            *definition.get("limitations", []),
        ],
        refusals=refusals,
    )

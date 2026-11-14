"""Source-specific record views and frozen selections of public source rows."""

import json
from hashlib import sha256
from typing import Annotated, Any

from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.records import interpret_table
from nova_ember.domain.records import InterpretedTable
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .repository import Corpus, MissingSource

Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
SourceLine = Annotated[int, Field(strict=True, ge=2, le=1_000_000)]


class RecordPage(InterpretedTable):
    snapshot_id: Digest
    asset: dict[str, Any]
    total_records: int = Field(ge=0)
    limit: int = Field(ge=1, le=250)
    offset: int = Field(ge=0)
    row_kind: str | None = None


class SourceSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_sha256: Digest
    source_rows: Annotated[list[SourceLine], Field(min_length=1, max_length=500)]


class CohortInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    snapshot_id: Digest
    selections: Annotated[list[SourceSelection], Field(min_length=1, max_length=10)]

    @model_validator(mode="after")
    def unique_records(self) -> "CohortInputs":
        references = [
            (selection.asset_sha256, row)
            for selection in self.selections
            for row in selection.source_rows
        ]
        if len(references) > 500:
            raise ValueError("Select at most 500 source records in one frozen selection.")
        if len(set(references)) != len(references):
            raise ValueError("A source record must appear only once in a selection.")
        return self


def interpreted_source(corpus: Corpus, digest: str, snapshot_id: str | None = None) -> dict:
    snapshot = corpus.snapshot(snapshot_id)
    asset = corpus.asset(digest, snapshot["snapshot_id"])
    if not asset["file_name"].lower().endswith(".csv") or not asset["encoding"]:
        raise MissingSource("A reviewed CSV source reader is unavailable for this asset.")
    table = parse_csv_bytes(corpus.asset_bytes(asset), asset["encoding"])
    result = interpret_table(asset, table).model_dump(mode="json")
    return {**result, "snapshot_id": snapshot["snapshot_id"], "asset": asset}


def record_page(
    corpus: Corpus,
    digest: str,
    snapshot_id: str | None,
    row_kind: str | None,
    limit: int,
    offset: int,
) -> dict:
    result = interpreted_source(corpus, digest, snapshot_id)
    records = result["records"]
    if row_kind:
        records = [record for record in records if record["row_kind"] == row_kind]
    return {
        **result,
        "records": records[offset : offset + limit],
        "total_records": len(records),
        "limit": limit,
        "offset": offset,
        "row_kind": row_kind,
    }


def freeze_selection(corpus: Corpus, inputs: CohortInputs) -> dict:
    """Freeze exact rows; selection never certifies independence or pooling."""
    assets: dict[str, list[int]] = {}
    for selection in inputs.selections:
        assets.setdefault(selection.asset_sha256, []).extend(selection.source_rows)
    resolved = []
    definitions = []
    for digest in sorted(assets):
        result = interpreted_source(corpus, digest, inputs.snapshot_id)
        rows = {record["source_row"]: record for record in result["records"]}
        selected = sorted(assets[digest])
        if any(row not in rows for row in selected):
            raise MissingSource("A selected row is blank, a header, or absent from the source.")
        definitions.append(
            {"asset_sha256": digest, "source_rows": selected, "adapter_id": result["adapter_id"]}
        )
        resolved.append(
            {
                "asset": result["asset"],
                "adapter_id": result["adapter_id"],
                "status": result["status"],
                "records": [rows[row] for row in selected],
                "limitations": result["limitations"],
                "refusals": result["refusals"],
            }
        )
    definition = {
        "method_id": "source-record-selection-v1",
        "snapshot_id": inputs.snapshot_id,
        "selections": definitions,
    }
    serialized = json.dumps(definition, sort_keys=True, separators=(",", ":")).encode()
    digest = sha256(serialized).hexdigest()
    return {
        **definition,
        "id": digest,
        "grain": "source_records",
        "selected_record_count": sum(len(rows) for rows in assets.values()),
        "independent_run_count": None,
        "resolved_sources": resolved,
        "ordering": "Asset SHA-256, then ascending physical source line; duplicates are rejected.",
        "limitations": [
            "Selected source rows are not automatically independent experimental runs.",
            "A frozen selection does not establish comparable conditions, "
            "calibration or endpoints.",
            "Daily summaries, ranges, notes and sessions retain their original record roles.",
        ],
    }

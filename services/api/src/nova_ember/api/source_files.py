"""Inspect retained workbook cells and text without evaluating their contents."""

from dataclasses import asdict

from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.supporting import (
    BassCalibrationSources,
    bass_fan_evidence_from_bytes,
    bass_run_calibration_eligibility_from_sources,
    flex_trace_evidence_from_bytes,
    workbook_cells,
    workbook_sheet_index,
)

from .repository import Corpus, MissingSource


def source_workbook(
    corpus: Corpus, digest: str, snapshot_id: str | None, sheet: str | None, limit: int, offset: int
) -> dict:
    snapshot = corpus.snapshot(snapshot_id)
    asset = corpus.asset(digest, snapshot["snapshot_id"])
    if not asset["file_name"].endswith(".xlsx"):
        raise MissingSource("This retained source is not an XLSX workbook.")
    content = corpus.asset_bytes(asset)
    index = workbook_sheet_index(content)
    if not index:
        raise MissingSource("The workbook contains no inspectable worksheets.")
    name = sheet if sheet is not None else index[0].name
    if name not in {entry.name for entry in index}:
        raise MissingSource("That worksheet does not exist in the retained source.")
    selected = workbook_cells(content, {name})[0]
    return {
        "snapshot_id": snapshot["snapshot_id"],
        "asset": asset,
        "sheets": [
            {
                "name": item.name,
                "state": item.state,
                "dimension": selected.dimension if item.name == name else None,
                "merged_ranges": selected.merged_ranges if item.name == name else (),
                "cell_count": len(selected.cells) if item.name == name else None,
            }
            for item in index
        ],
        "selected_sheet": selected.name,
        "cells": [asdict(cell) for cell in selected.cells[offset : offset + limit]],
        "total_cells": len(selected.cells),
        "limit": limit,
        "offset": offset,
        "limitations": [
            "Formulas are source text and are not executed. Cached values may be stale.",
            "Cell styles, dates, merged cells and shared formulas require source interpretation.",
            "A workbook cell is not automatically an independent measurement or valid calibration.",
        ],
    }


def source_text(
    corpus: Corpus, digest: str, snapshot_id: str | None, limit: int, offset: int
) -> dict:
    snapshot = corpus.snapshot(snapshot_id)
    asset = corpus.asset(digest, snapshot["snapshot_id"])
    if not asset["file_name"].endswith(".txt") or asset["encoding"] != "utf-8":
        raise MissingSource("A reviewed plain-text reader is unavailable for this source.")
    lines = corpus.asset_bytes(asset).decode("utf-8", errors="strict").splitlines()
    return {
        "snapshot_id": snapshot["snapshot_id"],
        "asset": asset,
        "encoding": "utf-8",
        "lines": [
            {"line_number": index + 1, "text": lines[index]}
            for index in range(offset, min(len(lines), offset + limit))
        ],
        "total_lines": len(lines),
        "limit": limit,
        "offset": offset,
    }


def named_asset(corpus: Corpus, snapshot_id: str, accession: str, fragment: str) -> dict:
    assets = corpus.investigation(accession, snapshot_id)["assets"]
    matches = [asset for asset in assets if fragment in asset["file_name"]]
    if len(matches) != 1:
        raise MissingSource("The required supporting source is absent or not uniquely identified.")
    return matches[0]


def bass_calibration(
    corpus: Corpus,
    snapshot_id: str | None,
    investigator: str | None = None,
    test_number: str | None = None,
) -> dict:
    snapshot = corpus.snapshot(snapshot_id)["snapshot_id"]
    fan = named_asset(corpus, snapshot, "PSI-25", "Fan calibration data.xlsx")
    result = bass_fan_evidence_from_bytes(corpus.asset_bytes(fan), fan)
    if investigator is not None and test_number is not None:
        table = named_asset(corpus, snapshot, "PSI-25", "Experimental table_BASS-II.csv")
        matrix = named_asset(corpus, snapshot, "PSI-25", "BASS-II_Test.Matrices.xlsx")
        sources = BassCalibrationSources(
            table=parse_csv_bytes(corpus.asset_bytes(table), table["encoding"]),
            table_asset=table,
            matrix_bytes=corpus.asset_bytes(matrix),
            matrix_asset=matrix,
            fan_bytes=corpus.asset_bytes(fan),
            fan_asset=fan,
        )
        result = bass_run_calibration_eligibility_from_sources(sources, investigator, test_number)
    return {**result, "snapshot_id": snapshot}


def flex_trace(corpus: Corpus, snapshot_id: str | None) -> dict:
    snapshot = corpus.snapshot(snapshot_id)["snapshot_id"]
    trace = named_asset(corpus, snapshot, "PSI-69", "FLEX-007_DropletData.txt")
    sheet = named_asset(corpus, snapshot, "PSI-69", "FLEX-007_TestSheet.txt")
    return {
        **flex_trace_evidence_from_bytes(
            corpus.asset_bytes(trace), trace, corpus.asset_bytes(sheet), sheet
        ),
        "snapshot_id": snapshot,
    }

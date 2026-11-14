"""Inspect retained workbook cells and text without evaluating their contents."""

import re
from dataclasses import asdict
from math import isfinite

from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.supporting import (
    BassCalibrationSources,
    bass_fan_evidence_from_bytes,
    bass_run_calibration_eligibility_from_sources,
    flex_trace_evidence_from_bytes,
    workbook_cells,
    workbook_sheet_index,
)
from nova_ember.evidence.contracts import EvidenceAnchor

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
    result = {
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
    if (
        asset["accession"] == "PSI-69"
        and asset["file_name"] == "PSI-69_Raw Data_FLEX-007_TestSheet.txt"
    ):
        try:
            quantities = _flex_007_reported_quantities(lines, asset, snapshot["snapshot_id"])
        except ValueError as error:
            result.update(
                reported_quantities_status="unresolved",
                reported_quantities={},
                reported_quantities_issues=[str(error)],
            )
        else:
            visible_lines = {line["line_number"] for line in result["lines"]}
            result.update(
                reported_quantities_status="parsed",
                reported_quantities={
                    name: quantity
                    for name, quantity in quantities.items()
                    if quantity["anchor"]["source_row"] in visible_lines
                },
                reported_quantities_issues=[],
            )
    return result


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


def _flex_007_reported_quantities(lines: list[str], asset: dict, snapshot_id: str) -> dict:
    """Parse only the reviewed, explicitly labelled FLEX-007 nominal quantities."""
    if (
        not lines
        or lines[0].strip() != "FLEX-007"
        or len(lines) > 101
        or not any(re.fullmatch(r"\s*Dext\s*\(mm\)\s*=\s*Disruption\s*", line) for line in lines)
        or not any("obscur" in line.casefold() and "luminous" in line.casefold() for line in lines)
    ):
        raise ValueError(
            "The FLEX-007 identity, endpoint or visibility qualification is unresolved."
        )
    fields = (
        ("initial_diameter", "D0", "mm", "mm"),
        ("burning_constant", "kavg", "mm2/s", "mm^2/s"),
        ("ambient_pressure", "Pressure", "atm", "atm"),
        ("ambient_temperature", "Temperature", "K", "K"),
        ("oxygen_mole_fraction", "O2 Mole Fraction", None, "1"),
        ("nitrogen_mole_fraction", "N2 Mole Fraction", None, "1"),
        ("carbon_dioxide_mole_fraction", "CO2 Mole Fraction", None, "1"),
        ("helium_mole_fraction", "He Mole Fraction", None, "1"),
    )
    result = {}
    for name, field, source_unit, unit in fields:
        label = re.escape(field)
        if source_unit is not None:
            label += rf"\s*\({re.escape(source_unit)}\)"
        pattern = re.compile(
            rf"^\s*{label}\s*=\s*"
            r"(?P<value>(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*$"
        )
        matches = [
            (number, line, match)
            for number, line in enumerate(lines, start=1)
            if (match := pattern.fullmatch(line)) is not None
        ]
        if len(matches) != 1:
            raise ValueError(
                f"The FLEX-007 {field} value or its reviewed unit/basis is unresolved."
            )
        number, line, match = matches[0]
        raw_value = match.group("value")
        value = float(raw_value)
        significand = re.split(r"[eE]", raw_value, maxsplit=1)[0]
        underflowed = value == 0 and any(digit in "123456789" for digit in significand)
        within_range = 0 <= value <= 1 if unit == "1" else value > 0
        if not isfinite(value) or underflowed or not within_range:
            raise ValueError(f"The FLEX-007 {field} value is outside its declared quantity range.")
        entry = {
            "value": value,
            "unit": unit,
            "origin": "source_reported_nominal",
            "source_text": line,
            "anchor": EvidenceAnchor(
                snapshot_id=snapshot_id,
                accession="PSI-69",
                investigation_version=asset["investigation_version"],
                source_sha256=asset["sha256"],
                asset_id=asset["id"],
                kind="text_lines",
                source_row=number,
                line_end=number,
            ).model_dump(mode="json"),
        }
        if unit == "1":
            entry["composition_basis"] = "mole"
        if unit == "atm":
            entry["pressure_reference"] = "unreported"
        result[name] = entry
    return result


def flex_trace(corpus: Corpus, snapshot_id: str | None) -> dict:
    snapshot = corpus.snapshot(snapshot_id)["snapshot_id"]
    trace = named_asset(corpus, snapshot, "PSI-69", "FLEX-007_DropletData.txt")
    sheet = named_asset(corpus, snapshot, "PSI-69", "FLEX-007_TestSheet.txt")
    sheet_content = corpus.asset_bytes(sheet)
    result = flex_trace_evidence_from_bytes(corpus.asset_bytes(trace), trace, sheet_content, sheet)
    lines = sheet_content.decode("utf-8", errors="strict").splitlines()
    try:
        quantities = _flex_007_reported_quantities(lines, sheet, snapshot)
    except ValueError as error:
        projection = {
            "reported_quantities_status": "unresolved",
            "reported_quantities": {},
            "reported_quantities_issues": [str(error)],
        }
    else:
        projection = {
            "reported_quantities_status": "parsed",
            "reported_quantities": quantities,
            "reported_quantities_issues": [],
        }
        selected = {value["anchor"]["source_row"] for value in quantities.values()}
        result["test_sheet_lines"] = [
            {"line": index, "text": text}
            for index, text in enumerate(lines, start=1)
            if index in selected
            or any(term in text for term in ("Fuel:", "Fiber:", "Dext", "obscur"))
        ]
        result["limitations"].append(
            "Pressure is reported in atm without an explicit absolute/gauge reference; "
            "the original value is retained without that conversion or inference."
        )
    return {**result, **projection, "snapshot_id": snapshot}

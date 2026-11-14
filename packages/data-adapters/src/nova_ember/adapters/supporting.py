"""Frozen supporting evidence, workbook cells and explicit calibration eligibility.

Workbook cell values are retained as source text. Formulas are never evaluated;
their cached values and shared-formula attributes remain separately inspectable.
"""

import argparse
import hashlib
import io
import json
import re
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path, PurePosixPath
from typing import Any
from xml.etree import ElementTree as ET
from zipfile import BadZipFile, ZipFile

import httpx
from nova_ember.adapters.psi import PsiClient, load_snapshot, manifest_files, read_csv_asset
from nova_ember.domain.source import RawTable

SUPPORTING_FILES = (
    (
        "PSI-25",
        "PSI-25_Reference Data_Fan calibration data.xlsx",
        2,
        23973,
        "bc0dca3efdef44a7774d8dd37aebc0cedae8d67d7bae8c9cbde9590014a3c983",
    ),
    (
        "PSI-25",
        "PSI-25_Science Documents_BASS-II_Test.Matrices.xlsx",
        2,
        28956,
        "1a3b283dd0adec861793bbc4a454aab64d398cd32d6f37d7a1ad0f642879e686",
    ),
    (
        "PSI-101",
        "PSI-101_Analyzed Data_SAME, SAME-R_Results.xlsx",
        1,
        4061669,
        "6d3a539ccf425b1fa8edc19cc75d828f57d650c7ce734d4e7aa686fea9593218",
    ),
    (
        "PSI-69",
        "PSI-69_Raw Data_FLEX-007_DropletData.txt",
        1,
        5366,
        "b23c77bbca5896142369d6b6e2c1c964ce527ea0fbaaebea6de69bb3e7b79f6b",
    ),
    (
        "PSI-69",
        "PSI-69_Raw Data_FLEX-007_TestSheet.txt",
        1,
        906,
        "cb748242c189bca59b861d0bb0f406fb7a80aee1710cee363f7620c43d66e2a0",
    ),
)
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"s": MAIN_NS}
MAX_EXPANDED_WORKBOOK_BYTES = 64 * 1024 * 1024
MAX_WORKBOOK_CELLS = 200_000


def _digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _write_source(destination: Path, path: str, content: bytes, **metadata: Any) -> dict:
    target = destination / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(content)
    return {"path": path, "sha256": _digest(content), "byte_size": len(content), **metadata}


def acquire_supporting(destination: Path, source_directory: Path, client: PsiClient) -> dict:
    """Acquire only the five audited files into a new, separate source snapshot."""
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Supporting source snapshots require a new empty directory.")
    original = load_snapshot(source_directory)
    destination.mkdir(parents=True, exist_ok=True)
    snapshot: dict[str, Any] = {
        "schema_version": 1,
        "source_snapshot_sha256": _digest((source_directory / "snapshot.json").read_bytes()),
        "captured_at": datetime.now(UTC).isoformat(),
        "source_contract": "Observed public PSI website services; rights retained per asset.",
        "assets": [],
        "evidence_files": [],
    }
    accessions = sorted({item[0] for item in SUPPORTING_FILES})
    for accession in accessions:
        record = next(item for item in original["investigations"] if item["accession"] == accession)
        manifest = next(item for item in original["manifests"] if item["accession"] == accession)
        for path, source_url, fetched_at in (
            (record["metadata_path"], record["metadata_url"], record["fetched_at"]),
            (manifest["path"], manifest["source_url"], manifest["fetched_at"]),
        ):
            copied = _write_source(
                destination,
                path,
                (source_directory / path).read_bytes(),
                accession=accession,
                source_url=source_url,
                fetched_at=fetched_at,
            )
            snapshot["evidence_files"].append(copied)
    for accession, filename, version, expected_size, expected_hash in SUPPORTING_FILES:
        record = next(item for item in original["investigations"] if item["accession"] == accession)
        manifest = next(item for item in original["manifests"] if item["accession"] == accession)
        leaves = manifest_files((source_directory / manifest["path"]).read_bytes())
        matches = [
            item
            for item in leaves
            if PurePosixPath(item["key"]).name == filename and item["version"] == version
        ]
        if len(matches) != 1:
            raise ValueError(f"No unique source manifest entry for {filename}.")
        entry = matches[0]
        if (
            entry.get("visible") is not True
            or entry.get("restricted") is not False
            or entry.get("restrictedAccess") is not False
            or entry.get("status") != "active"
        ):
            raise ValueError("The selected supporting source is not confirmed publicly available.")
        capture = client.download(accession, filename, version)
        if len(capture.content) != expected_size or capture.sha256 != expected_hash:
            raise ValueError(
                f"Supporting file differs from the retained empirical audit: {filename}"
            )
        asset = _write_source(
            destination,
            f"assets/{filename}",
            capture.content,
            accession=accession,
            investigation_version=record["version"],
            file_name=filename,
            file_version=version,
            doi=record["doi"],
            source_url=capture.source_url,
            fetched_at=capture.fetched_at,
            license=record["license"],
            license_scope="investigation_metadata",
            metadata_sha256=record["metadata_sha256"],
            manifest_sha256=manifest["sha256"],
            manifest_entry=entry,
            audit_sha256=expected_hash,
            audit_byte_size=expected_size,
            media_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                if filename.endswith(".xlsx")
                else "text/plain"
            ),
            encoding=None if filename.endswith(".xlsx") else "utf-8",
        )
        snapshot["assets"].append(asset)
    (destination / "snapshot.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return snapshot


def load_supporting_snapshot(directory: Path) -> dict:
    root = directory.resolve()
    snapshot = json.loads((root / "snapshot.json").read_bytes())
    if snapshot.get("schema_version") != 1:
        raise ValueError("Unsupported supporting snapshot schema.")
    for entry in [*snapshot["assets"], *snapshot["evidence_files"]]:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("A supporting source path is outside the frozen snapshot.")
        content = path.read_bytes()
        if len(content) != entry["byte_size"] or _digest(content) != entry["sha256"]:
            raise ValueError("Supporting source bytes differ from their snapshot hash.")
    return snapshot


@dataclass(frozen=True)
class WorkbookCell:
    sheet: str
    coordinate: str
    cell_type: str
    raw_value: str | None
    text: str | None
    formula: str | None
    has_formula: bool
    formula_attributes: dict[str, str]
    cached_value: str | None
    style_index: str | None


@dataclass(frozen=True)
class WorksheetEvidence:
    name: str
    state: str
    dimension: str | None
    merged_ranges: tuple[str, ...]
    cells: tuple[WorkbookCell, ...]


@dataclass(frozen=True)
class WorksheetIndex:
    """Workbook-level metadata; worksheet contents have not yet been inspected."""

    name: str
    state: str
    dimension: None = None
    merged_ranges: tuple[str, ...] = ()
    cell_count: None = None


def _xml(archive: ZipFile, path: str) -> ET.Element:
    try:
        content = archive.read(path)
    except (KeyError, BadZipFile):
        raise ValueError("A required workbook member is absent or corrupt.") from None
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        raise ValueError("Workbook XML contains an unsupported declaration.")
    try:
        return ET.fromstring(content)
    except ET.ParseError:
        raise ValueError("Workbook XML is malformed.") from None


@contextmanager
def _workbook_archive(content: bytes) -> Iterator[ZipFile]:
    try:
        package = ZipFile(io.BytesIO(content))
    except BadZipFile:
        raise ValueError("The source is not an intact workbook package.") from None
    with package as archive:
        entries = archive.infolist()
        if (
            len(entries) > 2000
            or sum(item.file_size for item in entries) > MAX_EXPANDED_WORKBOOK_BYTES
        ):
            raise ValueError("Workbook exceeds the expanded evidence-reader limit.")
        if any(item.flag_bits & 1 for item in entries):
            raise ValueError("Encrypted workbook members are unsupported.")
        if len({item.filename for item in entries}) != len(entries):
            raise ValueError("Workbook contains ambiguous duplicate package members.")
        yield archive


def _required_attribute(node: ET.Element, name: str) -> str:
    value = node.get(name)
    if not value:
        raise ValueError("Workbook is missing a required source attribute.")
    return value


def _sheet_references(archive: ZipFile) -> tuple[tuple[str, str, str], ...]:
    workbook = _xml(archive, "xl/workbook.xml")
    relationships = {}
    for item in _xml(archive, "xl/_rels/workbook.xml.rels").findall(
        f"{{{PACKAGE_REL_NS}}}Relationship"
    ):
        identifier = _required_attribute(item, "Id")
        if identifier in relationships:
            raise ValueError("Workbook contains duplicate relationship identifiers.")
        relationships[identifier] = item
    references = []
    names = set()
    for sheet in workbook.findall("s:sheets/s:sheet", NS):
        relation = relationships.get(_required_attribute(sheet, f"{{{REL_NS}}}id"))
        if relation is None:
            raise ValueError("Workbook sheet relationship is absent.")
        if relation.get("TargetMode") == "External":
            raise ValueError("External sheet links are not fetched.")
        target = _required_attribute(relation, "Target")
        path = str(PurePosixPath("xl") / target) if not target.startswith("/") else target[1:]
        if ".." in PurePosixPath(path).parts:
            raise ValueError("Workbook sheet target leaves its package directory.")
        name = _required_attribute(sheet, "name")
        if name in names:
            raise ValueError("Workbook contains duplicate worksheet names.")
        names.add(name)
        references.append((name, sheet.get("state", "visible"), path))
    return tuple(references)


def workbook_sheet_index(content: bytes) -> tuple[WorksheetIndex, ...]:
    """List sheets from workbook metadata without decompressing any sheet or string table."""
    with _workbook_archive(content) as archive:
        return tuple(
            WorksheetIndex(name=name, state=state)
            for name, state, _path in _sheet_references(archive)
        )


def workbook_cells(
    content: bytes, selected_sheets: set[str] | None = None
) -> tuple[WorksheetEvidence, ...]:
    """Read bounded source cells without formulas, macros, dates or units evaluation."""
    with _workbook_archive(content) as archive:
        shared_strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = _xml(archive, "xl/sharedStrings.xml")
            shared_strings = [
                "".join(text.text or "" for text in node.findall(".//s:t", NS))
                for item in shared.findall("s:si", NS)
                for node in [item]
            ]
        results = []
        total_cells = 0
        for name, state, path in _sheet_references(archive):
            if selected_sheets is not None and name not in selected_sheets:
                continue
            root = _xml(archive, path)
            cells = []
            for source in root.findall("s:sheetData/s:row/s:c", NS):
                value_node = source.find("s:v", NS)
                formula_node = source.find("s:f", NS)
                inline_node = source.find("s:is", NS)
                if value_node is None and formula_node is None and inline_node is None:
                    continue
                total_cells += 1
                if total_cells > MAX_WORKBOOK_CELLS:
                    raise ValueError("Workbook exceeds the cell evidence-reader limit.")
                cell_type = source.get("t", "n")
                raw_value = value_node.text if value_node is not None else None
                text = raw_value
                if cell_type == "s" and raw_value is not None:
                    try:
                        index = int(raw_value)
                        if index < 0:
                            raise ValueError("Negative shared-string index.")
                        text = shared_strings[index]
                    except (ValueError, IndexError):
                        raise ValueError("Workbook shared-string index is invalid.") from None
                elif inline_node is not None:
                    text = "".join(node.text or "" for node in inline_node.findall(".//s:t", NS))
                cells.append(
                    WorkbookCell(
                        sheet=name,
                        coordinate=_required_attribute(source, "r"),
                        cell_type=cell_type,
                        raw_value=raw_value,
                        text=text,
                        formula=formula_node.text if formula_node is not None else None,
                        has_formula=formula_node is not None,
                        formula_attributes=dict(formula_node.attrib)
                        if formula_node is not None
                        else {},
                        cached_value=raw_value if formula_node is not None else None,
                        style_index=source.get("s"),
                    )
                )
            dimension = root.find("s:dimension", NS)
            results.append(
                WorksheetEvidence(
                    name=name,
                    state=state,
                    dimension=dimension.get("ref") if dimension is not None else None,
                    merged_ranges=tuple(
                        _required_attribute(item, "ref")
                        for item in root.findall("s:mergeCells/s:mergeCell", NS)
                    ),
                    cells=tuple(cells),
                )
            )
        if selected_sheets is not None and {sheet.name for sheet in results} != selected_sheets:
            raise ValueError("A requested worksheet is absent from the source workbook.")
        return tuple(results)


def _asset(snapshot: dict, filename: str) -> dict:
    matches = [asset for asset in snapshot["assets"] if asset["file_name"] == filename]
    if len(matches) != 1:
        raise ValueError("A unique retained supporting asset is required.")
    return matches[0]


def _cell_anchor(asset: dict, cell: WorkbookCell) -> dict:
    return {
        "accession": asset["accession"],
        "investigation_version": asset["investigation_version"],
        "file_name": asset["file_name"],
        "file_version": asset["file_version"],
        "sha256": asset["sha256"],
        "sheet": cell.sheet,
        "cell": cell.coordinate,
        "source_text": cell.text,
        "raw_value": cell.raw_value,
        "has_formula": cell.has_formula,
        "formula": cell.formula,
        "formula_attributes": cell.formula_attributes,
        "cached_value": cell.cached_value,
    }


def bass_fan_evidence(directory: Path) -> dict:
    """Expose the source's example and validity context without releasing run velocity."""
    snapshot = load_supporting_snapshot(directory)
    asset = _asset(snapshot, SUPPORTING_FILES[0][1])
    return bass_fan_evidence_from_bytes((directory / asset["path"]).read_bytes(), asset)


def _verify_asset_content(content: bytes, asset: dict) -> None:
    if _digest(content) != asset["sha256"] or len(content) != asset["byte_size"]:
        raise ValueError("Source bytes do not match the cited supporting asset.")


def bass_fan_evidence_from_bytes(content: bytes, asset: dict) -> dict:
    """Build fan evidence from verified content-addressed bytes and their asset record."""
    _verify_asset_content(content, asset)
    worksheet = workbook_cells(content, {"Fan Calibration data"})[0]
    cells = {cell.coordinate: cell for cell in worksheet.cells}
    day_blocks: list[dict[str, Any]] = []
    for coordinate, cell in cells.items():
        if not re.fullmatch(r"[A-Z]+4", coordinate) or not cell.text:
            continue
        match = re.match(r"^2014-(\d{1,3})(?:\D|$)", cell.text)
        date_coordinate = coordinate[:-1] + "3"
        if not match or date_coordinate not in cells:
            continue
        day_blocks.append(
            {
                "year": 2014,
                "day_of_year": int(match.group(1)),
                "gmt": _cell_anchor(asset, cell),
                "date": _cell_anchor(asset, cells[date_coordinate]),
            }
        )
    date_conflicts = []
    for date_text in sorted({block["date"]["source_text"] for block in day_blocks}):
        blocks = [block for block in day_blocks if block["date"]["source_text"] == date_text]
        if len({block["day_of_year"] for block in blocks}) > 1:
            date_conflicts.append({"source_date_value": date_text, "day_blocks": blocks})
    return {
        "asset": asset,
        "worksheet": worksheet.name,
        "observed_cell_count": len(worksheet.cells),
        "formula_cell_count": sum(cell.has_formula for cell in worksheet.cells),
        "source_formula": _cell_anchor(asset, cells["A33"]),
        "source_location": _cell_anchor(asset, cells["A34"]),
        "example_label": [
            _cell_anchor(asset, cells[coordinate]) for coordinate in ("E2", "E3", "E5", "E6")
        ],
        "example_cells": [
            _cell_anchor(asset, cells[coordinate]) for coordinate in ("C7", "E7", "D7")
        ],
        "usage_warning": _cell_anchor(asset, cells["D1"]),
        "restrictor_labels": [
            _cell_anchor(asset, cells[coordinate]) for coordinate in ("D4", "D14", "D23")
        ],
        "day_blocks": day_blocks,
        "conflicting_date_labels": date_conflicts,
        "status": "source_example_only",
        "limitations": [
            "A source example is not a validated calibration for every experimental run.",
            "The worksheet does not supply an interpolation rule or uncertainty model.",
            "Source numeric date serials and their workbook styles remain unchanged.",
        ],
    }


def bass_run_calibration_eligibility(
    directory: Path, source_directory: Path, investigator: str, test_number: str
) -> dict:
    """Join source identities and report why retained evidence cannot yet yield velocity."""
    snapshot = load_supporting_snapshot(directory)
    original = load_snapshot(source_directory)
    table_asset = _asset(original, "PSI-25_Experimental table_BASS-II.csv")
    table = read_csv_asset(source_directory, table_asset)
    matrix_asset = _asset(snapshot, SUPPORTING_FILES[1][1])
    fan_asset = _asset(snapshot, SUPPORTING_FILES[0][1])
    sources = BassCalibrationSources(
        table=table,
        table_asset=table_asset,
        matrix_bytes=(directory / matrix_asset["path"]).read_bytes(),
        matrix_asset=matrix_asset,
        fan_bytes=(directory / fan_asset["path"]).read_bytes(),
        fan_asset=fan_asset,
    )
    return bass_run_calibration_eligibility_from_sources(sources, investigator, test_number)


@dataclass(frozen=True)
class BassCalibrationSources:
    table: RawTable
    table_asset: dict
    matrix_bytes: bytes
    matrix_asset: dict
    fan_bytes: bytes
    fan_asset: dict


def bass_run_calibration_eligibility_from_sources(
    sources: BassCalibrationSources, investigator: str, test_number: str
) -> dict:
    """Assess source joins without filesystem/network access or inferred calibration laws."""
    table = sources.table
    table_asset = sources.table_asset
    matrix_asset = sources.matrix_asset
    _verify_asset_content(sources.matrix_bytes, matrix_asset)
    columns = {header: index for index, header in enumerate(table.headers)}
    rows = [
        row
        for row in table.rows
        if row.cells[columns["PI"]] == investigator and row.cells[columns["Test #"]] == test_number
    ]
    if len(rows) != 1:
        raise ValueError("A unique BASS-II investigator and test identifier is required.")
    row = rows[0]
    sheets = workbook_cells(sources.matrix_bytes, {investigator})
    worksheet = sheets[0]
    cells = {cell.coordinate: cell for cell in worksheet.cells}
    sample = row.cells[columns["Sample #"]]
    matched_rows = [
        coordinate[1:]
        for coordinate, cell in cells.items()
        if re.fullmatch(r"C\d+", coordinate)
        and cell.text == test_number
        and cells.get("D" + coordinate[1:]) is not None
        and cells["D" + coordinate[1:]].text == sample
    ]
    matrix_matches = []
    for suffix in matched_rows:
        matrix_matches.append(
            {
                "sheet": worksheet.name,
                "row": int(suffix),
                "anchors": [
                    _cell_anchor(matrix_asset, cells[col + suffix])
                    for col in ("B", "C", "D", "F", "G", "H")
                    if col + suffix in cells
                ],
            }
        )
    source_fields = {
        name: row.cells[columns[name]]
        for name in ("Date", "GMT", "Sample #", "Flow restrictor", "Fan display", "Air display")
    }
    fan = bass_fan_evidence_from_bytes(sources.fan_bytes, sources.fan_asset)
    year_match = re.search(r"/(\d{4})$", source_fields["Date"])
    day = source_fields["GMT"]
    candidates = [
        block
        for block in fan["day_blocks"]
        if year_match
        and day.isdigit()
        and block["year"] == int(year_match.group(1))
        and block["day_of_year"] == int(day)
    ]
    reasons = [
        "The SPICE-based example has no reviewed applicability mapping to this BASS run's "
        "measurement location, apparatus state and environmental conditions.",
        "The retained workbook does not define an interpolation method or calibration uncertainty.",
    ]
    if len(matrix_matches) != 1:
        reasons.append("The test matrix identity is absent or ambiguous.")
    if len(candidates) != 1:
        reasons.append("A unique same-day calibration session is not established.")
    for name in ("Fan display", "Air display"):
        if not re.fullmatch(r"\d+(?:\.\d+)?", source_fields[name].strip()):
            reasons.append(f"{name} records a changing or qualified setting, not a single scalar.")
    return {
        "status": "calibration_unresolved",
        "velocity": None,
        "investigator": investigator,
        "test_number": test_number,
        "source_row": {
            "sha256": table_asset["sha256"],
            "row_number": row.row_number,
            "fields": source_fields,
        },
        "matrix_matches": matrix_matches,
        "same_day_profiles": candidates,
        "calibration_source": {
            "sha256": fan["asset"]["sha256"],
            "formula": fan["source_formula"],
            "location": fan["source_location"],
        },
        "reasons": reasons,
    }


def flex_trace_evidence(directory: Path) -> dict:
    """Keep reported units and diagnostic evidence distinct from fit eligibility."""
    snapshot = load_supporting_snapshot(directory)
    trace_asset = _asset(snapshot, SUPPORTING_FILES[3][1])
    sheet_asset = _asset(snapshot, SUPPORTING_FILES[4][1])
    return flex_trace_evidence_from_bytes(
        (directory / trace_asset["path"]).read_bytes(),
        trace_asset,
        (directory / sheet_asset["path"]).read_bytes(),
        sheet_asset,
    )


def flex_trace_evidence_from_bytes(
    trace_content: bytes, trace_asset: dict, sheet_content: bytes, sheet_asset: dict
) -> dict:
    """Inspect the trace and protocol statements from source-bound byte inputs."""
    _verify_asset_content(trace_content, trace_asset)
    _verify_asset_content(sheet_content, sheet_asset)
    trace_lines = trace_content.decode("utf-8").splitlines()
    sheet_lines = sheet_content.decode("utf-8").splitlines()
    headers = trace_lines[0].split("\t")
    expected = [
        "DropletTime_sec",
        "DropletDiameter_mm",
        "ZeroedDropletXpos_mm",
        "ZeroedDropletYpos_mm",
    ]
    if headers != expected:
        raise ValueError("The FLEX-007 trace header differs from the inspected source.")
    records = [
        {"line": index, "cells": line.split("\t")}
        for index, line in enumerate(trace_lines[1:], start=2)
        if line.strip()
    ]
    return {
        "trace_asset": trace_asset,
        "test_sheet_asset": sheet_asset,
        "headers": headers,
        "records": records,
        "reported_time_unit": "s",
        "reported_diameter_unit": "mm",
        "test_sheet_lines": [
            {"line": index, "text": text}
            for index, text in enumerate(sheet_lines, start=1)
            if any(term in text for term in ("kavg", "Dext", "Fiber:", "obscures", "obscured"))
        ],
        "fit_status": "requires_source_validation",
        "fit_value": None,
        "limitations": [
            "Unit-bearing trace headers do not establish the pixel calibration or diameter method.",
            "The test sheet reports luminous-flame obscuration during much of the run and its end.",
            "A source-validated visible interval and burning regime have not been selected.",
            "The source kavg is a reported result, not a newly reproduced fit.",
            "FLEX-007 ended in disruption; it is not an observed complete chemical extinction.",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Capture the five audited supporting PSI files.")
    parser.add_argument("destination", type=Path)
    parser.add_argument("--source-directory", type=Path, default=Path("tests/fixtures/nasa-psi"))
    arguments = parser.parse_args()
    with httpx.Client() as http_client:
        captured = acquire_supporting(
            arguments.destination, arguments.source_directory, PsiClient(http_client)
        )
    print(
        json.dumps(
            {
                "assets": len(captured["assets"]),
                "bytes": sum(a["byte_size"] for a in captured["assets"]),
            }
        )
    )


if __name__ == "__main__":
    main()

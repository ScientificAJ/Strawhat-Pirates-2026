"""Hash and cell-level evidence checks for the separate supporting source capture."""

import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

import pytest
from nova_ember.adapters import supporting
from nova_ember.adapters.supporting import (
    SUPPORTING_FILES,
    acquire_supporting,
    load_supporting_snapshot,
    workbook_cells,
    workbook_sheet_index,
)

SUPPORTING = Path(__file__).parent / "fixtures/nasa-psi-supporting"


def synthetic_workbook(sheet_xml: str, *, target_mode: str = "") -> bytes:
    """A test-only OOXML source with an intentionally stale formula cache."""
    buffer = io.BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Test source" sheetId="1" r:id="rId1" /></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Target="worksheets/sheet1.xml" {target_mode}/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/sharedStrings.xml",
            '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            "<si><r><t>Fan </t></r><r><t>setting</t></r></si></sst>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return buffer.getvalue()


def sheet(contents: str) -> str:
    return (
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="A1:C2"/><sheetData><row r="1">'
        f'{contents}</row></sheetData><mergeCells><mergeCell ref="B2:C2"/>'
        "</mergeCells></worksheet>"
    )


def test_workbook_reader_retains_formula_cache_and_source_anchor():
    evidence = workbook_cells(
        synthetic_workbook(
            sheet(
                '<c r="A1" t="s"><v>0</v></c>'
                '<c r="B1" s="3"><f>1+1</f><v>3</v></c>'
                '<c r="C1" s="4"><v>45678</v></c>'
            )
        )
    )[0]
    cells = {cell.coordinate: cell for cell in evidence.cells}
    assert evidence.name == "Test source"
    assert evidence.dimension == "A1:C2"
    assert evidence.merged_ranges == ("B2:C2",)
    assert cells["A1"].text == "Fan setting"
    assert cells["A1"].raw_value == "0"
    assert not cells["A1"].has_formula
    assert cells["B1"].formula == "1+1"
    assert cells["B1"].has_formula
    assert cells["B1"].cached_value == "3"
    assert cells["B1"].style_index == "3"
    assert cells["C1"].text == "45678"  # No inferred date or physical unit.


def test_shared_formula_reference_is_not_silently_reconstructed():
    cells = workbook_cells(
        synthetic_workbook(
            sheet(
                '<c r="A1"><f t="shared" si="0" ref="A1:B1">C1*2</f><v>4</v></c>'
                '<c r="B1"><f t="shared" si="0"/><v>6</v></c>'
            )
        )
    )[0].cells
    assert cells[1].has_formula
    assert cells[1].formula is None
    assert cells[1].formula_attributes == {"t": "shared", "si": "0"}
    assert cells[1].cached_value == "6"


def test_missing_sheet_and_external_targets_are_refused():
    content = synthetic_workbook(sheet('<c r="A1"><v>1</v></c>'))
    with pytest.raises(ValueError, match="absent"):
        workbook_cells(content, {"unreported sheet"})
    with pytest.raises(ValueError, match="External"):
        workbook_cells(synthetic_workbook(sheet(""), target_mode='TargetMode="External"'))


def test_expanded_workbook_and_cell_limits_are_enforced(monkeypatch):
    content = synthetic_workbook(sheet('<c r="A1"><v>1</v></c>'))
    monkeypatch.setattr(supporting, "MAX_EXPANDED_WORKBOOK_BYTES", 100)
    with pytest.raises(ValueError, match="expanded"):
        workbook_cells(content)
    monkeypatch.setattr(supporting, "MAX_EXPANDED_WORKBOOK_BYTES", 64 * 1024 * 1024)
    monkeypatch.setattr(supporting, "MAX_WORKBOOK_CELLS", 0)
    with pytest.raises(ValueError, match="cell"):
        workbook_cells(content)


def test_xml_declarations_and_invalid_shared_strings_are_refused():
    with pytest.raises(ValueError, match="declaration"):
        workbook_cells(synthetic_workbook('<!DOCTYPE test [<!ENTITY fake "bad">]>' + sheet("")))
    with pytest.raises(ValueError, match="shared-string"):
        workbook_cells(synthetic_workbook(sheet('<c r="A1" t="s"><v>7</v></c>')))


def test_existing_supporting_snapshot_is_not_overwritten(tmp_path):
    (tmp_path / "existing-source").write_bytes(b"original")
    with pytest.raises(ValueError, match="empty"):
        acquire_supporting(tmp_path, Path("absent"), None)
    assert (tmp_path / "existing-source").read_bytes() == b"original"


def test_five_captured_files_reproduce_historical_checksums():
    snapshot = load_supporting_snapshot(SUPPORTING)
    assert len(snapshot["assets"]) == 5
    assert sum(asset["byte_size"] for asset in snapshot["assets"]) == 4_120_870
    expected = {name: (size, digest) for _, name, _, size, digest in SUPPORTING_FILES}
    for asset in snapshot["assets"]:
        assert (asset["byte_size"], asset["sha256"]) == expected[asset["file_name"]]
        assert asset["license"] == "CC0-1.0"
        assert asset["license_scope"] == "investigation_metadata"
        assert asset["source_url"].startswith("https://psi.nasa.gov/")
        assert "X-Amz" not in asset["source_url"]
    original = Path(__file__).parent / "fixtures/nasa-psi/snapshot.json"
    assert snapshot["source_snapshot_sha256"] == hashlib.sha256(original.read_bytes()).hexdigest()


def test_supporting_source_tampering_is_reported(tmp_path):
    content = b"source"
    (tmp_path / "file").write_bytes(content)
    snapshot = {
        "schema_version": 1,
        "assets": [{"path": "file", "sha256": hashlib.sha256(content).hexdigest(), "byte_size": 6}],
        "evidence_files": [],
    }
    (tmp_path / "snapshot.json").write_text(json.dumps(snapshot))
    load_supporting_snapshot(tmp_path)
    (tmp_path / "file").write_bytes(b"changed")
    with pytest.raises(ValueError, match="snapshot hash"):
        load_supporting_snapshot(tmp_path)


def test_sheet_index_does_not_parse_worksheet_or_shared_string_contents():
    # A malformed worksheet must not prevent inspecting workbook-level names.
    content = synthetic_workbook("<broken worksheet xml")
    index = workbook_sheet_index(content)
    assert len(index) == 1
    assert index[0].name == "Test source"
    assert index[0].state == "visible"
    assert index[0].dimension is None
    assert index[0].merged_ranges == ()
    assert index[0].cell_count is None
    with pytest.raises(ValueError, match="malformed"):
        workbook_cells(content)


def test_sheet_index_enforces_package_and_relationship_boundaries(monkeypatch):
    content = synthetic_workbook(sheet(""))
    monkeypatch.setattr(supporting, "MAX_EXPANDED_WORKBOOK_BYTES", 100)
    with pytest.raises(ValueError, match="expanded"):
        workbook_sheet_index(content)
    monkeypatch.setattr(supporting, "MAX_EXPANDED_WORKBOOK_BYTES", 64 * 1024 * 1024)
    with pytest.raises(ValueError, match="External"):
        workbook_sheet_index(synthetic_workbook(sheet(""), target_mode='TargetMode="External"'))


def replace_workbook_member(content: bytes, member: str, replacement: bytes) -> bytes:
    target = io.BytesIO()
    with ZipFile(io.BytesIO(content)) as original, ZipFile(target, "w") as revised:
        for entry in original.infolist():
            revised.writestr(
                entry.filename,
                replacement if entry.filename == member else original.read(entry.filename),
            )
    return target.getvalue()


def test_missing_sheet_relationship_is_a_structured_source_refusal():
    content = replace_workbook_member(
        synthetic_workbook(sheet("")),
        "xl/_rels/workbook.xml.rels",
        b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>',
    )
    for reader in (workbook_sheet_index, workbook_cells):
        with pytest.raises(ValueError, match="relationship is absent"):
            reader(content)


@pytest.mark.parametrize(
    "source",
    [
        sheet("<c><v>1</v></c>"),
        sheet('<c r="A1"><v>1</v></c>').replace('ref="B2:C2"', ""),
    ],
)
def test_missing_cell_or_merge_source_coordinates_are_rejected(source):
    with pytest.raises(ValueError, match="required source attribute"):
        workbook_cells(synthetic_workbook(source))


def test_same_index_and_selected_sheet_retain_known_source_names_and_cells():
    filename = "PSI-101_Analyzed Data_SAME, SAME-R_Results.xlsx"
    content = (SUPPORTING / "assets" / filename).read_bytes()
    index = workbook_sheet_index(content)
    assert len(index) == 43
    assert index[0].name == "DBP"
    assert index[-1].name == "Moment Comparisons  aged Jan 21"
    assert all(item.cell_count is None for item in index)
    selected = workbook_cells(content, {"DBP"})
    assert len(selected) == 1
    assert selected[0].name == "DBP"
    assert len(selected[0].cells) == 1047
    assert sum(cell.has_formula for cell in selected[0].cells) == 940

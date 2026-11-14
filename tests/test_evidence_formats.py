"""Source-format known answers and real protocol examples preserve raw semantics."""

import io
import json
from pathlib import Path
from zipfile import ZipFile

import pytest
from nova_ember.adapters.formats import (
    archive_index,
    docx_figure_bytes,
    docx_figures,
    docx_paragraphs,
    inspect_matlab,
    rtf_text,
    xls_cells,
)

METHODS = Path(__file__).parent / "fixtures" / "nasa-psi-methods"


def document_zip(xml):
    output = io.BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("word/document.xml", xml)
    return output.getvalue()


def test_docx_paragraphs_keep_table_locations_and_tracked_deletions():
    xml = (
        b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        b"<w:body><w:p><w:r><w:t>Measured </w:t></w:r>"
        b"<w:del><w:r><w:delText>wrong</w:delText></w:r></w:del>"
        b"<w:ins><w:r><w:t>3.5 mm</w:t></w:r></w:ins></w:p>"
        b'<w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>'
        b"<w:p><w:r><w:t>Cell text</w:t></w:r></w:p>"
        b"</w:tc></w:tr></w:tbl></w:body></w:document>"
    )
    paragraphs = docx_paragraphs(document_zip(xml))
    assert paragraphs[0].text == "Measured 3.5 mm"
    assert paragraphs[0].deleted_text == ("wrong",)
    assert paragraphs[0].has_tracked_changes is True
    assert (paragraphs[1].table, paragraphs[1].row, paragraphs[1].column) == (1, 1, 1)
    assert paragraphs[1].merged_grid_span == "2"
    assert paragraphs[1].text == "Cell text"


def test_zip_path_traversal_entities_and_duplicate_members_are_rejected():
    output = io.BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("../escape", "no")
    with pytest.raises(ValueError, match="relative paths"):
        archive_index(output.getvalue(), "source.zip")
    xml = b'<!DOCTYPE x [<!ENTITY a "not allowed">]><x>&a;</x>'
    with pytest.raises(ValueError, match="entity"):
        docx_paragraphs(document_zip(xml))
    output = io.BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("same", "first")
        with pytest.warns(UserWarning, match="Duplicate"):
            archive.writestr("same", "second")
    with pytest.raises(ValueError, match="duplicate"):
        archive_index(output.getvalue(), "source.zip")


def test_rtf_unicode_hex_grouping_and_mac_header_are_preserved():
    result = rtf_text(
        b"{\\rtf1\\ansi\\ansicpg1252 A \\'b0 \\uc1\\u945?\\par {\\*\\hidden source}B}"
    )
    assert result["text"] == "A ° α\nB"
    assert "hidden" not in result["text"]
    assert rtf_text(b"{\\rtf1\\mac caf\\'8e}")["text"] == "café"
    with pytest.raises(ValueError, match="unbalanced"):
        rtf_text(b"{\\rtf1 missing close")
    with pytest.raises(ValueError, match="hex"):
        rtf_text(b"{\\rtf1 \\'QQ}")


def test_actual_docx_embedded_table_is_exact_source_image_not_extracted_measurement():
    asset = "PSI-99_Science Documents_SAFFIRE-II Readme.docx"
    content = (METHODS / "assets" / asset).read_bytes()
    paragraphs = docx_paragraphs(content)
    assert len(paragraphs) == 87
    assert paragraphs[0].text.startswith("The objectives of the SAFFIRE")
    figures = docx_figures(content)
    table = next(row for row in figures if row["member"] == "word/media/image1.png")
    assert table["sha256"] == "2e2ba3873b5c78cc39662b090bf8551922d3e8a97414076d5f6d9cb12cf414f3"
    assert table["scientific_measurement_ready"] is False
    raw, kind = docx_figure_bytes(content, table["member"])
    assert kind == "image/png" and raw.startswith(b"\x89PNG")
    with pytest.raises(ValueError):
        docx_figure_bytes(content, "../outside")


def test_actual_rtf_test_sheet_keeps_species_mole_basis_and_missing_nan_text():
    name = "PSI-69_Raw Data_FLEX-243_TestSheet.rtf"
    result = rtf_text((METHODS / "assets" / name).read_bytes())
    assert result["status"] == "text_extracted"
    assert "O2 Mole Fraction = \t 0.17" in result["text"]
    assert "CO2 Mole Fraction = \t 0.00" in result["text"]
    assert "kavg  (mm2/s) = \t nan" in result["text"]
    assert "droplet burns for a short time to disruption." in result["text"]


def test_actual_xls_retains_date_mode_and_cached_value_limitation():
    name = "PSI-101_Analyzed Data_TEMflowvsnoflow.xls"
    result = xls_cells((METHODS / "assets" / name).read_bytes(), limit=250)
    assert result["selected_sheet"] == "Reduced data sheet"
    assert result["date_mode"] in {0, 1}
    assert result["total_cells"] > 0
    assert any("cached" in limitation for limitation in result["limitations"])
    chosen = next(row for row in result["cells"] if row["cell_type"] == 1 and row["raw_value"])
    column = chosen["column"]
    letters = ""
    while column:
        column, remainder = divmod(column - 1, 26)
        letters = chr(65 + remainder) + letters
    cell = xls_cells(
        (METHODS / "assets" / name).read_bytes(), coordinate=letters + str(chosen["row"])
    )
    assert cell["selected_cell"] == chosen


def test_actual_matlab_calibration_file_is_metadata_not_an_executed_model():
    result = inspect_matlab((METHODS / "assets" / "d300s_effective_wavelength.mat").read_bytes())
    assert result["variables"] == [
        {"name": "temp", "shape": (1, 1201), "matlab_class": "double"},
        {"name": "color_s", "shape": (1201, 3), "matlab_class": "double"},
    ]
    assert any("physical units" in note for note in result["limitations"])


def test_protocol_supplement_hashes_and_provenance_are_frozen():
    from hashlib import sha256

    snapshot = json.loads((METHODS / "snapshot.json").read_bytes())
    assert len(snapshot["assets"]) == 10
    assert sum(asset["byte_size"] for asset in snapshot["assets"]) == 3019461
    for item in [*snapshot["assets"], *snapshot["evidence_files"]]:
        content = (METHODS / item["path"]).read_bytes()
        assert len(content) == item["byte_size"]
        assert sha256(content).hexdigest() == item["sha256"]


def test_docx_nested_textbox_paragraphs_are_not_counted_twice():
    xml = (
        b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        b"<w:body><w:p><w:r><w:t>Outer</w:t><w:txbxContent>"
        b"<w:p><w:r><w:t>Inner</w:t></w:r></w:p>"
        b"</w:txbxContent></w:r></w:p></w:body></w:document>"
    )
    paragraphs = docx_paragraphs(document_zip(xml))
    assert [paragraph.text for paragraph in paragraphs] == ["Outer", "Inner"]

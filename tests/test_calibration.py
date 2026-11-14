"""Known source cells prove what is available and what cannot yet be calibrated."""

from pathlib import Path

import pytest
from nova_ember.adapters.supporting import (
    bass_fan_evidence,
    bass_fan_evidence_from_bytes,
    bass_run_calibration_eligibility,
    flex_trace_evidence,
    load_supporting_snapshot,
    workbook_cells,
)

SUPPORTING = Path(__file__).parent / "fixtures/nasa-psi-supporting"
ORIGINAL = Path(__file__).parent / "fixtures/nasa-psi"


def test_bass_example_keeps_formula_units_location_and_warning_anchors():
    evidence = bass_fan_evidence(SUPPORTING)
    assert evidence["source_formula"]["cell"] == "A33"
    assert evidence["source_formula"]["source_text"] == "*U =1.0066(AIR)"
    assert evidence["source_location"]["cell"] == "A34"
    assert "56 mm downstream, 36 mm from bottom" in evidence["source_location"]["source_text"]
    assert evidence["example_label"][-1]["source_text"] == "U cm/s*"
    assert evidence["example_cells"][0]["source_text"] == "29"
    cached = evidence["example_cells"][1]
    assert cached["cell"] == "E7"
    assert cached["formula"] == "1.0066*C7"
    assert cached["cached_value"] == "29.191399999999998"
    assert (
        "recommended to not use the 3.8 volts zero flow value"
        in evidence["usage_warning"]["source_text"]
    )
    assert evidence["status"] == "source_example_only"


def test_conflicting_source_dates_are_preserved_without_guessing_correct_date():
    evidence = bass_fan_evidence(SUPPORTING)
    assert len(evidence["conflicting_date_labels"]) == 1
    conflict = evidence["conflicting_date_labels"][0]
    assert conflict["source_date_value"] == "41730"
    assert {item["day_of_year"] for item in conflict["day_blocks"]} == {43, 91}
    assert {item["date"]["cell"] for item in conflict["day_blocks"]} == {"B3", "T3"}


def test_bass_run_has_exact_matrix_identity_but_no_validated_velocity():
    result = bass_run_calibration_eligibility(SUPPORTING, ORIGINAL, "Bhattacharjee", "B1")
    assert result["source_row"]["row_number"] == 2
    assert result["source_row"]["fields"]["Fan display"] == "62"
    assert result["source_row"]["fields"]["Air display"] == "5"
    assert len(result["matrix_matches"]) == 1
    assert result["matrix_matches"][0]["row"] == 2
    anchors = {item["cell"]: item for item in result["matrix_matches"][0]["anchors"]}
    assert anchors["C2"]["source_text"] == "B1"
    assert anchors["D2"]["source_text"] == "147"
    assert anchors["F2"]["source_text"] == "2"
    assert anchors["G2"]["source_text"] == "62"
    assert anchors["H2"]["source_text"] == "5"
    assert result["same_day_profiles"][0]["gmt"]["cell"] == "P4"
    assert result["status"] == "calibration_unresolved"
    assert result["velocity"] is None
    assert any("applicability" in item for item in result["reasons"])


def test_changing_settings_and_same_day_sessions_cannot_be_averaged_silently():
    result = bass_run_calibration_eligibility(SUPPORTING, ORIGINAL, "Bhattacharjee", "B6")
    assert len(result["same_day_profiles"]) == 2
    assert {item["gmt"]["cell"] for item in result["same_day_profiles"]} == {"AZ4", "BD4"}
    assert any("not a single scalar" in reason for reason in result["reasons"])
    assert any("unique same-day" in reason for reason in result["reasons"])
    assert result["velocity"] is None


def test_same_day_profile_difference_is_an_observed_source_fact():
    snapshot = load_supporting_snapshot(SUPPORTING)
    asset = next(item for item in snapshot["assets"] if "Fan calibration" in item["file_name"])
    sheet = workbook_cells((SUPPORTING / asset["path"]).read_bytes())[0]
    cells = {cell.coordinate: cell.text for cell in sheet.cells}
    assert cells["AZ28"] == cells["BD28"] == "88.5"
    assert cells["BA28"] == "15.5"
    assert cells["BE28"] == "20"


def test_wrong_test_identity_and_changed_source_bytes_are_refused():
    with pytest.raises(ValueError, match="unique BASS-II"):
        bass_run_calibration_eligibility(SUPPORTING, ORIGINAL, "Bhattacharjee", "not-a-run")
    snapshot = load_supporting_snapshot(SUPPORTING)
    asset = next(item for item in snapshot["assets"] if "Fan calibration" in item["file_name"])
    with pytest.raises(ValueError, match="cited supporting"):
        bass_fan_evidence_from_bytes(b"changed", asset)


def test_flex_trace_unit_labels_and_reported_result_do_not_qualify_a_new_fit():
    result = flex_trace_evidence(SUPPORTING)
    assert len(result["records"]) == 141
    assert result["records"][0]["line"] == 2
    assert result["records"][0]["cells"][0] == "-1.466667000000598"
    assert result["reported_time_unit"] == "s"
    assert result["reported_diameter_unit"] == "mm"
    notes = {item["line"]: item["text"] for item in result["test_sheet_lines"]}
    assert "kavg  (mm2/s)" in notes[19]
    assert "0.68" in notes[19]
    assert "Disruption" in notes[21]
    assert "obscured by the luminous flame" in notes[25]
    assert result["fit_status"] == "requires_source_validation"
    assert result["fit_value"] is None
    assert any("pixel calibration" in item for item in result["limitations"])

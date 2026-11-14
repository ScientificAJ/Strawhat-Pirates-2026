from dataclasses import replace
from pathlib import Path

import pytest
from nova_ember.adapters.psi import load_snapshot, read_csv_asset
from nova_ember.adapters.records import interpret_table
from nova_ember.domain.records import SourceField, SourceRecord
from pydantic import ValidationError

FIXTURES = Path(__file__).parent / "fixtures" / "nasa-psi"


@pytest.fixture(scope="module")
def sources():
    snapshot = load_snapshot(FIXTURES)
    return {
        asset["file_name"]: (asset, read_csv_asset(FIXTURES, asset)) for asset in snapshot["assets"]
    }


def table(sources, filename):
    asset, raw = sources[filename]
    return interpret_table(asset, raw)


@pytest.mark.parametrize(
    ("filename", "expected"),
    [
        ("PSI-69_Experimental table_FLEX.csv", {"source_test_record": 274}),
        ("PSI-25_Experimental table_BASS-II.csv", {"source_test_record": 129}),
        ("PSI-101_Experimental table_SAME-R.csv", {"condition_record": 109}),
        ("PSI-159_Experimental table_CFI-G_Normal Flames.csv", {"source_test_record": 179}),
        ("PSI-159_Experimental table_CFI-G_Inverse Flames.csv", {"source_test_record": 154}),
        (
            "PSI-99_Experimental table_SAFFIRE-2.csv",
            {"sample_record": 9, "flow_visualization": 2, "note": 4},
        ),
        ("PSI-20_Experimental table_ACME BRE.csv", {"daily_summary": 18}),
        ("PSI-68_Experimental table_Flex2.csv", {"range_summary": 8}),
        ("PSI-39_Experimental table_CFI.csv", {"condition_record": 87}),
        ("PSI-47_Experimental table_DAFT.csv", {"session_record": 2}),
    ],
)
def test_actual_source_grains_do_not_become_independent_replicates(sources, filename, expected):
    result = table(sources, filename)
    assert result.status == "interpreted"
    assert result.row_kind_counts == expected
    assert result.source_record_count == sum(expected.values())
    assert result.independent_run_count is None
    assert not result.refusals


def test_saffire_mixed_rows_and_original_sample_ambiguities(sources):
    result = table(sources, "PSI-99_Experimental table_SAFFIRE-2.csv")
    assert [r.source_row for r in result.records] == list(range(2, 17))
    assert result.records[9].raw_cells[0] == "F1C1/F1C2"
    assert result.records[9].row_kind == "flow_visualization"
    assert result.records[11].row_kind == "note"
    assert result.records[11].raw_cells[0].startswith("Note 1 Derived from measured CO2")
    thickness = result.records[3].fields[2]
    assert thickness.raw_text == "037 mm"
    assert thickness.status == "unresolved"
    assert thickness.canonical_value is None
    assert thickness.missing_reason == "ambiguous"
    assert result.records[0].fields[2].canonical_value == pytest.approx(0.00027)
    assert result.records[0].fields[2].canonical_unit == "m"
    absent_material = result.records[5].fields[1]
    assert absent_material.raw_text == ""
    assert absent_material.missing_reason == "not_reported"
    assert absent_material.canonical_value is None
    centimeter_thickness = result.records[8].fields[2]
    assert result.records[8].source_row == 10
    assert centimeter_thickness.raw_text == "1 cm"
    assert centimeter_thickness.original_unit == "cm"
    assert centimeter_thickness.canonical_value == pytest.approx(0.01)
    assert centimeter_thickness.canonical_unit == "m"


def test_saffire_derived_oxygen_and_damaged_headers_stay_explicit(sources):
    result = table(sources, "PSI-99_Experimental table_SAFFIRE-2.csv")
    oxygen = result.records[0].fields[6]
    assert oxygen.raw_text == "~ 21.5"
    assert oxygen.source_value_kind == "derived"
    assert oxygen.qualifier == "approximate"
    assert oxygen.canonical_value is None
    assert any("CO2-derived" in note for note in oxygen.notes)
    damaged = result.records[0].fields[11]
    assert damaged.source_column == "?-g Burn Length"
    assert damaged.canonical_value is None
    assert damaged.status == "unresolved"
    assert any("damaged" in note for note in damaged.notes)
    composite = result.records[6].fields[2]
    assert composite.raw_text == "0.85 and 0.37 mm"
    assert composite.qualifier == "multiple_values"
    assert composite.canonical_value is None


def test_unrecognized_saffire_row_role_keeps_cells_without_normalization(sources):
    asset, raw = sources["PSI-99_Experimental table_SAFFIRE-2.csv"]
    first = raw.rows[0]
    unexpected = replace(first, cells=("2-X", *first.cells[1:]))
    result = interpret_table(asset, replace(raw, rows=(unexpected, *raw.rows[1:])))
    record = result.records[0]
    assert result.status == "schema_unrecognized"
    assert record.row_kind == "unclassified_record"
    assert record.raw_cells == list(unexpected.cells)
    assert all(field.canonical_value is None for field in record.fields)
    assert any(f"Source line {first.row_number}" in reason for reason in result.refusals)


def test_bass_settings_measurements_and_missingness_are_distinct(sources):
    result = table(sources, "PSI-25_Experimental table_BASS-II.csv")
    row = result.records[0]
    assert row.source_row == 2
    assert row.fields[7].raw_text == "62"
    assert row.fields[7].source_value_kind == "setting"
    assert row.fields[7].canonical_value is None
    assert row.fields[7].original_unit is None
    assert row.fields[9].source_value_kind == "setting"
    oxygen = row.fields[11]
    assert oxygen.raw_text == "22.2"
    assert oxygen.source_column == "Calibrated  initial O2 % by vol "
    assert oxygen.source_value_kind == "measurement"
    assert oxygen.basis == "volume"
    assert oxygen.location == "not_reported"
    assert oxygen.canonical_value == pytest.approx(0.222)
    assert oxygen.canonical_unit == "1"
    assert oxygen.transformation_id == "source-unit-conversion-v1"
    assert "0.01" in oxygen.transformation_formula
    assert row.fields[15].raw_text == "0"
    assert row.fields[15].missing_reason is None
    assert row.fields[15].canonical_value is None
    missing = result.records[1].fields[14]
    assert missing.raw_text == ""
    assert missing.status == "missing"
    assert missing.missing_reason == "not_reported"
    assert result.records[1].fields[10].raw_text == "none"
    assert result.records[1].fields[10].missing_reason == "ambiguous"


def test_same_velocity_conversion_does_not_create_detector_alarms(sources):
    result = table(sources, "PSI-101_Experimental table_SAME-R.csv")
    velocity = result.records[0].fields[4]
    assert velocity.raw_text == "8.1"
    assert velocity.original_unit == "cm/s"
    assert velocity.canonical_value == pytest.approx(0.081)
    assert velocity.canonical_unit == "m/s"
    assert velocity.location == "inlet"
    assert velocity.source_value_kind == "condition"
    assert result.records[0].fields[6].canonical_value == 60
    assert result.records[1].fields[7].missing_reason == "not_reported"
    na = next(r.fields[9] for r in result.records if r.raw_cells[9] == "n/a")
    assert na.missing_reason == "not_applicable"
    assert na.canonical_value is None
    assert any("not detector-alarm" in note for note in result.limitations)


def test_flex_unknown_species_and_burning_unit_are_not_repaired(sources):
    result = table(sources, "PSI-69_Experimental table_FLEX.csv")
    row = result.records[0]
    assert row.fields[6].source_column == "O initial ambient composition; mole fraction"
    assert row.fields[6].basis == "mole"
    assert row.fields[6].canonical_value is None
    assert row.fields[9].raw_text == "0"
    assert row.fields[9].canonical_value == 0
    assert row.fields[9].missing_reason is None
    assert row.fields[11].canonical_value == pytest.approx(0.00089)
    assert row.fields[12].original_unit == "mm"
    assert row.fields[12].canonical_value is None
    assert row.fields[14].raw_text == "Disruption"
    assert row.fields[14].source_value_kind == "code"


def test_cfi_g_failed_ignition_zero_and_streams_remain_separate(sources):
    inverse = table(sources, "PSI-159_Experimental table_CFI-G_Inverse Flames.csv")
    normal = table(sources, "PSI-159_Experimental table_CFI-G_Normal Flames.csv")
    first = inverse.records[0]
    assert first.raw_cells[19] == "Failed to ignite"
    assert first.fields[14].raw_text == "0"
    assert first.fields[14].canonical_value == 0
    assert first.fields[14].missing_reason is None
    assert first.fields[15].raw_text == "-"
    assert first.fields[15].missing_reason == "ambiguous"
    assert inverse.empty_record_count == 861
    assert first.fields[7].source_column == "XO2"
    assert first.fields[7].location == "not_reported"
    assert first.fields[7].basis == "not_reported"
    assert first.fields[7].canonical_value is None
    assert normal.records[0].fields[5].source_column == " XO2 before test"
    assert normal.records[0].raw_cells[0] == "Normal"
    assert first.raw_cells[0] == "Inverse"
    assert all(r.fields[6].qualifier == "approximate" for r in inverse.records)
    assert all(r.fields[7].qualifier == "approximate" for r in normal.records)


def test_cfi_g_temperature_origin_and_spreadsheet_error_are_retained(sources):
    result = table(sources, "PSI-159_Experimental table_CFI-G_Inverse Flames.csv")
    first = result.records[0]
    assert first.fields[11].raw_text == "2120"
    assert first.fields[11].source_value_kind == "derived"
    peak = first.fields[16]
    assert peak.raw_text == "27.1"
    assert peak.source_value_kind == "measurement"
    assert peak.canonical_value == pytest.approx(300.25)
    assert peak.transformation_formula.endswith("+ 273.15 (K)")
    bad = next(r.fields[17] for r in result.records if r.raw_cells[17] == "#VALUE!")
    assert bad.missing_reason == "invalid"
    assert bad.qualifier == "source_error"
    assert bad.canonical_value is None


def test_bre_daily_rows_and_bad_percentages_are_not_expanded_or_repaired(sources):
    result = table(sources, "PSI-20_Experimental table_ACME BRE.csv")
    oxygen = result.records[0].fields[5]
    assert oxygen.raw_text == "21; 26.5; 40"
    assert oxygen.qualifier == "multiple_values"
    assert oxygen.canonical_value is None
    assert oxygen.basis == "volume"
    bad = result.records[4].fields[5]
    assert bad.raw_text == "3400%"
    assert bad.canonical_value is None
    assert bad.missing_reason == "invalid"
    assert result.records[7].fields[6].raw_text == "0"
    assert result.records[7].fields[6].missing_reason is None
    assert len(result.records) == 18


def test_flex2_ranges_cfi_conditions_and_daft_dust_keep_their_grains(sources):
    ranges = table(sources, "PSI-68_Experimental table_Flex2.csv")
    assert ranges.records[0].fields[1].raw_text == "1.5 - 5"
    assert ranges.records[0].fields[1].qualifier == "range"
    assert ranges.records[0].fields[1].canonical_value is None
    assert ranges.records[0].fields[5].canonical_value == pytest.approx(298.15)
    cfi = table(sources, "PSI-39_Experimental table_CFI.csv")
    assert cfi.records[0].fields[4].raw_text == "1 atm"
    assert cfi.records[0].fields[4].canonical_value is None
    assert cfi.records[0].fields[8].raw_text == "No"
    daft = table(sources, "PSI-47_Experimental table_DAFT.csv")
    assert daft.records[0].raw_cells[0] == "D1"
    assert "Arizona Road Dust" in daft.records[0].raw_cells[3]
    assert all(f.canonical_value is None for row in daft.records for f in row.fields)


@pytest.mark.parametrize("change", ["header", "version", "width"])
def test_unreviewed_schema_preserves_all_raw_cells_without_scientific_mapping(sources, change):
    asset, raw = sources["PSI-69_Experimental table_FLEX.csv"]
    if change == "header":
        raw = replace(raw, headers=("Changed label", *raw.headers[1:]))
    elif change == "version":
        asset = {**asset, "file_version": 2}
    else:
        extra = replace(raw.rows[0], cells=(*raw.rows[0].cells, "extra source cell"))
        raw = replace(raw, rows=(extra, *raw.rows[1:]))
    result = interpret_table(asset, raw)
    assert result.status == "schema_unrecognized"
    assert result.refusals
    assert result.records[0].raw_cells == list(raw.rows[0].cells)
    assert all(r.row_kind == "unclassified_record" for r in result.records)
    assert all(f.canonical_value is None for r in result.records for f in r.fields)
    if change == "width":
        assert result.records[0].fields[-1].raw_text == "extra source cell"
        assert result.records[0].fields[-1].source_column is None


def test_contracts_reject_inconsistent_scientific_values_and_line_anchors():
    with pytest.raises(ValidationError, match="canonical value"):
        SourceField(column_index=0, source_column="value", raw_text="1", canonical_value=1)
    with pytest.raises(ValidationError, match="transformation provenance"):
        SourceField(
            column_index=0,
            source_column="value",
            raw_text="1",
            status="normalized",
            canonical_value=1,
            canonical_unit="m",
        )
    with pytest.raises(ValidationError, match="final source line"):
        SourceRecord(source_row=5, line_end=4, row_kind="note", raw_cells=[], fields=[])

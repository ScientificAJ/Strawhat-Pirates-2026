"""Source-origin filters cannot turn calibrated measurements into nominal settings."""

from pathlib import Path

import pytest
from nova_ember.adapters.psi import load_snapshot, read_csv_asset
from nova_ember.adapters.records import interpret_table
from nova_ember.api.discovery import FieldPredicate, _field_matches


def test_real_bass_oxygen_measurement_keeps_its_source_kind_under_numeric_filter():
    root = Path(__file__).parent / "fixtures/nasa-psi"
    snapshot = load_snapshot(root)
    asset = next(
        item for item in snapshot["assets"] if "Experimental table_BASS-II" in item["file_name"]
    )
    oxygen = interpret_table(asset, read_csv_asset(root, asset)).records[0].fields[11]
    request = FieldPredicate(
        quantity_kind="oxygen_fraction",
        operator="gte",
        value=0.2,
        unit="1",
        source_value_kind="measurement",
    )
    assert oxygen.raw_text == "22.2"
    assert _field_matches(oxygen, request)
    assert not _field_matches(oxygen, request.model_copy(update={"source_value_kind": "condition"}))
    assert not _field_matches(
        oxygen, request.model_copy(update={"source_value_kind": "setting", "include_missing": True})
    )


def test_presence_checks_units_kind_and_missingness_without_an_invented_threshold():
    root = Path(__file__).parent / "fixtures/nasa-psi"
    snapshot = load_snapshot(root)
    asset = next(
        item for item in snapshot["assets"] if "Experimental table_BASS-II" in item["file_name"]
    )
    table = interpret_table(asset, read_csv_asset(root, asset))
    oxygen = table.records[0].fields[11]
    present = FieldPredicate(
        quantity_kind="oxygen_fraction",
        operator="present",
        unit="1",
        source_value_kind="measurement",
    )
    assert _field_matches(oxygen, present)
    assert not _field_matches(oxygen, present.model_copy(update={"unit": "Pa"}))
    assert not _field_matches(oxygen, present.model_copy(update={"source_value_kind": "condition"}))
    setting = table.records[0].fields[7]
    assert not _field_matches(
        setting, FieldPredicate(quantity_kind="instrument_setting", operator="present", unit="m/s")
    )
    assert _field_matches(
        setting,
        FieldPredicate(
            quantity_kind="instrument_setting", operator="present", source_value_kind="setting"
        ),
    )
    missing = table.records[1].fields[14]
    predicate = FieldPredicate(
        quantity_kind="carbon_dioxide_fraction", operator="present", unit="1"
    )
    assert missing.missing_reason == "not_reported"
    assert not _field_matches(missing, predicate)
    assert _field_matches(missing, predicate.model_copy(update={"include_missing": True}))


def test_exact_unclassified_source_text_filter_preserves_its_unresolved_quantity():
    root = Path(__file__).parent / "fixtures/nasa-psi"
    snapshot = load_snapshot(root)
    asset = next(
        item for item in snapshot["assets"] if "Experimental table_BASS-II" in item["file_name"]
    )
    field = interpret_table(asset, read_csv_asset(root, asset)).records[0].fields[1]
    assert (
        field.quantity_kind is None and field.source_column == "Test #" and field.raw_text == "B1"
    )
    predicate = FieldPredicate(source_column="Test #", operator="contains", value="B1")
    assert _field_matches(field, predicate)
    assert not _field_matches(field, predicate.model_copy(update={"source_column": "Sample #"}))
    assert _field_matches(field, FieldPredicate(source_column="Test #", operator="present"))
    assert field.canonical_value is None
    for inputs in (
        {"operator": "contains", "value": "B1"},
        {"source_column": "Test #", "operator": "gte", "value": 1.0, "unit": "1"},
        {"source_column": "Test #", "operator": "present", "unit": "1"},
    ):
        with pytest.raises(ValueError, match="unclassified field"):
            FieldPredicate(**inputs)

import json
import shutil
from copy import deepcopy
from hashlib import sha256
from pathlib import Path

import pytest
from nova_ember.adapters.nasa_research import (
    interpret_publication_table,
    load_collection,
    load_metadata,
)
from nova_ember.adapters.psi import read_csv_asset

COLLECTION = Path(__file__).resolve().parents[1] / "data/nasa-research"


@pytest.fixture(scope="module")
def collection():
    return load_collection(COLLECTION)


@pytest.fixture
def mutable_collection(tmp_path):
    directory = tmp_path / "nasa-research"
    shutil.copytree(COLLECTION, directory)
    return directory, load_collection(directory)


def asset_for(collection, accession, table_name):
    return next(
        asset
        for asset in collection["assets"]
        if asset["accession"] == accession and asset["file_name"] == f"{accession}_{table_name}.csv"
    )


def interpreted(collection, accession, table_name):
    asset = asset_for(collection, accession, table_name)
    return interpret_publication_table(asset, read_csv_asset(COLLECTION, asset))


def save_manifest(directory, manifest):
    (directory / "collection.json").write_text(json.dumps(manifest), encoding="utf-8")


def save_metadata(directory, manifest, record, metadata):
    content = json.dumps(metadata).encode("utf-8")
    (directory / record["metadata_path"]).write_bytes(content)
    record["metadata_sha256"] = sha256(content).hexdigest()
    save_manifest(directory, manifest)


def test_actual_collection_keeps_program_children_and_availability_separate(collection):
    records = {record["accession"]: record for record in collection["investigations"]}
    children = {f"NASA-SOFIE-{name}" for name in ("GEL", "MIST", "NCA", "RTDFS", "SMURF")}
    assert set(records) == {
        "NASA-SAFFIRE-IV",
        "NASA-SAFFIRE-V",
        "NASA-SAFFIRE-VI",
        "NASA-SOFIE",
        *children,
        "NASA-FLARE",
        "NASA-FM2",
        "NASA-LUCI",
    }
    assert records["NASA-SOFIE"]["record_type"] == "program"
    assert all(records[child]["parent_accession"] == "NASA-SOFIE" for child in children)
    assert records["NASA-FM2"]["data_status"] == "reported_conditions"
    assert records["NASA-FLARE"]["data_status"] == "research_description"
    assert len(collection["assets"]) == 14
    assert {asset["accession"] for asset in collection["assets"]} == {
        "NASA-SAFFIRE-IV",
        "NASA-SAFFIRE-V",
        "NASA-SAFFIRE-VI",
        "NASA-SOFIE-GEL",
        "NASA-LUCI",
        "NASA-FM2",
    }
    assert all(asset["license"] is None for asset in collection["assets"])


@pytest.mark.parametrize("target", ["original", "extracted_text", "metadata", "table"])
def test_changed_retained_bytes_are_rejected(mutable_collection, target):
    directory, manifest = mutable_collection
    references = {
        "original": manifest["sources"][0],
        "extracted_text": manifest["sources"][0]["text"],
        "metadata": {"path": manifest["investigations"][0]["metadata_path"]},
        "table": manifest["assets"][0],
    }
    path = directory / references[target]["path"]
    path.write_bytes(path.read_bytes() + b"changed")
    with pytest.raises(ValueError, match="checksum"):
        load_collection(directory)


@pytest.mark.parametrize("parent", ["NASA-ABSENT", "NASA-SAFFIRE-IV"])
def test_child_requires_a_retained_parent_program(mutable_collection, parent):
    directory, manifest = mutable_collection
    child = next(r for r in manifest["investigations"] if r["accession"] == "NASA-SOFIE-GEL")
    child["parent_accession"] = parent
    save_manifest(directory, manifest)
    with pytest.raises(ValueError, match="no retained parent"):
        load_collection(directory)


@pytest.mark.parametrize(
    "failure", ["quotation", "source_id", "source_url", "source_checksum", "empty_proof"]
)
def test_field_proof_must_resolve_to_retained_source(mutable_collection, failure):
    directory, manifest = mutable_collection
    record = manifest["investigations"][0]
    metadata = load_metadata(directory, record)
    reference = metadata["field_provenance"]["description"][0]
    if failure == "quotation":
        reference["quote"] = "A nonexistent claim that is absent from the retained NASA text."
    elif failure == "source_id":
        reference["source_id"] = "unretained-source"
    elif failure == "source_url":
        reference["source_url"] = "https://www.nasa.gov/unrelated-source/"
    elif failure == "source_checksum":
        reference["source_sha256"] = "0" * 64
    else:
        metadata["field_provenance"]["description"] = []
    # Rehash the changed metadata so the test reaches provenance validation.
    save_metadata(directory, manifest, record, metadata)
    with pytest.raises(
        ValueError, match="quotation|unretained NASA source|original source|checksum"
    ):
        load_collection(directory)


def test_saffire_calorimetry_methods_missing_values_and_locations_remain_distinct(collection):
    table = interpreted(collection, "NASA-SAFFIRE-IV", "saffire-iv-v-vi-results")
    row = table.records[0]
    peak = row.fields[3]
    average = row.fields[5]
    assert peak.raw_text == "" and peak.status == "missing"
    assert peak.missing_reason == "not_reported" and peak.canonical_value is None
    assert "Peak Heat Release" in peak.source_column
    assert "Average Heat Release" in average.source_column
    assert average.raw_text == "3,150"
    assert average.canonical_value == 3150 and average.canonical_unit == "W"
    assert average.source_value_kind == "derived"
    assert row.fields[6].raw_text == "409"
    assert row.fields[6].canonical_value == 409_000 and row.fields[6].canonical_unit == "J"
    assert row.fields[7].raw_text == "45"
    assert row.fields[7].canonical_value == pytest.approx(318.15)
    assert row.fields[7].canonical_unit == "K"
    assert "SFU outlet" in row.fields[7].source_column
    assert "FFD or nearest" in row.fields[8].source_column
    assert row.fields[9].raw_text == "1390"
    assert row.fields[9].canonical_value == pytest.approx(0.00139)
    assert "increase" in row.fields[9].source_column

    vi = interpreted(collection, "NASA-SAFFIRE-VI", "saffire-iv-v-vi-results")
    sibal = vi.records[0]
    assert sibal.raw_cells[0] == "VI-2"
    assert sibal.fields[3].canonical_value == 3217
    assert sibal.fields[5].canonical_value == 3650
    pmma = vi.records[1]
    assert pmma.raw_cells[0] == "VI-3"
    assert pmma.fields[3].canonical_value == 3080
    assert pmma.fields[5].status == "missing"


def test_saffire_source_conditions_preserve_mole_basis_and_original_pressure(collection):
    table = interpreted(collection, "NASA-SAFFIRE-V", "saffire-iv-v-conditions")
    row = table.records[0]
    assert row.raw_cells[0] == "V-2"
    assert row.fields[5].raw_text == "70.7"
    assert row.fields[5].canonical_value == 70_700
    assert row.fields[5].canonical_unit == "Pa"
    assert row.fields[6].raw_text == "26.2" and row.fields[6].basis == "mole"
    assert row.fields[6].canonical_value == pytest.approx(0.262)
    assert row.fields[6].source_value_kind == "condition"


def test_gel_selected_cases_retain_extinction_conditions_and_missing_heat_loss(collection):
    table = interpreted(collection, "NASA-SOFIE-GEL", "gel-20240007628-table-1")
    assert table.source_record_count == 5
    first = table.records[0]
    assert first.raw_cells[:4] == ["1", "1409B", "quenching", "inside duct"]
    assert first.fields[4].raw_text == "4.83"
    assert first.fields[4].canonical_value == pytest.approx(0.0483)
    assert first.fields[4].canonical_unit == "m/s"
    assert first.fields[5].canonical_value == 128.8
    assert first.fields[5].source_value_kind == "derived"
    assert first.fields[6].canonical_value == 3.63
    assert first.fields[6].canonical_unit == "1/s"
    assert first.fields[6].source_value_kind == "derived"
    assert first.fields[7].canonical_value == pytest.approx(0.1421)
    assert first.fields[7].location == "Flow duct entrance upstream of sample"
    assert first.fields[7].basis is None
    assert first.fields[8].canonical_value == 105_378
    assert first.fields[9].canonical_value == 3600
    assert first.fields[9].canonical_unit == "W/m^2"
    last = table.records[-1]
    assert last.raw_cells[1:4] == ["1410C", "blowoff", "duct exit"]
    assert last.fields[9].raw_text == "not recorded"
    assert last.fields[9].status == "missing"
    assert last.fields[9].missing_reason == "not_reported"
    assert last.fields[9].canonical_value is None


def test_luci_reported_fit_units_and_rounded_ratios_are_preserved(collection):
    sibal = interpreted(collection, "NASA-LUCI", "luci-sibal-reported-fits")
    base, tip = sibal.records
    assert base.raw_cells[0] == "Flame Base"
    assert base.fields[2].raw_text == ".9"
    assert base.fields[2].original_unit == "mm/s"
    assert base.fields[2].canonical_value == pytest.approx(0.0009)
    assert base.fields[3].canonical_value == pytest.approx(0.0015)
    assert tip.fields[2].canonical_value == pytest.approx(0.0011)
    assert tip.fields[3].canonical_value == pytest.approx(0.0028)
    assert tip.fields[4].raw_text == ".39"
    assert tip.fields[4].canonical_value == 0.39
    pmma = interpreted(collection, "NASA-LUCI", "luci-pmma-reported-fit").records[0]
    assert pmma.fields[2].raw_text == ".15"
    assert pmma.fields[2].original_unit == "cm/s"
    assert pmma.fields[2].canonical_value == pytest.approx(0.0015)
    assert pmma.fields[3].raw_text == ".40"
    assert pmma.fields[3].canonical_value == pytest.approx(0.004)
    assert pmma.fields[4].raw_text == ".38"
    assert pmma.fields[4].canonical_value == 0.38  # Source rounding, not .15 / .40.
    assert all(field.source_value_kind == "derived" for field in pmma.fields[2:])


def test_fm2_rows_are_planned_conditions_with_separate_tolerances(collection):
    asset = asset_for(collection, "NASA-FM2", "fm2-2026-planned-atmospheres")
    table = interpret_publication_table(asset, read_csv_asset(COLLECTION, asset))
    assert asset["origin"] == "planned_conditions"
    assert asset["table_definition"]["row_kind"] == "condition_record"
    assert table.row_kind_counts == {"condition_record": 4}
    assert [row.fields[3].raw_text for row in table.records] == ["37", "33", "29", "25"]
    for row in table.records:
        pressure, tolerance = row.fields[1:3]
        assert pressure.raw_text == "8.2" and pressure.original_unit == "psia"
        assert pressure.canonical_value == pytest.approx(56_537.0098039776)
        assert pressure.quantity_kind == "pressure"
        assert tolerance.raw_text == "0.3" and tolerance.original_unit == "psi"
        assert tolerance.quantity_kind == "pressure_tolerance"
        assert row.fields[5].raw_text == "Synergy Pro “Navy”"
        assert [field.raw_text for field in row.fields[6:]] == ["2", "0.05", "20", "0.2"]
        assert [field.quantity_kind for field in row.fields[6:]] == [
            "length",
            "length_tolerance",
            "length",
            "length_tolerance",
        ]
        assert all(field.source_value_kind == "condition" for field in row.fields)
    proof = asset["table_definition"]["rows"][0]
    assert proof["document_id"] == "20260001966" and proof["page"] == 10
    assert proof["cells"]["1"]["source"]["printed_page"] == 9


def test_repeated_publications_and_luci_endpoints_do_not_establish_independent_runs(collection):
    repeated = []
    for asset in collection["assets"]:
        table = interpret_publication_table(asset, read_csv_asset(COLLECTION, asset))
        assert table.independent_run_count is None
        assert table.status == "interpreted" and not table.refusals
        assert asset["kind"] == "publication_table"
        if asset["accession"] != "NASA-FM2":
            assert asset["origin"] == "published_table_transcription"
            assert table.row_kind_counts == {"published_summary": len(table.records)}
        for proof in asset["table_definition"]["rows"]:
            if asset["accession"] == "NASA-SAFFIRE-IV" and proof["row_label"] == "IV-1":
                repeated.append(proof["physical_experiment_id"])
            if asset["accession"] == "NASA-LUCI":
                assert proof["physical_experiment_id"] is None
                assert proof["endpoint"] in {"Flame Base", "Flame Tip"}
    assert repeated == ["IV-1"] * 4


def test_changed_row_proof_is_refused_and_wrong_numeric_companion_is_not_normalized(collection):
    original = asset_for(collection, "NASA-LUCI", "luci-pmma-reported-fit")
    raw = read_csv_asset(COLLECTION, original)
    changed = deepcopy(original)
    changed["table_definition"]["rows"][0]["raw_cells"][2] = ".16"
    with pytest.raises(ValueError, match="reviewed original text"):
        interpret_publication_table(changed, raw)
    changed = deepcopy(original)
    changed["table_definition"]["rows"][0]["cells"]["2"]["numeric_value"] = 0.16
    value = interpret_publication_table(changed, raw).records[0].fields[2]
    assert value.raw_text == ".15"
    assert value.status == "unresolved" and value.canonical_value is None

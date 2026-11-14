"""Numerical exports retain exact selections, limits, licenses and rerun implementation."""

import csv
import io
import json
import os
import subprocess
import sys
import zipfile

import pytest
from nova_ember.api.exporting import CaseExport, build_export
from test_artifacts import FrozenCorpus, query


def selection(corpus, **changes):
    return CaseExport(
        snapshot_id=corpus.snapshot_id,
        case_id="known-case",
        revision=2,
        question="Inspect specimen geometry",
        queries=[query(corpus)],
        assumptions=["Source dimensions describe the listed sample"],
        limitations=["No independent-run or safety inference"],
        **changes,
    )


def test_csv_and_parquet_preserve_known_values_and_provenance():
    corpus = FrozenCorpus()
    data, media_type, _, provenance = build_export(corpus, selection(corpus, format="csv"))
    rows = list(csv.DictReader(io.StringIO(data.decode())))
    assert float(rows[0]["column_2"]) == pytest.approx(0.00027)
    assert rows[0]["source_row"] == "2"
    assert media_type.startswith("text/csv")
    assert provenance["limitations"] == ["No independent-run or safety inference"]
    data, _, _, _ = build_export(corpus, selection(corpus, format="parquet"))
    import pyarrow.parquet as pq

    table = pq.read_table(io.BytesIO(data))
    assert table.column("column_2")[0].as_py() == pytest.approx(0.00027)
    assert (
        json.loads(table.schema.metadata[b"nova_ember_provenance"])["independent_run_count"] is None
    )


def test_frozen_bundle_reruns_from_original_bytes_and_included_source(tmp_path):
    corpus = FrozenCorpus()
    from nova_ember.api.artifacts import ChartSpec

    chart = ChartSpec(
        title="Frozen source geometry",
        query=query(corpus),
        x_column=2,
        y_column=3,
        x_unit="m",
        y_unit="m",
    )
    data, _, _, _ = build_export(
        corpus, selection(corpus, include_original_bytes=True, charts=[chart])
    )
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        archive.extractall(tmp_path)
        assert "runtime/nova_ember/adapters/records.py" in archive.namelist()
        assert "environment/uv.lock" in archive.namelist()
    environment = os.environ.copy()
    environment.pop("PYTHONPATH", None)
    result = subprocess.run(
        [sys.executable, str(tmp_path / "reproduce.py")],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert result.returncode == 0, result.stderr
    assert "All frozen numerical selections reproduced" in result.stdout


def test_unknown_redistribution_rights_keep_acquisition_references_instead_of_bytes():
    corpus = FrozenCorpus()
    selected = query(corpus)
    asset = corpus.asset(selected.asset_sha256, selected.snapshot_id)
    asset["license"] = None
    data, _, _, _ = build_export(corpus, selection(corpus, include_original_bytes=True))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["originals_omitted"][0]["reason"] == "redistribution_rights_unresolved"
        assert manifest["sources"][selected.asset_sha256]["sha256"] == selected.asset_sha256
        assert not any(name.startswith("inputs/") for name in archive.namelist())


def test_notebook_and_json_preserve_applicability_and_personal_notes():
    corpus = FrozenCorpus()
    data, _, _, _ = build_export(
        corpus,
        selection(
            corpus,
            format="json",
            notes="My interpretation",
            applicability={"status": "not_established"},
        ),
    )
    result = json.loads(data)
    assert result["manifest"]["applicability"]["status"] == "not_established"
    assert result["notes"] == "My interpretation"
    notebook, _, _, _ = build_export(corpus, selection(corpus, format="notebook"))
    assert json.loads(notebook)["nbformat"] == 4
    assert all(not cell.get("outputs") for cell in json.loads(notebook)["cells"])


@pytest.mark.parametrize(
    ("format", "signature", "mime"),
    [
        ("svg", b"<?xml", "image/svg+xml"),
        ("png", b"\x89PNG", "image/png"),
        ("pdf", b"%PDF", "application/pdf"),
    ],
)
def test_matplotlib_exports_real_vector_and_raster_figures(format, signature, mime):
    from nova_ember.api.artifacts import ChartSpec

    corpus = FrozenCorpus()
    chart = ChartSpec(
        title="Source specimen dimensions",
        query=query(corpus),
        x_column=2,
        y_column=3,
        x_unit="m",
        y_unit="m",
    )
    data, media_type, filename, provenance = build_export(
        corpus, selection(corpus, format=format, charts=[chart])
    )
    assert data.startswith(signature) and media_type == mime and filename.endswith("." + format)
    if format == "svg":
        from nova_ember.workers.execution import validate_svg

        validate_svg(data)
    assert provenance["source_sha256"] == [chart.query.asset_sha256]


def test_frozen_fit_and_execution_records_survive_case_export_without_a_status_upgrade():
    corpus = FrozenCorpus()
    artifact = {
        "artifact_id": "fit-1",
        "kind": "fit",
        "snapshot_id": corpus.snapshot_id,
        "scientific_origin": "descriptive_fit",
        "payload": {
            "slope": 2,
            "unit": "m/s",
            "interval": {
                "lower": 1.7,
                "upper": 2.4,
                "level": 0.95,
                "interpretation": "conditional fit interval",
            },
        },
        "provenance": {"method": "known-fixture", "source_sha256": "b" * 64},
        "limitations": ["This fixture is not a NASA result"],
    }
    data, _, _, _ = build_export(corpus, selection(corpus, artifacts=[artifact]))
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        restored = json.loads(archive.read("artifacts/fit-1.json"))
        assert restored == artifact | {"source_sha256": []}
        assert (
            json.loads(archive.read("manifest.json"))["scientific_status"]
            == "frozen_export_not_independent_validation"
        )


def test_credentials_are_not_valid_research_artifact_export_fields():
    from pydantic import ValidationError

    corpus = FrozenCorpus()
    with pytest.raises(ValidationError, match="credentials"):
        selection(corpus, applicability={"job_receipt": "private-access-value"})


def test_empty_chart_stays_visible_in_frozen_bundle_without_invented_figure():
    from nova_ember.api.artifacts import ChartSpec

    corpus = FrozenCorpus()
    empty = query(corpus).model_copy(update={"source_rows": []})
    chart = ChartSpec(
        title="Explicit empty selection",
        query=empty,
        x_column=2,
        y_column=3,
        x_unit="m",
        y_unit="m",
    )
    content, _, _, _ = build_export(corpus, selection(corpus, charts=[chart]))
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert "figures/chart-1.json" in archive.namelist()
        assert "figures/chart-1-unavailable.json" in archive.namelist()
        assert "figures/chart-1.svg" not in archive.namelist()
        assert json.loads(archive.read("figures/chart-1.json"))["data"]["values"] == []

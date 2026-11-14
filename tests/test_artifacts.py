"""Scientific chart/query provenance, explicit units and dashboard revision contracts."""

from pathlib import Path
from uuid import uuid4

import pytest
from nova_ember.adapters.psi import load_snapshot
from nova_ember.api import jobs
from nova_ember.api.artifacts import (
    ChartSpec,
    DashboardSpec,
    QuerySpec,
    execute_query,
    validate_chart,
    validate_dashboard,
)
from pydantic import ValidationError

FIXTURE = Path(__file__).parent / "fixtures/nasa-psi"


class FrozenCorpus:
    def __init__(self):
        self.manifest = load_snapshot(FIXTURE)
        self.snapshot_id = "a" * 64

    def snapshot(self, snapshot_id):
        if snapshot_id != self.snapshot_id:
            raise ValueError("Unknown snapshot")
        return {"snapshot_id": self.snapshot_id}

    def asset(self, digest, snapshot_id):
        self.snapshot(snapshot_id)
        return next(asset for asset in self.manifest["assets"] if asset["sha256"] == digest)

    def asset_bytes(self, asset):
        return (FIXTURE / asset["path"]).read_bytes()


@pytest.fixture
def corpus():
    return FrozenCorpus()


def query(corpus, **changes):
    asset = next(
        asset
        for asset in corpus.manifest["assets"]
        if asset["file_name"] == "PSI-99_Experimental table_SAFFIRE-2.csv"
    )
    return QuerySpec(
        snapshot_id=corpus.snapshot_id,
        asset_sha256=asset["sha256"],
        columns=[2, 3],
        source_rows=[2, 3],
        representation="canonical",
        **changes,
    )


def test_real_saffire_query_retains_source_grain_missingness_and_units(corpus):
    result = execute_query(corpus, query(corpus))
    assert result["returned_source_records"] == 2
    assert result["values"][0]["source_row"] == 2
    assert result["values"][0]["column_2"] == pytest.approx(0.00027)
    assert result["independent_run_count"] is None
    assert result["adapter_id"]
    assert result["columns"][0]["units"] == ["m"]


def test_query_rejects_outside_schema_and_unknown_physical_rows(corpus):
    original = query(corpus)
    for changes in [{"columns": [200]}, {"source_rows": [1000]}]:
        with pytest.raises(ValueError):
            execute_query(corpus, original.model_copy(update=changes))
    with pytest.raises(ValidationError):
        QuerySpec(**{**original.model_dump(), "columns": [2, 2]})


def test_chart_rejects_unsupported_units_and_embedded_code(corpus):
    spec = ChartSpec(
        title="Measured geometry",
        query=query(corpus),
        x_column=2,
        y_column=3,
        x_unit="m",
        y_unit="m",
    )
    chart = validate_chart(corpus, spec)
    assert chart["vega_lite"]["data"]["values"][0]["column_2"] == pytest.approx(0.00027)
    assert "url" not in chart["vega_lite"]["data"]
    with pytest.raises(ValueError, match="unit"):
        validate_chart(corpus, spec.model_copy(update={"x_unit": "mm"}))
    with pytest.raises(ValidationError):
        ChartSpec(**{**spec.model_dump(), "javascript": "alert(1)"})


def test_dashboard_preserves_unavailable_component_and_denies_stale_revision(corpus):
    spec = DashboardSpec(
        dashboard_id=uuid4(),
        revision=2,
        base_revision=1,
        question="Compare the available source conditions",
        corpus_snapshot_id=corpus.snapshot_id,
        components=[
            {
                "component_id": "table",
                "type": "run_table",
                "title": "Source samples",
                "query": query(corpus).model_dump(),
                "empty_state": "No selected samples",
            },
            {
                "component_id": "gap",
                "type": "unresolved_questions",
                "title": "Calibration gap",
                "empty_state": "No validated calibration supports this result",
            },
        ],
    )
    result = validate_dashboard(corpus, spec, expected_revision=1)
    assert result["status"] == "incomplete"
    assert result["components"]["gap"]["status"] == "unavailable"
    with pytest.raises(jobs.JobConflict, match="stale"):
        validate_dashboard(corpus, spec, expected_revision=2)


def test_cross_dataset_filter_binding_requires_more_than_similar_column_name(corpus):
    selected = query(corpus)
    second = selected.model_copy(update={"asset_sha256": corpus.manifest["assets"][0]["sha256"]})
    spec = DashboardSpec(
        dashboard_id=uuid4(),
        revision=1,
        question="Conditions",
        corpus_snapshot_id=corpus.snapshot_id,
        components=[
            {
                "component_id": name,
                "type": "run_table",
                "title": name,
                "query": item.model_dump(),
                "empty_state": "No data",
            }
            for name, item in [("first", selected), ("second", second)]
        ],
        filter_bindings=[
            {
                "source_component": "first",
                "source_column": 2,
                "target_component": "second",
                "target_column": 2,
                "empty_selection": "none",
            }
        ],
    )
    with pytest.raises(ValueError):
        validate_dashboard(corpus, spec)


def test_columnar_engines_agree_on_known_source_statistics_without_inventing_independence(corpus):
    from nova_ember.api.artifacts import AggregateQuery, aggregate_query

    spec = AggregateQuery(
        query=query(corpus),
        fields=[{"column": 2, "method": "mean"}, {"column": 3, "method": "standard_deviation"}],
    )
    first = aggregate_query(corpus, spec, engine="polars")
    second = aggregate_query(corpus, spec, engine="duckdb")
    assert first["values"] == second["values"]
    assert first["values"][0]["column_2"] == pytest.approx(0.00044)
    assert first["values"][0]["column_2_n_nonmissing"] == 2
    assert first["values"][0]["source_rows"] == [2, 3]
    assert first["independent_run_count"] is None
    assert "not measurement uncertainty" in first["limitations"][-1]


@pytest.mark.parametrize("engine", ["polars", "duckdb"])
def test_all_missing_canonical_sum_remains_missing(engine, corpus):
    from nova_ember.api.artifacts import AggregateQuery, aggregate_query

    selected = query(corpus).model_copy(update={"source_rows": [5], "columns": [2]})
    result = aggregate_query(
        corpus,
        AggregateQuery(query=selected, fields=[{"column": 2, "method": "sum"}]),
        engine=engine,
    )
    assert result["values"][0]["column_2"] is None
    assert result["values"][0]["column_2_n_nonmissing"] == 0


def test_mixed_category_and_quantity_chart_keeps_explicit_field_representations(corpus):
    selected = query(corpus).model_copy(
        update={"columns": [0, 2], "column_representations": {0: "original"}}
    )
    spec = ChartSpec(
        title="Reported source sample thickness",
        query=selected,
        mark="bar",
        x_column=0,
        x_type="nominal",
        y_column=2,
        y_unit="m",
    )
    chart = validate_chart(corpus, spec)
    assert chart["data"]["values"][0]["column_0"] == "2-1"
    assert chart["data"]["values"][0]["column_2"] == pytest.approx(0.00027)
    assert chart["vega_lite"]["encoding"]["x"]["type"] == "nominal"


def test_all_source_rows_and_empty_selection_are_distinct_and_missing_units_do_not_conflict(corpus):
    original = query(corpus)
    all_rows = execute_query(corpus, original.model_copy(update={"source_rows": None}))
    assert all_rows["total_source_records"] == 15
    assert all_rows["columns"][0]["units"] == ["m"]
    empty = execute_query(corpus, original.model_copy(update={"source_rows": []}))
    assert empty["values"] == [] and empty["total_source_records"] == 0
    assert empty["columns"][0]["units"] == ["m"]


def test_linked_selection_preserves_manual_filters_and_empty_none_semantics(corpus):
    from nova_ember.api.artifacts import DashboardSelection, apply_dashboard_selection

    selected = query(corpus).model_copy(
        update={"columns": [0, 2], "column_representations": {0: "original"}}
    )
    dashboard = DashboardSpec(
        dashboard_id=uuid4(),
        revision=1,
        question="Reported source geometry",
        corpus_snapshot_id=corpus.snapshot_id,
        components=[
            {
                "component_id": name,
                "type": "run_table",
                "title": name,
                "query": selected.model_dump(),
                "empty_state": "No selected samples",
            }
            for name in ["source", "target"]
        ],
        filter_bindings=[
            {
                "source_component": "source",
                "source_column": 0,
                "target_component": "target",
                "target_column": 0,
                "empty_selection": "none",
            }
        ],
    )
    applied = apply_dashboard_selection(
        corpus,
        DashboardSelection(
            dashboard=dashboard, expected_revision=1, binding_index=0, values=["2-1"]
        ),
    )
    assert applied["spec"]["revision"] == 2
    assert [row["source_row"] for row in applied["components"]["target"]["values"]] == [2]
    empty = apply_dashboard_selection(
        corpus,
        DashboardSelection(dashboard=dashboard, expected_revision=1, binding_index=0, values=[]),
    )
    assert empty["components"]["target"]["values"] == []
    assert dashboard.components[1].query.filters == []
    assert dashboard.revision == 1


def test_reviewed_cross_table_condition_binding_navigates_without_asserting_comparability(corpus):
    names = [
        "PSI-159_Experimental table_CFI-G_Normal Flames.csv",
        "PSI-159_Experimental table_CFI-G_Inverse Flames.csv",
    ]
    selected = [
        QuerySpec(
            snapshot_id=corpus.snapshot_id,
            asset_sha256=next(
                asset["sha256"] for asset in corpus.manifest["assets"] if asset["file_name"] == name
            ),
            columns=[16],
            representation="canonical",
        )
        for name in names
    ]
    dashboard = DashboardSpec(
        dashboard_id=uuid4(),
        revision=1,
        question="Reported burner temperatures",
        corpus_snapshot_id=corpus.snapshot_id,
        components=[
            {
                "component_id": name,
                "type": "run_table",
                "title": name,
                "query": item.model_dump(),
                "empty_state": "No source records",
            }
            for name, item in zip(["normal", "inverse"], selected, strict=True)
        ],
        filter_bindings=[
            {
                "source_component": "normal",
                "source_column": 16,
                "target_component": "inverse",
                "target_column": 16,
                "empty_selection": "none",
            }
        ],
    )
    result = validate_dashboard(corpus, dashboard)
    binding = result["resolved_bindings"][0]
    assert binding["semantic_id"] == "reported_peak_burner_temperature"
    assert binding["scope"] == "navigation_only_not_comparability_or_pooling"
    assert binding["units"] == ["K"]


def test_arbitrary_length_column_cannot_become_measurement_uncertainty(corpus):
    with pytest.raises(ValidationError, match="registered calculation"):
        ChartSpec(
            title="Reported dimensions",
            query=query(corpus),
            x_column=2,
            y_column=3,
            x_unit="m",
            y_unit="m",
            uncertainty="measurement_uncertainty",
            uncertainty_column=2,
        )


def test_registered_source_record_sd_has_actual_calculation_and_never_becomes_a_confidence_interval(
    corpus,
):
    import math

    selected = QuerySpec.model_validate(
        {
            **query(corpus).model_dump(),
            "aggregations": [{"column": 2, "method": "mean"}, {"column": 3, "method": "mean"}],
        }
    )
    spec = ChartSpec(
        title="Descriptive specimen dimensions",
        query=selected,
        x_column=3,
        y_column=2,
        x_unit="m",
        y_unit="m",
        uncertainty="standard_deviation",
        uncertainty_provenance={
            "method_id": "source-record-summary-v1",
            "unit": "m",
            "justification": "Descriptive record spread, without calibration uncertainty",
        },
    )
    result = validate_chart(corpus, spec)
    assert result["data"]["values"][0]["uncertainty_half_width"] == pytest.approx(
        0.00034 / math.sqrt(2)
    )
    assert result["uncertainty_details"]["groups"][0]["column_2_n_nonmissing"] == 2
    assert result["uncertainty_details"]["input_query"]["asset_sha256"] == selected.asset_sha256
    assert result["uncertainty_details"]["ddof"] == 1
    assert result["uncertainty_details"]["level"] is None
    with pytest.raises(ValidationError, match="physical unit"):
        ChartSpec(
            **{
                **spec.model_dump(),
                "uncertainty_provenance": {
                    **spec.uncertainty_provenance.model_dump(),
                    "unit": "mm",
                },
            }
        )
    with pytest.raises(ValidationError, match="qualified method artifact"):
        ChartSpec(
            **{
                **spec.model_dump(),
                "uncertainty": "confidence_interval",
                "uncertainty_provenance": {
                    **spec.uncertainty_provenance.model_dump(),
                    "level": 0.95,
                },
            }
        )

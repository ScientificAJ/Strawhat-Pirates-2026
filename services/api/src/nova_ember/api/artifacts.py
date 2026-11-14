"""Typed scientific queries and artifacts with explicit provenance and private storage."""

from __future__ import annotations

import os
import re
import tempfile
from collections.abc import Callable
from hashlib import sha256
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.records import interpret_table
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, model_validator

from . import jobs
from .database import connect
from .repository import Corpus

Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]
ShortText = Annotated[str, Field(max_length=500)]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class QueryFilter(Contract):
    column: Annotated[int, Field(ge=0, le=255)]
    operation: Literal["equals", "in", "minimum", "maximum", "present"]
    value: str | float | list[str | float] | None = None
    representation: Literal["original", "canonical"] = "original"
    binding_id: Annotated[str | None, Field(max_length=80)] = None

    @model_validator(mode="after")
    def valid_operation(self):
        if isinstance(self.value, list) and len(self.value) > 100:
            raise ValueError("Filter values exceed the allowed selection.")
        if self.operation in {"minimum", "maximum"}:
            if self.representation != "canonical" or not isinstance(self.value, (int, float)):
                raise ValueError("Numeric bounds require an explicit canonical numeric value.")
        if self.operation == "in" and not isinstance(self.value, list):
            raise ValueError("An inclusion filter requires a list of exact source values.")
        if self.operation == "equals" and not isinstance(self.value, (str, int, float)):
            raise ValueError("An equality filter requires an exact value.")
        return self


class AggregateField(Contract):
    column: Annotated[int, Field(ge=0, le=255)]
    method: Literal["mean", "minimum", "maximum", "sum", "standard_deviation"]


class QuerySpec(Contract):
    schema_version: Literal[1] = 1
    snapshot_id: Digest
    asset_sha256: Digest
    source_rows: list[Annotated[int, Field(ge=1)]] | None = Field(
        default=None,
        max_length=1000,
        description="Omit or null for all source records; [] is an explicit empty selection.",
    )
    columns: list[Annotated[int, Field(ge=0, le=255)]] = Field(min_length=1, max_length=64)
    filters: list[QueryFilter] = Field(default_factory=list, max_length=20)
    representation: Literal["original", "canonical"] = "original"
    column_representations: dict[
        Annotated[int, Field(ge=0, le=255)], Literal["original", "canonical"]
    ] = Field(default_factory=dict)
    limit: Annotated[int, Field(ge=1, le=1000)] = 1000
    group_by: list[Annotated[int, Field(ge=0, le=255)]] = Field(default_factory=list, max_length=4)
    aggregations: list[AggregateField] = Field(default_factory=list, max_length=16)

    @model_validator(mode="after")
    def unique_selection(self):
        if len(self.columns) != len(set(self.columns)):
            raise ValueError("A query cannot select a column twice.")
        if self.source_rows is not None and len(self.source_rows) != len(set(self.source_rows)):
            raise ValueError("A query cannot select a source row twice.")
        if not set(self.column_representations).issubset(self.columns):
            raise ValueError("Representation overrides must identify selected columns.")
        return self


class UncertaintyProvenance(Contract):
    method_id: Literal["source-record-summary-v1"]
    unit: Annotated[str, Field(min_length=1, max_length=40)]
    justification: Annotated[str, Field(min_length=10, max_length=2000)]
    level: Annotated[float | None, Field(gt=0, lt=1)] = None


class SmoothingSpec(Contract):
    method_id: Literal["centered-moving-average-v1"] = "centered-moving-average-v1"
    window_points: Annotated[int, Field(ge=3, le=101)]
    maximum_gap: Annotated[float, Field(gt=0)]
    justification: Annotated[str, Field(min_length=10, max_length=2000)]

    @model_validator(mode="after")
    def odd_window(self):
        if self.window_points % 2 == 0:
            raise ValueError("Centered smoothing requires an odd number of source points.")
        return self


class MethodChartSpec(Contract):
    title: Annotated[str, Field(min_length=1, max_length=250)]
    job_ids: list[UUID] = Field(min_length=1, max_length=20)
    view: Literal["fit", "residual", "interval", "observed_predicted", "track", "boundary"]
    x_scale: Literal["linear", "log"] = "linear"
    y_scale: Literal["linear", "log"] = "linear"

    @model_validator(mode="after")
    def distinct_jobs(self):
        if len(set(self.job_ids)) != len(self.job_ids):
            raise ValueError("A method chart cannot duplicate a stored calculation.")
        return self


class ChartSpec(Contract):
    schema_version: Literal[1] = 1
    title: Annotated[str, Field(min_length=1, max_length=250)]
    query: QuerySpec
    mark: Literal[
        "point", "line", "bar", "histogram", "categorical_map", "paired", "response_surface"
    ] = "point"
    x_column: Annotated[int, Field(ge=0, le=255)]
    y_column: Annotated[int, Field(ge=0, le=255)]
    x_type: Literal["quantitative", "nominal", "ordinal"] = "quantitative"
    y_type: Literal["quantitative", "nominal", "ordinal"] = "quantitative"
    x_unit: str | None = Field(default=None, max_length=40)
    y_unit: str | None = Field(default=None, max_length=40)
    x_scale: Literal["linear", "log"] = "linear"
    y_scale: Literal["linear", "log"] = "linear"
    series_column: Annotated[int | None, Field(ge=0, le=255)] = None
    response_columns: list[Annotated[int, Field(ge=0, le=255)]] = Field(
        default_factory=list, max_length=8
    )
    z_column: Annotated[int | None, Field(ge=0, le=255)] = None
    z_unit: str | None = Field(default=None, max_length=40)
    pair_column: Annotated[int | None, Field(ge=0, le=255)] = None
    histogram_bins: Annotated[int, Field(ge=1, le=100)] = 10
    smoothing: SmoothingSpec | None = None
    uncertainty: Literal[
        "not_available",
        "measurement_uncertainty",
        "standard_deviation",
        "standard_error",
        "confidence_interval",
        "prediction_interval",
    ] = "not_available"
    uncertainty_column: Annotated[int | None, Field(ge=0, le=255)] = None
    uncertainty_provenance: UncertaintyProvenance | None = None
    caption: ShortText = ""

    @model_validator(mode="after")
    def selected_fields(self):
        extra = {
            i
            for i in [self.series_column, self.z_column, self.pair_column, *self.response_columns]
            if i is not None
        }
        if (
            len(set(self.response_columns)) != len(self.response_columns)
            or self.y_column in self.response_columns
        ):
            raise ValueError("Response-series columns must be distinct from the primary response.")
        if self.response_columns and (
            self.mark not in {"point", "line"}
            or self.series_column is not None
            or self.y_type != "quantitative"
            or self.uncertainty != "not_available"
        ):
            raise ValueError(
                "Named response comparisons require unpooled point/line series "
                "with matching physical units."
            )
        if not extra.issubset(self.query.columns):
            raise ValueError("Series, color and paired fields must be selected by the query.")
        if (self.mark in {"categorical_map", "response_surface"}) != (self.z_column is not None):
            raise ValueError("A condition map/surface requires exactly one declared color field.")
        if (self.mark == "paired") != (self.pair_column is not None):
            raise ValueError("A paired chart requires its second response column.")
        if self.mark == "paired" and self.x_scale != "linear":
            raise ValueError("Paired response labels require a categorical, nonlogarithmic x axis.")
        if self.mark == "response_surface" and (self.x_type, self.y_type) != (
            "quantitative",
            "quantitative",
        ):
            raise ValueError("An observed response surface requires two quantitative coordinates.")
        if self.mark in {"paired", "histogram"} and self.uncertainty != "not_available":
            raise ValueError(
                "Pair/distribution views preserve raw observations without invented bars."
            )
        if self.mark in {"categorical_map", "response_surface"} and (
            self.x_scale != "linear" or self.y_scale != "linear"
        ):
            raise ValueError("Discrete support maps retain their exact coordinate labels.")
        if self.smoothing is not None and (
            self.mark != "line" or self.x_type != "quantitative" or self.y_type != "quantitative"
        ):
            raise ValueError("The registered smoothing overlay requires a quantitative line chart.")
        if self.x_scale == "log" and self.x_type != "quantitative":
            raise ValueError("A logarithmic x axis requires a quantitative field.")
        if self.y_scale == "log" and self.y_type != "quantitative":
            raise ValueError("A logarithmic y axis requires a quantitative field.")
        if self.mark in {"bar", "paired"} and self.y_type != "quantitative":
            raise ValueError("Bar heights require a quantitative y field.")
        if not {self.x_column, self.y_column}.issubset(self.query.columns):
            raise ValueError("Chart fields must be explicitly selected by its query.")
        if self.uncertainty == "not_available":
            if self.uncertainty_column is not None or self.uncertainty_provenance is not None:
                raise ValueError("A chart without uncertainty cannot carry error-bar inputs.")
        else:
            if self.uncertainty_provenance is None:
                raise ValueError("Error bars require a registered calculation and its provenance.")
            if self.uncertainty_column is not None:
                raise ValueError("An arbitrary numeric source column cannot establish uncertainty.")
            if (
                self.uncertainty != "standard_deviation"
                or self.uncertainty_provenance.level is not None
            ):
                raise ValueError(
                    "Source summaries cannot establish measurement uncertainty, SEM or intervals; "
                    "use the qualified method artifact."
                )
            if self.y_type != "quantitative" or self.uncertainty_provenance.unit != self.y_unit:
                raise ValueError("Error bars require the quantitative y field's physical unit.")
            if not any(
                item.column == self.y_column and item.method == "mean"
                for item in self.query.aggregations
            ):
                raise ValueError(
                    "Source-record standard deviation requires a mean over its frozen inputs."
                )
        return self


ComponentType = Literal[
    "investigation_collection",
    "run_table",
    "condition_coverage",
    "comparison_report",
    "measurement_chart",
    "evidence_summary",
    "applicability_assessment",
    "model_result",
    "assumption_list",
    "unresolved_questions",
]


class DashboardComponent(Contract):
    component_id: Annotated[str, Field(pattern=r"^[a-zA-Z0-9_-]{1,64}$")]
    type: ComponentType
    title: Annotated[str, Field(min_length=1, max_length=250)]
    query: QuerySpec | None = None
    chart: ChartSpec | None = None
    method_chart: MethodChartSpec | None = None
    artifact_id: UUID | None = None
    artifact_job_id: UUID | None = None
    job_id: UUID | None = None
    scientific_status: Literal[
        "measured", "derived", "interpretation", "hypothetical", "unknown", "conflicting"
    ] = "unknown"
    evidence_references: list[ShortText] = Field(default_factory=list, max_length=100)
    empty_state: ShortText

    @model_validator(mode="after")
    def single_data_source(self):
        sources = sum(
            item is not None
            for item in [self.query, self.chart, self.method_chart, self.artifact_id, self.job_id]
        )
        if sources > 1:
            raise ValueError("A dashboard component must have one unambiguous data source.")
        if (self.artifact_id is None) != (self.artifact_job_id is None):
            raise ValueError("A private artifact must identify its owning temporary job.")
        return self


class FilterBinding(Contract):
    source_component: str
    source_column: Annotated[int, Field(ge=0, le=255)]
    target_component: str
    target_column: Annotated[int, Field(ge=0, le=255)]
    empty_selection: Literal["all", "none"]


CFI_NORMAL = "PSI-159_Experimental table_CFI-G_Normal Flames.csv"
CFI_INVERSE = "PSI-159_Experimental table_CFI-G_Inverse Flames.csv"
NAVIGATION_MEANINGS = (
    {(name, 2): "reported_fuel_label" for name in [CFI_NORMAL, CFI_INVERSE]}
    | {(name, 11): "reported_adiabatic_temperature" for name in [CFI_NORMAL, CFI_INVERSE]}
    | {(name, 16): "reported_peak_burner_temperature" for name in [CFI_NORMAL, CFI_INVERSE]}
)


class DashboardSpec(Contract):
    schema_version: Literal[1] = 1
    dashboard_id: UUID
    revision: Annotated[int, Field(ge=1)]
    base_revision: Annotated[int | None, Field(ge=1)] = None
    question: Annotated[str, Field(min_length=1, max_length=4000)]
    corpus_snapshot_id: Digest
    scenario_version_id: str | None = Field(default=None, max_length=128)
    cohort_ids: list[ShortText] = Field(default_factory=list, max_length=100)
    components: list[DashboardComponent] = Field(min_length=1, max_length=30)
    filter_bindings: list[FilterBinding] = Field(default_factory=list, max_length=60)
    selection_bindings: list[FilterBinding] = Field(default_factory=list, max_length=60)
    artifact_dependencies: list[UUID] = Field(default_factory=list, max_length=100)
    mode: Literal["live_query", "frozen"] = "frozen"

    @model_validator(mode="after")
    def coherent_revision(self):
        ids = [component.component_id for component in self.components]
        if len(ids) != len(set(ids)):
            raise ValueError("Dashboard component identifiers must be unique.")
        if self.base_revision is not None and self.revision != self.base_revision + 1:
            raise ValueError("A proposal must identify its immediately preceding base revision.")
        for binding in [*self.filter_bindings, *self.selection_bindings]:
            if binding.source_component not in ids or binding.target_component not in ids:
                raise ValueError("Bindings must resolve to existing dashboard components.")
        return self


def execute_query(corpus: Corpus, spec: QuerySpec) -> dict:
    if spec.aggregations:
        result = aggregate_query(
            corpus,
            AggregateQuery(
                query=spec.model_copy(update={"group_by": [], "aggregations": []}),
                group_by=spec.group_by,
                fields=spec.aggregations,
            ),
        )
        result["query"] = spec.model_dump(mode="json")
        return result
    if spec.group_by:
        raise ValueError("A grouping query requires explicit aggregation methods.")
    asset = corpus.asset(spec.asset_sha256, spec.snapshot_id)
    if not asset["file_name"].lower().endswith(".csv"):
        raise ValueError("Tabular queries require a reviewed CSV source.")
    raw = parse_csv_bytes(corpus.asset_bytes(asset), encoding=asset.get("encoding") or "utf-8")
    table = interpret_table(asset, raw)
    all_columns = {i for i in spec.columns} | {item.column for item in spec.filters}
    if any(column >= len(raw.headers) for column in all_columns):
        raise ValueError("Query references a column outside the frozen source schema.")
    representations = {
        index: spec.column_representations.get(index, spec.representation) for index in spec.columns
    }
    if "canonical" in representations.values() and table.status != "interpreted":
        raise ValueError("Canonical queries require a reviewed source schema.")
    selected_rows = set(spec.source_rows or [])
    existing_rows = {row.source_row for row in table.records}
    if selected_rows - existing_rows:
        raise ValueError("A selected physical row is absent from the frozen table.")

    def matches(row) -> bool:
        for item in spec.filters:
            field = row.fields[item.column]
            value = field.raw_text if item.representation == "original" else field.canonical_value
            if item.operation == "present":
                if value is None or value == "":
                    return False
            elif item.operation == "equals":
                if value != item.value:
                    return False
            elif item.operation == "in":
                if not isinstance(item.value, list) or value not in item.value:
                    return False
            elif item.operation == "minimum":
                if (
                    value is None
                    or not isinstance(value, (int, float))
                    or not isinstance(item.value, (int, float))
                    or value < item.value
                ):
                    return False
            elif item.operation == "maximum":
                if (
                    value is None
                    or not isinstance(value, (int, float))
                    or not isinstance(item.value, (int, float))
                    or value > item.value
                ):
                    return False
        return True

    rows = [
        row
        for row in table.records
        if (spec.source_rows is None or row.source_row in selected_rows) and matches(row)
    ]
    columns = []
    for index in spec.columns:
        source_fields = [row.fields[index] for row in (rows or table.records)]
        units = {
            row.fields[index].canonical_unit
            if representations[index] == "canonical"
            else row.fields[index].original_unit
            for row in (rows or table.records)
        }
        units.discard(None)
        if not units and representations[index] == "canonical":
            units = {
                row.fields[index].canonical_unit
                for row in table.records
                if row.fields[index].canonical_unit is not None
            }
        if len(units) > 1 and representations[index] == "canonical":
            raise ValueError("A canonical query column has inconsistent physical units.")
        kinds = {row.fields[index].quantity_kind for row in rows}
        columns.append(
            {
                "key": f"column_{index}",
                "source_index": index,
                "title": raw.headers[index],
                "display_title": raw.headers[index]
                + (
                    f" (shown in {next(iter(units))})"
                    if units and representations[index] == "canonical"
                    else ""
                ),
                "units": sorted(unit for unit in units if unit),
                "quantity_kinds": sorted(kind for kind in kinds if kind),
                "source_value_kinds": sorted({field.source_value_kind for field in source_fields}),
                "locations": sorted(
                    {field.location for field in source_fields if field.location is not None}
                ),
                "bases": sorted(
                    {field.basis for field in source_fields if field.basis is not None}
                ),
                "transformation_ids": sorted(
                    {
                        field.transformation_id
                        for field in source_fields
                        if field.transformation_id is not None
                    }
                ),
                "representation": representations[index],
            }
        )
    values = [
        {
            "source_row": row.source_row,
            "row_kind": row.row_kind,
            **{
                f"column_{index}": row.fields[index].raw_text
                if representations[index] == "original"
                else row.fields[index].canonical_value
                for index in spec.columns
            },
        }
        for row in rows[: spec.limit]
    ]
    return {
        "schema_version": 1,
        "snapshot_id": spec.snapshot_id,
        "asset": asset,
        "query": spec.model_dump(mode="json"),
        "columns": columns,
        "values": values,
        "total_source_records": len(rows),
        "returned_source_records": len(values),
        "independent_run_count": None,
        "adapter_id": table.adapter_id,
        "adapter_status": table.status,
        "limitations": table.limitations,
        "truncated": len(rows) > len(values),
    }


def validate_chart(corpus: Corpus, spec: ChartSpec) -> dict:
    data = execute_query(corpus, spec.query)
    by_index = {column["source_index"]: column for column in data["columns"]}
    physical = [(spec.x_column, spec.x_unit), (spec.y_column, spec.y_unit)]
    physical.extend((index, spec.y_unit) for index in spec.response_columns)
    if spec.pair_column is not None:
        physical.append((spec.pair_column, spec.y_unit))
    if spec.z_column is not None:
        physical.append((spec.z_column, spec.z_unit))
    for column, unit in physical:
        actual = by_index[column]["units"]
        if (actual and (len(actual) != 1 or unit != actual[0])) or (
            not actual and unit is not None
        ):
            raise ValueError("Chart unit must match the explicit source/query unit.")
    for row in data["values"]:
        for index, axis_type in [
            (spec.x_column, spec.x_type),
            (spec.y_column, spec.y_type),
            *[(index, "quantitative") for index in spec.response_columns],
        ]:
            value = row[f"column_{index}"]
            if (
                axis_type == "quantitative"
                and value is not None
                and not isinstance(value, (int, float))
            ):
                raise ValueError("Quantitative chart axes require canonical numeric fields.")
    uncertainty_field, uncertainty_details = None, None
    if spec.uncertainty_provenance is not None:
        inputs = spec.query.model_copy(update={"aggregations": [], "group_by": []})
        summary = aggregate_query(
            corpus,
            AggregateQuery(
                query=inputs,
                group_by=spec.query.group_by,
                fields=[AggregateField(column=spec.y_column, method="standard_deviation")],
            ),
        )
        group_keys = [f"column_{index}" for index in spec.query.group_by]
        summaries = {tuple(row[key] for key in group_keys): row for row in summary["values"]}
        uncertainty_field = "uncertainty_half_width"
        for row in data["values"]:
            source = summaries[tuple(row[key] for key in group_keys)]
            row[uncertainty_field] = source[f"column_{spec.y_column}"]
        data["columns"].append(
            {
                "key": uncertainty_field,
                "source_index": None,
                "title": "Sample standard deviation of source records",
                "units": [spec.y_unit],
                "quantity_kinds": ["derived_uncertainty"],
                "representation": "derived",
            }
        )
        uncertainty_details = {
            **spec.uncertainty_provenance.model_dump(),
            "definition": "sqrt(sum((x-mean(x))**2)/(n_nonmissing-1))",
            "input_query": inputs.model_dump(mode="json"),
            "ddof": 1,
            "groups": summary["values"],
            "limitations": summary["limitations"],
        }
    from .charting import check_scales, source_plot, vega_lite

    plot = source_plot(spec.model_dump(mode="json"), data, by_index)
    plot["uncertainty_field"] = uncertainty_field
    check_scales(plot)
    return {
        "spec": spec.model_dump(mode="json"),
        "vega_lite": vega_lite(plot),
        "plot": plot,
        "data": data,
        "scientific_origin": "derived",
        "uncertainty_interpretation": spec.uncertainty,
        "uncertainty_field": uncertainty_field,
        "uncertainty_details": uncertainty_details,
        "uncertainty_representation": "symmetric_half_width" if uncertainty_field else None,
        "status": "complete" if plot["rows"] else "unavailable",
    }


def validate_dashboard(
    corpus: Corpus,
    spec: DashboardSpec,
    expected_revision: int | None = None,
    private_resolver: Callable[[DashboardComponent], dict] | None = None,
) -> dict:
    corpus.snapshot(spec.corpus_snapshot_id)
    if expected_revision is not None and spec.base_revision != expected_revision:
        raise jobs.JobConflict("Dashboard proposal is stale; preserve both browser revisions.")
    results = {}
    for component in spec.components:
        query = component.chart.query if component.chart else component.query
        if query and query.snapshot_id != spec.corpus_snapshot_id:
            raise ValueError("Dashboard components must resolve the declared corpus snapshot.")
        if (
            component.method_chart is not None
            or component.artifact_id is not None
            or component.job_id is not None
        ):
            if private_resolver is None:
                raise ValueError("Private components require their originating browser receipt.")
            resolved = private_resolver(component)
            if resolved.get("snapshot_id") != spec.corpus_snapshot_id:
                raise ValueError(
                    "Private component provenance differs from the dashboard snapshot."
                )
            results[component.component_id] = resolved
            continue
        if component.chart:
            results[component.component_id] = validate_chart(corpus, component.chart)
        elif query:
            results[component.component_id] = execute_query(corpus, query)
        else:
            results[component.component_id] = {
                "status": "unavailable",
                "reason": component.empty_state,
            }
    components = {item.component_id: item for item in spec.components}
    resolved_bindings = []
    for binding in [*spec.filter_bindings, *spec.selection_bindings]:
        source = components[binding.source_component]
        target = components[binding.target_component]
        source_query = source.chart.query if source.chart else source.query
        target_query = target.chart.query if target.chart else target.query
        if not source_query or not target_query:
            raise ValueError("Linked filters require two explicitly query-backed components.")
        if (
            binding.source_column not in source_query.columns
            or binding.target_column not in target_query.columns
        ):
            raise ValueError("Binding fields must appear in both component queries.")
        if source_query.aggregations and binding.source_column not in source_query.group_by:
            raise ValueError(
                "Aggregate selections propagate group identifiers, not a mean as a source value."
            )
        source_rep = source_query.column_representations.get(
            binding.source_column, source_query.representation
        )
        target_rep = target_query.column_representations.get(
            binding.target_column, target_query.representation
        )
        if source_rep != target_rep:
            raise ValueError("Linked filters require the same explicit value representation.")
        source_data = (
            results[source.component_id]["data"] if source.chart else results[source.component_id]
        )
        target_data = (
            results[target.component_id]["data"] if target.chart else results[target.component_id]
        )
        source_asset, target_asset = source_data["asset"], target_data["asset"]
        same_field = (
            source_query.asset_sha256 == target_query.asset_sha256
            and binding.source_column == binding.target_column
        )
        meaning = NAVIGATION_MEANINGS.get((source_asset["file_name"], binding.source_column))
        if not same_field:
            if (
                source_data["adapter_status"] != "interpreted"
                or target_data["adapter_status"] != "interpreted"
            ):
                raise ValueError("Cross-source navigation requires both reviewed source schemas.")
            target_meaning = NAVIGATION_MEANINGS.get(
                (target_asset["file_name"], binding.target_column)
            )
            if (
                not meaning
                or meaning != target_meaning
                or source_asset["accession"] != target_asset["accession"]
            ):
                raise ValueError("A cross-dataset binding requires a reviewed semantic mapping.")
            if meaning != "reported_fuel_label" and source_rep != "canonical":
                raise ValueError("Numeric cross-dataset filters require canonical units.")
        source_field = next(
            item for item in source_data["columns"] if item["source_index"] == binding.source_column
        )
        target_field = next(
            item for item in target_data["columns"] if item["source_index"] == binding.target_column
        )
        if source_field["units"] != target_field["units"]:
            raise ValueError("Linked filters require matching explicit units.")
        resolved_bindings.append(
            {
                **binding.model_dump(),
                "semantic_id": meaning or "same_source_field",
                "mapping_version": "reported-condition-navigation-v1",
                "scope": "navigation_only_not_comparability_or_pooling",
                "units": source_field["units"],
            }
        )
    return {
        "spec": spec.model_dump(mode="json"),
        "components": results,
        "status": "incomplete"
        if any(value.get("status") in {"unavailable", "incomplete"} for value in results.values())
        else "complete",
        "storage": "browser_owned",
        "expected_revision": expected_revision,
        "resolved_bindings": resolved_bindings,
    }


class DashboardSelection(Contract):
    dashboard: DashboardSpec
    expected_revision: Annotated[int, Field(ge=1)]
    binding_kind: Literal["filter", "selection"] = "filter"
    binding_index: Annotated[int, Field(ge=0, le=59)]
    values: list[str | float] = Field(max_length=100)


def apply_dashboard_selection(
    corpus: Corpus,
    selection: DashboardSelection,
    private_resolver: Callable[[DashboardComponent], dict] | None = None,
) -> dict:
    dashboard = selection.dashboard
    if dashboard.revision != selection.expected_revision:
        raise jobs.JobConflict("The dashboard changed before this linked selection was applied.")
    validate_dashboard(corpus, dashboard, private_resolver=private_resolver)
    bindings = (
        dashboard.filter_bindings
        if selection.binding_kind == "filter"
        else dashboard.selection_bindings
    )
    if selection.binding_index >= len(bindings):
        raise ValueError("The selected dashboard binding does not exist.")
    binding = bindings[selection.binding_index]
    components = []
    binding_id = f"{selection.binding_kind}-{selection.binding_index}"
    for component in dashboard.components:
        if component.component_id != binding.target_component:
            components.append(component)
            continue
        query = component.chart.query if component.chart else component.query
        assert query is not None
        filters = [item for item in query.filters if item.binding_id != binding_id]
        if selection.values or binding.empty_selection == "none":
            filters.append(
                QueryFilter(
                    column=binding.target_column,
                    operation="in",
                    value=selection.values,
                    representation=query.column_representations.get(
                        binding.target_column, query.representation
                    ),
                    binding_id=binding_id,
                )
            )
        updated_query = query.model_copy(update={"filters": filters})
        component = component.model_copy(
            update={"chart": component.chart.model_copy(update={"query": updated_query})}
            if component.chart
            else {"query": updated_query}
        )
        components.append(component)
    proposal = dashboard.model_copy(
        update={
            "components": components,
            "revision": dashboard.revision + 1,
            "base_revision": dashboard.revision,
        }
    )
    return validate_dashboard(
        corpus,
        proposal,
        expected_revision=selection.expected_revision,
        private_resolver=private_resolver,
    )


def private_directory(directory: Path, job_id: str) -> Path:
    return directory / "private" / str(UUID(job_id))


def publish_artifact(
    database_url: str,
    directory: Path,
    job_id: str,
    attempt: int,
    *,
    operation_key: str,
    data: bytes,
    media_type: str,
    file_name: str,
    provenance: dict,
) -> dict | None:
    """Write checked bytes then atomically record them under the current worker lease."""
    if len(data) > 16 * 1024 * 1024:
        raise ValueError("Artifact exceeds the sixteen MiB limit.")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", file_name):
        raise ValueError("Artifact file name must be a plain bounded basename.")
    provenance = {**provenance, "job_attempt": attempt}
    with connect(database_url) as connection:
        if not jobs.running_job(connection, job_id, attempt):
            return None
    digest = sha256(data).hexdigest()
    folder = private_directory(directory, job_id)
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination = folder / digest
    with tempfile.NamedTemporaryFile(dir=folder, delete=False) as temporary:
        temporary.write(data)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    try:
        os.replace(temporary_path, destination)
    finally:
        temporary_path.unlink(missing_ok=True)
    artifact_id = str(uuid4())
    with connect(database_url) as connection:
        if not jobs.running_job(connection, job_id, attempt):
            retained = connection.execute(
                "SELECT 1 FROM private_artifacts WHERE job_id = %s AND sha256 = %s",
                (job_id, digest),
            ).fetchone()
            if not retained:
                destination.unlink(missing_ok=True)
            return None
        previous = connection.execute(
            "SELECT * FROM private_artifacts WHERE job_id = %s AND operation_key = %s",
            (job_id, operation_key),
        ).fetchone()
        if previous:
            if previous["sha256"] != digest:
                raise jobs.JobConflict("Artifact operation was already published with other bytes.")
            artifact_id = str(previous["id"])
        else:
            connection.execute(
                """INSERT INTO private_artifacts
                   (id, job_id, operation_key, sha256, byte_size, media_type, file_name, provenance)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
                (
                    artifact_id,
                    job_id,
                    operation_key,
                    digest,
                    len(data),
                    media_type,
                    file_name,
                    Jsonb(provenance),
                ),
            )
            jobs.append_event(
                connection, job_id, attempt, "artifact_ready", {"artifact_id": artifact_id}
            )
    return {
        "id": artifact_id,
        "sha256": digest,
        "byte_size": len(data),
        "media_type": media_type,
        "file_name": file_name,
        "provenance": provenance,
    }


def read_artifact(
    database_url: str, directory: Path, job_id: str, artifact_id: str, receipt: str | None
) -> tuple[dict, bytes]:
    with connect(database_url) as connection:
        job = jobs.authorized_job(connection, job_id, receipt)
        if job["status"] not in {"running", "succeeded", "failed", "canceled"}:
            raise jobs.JobNotFound("No artifact is available for this job state.")
        artifact = connection.execute(
            "SELECT * FROM private_artifacts WHERE id = %s AND job_id = %s",
            (str(UUID(artifact_id)), str(UUID(job_id))),
        ).fetchone()
    if not artifact:
        raise jobs.JobNotFound("No accessible artifact matches this job.")
    data = (private_directory(directory, job_id) / artifact["sha256"]).read_bytes()
    if len(data) != artifact["byte_size"] or sha256(data).hexdigest() != artifact["sha256"]:
        raise ValueError("Retained artifact fails its manifest checksum.")
    return {
        **artifact,
        "id": str(artifact["id"]),
        "job_id": str(artifact["job_id"]),
        "publication_status": "complete" if job["status"] == "succeeded" else "incomplete",
        "job_status": job["status"],
    }, data


def remove_artifact_files(directory: Path, job_id: str) -> None:
    folder = private_directory(directory, job_id)
    if not folder.exists():
        return
    for path in folder.iterdir():
        if path.is_file() and not path.is_symlink():
            path.unlink()
    folder.rmdir()


class AggregateQuery(Contract):
    query: QuerySpec
    group_by: list[Annotated[int, Field(ge=0, le=255)]] = Field(default_factory=list, max_length=4)
    fields: list[AggregateField] = Field(min_length=1, max_length=16)

    @model_validator(mode="after")
    def coherent_fields(self):
        aggregated = [item.column for item in self.fields]
        if len(aggregated) != len(set(aggregated)) or len(self.group_by) != len(set(self.group_by)):
            raise ValueError("Aggregation and grouping fields must be unique.")
        if set(aggregated) & set(self.group_by):
            raise ValueError("A grouped identifier cannot also be its own measurement aggregate.")
        if not (set(aggregated) | set(self.group_by)).issubset(self.query.columns):
            raise ValueError("Aggregation fields must be explicitly selected by the frozen query.")
        return self


def aggregate_query(corpus: Corpus, spec: AggregateQuery, *, engine: str = "polars") -> dict:
    """Descriptive source-record summaries, retaining every contributing physical row."""
    from importlib import import_module

    data = execute_query(corpus, spec.query.model_copy(update={"limit": 1000}))
    if data["truncated"]:
        raise ValueError(
            "Select a bounded cohort before aggregation; truncated data cannot define a statistic."
        )
    for field in spec.fields:
        representation = spec.query.column_representations.get(
            field.column, spec.query.representation
        )
        if representation != "canonical":
            raise ValueError(
                "Numerical aggregates require explicitly normalized source quantities."
            )
    values = data["values"]
    group_keys = [f"column_{index}" for index in spec.group_by]
    if not values:
        result = []
    elif engine == "polars":
        pl = import_module("polars")
        schema = {
            "source_row": pl.Int64,
            "row_kind": pl.String,
            **{
                f"column_{index}": pl.String
                if spec.query.column_representations.get(index, spec.query.representation)
                == "original"
                else pl.Float64
                for index in spec.query.columns
            },
        }
        frame = pl.DataFrame(values, schema=schema)
        expressions = [pl.len().alias("source_record_count")]
        for field in spec.fields:
            name = f"column_{field.column}"
            column = pl.col(name)
            operation = {
                "mean": column.mean,
                "minimum": column.min,
                "maximum": column.max,
                "sum": column.sum,
                "standard_deviation": lambda column=column: column.std(ddof=1),
            }[field.method]
            expression = operation()
            if field.method == "sum":
                expression = pl.when(column.count() > 0).then(expression).otherwise(None)
            expressions.extend(
                [expression.alias(name), column.count().alias(name + "_n_nonmissing")]
            )
        if group_keys:
            result = (
                frame.group_by(group_keys, maintain_order=True)
                .agg([pl.col("source_row").alias("source_rows"), *expressions])
                .to_dicts()
            )
        else:
            result = frame.select(
                [pl.col("source_row").implode().alias("source_rows"), *expressions]
            ).to_dicts()
    elif engine == "duckdb":
        duckdb, pa = import_module("duckdb"), import_module("pyarrow")
        schema = pa.schema(
            [
                pa.field("source_row", pa.int64()),
                pa.field("row_kind", pa.string()),
                *[
                    pa.field(
                        f"column_{index}",
                        pa.string()
                        if spec.query.column_representations.get(index, spec.query.representation)
                        == "original"
                        else pa.float64(),
                    )
                    for index in spec.query.columns
                ],
            ]
        )
        expressions = [
            *group_keys,
            "list(source_row ORDER BY source_row) AS source_rows",
            "count(*) AS source_record_count",
        ]
        functions = {
            "mean": "avg",
            "minimum": "min",
            "maximum": "max",
            "sum": "sum",
            "standard_deviation": "stddev_samp",
        }
        for field in spec.fields:
            name = f"column_{field.column}"
            expression = f"{functions[field.method]}({name})"
            if field.method == "sum":
                expression = f"CASE WHEN count({name}) = 0 THEN NULL ELSE {expression} END"
            expressions.extend([f"{expression} AS {name}", f"count({name}) AS {name}_n_nonmissing"])
        # All SQL identifiers and operations above come from validated integer indices and enums.
        statement = "SELECT " + ", ".join(expressions) + " FROM frozen"
        if group_keys:
            statement += " GROUP BY " + ", ".join(group_keys)
        statement += " ORDER BY min(source_row)"
        with duckdb.connect(
            ":memory:",
            config={
                "enable_external_access": False,
                "threads": 1,
                "memory_limit": "128MB",
                "autoinstall_known_extensions": False,
                "autoload_known_extensions": False,
            },
        ) as connection:
            connection.register("frozen", pa.Table.from_pylist(values, schema=schema))
            result = connection.execute(statement).to_arrow_table().to_pylist()
    else:
        raise ValueError("Unsupported internal analytical engine.")
    columns = [
        column
        for column in data["columns"]
        if column["source_index"] in {*spec.group_by, *[item.column for item in spec.fields]}
    ]
    for row in result:
        row["source_row"] = None
        row["row_kind"] = "aggregate_summary"
    return {
        "schema_version": 1,
        "snapshot_id": spec.query.snapshot_id,
        "asset": data["asset"],
        "aggregation": spec.model_dump(mode="json"),
        "method_id": "source-record-summary-v1",
        "values": result,
        "columns": columns,
        "query": spec.query.model_dump(mode="json"),
        "adapter_id": data["adapter_id"],
        "adapter_status": data["adapter_status"],
        "total_source_records": len(values),
        "returned_source_records": len(values),
        "returned_aggregate_rows": len(result),
        "truncated": False,
        "independent_run_count": None,
        "grain": "descriptive_source_records",
        "engine": engine,
        "limitations": [
            *data["limitations"],
            "Aggregation describes selected source records; it does not establish comparable "
            "conditions, a pooled experimental effect or independent replicates.",
            "Sample standard deviation uses ddof=1 over reported source records; "
            "it is not measurement uncertainty, standard error or an independent-run interval.",
        ],
    }

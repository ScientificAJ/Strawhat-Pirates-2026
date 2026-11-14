"""Known plotting transforms, preserved sparse domains and real method provenance."""

import copy
import math
from uuid import uuid4

import pytest
from nova_ember.analysis.fits import fit_trace
from nova_ember.api import artifacts
from nova_ember.api.artifacts import ChartSpec, MethodChartSpec, QuerySpec, validate_chart
from nova_ember.api.charting import method_plot
from nova_ember.api.exporting import figure_bytes
from test_methods_fits import trace_request


class Corpus:
    pass


def source_chart(monkeypatch, rows, *, mark="point", units=None, **changes):
    units = units or {}
    query = QuerySpec(snapshot_id="a" * 64, asset_sha256="b" * 64, columns=[0, 1, 2])
    data = {
        "snapshot_id": "a" * 64,
        "asset": {"sha256": "b" * 64, "accession": "known-answer"},
        "columns": [
            {
                "source_index": index,
                "key": f"column_{index}",
                "title": f"field {index}",
                "units": [units[index]] if index in units else [],
            }
            for index in range(3)
        ],
        "values": [
            {"source_row": index + 1, **{f"column_{j}": value for j, value in enumerate(values)}}
            for index, values in enumerate(rows)
        ],
        "total_source_records": len(rows),
    }
    monkeypatch.setattr(artifacts, "execute_query", lambda corpus, spec: copy.deepcopy(data))
    spec = ChartSpec(
        title="Known-answer chart", query=query, mark=mark, x_column=0, y_column=1, **changes
    )
    return validate_chart(Corpus(), spec), data


def test_response_grid_masks_unobserved_cells_and_never_interpolates(monkeypatch):
    chart, original = source_chart(
        monkeypatch,
        [[0.0, 0.0, 2.0], [1.0, 0.0, 4.0], [0.0, 1.0, 8.0]],
        mark="response_surface",
        z_column=2,
    )
    assert len(chart["plot"]["domain_mask"]) == 4
    assert chart["plot"]["domain_mask"][-1] == {"x": 1.0, "y": 1.0, "observed": False}
    assert chart["plot"]["interpolation"] == "none"
    assert chart["plot"]["prediction"] is False
    assert len(chart["vega_lite"]["data"]["values"]) == 3
    assert chart["data"]["values"] == original["values"]
    assert figure_bytes(chart, "png").startswith(b"\x89PNG")
    with pytest.raises(ValueError, match="multiple records"):
        source_chart(
            monkeypatch, [[0.0, 0.0, 2.0], [0.0, 0.0, 4.0]], mark="response_surface", z_column=2
        )


def test_categorical_map_retains_outcome_labels_and_paired_values(monkeypatch):
    chart, _ = source_chart(
        monkeypatch,
        [["A", "low", "observed ignition"], ["B", "low", "not ignited"]],
        mark="categorical_map",
        z_column=2,
        x_type="nominal",
        y_type="nominal",
    )
    assert chart["vega_lite"]["layer"][1]["mark"] == "text"
    assert b"observed ignition" in figure_bytes(chart, "svg")
    chart, _ = source_chart(
        monkeypatch,
        [["run-A", 1.0, 5.0], ["run-B", 2.0, 6.0]],
        mark="paired",
        pair_column=2,
        x_type="nominal",
        y_unit="m",
        units={1: "m", 2: "m"},
    )
    assert [row["paired_value"] for row in chart["plot"]["rows"]] == [1.0, 5.0, 2.0, 6.0]
    assert chart["plot"]["transformations"][0]["pair_count"] == 2
    assert len({row["pair_id"] for row in chart["plot"]["rows"]}) == 2
    assert figure_bytes(chart, "pdf").startswith(b"%PDF")


def test_distribution_counts_and_gap_aware_smoothing_preserve_raw_inputs(monkeypatch):
    chart, _ = source_chart(
        monkeypatch,
        [
            [0.0, 0.0, None],
            [1.0, 1.0, None],
            [2.0, 2.0, None],
            [3.0, 3.0, None],
            [None, None, None],
        ],
        mark="histogram",
        histogram_bins=2,
    )
    assert [row["source_record_count"] for row in chart["plot"]["rows"]] == [2, 2]
    assert chart["plot"]["transformations"][0]["missing_count"] == 1
    rows = [
        [float(x), float(y), None]
        for x, y in zip([0, 1, 2, 10, 11, 12, 13], [0, 3, 0, 0, 6, 0, 0], strict=True)
    ]
    chart, original = source_chart(
        monkeypatch,
        rows,
        mark="line",
        smoothing={
            "window_points": 3,
            "maximum_gap": 2.0,
            "justification": "Display only; fixed window and a declared source-clock gap",
        },
    )
    assert [row["smoothed_value"] for row in chart["plot"]["rows"]] == [
        None,
        1.0,
        None,
        None,
        2.0,
        2.0,
        None,
    ]
    assert chart["plot"]["rows"][2]["_segment"] != chart["plot"]["rows"][3]["_segment"]
    assert chart["data"]["values"] == original["values"]
    assert b"<svg" in figure_bytes(chart, "svg")
    with pytest.raises(ValueError, match="positive"):
        source_chart(monkeypatch, [[-1.0, 2.0, None]], x_scale="log")


def method_record(result):
    return {
        "id": uuid4(),
        "kind": "registered_analysis",
        "status": "succeeded",
        "snapshot_id": "a" * 64,
        "result": {
            "result": result.model_dump(mode="json"),
            "resources": {"implementation_sha256": "c" * 64},
        },
    }


def test_registered_fit_views_keep_true_values_residuals_and_interval_meaning():
    result = fit_trace(
        trace_request(
            error_model="independent_normal_residuals",
            error_model_justification=(
                "Analytical independent reference; no calibration or sampling error"
            ),
        )
    )
    record = method_record(result)
    spec = MethodChartSpec(title="Stored fit", job_ids=[record["id"]], view="fit")
    chart = method_plot(spec.model_dump(mode="json"), [record])
    assert chart["plot"]["rows"][2]["y"] == pytest.approx(0.009)
    assert chart["plot"]["rows"][2]["fitted"] == pytest.approx(0.009)
    assert chart["provenance"][0]["calculation"]["context"]["input_origin"] == "synthetic_reference"
    assert b"<svg" in figure_bytes(chart)
    interval_chart = method_plot(
        spec.model_copy(update={"view": "interval"}).model_dump(mode="json"), [record]
    )
    row = interval_chart["plot"]["rows"][0]
    assert row["interval_level"] == 0.95
    assert row["interval_interpretation"] == result.interval.interpretation
    assert row["lower"] == result.interval.lower
    assert figure_bytes(interval_chart, "png").startswith(b"\x89PNG")
    residual = method_plot(
        spec.model_copy(update={"view": "residual"}).model_dump(mode="json"), [record]
    )
    assert max(abs(row["y"]) for row in residual["plot"]["rows"]) < 1e-15
    no_interval = method_record(fit_trace(trace_request()))
    with pytest.raises(ValueError, match="no justified interval"):
        method_plot(
            spec.model_copy(update={"view": "interval"}).model_dump(mode="json"), [no_interval]
        )


def test_droplet_interval_displays_positive_burning_constant_not_negative_slope():
    result = fit_trace(
        trace_request(
            kind="droplet_d_squared",
            points=[
                {"source_locator": str(i), "time": float(i), "value": math.sqrt(4 - 0.5 * i)}
                for i in range(4)
            ],
            regime="established hot-flame interval",
            regime_reference="source-labelled-interval",
            support_configuration="documented-fiber",
            diameter_definition="equivalent-volume diameter",
            error_model="independent_normal_residuals",
            error_model_justification=(
                "Independent analytical reference without calibration uncertainty"
            ),
        )
    )
    record = method_record(result)
    chart = method_plot(
        MethodChartSpec(
            title="D squared interval", job_ids=[record["id"]], view="interval"
        ).model_dump(mode="json"),
        [record],
    )
    assert chart["plot"]["rows"][0]["y"] == pytest.approx(0.5e-6)
    assert result.signed_slope < 0
    assert figure_bytes(chart, "pdf").startswith(b"%PDF")


def test_detector_response_channels_keep_separate_fields_and_common_declared_clock(monkeypatch):
    chart, original = source_chart(
        monkeypatch,
        [[0.0, 1.0, 4.0], [1.0, 2.0, 5.0]],
        mark="line",
        response_columns=[2],
        x_unit="s",
        y_unit="V",
        units={0: "s", 1: "V", 2: "V"},
    )
    assert len(chart["plot"]["rows"]) == 4
    assert chart["plot"]["missing_coordinate_count"] == 0
    assert chart["plot"]["response_counts"] == [
        {"column": 1, "eligible": 2, "missing": 0},
        {"column": 2, "eligible": 2, "missing": 0},
    ]
    assert {row["_series"] for row in chart["plot"]["rows"]} == {"field 1", "field 2"}
    assert [row["column_1"] for row in chart["plot"]["rows"]] == [1.0, 4.0, 2.0, 5.0]
    assert chart["data"]["values"] == original["values"]
    assert (
        chart["plot"]["transformations"][0]["combination"]
        == "separate_series_no_pooling_or_implicit_synchronization"
    )
    assert b"field 2" in figure_bytes(chart, "svg")
    with pytest.raises(ValueError, match="unit"):
        source_chart(
            monkeypatch,
            [[0.0, 1.0, 4.0]],
            mark="line",
            response_columns=[2],
            x_unit="s",
            y_unit="V",
            units={0: "s", 1: "V", 2: "m"},
        )


def test_monte_carlo_interval_retains_output_distribution_interpretation_and_seed():
    from nova_ember.analysis.uncertainty import propagate_monte_carlo
    from test_methods_uncertainty import mc_request

    result = propagate_monte_carlo(
        mc_request(covariance=[[0.0, 0.0], [0.0, 0.0]], sample_count=1000)
    )
    record = method_record(result)
    spec = MethodChartSpec(title="Propagated output", job_ids=[record["id"]], view="interval")
    chart = method_plot(spec.model_dump(mode="json"), [record])
    row = chart["plot"]["rows"][0]
    assert row["y"] == row["lower"] == row["upper"] == 6.0
    assert row["interval_interpretation"] == result.central_output_interval.interpretation
    assert chart["provenance"][0]["calculation"]["request"]["seed"] == 314159
    assert figure_bytes(chart, "png").startswith(b"\x89PNG")


def test_calibrated_track_never_joins_excluded_frames_or_distinct_jobs():
    from nova_ember.analysis.media import calibrate_pixel_trace
    from test_media_methods import trace_request as pixel_request

    request = pixel_request()
    points = list(request.points)
    points[1] = points[1].model_copy(update={"exclude_reason": "Occluded source frame"})
    result = calibrate_pixel_trace(request.model_copy(update={"points": tuple(points)}))
    first, second = method_record(result), method_record(result)
    definition = MethodChartSpec(
        title="Separated calibrated tracks", job_ids=[first["id"], second["id"]], view="track"
    )
    chart = method_plot(definition.model_dump(mode="json"), [first, second])
    rows = chart["plot"]["rows"]
    assert len(rows) == 4
    assert len({row["_segment"] for row in rows}) == 4
    assert chart["vega_lite"]["encoding"]["detail"]["field"] == "_segment"
    assert {row["source_locator"] for row in rows} == {"frame:0", "frame:60"}
    assert b"<svg" in figure_bytes(chart)


def test_histogram_export_uses_approved_log_scale_and_paired_labels_reject_it(monkeypatch):
    from matplotlib.axes import Axes
    from pydantic import ValidationError

    original = Axes.set_xscale
    scales = []

    def capture_scale(axes, value, **kwargs):
        scales.append(value)
        return original(axes, value, **kwargs)

    monkeypatch.setattr(Axes, "set_xscale", capture_scale)
    chart, _ = source_chart(
        monkeypatch,
        [[1.0, 1.0, None], [2.0, 2.0, None], [3.0, 3.0, None], [4.0, 4.0, None]],
        mark="histogram",
        histogram_bins=2,
        x_scale="log",
    )
    assert chart["vega_lite"]["encoding"]["x"]["scale"]["type"] == "log"
    assert figure_bytes(chart, "png").startswith(b"\x89PNG")
    assert "log" in scales
    with pytest.raises(ValidationError, match="Paired response labels"):
        source_chart(
            monkeypatch,
            [[1.0, 2.0, 3.0]],
            mark="paired",
            pair_column=2,
            x_type="quantitative",
            x_scale="log",
        )


def test_real_image_method_envelope_exposes_original_boundary_with_retained_lineage():
    from nova_ember.analysis.media import measure_image
    from test_media_methods import image_bytes, request

    content = image_bytes()
    result = measure_image(request(content), content)
    record = method_record(result)
    lineage = {"snapshot_id": "a" * 64, "source_sha256": result.source_sha256}
    record["result"]["result"] = {
        "measurement": result.model_dump(mode="json"),
        "provenance": lineage,
        "provenance_contract": "Original source and frame identity checked before measurement.",
    }
    chart = method_plot(
        MethodChartSpec(
            title="Original-pixel boundary", job_ids=[record["id"]], view="boundary"
        ).model_dump(mode="json"),
        [record],
    )
    assert [row["x"] for row in chart["plot"]["rows"]] == [6] * 6
    assert [row["y"] for row in chart["plot"]["rows"]] == [2, 3, 4, 5, 6, 7]
    assert chart["provenance"][0]["source_provenance"] == lineage
    assert figure_bytes(chart, "png").startswith(b"\x89PNG")
    lineage["snapshot_id"] = "b" * 64
    with pytest.raises(ValueError, match="frozen job snapshot"):
        method_plot(
            MethodChartSpec(
                title="Invalid source", job_ids=[record["id"]], view="boundary"
            ).model_dump(mode="json"),
            [record],
        )

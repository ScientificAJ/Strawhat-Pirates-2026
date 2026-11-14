"""Fixed scientific plot transformations and a shared, passive chart grammar.

Only validated source columns or stored registered-method outputs enter here.
Missing map cells stay missing; this module never fits a model or interpolates.
"""

from __future__ import annotations

from hashlib import sha256
from typing import Any

from . import jobs


def check_scales(plot: dict) -> None:
    for axis in ("x", "y"):
        if plot[f"{axis}_scale"] != "log":
            continue
        keys = [plot[axis]]
        if axis == "y":
            keys += [key for key in [plot.get("lower"), plot.get("upper")] if key]
        if any(
            row.get(key) is not None and (not isinstance(row[key], (int, float)) or row[key] <= 0)
            for row in plot["rows"]
            for key in keys
        ):
            raise ValueError("Logarithmic display requires positive values and interval bounds.")
        error = plot.get("uncertainty_field")
        if (
            axis == "y"
            and error
            and any(
                row.get(error) is not None and row[plot["y"]] - row[error] <= 0
                for row in plot["rows"]
            )
        ):
            raise ValueError("Logarithmic error bars cannot cross or reach zero.")


def source_plot(spec: dict, data: dict, columns: dict) -> dict:
    xkey, ykey = f"column_{spec['x_column']}", f"column_{spec['y_column']}"
    series = f"column_{spec['series_column']}" if spec["series_column"] is not None else None
    rows = []
    segments: dict[str, int] = {}
    response_columns = [spec["y_column"], *spec["response_columns"]]
    for order, raw in enumerate(data["values"]):
        for response in response_columns:
            rkey = f"column_{response}"
            group = (
                columns[response]["title"]
                if spec["response_columns"]
                else str(raw.get(series))
                if series
                else "selected records"
            )
            segments.setdefault(group, 0)
            if raw[xkey] in (None, "") or raw[rkey] in (None, ""):
                segments[group] += 1
                continue
            rows.append(
                {
                    **raw,
                    ykey: raw[rkey],
                    "_response_column": response,
                    "_order": order,
                    "_series": group,
                    "_segment": f"{group}:{segments[group]}",
                }
            )
    plot: dict[str, Any] = {
        "kind": spec["mark"],
        "title": spec["title"],
        "rows": rows,
        "x": xkey,
        "y": ykey,
        "x_type": spec["x_type"],
        "y_type": spec["y_type"],
        "x_label": _label(columns[spec["x_column"]], spec["x_unit"]),
        "y_label": _label(columns[spec["y_column"]], spec["y_unit"]),
        "x_scale": spec["x_scale"],
        "y_scale": spec["y_scale"],
        "series": "_series" if series or spec["response_columns"] else None,
        "group": "_segment",
        "transformations": [],
        "missing_coordinate_count": len(data["values"]) * len(response_columns) - len(rows),
        "coordinate_count_grain": "selected_source_record_and_response_field_pairs",
        "response_counts": [
            {
                "column": index,
                "eligible": sum(row["_response_column"] == index for row in rows),
                "missing": len(data["values"])
                - sum(row["_response_column"] == index for row in rows),
            }
            for index in response_columns
        ],
        "caption": f"{len(rows)} eligible response coordinates "
        f"from {len(data['values'])} source records; "
        "independent-run count unresolved. "
        f"Source: {data['asset']['accession']} {data['asset']['sha256'][:12]}.",
    }
    if spec["response_columns"]:
        plot["transformations"].append(
            {
                "method_id": "named-response-series-view-v1",
                "source_columns": response_columns,
                "combination": "separate_series_no_pooling_or_implicit_synchronization",
            }
        )
    if spec["mark"] in {"categorical_map", "response_surface"}:
        zkey = f"column_{spec['z_column']}"
        observed = {}
        for row in rows:
            key = (row[xkey], row[ykey])
            if key in observed:
                raise ValueError(
                    "A map cell has multiple records; select or explicitly aggregate first."
                )
            if (
                spec["mark"] == "response_surface"
                and row[zkey] is not None
                and not isinstance(row[zkey], (int, float))
            ):
                raise ValueError("Response colors require canonical numeric values.")
            observed[key] = row[zkey] if row[zkey] != "" else None
        xs, ys = (
            list(dict.fromkeys(row[xkey] for row in rows)),
            list(dict.fromkeys(row[ykey] for row in rows)),
        )
        if spec["mark"] == "response_surface":
            xs.sort()
            ys.sort()
        if len(xs) * len(ys) > 10000:
            raise ValueError(
                "The discrete support grid exceeds 10000 cells; select a smaller domain."
            )
        plot["rows"] = [row for row in rows if row[zkey] not in (None, "")]
        plot.update(
            {
                "z": zkey,
                "z_type": "quantitative" if spec["mark"] == "response_surface" else "nominal",
                "z_label": _label(columns[spec["z_column"]], spec["z_unit"]),
                "x_values": xs,
                "y_values": ys,
                "domain_mask": [
                    {
                        "x": x,
                        "y": y,
                        "observed": (x, y) in observed and observed[(x, y)] is not None,
                    }
                    for y in ys
                    for x in xs
                ],
                "support": "exact_observed_coordinate_cells_only",
                "interpolation": "none",
                "prediction": False,
            }
        )
        plot["transformations"].append(
            {"method_id": "observed-grid-mask-v1", "missing_cells": "unobserved_not_zero"}
        )
    if spec["mark"] == "paired":
        pair = f"column_{spec['pair_column']}"
        if any(not isinstance(row[pair], (int, float)) for row in rows if row[pair] is not None):
            raise ValueError("Paired responses require two canonical quantitative fields.")
        first, second = columns[spec["y_column"]]["title"], columns[spec["pair_column"]]["title"]
        complete = [row for row in rows if row[pair] is not None]
        plot.update(
            {
                "x": "paired_field",
                "y": "paired_value",
                "x_type": "nominal",
                "x_label": "Paired response fields",
                "series": None,
                "group": "pair_id",
                "rows": [
                    {
                        **row,
                        "pair_id": f"source-record-{row['source_row']}",
                        "paired_field": label,
                        "paired_value": row[key],
                        "_order": index,
                    }
                    for row in complete
                    for index, (label, key) in enumerate([(first, ykey), (second, pair)])
                ],
            }
        )
        plot["transformations"].append(
            {
                "method_id": "same-source-record-pair-v1",
                "pair_count": len(complete),
                "excluded_incomplete_pairs": len(rows) - len(complete),
                "independence": "unresolved",
            }
        )
    if spec["mark"] == "histogram":
        import numpy as np

        if spec["x_type"] != "quantitative" or series is not None:
            raise ValueError(
                "This histogram requires one quantitative source field "
                "without implicit pooling by series."
            )
        values = [row[xkey] for row in data["values"] if row[xkey] is not None]
        counts, edges = np.histogram(values, bins=spec["histogram_bins"])
        plot.update(
            {
                "x": "bin_start",
                "x2": "bin_end",
                "y": "source_record_count",
                "y_type": "quantitative",
                "y_label": "Source record count (not independent runs)",
                "rows": [
                    {
                        "bin_start": float(edges[index]),
                        "bin_end": float(edges[index + 1]),
                        "source_record_count": int(count),
                    }
                    for index, count in enumerate(counts)
                ]
                if values
                else [],
            }
        )
        plot["transformations"].append(
            {
                "method_id": "numpy-equal-width-histogram-v1",
                "bins": spec["histogram_bins"],
                "closed": "left_inclusive_right_exclusive_except_last",
                "selected_record_count": len(data["values"]),
                "nonmissing_count": len(values),
                "missing_count": len(data["values"]) - len(values),
                "numpy_version": np.__version__,
            }
        )
    if spec["smoothing"] is not None:
        _smooth(plot, spec["smoothing"])
    check_scales(plot)
    return plot


def _label(column: dict, unit: str | None) -> str:
    return column.get("display_title", column["title"]) + (f" [{unit}]" if unit else "")


def _smooth(plot: dict, spec: dict) -> None:
    import numpy as np

    xkey, ykey = plot["x"], plot["y"]
    grouped: dict[str, list[dict]] = {}
    for row in plot["rows"]:
        grouped.setdefault(row["_segment"], []).append(row)
    contiguous: list[list[dict]] = []
    for name, group in grouped.items():
        current: list[dict] = []
        for row in group:
            if current and row[xkey] <= current[-1][xkey]:
                raise ValueError(
                    "Smoothing requires strictly increasing coordinates within each series."
                )
            if current and row[xkey] - current[-1][xkey] > spec["maximum_gap"]:
                contiguous.append(current)
                current = []
            row["_segment"] = f"{name}:gap-{len(contiguous)}"
            current.append(row)
        if current:
            contiguous.append(current)
    half = spec["window_points"] // 2
    for group in contiguous:
        for index, row in enumerate(group):
            valid = index >= half and index + half < len(group)
            window = group[max(0, index - half) : index + half + 1]
            row["smoothed_value"] = float(np.mean([r[ykey] for r in window])) if valid else None
    plot["smoothed_y"] = "smoothed_value"
    plot["transformations"].append(
        {
            **spec,
            "numpy_version": np.__version__,
            "edges": "unavailable_without_full_window",
            "missingness": "never_bridge_missing_records_or_declared_gaps",
            "raw_values_retained": True,
            "scope": "display_overlay_not_measurement_replacement",
        }
    )


def vega_lite(plot: dict) -> dict:
    fields: dict[str, Any] = {
        axis: {
            "field": plot[axis],
            "type": plot[f"{axis}_type"],
            "title": plot[f"{axis}_label"],
            "scale": {"type": plot[f"{axis}_scale"]},
        }
        for axis in ("x", "y")
    }
    for axis in ("x", "y"):
        if plot[f"{axis}_type"] != "quantitative":
            fields[axis].pop("scale", None)
    kind = plot["kind"]
    if plot.get("series"):
        fields["color"] = {"field": plot["series"], "type": "nominal"}
        fields["shape"] = {"field": plot["series"], "type": "nominal"}
    if kind in {"categorical_map", "response_surface"}:
        for axis in ("x", "y"):
            fields[axis]["type"] = "ordinal"
            fields[axis]["sort"] = plot[f"{axis}_values"]
            fields[axis]["scale"] = {"domain": plot[f"{axis}_values"]}
        fields["color"] = {"field": plot["z"], "type": plot["z_type"], "title": plot["z_label"]}
        mark = "rect"
    elif kind == "histogram":
        fields["x"]["bin"] = "binned"
        fields["x2"] = {"field": plot["x2"]}
        mark = "bar"
    elif kind in {"line", "paired", "fit", "track"}:
        fields["detail"] = {"field": plot["group"], "type": "nominal"}
        fields["order"] = {"field": "_order", "type": "quantitative"}
        mark = "line"
    elif kind == "interval":
        mark = "point"
    else:
        mark = "bar" if kind == "bar" else "point"
    fields["tooltip"] = [
        {"field": key, "type": "nominal"}
        for key in dict.fromkeys(
            [
                plot["x"],
                plot["y"],
                "source_row",
                "source_locator",
                "job_id",
                "interval_interpretation",
                "_series",
                "_response_column",
                "split",
                "measurement_status",
            ]
        )
    ]
    layers = [{"mark": mark, "encoding": fields}]
    if kind == "categorical_map":
        layers.append(
            {
                "mark": "text",
                "encoding": {
                    **fields,
                    "text": {"field": plot["z"], "type": "nominal"},
                    "color": {"value": "#151922"},
                },
            }
        )
    if plot.get("fitted_y"):
        layers.append(
            {
                "mark": "line",
                "encoding": {**fields, "y": {**fields["y"], "field": plot["fitted_y"]}},
            }
        )
        layers[0]["mark"] = "point"
    if plot.get("smoothed_y"):
        layers[0]["mark"] = "point"
        layers.append(
            {
                "mark": "line",
                "encoding": {**fields, "y": {**fields["y"], "field": plot["smoothed_y"]}},
            }
        )
    if plot.get("uncertainty_field"):
        layers.append(
            {
                "mark": "errorbar",
                "encoding": {**fields, "yError": {"field": plot["uncertainty_field"]}},
            }
        )
    if plot.get("lower"):
        layers.append(
            {
                "mark": "rule",
                "encoding": {
                    **fields,
                    "y": {**fields["y"], "field": plot["lower"]},
                    "y2": {"field": plot["upper"]},
                },
            }
        )
    return {
        "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
        "title": plot["title"],
        "data": {"values": plot["rows"]},
        **(
            {"mark": layers[0]["mark"], "encoding": fields}
            if len(layers) == 1
            else {"layer": layers}
        ),
    }


def method_plot(spec: dict, records: list[dict]) -> dict:
    """Compile checked stored method outputs, retaining source interval semantics."""
    rows, provenance, units = [], [], set()
    view = spec["view"]
    x_label, y_label = "Time [s]", "Measurement"
    fitted = None
    for record in records:
        if record["kind"] != "registered_analysis" or record["status"] != "succeeded":
            raise ValueError(
                "Method charts require completed registered calculations owned by this browser."
            )
        result = record["result"].get("result", record["result"])
        job_id, status = str(record["id"]), result.get("status")
        provenance.append(
            {
                "job_id": job_id,
                "snapshot_id": record["snapshot_id"],
                "calculation": result,
                "resources": record["result"].get("resources"),
            }
        )
        if status == "descriptive_fit" and view in {"fit", "residual", "interval"}:
            unit = result["unit"] if view == "interval" else result["residual_unit"]
            units.add(unit)
            quantity = {"interval": "Reported slope statistic", "residual": "Residual"}.get(
                view, "Observed response"
            )
            y_label = f"{quantity} [{unit}]"
            if view == "interval":
                interval = result.get("interval")
                if interval is None:
                    raise ValueError(
                        "This source fit has no justified interval; "
                        "its fit and residual views remain available."
                    )
                rows.append(
                    {
                        "x": job_id,
                        "y": result["value"],
                        "lower": interval["lower"],
                        "upper": interval["upper"],
                        "interval_level": interval["level"],
                        "interval_interpretation": interval["interpretation"],
                        "job_id": job_id,
                        "_order": 0,
                    }
                )
                x_label = "Stored descriptive fit"
            else:
                for order, point in enumerate(result["points"]):
                    rows.append(
                        {
                            **point,
                            "x": point["time_seconds"],
                            "y": point["residual" if view == "residual" else "observed"],
                            "job_id": job_id,
                            "_order": order,
                        }
                    )
                if view == "fit":
                    fitted = "fitted"
        elif result.get("method_id") == "prespecified-single-predictor-ols-v1" and view in {
            "residual",
            "observed_predicted",
        }:
            unit = result["request"]["protocol"]["endpoint_unit"]
            units.add(unit)
            x_label, y_label = (
                f"{'Predicted' if view == 'residual' else 'Observed'} [{unit}]",
                f"{'Residual' if view == 'residual' else 'Predicted'} [{unit}]",
            )
            for order, point in enumerate(result["residuals"]):
                rows.append(
                    {
                        **point,
                        "x": point["predicted" if view == "residual" else "observed"],
                        "y": point["residual" if view == "residual" else "predicted"],
                        "job_id": job_id,
                        "_order": order,
                    }
                )
        elif result.get("method_id") == "registered-function-monte-carlo-v1" and view == "interval":
            if not result["converged"]:
                raise ValueError(
                    "The selected Monte Carlo calculation did not converge; "
                    "no qualified interval view is produced."
                )
            units.add(result["unit"])
            interval = result["central_output_interval"]
            rows.append(
                {
                    "x": job_id,
                    "y": result["value"],
                    "lower": interval["lower"],
                    "upper": interval["upper"],
                    "interval_level": interval["level"],
                    "interval_interpretation": interval["interpretation"],
                    "job_id": job_id,
                    "_order": 0,
                }
            )
            x_label, y_label = (
                "Stored uncertainty calculation",
                f"Propagated output [{result['unit']}]",
            )
        elif result.get("method_id") == "explicit-pixel-clock-calibration-v1" and view == "track":
            units.add("m")
            y_label = "Calibrated coordinate or candidate [m]"
            segment = 0
            for order, point in enumerate(result["points"]):
                if point["exclude_reason"] is not None:
                    segment += 1
                else:
                    rows.append(
                        {
                            **point,
                            "x": point["time_seconds"],
                            "y": point["value_metres"],
                            "job_id": job_id,
                            "_order": order,
                            "measurement_status": status,
                            "_segment": f"{job_id}:{segment}",
                        }
                    )
        elif (
            result.get("method_id") == "roi-threshold-boundary-measurement-v1"
            and view == "boundary"
        ):
            units.add("pixel")
            x_label, y_label = "Original frame x [pixel]", "Original frame y [pixel]"
            for order, point in enumerate(result["boundary_pixels"]):
                rows.append(
                    {
                        **point,
                        "job_id": job_id,
                        "_order": order,
                        "source_locator": f"{result['source_sha256']}:frame:"
                        f"{result['selected_frame_index']}",
                        "measurement_status": status,
                    }
                )
        else:
            raise ValueError(
                "The stored method result does not support this chart view; no values are inferred."
            )
    if len(units) != 1:
        raise ValueError(
            "Method comparisons require the same quantity unit; no implicit conversion or pooling."
        )
    if len(rows) > 20000:
        raise ValueError("Select a smaller frozen method result for this interactive plot.")
    plot = {
        "kind": view,
        "title": spec["title"],
        "rows": rows,
        "x": "x",
        "y": "y",
        "x_type": "nominal" if view == "interval" else "quantitative",
        "y_type": "quantitative",
        "x_label": x_label,
        "y_label": y_label,
        "x_scale": spec["x_scale"],
        "y_scale": spec["y_scale"],
        "series": "job_id",
        "group": "_segment" if view == "track" else "job_id",
        "fitted_y": fitted,
        "transformations": [
            {"method_id": "stored-method-chart-v1", "view": view, "recalculation": "none"}
        ],
        "caption": (
            "Stored registered calculations; source assumptions, exclusions, "
            "intervals and limitations are retained. Distinct runs remain distinct series."
        ),
    }
    if view == "interval":
        plot.update({"lower": "lower", "upper": "upper"})
        if spec["x_scale"] == "log":
            raise ValueError("Stored-fit identifiers cannot use a logarithmic axis.")
    check_scales(plot)
    digest = sha256(jobs.canonical_json(provenance)).hexdigest()
    data = {
        "snapshot_id": records[0]["snapshot_id"],
        "asset": {
            "id": "stored-method-chart",
            "sha256": digest,
            "accession": "registered-analysis",
        },
        "columns": [
            {"key": "x", "units": [], "source_index": 0},
            {"key": "y", "units": list(units), "source_index": 1},
        ],
        "values": rows,
        "total_source_records": len(rows),
        "returned_source_records": len(rows),
        "independent_run_count": None,
        "limitations": [
            lim for entry in provenance for lim in entry["calculation"].get("limitations", [])
        ],
    }
    return {
        "spec": spec,
        "plot": plot,
        "vega_lite": vega_lite(plot),
        "data": data,
        "provenance": provenance,
        "snapshot_id": records[0]["snapshot_id"],
        "scientific_origin": "derived",
        "uncertainty_interpretation": "preserved_source_artifact",
        "status": "complete" if rows else "unavailable",
    }


def render_figure(chart: dict, format: str) -> bytes:
    """Render exactly the same transformed values exported in the passive grammar."""
    import io

    import matplotlib
    import numpy as np
    from matplotlib.figure import Figure
    from matplotlib.patches import Patch

    plot = chart["plot"]
    rows = plot["rows"]
    if not rows:
        raise ValueError("A figure requires at least one eligible coordinate pair.")
    with matplotlib.rc_context(
        {
            "svg.hashsalt": sha256(jobs.canonical_json(chart["spec"])).hexdigest(),
            "svg.fonttype": "none",
            "text.usetex": False,
        }
    ):
        figure = Figure(figsize=(8, 5), layout="constrained")
        axes = figure.subplots()
        xkey, ykey, kind = plot["x"], plot["y"], plot["kind"]
        if kind in {"categorical_map", "response_surface"}:
            xs, ys, zkey = plot["x_values"], plot["y_values"], plot["z"]
            labels = list(dict.fromkeys(str(row[zkey]) for row in rows if row[zkey] is not None))
            matrix = np.full((len(ys), len(xs)), np.nan)
            for row in rows:
                if row[zkey] is not None:
                    matrix[ys.index(row[ykey]), xs.index(row[xkey])] = (
                        row[zkey]
                        if plot["z_type"] == "quantitative"
                        else labels.index(str(row[zkey]))
                    )
            colors = ["#2459D3", "#C65A19", "#0B776E", "#7B53BA", "#596779"]
            if plot["z_type"] == "nominal" and len(labels) > 20:
                raise ValueError("A categorical map supports at most twenty outcome labels.")
            palette = (
                matplotlib.colormaps["viridis"].copy()
                if plot["z_type"] == "quantitative"
                else matplotlib.colors.ListedColormap(
                    [colors[i % len(colors)] for i in range(max(1, len(labels)))]
                )
            )
            palette = palette.with_extremes(bad="#eceff3")
            image = axes.imshow(
                np.ma.masked_invalid(matrix),
                origin="lower",
                aspect="auto",
                interpolation="none",
                cmap=palette,
            )
            if plot["z_type"] == "nominal":
                for row in rows:
                    if row[zkey] is not None:
                        axes.text(
                            xs.index(row[xkey]),
                            ys.index(row[ykey]),
                            str(row[zkey]),
                            ha="center",
                            va="center",
                            fontsize=6,
                            bbox={"facecolor": "white", "alpha": 0.8, "edgecolor": "none"},
                        )
            axes.set_xticks(range(len(xs)), [str(x) for x in xs], rotation=45, ha="right")
            axes.set_yticks(range(len(ys)), [str(y) for y in ys])
            if plot["z_type"] == "quantitative":
                figure.colorbar(image, ax=axes, label=plot["z_label"])
            else:
                image.set_clim(-0.5, max(len(labels) - 0.5, 0.5))
                axes.legend(
                    handles=[
                        Patch(color=colors[index % len(colors)], label=label)
                        for index, label in enumerate(labels)
                    ],
                    labels=labels,
                    title=plot["z_label"],
                    loc="upper left",
                    bbox_to_anchor=(1, 1),
                )
            axes.text(
                0,
                1.01,
                "Gray cells: unobserved/unavailable; no interpolation",
                transform=axes.transAxes,
                fontsize=8,
            )
        elif kind == "histogram":
            axes.bar(
                [row[xkey] for row in rows],
                [row[ykey] for row in rows],
                width=[row[plot["x2"]] - row[xkey] for row in rows],
                align="edge",
                edgecolor="white",
                color="#2459D3",
            )
        else:
            grouped: dict[str, list[dict]] = {}
            for row in rows:
                group = str(row.get(plot.get("group") or "", "selected records"))
                grouped.setdefault(group, []).append(row)
            for index, (group, points) in enumerate(grouped.items()):
                color = ["#2459D3", "#C65A19", "#0B776E", "#7B53BA", "#596779"][index % 5]
                label = (
                    str(points[0].get(plot.get("series") or "", group))
                    if plot.get("series")
                    else None
                )
                xv, yv = [r[xkey] for r in points], [r[ykey] for r in points]
                if kind == "interval":
                    axes.scatter(xv, yv, color=color, label=label)
                    axes.vlines(
                        xv,
                        [r[plot["lower"]] for r in points],
                        [r[plot["upper"]] for r in points],
                        color=color,
                    )
                elif kind == "bar":
                    axes.bar(xv, yv, color=color, label=label)
                elif kind in {"line", "paired", "track"} and not plot.get("smoothed_y"):
                    axes.plot(xv, yv, color=color, marker="o", markersize=3, label=label)
                else:
                    axes.scatter(xv, yv, color=color, s=16, label=label)
                for field in (plot.get("fitted_y"), plot.get("smoothed_y")):
                    if field:
                        axes.plot(
                            xv,
                            np.asarray(
                                [
                                    r.get(field) if r.get(field) is not None else np.nan
                                    for r in points
                                ],
                                dtype=float,
                            ),
                            color=color,
                            linestyle="--",
                            label=f"{label or 'selected records'}: {field}",
                        )
                if plot.get("uncertainty_field"):
                    eligible = [r for r in points if r.get(plot["uncertainty_field"]) is not None]
                    axes.errorbar(
                        [r[xkey] for r in eligible],
                        [r[ykey] for r in eligible],
                        yerr=[r[plot["uncertainty_field"]] for r in eligible],
                        fmt="none",
                        color=color,
                    )
            if plot.get("series") or plot.get("smoothed_y"):
                handles, labels = axes.get_legend_handles_labels()
                distinct = dict(zip(labels, handles, strict=True))
                axes.legend(distinct.values(), distinct.keys(), fontsize=7)
            if kind == "residual":
                axes.axhline(0, color="#596779", linestyle=":", linewidth=1)
            if kind == "observed_predicted":
                limits = [
                    min(min(row[xkey], row[ykey]) for row in rows),
                    max(max(row[xkey], row[ykey]) for row in rows),
                ]
                axes.plot(
                    limits, limits, color="#596779", linestyle=":", label="identity reference"
                )
        if kind not in {"categorical_map", "response_surface"}:
            axes.set_xscale(plot["x_scale"])
            axes.set_yscale(plot["y_scale"])
        axes.set_xlabel(plot["x_label"])
        axes.set_ylabel(plot["y_label"])
        axes.set_title(plot["title"], wrap=True)
        caption = plot["caption"]
        if kind == "interval":
            caption += "\n" + "; ".join(
                dict.fromkeys(
                    f"{row['interval_level']:g}: {row['interval_interpretation']}" for row in rows
                )
            )
        figure.supxlabel(caption, fontsize=7, wrap=True)
        output = io.BytesIO()
        metadata = (
            {"Date": None} if format == "svg" else {"CreationDate": None} if format == "pdf" else {}
        )
        figure.savefig(output, format=format, dpi=180, metadata=metadata)
        figure.clear()
    return output.getvalue()


def resolve_method_chart(database_url: str, spec, receipt_sha256: str) -> dict:
    """Resolve only unexpired receipt-owned jobs; the hash is an internal boundary."""
    import re

    from .database import connect

    if re.fullmatch(r"[0-9a-f]{64}", receipt_sha256) is None:
        raise jobs.JobNotFound("The stored calculation is absent or expired.")
    records = []
    with connect(database_url) as connection:
        for identifier in spec.job_ids:
            row = connection.execute(
                """SELECT id,kind,snapshot_id,status,result FROM jobs
                   WHERE id = %s AND receipt_sha256 = %s AND expires_at > now()""",
                (str(identifier), receipt_sha256),
            ).fetchone()
            if not row:
                raise jobs.JobNotFound("The stored calculation is absent or expired.")
            if row["kind"] != "registered_analysis":
                raise ValueError("Only registered scientific calculations support method charts.")
            records.append(row)
    snapshots = {row["snapshot_id"] for row in records}
    if len(snapshots) != 1:
        raise ValueError("Method charts must retain one frozen source snapshot.")
    if any(row["status"] != "succeeded" for row in records):
        return {
            "snapshot_id": records[0]["snapshot_id"],
            "status": "incomplete",
            "dependencies": [
                {"job_id": str(row["id"]), "status": row["status"]} for row in records
            ],
            "reason": (
                "A selected registered calculation has not completed; "
                "no complete figure is published."
            ),
        }
    return method_plot(spec.model_dump(mode="json"), records)

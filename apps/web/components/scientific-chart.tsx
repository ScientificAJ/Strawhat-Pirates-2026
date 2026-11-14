"use client";

import { useEffect, useRef, useState } from "react";
import type { Result, VisualizationSpec } from "vega-embed";
import { ArrowDownToLine, Table2 } from "lucide-react";
import {
  fileDownload,
  readable,
  type QueryResult,
  type ValidatedChart,
} from "../lib/laboratory-api";
import styles from "./laboratory-workbench.module.css";

function passiveGrammar(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(passiveGrammar);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value).every(
    ([key, child]) =>
      !new Set([
        "url",
        "href",
        "expr",
        "expression",
        "calculate",
        "transform",
        "params",
        "selection",
        "usermeta",
      ]).has(key) && passiveGrammar(child),
  );
}
function wrappedCaption(value: string) {
  const lines: string[] = [];
  for (const word of value.split(/\s+/)) {
    if (!word) continue;
    const last = lines.at(-1);
    if (last && last.length + word.length + 1 <= 110)
      lines[lines.length - 1] = last + " " + word;
    else lines.push(word);
  }
  return lines;
}
export function ScientificValues({
  data,
  onSelect,
}: {
  data: QueryResult;
  onSelect?: (row: Record<string, unknown>) => void;
}) {
  const columns = data.columns;
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  useEffect(() => setPage(0), [data]);
  return (
    <section className={styles.stack}>
      {data.truncated && (
        <p className={styles.warning}>
          This explicit query returned a bounded subset of {data.values.length}{" "}
          from {data.total_source_records} source records. Its table, plot and
          exported query values are not the full-resolution original. Select a
          smaller frozen cohort, or use the exact original file in Code for
          full-file computation.
        </p>
      )}
      <div className={styles.actions}>
        <button
          className="button button-small"
          onClick={() =>
            void navigator.clipboard
              .writeText(
                JSON.stringify(
                  {
                    snapshot_id: data.snapshot_id,
                    source: data.asset,
                    columns: data.columns,
                    values: data.values,
                  },
                  null,
                  2,
                ),
              )
              .then(() =>
                setCopyStatus(
                  "Exact selected values, source rows and units copied.",
                ),
              )
              .catch(() =>
                setCopyStatus(
                  "Clipboard unavailable. Use Export values to preserve the same data.",
                ),
              )
          }
        >
          Copy selected source rows
        </button>
        {copyStatus && <span role="status">{copyStatus}</span>}
      </div>
      <div
        className={styles.table}
        tabIndex={0}
        aria-label="Exact exported chart values"
      >
        <table>
          <caption className="visually-hidden">
            Source values with original source-row identifiers. Missing values
            are not zero.
          </caption>
          <thead>
            <tr>
              <th scope="col">Source row</th>
              {columns.map((column) => (
                <th scope="col" key={column.key}>
                  {column.display_title ?? column.title ?? column.key}
                  {column.units.length > 0 && (
                    <small> [{column.units.join(", ")}]</small>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.values.slice(page * 50, (page + 1) * 50).map((row, index) => (
              <tr key={`${readable(row.source_row)}-${index}`}>
                <th scope="row">
                  {onSelect ? (
                    <button
                      onClick={() => onSelect(row)}
                      aria-label={`Select source row ${readable(row.source_row ?? index + 1)}`}
                    >
                      {readable(row.source_row ?? index + 1)}
                    </button>
                  ) : (
                    readable(row.source_row ?? row.source_locator ?? index + 1)
                  )}
                </th>
                {columns.map((column) => (
                  <td key={column.key}>{readable(row[column.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {data.values.length > 50 && (
          <div className={styles.actions}>
            <button
              className="button button-small"
              disabled={page === 0}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous values
            </button>
            <span>
              Values {page * 50 + 1}–
              {Math.min((page + 1) * 50, data.values.length)} of{" "}
              {data.values.length}
            </span>
            <button
              className="button button-small"
              disabled={(page + 1) * 50 >= data.values.length}
              onClick={() => setPage((value) => value + 1)}
            >
              Next values
            </button>
          </div>
        )}
        {data.values.length === 0 && (
          <p className={styles.empty}>
            This explicit selection contains no eligible values. Change its
            filters or retain the empty result in your case.
          </p>
        )}
      </div>
    </section>
  );
}
export function ScientificChart({
  chart,
  onSelect,
  cursor,
}: {
  chart: unknown;
  cursor?: { value: number; label: string };
  onSelect?: (row: Record<string, unknown>) => void;
}) {
  if (
    !chart ||
    typeof chart !== "object" ||
    !("vega_lite" in chart) ||
    !("data" in chart) ||
    !chart.data ||
    typeof chart.data !== "object" ||
    !("columns" in chart.data) ||
    !Array.isArray(chart.data.columns) ||
    !("values" in chart.data) ||
    !Array.isArray(chart.data.values) ||
    !("spec" in chart) ||
    !chart.spec ||
    typeof chart.spec !== "object" ||
    !("title" in chart.spec)
  )
    return (
      <p className={styles.warning}>
        A validated scientific chart and its exact values are required. Inspect
        the retained source result.
      </p>
    );
  return (
    <ScientificChartView
      chart={chart as ValidatedChart}
      onSelect={onSelect}
      cursor={cursor}
    />
  );
}
function ScientificChartView({
  chart,
  onSelect,
  cursor,
}: {
  chart: ValidatedChart;
  cursor?: { value: number; label: string };
  onSelect?: (row: Record<string, unknown>) => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  const current = useRef<Result | null>(null);
  const selectionHandler = useRef(onSelect);
  selectionHandler.current = onSelect;
  const currentCursor = useRef(cursor);
  currentCursor.current = cursor;
  const cursorEnabled = cursor !== undefined;
  const supportsZoom =
    "query" in chart.spec
      ? !["categorical_map", "response_surface", "paired"].includes(
          chart.spec.mark,
        ) &&
        chart.spec.x_type === "quantitative" &&
        chart.spec.y_type === "quantitative"
      : chart.spec.view !== "interval";
  const [themeVersion, setThemeVersion] = useState(0);
  const [presentation, setPresentation] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [figureFormat, setFigureFormat] = useState<"svg" | "png">("svg");
  const [rasterScale, setRasterScale] = useState(2);
  async function exportFigure() {
    try {
      const view = current.current?.view;
      if (!view)
        throw new Error("Validate and render this figure before exporting.");
      if (figureFormat === "svg")
        fileDownload(
          "scientific-figure.svg",
          await view.toSVG(),
          "image/svg+xml",
        );
      else {
        const url = await view.toImageURL("png", rasterScale);
        const response = await fetch(url);
        fileDownload("scientific-figure.png", await response.blob());
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Figure export could not complete. Exact values remain available.",
      );
    }
  }

  useEffect(() => {
    const shell = target.current?.closest(".app-shell");
    if (!shell) return;
    const observer = new MutationObserver(() =>
      setThemeVersion((value) => value + 1),
    );
    observer.observe(shell, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (cursor && current.current)
      void current.current.view
        .data("media_cursor", [{ cursor_value: cursor.value }])
        .runAsync()
        .catch(() =>
          setError(
            "The source cursor could not update; exact timestamps remain visible.",
          ),
        );
  }, [cursor?.value]);
  const [error, setError] = useState<string | null>(null);
  const [table, setTable] = useState(false);
  useEffect(() => {
    let disposed = false;
    setError(null);
    if (!target.current || chart.status !== "complete") return;
    if (!passiveGrammar(chart.vega_lite)) {
      setError(
        "This chart contains unsupported expressions or external data. Validate its source specification again.",
      );
      return;
    }
    const host = target.current;
    const colors = getComputedStyle(host);
    const grammar = { ...chart.vega_lite };
    if (zoom)
      grammar.params = [
        {
          name: "scientific_zoom",
          select: { type: "interval", encodings: ["x", "y"] },
          bind: "scales",
        },
      ];
    grammar.title = {
      text: chart.spec.title,
      subtitle: wrappedCaption(chart.plot?.caption ?? ""),
      subtitleFontSize: presentation ? 13 : 10,
      anchor: "start",
    };
    if (cursorEnabled) {
      const layers = Array.isArray(grammar.layer)
        ? grammar.layer
        : [{ mark: grammar.mark, encoding: grammar.encoding }];
      delete grammar.mark;
      delete grammar.encoding;
      grammar.layer = [
        ...layers,
        {
          data: { name: "media_cursor", values: [] },
          mark: {
            type: "rule",
            color: colors.getPropertyValue("--ember").trim() || "#AE3925",
            strokeDash: [4, 3],
          },
          encoding: { x: { field: "cursor_value", type: "quantitative" } },
        },
      ];
    }
    void import("vega-embed")
      .then(({ default: embed }) =>
        embed(
          host,
          {
            ...grammar,
            width: "container",
            autosize: { type: "fit", contains: "padding" },
            config: {
              font: "Inter Variable, sans-serif",
              background: "transparent",
              title: { fontSize: presentation ? 20 : 14 },
              legend: {
                labelColor:
                  colors.getPropertyValue("--secondary").trim() || "#586273",
                titleColor:
                  colors.getPropertyValue("--ink").trim() || "#151922",
                labelFontSize: presentation ? 15 : 11,
                titleFontSize: presentation ? 16 : 12,
              },
              axis: {
                labelFontSize: presentation ? 15 : 11,
                titleFontSize: presentation ? 17 : 12,
                labelColor:
                  colors.getPropertyValue("--secondary").trim() || "#586273",
                titleColor:
                  colors.getPropertyValue("--ink").trim() || "#151922",
                gridColor:
                  colors.getPropertyValue("--divider").trim() || "#D7DEE8",
              },
              range: {
                category: [
                  "#2459D3",
                  "#C65A19",
                  "#0B776E",
                  "#7B53BA",
                  "#596779",
                ],
              },
            },
          } as VisualizationSpec,
          {
            renderer: "svg",
            actions: false,
            loader: {
              http: async () => {
                throw new Error("External chart HTTP access is disabled.");
              },
              file: async () => {
                throw new Error("External chart file access is disabled.");
              },
              load: async () => {
                throw new Error("External chart data loading is disabled.");
              },
              sanitize: async () => {
                throw new Error("External chart resources are disabled.");
              },
            },
            tooltip: {
              theme: host.closest("[data-theme='dark']") ? "dark" : "light",
            },
          },
        ),
      )
      .then((result) => {
        if (disposed) {
          result.finalize();
          return;
        }
        current.current = result;
        if (cursorEnabled && currentCursor.current)
          void result.view
            .data("media_cursor", [
              { cursor_value: currentCursor.current.value },
            ])
            .runAsync();
        if (selectionHandler.current && !zoom)
          result.view.addEventListener("click", (_event, item) => {
            const datum = item?.datum;
            if (datum && typeof datum === "object")
              selectionHandler.current?.(datum as Record<string, unknown>);
          });
      })
      .catch((reason) => {
        if (!disposed)
          setError(
            reason instanceof Error
              ? reason.message
              : "Chart rendering failed. Exact values remain available below.",
          );
      });
    return () => {
      disposed = true;
      current.current?.finalize();
      current.current = null;
      host.replaceChildren();
    };
  }, [chart, cursorEnabled, themeVersion, presentation, zoom, resetVersion]);
  return (
    <section aria-label={chart.spec.title} className={styles.stack}>
      <div className={styles.row}>
        <h3>{chart.spec.title}</h3>
        <span className={styles.badge}>
          {chart.status === "complete"
            ? "Source-linked calculation"
            : "Unavailable result"}
        </span>
      </div>
      {chart.status !== "complete" ? (
        <p className={styles.warning}>
          No eligible plotted result is available. The selected data and
          missingness are retained.
        </p>
      ) : error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : (
        <div
          ref={target}
          className={styles.figure}
          role="img"
          aria-label={`${chart.spec.title}. Exact values and source identifiers are available in the table below.`}
        />
      )}
      <p className={styles.caption}>
        {cursor && (
          <span>
            {cursor.label} · {cursor.value}. This cursor is a source-clock
            annotation, not an added observation.{" "}
          </span>
        )}
        {chart.plot?.caption}{" "}
        {chart.uncertainty_interpretation &&
          `Uncertainty: ${chart.uncertainty_interpretation.replaceAll("_", " ")}.`}
      </p>
      <div className={styles.actions}>
        <button
          className="button button-small"
          onClick={() => setPresentation((value) => !value)}
        >
          {presentation ? "Standard view" : "Presentation view"}
        </button>
        <button
          className="button button-small"
          onClick={() => {
            setZoom(false);
            setResetVersion((value) => value + 1);
          }}
        >
          Reset view
        </button>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={zoom}
            onChange={(event) => setZoom(event.target.checked)}
          />
          Zoom and pan changes the view, never the analytical cohort
        </label>
        <button
          className="button button-small"
          onClick={() => setTable(!table)}
          aria-expanded={table}
        >
          <Table2 size={15} />
          {table ? "Hide exact values" : "Inspect exact values"}
        </button>
        <button
          className="button button-small"
          onClick={() =>
            fileDownload(
              "chart-values.json",
              JSON.stringify(chart.data, null, 2),
            )
          }
        >
          <ArrowDownToLine size={15} />
          Export values
        </button>
        <button
          className="button button-small"
          onClick={() =>
            fileDownload(
              "chart-specification.json",
              JSON.stringify(chart.spec, null, 2),
            )
          }
        >
          Export specification
        </button>
      </div>
      <div className={styles.actions}>
        <label className={styles.field}>
          Publication figure format
          <select
            value={figureFormat}
            onChange={(event) =>
              setFigureFormat(event.target.value as "svg" | "png")
            }
          >
            <option value="svg">SVG vector</option>
            <option value="png">PNG raster</option>
          </select>
        </label>
        {figureFormat === "png" && (
          <label className={styles.field}>
            Raster resolution scale
            <select
              value={rasterScale}
              onChange={(event) => setRasterScale(Number(event.target.value))}
            >
              {[1, 2, 4].map((value) => (
                <option key={value} value={value}>
                  {value}× current figure pixels
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="button button-small"
          disabled={chart.status !== "complete"}
          onClick={exportFigure}
        >
          Export figure with caption and sources
        </button>
      </div>
      {table && <ScientificValues data={chart.data} onSelect={onSelect} />}
      <details className={styles.details}>
        <summary>Source, transformations and uncertainty</summary>
        <dl>
          <dt>Snapshot</dt>
          <dd className="mono hash-value">{chart.data.snapshot_id}</dd>
          <dt>Source</dt>
          <dd>
            {chart.data.asset.accession} · {chart.data.asset.sha256}
          </dd>
          <dt>Source records</dt>
          <dd>
            {chart.data.total_source_records}; independent experimental runs:{" "}
            {chart.data.independent_run_count ?? "not established"}
          </dd>
        </dl>
        {chart.data.limitations?.map((limit, index) => (
          <p key={index}>{limit}</p>
        ))}
        <pre>
          {JSON.stringify(
            {
              transformations: chart.plot?.transformations,
              uncertainty: chart.uncertainty_details,
              provenance: chart.provenance,
              domain_mask: chart.plot?.domain_mask,
            },
            null,
            2,
          )}
        </pre>
      </details>
    </section>
  );
}

"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  Filter,
  Save,
  Plus,
  ArrowDownToLine,
  ChartNoAxesCombined,
} from "lucide-react";
import type { Asset, Catalog, Dossier, ScientificRecords } from "../lib/api";
import { request, useResource } from "../lib/api";
import {
  chartDefaults,
  fileDownload,
  message,
  post,
  queryDefaults,
  readable,
  type ChartSpec,
  type QueryResult,
  type QuerySpec,
  type ValidatedChart,
} from "../lib/laboratory-api";
import { useResearchContext } from "../lib/research-context";
import { useWorkspacePreferences } from "../lib/workspace-preferences";
import { listDocuments, saveDocument } from "../lib/workspace-documents";
import { ScientificChart, ScientificValues } from "./scientific-chart";
import { ScientificRecordView } from "./scientific-records";
import { RawTable } from "./catalog";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";

type Operation = {
  id: string;
  enabled: boolean;
  query: QuerySpec;
  label: string;
};
export function DatasetWorkbench({
  snapshotId,
  onInput,
  onChart,
}: {
  snapshotId: string;
  onInput?: (asset: Asset) => void;
  onChart?: (chart: ValidatedChart) => void;
}) {
  const { context, updateContext } = useResearchContext();
  const catalog = useResource<Catalog>("/v1/investigations?limit=100");
  const [accession, setAccession] = useState("PSI-99");
  const dossier = useResource<Dossier>(
    `/v1/investigations/${accession}?snapshot_id=${snapshotId}`,
  );
  const [assetId, setAssetId] = useState("");
  const assets =
    dossier.data?.assets.filter((asset) => asset.media_type === "text/csv") ??
    [];
  const asset = assets.find((asset) => asset.sha256 === assetId) ?? assets[0];
  const records = useResource<ScientificRecords>(
    asset
      ? `/v1/assets/${asset.sha256}/records?snapshot_id=${snapshotId}&limit=30`
      : null,
  );
  const preferences = useWorkspacePreferences();
  const [columns, setColumns] = useState<number[]>([]);
  const [rows, setRows] = useState("");
  const [representation, setRepresentation] = useState<
    "canonical" | "original"
  >("canonical");
  const [filterColumn, setFilterColumn] = useState(0);
  const [filterValue, setFilterValue] = useState("");
  const [filters, setFilters] = useState<QuerySpec["filters"]>([]);
  const [group, setGroup] = useState("");
  const [aggregate, setAggregate] = useState("none");
  const [tab, setTab] = useState("table");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [chart, setChart] = useState<ValidatedChart | null>(null);
  const [spec, setSpec] = useState<ChartSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [notice, setNotice] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  useEffect(() => {
    setColumns([]);
    setResult(null);
    setSpec(null);
    setChart(null);
    setFilters([]);
    setOperations([]);
    setAssetId("");
  }, [accession]);
  useEffect(() => {
    if (records.data) {
      const numeric =
        records.data.records[0]?.fields
          .filter((field) => field.canonical_value !== null)
          .map((field) => field.column_index) ?? [];
      setColumns(numeric.slice(0, 2));
    }
  }, [records.data]);
  useEffect(() => {
    setRepresentation(preferences.units === "si" ? "canonical" : "original");
    setStale(true);
  }, [preferences.units]);
  const changed = () => setStale(true);
  const currentQuery = useCallback(() => {
    if (!asset) throw new Error("Select a retained dataset first.");
    if (!columns.length)
      throw new Error("Select one or more source variables.");
    let selected: number[] | null = null;
    if (rows.trim()) {
      selected = rows.split(",").map((text) => Number(text.trim()));
      if (selected.some((value) => !Number.isInteger(value) || value < 1))
        throw new Error(
          "Source rows require comma-separated positive physical row numbers.",
        );
    }
    const query = queryDefaults(snapshotId, asset.sha256, columns);
    return {
      ...query,
      source_rows: selected,
      representation,
      filters: filters ?? [],
      group_by: group ? [Number(group)] : [],
      aggregations:
        aggregate === "none"
          ? []
          : columns
              .filter((index) => index !== Number(group || -1))
              .map((column) => ({
                column,
                method: aggregate as
                  "mean" | "minimum" | "maximum" | "sum" | "standard_deviation",
              })),
    };
  }, [
    asset,
    columns,
    rows,
    snapshotId,
    representation,
    filters,
    group,
    aggregate,
  ]);
  async function execute(query?: QuerySpec) {
    setBusy(true);
    setError(null);
    try {
      const selection = query ?? currentQuery();
      const data = await post<QueryResult>("/v1/queries", selection);
      setResult(data);
      if (asset)
        updateContext({
          snapshot_id: snapshotId,
          investigations: [asset.accession],
          selected_sources: [
            {
              asset_sha256: asset.sha256,
              accession: asset.accession,
              asset_id: asset.id,
              source_rows: selection.source_rows ?? [],
              columns: selection.columns,
            },
          ],
          focused_view: { kind: "query", spec: { ...selection } },
        });
      setChart(null);
      setSpec({
        ...chartDefaults(selection),
        x_unit:
          data.columns.find(
            (column) => column.source_index === selection.columns[0],
          )?.units[0] ?? null,
        y_unit:
          data.columns.find(
            (column) =>
              column.source_index ===
              (selection.columns[1] ?? selection.columns[0]),
          )?.units[0] ?? null,
      });
      setStale(false);
      if (!query)
        setOperations((previous) => [
          ...previous,
          {
            id: crypto.randomUUID(),
            enabled: true,
            query: selection,
            label: `${aggregate === "none" ? "Select source records" : aggregate.replaceAll("_", " ")} · ${data.returned_source_records} records`,
          },
        ]);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function render() {
    if (!spec) return;
    setBusy(true);
    setError(null);
    try {
      const value = await post<ValidatedChart>("/v1/charts/validate", spec);
      setChart(value);
      setSpec(value.spec as ChartSpec);
      onChart?.(value);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      const query = currentQuery();
      await saveDocument({
        kind: "analysis",
        title: spec?.title ?? `${accession} source selection`,
        snapshot_id: snapshotId,
        data: { query, chart_spec: spec, chart, result, operations },
      });
      setNotice("Saved to this browser with frozen source references.");
    } catch (reason) {
      setError(message(reason));
    }
  }
  const chartCurrent = Boolean(
    chart && spec && JSON.stringify(chart.spec) === JSON.stringify(spec),
  );
  async function exportSelection(
    format: "bundle" | "csv" | "parquet" | "svg" | "png" | "pdf",
  ) {
    if (!result || stale) return;
    try {
      const created = await post<{ id: string }>("/v1/exports", {
        selection: {
          schema_version: 1,
          snapshot_id: snapshotId,
          case_id: crypto.randomUUID(),
          revision: 1,
          question: spec?.title ?? "Selected source data",
          queries: [currentQuery()],
          charts:
            format === "csv" || format === "parquet"
              ? []
              : chart
                ? [chart.spec]
                : [],
          limitations: result.limitations?.length
            ? result.limitations
            : ["Independent experimental runs are not established."],
          format,
          include_original_bytes: false,
        },
        confirmed_selected_private_data: true,
      });
      setExportId(created.id);
    } catch (reason) {
      setError(message(reason));
    }
  }
  const field = (index: number) =>
    records.data?.records[0]?.fields.find(
      (field) => field.column_index === index,
    );
  const selectedAsset = asset;
  return (
    <div className={styles.workbench}>
      <div className={styles.split}>
        <aside className={styles.aside}>
          <label className={styles.field}>
            Investigation
            <select
              value={accession}
              onChange={(event) => setAccession(event.target.value)}
            >
              {catalog.data?.items.map((item) => (
                <option key={item.accession} value={item.accession}>
                  {item.acronym || item.accession} · {item.accession}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            Dataset
            <select
              value={asset?.sha256 ?? ""}
              onChange={(event) => {
                setAssetId(event.target.value);
                setResult(null);
                changed();
              }}
            >
              {assets.map((item) => (
                <option key={item.id} value={item.sha256}>
                  {item.file_name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.variables}>
            <h2>Variables</h2>
            {records.loading ? (
              <div className={styles.skeleton} />
            ) : (
              records.data?.headers.map((name, index) => {
                const variable = field(index);
                return (
                  <div className={styles.variable} key={index}>
                    <label>
                      <input
                        type="checkbox"
                        checked={columns.includes(index)}
                        onChange={(event) => {
                          setColumns((previous) =>
                            event.target.checked
                              ? [...previous, index]
                              : previous.filter((value) => value !== index),
                          );
                          changed();
                        }}
                      />
                      {name || `Column ${index + 1}`}
                    </label>
                    <small>
                      {variable?.quantity_kind?.replaceAll("_", " ") ??
                        "Source text"}{" "}
                      ·{" "}
                      {representation === "canonical"
                        ? (variable?.canonical_unit ?? "unit unresolved")
                        : (variable?.original_unit ??
                          "source unit not reported")}
                    </small>
                    <small>
                      {variable?.missing_reason
                        ? `Missing: ${variable.missing_reason}`
                        : (variable?.qualifier ?? variable?.status)}
                    </small>
                  </div>
                );
              })
            )}
          </div>
        </aside>
        <div className={styles.stack}>
          <section className={styles.surface}>
            <div className={styles.row}>
              <div>
                <h2>{asset?.file_name ?? "Choose a retained dataset"}</h2>
                <p className={styles.caption}>
                  Snapshot {snapshotId.slice(0, 16)} · original and normalized
                  values remain separate.
                </p>
              </div>
              {asset && (
                <button
                  className="button button-small"
                  onClick={() => onInput?.(asset)}
                >
                  <Plus size={14} />
                  Use as execution input
                </button>
              )}
            </div>
            <div className={styles.summary}>
              <span>
                Source records{" "}
                <strong>
                  {result?.total_source_records ??
                    records.data?.source_record_count ??
                    "—"}
                </strong>
              </span>
              <span>
                Independent runs{" "}
                <strong>
                  {result?.independent_run_count ?? "not established"}
                </strong>
              </span>
              {stale && (
                <strong className={styles.warning}>
                  Inputs changed — recalculate
                </strong>
              )}
            </div>
            <nav className={styles.tabs} aria-label="Dataset workspace">
              {["table", "charts", "quality", "original"].map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </nav>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void execute();
              }}
              className={styles.fields}
            >
              <label className={styles.field}>
                Value representation
                <select
                  aria-label="Value representation"
                  value={representation}
                  onChange={(event) => {
                    setRepresentation(
                      event.target.value as "original" | "canonical",
                    );
                    changed();
                  }}
                >
                  <option value="canonical">Reviewed canonical values</option>
                  <option value="original">Original source text</option>
                </select>
              </label>
              <label className={styles.field}>
                Physical source rows
                <input
                  value={rows}
                  onChange={(event) => {
                    setRows(event.target.value);
                    changed();
                  }}
                  placeholder="All records, or 2, 3, 4"
                />
              </label>
              <label className={styles.field}>
                Group records by
                <select
                  value={group}
                  onChange={(event) => {
                    setGroup(event.target.value);
                    changed();
                  }}
                >
                  <option value="">No grouping</option>
                  {columns.map((index) => (
                    <option value={index} key={index}>
                      {records.data?.headers[index]}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                Summary operation
                <select
                  value={aggregate}
                  onChange={(event) => {
                    setAggregate(event.target.value);
                    changed();
                  }}
                >
                  {[
                    "none",
                    "mean",
                    "minimum",
                    "maximum",
                    "sum",
                    "standard_deviation",
                  ].map((value) => (
                    <option value={value} key={value}>
                      {value === "none"
                        ? "Preserve individual records"
                        : value.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <div className={`${styles.inline} ${styles.full}`}>
                <label className={styles.field}>
                  Filter variable
                  <select
                    value={filterColumn}
                    onChange={(event) =>
                      setFilterColumn(Number(event.target.value))
                    }
                  >
                    {records.data?.headers.map((name, index) => (
                      <option key={index} value={index}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Exact original value
                  <input
                    value={filterValue}
                    onChange={(event) => setFilterValue(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    setFilters((previous) => [
                      ...(previous ?? []),
                      {
                        column: filterColumn,
                        operation: "equals",
                        value: filterValue,
                        representation: "original",
                      },
                    ]);
                    changed();
                  }}
                >
                  <Filter size={14} />
                  Add filter
                </button>
              </div>
              {(filters ?? []).map((filter, index) => (
                <div className={styles.row} key={index}>
                  <span>
                    {records.data?.headers[filter.column]} ={" "}
                    {readable(filter.value)}
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setFilters((previous) =>
                        previous?.filter((_, item) => item !== index),
                      );
                      changed();
                    }}
                  >
                    Remove filter
                  </button>
                </div>
              ))}
              <div className={`${styles.actions} ${styles.full}`}>
                <button
                  type="submit"
                  disabled={busy || !asset || records.loading}
                  className="button button-primary"
                >
                  {busy ? "Computing selected values…" : "Apply selection"}
                </button>
                <button type="button" className="button" onClick={save}>
                  <Save size={15} />
                  Save analysis
                </button>
              </div>
            </form>
            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className={styles.status} role="status">
                <Check size={15} /> {notice}
              </p>
            )}
          </section>
          {tab === "original" && selectedAsset && (
            <RawTable asset={selectedAsset} snapshotId={snapshotId} />
          )}{" "}
          {tab === "quality" && selectedAsset && (
            <ScientificRecordView
              asset={selectedAsset}
              snapshotId={snapshotId}
              quality
              onOriginal={() => setTab("original")}
            />
          )}
          {tab === "table" &&
            (result ? (
              <>
                <ScientificValues data={result} />
                <div className={styles.actions}>
                  <button
                    className="button"
                    disabled={stale}
                    onClick={() => exportSelection("csv")}
                  >
                    Export CSV
                  </button>
                  <button
                    className="button"
                    disabled={stale}
                    onClick={() => exportSelection("parquet")}
                  >
                    Export Parquet
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                <h3>Inspect a frozen source selection</h3>
                <p>
                  Select variables and apply your filters. Unknown quantities
                  remain unavailable; source rows are not assumed to be
                  independent runs.
                </p>
              </div>
            ))}
          {tab === "charts" && spec && (
            <section className={styles.surface}>
              <h2>Scientific chart</h2>
              <div className={styles.fields}>
                <label className={`${styles.field} ${styles.full}`}>
                  Figure title
                  <input
                    value={spec.title}
                    onChange={(event) =>
                      setSpec({ ...spec, title: event.target.value })
                    }
                  />
                </label>
                <label className={`${styles.field} ${styles.full}`}>
                  Caption / applicability note
                  <textarea
                    value={spec.caption}
                    maxLength={500}
                    onChange={(event) =>
                      setSpec({ ...spec, caption: event.target.value })
                    }
                  />
                  <small>
                    Interpretive note retained with this figure; source values
                    and qualifications remain separate.
                  </small>
                </label>
                <label className={styles.field}>
                  Chart family
                  <select
                    value={spec.mark}
                    onChange={(event) =>
                      setSpec({
                        ...spec,
                        mark: event.target.value as ChartSpec["mark"],
                        z_column: [
                          "categorical_map",
                          "response_surface",
                        ].includes(event.target.value)
                          ? (columns[2] ?? null)
                          : null,
                        pair_column:
                          event.target.value === "paired"
                            ? (columns[2] ?? null)
                            : null,
                      })
                    }
                  >
                    {[
                      "point",
                      "line",
                      "bar",
                      "histogram",
                      "categorical_map",
                      "paired",
                      "response_surface",
                    ].map((mark) => (
                      <option key={mark} value={mark}>
                        {mark.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </label>
                {(["x", "y"] as const).map((axis) => (
                  <div key={axis} className={styles.fields}>
                    <label className={styles.field}>
                      {axis.toUpperCase()} variable
                      <select
                        value={spec[`${axis}_column`]}
                        onChange={(event) => {
                          const index = Number(event.target.value);
                          setSpec({
                            ...spec,
                            [`${axis}_column`]: index,
                            [`${axis}_unit`]:
                              result?.columns.find(
                                (column) => column.source_index === index,
                              )?.units[0] ?? null,
                          });
                        }}
                      >
                        {columns.map((index) => (
                          <option key={index} value={index}>
                            {records.data?.headers[index]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      Field meaning
                      <select
                        value={spec[`${axis}_type`]}
                        onChange={(event) =>
                          setSpec({
                            ...spec,
                            [`${axis}_type`]: event.target.value,
                          })
                        }
                      >
                        <option value="quantitative">Quantity</option>
                        <option value="nominal">Category</option>
                        <option value="ordinal">Ordered category</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      Scale
                      <select
                        value={spec[`${axis}_scale`]}
                        onChange={(event) =>
                          setSpec({
                            ...spec,
                            [`${axis}_scale`]: event.target.value,
                          })
                        }
                      >
                        <option value="linear">Linear</option>
                        <option value="log">Logarithmic</option>
                      </select>
                    </label>
                  </div>
                ))}
                {["categorical_map", "response_surface", "paired"].includes(
                  spec.mark,
                ) && (
                  <label className={styles.field}>
                    {spec.mark === "paired"
                      ? "Paired response"
                      : "Outcome / response color"}
                    <select
                      value={
                        spec.mark === "paired"
                          ? (spec.pair_column ?? "")
                          : (spec.z_column ?? "")
                      }
                      onChange={(event) => {
                        const index = Number(event.target.value);
                        setSpec({
                          ...spec,
                          [spec.mark === "paired" ? "pair_column" : "z_column"]:
                            index,
                          z_unit:
                            result?.columns.find(
                              (column) => column.source_index === index,
                            )?.units[0] ?? null,
                        });
                      }}
                    >
                      <option value="">Select explicitly</option>
                      {columns.map((index) => (
                        <option key={index} value={index}>
                          {records.data?.headers[index]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {spec.mark === "histogram" && (
                  <label className={styles.field}>
                    Number of exact-width bins
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={spec.histogram_bins}
                      onChange={(event) =>
                        setSpec({
                          ...spec,
                          histogram_bins: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                )}
                {spec.mark === "line" && (
                  <>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={Boolean(spec.smoothing)}
                        onChange={(event) =>
                          setSpec({
                            ...spec,
                            smoothing: event.target.checked
                              ? {
                                  method_id: "centered-moving-average-v1",
                                  window_points: 3,
                                  maximum_gap: 1,
                                  justification: "",
                                }
                              : null,
                          })
                        }
                      />
                      Display a smoothing overlay; retain raw points
                    </label>
                    {spec.smoothing && (
                      <>
                        <label className={styles.field}>
                          Window size (odd points)
                          <input
                            type="number"
                            min={3}
                            max={101}
                            step={2}
                            value={spec.smoothing.window_points}
                            onChange={(event) =>
                              setSpec({
                                ...spec,
                                smoothing: {
                                  ...spec.smoothing!,
                                  window_points: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className={styles.field}>
                          Maximum gap in x-axis units
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={spec.smoothing.maximum_gap}
                            onChange={(event) =>
                              setSpec({
                                ...spec,
                                smoothing: {
                                  ...spec.smoothing!,
                                  maximum_gap: Number(event.target.value),
                                },
                              })
                            }
                          />
                        </label>
                        <label className={`${styles.field} ${styles.full}`}>
                          Smoothing justification
                          <input
                            value={spec.smoothing.justification}
                            onChange={(event) =>
                              setSpec({
                                ...spec,
                                smoothing: {
                                  ...spec.smoothing!,
                                  justification: event.target.value,
                                },
                              })
                            }
                          />
                        </label>
                      </>
                    )}
                  </>
                )}
              </div>
              {["point", "line"].includes(spec.mark) &&
                columns.some(
                  (index) => index !== spec.x_column && index !== spec.y_column,
                ) && (
                  <fieldset className={styles.stack}>
                    <legend>Additional compatible response channels</legend>
                    {columns
                      .filter(
                        (index) =>
                          index !== spec.x_column && index !== spec.y_column,
                      )
                      .map((index) => (
                        <label key={index} className={styles.check}>
                          <input
                            type="checkbox"
                            checked={
                              spec.response_columns?.includes(index) ?? false
                            }
                            onChange={(event) =>
                              setSpec({
                                ...spec,
                                response_columns: event.target.checked
                                  ? [...(spec.response_columns ?? []), index]
                                  : (spec.response_columns ?? []).filter(
                                      (value) => value !== index,
                                    ),
                                uncertainty: "not_available",
                                uncertainty_provenance: null,
                              })
                            }
                          />
                          {records.data?.headers[index]} · separate source
                          series; no automatic synchronization
                        </label>
                      ))}
                  </fieldset>
                )}
              {spec.query.aggregations?.some(
                (item) =>
                  item.column === spec.y_column && item.method === "mean",
              ) && (
                <div className={styles.stack}>
                  <label className={styles.check}>
                    <input
                      type="checkbox"
                      checked={spec.uncertainty === "standard_deviation"}
                      onChange={(event) =>
                        setSpec({
                          ...spec,
                          uncertainty: event.target.checked
                            ? "standard_deviation"
                            : "not_available",
                          uncertainty_provenance: event.target.checked
                            ? {
                                method_id: "source-record-summary-v1",
                                unit: spec.y_unit ?? "",
                                justification: "",
                              }
                            : null,
                          response_columns: [],
                        })
                      }
                    />
                    Show source-record sample standard deviation around this
                    grouped mean. This is dispersion, not measurement error or a
                    confidence interval.
                  </label>
                  {spec.uncertainty_provenance && (
                    <label className={styles.field}>
                      Uncertainty calculation justification
                      <input
                        value={spec.uncertainty_provenance.justification}
                        onChange={(event) =>
                          setSpec({
                            ...spec,
                            uncertainty_provenance: {
                              ...spec.uncertainty_provenance!,
                              justification: event.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  )}
                </div>
              )}
              {chart && !chartCurrent && (
                <p className={styles.warning}>
                  Chart settings changed. Validate again before exporting this
                  figure.
                </p>
              )}
              {representation === "original" && (
                <p className={styles.caption}>
                  Original cells retain their exact text. Select reviewed
                  canonical values above before plotting quantitative axes;
                  unsupported numeric interpretations remain unavailable.
                </p>
              )}
              <div className={styles.actions}>
                <button
                  className="button button-primary"
                  disabled={busy || stale}
                  onClick={render}
                >
                  <ChartNoAxesCombined size={16} />
                  Validate and draw
                </button>
                {["svg", "pdf", "png", "bundle"].map((format) => (
                  <button
                    key={format}
                    className="button button-small"
                    disabled={!chartCurrent || stale}
                    onClick={() =>
                      exportSelection(
                        format as "svg" | "pdf" | "png" | "bundle",
                      )
                    }
                  >
                    <ArrowDownToLine size={14} />
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
              {chart && <ScientificChart chart={chart} />}
            </section>
          )}
          {operations.length > 0 && (
            <details className={styles.details}>
              <summary>
                Ordered transformation history ({operations.length})
              </summary>
              <ol>
                {operations.map((operation, index) => (
                  <li key={operation.id}>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={operation.enabled}
                        onChange={(event) => {
                          setOperations((previous) =>
                            previous.map((item) =>
                              item.id === operation.id
                                ? { ...item, enabled: event.target.checked }
                                : item,
                            ),
                          );
                          setStale(true);
                          setNotice(
                            "Transformation changed; dependent results are stale until recalculated.",
                          );
                        }}
                      />
                      {index + 1}. {operation.label}
                    </label>
                    <div className={styles.actions}>
                      <button
                        className="text-button"
                        onClick={() => void execute(operation.query)}
                      >
                        Inspect / rerun operation
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          setOperations((previous) => [
                            ...previous,
                            {
                              ...operation,
                              id: crypto.randomUUID(),
                              label: operation.label + " (branch)",
                            },
                          ])
                        }
                      >
                        Duplicate / branch
                      </button>
                      <button
                        className="text-button"
                        onClick={() =>
                          fileDownload(
                            "transformation.json",
                            JSON.stringify(operation, null, 2),
                          )
                        }
                      >
                        Export operation
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
          {exportId && <JobMonitor id={exportId} />}
        </div>
      </div>
    </div>
  );
}

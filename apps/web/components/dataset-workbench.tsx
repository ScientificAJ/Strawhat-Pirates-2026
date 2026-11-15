"use client";
import { isInvestigationId } from "../lib/investigation-identifiers";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Filter,
  Save,
  Plus,
  ArrowDownToLine,
  ChartNoAxesCombined,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
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
import {
  listDocuments,
  readDocument,
  saveDocument,
} from "../lib/workspace-documents";
import { ScientificChart, ScientificValues } from "./scientific-chart";
import { ScientificRecordView } from "./scientific-records";
import { RawTable } from "./catalog";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";
import {
  assetSourceLabel,
  isPublishedTranscription,
} from "../lib/source-description";

type Operation = {
  id: string;
  enabled: boolean;
  query: QuerySpec;
  label: string;
};
export function DatasetWorkbench({
  snapshotId,
  entityId,
  onInput,
  onChart,
}: {
  snapshotId: string;
  entityId?: string;
  onInput?: (asset: Asset) => void;
  onChart?: (chart: ValidatedChart) => void;
}) {
  const { context, updateContext } = useResearchContext();
  const catalog = useResource<Catalog>(
    `/v1/investigations?limit=100&snapshot_id=${snapshotId}`,
  );
  const [accession, setAccession] = useState(
    isInvestigationId(entityId)
      ? entityId!
      : (context?.investigations?.[0] ?? ""),
  );
  const [savedId, setSavedId] = useState<string>();
  const [savedRevision, setSavedRevision] = useState<number>();
  const [restored, setRestored] = useState<{
    query: QuerySpec;
    result?: QueryResult;
    chart_spec?: ChartSpec;
    chart?: ValidatedChart;
    operations?: Operation[];
    applied_query?: QuerySpec;
    stale?: boolean;
  } | null>(null);
  const restoredOnce = useRef("");
  const initializedSource = useRef("");
  const draftVersion = useRef(0);
  const querySequence = useRef(0);
  const pendingQuery = useRef<AbortController | null>(null);
  const [appliedQuery, setAppliedQuery] = useState<QuerySpec | null>(null);
  const [opening, setOpening] = useState(
    Boolean(entityId && !isInvestigationId(entityId)),
  );
  const directHash = /^[a-f0-9]{64}$/.test(entityId ?? "")
    ? entityId
    : undefined;
  const dossier = useResource<Dossier>(
    accession
      ? `/v1/investigations/${accession}?snapshot_id=${snapshotId}`
      : null,
  );
  const [assetId, setAssetId] = useState("");
  const assets =
    dossier.data?.assets.filter((asset) => asset.media_type === "text/csv") ??
    [];
  const desiredHash = assetId || restored?.query.asset_sha256 || directHash;
  const asset =
    assets.find((asset) => asset.sha256 === desiredHash) ?? assets[0];
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
  const currentSpec = useRef(spec);
  currentSpec.current = spec;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [notice, setNotice] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  useEffect(() => {
    if (!entityId || isInvestigationId(entityId)) {
      setOpening(false);
      return;
    }
    let active = true;
    void (async () => {
      try {
        let query: QuerySpec | undefined;
        if (!directHash) {
          const document =
            await readDocument<NonNullable<typeof restored>>(entityId);
          if (!document || !document.data.query)
            throw new Error(
              "This saved dataset could not be opened. Choose an investigation to start a new selection.",
            );
          if (document.snapshot_id !== snapshotId)
            throw new Error(
              "This analysis uses a different source version. Reopen it from Your research to use its original sources.",
            );
          if (!active) return;
          setSavedId(document.id);
          setSavedRevision(document.revision);
          setRestored(document.data);
          query = document.data.query;
        }
        const source = await request<ScientificRecords>(
          `/v1/assets/${directHash ?? query!.asset_sha256}/records?snapshot_id=${snapshotId}&limit=1`,
        );
        if (active) setAccession(source.asset.accession);
      } catch (reason) {
        if (active) setError(message(reason));
      } finally {
        if (active) setOpening(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [entityId, directHash, snapshotId]);
  useEffect(() => {
    setColumns([]);
    setResult(null);
    setAppliedQuery(null);
    setSpec(null);
    setChart(null);
    setFilters([]);
    setOperations([]);
    setAssetId("");
  }, [accession]);
  useEffect(() => {
    draftVersion.current += 1;
    querySequence.current += 1;
    pendingQuery.current?.abort();
    initializedSource.current = "";
    setColumns([]);
    setRows("");
    setGroup("");
    setAggregate("none");
    setFilters([]);
    setResult(null);
    setAppliedQuery(null);
    setSpec(null);
    setChart(null);
    setOperations([]);
    setExportId(null);
    setBusy(false);
    return () => {
      querySequence.current += 1;
      pendingQuery.current?.abort();
    };
  }, [accession, asset?.sha256, snapshotId]);
  useEffect(() => {
    if (records.data && records.data.asset.sha256 === asset?.sha256) {
      if (
        restored &&
        records.data.asset.sha256 === restored.query.asset_sha256 &&
        restoredOnce.current !== savedId
      ) {
        const query = restored.query;
        restoredOnce.current = savedId ?? "";
        setColumns(query.columns);
        setRows(query.source_rows?.join(", ") ?? "");
        setRepresentation(query.representation);
        setFilters(query.filters ?? []);
        setGroup(
          query.group_by?.[0] === undefined ? "" : String(query.group_by[0]),
        );
        setAggregate(query.aggregations?.[0]?.method ?? "none");
        setResult(restored.result ?? null);
        setSpec(restored.chart_spec ?? null);
        setChart(restored.chart ?? null);
        setOperations(restored.operations ?? []);
        setAppliedQuery(restored.applied_query ?? restored.query);
        setStale(restored.stale ?? false);
        initializedSource.current = records.data.asset.sha256;
        setNotice(
          "Saved analysis reopened with its original source selection.",
        );
        return;
      }
      if (initializedSource.current === records.data.asset.sha256) return;
      initializedSource.current = records.data.asset.sha256;
      const numeric =
        records.data.records[0]?.fields
          .filter((field) => field.canonical_value !== null)
          .map((field) => field.column_index) ?? [];
      setColumns(numeric.slice(0, 2));
    }
  }, [records.data, restored, savedId, asset?.sha256]);
  useEffect(() => {
    setRepresentation(preferences.units === "si" ? "canonical" : "original");
    draftVersion.current += 1;
    setStale(true);
  }, [preferences.units]);
  const changed = () => {
    draftVersion.current += 1;
    setStale(true);
  };
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
    pendingQuery.current?.abort();
    const controller = new AbortController();
    pendingQuery.current = controller;
    const sequence = ++querySequence.current;
    const submittedVersion = draftVersion.current;
    setBusy(true);
    setError(null);
    try {
      const selection = query ?? currentQuery();
      const data = await post<QueryResult>(
        "/v1/queries",
        selection,
        controller.signal,
      );
      if (sequence !== querySequence.current || controller.signal.aborted)
        return;
      if (submittedVersion !== draftVersion.current) {
        setStale(true);
        setNotice(
          "Your selection changed while the data was loading. Apply the current selection to see its result.",
        );
        return;
      }
      setResult(data);
      setExportId(null);
      setAppliedQuery(selection);
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
        title:
          `${dossier.data?.acronym || accession} — ${selection.columns.map((index) => records.data?.headers[index] || `Column ${index + 1}`).join(" / ")}`.slice(
            0,
            200,
          ),
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
      if (!controller.signal.aborted && sequence === querySequence.current)
        setError(message(reason));
    } finally {
      if (sequence === querySequence.current) setBusy(false);
    }
  }
  async function render() {
    if (!spec) return;
    const submittedVersion = draftVersion.current;
    const submittedSpec = JSON.stringify(spec);
    const submittedSequence = querySequence.current;
    setBusy(true);
    setError(null);
    try {
      const value = await post<ValidatedChart>("/v1/charts/validate", spec);
      if (
        submittedVersion !== draftVersion.current ||
        submittedSequence !== querySequence.current ||
        submittedSpec !== JSON.stringify(currentSpec.current)
      ) {
        setNotice(
          "Chart settings changed while validation was running. Your edits are preserved; validate the current settings to draw them.",
        );
        return;
      }
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
      const saved = await saveDocument(
        {
          id: savedId,
          kind: "analysis",
          title: spec?.title ?? `${accession} source selection`,
          snapshot_id: snapshotId,
          data: {
            surface: "data",
            query,
            chart_spec: spec,
            chart,
            result,
            operations,
            applied_query: appliedQuery,
            stale,
          },
        },
        savedRevision,
      );
      setSavedId(saved.id);
      setSavedRevision(saved.revision);
      setNotice("Analysis saved. Reopen it from Your research.");
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
    const submittedVersion = draftVersion.current;
    const submittedSequence = querySequence.current;
    try {
      const created = await post<{ id: string }>("/v1/exports", {
        selection: {
          schema_version: 1,
          snapshot_id: snapshotId,
          case_id: crypto.randomUUID(),
          revision: 1,
          question: spec?.title ?? "Selected source data",
          queries: [appliedQuery ?? currentQuery()],
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
      if (
        submittedVersion !== draftVersion.current ||
        submittedSequence !== querySequence.current
      ) {
        setNotice(
          "An export started for the earlier selection. Find it in Running tasks; it does not describe the current selection.",
        );
        return;
      }
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
  if (opening)
    return (
      <div className={styles.empty} role="status">
        Opening your source selection…
      </div>
    );
  if (!accession)
    return (
      <section className="lab-start-empty">
        <h2>Choose an investigation to explore its data</h2>
        <p>
          Open a source table, select the variables you need and export a
          reproducible dataset. Start with a study relevant to your question.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {catalog.error && (
          <p role="alert">
            The investigation list could not be loaded.{" "}
            <button className="text-button" onClick={catalog.reload}>
              Try again
            </button>
          </p>
        )}
        <label className={styles.field}>
          Investigation
          <select
            value=""
            onChange={(event) => setAccession(event.target.value)}
          >
            <option value="">Choose an investigation…</option>
            {catalog.data?.items.map((item) => (
              <option key={item.accession} value={item.accession}>
                {item.acronym || item.title} — {item.title}
              </option>
            ))}
          </select>
        </label>
        <Link className="text-button" href="/app/investigations">
          Browse investigation summaries first <ArrowRight size={16} />
        </Link>
      </section>
    );
  return (
    <div className={styles.workbench}>
      <div className={styles.split}>
        <aside className={styles.aside}>
          <label className={styles.field}>
            Investigation
            <select
              value={accession}
              onChange={(event) => {
                changed();
                setRestored(null);
                setSavedId(undefined);
                setSavedRevision(undefined);
                setAccession(event.target.value);
              }}
            >
              {catalog.data?.items.map((item) => (
                <option key={item.accession} value={item.accession}>
                  {item.acronym || item.accession} — {item.title}
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
              {!assets.length && (
                <option value="">No retained data table</option>
              )}
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
                    {(variable?.quantity_kind ||
                      variable?.missing_reason ||
                      variable?.status === "unresolved") && (
                      <small>
                        {variable.quantity_kind?.replaceAll("_", " ")}
                        {(representation === "canonical"
                          ? variable.canonical_unit
                          : variable.original_unit) &&
                          ` · ${representation === "canonical" ? variable.canonical_unit : variable.original_unit}`}
                        {variable.missing_reason
                          ? ` · Missing: ${variable.missing_reason}`
                          : variable.status === "unresolved"
                            ? " · Meaning or unit needs review"
                            : ""}
                      </small>
                    )}
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
                  {dossier.data?.acronym || accession} ·{" "}
                  {asset ? assetSourceLabel(asset) : "NASA research sources"}
                </p>
              </div>
              {asset && (
                <button
                  className="button button-small"
                  onClick={() => onInput?.(asset)}
                >
                  <Plus size={14} />
                  Use in Python & shell
                </button>
              )}
            </div>
            {asset && isPublishedTranscription(asset) && (
              <details className={styles.details}>
                <summary>Publication and transcription details</summary>
                <p>
                  This retained table was transcribed from a published source.
                  It preserves reported values and conditions; it is not an
                  original experimental data file.
                </p>
                {asset.source_provenance
                  ?.filter((source) => /^https:\/\//.test(source.source_url))
                  .map((source, index) => (
                    <p key={source.source_url + index}>
                      <a
                        href={source.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title || "Original NASA publication"}
                      </a>
                      {source.page != null ? ` · page ${source.page}` : ""}
                      {source.table ? ` · ${source.table}` : ""}
                    </p>
                  ))}
              </details>
            )}
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
              {stale && result && (
                <strong className={styles.warning}>
                  Inputs changed — recalculate
                </strong>
              )}
            </div>
            <nav className={styles.tabs} aria-label="Dataset views">
              {["table", "charts", "quality", "original"].map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value === "original" &&
                  asset &&
                  isPublishedTranscription(asset)
                    ? "Transcribed table"
                    : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </nav>
            {!asset && !dossier.loading && (
              <div className={styles.empty}>
                <h3>No data table is available here yet</h3>
                <p>
                  You can still read this investigation’s objectives and
                  original source files. Choose another investigation to work
                  with a retained table.
                </p>
                <Link
                  className="button"
                  href={`/app/investigations/${accession}?snapshot=${snapshotId}`}
                >
                  Open investigation <ArrowRight size={16} />
                </Link>
              </div>
            )}
            {dossier.error && (
              <p className={styles.error} role="alert">
                {dossier.error}
              </p>
            )}
            {records.error && (
              <p className={styles.error} role="alert">
                {records.error}{" "}
                <button className="text-button" onClick={records.reload}>
                  Retry data
                </button>
              </p>
            )}
            {asset && (
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
                <details className={`${styles.details} ${styles.full}`}>
                  <summary>Filter, group or summarize data</summary>
                  <div className={styles.fields}>
                    <label className={styles.field}>
                      Source rows
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
                          onChange={(event) =>
                            setFilterValue(event.target.value)
                          }
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
                  </div>
                </details>
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
            )}
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
                <h3>Select variables to preview your data</h3>
                <p>
                  Choose columns in the Variables list, then apply your
                  selection. You can chart or export the result.{" "}
                  {asset && isPublishedTranscription(asset)
                    ? "Published values remain available in the Transcribed table tab."
                    : "Original source values remain available in the Original tab."}
                </p>
              </div>
            ))}
          {tab === "charts" && !spec && (
            <div className={styles.empty}>
              <h3>Choose the data for your chart</h3>
              <p>
                Select variables and apply your selection first. Then choose
                axes and draw a figure.
              </p>
              <button className="button" onClick={() => setTab("table")}>
                Back to data selection
              </button>
            </div>
          )}
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

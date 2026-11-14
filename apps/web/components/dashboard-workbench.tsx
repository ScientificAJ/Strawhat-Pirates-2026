"use client";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import {
  fileDownload,
  message,
  post,
  type DashboardComponent,
  type DashboardSpec,
  type QuerySpec,
  type ValidatedChart,
  type QueryResult,
} from "../lib/laboratory-api";
import {
  listDocuments,
  readDocument,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import { ArtifactView } from "./artifact-view";
import { ScientificChart, ScientificValues } from "./scientific-chart";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";

type DashboardData = {
  spec: DashboardSpec;
  layout: Record<string, number>;
  notes: Record<string, string>;
  results?: Record<string, unknown>;
  origin?: string;
};
type Validation = {
  spec: DashboardSpec;
  components: Record<string, Record<string, unknown>>;
  status: string;
  resolved_bindings?: unknown[];
};
type RenderedValidation = Validation & { inputFingerprint: string };
type DashboardUndo = Pick<DashboardData, "spec" | "layout" | "notes"> & {
  resolved: RenderedValidation | null;
  dirty: boolean;
};
function validationFingerprint(dashboard: DashboardSpec): string {
  // Component order and browser-only layout do not change a validated result.
  return JSON.stringify(
    {
      ...dashboard,
      components: [...dashboard.components].sort((left, right) =>
        left.component_id.localeCompare(right.component_id),
      ),
    },
    (_key, value: unknown) =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).sort(([left], [right]) =>
              left.localeCompare(right),
            ),
          )
        : value,
  );
}
function renderedValidation(
  value: Validation,
  input = value.spec,
): RenderedValidation {
  return { ...value, inputFingerprint: validationFingerprint(input) };
}
const registry: DashboardComponent["type"][] = [
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
];
function blank(snapshot: string): DashboardSpec {
  return {
    schema_version: 1,
    dashboard_id: crypto.randomUUID(),
    revision: 1,
    question: "",
    corpus_snapshot_id: snapshot,
    cohort_ids: [],
    components: [],
    filter_bindings: [],
    selection_bindings: [],
    artifact_dependencies: [],
    mode: "frozen",
  };
}
export function DashboardWorkbench({
  id,
  snapshotId,
}: {
  id?: string;
  snapshotId: string;
}) {
  const [spec, setSpec] = useState<DashboardSpec | null>(null);
  const [layout, setLayout] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [document, setDocument] =
    useState<WorkspaceDocument<DashboardData> | null>(null);
  const [library, setLibrary] = useState<
    WorkspaceDocument<Record<string, unknown>>[]
  >([]);
  const [savedDashboards, setSavedDashboards] = useState<
    WorkspaceDocument<DashboardData>[]
  >([]);
  const [mode, setMode] = useState<"view" | "edit" | "preview">("edit");
  const [resolved, setResolved] = useState<RenderedValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [undo, setUndo] = useState<DashboardUndo | null>(null);
  const [newType, setNewType] =
    useState<DashboardComponent["type"]>("measurement_chart");
  const [selectedSource, setSelectedSource] = useState("");
  const [selectedComponent, setSelectedComponent] = useState("");
  const [proposal, setProposal] = useState<DashboardSpec | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [bindingSource, setBindingSource] = useState("");
  const [bindingTarget, setBindingTarget] = useState("");
  const [sourceColumn, setSourceColumn] = useState("0");
  const [targetColumn, setTargetColumn] = useState("0");
  const [emptyRule, setEmptyRule] = useState<"all" | "none">("none");
  const [bindingValues, setBindingValues] = useState("");
  const [exportId, setExportId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      setResolved(null);
      const [all, analyses] = await Promise.all([
        listDocuments<DashboardData>("dashboard"),
        listDocuments<Record<string, unknown>>("analysis"),
      ]);
      if (!active) return;
      setSavedDashboards(all);
      setLibrary(analyses);
      const item =
        id && id !== "new" ? await readDocument<DashboardData>(id) : null;
      if (!active) return;
      const next = item?.data.spec ?? blank(snapshotId);
      setDocument(item);
      setSpec(next);
      setLayout(item?.data.layout ?? {});
      setNotes(item?.data.notes ?? {});
      setMode(item ? "view" : "edit");
      setDirty(false);
      setUndo(null);
      if (next.components.length && next.question)
        try {
          const value = await post<Validation>("/v1/dashboards/validate", {
            dashboard: next,
          });
          if (active) setResolved(renderedValidation(value, next));
        } catch (reason) {
          setError(
            `Saved sources could not be revalidated. Your local dashboard is retained. ${message(reason)}`,
          );
        }
    }
    void load().catch((reason) => setError(message(reason)));
    return () => {
      active = false;
    };
  }, [id, snapshotId]);
  if (!spec)
    return (
      <div className={styles.skeleton} aria-label="Reading saved dashboards" />
    );
  const current = spec;
  const component = spec.components.find(
    (item) => item.component_id === selectedComponent,
  );
  const editable = mode === "edit";
  const resultsStale =
    resolved !== null &&
    resolved.inputFingerprint !== validationFingerprint(current);
  const sourceQuery = (item: DashboardComponent) =>
    item.chart?.query ?? item.query;
  function rememberUndo() {
    setUndo({
      spec: current,
      layout: { ...layout },
      notes: { ...notes },
      resolved,
      dirty,
    });
  }
  function change(next: DashboardSpec) {
    rememberUndo();
    setSpec(next);
    setDirty(true);
  }
  async function validate(next = current) {
    setBusy(true);
    setError(null);
    try {
      const value = await post<Validation>("/v1/dashboards/validate", {
        dashboard: next,
      });
      setResolved(renderedValidation(value, next));
      return value;
    } catch (reason) {
      setError(message(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function save(copy = false) {
    setError(null);
    const value = await validate();
    if (!value) return;
    try {
      const data: DashboardData = {
        spec: current,
        layout,
        notes,
        results: value.components,
        origin: proposal ? "accepted_proposal" : "researcher_edited",
      };
      const saved = await saveDocument<DashboardData>(
        {
          id: copy ? undefined : document?.id,
          kind: "dashboard",
          title: current.question,
          snapshot_id: current.corpus_snapshot_id,
          data,
        },
        copy ? undefined : document?.revision,
      );
      setDocument(saved);
      setDirty(false);
      setMode("view");
      setProposal(null);
      setNotice(
        "Frozen sources, composition and results saved in this browser revision.",
      );
      setSavedDashboards(await listDocuments<DashboardData>("dashboard"));
    } catch (reason) {
      setError(message(reason));
    }
  }
  function add() {
    const saved = library.find((item) => item.id === selectedSource);
    const data = saved?.data;
    const next: DashboardComponent = {
      component_id: `component-${crypto.randomUUID().slice(0, 8)}`,
      type: newType,
      title: saved?.title ?? newType.replaceAll("_", " "),
      scientific_status: "unknown",
      evidence_references: [],
      empty_state:
        "No authorized source or completed calculation is attached to this component.",
    };
    if (data?.chart_spec && typeof data.chart_spec === "object")
      next.chart = data.chart_spec as DashboardComponent["chart"];
    else if (
      data?.spec &&
      typeof data.spec === "object" &&
      "query" in data.spec
    )
      next.chart = data.spec as DashboardComponent["chart"];
    else if (data?.query && typeof data.query === "object")
      next.query = data.query as QuerySpec;
    else if (typeof data?.job_id === "string") next.job_id = data.job_id;
    setSelectedComponent(next.component_id);
    setLayout((previous) => ({ ...previous, [next.component_id]: 6 }));
    change({ ...current, components: [...current.components, next] });
  }
  function updateComponent(patch: Partial<DashboardComponent>) {
    if (component)
      change({
        ...current,
        components: current.components.map((item) =>
          item.component_id === component.component_id
            ? { ...item, ...patch }
            : item,
        ),
      });
  }
  function move(componentId: string, delta: number) {
    const items = [...current.components];
    const from = items.findIndex((item) => item.component_id === componentId),
      to = Math.max(0, Math.min(items.length - 1, from + delta));
    if (from < 0) return;
    const [item] = items.splice(from, 1);
    items.splice(to, 0, item);
    change({ ...current, components: items });
  }
  async function select(componentId: string, row: Record<string, unknown>) {
    try {
      let dashboard = current;
      let response: Validation | null = null;
      for (const [index, binding] of (
        current.selection_bindings ?? []
      ).entries()) {
        if (binding.source_component !== componentId) continue;
        const value = row[`column_${binding.source_column}`];
        response = await post<Validation>("/v1/dashboards/select", {
          dashboard,
          expected_revision: dashboard.revision,
          binding_kind: "selection",
          binding_index: index,
          values:
            typeof value === "string" || typeof value === "number"
              ? [value]
              : [],
        });
        dashboard = response.spec;
      }
      if (response) {
        setSpec(dashboard);
        setResolved(renderedValidation(response));
        setDirty(true);
        setNotice(
          "Linked selection applied only through the declared compatible bindings. Reset returns to the saved revision.",
        );
      }
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function applyFilter(index: number) {
    try {
      const binding = current.filter_bindings?.[index];
      if (!binding)
        throw new Error(
          "This shared filter no longer exists in the current revision.",
        );
      const source = current.components.find(
        (item) => item.component_id === binding.source_component,
      );
      const query = source && (source.chart?.query ?? source.query);
      const representation =
        query?.column_representations?.[binding.source_column] ??
        query?.representation;
      const values = bindingValues.trim()
        ? bindingValues.split(",").map((value) => {
            const text = value.trim();
            if (representation !== "canonical") return text;
            const number = Number(text);
            if (!text || !Number.isFinite(number))
              throw new Error(
                "This canonical binding requires finite numeric values in its declared physical unit.",
              );
            return number;
          })
        : [];
      const value = await post<Validation>("/v1/dashboards/select", {
        dashboard: current,
        expected_revision: current.revision,
        binding_kind: "filter",
        binding_index: index,
        values,
      });
      setSpec(value.spec);
      setResolved(renderedValidation(value));
      setDirty(true);
    } catch (reason) {
      setError(message(reason));
    }
  }
  function addBinding(kind: "selection_bindings" | "filter_bindings") {
    if (!bindingSource || !bindingTarget) return;
    change({
      ...current,
      [kind]: [
        ...(current[kind] ?? []),
        {
          source_component: bindingSource,
          source_column: Number(sourceColumn),
          target_component: bindingTarget,
          target_column: Number(targetColumn),
          empty_selection: emptyRule,
        },
      ],
    });
  }
  async function importProposal(file: File) {
    try {
      const next = JSON.parse(await file.text()) as DashboardSpec;
      const value = await post<Validation>("/v1/dashboards/validate", {
        dashboard: next,
        expected_revision: current.revision,
      });
      setProposal(value.spec);
      setMode("preview");
      setNotice(
        "Proposed revision validated against this base. Review added, changed and removed components before applying.",
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  function acceptComponent(componentId: string) {
    if (!proposal) return;
    const next = proposal.components.find(
      (item) => item.component_id === componentId,
    );
    const items = current.components.filter(
      (item) => item.component_id !== componentId,
    );
    if (next) items.push(next);
    change({ ...current, components: items });
    setMode("edit");
    setNotice(
      "Independent component change copied into your draft; shared bindings must validate before saving.",
    );
  }
  async function exportSaved() {
    if (!document) {
      setError("Save a validated dashboard revision before exporting.");
      return;
    }
    try {
      const selected = document.data.spec;
      const created = await post<{ id: string }>("/v1/exports", {
        selection: {
          schema_version: 1,
          snapshot_id: selected.corpus_snapshot_id,
          case_id: document.id,
          revision: document.revision,
          question: selected.question,
          queries: selected.components.flatMap((item) =>
            item.query ? [item.query] : [],
          ),
          charts: selected.components.flatMap((item) =>
            item.chart ? [item.chart] : [],
          ),
          method_charts: selected.components.flatMap((item) =>
            item.method_chart ? [item.method_chart] : [],
          ),
          artifacts: [
            {
              artifact_id: "dashboard",
              kind: "dashboard",
              snapshot_id: selected.corpus_snapshot_id,
              scientific_origin: "unknown",
              payload: document.data,
              provenance: {
                document_id: document.id,
                revision: document.revision,
              },
              limitations: [
                "Composition does not qualify unresolved components or establish experimental comparability.",
              ],
            },
          ],
          format: "bundle",
          include_original_bytes: false,
          limitations: [
            "Frozen dashboard preserves each component's scientific status, inputs and limitations.",
          ],
        },
        confirmed_selected_private_data: true,
      });
      setExportId(created.id);
    } catch (reason) {
      setError(message(reason));
    }
  }
  return (
    <div className={styles.workbench}>
      <div className={styles.heading}>
        <div>
          <h1>Research figures</h1>
          <p>
            {mode === "preview"
              ? "Review a proposed composition"
              : mode === "edit"
                ? "Bring data and calculations into one research view"
                : "Inspect a saved research view"}{" "}
            ·{" "}
            {current.mode === "frozen"
              ? "Frozen research artifact"
              : "Live saved query"}
          </p>
        </div>
        <div className={styles.actions}>
          {mode === "view" && (
            <button className="button" onClick={() => setMode("edit")}>
              Edit dashboard
            </button>
          )}
          <button
            className="button button-primary"
            onClick={() => save()}
            disabled={busy || !current.components.length || !current.question}
          >
            <Save size={15} />
            Save revision
          </button>
          <button className="button" onClick={() => save(true)} disabled={busy}>
            <Copy size={15} />
            Keep both / duplicate
          </button>
          <button className="button" onClick={exportSaved} disabled={!document}>
            <Download size={15} />
            Export saved revision
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <p>
            Local edits remain in this draft. Reload the latest saved version or
            keep both as independent dashboards.
          </p>
        </div>
      )}
      {notice && (
        <p className={styles.status} role="status">
          {notice}
        </p>
      )}
      {dirty && (
        <p className={styles.warning}>
          Unsaved composition or selections. Export uses the saved revision.
        </p>
      )}
      {resultsStale && resolved && (
        <div
          role="status"
          aria-label="Previous validated dashboard results"
          className={`${styles.warning} ${styles.caption}`}
        >
          Previous validated results remain visible. They use source snapshot{" "}
          {resolved.spec.corpus_snapshot_id}; current draft changes are not
          reflected. Validate / refresh components before interpreting these as
          results for the edited dashboard.
        </div>
      )}
      {current.corpus_snapshot_id !== snapshotId && (
        <p className={styles.warning}>
          This dashboard retains an earlier source snapshot.{" "}
          {editable && (
            <button
              className="text-button"
              onClick={() => {
                change({
                  ...current,
                  corpus_snapshot_id: snapshotId,
                  components: current.components.map((item) => ({
                    ...item,
                    query: item.query
                      ? { ...item.query, snapshot_id: snapshotId }
                      : undefined,
                    chart: item.chart
                      ? {
                          ...item.chart,
                          query: {
                            ...item.chart.query,
                            snapshot_id: snapshotId,
                          },
                        }
                      : undefined,
                  })),
                });
                setNotice(
                  "New source release selected in the draft. Every source and field must validate again before saving.",
                );
              }}
            >
              Review against current release
            </button>
          )}
        </p>
      )}
      <section className={styles.surface}>
        <div className={styles.fields}>
          <label className={`${styles.field} ${styles.full}`}>
            Research question
            <input
              value={current.question}
              readOnly={!editable}
              onChange={(event) =>
                change({ ...current, question: event.target.value })
              }
            />
          </label>
          <label className={styles.field}>
            Data mode
            <select
              value={current.mode}
              disabled={!editable}
              onChange={(event) =>
                change({
                  ...current,
                  mode: event.target.value as DashboardSpec["mode"],
                })
              }
            >
              <option value="frozen">Frozen exact sources</option>
              <option value="live_query">
                Live saved query (explicit source updates)
              </option>
            </select>
          </label>
          <label className={styles.field}>
            Saved dashboards
            <select
              value={document?.id ?? ""}
              onChange={(event) => {
                window.location.href = `/app/dashboards/${encodeURIComponent(event.target.value)}`;
              }}
            >
              <option value="">New dashboard</option>
              {savedDashboards.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title} · revision {item.revision}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.actions}>
          <button
            className="button"
            disabled={!undo}
            onClick={() => {
              if (undo) {
                setSpec(undo.spec);
                setLayout(undo.layout);
                setNotes(undo.notes);
                setResolved(undo.resolved);
                setDirty(undo.dirty);
                setError(null);
                setUndo(null);
              }
            }}
          >
            Undo last layout or component change
          </button>
          <button
            className="button"
            onClick={() => validate()}
            disabled={busy || !current.components.length}
          >
            {busy
              ? "Validating sources and dependencies…"
              : "Validate / refresh components"}
          </button>
          <button
            className="button"
            disabled={!document}
            onClick={() => {
              if (document) {
                setSpec(document.data.spec);
                setLayout(document.data.layout);
                setNotes(document.data.notes);
                setDirty(false);
                void validate(document.data.spec);
              }
            }}
          >
            Reset to saved state
          </button>
          <label className="button">
            Review proposed revision
            <input
              className="visually-hidden"
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importProposal(file);
              }}
            />
          </label>
        </div>
        <details className={styles.details}>
          <summary>Source and revision details</summary>
          <p className={styles.caption}>
            Source version {current.corpus_snapshot_id} · figure revision{" "}
            {current.revision} · saved revision{" "}
            {document?.revision ?? "unsaved"} ·{" "}
            {resultsStale
              ? "previous results; refresh required"
              : (resolved?.status ?? "not validated")}
          </p>
        </details>
      </section>
      {proposal && (
        <section className={styles.surface}>
          <h2>Review proposed changes</h2>
          <p>
            Base revision {proposal.base_revision}; your current revision{" "}
            {current.revision}. Changes are proposals until accepted and saved.
          </p>
          <ul className={styles.list}>
            {Array.from(
              new Set([
                ...current.components.map((item) => item.component_id),
                ...proposal.components.map((item) => item.component_id),
              ]),
            ).map((componentId) => {
              const before = current.components.find(
                  (item) => item.component_id === componentId,
                ),
                after = proposal.components.find(
                  (item) => item.component_id === componentId,
                );
              const state = !before
                ? "Added"
                : !after
                  ? "Removed"
                  : JSON.stringify(before) !== JSON.stringify(after)
                    ? "Changed"
                    : "Unchanged";
              return (
                <li key={componentId} className={styles.row}>
                  <span>
                    {state}: {after?.title ?? before?.title}
                  </span>
                  {state !== "Unchanged" && (
                    <button
                      className="button button-small"
                      onClick={() => acceptComponent(componentId)}
                    >
                      Accept this independent change
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <details>
            <summary>
              Question, source, filters, assumptions and affected conclusions
            </summary>
            <pre className={styles.output}>
              {JSON.stringify(proposal, null, 2)}
            </pre>
          </details>
          <div className={styles.actions}>
            <button
              className="button button-primary"
              onClick={() => {
                change(proposal);
                setMode("edit");
              }}
            >
              Accept entire proposed revision
            </button>
            <button
              className="button"
              onClick={() => {
                setProposal(null);
                setMode(document ? "view" : "edit");
              }}
            >
              Keep current dashboard
            </button>
          </div>
        </section>
      )}
      {editable && (
        <section className={styles.surface}>
          <h2>Approved component library</h2>
          <div className={styles.fields}>
            <label className={styles.field}>
              Component type
              <select
                value={newType}
                onChange={(event) =>
                  setNewType(event.target.value as DashboardComponent["type"])
                }
              >
                {registry.map((type) => (
                  <option key={type} value={type}>
                    {type.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Authorized saved analysis / method
              <select
                value={selectedSource}
                onChange={(event) => setSelectedSource(event.target.value)}
              >
                <option value="">Explicit unavailable component</option>
                {library.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button className="button" onClick={add}>
            <Plus size={15} />
            Add selected component
          </button>
        </section>
      )}
      <div className={styles.grid}>
        {current.components.map((item, index) => {
          const value = resolved?.components[item.component_id];
          const validatedComponent = resolved?.spec.components.find(
            (previous) => previous.component_id === item.component_id,
          );
          const width = layout[item.component_id] ?? 6;
          const data =
            value && "vega_lite" in value
              ? (value as unknown as ValidatedChart)
              : null;
          return (
            <article
              key={item.component_id}
              className={`${styles.component} ${styles.surface} ${selectedComponent === item.component_id && editable ? styles.selection : ""}`}
              style={{ "--span": width } as CSSProperties}
              draggable={editable}
              onDragStart={() => setDrag(item.component_id)}
              onDragOver={(event) => {
                if (editable) event.preventDefault();
              }}
              onDrop={() => {
                if (drag) {
                  const from = current.components.findIndex(
                    (source) => source.component_id === drag,
                  );
                  move(drag, index - from);
                  setDrag(null);
                }
              }}
            >
              <div className={styles.row}>
                <h2>{item.title}</h2>
                <span className={styles.badge}>
                  {item.scientific_status.replaceAll("_", " ")}
                </span>
              </div>
              {resultsStale && value && validatedComponent && (
                <p className={styles.warning}>
                  Previous validated result for “{validatedComponent.title}” ·{" "}
                  {validatedComponent.scientific_status.replaceAll("_", " ")}.
                  Current draft changes are not reflected.
                </p>
              )}
              {value?.status === "unavailable" ||
              value?.status === "incomplete" ? (
                <p className={styles.warning}>
                  {item.empty_state} · {String(value.status)}
                </p>
              ) : data ? (
                <ScientificChart
                  chart={data}
                  onSelect={(row) => void select(item.component_id, row)}
                />
              ) : value &&
                Array.isArray(value.values) &&
                Array.isArray(value.columns) ? (
                <ScientificValues
                  data={value as unknown as QueryResult}
                  onSelect={(row) => void select(item.component_id, row)}
                />
              ) : value ? (
                <ArtifactView value={value} />
              ) : item.chart ||
                item.query ||
                item.job_id ||
                item.method_chart ||
                item.artifact_id ? (
                <p className={styles.muted}>
                  This component has not been validated yet. Validate / refresh
                  components to resolve its selected sources or calculation.
                </p>
              ) : (
                <p className={styles.muted}>{item.empty_state}</p>
              )}
              {notes[item.component_id] && (
                <p className={styles.caption}>
                  Researcher note: {notes[item.component_id]}
                </p>
              )}
              {editable && (
                <div className={styles.actions}>
                  <button
                    className="button button-small"
                    disabled={index === 0}
                    onClick={() => move(item.component_id, -1)}
                    aria-label={`Move ${item.title} before`}
                  >
                    <ArrowUp size={14} />
                    Move before
                  </button>
                  <button
                    className="button button-small"
                    disabled={index === current.components.length - 1}
                    onClick={() => move(item.component_id, 1)}
                    aria-label={`Move ${item.title} after`}
                  >
                    <ArrowDown size={14} />
                    Move after
                  </button>
                  <button
                    className="button button-small"
                    onClick={() => {
                      rememberUndo();
                      setLayout((previous) => ({
                        ...previous,
                        [item.component_id]: [4, 6, 8, 12][
                          Math.min(3, [4, 6, 8, 12].indexOf(width) + 1)
                        ],
                      }));
                      setDirty(true);
                    }}
                  >
                    Increase width
                  </button>
                  <button
                    className="button button-small"
                    disabled={
                      width <=
                      ([
                        "measurement_chart",
                        "run_table",
                        "condition_coverage",
                      ].includes(item.type)
                        ? 6
                        : 4)
                    }
                    onClick={() => {
                      rememberUndo();
                      setLayout((previous) => ({
                        ...previous,
                        [item.component_id]: [4, 6, 8, 12][
                          Math.max(0, [4, 6, 8, 12].indexOf(width) - 1)
                        ],
                      }));
                      setDirty(true);
                    }}
                  >
                    Decrease width
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setSelectedComponent(item.component_id)}
                  >
                    Edit properties
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      change({
                        ...current,
                        components: current.components.filter(
                          (source) => source.component_id !== item.component_id,
                        ),
                      })
                    }
                  >
                    <Trash2 size={14} />
                    Remove
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {current.components.length === 0 && (
        <div className={styles.empty}>
          <h2>Start with a research question and a saved source selection</h2>
          <p>
            Add an approved component. Unavailable evidence remains an explicit
            component; it never disappears into an apparently complete answer.
          </p>
        </div>
      )}
      {editable && component && (
        <section className={styles.surface}>
          <h2>Component properties</h2>
          <div className={styles.fields}>
            <label className={styles.field}>
              Title
              <input
                value={component.title}
                onChange={(event) =>
                  updateComponent({ title: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              Scientific status
              <select
                value={component.scientific_status}
                onChange={(event) =>
                  updateComponent({
                    scientific_status: event.target
                      .value as DashboardComponent["scientific_status"],
                  })
                }
              >
                {[
                  "measured",
                  "derived",
                  "interpretation",
                  "hypothetical",
                  "unknown",
                  "conflicting",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              Meaning when unavailable
              <input
                value={component.empty_state}
                onChange={(event) =>
                  updateComponent({ empty_state: event.target.value })
                }
              />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              Personal assumption / interpretation note
              <textarea
                value={notes[component.component_id] ?? ""}
                onChange={(event) => {
                  setNotes((previous) => ({
                    ...previous,
                    [component.component_id]: event.target.value,
                  }));
                  setDirty(true);
                }}
              />
            </label>
            <label className={styles.field}>
              Existing private job ID
              <input
                value={component.job_id ?? ""}
                onChange={(event) =>
                  updateComponent({
                    job_id: event.target.value || null,
                    chart: null,
                    query: null,
                    method_chart: null,
                    artifact_id: null,
                    artifact_job_id: null,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              Method chart view
              <select
                value={component.method_chart?.view ?? ""}
                onChange={(event) => {
                  if (component.job_id && event.target.value)
                    updateComponent({
                      method_chart: {
                        title: component.title,
                        job_ids: [component.job_id],
                        view: event.target.value as
                          | "fit"
                          | "residual"
                          | "interval"
                          | "track"
                          | "boundary"
                          | "observed_predicted",
                        x_scale: "linear",
                        y_scale: "linear",
                      },
                      job_id: null,
                    });
                }}
              >
                <option value="">Keep original job artifact</option>
                {[
                  "fit",
                  "residual",
                  "interval",
                  "track",
                  "boundary",
                  "observed_predicted",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </section>
      )}
      <section className={styles.surface}>
        <h2>Shared filters and selections</h2>
        <p className={styles.caption}>
          Only explicit compatible bindings can propagate a selection. Filters
          identify affected components; incompatible sources retain their
          original data and show a validation error.
        </p>
        {editable && (
          <>
            <div className={styles.fields}>
              {(["source", "target"] as const).map((side) => (
                <label className={styles.field} key={side}>
                  {side === "source" ? "Selection source" : "Affected target"}
                  <select
                    value={side === "source" ? bindingSource : bindingTarget}
                    onChange={(event) =>
                      (side === "source" ? setBindingSource : setBindingTarget)(
                        event.target.value,
                      )
                    }
                  >
                    <option value="">Select component</option>
                    {current.components
                      .filter((item) => sourceQuery(item))
                      .map((item) => (
                        <option
                          value={item.component_id}
                          key={item.component_id}
                        >
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
              ))}
              <label className={styles.field}>
                Source physical column index
                <input
                  type="number"
                  min={0}
                  value={sourceColumn}
                  onChange={(event) => setSourceColumn(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                Target physical column index
                <input
                  type="number"
                  min={0}
                  value={targetColumn}
                  onChange={(event) => setTargetColumn(event.target.value)}
                />
              </label>
              <label className={styles.field}>
                Empty selection means
                <select
                  value={emptyRule}
                  onChange={(event) =>
                    setEmptyRule(event.target.value as "all" | "none")
                  }
                >
                  <option value="none">No source records</option>
                  <option value="all">All source records</option>
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <button
                className="button"
                onClick={() => addBinding("selection_bindings")}
              >
                Add linked-selection rule
              </button>
              <button
                className="button"
                onClick={() => addBinding("filter_bindings")}
              >
                Add shared filter rule
              </button>
            </div>
          </>
        )}
        {(current.selection_bindings ?? []).map((binding, index) => (
          <p key={`selection-${index}`}>
            {binding.source_component} column {binding.source_column} →{" "}
            {binding.target_component} column {binding.target_column}; empty
            means {binding.empty_selection}.
          </p>
        ))}
        {(current.filter_bindings ?? []).map((binding, index) => (
          <div className={styles.inline} key={index}>
            <label className={styles.field}>
              Filter {binding.source_component} → {binding.target_component}
              <input
                value={bindingValues}
                onChange={(event) => setBindingValues(event.target.value)}
                placeholder="Exact source values, comma separated; blank resets"
              />
            </label>
            <button className="button" onClick={() => applyFilter(index)}>
              Apply declared filter
            </button>
          </div>
        ))}
      </section>
      {document && (
        <details className={styles.details}>
          <summary>Immutable revision history</summary>
          {document.revisions.map((item) => (
            <div key={item.revision} className={styles.item}>
              <strong>
                Revision {item.revision} ·{" "}
                {new Date(item.saved_at).toLocaleString()}
              </strong>
              <button
                className="text-button"
                onClick={() => {
                  change(item.data.spec);
                  setLayout(item.data.layout);
                  setNotes(item.data.notes);
                  setMode("edit");
                }}
              >
                Restore this revision into draft
              </button>
            </div>
          ))}
        </details>
      )}
      <button
        className="button"
        onClick={() =>
          fileDownload(
            "dashboard-draft.json",
            JSON.stringify({ spec: current, layout, notes }, null, 2),
          )
        }
      >
        Download local draft
      </button>
      {exportId && <JobMonitor id={exportId} />}
    </div>
  );
}

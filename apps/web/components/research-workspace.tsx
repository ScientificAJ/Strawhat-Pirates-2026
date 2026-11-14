"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  FileText,
  Layers,
  Plus,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Catalog, downloadJson, family, useResource } from "../lib/api";
import {
  listCases,
  type ResearchCase,
  saveCase,
  workspaceBackup,
} from "../lib/workspace-storage";
import {
  completeWorkspaceBackup,
  defaultPreferences,
  readPreferences,
  writePreferences,
  previewWorkspaceBackup,
  restoreCompleteWorkspace,
  type BackupPreview,
} from "../lib/workspace-backup";
import {
  ResearchContextProvider,
  useResearchContext,
} from "../lib/research-context";
import { saveDocument } from "../lib/workspace-documents";
import { CaseNotebook, newCase } from "./case-notebook";
import { InvestigationTable } from "./catalog";
import { ErrorState, LoadingRows, Notice, Shell } from "./chrome";
import { FlexAnalysis } from "./laboratory";
import { WorkspaceSettings } from "./workspace-settings";
import { JobsBoard } from "./jobs-board";

const loading = () => <LoadingRows label="Opening the research workbench" />;
const ResearchStudio = dynamic(
  () => import("./studio").then((module) => module.ResearchStudio),
  { loading },
);
const AgentWorkshop = dynamic(
  () => import("./agent-workshop").then((module) => module.AgentWorkshop),
  { loading },
);
const ContextualAssistant = dynamic(() =>
  import("./contextual-assistant").then((module) => module.ContextualAssistant),
);
const DiscoveryWorkbench = dynamic(
  () =>
    import("./discovery-workbench").then((module) => module.DiscoveryWorkbench),
  { loading },
);
const ComparisonWorkbench = dynamic(
  () =>
    import("./compare-workbench").then((module) => module.ComparisonWorkbench),
  { loading },
);
const EvidenceWorkbench = dynamic(
  () =>
    import("./evidence-workbench").then((module) => module.EvidenceWorkbench),
  { loading },
);
const InvestigationDossier = dynamic(
  () => import("./run-workbench").then((module) => module.InvestigationDossier),
  { loading },
);
const RunWorkbench = dynamic(
  () => import("./run-workbench").then((module) => module.RunWorkbench),
  { loading },
);
const LaboratoryWorkbench = dynamic(
  () =>
    import("./laboratory-workbench").then(
      (module) => module.LaboratoryWorkbench,
    ),
  { loading },
);
const DashboardWorkbench = dynamic(
  () =>
    import("./dashboard-workbench").then((module) => module.DashboardWorkbench),
  { loading },
);

type WorkspaceProps = {
  section: string;
  entityId?: string;
  detailId?: string;
  intentId?: string;
  initialQuery: string;
  requestedSnapshot?: string;
  investigationIds?: string[];
};
export function ResearchWorkspace(props: WorkspaceProps) {
  const current = useResource<{ snapshot_id: string }>("/v1/snapshots/current");
  return (
    <ResearchContextProvider
      snapshotId={props.requestedSnapshot ?? current.data?.snapshot_id ?? null}
    >
      <WorkspaceContent
        {...props}
        latestSnapshot={current.data?.snapshot_id}
        snapshotError={current.error}
        retrySnapshot={current.reload}
      />
    </ResearchContextProvider>
  );
}
function WorkspaceContent({
  section,
  entityId,
  detailId,
  intentId,
  initialQuery,
  requestedSnapshot,
  investigationIds,
  latestSnapshot,
  snapshotError,
  retrySnapshot,
}: WorkspaceProps & {
  latestSnapshot?: string;
  snapshotError: string | null;
  retrySnapshot: () => void;
}) {
  const router = useRouter();
  const { context, updateContext, storageError } = useResearchContext();
  const snapshot =
    requestedSnapshot ?? context?.snapshot_id ?? latestSnapshot ?? null;
  const catalog = useResource<Catalog>(
    snapshot ? `/v1/investigations?limit=100&snapshot_id=${snapshot}` : null,
  );
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const changed = () => setSystemTheme(media.matches ? "dark" : "light");
    changed();
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  const resolvedTheme =
    preferences.theme === "system" ? systemTheme : preferences.theme;
  const [cases, setCases] = useState<ResearchCase[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restorePreferences, setRestorePreferences] = useState(false);
  const [assistantSession, setAssistantSession] = useState<string>();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  useEffect(() => setAssistantOpen(false), [section, entityId, detailId]);
  const selected = context?.investigations ?? [];
  const refreshCases = useCallback(async () => setCases(await listCases()), []);
  useEffect(() => {
    if (
      requestedSnapshot &&
      context &&
      context.snapshot_id !== requestedSnapshot
    )
      updateContext({
        snapshot_id: requestedSnapshot,
        investigations: [],
        selected_sources: [],
        selected_evidence: [],
        selected_artifacts: [],
        selected_private_inputs: [],
        scenario: {},
        focused_view: null,
        active_artifact_id: null,
        case_revision: null,
      });
  }, [requestedSnapshot, context, updateContext]);
  useEffect(() => {
    const refresh = () => {
      void refreshCases().catch((reason) =>
        setMessage({ text: String(reason), error: true }),
      );
    };
    const prefs = () => {
      void readPreferences()
        .then(setPreferences)
        .catch((reason) => setMessage({ text: String(reason), error: true }));
    };
    const warning = (event: Event) =>
      setMessage({ text: String((event as CustomEvent).detail), error: true });
    refresh();
    prefs();
    window.addEventListener("nova-ember-workspace-changed", refresh);
    window.addEventListener("nova-ember-preferences-changed", prefs);
    window.addEventListener("nova-ember-storage-warning", warning);
    return () => {
      window.removeEventListener("nova-ember-workspace-changed", refresh);
      window.removeEventListener("nova-ember-preferences-changed", prefs);
      window.removeEventListener("nova-ember-storage-warning", warning);
    };
  }, [refreshCases]);
  function toggleTheme() {
    const next = {
      ...preferences,
      theme: resolvedTheme === "light" ? ("dark" as const) : ("light" as const),
    };
    setPreferences(next);
    void writePreferences(next).catch((reason) =>
      setMessage({ text: String(reason), error: true }),
    );
  }
  async function saveInvestigation(id: string) {
    const item = catalog.data?.items.find((item) => item.accession === id);
    const draft = newCase(
      snapshot,
      [id],
      `${item?.acronym || id} — evidence notes`,
    );
    const time = new Date().toISOString();
    const value: ResearchCase = {
      ...draft,
      revision: 1,
      updated_at: time,
      revisions: [
        {
          revision: 1,
          saved_at: time,
          question: "",
          notes: "",
          investigation_ids: [id],
          snapshot_id: snapshot,
        },
      ],
    };
    try {
      await saveCase(value);
      await refreshCases();
      router.push(`/app/cases/${value.id}`);
    } catch (reason) {
      downloadJson("nova-ember-unsaved-case.json", workspaceBackup([value]));
      setMessage({ text: String(reason), error: true });
    }
  }
  async function backup() {
    try {
      downloadJson(
        "nova-ember-workspace.json",
        await completeWorkspaceBackup(),
      );
      const next = { ...preferences, last_backup_at: new Date().toISOString() };
      await writePreferences(next);
      setPreferences(next);
      setMessage({
        text: "Workspace backup downloaded with cases, research documents, revisions and preferences. Credentials and live server access are excluded.",
        error: false,
      });
    } catch (reason) {
      setMessage({ text: String(reason), error: true });
    }
  }
  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file)
      try {
        setPreview(await previewWorkspaceBackup(file));
        setRestorePreferences(false);
      } catch (reason) {
        setMessage({ text: String(reason), error: true });
      }
    event.target.value = "";
  }
  async function confirmRestore() {
    if (!preview) return;
    try {
      const count = await restoreCompleteWorkspace(preview, restorePreferences);
      setPreview(null);
      await refreshCases();
      setMessage({
        text: `Restored ${count} research items as independent copies. Existing work is preserved. Copied selections can be resumed in Settings; expired remote inputs may need to be selected again.`,
        error: false,
      });
      router.push("/app/cases");
    } catch (reason) {
      setMessage({ text: String(reason), error: true });
    }
  }
  const ready = !!snapshot && context?.snapshot_id === snapshot;
  return (
    <Shell
      section={section}
      snapshot={snapshot}
      theme={resolvedTheme}
      preferences={preferences}
      context={context}
      assistantOpen={assistantOpen}
      onAsk={() => {
        if (section === "agent")
          document
            .querySelector<HTMLTextAreaElement>("#studio-research-question")
            ?.focus();
        else setAssistantOpen(true);
      }}
      onTheme={toggleTheme}
      onBackup={() => void backup()}
      onRestore={() => importInput.current?.click()}
    >
      <input
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        ref={importInput}
        tabIndex={-1}
        aria-label="Restore a workspace backup"
        onChange={restore}
      />
      {message && (
        <div
          className={`workspace-message ${message.error ? "message-error" : ""}`}
          role={message.error ? "alert" : "status"}
        >
          <span>
            {message.error ? <CircleHelp size={17} /> : <Check size={17} />}{" "}
            {message.text}
          </span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setMessage(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {storageError && (
        <Notice kind="error">
          {storageError} Keep a backup before leaving this browser.
        </Notice>
      )}
      {preview && (
        <section
          className="inline-confirmation"
          role="region"
          aria-label="Review workspace restore"
        >
          <h2>Review workspace restore</h2>
          <p>
            {preview.cases} cases and {preview.documents} research documents ·
            version {preview.version} · exported {preview.exported_at}
          </p>
          <p>
            Import creates independent copies with frozen source references. It
            cannot transfer temporary browser receipts or recover expired
            uploads. Existing drafts stay in place.
          </p>
          {preview.version === 2 && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={restorePreferences}
                onChange={(event) =>
                  setRestorePreferences(event.target.checked)
                }
              />
              Apply the backup’s research and appearance preferences
            </label>
          )}
          <div className="inline-actions">
            <button
              className="button button-primary"
              onClick={() => void confirmRestore()}
            >
              Import independent copies
            </button>
            <button className="button" onClick={() => setPreview(null)}>
              Cancel restore
            </button>
          </div>
        </section>
      )}
      {section === "agents" ? (
        <AgentWorkshop snapshotId={snapshot} context={context ?? undefined} />
      ) : snapshotError && !ready ? (
        <ErrorState message={snapshotError} retry={retrySnapshot} />
      ) : !ready ? (
        <LoadingRows label="Opening the source snapshot" />
      ) : section === "overview" ? (
        <Overview
          snapshotId={snapshot}
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error}
          retry={catalog.reload}
          cases={cases}
          onSave={saveInvestigation}
        />
      ) : section === "investigations" && entityId ? (
        <InvestigationDossier
          accession={entityId}
          snapshotId={snapshot}
          onSave={saveInvestigation}
        />
      ) : section === "investigations" ? (
        <DiscoveryWorkbench snapshotId={snapshot} initialQuery={initialQuery} />
      ) : section === "runs" && entityId ? (
        <RunWorkbench id={entityId} snapshotId={snapshot} />
      ) : section === "lab" && entityId === "evidence" ? (
        <EvidenceWorkbench view={detailId} snapshotId={snapshot} />
      ) : section === "lab" ? (
        <LaboratoryWorkbench
          view={entityId}
          entityId={detailId}
          snapshotId={snapshot}
        />
      ) : section === "cases" ? (
        <CaseNotebook
          cases={cases}
          entityId={entityId}
          snapshot={snapshot}
          selected={selected}
          onSaved={refreshCases}
        />
      ) : section === "compare" ? (
        <ComparisonWorkbench
          id={entityId}
          snapshotId={snapshot}
          investigationIds={investigationIds ?? selected}
        />
      ) : section === "agent" ? (
        <ResearchStudio
          sessionId={entityId}
          snapshotId={snapshot}
          context={context ?? undefined}
          intentId={intentId}
        />
      ) : section === "dashboards" ? (
        <DashboardWorkbench id={entityId} snapshotId={snapshot} />
      ) : section === "jobs" ? (
        <JobsBoard id={entityId} />
      ) : section === "settings" ? (
        <WorkspaceSettings
          onBackup={() => void backup()}
          onRestore={() => importInput.current?.click()}
        />
      ) : ["coverage", "stewardship", "learning"].includes(section) ? (
        <EvidenceWorkbench
          view={section === "coverage" ? "gaps" : section}
          snapshotId={snapshot}
        />
      ) : (
        <ResearchGuide />
      )}
      {context && section !== "agent" && (
        <ContextualAssistant
          context={context}
          sessionId={assistantSession}
          onSessionChange={setAssistantSession}
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
        />
      )}
    </Shell>
  );
}

function Overview({
  snapshotId,
  catalog,
  loading,
  error,
  retry,
  cases,
  onSave,
}: {
  snapshotId: string;
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  cases: ResearchCase[];
  onSave: (id: string) => void;
}) {
  const [question, setQuestion] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const draftingRef = useRef(false);
  const router = useRouter();
  const groups = [
    "Solid fuels and spread",
    "Droplets and cool flames",
    "Smoke and detection",
    "Gas flames and transport",
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Research overview</h1>
          <p>Combustion research, made clear.</p>
        </div>
        <Link className="button button-primary" href="/app/cases/new">
          <Plus size={17} />
          New research case
        </Link>
      </div>
      <form
        className="question-composer"
        aria-busy={drafting}
        onSubmit={(event) => {
          event.preventDefault();
          if (!catalog || !question.trim() || draftingRef.current) return;
          draftingRef.current = true;
          setDrafting(true);
          setDraftError(null);
          void saveDocument({
            kind: "studio_intent",
            title: question.slice(0, 100),
            snapshot_id: catalog.snapshot_id,
            data: {
              question,
              snapshot_id: catalog.snapshot_id,
              investigations: [],
            },
          })
            .then((intent) => router.push(`/app/agent?intent=${intent.id}`))
            .catch((reason) => {
              draftingRef.current = false;
              setDrafting(false);
              setDraftError(String(reason));
            });
        }}
      >
        <label htmlFor="research-question">
          What would you like to understand?
        </label>
        <div className="question-input">
          <Search size={21} />
          <input
            id="research-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a combustion research question; review context before sending"
          />
          <button
            className="button button-primary"
            type="submit"
            disabled={!catalog || !question.trim() || drafting}
          >
            {drafting ? "Opening draft…" : "Draft in Studio"}
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="question-examples">
          <span>Start with</span>
          <Link href="/app/investigations?q=flame%20spread">Flame spread</Link>
          <Link href="/app/investigations?q=droplet">Droplet combustion</Link>
          <Link href="/app/investigations?q=smoke">Smoke measurements</Link>
        </div>
      </form>
      <span className="visually-hidden" role="status">
        {drafting ? "Saving your question and opening a Studio draft." : ""}
      </span>
      {draftError && <Notice kind="error">{draftError}</Notice>}
      <div className="corpus-strip" aria-live="polite">
        <span>
          <Layers size={16} />
          <strong>{catalog ? catalog.total : "—"}</strong> investigations in
          this snapshot
        </span>
        <span>
          <FileText size={16} />
          NASA PSI source records
        </span>
        <Link href="/app/lab/evidence">
          Inspect evidence limitations
          <ArrowRight size={14} />
        </Link>
      </div>
      {error && <ErrorState message={error} retry={retry} />}
      <div className="overview-layout">
        <div>
          <FlexAnalysis compact onSave={onSave} snapshotId={snapshotId} />
        </div>
        <aside className="continuation-panel">
          <h2>
            {cases.length
              ? "Continue your research"
              : "A question becomes a case"}
          </h2>
          {cases[0] ? (
            <>
              <span className="case-label">
                <BookOpen size={16} />
                Saved on this device
              </span>
              <h3>{cases[0].title}</h3>
              <p>
                {cases[0].question ||
                  "Return to your notes and the evidence you saved."}
              </p>
              <Link className="button" href={`/app/cases/${cases[0].id}`}>
                Resume case
                <ArrowRight size={16} />
              </Link>
            </>
          ) : (
            <>
              <p>
                Keep sources, calculations, and unresolved questions together in
                a personal research notebook.
              </p>
              <ol className="research-steps">
                <li>
                  <span>Find</span> a relevant investigation
                </li>
                <li>
                  <span>Inspect</span> the original evidence
                </li>
                <li>
                  <span>Save</span> your reasoning and sources
                </li>
              </ol>
              <Link className="button" href="/app/cases/new">
                Start a research case
                <ArrowRight size={16} />
              </Link>
            </>
          )}
          <div className="continuation-note">
            Your work stays in this browser. Export a backup to take it with
            you.
          </div>
        </aside>
      </div>
      <section className="coverage-section">
        <div className="section-heading">
          <div>
            <h2>Explore the evidence</h2>
            <p>A source catalog across four research families</p>
          </div>
          <Link className="text-button" href="/app/investigations">
            All investigations
            <ArrowRight size={16} />
          </Link>
        </div>
        {loading && !catalog ? (
          <LoadingRows />
        ) : (
          <div className="coverage-list">
            {groups.map((group, index) => (
              <Link
                className="coverage-item"
                href={`/app/investigations?q=${encodeURIComponent(group)}`}
                key={group}
              >
                <span className={`coverage-swatch coverage-series-${index}`} />
                <span>{group}</span>
                <strong className="mono">
                  {catalog
                    ? catalog.items.filter(
                        (item) => family(item.accession) === group,
                      ).length
                    : "—"}
                </strong>
                <ChevronRight size={17} />
              </Link>
            ))}
          </div>
        )}
      </section>
      {catalog && (
        <section className="data-surface">
          <div className="surface-heading">
            <span>Investigation records</span>
            <Link href="/app/investigations" className="text-button">
              Open explorer
              <ArrowRight size={14} />
            </Link>
          </div>
          <InvestigationTable
            snapshotId={snapshotId}
            compact
            items={catalog.items.filter((item) =>
              ["PSI-25", "PSI-69", "PSI-101"].includes(item.accession),
            )}
          />
        </section>
      )}
    </>
  );
}

function ResearchGuide() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Follow the evidence</h1>
          <p>A short guide to your local research workspace.</p>
        </div>
      </div>
      <article className="reading-surface guide">
        <h2>Start with an investigation</h2>
        <p>
          Search the NASA combustion catalog, open a record, and inspect its
          objective, source version, and retained files. Catalog availability
          and scientific readiness are different states.
        </p>
        <h2>Inspect the original value</h2>
        <p>
          The source-table view keeps the original header, cell text, record
          location, encoding, and file hash. An unresolved unit stays unresolved
          rather than acquiring a plausible replacement.
        </p>
        <h2>Reproduce a calculation</h2>
        <p>
          The FLEX analysis counts three distinct source test-end labels. The
          atmosphere calculator uses oxygen mole fraction and absolute pressure.
          Each calculation retains its inputs and states its interpretation
          limits.
        </p>
        <h2>Keep your reasoning</h2>
        <p>
          Save an investigation to a research case. Record the question, notes,
          and unresolved issues, then save a revision. Back up the workspace
          before clearing this browser’s data or moving to another device.
        </p>
        <h2>Understand the current scope</h2>
        <p>
          The laboratory uses registered scientific methods and preserves their
          source and calibration requirements. Studio and voice use the
          configured OpenAI service only after an explicit request. Saved work
          remains in this browser; use Settings for portable backups and
          temporary-data controls. Prediction remains unavailable wherever
          independent validation or the required conditions are missing. Public
          hosting depends on the selected host and offer eligibility.
        </p>
        <a
          href="https://psi.nasa.gov/physci/repo"
          className="text-button"
          target="_blank"
          rel="noreferrer"
        >
          Visit NASA’s source repository
          <ExternalLink size={16} />
        </a>
      </article>
    </>
  );
}

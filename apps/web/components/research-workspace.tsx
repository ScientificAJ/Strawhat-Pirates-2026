"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowRight, Check, CircleHelp, ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Catalog, downloadJson, useResource } from "../lib/api";
import { listCases, type ResearchCase } from "../lib/workspace-storage";
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
import { readDocument, saveDocument } from "../lib/workspace-documents";
import { CaseNotebook } from "./case-notebook";
import { bringEarlierResearchTogether } from "../lib/research-continuity";
import { ResearchHome } from "./research-home";
import { ErrorState, LoadingRows, Notice, Shell } from "./chrome";
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
  const [storageReady, setStorageReady] = useState(false);
  const [continuityError, setContinuityError] = useState("");
  useEffect(() => {
    let active = true;
    void bringEarlierResearchTogether()
      .catch(() => {
        if (active)
          setContinuityError(
            "Some earlier saved research could not be brought into Your research. Its original data is preserved. Keep a backup before changing browser data.",
          );
      })
      .finally(() => {
        if (active) setStorageReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  if (!storageReady)
    return (
      <div className="app-shell research-shell">
        <div className="site-content">
          <LoadingRows label="Opening your research" />
        </div>
      </div>
    );
  return (
    <ResearchContextProvider
      snapshotId={props.requestedSnapshot ?? current.data?.snapshot_id ?? null}
    >
      {continuityError && <Notice kind="error">{continuityError}</Notice>}
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
    try {
      const key = `investigation-${snapshot}-${id}`;
      const existing = await readDocument(key);
      if (!existing)
        await saveDocument({
          id: key,
          kind: "bookmark",
          title: item?.acronym || item?.title || id,
          snapshot_id: snapshot,
          data: { accession: id },
        });
      setMessage({
        text: "Investigation saved. Find it in Your research whenever you need it.",
        error: false,
      });
    } catch (reason) {
      setMessage({ text: String(reason), error: true });
    }
  }
  async function backup() {
    try {
      downloadJson("nova-ember-research.json", await completeWorkspaceBackup());
      const next = { ...preferences, last_backup_at: new Date().toISOString() };
      await writePreferences(next);
      setPreferences(next);
      setMessage({
        text: "Research backup downloaded with your notes, conversations, analyses and preferences. Temporary uploads and live task access are not included.",
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
        text: `Restored ${count} research items as independent copies. Existing work is preserved. Saved research is available in Your research. Expired uploads may need to be added again.`,
        error: false,
      });
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
        aria-label="Restore a research backup"
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
          aria-label="Review research restore"
        >
          <h2>Review research restore</h2>
          <p>
            {preview.cases} notebooks and {preview.documents} research items ·
            version {preview.version} · exported {preview.exported_at}
          </p>
          <p>
            Your existing research stays in place. Imported work keeps its
            source references; temporary uploads may need to be added again.
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
        <LoadingRows label="Loading NASA research" />
      ) : section === "overview" ? (
        <ResearchHome
          snapshotId={snapshot}
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error}
          retry={catalog.reload}
          cases={cases}
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
      {context && section !== "agent" && section !== "overview" && (
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

function ResearchGuide() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Make the research your starting point</h1>
          <p>
            A question, the evidence behind it, and somewhere useful to go next.
          </p>
        </div>
      </div>
      <article className="reading-surface guide">
        <h2>Start with a question</h2>
        <p>
          Ask the research assistant about combustion or fire safety. It can
          find relevant NASA sources, explain experiments, compare evidence and
          help with calculations. Open the numbered sources in an answer to
          inspect its basis.
        </p>
        <Link className="text-button" href="/app/agent">
          Ask a question <ArrowRight size={16} />
        </Link>
        <h2>Discover what NASA studied</h2>
        <p>
          An investigation is a study built around a research question. Browse
          by topic or search for a material, experiment or phenomenon. Each
          investigation introduces its purpose, experimental approach and
          available sources. A research objective describes what a study set out
          to learn; it is not a measured result.
        </p>
        <Link className="text-button" href="/app/investigations">
          Explore investigations <ArrowRight size={16} />
        </Link>
        <h2>Compare the evidence</h2>
        <p>
          Select investigations to see their objectives and experimental setups
          side by side. For numerical comparisons, check the materials,
          atmosphere, flow, gravity and measurement methods. Different test
          conditions can make results unsuitable for combining.
        </p>
        <Link className="text-button" href="/app/compare">
          Compare investigations <ArrowRight size={16} />
        </Link>
        <h2>Work with data</h2>
        <p>
          Open an investigation’s data table, choose variables and preview a
          selection. Create a chart or export data with source references.
          Calculations retain their inputs and units. A fit describes the
          selected measurements; prediction for other conditions requires
          independent validation.
        </p>
        <Link className="text-button" href="/app/lab">
          Open data & models <ArrowRight size={16} />
        </Link>
        <h2>Return to your research</h2>
        <p>
          Conversations and recent activity are saved as you work. Bookmark an
          investigation or save an analysis to keep it close. Your research
          brings these together; notebooks are available when you want to write
          your own synthesis.
        </p>
        <Link className="text-button" href="/app/cases">
          Your research <ArrowRight size={16} />
        </Link>
        <h2>Keep a copy</h2>
        <p>
          Saved research is held in this browser. Download a backup in Settings
          before clearing browser data or moving devices. A backup includes
          notes, conversations, analyses and references, but cannot recover
          expired uploads or transfer live task access.
        </p>
        <Link className="text-button" href="/app/settings">
          Settings & backup <ArrowRight size={16} />
        </Link>
        <h2>What the evidence can establish</h2>
        <p>
          Nova Ember connects NASA research with its original sources. Important
          uncertainties appear with the affected value or result; source and
          method details remain available for inspection. Research evidence can
          inform safety decisions, but does not by itself certify equipment,
          operating limits or a transfer from microgravity to Earth.
        </p>
        <a
          href="https://www.nasa.gov/missions/station/iss-research/studying-combustion-and-fire-safety/"
          className="text-button"
          target="_blank"
          rel="noreferrer"
        >
          NASA’s introduction to combustion research <ExternalLink size={16} />
        </a>
      </article>
    </>
  );
}

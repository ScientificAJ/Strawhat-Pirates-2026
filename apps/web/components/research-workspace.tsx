"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
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
import { useEffect, useRef, useState } from "react";
import {
  Catalog,
  Dossier,
  downloadJson,
  family,
  request,
  useResource,
} from "../lib/api";
import {
  importWorkspace,
  listCases,
  ResearchCase,
  saveCase,
  saveTheme,
  storedTheme,
  workspaceBackup,
} from "../lib/workspace-storage";
import { CaseNotebook, newCase } from "./case-notebook";
import { Explorer, InvestigationDetail, InvestigationTable } from "./catalog";
import { ErrorState, LoadingRows, Notice, Shell } from "./chrome";
import { FlexAnalysis, Laboratory } from "./laboratory";

type Comparison = {
  snapshot_id: string;
  investigations: Dossier[];
  suitability: {
    side_by_side: string;
    quantitative_pooling: string;
    scenario_transfer: string;
  };
  conditions: { field: string; status: string; reason: string }[];
  limitations: string[];
};

export function ResearchWorkspace({
  section,
  entityId,
  initialQuery,
}: {
  section: string;
  entityId?: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const catalog = useResource<Catalog>("/v1/investigations?limit=100");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [selected, setSelected] = useState<string[]>([]);
  const [cases, setCases] = useState<ResearchCase[]>([]);
  const [message, setMessage] = useState<{
    text: string;
    error: boolean;
  } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  async function refreshCases() {
    setCases(await listCases());
  }
  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((reason: unknown) =>
        setMessage({
          text:
            reason instanceof Error
              ? reason.message
              : "Browser storage could not be opened.",
          error: true,
        }),
      );
    storedTheme()
      .then((value) => {
        if (value) setTheme(value);
      })
      .catch((reason: unknown) =>
        setMessage({
          text:
            reason instanceof Error
              ? reason.message
              : "The saved appearance could not be read. Light theme is active for this visit.",
          error: true,
        }),
      );
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    saveTheme(next).catch((reason: unknown) =>
      setMessage({
        text:
          reason instanceof Error
            ? reason.message
            : "The theme could not be saved.",
        error: true,
      }),
    );
  }

  function toggleSelection(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function saveInvestigation(id: string) {
    const investigation = catalog.data?.items.find(
      (item) => item.accession === id,
    );
    const draft = newCase(
      catalog.data?.snapshot_id ?? null,
      [id],
      `${investigation?.acronym || id} — evidence notes`,
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
          snapshot_id: draft.snapshot_id,
        },
      ],
    };
    try {
      await saveCase(value);
      await refreshCases();
      router.push(`/app/cases/${value.id}`);
      setMessage({
        text: "Case saved on this device. Back up your workspace to keep a portable copy.",
        error: false,
      });
    } catch (reason: unknown) {
      downloadJson("nova-ember-unsaved-case.json", workspaceBackup([value]));
      setMessage({
        text:
          reason instanceof Error
            ? reason.message
            : "Browser storage failed. Your case has been downloaded.",
        error: true,
      });
    }
  }

  async function backup() {
    try {
      downloadJson(
        "nova-ember-workspace.json",
        workspaceBackup(await listCases()),
      );
      setMessage({
        text: "Workspace backup downloaded. It includes your saved cases and revisions.",
        error: false,
      });
    } catch (reason: unknown) {
      setMessage({
        text:
          reason instanceof Error
            ? reason.message
            : "The workspace could not be read for backup.",
        error: true,
      });
    }
  }

  async function restore(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const count = await importWorkspace(file);
      await refreshCases();
      setMessage({
        text: `Restored ${count} ${count === 1 ? "case" : "cases"} as separate copies. Your existing cases are unchanged.`,
        error: false,
      });
      router.push("/app/cases");
    } catch (reason: unknown) {
      setMessage({
        text:
          reason instanceof Error
            ? reason.message
            : "Choose a valid Nova Ember workspace backup.",
        error: true,
      });
    }
    event.target.value = "";
  }

  return (
    <Shell
      section={section}
      snapshot={catalog.data?.snapshot_id ?? null}
      theme={theme}
      onTheme={toggleTheme}
      onBackup={backup}
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
            {message.error ? <CircleHelp size={17} /> : <Check size={17} />}
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
      {section === "overview" ? (
        <Overview
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error}
          retry={catalog.reload}
          cases={cases}
          onSave={saveInvestigation}
        />
      ) : section === "investigations" && entityId ? (
        <InvestigationDetail
          accession={entityId}
          selected={selected}
          onSelect={toggleSelection}
          onSave={saveInvestigation}
        />
      ) : section === "investigations" ? (
        <Explorer
          catalog={catalog.data}
          loading={catalog.loading}
          error={catalog.error}
          retry={catalog.reload}
          selected={selected}
          onSelect={toggleSelection}
          initialQuery={initialQuery}
        />
      ) : section === "lab" ? (
        <Laboratory tab={entityId} onSave={saveInvestigation} />
      ) : section === "cases" ? (
        <CaseNotebook
          cases={cases}
          entityId={entityId}
          snapshot={catalog.data?.snapshot_id ?? null}
          selected={selected}
          onSaved={refreshCases}
        />
      ) : section === "compare" ? (
        <Compare
          catalog={catalog.data}
          selected={selected}
          onSelect={toggleSelection}
        />
      ) : section === "agent" ? (
        <Studio />
      ) : (
        <ResearchGuide />
      )}
    </Shell>
  );
}

function Overview({
  catalog,
  loading,
  error,
  retry,
  cases,
  onSave,
}: {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  cases: ResearchCase[];
  onSave: (id: string) => void;
}) {
  const [question, setQuestion] = useState("");
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
        onSubmit={(event) => {
          event.preventDefault();
          router.push(`/app/investigations?q=${encodeURIComponent(question)}`);
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
            placeholder="Search for an investigation, material, or combustion question"
          />
          <button className="button button-primary" type="submit">
            Explore
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
          <FlexAnalysis compact onSave={onSave} />
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

function Compare({
  catalog,
  selected,
  onSelect,
}: {
  catalog: Catalog | null;
  selected: string[];
  onSelect: (id: string) => void;
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    setComparison(null);
    setError(null);
  }, [selected]);
  async function compare() {
    setLoading(true);
    setError(null);
    try {
      setComparison(
        await request<Comparison>("/v1/comparisons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ investigation_ids: selected }),
        }),
      );
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The comparison could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Compare investigations</h1>
          <p>
            Make the condition differences visible before comparing outcomes.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={selected.length < 2 || selected.length > 4 || loading}
          onClick={compare}
        >
          {loading ? "Checking evidence…" : "Check comparability"}
          <ArrowRight size={16} />
        </button>
      </div>
      <Notice>
        <strong>Choose two to four investigations.</strong>
        <p>
          Side-by-side source inspection does not establish that numerical
          outcomes can be pooled.
        </p>
      </Notice>
      {catalog && (
        <div className="comparison-picker">
          {catalog.items.map((item) => (
            <label
              key={item.accession}
              className={`comparison-choice ${selected.includes(item.accession) ? "choice-selected" : ""}`}
            >
              <input
                type="checkbox"
                disabled={loading}
                checked={selected.includes(item.accession)}
                onChange={() => onSelect(item.accession)}
              />
              <span>
                {item.acronym || item.title}
                <small className="mono">{item.accession}</small>
              </span>
            </label>
          ))}
        </div>
      )}
      {selected.length > 4 && (
        <Notice kind="caution">
          Select at most four investigations for a readable condition matrix.
        </Notice>
      )}
      {error && <ErrorState message={error} />}
      {comparison && (
        <section className="data-surface comparison-results">
          <div className="section-heading">
            <div>
              <h2>Comparability assessment</h2>
              <p>
                Source-level comparison · {comparison.investigations.length}{" "}
                investigations
              </p>
            </div>
            <span className="status status-caution">
              Quantitative pooling unsupported
            </span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Question</th>
                  <th scope="col">Evidence state</th>
                  <th scope="col">What is needed</th>
                </tr>
              </thead>
              <tbody>
                {comparison.conditions.map((condition) => (
                  <tr key={condition.field}>
                    <th scope="row" className="capitalize">
                      {condition.field}
                    </th>
                    <td>
                      {condition.status === "unknown"
                        ? "Not established"
                        : condition.status}
                    </td>
                    <td>{condition.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Notice kind="caution">
            <ul>
              {comparison.limitations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </Notice>
          <div className="button-row comparison-links">
            {comparison.investigations.map((item) => (
              <Link
                className="button button-small"
                href={`/app/investigations/${item.accession}`}
                key={item.accession}
              >
                {item.acronym || item.accession}
                <ArrowUpRight size={14} />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function Studio() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Research Studio</h1>
          <p>
            A conversation connected to inspectable evidence and scientific
            tools.
          </p>
        </div>
      </div>
      <section className="reading-surface studio-pending">
        <div className="studio-pending-mark">
          <BookOpen size={28} />
        </div>
        <h2>Begin with the evidence</h2>
        <p className="reading-text">
          Live research assistance will be connected after the local scientific
          workflows have been verified and the project’s model access is
          configured.
        </p>
        <p className="reading-text">
          You can already discover investigations, inspect the source table,
          reproduce the FLEX endpoint analysis, and keep your own research
          notes.
        </p>
        <div className="button-row">
          <Link className="button button-primary" href="/app/investigations">
            Explore investigations
            <ArrowRight size={16} />
          </Link>
          <Link className="button" href="/app/lab">
            Open the laboratory
          </Link>
        </div>
      </section>
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
          This local build starts the approved implementation plan. Source
          inspection, table-label analysis, scenario arithmetic, and personal
          cases work without live model credentials. Broader calibrated
          measurements, prediction, live assistance, and public hosting need
          their respective implementation and verification.
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

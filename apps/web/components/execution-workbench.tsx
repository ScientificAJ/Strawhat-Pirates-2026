"use client";
import { useEffect, useRef, useState } from "react";
import {
  Copy,
  Play,
  Save,
  Square,
  ArrowDownToLine,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { request, useResource } from "../lib/api";
import {
  fileDownload,
  savedArtifactDownload,
  message,
  post,
  type FrozenInput,
  type Job,
} from "../lib/laboratory-api";
import {
  listDocuments,
  readDocument,
  saveDocument,
} from "../lib/workspace-documents";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";

type Capability = {
  available: boolean;
  reason?: string;
  runtime?: string;
  image_digest?: string;
  cpu_count?: number;
  memory_bytes?: number;
  command_seconds?: number;
  session_lease_seconds?: number;
  session_deadline_seconds?: number;
};
type Session = {
  id: string;
  status?: string;
  active?: boolean;
  expires_at: string;
  deadline: string;
  terminated_at?: string | null;
  cumulative_seconds?: number;
  cell_count?: number;
};
export function ExecutionWorkbench({
  snapshotId,
  inputs = [],
  entityId,
}: {
  snapshotId: string;
  inputs?: FrozenInput[];
  entityId?: string;
}) {
  const capability = useResource<Capability>("/v1/execution/capability");
  const [language, setLanguage] = useState<"python" | "shell">("python");
  const [code, setCode] = useState(
    "# Select input files, inspect input-manifest.json, then run explicitly.\nfrom pathlib import Path\nprint(Path('/inputs/input-manifest.json').read_text())\n",
  );
  const [seed, setSeed] = useState("");
  const [extended, setExtended] = useState(false);
  const running = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [jobs, setJobs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState<string | undefined>(entityId);
  const [draftRevision, setDraftRevision] = useState<number | undefined>();
  const [pastResults, setPastResults] = useState<Job[]>([]);
  const [restoring, setRestoring] = useState(true);
  const [localFiles, setLocalFiles] = useState<
    {
      file_name: string;
      media_type: string;
      bytes_base64: string;
      origin_job_id: string;
    }[]
  >([]);
  useEffect(() => {
    let active = true;
    async function restore() {
      const doc = entityId
        ? await readDocument<Record<string, unknown>>(entityId)
        : (await listDocuments<Record<string, unknown>>("analysis")).find(
            (item) =>
              item.data.surface === "code" && item.snapshot_id === snapshotId,
          );
      if (!active) return;
      if (doc) {
        if (Array.isArray(doc.data.results))
          setPastResults(
            doc.data.results.filter(
              (value): value is Job =>
                Boolean(value) &&
                typeof value === "object" &&
                "id" in value &&
                typeof value.id === "string",
            ),
          );
        if (typeof doc.data.seed === "string") setSeed(doc.data.seed);
        if (Array.isArray(doc.data.selected_inputs))
          setSelected(
            doc.data.selected_inputs.flatMap((value) =>
              value &&
              typeof value === "object" &&
              "id" in value &&
              typeof value.id === "string"
                ? [value.id]
                : [],
            ),
          );
        setDraftId(doc.id);
        setDraftRevision(doc.revision);
        if (typeof doc.data.code === "string") setCode(doc.data.code);
        if (doc.data.language === "python" || doc.data.language === "shell")
          setLanguage(doc.data.language);
        if (typeof doc.data.session_id === "string") {
          try {
            setSession(
              await request<Session>(
                `/v1/execution/sessions/${doc.data.session_id}`,
              ),
            );
          } catch {
            setNotice(
              "The previous execution session expired. Your local code is preserved.",
            );
          }
        }
        if (Array.isArray(doc.data.job_ids))
          setJobs(
            doc.data.job_ids.filter(
              (id): id is string => typeof id === "string",
            ),
          );
      }
      setRestoring(false);
    }
    void restore().catch((reason) => {
      if (active) {
        setError(message(reason));
        setRestoring(false);
      }
    });
    return () => {
      active = false;
    };
  }, [entityId, snapshotId]);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      void listDocuments<{
        file_name: string;
        media_type: string;
        bytes_base64: string;
        origin_job_id: string;
      }>("artifact")
        .then((values) => {
          if (active)
            setLocalFiles(
              values
                .map((item) => item.data)
                .filter(
                  (item) =>
                    typeof item.bytes_base64 === "string" &&
                    jobs.includes(item.origin_job_id),
                ),
            );
        })
        .catch((reason) => {
          if (active) setError(message(reason));
        });
    refresh();
    window.addEventListener("nova-ember-workspace-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("nova-ember-workspace-changed", refresh);
    };
  }, [jobs]);
  async function save() {
    try {
      const saved = await saveDocument(
        {
          id: draftId,
          kind: "analysis",
          title: `${language === "python" ? "Python" : "Shell"} research notebook`,
          snapshot_id: snapshotId,
          data: {
            surface: "code",
            code,
            language,
            seed,
            job_ids: jobs,
            session_id: session?.id ?? null,
            selected_inputs: inputs.filter((input) =>
              selected.includes(input.id),
            ),
            results: pastResults,
          },
        },
        draftRevision,
      );
      setDraftId(saved.id);
      setDraftRevision(saved.revision);
      setNotice(
        "Saved on this browser. Code never runs automatically when restored.",
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function createSession() {
    const files = inputs.filter((input) => selected.includes(input.id));
    const created = await post<Session>("/v1/execution/sessions", {
      snapshot_id: snapshotId,
      asset_sha256: files
        .filter((input) => input.kind === "public")
        .map((input) => input.sha256),
      source_job_ids: files
        .filter((input) => input.kind === "acquired")
        .map((input) => input.id),
      upload_ids: files
        .filter((input) => input.kind === "upload")
        .map((input) => input.id),
    });
    setSession(created);
    return created;
  }
  async function start() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await createSession();
      setNotice(
        "The analysis environment is ready. Selected files stay fixed while it is active.",
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function run() {
    if (running.current || !code.trim()) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      const environment = open && session ? session : await createSession();
      const created = await post<{ id: string }>(
        `/v1/execution/sessions/${environment.id}/commands`,
        {
          language,
          code,
          profile: extended ? "extended" : "standard",
          confirmed_extended_runtime: extended,
          seed: seed === "" ? null : Number(seed),
        },
      );
      setJobs((previous) => [...previous, created.id]);
    } catch (reason) {
      setError(message(reason));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function control(action: "renew" | "end") {
    if (!session) return;
    setError(null);
    try {
      if (action === "renew") {
        setSession({
          ...session,
          ...(await post<Partial<Session>>(
            `/v1/execution/sessions/${session.id}/renew`,
            {},
          )),
        });
        setNotice("Session lease renewed within its original wall deadline.");
      } else {
        const response = await fetch(`/v1/execution/sessions/${session.id}`, {
          method: "DELETE",
        });
        if (!response.ok)
          throw new Error(
            "End request failed; reconnect and check the actual session state.",
          );
        setSession({ ...session, status: "closed", active: false });
        setNotice(
          "End requested. Queued commands are cancelled; the backend confirms teardown before another session can start.",
        );
      }
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function reconnect() {
    if (!session) return;
    try {
      setSession(
        await request<Session>(`/v1/execution/sessions/${session.id}`),
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  const open = Boolean(
    session &&
    session.status !== "closed" &&
    session.status !== "interrupted" &&
    session.active !== false,
  );
  return (
    <div className={styles.stack}>
      <section className={styles.surface}>
        <div className={styles.row}>
          <div>
            <h2>Python and shell laboratory</h2>
            <p className={styles.caption}>
              Analyze selected data with your own code. The isolated analysis
              environment starts when you run a command.
            </p>
          </div>
          <button className="button" onClick={save} disabled={restoring}>
            <Save size={16} />
            Save notebook
          </button>
        </div>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.status} role="status">
            {notice}
          </p>
        )}
        {capability.error ? (
          <p className={styles.error}>{capability.error}</p>
        ) : !capability.data ? (
          <div className={styles.skeleton} />
        ) : !capability.data.available ? (
          <p className={styles.warning}>
            Interactive execution is unavailable on this host:{" "}
            {capability.data.reason ?? "the runtime has not qualified"}. Keep
            editing and saving your code. Registered scientific calculations
            remain separate.
          </p>
        ) : (
          <details className={styles.details}>
            <summary>Environment and resource limits</summary>
            <p>
              {capability.data.runtime} · {capability.data.cpu_count} CPU ·{" "}
              {Math.round((capability.data.memory_bytes ?? 0) / 1024 / 1024)}{" "}
              MiB · {capability.data.command_seconds}s standard commands.
              Network access is disabled.
            </p>
            <p className="mono hash-value">{capability.data.image_digest}</p>
            <p>
              One session; five-minute renewable lease within a fifteen-minute
              deadline. Eight MiB of selected read-only inputs; checked outputs.
              Python state and shell variables persist during the live session.
            </p>
          </details>
        )}
        <h3>Selected input files</h3>
        {inputs.length === 0 ? (
          <p className={styles.muted}>
            No data file selected yet. You can still run code, or{" "}
            <Link href="/app/lab/data">choose a source dataset</Link> to work
            with NASA measurements.
          </p>
        ) : (
          inputs.map((input) => (
            <label className={styles.check} key={input.id}>
              <input
                type="checkbox"
                checked={selected.includes(input.id)}
                disabled={open || !input.ready}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, input.id]
                      : previous.filter((id) => id !== input.id),
                  )
                }
              />
              <span>
                {input.name}
                <small className={styles.muted}>
                  {" "}
                  · {input.kind} · {input.byte_size ?? "unknown"} bytes{" "}
                  {input.expires_at &&
                    `· expires ${new Date(input.expires_at).toLocaleString()}`}
                </small>
              </span>
            </label>
          ))
        )}
        <details className={styles.details}>
          <summary>Runtime controls</summary>
          <div className={styles.actions}>
            <button
              className="button"
              disabled={busy || open || !capability.data?.available}
              onClick={start}
            >
              Start selected session
            </button>
            {session && (
              <>
                <button
                  className="button"
                  disabled={!open}
                  onClick={() => control("renew")}
                >
                  Renew session
                </button>
                <button
                  className="button"
                  disabled={!open}
                  onClick={() => control("end")}
                >
                  <Square size={15} />
                  End session
                </button>
                <button className="button" onClick={reconnect}>
                  <RefreshCw size={15} />
                  Check session
                </button>
              </>
            )}
          </div>
          {session && (
            <p className={styles.caption}>
              Session {session.id.slice(0, 8)} · {session.status ?? "open"} ·
              lease expires {new Date(session.expires_at).toLocaleString()} ·
              hard deadline {new Date(session.deadline).toLocaleString()}
              {session.terminated_at &&
                ` · teardown confirmed ${new Date(session.terminated_at).toLocaleString()}`}
            </p>
          )}
        </details>
      </section>
      <section className={styles.surface}>
        <div className={styles.inline}>
          <label className={styles.field}>
            Language
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as "python" | "shell")
              }
            >
              <option value="python">Python</option>
              <option value="shell">Shell</option>
            </select>
          </label>
          <label className={styles.field}>
            Optional random seed
            <input
              value={seed}
              type="number"
              min={0}
              max={4294967295}
              onChange={(event) => setSeed(event.target.value)}
            />
          </label>
        </div>
        <label className={styles.field}>
          Code
          <textarea
            className={styles.editor}
            spellCheck={false}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            aria-describedby="code-editing-help"
          />
        </label>
        <p id="code-editing-help" className={styles.caption}>
          Plain-text editor. Tab moves to the next control; code is not
          reformatted or executed while typing. A seed alone does not guarantee
          reproducibility.
        </p>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={extended}
            onChange={(event) => setExtended(event.target.checked)}
          />
          Confirm a longer command limit of 90 seconds for this execution.
        </label>
        <div className={styles.actions}>
          <button
            className="button button-primary"
            disabled={
              !capability.data?.available || busy || restoring || !code.trim()
            }
            onClick={run}
          >
            <Play size={15} />
            {busy ? "Submitting…" : "Run selected code"}
          </button>
          <button
            className="button"
            onClick={() =>
              void navigator.clipboard
                .writeText(code)
                .then(() => setNotice("Exact code copied."))
                .catch(() =>
                  setError(
                    "Copy is unavailable. Export the code file instead.",
                  ),
                )
            }
          >
            <Copy size={15} />
            Copy code
          </button>
          <button
            className="button"
            onClick={() =>
              fileDownload(
                language === "python" ? "analysis.py" : "analysis.sh",
                code,
                "text/plain",
              )
            }
          >
            <ArrowDownToLine size={15} />
            Export code
          </button>
        </div>
      </section>
      {jobs.map((id) => (
        <JobMonitor
          key={id}
          id={id}
          onComplete={(job) =>
            setPastResults((previous) =>
              previous.some((value) => value.id === job.id)
                ? previous
                : [...previous, job],
            )
          }
        />
      ))}
      {localFiles.length > 0 && (
        <section className={styles.surface}>
          <h3>Output files retained on this browser</h3>
          {localFiles.map((file, index) => (
            <button
              key={index}
              className="button button-small"
              onClick={() => savedArtifactDownload(file)}
            >
              {file.file_name} · download local copy
            </button>
          ))}
        </section>
      )}
      {pastResults.length > 0 && (
        <details className={styles.details}>
          <summary>Locally saved output records ({pastResults.length})</summary>
          {pastResults.map((result) => (
            <pre key={result.id} className={styles.output}>
              {JSON.stringify(result, null, 2)}
            </pre>
          ))}
        </details>
      )}
      {pastResults.length > 0 && (
        <button className="button" onClick={save}>
          Save local outputs before remote expiry
        </button>
      )}
    </div>
  );
}

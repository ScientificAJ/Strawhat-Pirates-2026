"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  useResearchContext,
  type WorkspaceContext,
} from "../lib/research-context";
import { ArrowDownToLine, RefreshCw, Trash2 } from "lucide-react";
import { request, useResource } from "../lib/api";
import {
  clearBrowserWorkspace,
  clearAllLocalWorkspaces,
  defaultPreferences,
  readPreferences,
  writePreferences,
  type Preferences,
} from "../lib/workspace-backup";
import {
  listDocuments,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import { listCases, type ResearchCase } from "../lib/workspace-storage";
import { Notice } from "./chrome";
import { isRecord } from "./artifact-view";

export function WorkspaceSettings({
  onBackup,
  onRestore,
}: {
  onBackup: () => void;
  onRestore: () => void;
}) {
  const { updateContext } = useResearchContext();
  const [investigationWatches, setInvestigationWatches] = useState<
    WorkspaceDocument[]
  >([]);
  const [savedScopes, setSavedScopes] = useState<WorkspaceDocument[]>([]);
  const [watches, setWatches] = useState<
    { document: WorkspaceDocument; researchCase: ResearchCase | undefined }[]
  >([]);
  const [contextMessage, setContextMessage] = useState("");
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [removeRemote, setRemoveRemote] = useState(true);
  const [removeAll, setRemoveAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [storage, setStorage] = useState<{
    usage?: number;
    quota?: number;
    persisted?: boolean;
  }>({});
  const usage = useResource<Record<string, unknown>>("/v1/usage/models");
  const models = useResource<Record<string, unknown>>(
    "/v1/capabilities/models",
  );
  useEffect(() => {
    void readPreferences()
      .then(setPreferences)
      .catch((reason) => setError(String(reason)));
    if (navigator.storage?.estimate)
      void navigator.storage
        .estimate()
        .then((value) => setStorage((current) => ({ ...current, ...value })))
        .catch(() => setStorage({}));
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void Promise.all([listDocuments(), listCases()])
        .then(([documents, cases]) => {
          if (!active) return;
          setInvestigationWatches(
            documents.filter(
              (item) => item.kind === "watch" && item.data.enabled !== false,
            ),
          );
          setSavedScopes(
            documents.filter(
              (item) =>
                item.kind === "research_context" &&
                item.id !== "active-research-context",
            ),
          );
          setWatches(
            documents
              .filter(
                (item) =>
                  item.kind === "case_research" && item.data.watch === true,
              )
              .map((item) => ({
                document: item,
                researchCase: cases.find(
                  (researchCase) =>
                    item.id === `case-research-${researchCase.id}`,
                ),
              })),
          );
        })
        .catch((reason) => setError(String(reason)));
    };
    refresh();
    window.addEventListener("nova-ember-workspace-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("nova-ember-workspace-changed", refresh);
    };
  }, []);
  function restoreScope(document: WorkspaceDocument) {
    const saved = document.data.context;
    if (
      !isRecord(saved) ||
      typeof saved.snapshot_id !== "string" ||
      !/^[a-f0-9]{64}$/.test(saved.snapshot_id) ||
      saved.schema_version !== 1 ||
      typeof saved.context_version !== "string" ||
      (Array.isArray(saved.selected_private_inputs) &&
        !saved.selected_private_inputs.every(
          (input) =>
            isRecord(input) &&
            typeof input.expected_sha256 === "string" &&
            /^[a-f0-9]{64}$/.test(input.expected_sha256),
        )) ||
      ![
        "investigations",
        "selected_sources",
        "selected_evidence",
        "selected_artifacts",
        "selected_private_inputs",
      ].every((key) => !(key in saved) || Array.isArray(saved[key]))
    ) {
      setError(
        "This saved selection is invalid. Its original document was preserved.",
      );
      return;
    }
    updateContext({
      investigations: [],
      selected_sources: [],
      selected_evidence: [],
      selected_artifacts: [],
      scenario: {},
      focused_view: null,
      active_artifact_id: null,
      case_revision: null,
      ...saved,
      schema_version: 1,
      snapshot_id: saved.snapshot_id,
      context_version: crypto.randomUUID(),
      selected_private_inputs: Array.isArray(saved.selected_private_inputs)
        ? saved.selected_private_inputs.filter(isRecord).map((input) => ({
            ...input,
            expected_sha256: String(input.expected_sha256),
            consent_to_model: false,
          }))
        : [],
    } as WorkspaceContext);
    setContextMessage(
      "The saved selection is active. Temporary private inputs need renewed consent and may need to be selected again after expiry. No analysis or model request was started.",
    );
  }
  function change<K extends keyof Preferences>(key: K, value: Preferences[K]) {
    setPreferences((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await writePreferences(preferences);
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Settings could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function persist() {
    try {
      const persisted = await navigator.storage.persist();
      setStorage((current) => ({ ...current, persisted }));
    } catch {
      setError(
        "Persistent browser storage could not be requested. Keep a workspace backup.",
      );
    }
  }
  async function clear() {
    setBusy(true);
    setError(null);
    try {
      if (removeRemote) {
        const jobs = await listDocuments("remote_job");
        const deletions: Promise<unknown>[] = jobs.map((item) =>
          fetch(`/v1/workflows/${String(item.data.job_id)}`, {
            method: "DELETE",
            credentials: "same-origin",
          }).then((response) => {
            if (!response.ok && ![404, 410].includes(response.status))
              throw new Error("A temporary operation could not be removed.");
          }),
        );
        const uploads = await fetch("/v1/uploads", {
          credentials: "same-origin",
        });
        if (!uploads.ok && ![404, 410].includes(uploads.status))
          throw new Error(
            "Temporary uploads could not be listed. Local work was preserved.",
          );
        if (uploads.ok) {
          const body: unknown = await uploads.json();
          const files =
            isRecord(body) && Array.isArray(body.items)
              ? body.items
              : isRecord(body) && Array.isArray(body.uploads)
                ? body.uploads
                : [];
          for (const file of files)
            if (isRecord(file))
              deletions.push(
                request(`/v1/uploads/${String(file.upload_id)}`, {
                  method: "DELETE",
                }),
              );
        }
        const voices = await fetch("/v1/voice/sessions", {
          credentials: "same-origin",
        });
        if (!voices.ok && ![404, 410].includes(voices.status))
          throw new Error(
            "Voice sessions could not be listed. Local work was preserved.",
          );
        if (voices.ok) {
          const body: unknown = await voices.json();
          if (isRecord(body) && Array.isArray(body.sessions))
            for (const voice of body.sessions)
              if (
                isRecord(voice) &&
                ["active", "creating", "uncertain"].includes(
                  String(voice.status),
                )
              )
                deletions.push(
                  request(`/v1/voice/sessions/${String(voice.id)}/controls`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      operation_id: crypto.randomUUID(),
                      expected_context_version: voice.context_version,
                      action: "end",
                    }),
                  }),
                );
        }
        const results = await Promise.allSettled(deletions);
        if (results.some((result) => result.status === "rejected"))
          throw new Error(
            "Some temporary server data could not be removed. Local work was preserved. Retry while this browser still has access, or let the stated expiry remove it.",
          );
      }
      if (removeAll) await clearAllLocalWorkspaces();
      else await clearBrowserWorkspace();
      window.location.assign("/app");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Data could not be cleared.",
      );
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Workspace settings</h1>
          <p>Research preferences and recovery for this browser.</p>
        </div>
      </div>
      <form className="settings-form" onSubmit={save}>
        <section>
          <h2>Appearance and accessibility</h2>
          <div className="settings-fields">
            <label>
              Appearance
              <select
                value={preferences.theme}
                onChange={(event) =>
                  change("theme", event.target.value as Preferences["theme"])
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System preference</option>
              </select>
            </label>
            <label>
              Table density
              <select
                value={preferences.density}
                onChange={(event) =>
                  change(
                    "density",
                    event.target.value as Preferences["density"],
                  )
                }
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={preferences.reduce_transparency}
                onChange={(event) =>
                  change("reduce_transparency", event.target.checked)
                }
              />
              Reduce transparency
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={preferences.reduce_motion}
                onChange={(event) =>
                  change("reduce_motion", event.target.checked)
                }
              />
              Reduce motion
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={preferences.compact_rail}
                onChange={(event) =>
                  change("compact_rail", event.target.checked)
                }
              />
              Use compact navigation on larger screens
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={preferences.command_shortcut}
                onChange={(event) =>
                  change("command_shortcut", event.target.checked)
                }
              />
              Enable Cmd / Ctrl K for commands
            </label>
          </div>
        </section>
        <section>
          <h2>Research preferences</h2>
          <div className="settings-fields">
            <label>
              Preferred units
              <select
                value={preferences.units}
                onChange={(event) =>
                  change("units", event.target.value as Preferences["units"])
                }
              >
                <option value="source">Original source units</option>
                <option value="si">Reviewed SI values where available</option>
              </select>
            </label>
            <label>
              Summary depth
              <select
                value={preferences.summary_depth}
                onChange={(event) =>
                  change(
                    "summary_depth",
                    event.target.value as Preferences["summary_depth"],
                  )
                }
              >
                <option value="brief">Brief</option>
                <option value="technical">Technical</option>
                <option value="methods">Methods</option>
              </select>
            </label>
            <label>
              Default evidence scope
              <select
                value={preferences.evidence_scope}
                onChange={(event) =>
                  change(
                    "evidence_scope",
                    event.target.value as Preferences["evidence_scope"],
                  )
                }
              >
                <option value="retained">Retained sources first</option>
                <option value="catalog">Whole catalog with availability</option>
              </select>
            </label>
          </div>
          <p className="field-help">
            Changing display units does not resolve missing calibration,
            composition basis or experimental conditions. Original values remain
            inspectable.
          </p>
        </section>
        {error && <Notice kind="error">{error}</Notice>}
        <div className="notebook-actions">
          <button
            type="submit"
            className="button button-primary"
            disabled={busy}
          >
            {busy ? "Saving…" : "Save preferences"}
          </button>
          {saved && (
            <span role="status">Preferences saved on this device.</span>
          )}
        </div>
      </form>
      <section className="settings-section">
        <h2>AI and budgets</h2>
        {models.error ? (
          <Notice kind="error">
            {models.error}
            <button className="button button-small" onClick={models.reload}>
              Retry capabilities
            </button>
          </Notice>
        ) : (
          <p>
            OpenAI:{" "}
            <strong>
              {models.data?.configured
                ? "Configured"
                : models.loading
                  ? "Checking…"
                  : "Unavailable"}
            </strong>
            . Reasoning uses GPT-6.1 Sol or Terra according to task complexity.
          </p>
        )}
        <p>
          Only deliberately selected context is submitted. Browsing, local
          saving, registered calculations and local Python work without model
          inference.
        </p>
        {usage.data && (
          <dl className="definition-grid">
            <dt>Committed / reserved today (UTC)</dt>
            <dd>${String(usage.data.committed_or_reserved_usd)}</dd>
            <dt>Server request allowance</dt>
            <dd>${String(usage.data.request_limit_usd)}</dd>
            <dt>Server daily allowance</dt>
            <dd>${String(usage.data.daily_limit_usd)}</dd>
            <dt>Requests with uncertain final usage</dt>
            <dd>{String(usage.data.uncertain_requests)}</dd>
          </dl>
        )}
        <button className="button button-small" onClick={usage.reload}>
          <RefreshCw size={15} />
          Refresh usage
        </button>
        <p className="field-help">
          Published-rate estimates and reservations are distinct from the
          provider invoice. Studio and voice show the consequences of a request
          before it starts.
        </p>
      </section>
      <section className="settings-section">
        <h2>Workspace backups and storage</h2>
        <p>
          Cases, saved views, sessions, revisions, notes and preferences live in
          this browser profile. Clearing site data, private browsing, browser
          eviction or loss of this device can erase unexported work. Anyone
          using this same browser profile can open it.
        </p>
        <div className="inline-actions">
          <button className="button" onClick={onBackup}>
            <ArrowDownToLine size={16} />
            Back up workspace
          </button>
          <button className="button" onClick={onRestore}>
            Restore workspace
          </button>
          <button
            className="button"
            onClick={persist}
            disabled={
              typeof navigator === "undefined" || !navigator.storage?.persist
            }
          >
            Request persistent storage
          </button>
        </div>
        <p>
          {storage.usage !== undefined
            ? `${(storage.usage / 1048576).toFixed(1)} MiB used`
            : "Storage estimate unavailable"}
          {storage.quota !== undefined &&
            ` of ${(storage.quota / 1048576).toFixed(0)} MiB reported by this browser`}
          .{" "}
          {storage.persisted === true
            ? "Persistent storage was granted."
            : storage.persisted === false
              ? "The browser did not grant persistent storage."
              : "Backups remain necessary."}
        </p>
        <p>
          Last backup:{" "}
          {preferences.last_backup_at
            ? new Date(preferences.last_backup_at).toLocaleString()
            : "No backup recorded in this workspace"}
          . Restore creates independent copies; it does not synchronize devices
          or recover expired remote processing.
        </p>
      </section>
      <section className="settings-section">
        <h2>Evidence watches</h2>
        <p>
          Watched cases check public source changes when opened or refreshed. A
          closed browser sends no alerts. Review affected conclusions in the
          case before adopting a new source version.
        </p>
        {watches.length ? (
          <ul>
            {watches.map(({ document, researchCase }) => (
              <li key={document.id}>
                {researchCase ? (
                  <Link href={`/app/cases/${researchCase.id}`}>
                    {researchCase.title}
                  </Link>
                ) : (
                  <span>
                    {document.title} · Original case is unavailable in this
                    workspace
                  </span>
                )}{" "}
                · snapshot {document.snapshot_id?.slice(0, 12) ?? "not pinned"}
              </li>
            ))}
          </ul>
        ) : (
          <p>
            No cases are watched in this workspace. Enable a watch in a case’s
            Evidence changes section.
          </p>
        )}
        {investigationWatches.length > 0 && (
          <>
            <h3>Watched investigations</h3>
            <ul>
              {investigationWatches.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/app/investigations/${String(item.data.accession)}?section=sources&snapshot=${item.snapshot_id}`}
                  >
                    {String(item.data.accession)} · source watch
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link className="text-button" href="/app/cases">
          Open research cases
        </Link>
      </section>
      {savedScopes.length > 0 && (
        <section className="settings-section">
          <h2>Selections from workspace backups</h2>
          <p>
            Copied selections stay separate from the active scope. Choose one to
            resume its exact source snapshot and saved views. This changes the
            selection only; it does not send data to a model.
          </p>
          <ul>
            {savedScopes.map((item) => (
              <li key={item.id}>
                {item.title} · {item.snapshot_id?.slice(0, 12)}
                <button
                  className="button button-small"
                  onClick={() => restoreScope(item)}
                >
                  Use this saved selection
                </button>
              </li>
            ))}
          </ul>
          {contextMessage && <p role="status">{contextMessage}</p>}
        </section>
      )}
      <section className="settings-section">
        <h2>Privacy and retention</h2>
        <p>
          Temporary remote jobs, private uploads and voice text have their own
          stated expiry, normally 24 hours. Closing a tab does not cancel a
          computation. Save selected results locally before expiry. Backup files
          exclude credentials and active server jobs.
        </p>
        <button
          className="button button-danger"
          onClick={() => setConfirm(true)}
        >
          <Trash2 size={16} />
          Clear this workspace
        </button>
      </section>
      {confirm && (
        <div
          className="inline-confirmation"
          role="region"
          aria-label="Clear workspace confirmation"
        >
          <h2>Clear this local workspace?</h2>
          <p>
            This removes its cases, research documents, revisions and
            preferences. Other local workspaces remain. Download a backup before
            continuing.
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={removeAll}
              onChange={(event) => setRemoveAll(event.target.checked)}
            />
            Remove all Nova Ember local workspaces in this browser profile
          </label>
          {removeAll && (
            <p>
              Every local workspace is selected. Back up each workspace before
              continuing; the button below downloads the active workspace only.
              Browser receipts are controlled separately by temporary-data
              deletion.
            </p>
          )}
          <div className="inline-actions">
            <button className="button" onClick={onBackup}>
              Back up before clearing
            </button>
            <button className="button" onClick={() => setConfirm(false)}>
              Keep this workspace
            </button>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={removeRemote}
              onChange={(event) => setRemoveRemote(event.target.checked)}
            />
            Also remove this workspace’s remembered server jobs, all temporary
            uploads accessible to this browser, and end its voice sessions
            (including other local workspaces)
          </label>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={clear}
          >
            {busy
              ? "Removing selected data…"
              : removeAll
                ? "Clear all local workspaces"
                : "Clear selected workspace"}
          </button>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Save, Trash2 } from "lucide-react";
import { request } from "../lib/api";
import {
  listDocuments,
  readDocument,
  saveDocument,
  deleteDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import { rememberJob } from "../lib/private-jobs";
import { JobMonitor } from "./job-monitor";
import type { Job } from "../lib/laboratory-api";
import { Notice } from "./chrome";

export function JobsBoard({ id }: { id?: string }) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [selected, setSelected] = useState(id ?? "");
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = useCallback(() => {
    void listDocuments("remote_job")
      .then(setDocuments)
      .catch((reason) => setError(String(reason)));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("nova-ember-jobs-changed", refresh);
    return () => window.removeEventListener("nova-ember-jobs-changed", refresh);
  }, [refresh]);
  const complete = useCallback(
    (_job: Job) => {
      refresh();
    },
    [refresh],
  );
  async function reconnect(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const job = await request<Job>(`/v1/workflows/${manual}`);
      await rememberJob(job);
      setSelected(job.id);
      setManual("");
      refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Temporary access is unavailable to this browser.",
      );
    }
  }
  async function remove(jobId: string) {
    if (
      !window.confirm(
        "Delete this temporary operation and its server outputs? Saved local copies remain.",
      )
    )
      return;
    try {
      await request(`/v1/workflows/${jobId}`, { method: "DELETE" });
      const existing = await readDocument(`job-${jobId}`);
      if (existing) await deleteDocument(existing.id, existing.revision);
      if (selected === jobId) setSelected("");
      refresh();
      setMessage("Temporary server access and outputs were removed.");
    } catch (reason) {
      setError(String(reason));
    }
  }
  async function saveResult(jobId: string) {
    try {
      const job = await request<Job>(`/v1/workflows/${jobId}`);
      const data = job.result ?? job.partial_result;
      if (!data)
        throw new Error(
          "There is no retained result yet. Keep following its progress.",
        );
      await saveDocument({
        kind: "analysis",
        title: `${job.kind ?? "Scientific operation"} ${new Date().toLocaleDateString()}`,
        snapshot_id: job.snapshot_id ?? null,
        data: {
          result: data,
          scientific_origin: "recorded_operation",
          incomplete: job.status !== "succeeded",
          source_job_id: job.id,
          saved_at: new Date().toISOString(),
        },
      });
      setMessage(
        "The result and its source references are saved in Your research, including after the temporary task expires.",
      );
    } catch (reason) {
      setError(String(reason));
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Running tasks</h1>
          <p>Follow calculations, exports and research while they run.</p>
        </div>
        <button className="button" onClick={refresh}>
          <RefreshCw size={16} />
          Refresh list
        </button>
      </div>
      <p className="muted">
        Tasks can keep running when you leave the page. Save a result you want
        to keep before its expiry.
      </p>
      {error && <Notice kind="error">{error}</Notice>}
      {message && <p role="status">{message}</p>}
      <div className="jobs-layout">
        <section>
          <h2>Your recent tasks</h2>
          {documents.length === 0 ? (
            <p className="empty-state">
              No tasks yet. Calculations, exports and assistant requests appear
              here as you work.
            </p>
          ) : (
            <ul className="job-list">
              {documents.map((document) => {
                const jobId = String(document.data.job_id);
                return (
                  <li key={document.id}>
                    <button
                      className="job-select"
                      aria-current={selected === jobId ? "true" : undefined}
                      onClick={() => setSelected(jobId)}
                    >
                      <strong>{document.title}</strong>
                      <span>
                        {String(
                          document.data.status ?? "Last state unavailable",
                        ).replaceAll("_", " ")}
                      </span>
                      <small>
                        {new Date(document.updated_at).toLocaleString()} · This
                        browser
                      </small>
                      <ArrowRight size={16} />
                    </button>
                    <div className="inline-actions">
                      <button
                        className="button button-small"
                        onClick={() => void saveResult(jobId)}
                      >
                        <Save size={14} />
                        Save result
                      </button>
                      <button
                        className="button button-small"
                        onClick={() => void remove(jobId)}
                      >
                        <Trash2 size={14} />
                        Delete temporary data
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <details className="artifact-details">
            <summary>Reconnect using an operation ID</summary>
            <p>
              An ID is not a credential. This browser must still hold its
              temporary receipt.
            </p>
            <form className="inline-actions" onSubmit={reconnect}>
              <label>
                Operation ID
                <input
                  required
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  pattern="[0-9a-f-]{36}"
                  placeholder="UUID of an operation from this browser"
                />
              </label>
              <button className="button" type="submit">
                Reconnect
              </button>
            </form>
          </details>
        </section>
        <section>
          {selected ? (
            <JobMonitor key={selected} id={selected} onComplete={complete} />
          ) : (
            <div className="empty-state">
              <h2>Follow a task</h2>
              <p>
                Choose a task to see its progress, result or options to stop and
                recover it.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

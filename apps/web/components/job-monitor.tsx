"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Square, RefreshCw } from "lucide-react";
import { request } from "../lib/api";
import { rememberJob } from "../lib/private-jobs";
import {
  downloadArtifact,
  keepArtifact,
  fetchEvents,
  message,
  post,
  readable,
  type Job,
  type JobEvent,
} from "../lib/laboratory-api";
import styles from "./laboratory-workbench.module.css";

export function useScientificJob(id: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    sequence.current = 0;
    setJob(null);
    setEvents([]);
    setError(null);
    async function update() {
      try {
        const value = await request<Job>(`/v1/workflows/${id}`, {
          signal: controller.signal,
        });
        const additions = await fetchEvents(
          id!,
          sequence.current,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setJob(value);
        setError(null);
        if (additions.length) {
          sequence.current = Math.max(
            sequence.current,
            ...additions.map((event) => event.sequence),
          );
          setEvents((previous) => {
            const merged = new Map(
              previous.map((event) => [event.sequence, event]),
            );
            for (const event of additions) merged.set(event.sequence, event);
            return [...merged.values()].sort((a, b) => a.sequence - b.sequence);
          });
        }
        if (["queued", "running", "waiting_approval"].includes(value.status))
          timer = setTimeout(update, 1200);
      } catch (reason) {
        if (!controller.signal.aborted) setError(message(reason));
      }
    }
    void update();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, retry]);
  return { job, events, error, reload: () => setRetry((value) => value + 1) };
}
export function JobMonitor({
  id,
  onComplete,
  compact = false,
}: {
  id: string;
  onComplete?: (job: Job) => void;
  compact?: boolean;
}) {
  const { job, events, error, reload } = useScientificJob(id);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [retained, setRetained] = useState<string[]>([]);
  const complete = useRef<string | null>(null);
  useEffect(() => {
    if (
      job &&
      !["queued", "running", "waiting_approval"].includes(job.status) &&
      complete.current !== job.id
    ) {
      complete.current = job.id;
      void rememberJob(job);
      onComplete?.(job);
    }
  }, [job, onComplete]);
  async function cancel() {
    try {
      await post(`/v1/workflows/${id}/cancel`, {});
      reload();
    } catch (reason) {
      setOperationError(message(reason));
    }
  }
  async function approve() {
    try {
      await post(`/v1/workflows/${id}/approve`, {
        expected_revision: job?.approval_revision,
        inputs_sha256: job?.approval?.inputs_sha256,
      });
      reload();
    } catch (reason) {
      setOperationError(message(reason));
    }
  }
  const result = job?.result ?? job?.partial_result;
  const files = Array.isArray(result?.artifacts)
    ? result.artifacts
    : result?.artifact && typeof result.artifact === "object"
      ? [result.artifact]
      : [];
  const output = events
    .filter((event) => event.event_type === "execution_output")
    .map((event) => readable(event.payload.text))
    .join("");
  return (
    <section
      className={compact ? styles.stack : styles.surface}
      aria-label="Scientific job"
    >
      <div className={styles.row}>
        <h3 role="status">
          {job
            ? ({
                queued: "Waiting to start",
                running: "Working on your result…",
                waiting_approval: "Review before continuing",
                succeeded: files.length
                  ? "Your download is ready"
                  : "Result ready",
                failed: "This task could not complete",
                cancelled: "Task stopped",
                interrupted: "Task interrupted",
              }[job.status] ?? job.status.replaceAll("_", " "))
            : "Connecting to your task…"}
        </h3>
      </div>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
          <button className="button button-small" onClick={reload}>
            <RefreshCw size={14} />
            Reconnect
          </button>
        </div>
      )}
      {operationError && (
        <p role="alert" className={styles.error}>
          {operationError}
        </p>
      )}
      {job?.error_code && (
        <p className={styles.error} role="alert">
          The task did not finish: {job.error_code.replaceAll("_", " ")}. Your
          inputs remain available; check the details before trying again.
        </p>
      )}
      {job?.partial_result && (
        <p className={styles.warning}>
          Incomplete output retained. This job did not publish a complete
          result.
        </p>
      )}
      {job?.status === "waiting_approval" && (
        <div className={styles.warning}>
          <p>
            Review the selected inputs before submitting this exact operation.
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I confirm the selected private data and operation.
          </label>
          <button className="button" disabled={!confirmed} onClick={approve}>
            Approve selected operation
          </button>
        </div>
      )}
      {output && (
        <pre className={styles.output} aria-label="Streamed execution output">
          {output}
        </pre>
      )}
      {result && (
        <>
          <div className={styles.summary}>
            {typeof result.exit_code === "number" && (
              <span>
                Exit code <strong>{result.exit_code}</strong>
              </span>
            )}
            {job?.expires_at && (
              <span>
                Download available until{" "}
                {new Date(job.expires_at).toLocaleString()}
              </span>
            )}
          </div>
          {typeof result.stdout === "string" && !output && (
            <pre className={styles.output}>{result.stdout}</pre>
          )}
          {typeof result.stderr === "string" && Boolean(result.stderr) && (
            <pre className={styles.output} aria-label="Execution errors">
              {result.stderr}
            </pre>
          )}
          {files.map((item, index) => {
            if (!item || typeof item !== "object") return null;
            const file = item as Record<string, unknown>;
            return (
              <div key={index} className={styles.actions}>
                <button
                  className="button button-small"
                  disabled={retained.includes(
                    String(file.id ?? file.artifact_id),
                  )}
                  onClick={() =>
                    void keepArtifact(
                      id,
                      String(file.id ?? file.artifact_id),
                      String(
                        file.file_name ??
                          file.filename ??
                          `artifact-${index + 1}`,
                      ),
                      typeof file.sha256 === "string" ? file.sha256 : undefined,
                    )
                      .then(() =>
                        setRetained((previous) => [
                          ...previous,
                          String(file.id ?? file.artifact_id),
                        ]),
                      )
                      .catch((reason) => setOperationError(message(reason)))
                  }
                >
                  {retained.includes(String(file.id ?? file.artifact_id))
                    ? "Copy saved"
                    : "Save a copy"}
                </button>
                <button
                  className="button button-small"
                  onClick={() =>
                    void downloadArtifact(
                      id,
                      String(file.id ?? file.artifact_id),
                      String(
                        file.file_name ??
                          file.filename ??
                          `artifact-${index + 1}`,
                      ),
                    ).catch((reason) => setOperationError(message(reason)))
                  }
                >
                  <ArrowDownToLine size={14} />
                  Download{" "}
                  {readable(
                    file.file_name ?? file.filename ?? `file ${index + 1}`,
                  )}
                </button>
              </div>
            );
          })}
          <details className={styles.details}>
            <summary>Inspect result and reproducibility record</summary>
            <pre>{JSON.stringify(result, null, 2)}</pre>
          </details>
        </>
      )}
      {events.length > 0 && (
        <details className={styles.details}>
          <summary>Task details ({events.length})</summary>
          <ol>
            {events.map((event) => (
              <li key={event.sequence}>
                {event.event_type.replaceAll("_", " ")}
                <small>
                  {" "}
                  {event.created_at &&
                    new Date(event.created_at).toLocaleTimeString()}
                </small>
                {event.event_type !== "execution_output" && (
                  <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
      {job &&
        ["queued", "running", "waiting_approval"].includes(job.status) && (
          <button className="button button-small" onClick={cancel}>
            <Square size={14} />
            Cancel computation
          </button>
        )}
      {job && ["queued", "running"].includes(job.status) && (
        <p className={styles.caption}>
          You can leave this page and follow progress in Running tasks.
        </p>
      )}
      <details className={styles.details}>
        <summary>Task reference</summary>
        <code>{id}</code>
      </details>
    </section>
  );
}

"use client";

import { readDocument, saveDocument } from "./workspace-documents";
export async function rememberJob(operation: unknown): Promise<void> {
  if (
    !operation ||
    typeof operation !== "object" ||
    !("id" in operation) ||
    typeof operation.id !== "string" ||
    !/^[0-9a-f-]{36}$/.test(operation.id)
  )
    return;
  const value = operation as Record<string, unknown>;
  try {
    const existing = await readDocument(`job-${operation.id}`);
    await saveDocument(
      {
        id: `job-${operation.id}`,
        kind: "remote_job",
        title: String(value.kind ?? "Scientific operation").replaceAll(
          "_",
          " ",
        ),
        snapshot_id:
          typeof value.snapshot_id === "string" ? value.snapshot_id : null,
        data: {
          job_id: operation.id,
          kind: value.kind,
          status: value.status,
          started_at: value.created_at ?? new Date().toISOString(),
          expires_at: value.expires_at,
        },
      },
      existing?.revision ?? 0,
    );
    window.dispatchEvent(new Event("nova-ember-jobs-changed"));
  } catch (reason) {
    window.dispatchEvent(
      new CustomEvent("nova-ember-storage-warning", {
        detail: `The operation started, but its reconnect link could not be saved. Keep this page open and save the result. ${reason instanceof Error ? reason.message : ""}`,
      }),
    );
  }
}

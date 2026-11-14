"use client";

import { openWorkspaceDatabase } from "./workspace-storage";

export type DocumentRevision<T = Record<string, unknown>> = {
  revision: number;
  saved_at: string;
  title: string;
  snapshot_id: string | null;
  data: T;
};
export type WorkspaceDocument<T = Record<string, unknown>> = {
  id: string;
  kind: string;
  title: string;
  snapshot_id: string | null;
  data: T;
  revision: number;
  created_at: string;
  updated_at: string;
  revisions: DocumentRevision<T>[];
};
export type DocumentInput<T = Record<string, unknown>> = Pick<
  WorkspaceDocument<T>,
  "kind" | "title" | "data"
> &
  Partial<Omit<WorkspaceDocument<T>, "kind" | "title" | "data">>;

export class WorkspaceConflict extends Error {
  constructor() {
    super(
      "This item changed in another tab. Reload its latest revision before saving your draft.",
    );
    this.name = "WorkspaceConflict";
  }
}

const credentials = new Set([
  "receipt",
  "job_receipt",
  "browser_receipt",
  "receipt_sha256",
  "openai_api_key",
  "api_key",
  "authorization",
  "client_secret",
  "ephemeral_key",
  "sdp_offer",
  "sdp_answer",
]);

export function researchData<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (name, item) => {
      if (typeof item === "number" && !Number.isFinite(item))
        throw new Error(
          "Non-finite values cannot be saved as scientific results. Keep the original input and mark its validity explicitly.",
        );
      return credentials.has(name.toLowerCase()) ? undefined : item;
    }),
  ) as T;
}

export function workspaceChanged() {
  window.dispatchEvent(new Event("nova-ember-workspace-changed"));
}

export async function listDocuments<T = Record<string, unknown>>(
  kind?: string,
): Promise<WorkspaceDocument<T>[]> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readonly");
    const request = tx.objectStore("documents").getAll();
    tx.oncomplete = () => {
      db.close();
      const values = request.result as WorkspaceDocument<T>[];
      resolve(
        values
          .filter((item) => !kind || item.kind === kind)
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
      );
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Saved research could not be read. Keep this tab open and try again.",
        ),
      );
    };
  });
}

export async function readDocument<T = Record<string, unknown>>(
  id: string,
): Promise<WorkspaceDocument<T> | null> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readonly");
    const request = tx.objectStore("documents").get(id);
    tx.oncomplete = () => {
      db.close();
      resolve((request.result as WorkspaceDocument<T> | undefined) ?? null);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error("This saved item could not be read."));
    };
  });
}

export async function saveDocument<T = Record<string, unknown>>(
  input: DocumentInput<T>,
  expectedRevision?: number,
): Promise<WorkspaceDocument<T>> {
  const id = input.id ?? crypto.randomUUID();
  const data = researchData(input.data);
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    const store = tx.objectStore("documents");
    const request = store.get(id);
    let result: WorkspaceDocument<T>;
    let conflict = false;
    request.onsuccess = () => {
      const current = request.result as WorkspaceDocument<T> | undefined;
      const expected = expectedRevision ?? input.revision;
      if (
        (current && current.revision !== expected) ||
        (!current && expected !== undefined && expected !== 0)
      ) {
        conflict = true;
        tx.abort();
        return;
      }
      const time = new Date().toISOString();
      const revision = (current?.revision ?? 0) + 1;
      result = {
        id,
        kind: input.kind,
        title: input.title,
        snapshot_id: input.snapshot_id ?? null,
        data,
        revision,
        created_at: current?.created_at ?? input.created_at ?? time,
        updated_at: time,
        revisions: [
          ...(current?.revisions ?? []),
          {
            revision,
            saved_at: time,
            title: input.title,
            snapshot_id: input.snapshot_id ?? null,
            data,
          },
        ],
      };
      store.put(result);
    };
    tx.oncomplete = () => {
      db.close();
      workspaceChanged();
      resolve(result);
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "Browser storage could not save this draft. Download it before leaving the page.",
        ),
      );
    };
    tx.onabort = () => {
      db.close();
      reject(
        conflict
          ? new WorkspaceConflict()
          : new Error(
              "Saving was interrupted. Your draft remains on this page.",
            ),
      );
    };
  });
}

export async function deleteDocument(
  id: string,
  expectedRevision?: number,
): Promise<void> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("documents", "readwrite");
    const store = tx.objectStore("documents");
    const request = store.get(id);
    let conflict = false;
    request.onsuccess = () => {
      if (
        request.result &&
        expectedRevision !== undefined &&
        request.result.revision !== expectedRevision
      ) {
        conflict = true;
        tx.abort();
        return;
      }
      store.delete(id);
    };
    tx.oncomplete = () => {
      db.close();
      workspaceChanged();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(new Error("This item could not be removed."));
    };
    tx.onabort = () => {
      db.close();
      reject(
        conflict
          ? new WorkspaceConflict()
          : new Error("Removal was interrupted."),
      );
    };
  });
}

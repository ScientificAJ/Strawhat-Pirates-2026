"use client";

import { activeWorkspaceId } from "./local-workspaces";
import {
  openWorkspaceDatabase,
  listCases,
  isResearchCase,
} from "./workspace-storage";
import {
  listDocuments,
  researchData,
  workspaceChanged,
  type WorkspaceDocument,
} from "./workspace-documents";

export type Preferences = {
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  units: "source" | "si";
  summary_depth: "brief" | "technical" | "methods";
  evidence_scope: "retained" | "catalog";
  reduce_transparency: boolean;
  reduce_motion: boolean;
  compact_rail: boolean;
  command_shortcut: boolean;
  workspace_name: string;
  last_backup_at?: string;
};
export const defaultPreferences: Preferences = {
  theme: "light",
  density: "comfortable",
  units: "source",
  summary_depth: "technical",
  evidence_scope: "retained",
  reduce_transparency: false,
  reduce_motion: false,
  compact_rail: false,
  command_shortcut: true,
  workspace_name: "On this device",
};

export async function readPreferences(): Promise<Preferences> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("preferences", "readonly");
    const request = tx.objectStore("preferences").get("research");
    const theme = tx.objectStore("preferences").get("theme");
    tx.oncomplete = () => {
      db.close();
      resolve({
        ...defaultPreferences,
        ...request.result,
        theme: request.result?.theme ?? theme.result ?? "light",
      });
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(new Error("Research preferences could not be read."));
    };
  });
}
export async function writePreferences(value: Preferences): Promise<void> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("preferences", "readwrite");
    tx.objectStore("preferences").put(value, "research");
    tx.objectStore("preferences").put(value.theme, "theme");
    tx.oncomplete = () => {
      db.close();
      workspaceChanged();
      window.dispatchEvent(new Event("nova-ember-preferences-changed"));
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Preferences could not be saved. The current settings still apply to this visit.",
        ),
      );
    };
  });
}
const temporaryFields = new Set([
  "activeJob",
  "active_job",
  "pendingJob",
  "pending_job",
  "voiceSession",
  "voice_session",
  "executionSession",
  "execution_session",
]);
function portable(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(researchData(value), (name, child) =>
      temporaryFields.has(name) ? null : child,
    ),
  );
}
export async function completeWorkspaceBackup() {
  const [cases, documents, preferences] = await Promise.all([
    listCases(),
    listDocuments(),
    readPreferences(),
  ]);
  return {
    format: "nova-ember-workspace",
    version: 2,
    exported_at: new Date().toISOString(),
    cases,
    documents: portable(
      documents.filter((document) => document.kind !== "remote_job"),
    ),
    preferences,
    portability: {
      credentials: "excluded",
      live_server_jobs: "excluded",
      private_remote_inputs: "references_only_reacquisition_may_be_needed",
    },
  };
}
export type BackupPreview = {
  version: number;
  cases: number;
  documents: number;
  exported_at: string;
  input: Record<string, unknown>;
};
export async function previewWorkspaceBackup(
  file: File,
): Promise<BackupPreview> {
  if (file.size > 128 * 1024 * 1024)
    throw new Error(
      "This backup exceeds the 128 MiB browser import profile. Export selected cases or collections separately.",
    );
  const input: unknown = JSON.parse(await file.text());
  if (!input || typeof input !== "object")
    throw new Error("Choose a Nova Ember workspace backup.");
  const record = input as Record<string, unknown>;
  if (
    record.format !== "nova-ember-workspace" ||
    (record.version !== 1 && record.version !== 2) ||
    !Array.isArray(record.cases)
  )
    throw new Error(
      "This file is not a supported Nova Ember workspace backup.",
    );
  if (record.version === 2 && !Array.isArray(record.documents))
    throw new Error("The workspace backup is missing its research documents.");
  return {
    version: Number(record.version),
    cases: record.cases.length,
    documents: Array.isArray(record.documents) ? record.documents.length : 0,
    exported_at: String(record.exported_at ?? "Unknown date"),
    input: record,
  };
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function date(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function validPreferences(value: unknown): value is Preferences {
  if (!record(value)) return false;
  return (
    ["light", "dark", "system"].includes(String(value.theme)) &&
    ["comfortable", "compact"].includes(String(value.density)) &&
    ["source", "si"].includes(String(value.units)) &&
    ["brief", "technical", "methods"].includes(String(value.summary_depth)) &&
    ["retained", "catalog"].includes(String(value.evidence_scope)) &&
    ["reduce_transparency", "reduce_motion", "compact_rail"].every(
      (key) => typeof value[key] === "boolean",
    ) &&
    (value.command_shortcut === undefined ||
      typeof value.command_shortcut === "boolean") &&
    typeof value.workspace_name === "string" &&
    (value.last_backup_at === undefined || date(value.last_backup_at))
  );
}
function validDocument(value: unknown): value is WorkspaceDocument {
  if (!record(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.kind === "string" &&
    value.kind.length > 0 &&
    typeof value.title === "string" &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 1 &&
    (value.snapshot_id === null || typeof value.snapshot_id === "string") &&
    date(value.created_at) &&
    date(value.updated_at) &&
    record(value.data) &&
    Array.isArray(value.revisions) &&
    value.revisions.length === value.revision &&
    value.revisions.every(
      (revision: unknown, index: number) =>
        record(revision) &&
        revision.revision === index + 1 &&
        date(revision.saved_at) &&
        typeof revision.title === "string" &&
        (revision.snapshot_id === null ||
          typeof revision.snapshot_id === "string") &&
        record(revision.data),
    )
  );
}
export async function restoreCompleteWorkspace(
  preview: BackupPreview,
  applyPreferences = false,
): Promise<number> {
  const cases = preview.input.cases as unknown[];
  const documents = (
    preview.version === 2 ? preview.input.documents : []
  ) as unknown[];
  if (!cases.every(isResearchCase) || !documents.every(validDocument))
    throw new Error(
      "The backup contains an invalid case or research document. Nothing was imported.",
    );
  const ids = new Map(
    [...cases, ...documents].map((item) => [
      (item as { id: string }).id,
      crypto.randomUUID(),
    ]),
  );
  if (ids.size !== cases.length + documents.length)
    throw new Error(
      "The backup contains duplicate research IDs. Nothing was imported.",
    );
  // A copied case keeps its companion addressable; frozen research bytes retain historical IDs.
  for (const item of documents) {
    if (item.kind === "case_research" && item.id.startsWith("case-research-")) {
      const copiedCase = ids.get(item.id.slice("case-research-".length));
      if (copiedCase) ids.set(item.id, `case-research-${copiedCase}`);
    }
  }
  const remap = (value: unknown): unknown => {
    if (typeof value === "string") {
      if (ids.has(value)) return ids.get(value);
      const target = /^artifact:([^:]+):revision:(\d+)$/.exec(value);
      return target && ids.has(target[1])
        ? `artifact:${ids.get(target[1])}:revision:${target[2]}`
        : value;
    }
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, child]) => [
          key,
          key === "frozen" ? child : remap(child),
        ]),
      );
    return value;
  };
  // Prepare and validate every object before opening an atomic write transaction.
  const importedCases = cases.map((item) => remap(researchData(item)));
  const importedDocuments = documents
    .filter((item) => item.kind !== "remote_job")
    .map((item) => remap(portable(item)));
  const preferences = preview.input.preferences;
  if (applyPreferences && !validPreferences(preferences))
    throw new Error(
      "The backup preferences are invalid. Nothing was imported.",
    );
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["cases", "documents", "preferences"],
      "readwrite",
    );
    for (const item of importedCases) tx.objectStore("cases").add(item);
    for (const item of importedDocuments) tx.objectStore("documents").add(item);
    if (applyPreferences && validPreferences(preferences)) {
      tx.objectStore("preferences").put(preferences, "research");
      tx.objectStore("preferences").put(preferences.theme, "theme");
    }
    tx.oncomplete = () => {
      db.close();
      workspaceChanged();
      if (applyPreferences)
        window.dispatchEvent(new Event("nova-ember-preferences-changed"));
      resolve(importedCases.length + importedDocuments.length);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Import was interrupted. Existing drafts were preserved and nothing was imported.",
        ),
      );
    };
  });
}
function clearNavigationMemory(workspaceId?: string) {
  const prefix = workspaceId
    ? `nova-discovery-view:${workspaceId}:`
    : "nova-discovery-view:";
  for (const key of Object.keys(sessionStorage))
    if (key.startsWith(prefix)) sessionStorage.removeItem(key);
}
export async function clearBrowserWorkspace(): Promise<void> {
  const db = await openWorkspaceDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      ["cases", "documents", "preferences"],
      "readwrite",
    );
    for (const name of ["cases", "documents", "preferences"])
      tx.objectStore(name).clear();
    tx.oncomplete = () => {
      db.close();
      clearNavigationMemory(activeWorkspaceId());
      workspaceChanged();
      window.dispatchEvent(new Event("nova-ember-preferences-changed"));
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        new Error(
          "Browser data could not be cleared. Try again after closing other tabs.",
        ),
      );
    };
  });
}

export async function clearAllLocalWorkspaces(): Promise<void> {
  const { localWorkspaces, workspaceDatabaseName } =
    await import("./local-workspaces");
  const workspaces = localWorkspaces();
  for (const workspace of workspaces) {
    await new Promise<void>((resolve, reject) => {
      const removal = indexedDB.deleteDatabase(
        workspaceDatabaseName(workspace.id),
      );
      removal.onsuccess = () => resolve();
      removal.onerror = removal.onblocked = () =>
        reject(
          new Error(
            "Some selected workspace data may already have been removed. Close other Nova Ember tabs and retry to clear the remaining workspaces.",
          ),
        );
    });
  }
  clearNavigationMemory();
  localStorage.removeItem("nova-ember-local-workspaces");
  localStorage.removeItem("nova-ember-active-workspace");
}

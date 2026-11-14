import { workspaceDatabaseName } from "./local-workspaces";

export type SourceAnchor = {
  accession: string;
  investigation_version: number;
  file_name: string;
  file_version: number;
  source_sha256: string;
  snapshot_id: string;
  source_row: number;
  line_end: number;
  row_kind: string;
  adapter_id?: string;
  source_columns: string[];
  raw_cells: string[];
};

export type SavedRevision = {
  revision: number;
  saved_at: string;
  question: string;
  notes: string;
  investigation_ids: string[];
  snapshot_id: string | null;
  source_anchors?: SourceAnchor[];
};

export type ResearchCase = {
  id: string;
  title: string;
  question: string;
  notes: string;
  investigation_ids: string[];
  snapshot_id: string | null;
  source_anchors?: SourceAnchor[];
  revision: number;
  updated_at: string;
  revisions: SavedRevision[];
};

type WorkspaceBackup = {
  format: "nova-ember-workspace";
  version: 1;
  exported_at: string;
  cases: ResearchCase[];
};

export function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(workspaceDatabaseName(), 2);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains("cases"))
        db.createObjectStore("cases", { keyPath: "id" });
      if (!db.objectStoreNames.contains("preferences"))
        db.createObjectStore("preferences");
      if (!db.objectStoreNames.contains("documents"))
        db.createObjectStore("documents", { keyPath: "id" });
    };
    opening.onsuccess = () => {
      opening.result.onversionchange = () => opening.result.close();
      resolve(opening.result);
    };
    opening.onerror = () =>
      reject(
        new Error(
          "Browser storage is unavailable. Download your work before leaving this page.",
        ),
      );
    opening.onblocked = () =>
      reject(
        new Error(
          "Close the other Nova Ember tab to finish opening browser storage.",
        ),
      );
  });
}

const database = openWorkspaceDatabase;

export async function storedTheme(): Promise<"light" | "dark" | null> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("preferences", "readonly");
    const operation = tx.objectStore("preferences").get("theme");
    operation.onsuccess = () =>
      resolve(
        operation.result === "light" || operation.result === "dark"
          ? operation.result
          : null,
      );
    operation.onerror = () =>
      reject(new Error("The saved appearance could not be read."));
    tx.oncomplete = () => db.close();
  });
}

export async function saveTheme(theme: "light" | "dark"): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("preferences", "readwrite");
    tx.objectStore("preferences").put(theme, "theme");
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "This appearance will last for this visit because browser storage is unavailable.",
        ),
      );
    };
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  action: (
    store: IDBObjectStore,
    fail: (error: Error) => void,
  ) => IDBRequest<T>,
): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cases", mode);
    let rejected = false;
    const fail = (error: Error) => {
      rejected = true;
      tx.abort();
      reject(error);
    };
    const operation = action(tx.objectStore("cases"), fail);
    let value: T;
    operation.onsuccess = () => {
      value = operation.result;
    };
    tx.oncomplete = () => {
      db.close();
      resolve(value);
    };
    tx.onerror = () => {
      db.close();
      if (!rejected)
        reject(
          new Error(
            "The browser could not save this work. Download a backup and check available storage.",
          ),
        );
    };
    tx.onabort = () => {
      db.close();
      if (!rejected)
        reject(new Error("The browser storage operation was interrupted."));
    };
  });
}

export async function listCases(): Promise<ResearchCase[]> {
  const cases = await transact<ResearchCase[]>("readonly", (store) =>
    store.getAll(),
  );
  return cases.sort((left, right) =>
    right.updated_at.localeCompare(left.updated_at),
  );
}

export async function saveCase(
  value: ResearchCase,
  expectedRevision?: number,
): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cases", "readwrite");
    const store = tx.objectStore("cases");
    let conflict = false;
    const current = store.get(value.id);
    current.onsuccess = () => {
      const stored = current.result as ResearchCase | undefined;
      if (
        (stored && stored.revision !== expectedRevision) ||
        (!stored && expectedRevision !== undefined && expectedRevision > 0)
      ) {
        conflict = true;
        tx.abort();
        reject(
          new Error(
            "This case changed in another tab. Reload it before saving another revision.",
          ),
        );
      } else store.put(value);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          "The case could not be saved. Download your draft and check browser storage.",
        ),
      );
    };
    tx.onabort = () => {
      db.close();
      if (!conflict)
        reject(
          new Error("Saving was interrupted. Your draft remains on this page."),
        );
    };
  });
}

export function workspaceBackup(cases: ResearchCase[]): WorkspaceBackup {
  return {
    format: "nova-ember-workspace",
    version: 1,
    exported_at: new Date().toISOString(),
    cases,
  };
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function validAnchors(value: unknown): value is SourceAnchor[] | undefined {
  if (value === undefined) return true;
  return (
    Array.isArray(value) &&
    value.length <= 500 &&
    value.every((anchor: unknown) => {
      if (!anchor || typeof anchor !== "object") return false;
      const record = anchor as Partial<SourceAnchor>;
      return (
        boundedText(record.accession, 30) &&
        /^PSI-\d+$/.test(record.accession) &&
        Number.isSafeInteger(record.investigation_version) &&
        Number(record.investigation_version) >= 1 &&
        Number.isSafeInteger(record.file_version) &&
        Number(record.file_version) >= 1 &&
        boundedText(record.file_name, 1000) &&
        boundedText(record.source_sha256, 64) &&
        /^[a-f0-9]{64}$/.test(record.source_sha256) &&
        boundedText(record.snapshot_id, 64) &&
        /^[a-f0-9]{64}$/.test(record.snapshot_id) &&
        Number.isSafeInteger(record.source_row) &&
        Number(record.source_row) >= 1 &&
        Number.isSafeInteger(record.line_end) &&
        Number(record.line_end) >= Number(record.source_row) &&
        boundedText(record.row_kind, 100) &&
        (record.adapter_id === undefined ||
          boundedText(record.adapter_id, 200)) &&
        Array.isArray(record.source_columns) &&
        record.source_columns.length <= 300 &&
        record.source_columns.every((column) => boundedText(column, 20_000)) &&
        Array.isArray(record.raw_cells) &&
        record.raw_cells.length <= 300 &&
        record.raw_cells.every((cell) => boundedText(cell, 20_000))
      );
    })
  );
}

export function validRevision(
  value: unknown,
  allowDraft = false,
): value is SavedRevision {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<SavedRevision>;
  return (
    Number.isSafeInteger(record.revision) &&
    Number(record.revision) >= (allowDraft ? 0 : 1) &&
    boundedText(record.saved_at, 50) &&
    Number.isFinite(Date.parse(record.saved_at)) &&
    boundedText(record.question, 10_000) &&
    boundedText(record.notes, 100_000) &&
    (record.snapshot_id === null || boundedText(record.snapshot_id, 256)) &&
    Array.isArray(record.investigation_ids) &&
    record.investigation_ids.length <= 100 &&
    record.investigation_ids.every(
      (id) => typeof id === "string" && /^PSI-\d+$/.test(id),
    ) &&
    validAnchors(record.source_anchors)
  );
}

export function isResearchCase(value: unknown): value is ResearchCase {
  if (!value || typeof value !== "object") return false;
  const item = value as ResearchCase;
  return (
    boundedText(item.id, 500) &&
    boundedText(item.title, 1000) &&
    validRevision({ ...item, saved_at: item.updated_at }, true) &&
    Array.isArray(item.revisions) &&
    item.revisions.length <= 10000 &&
    item.revisions.every((revision) => validRevision(revision))
  );
}

export async function importWorkspace(file: File): Promise<number> {
  if (file.size > 5_000_000)
    throw new Error("This backup exceeds the 5 MB workspace import limit.");
  const input: unknown = JSON.parse(await file.text());
  if (
    !input ||
    typeof input !== "object" ||
    !("format" in input) ||
    input.format !== "nova-ember-workspace" ||
    !("version" in input) ||
    input.version !== 1 ||
    !("cases" in input) ||
    !Array.isArray(input.cases) ||
    input.cases.length > 200
  ) {
    throw new Error(
      "Choose a Nova Ember workspace backup in version 1 JSON format.",
    );
  }
  const imported: ResearchCase[] = [];
  for (const value of input.cases) {
    if (
      !value ||
      typeof value !== "object" ||
      !boundedText(value.title, 1000) ||
      !validRevision({ ...value, saved_at: value.updated_at }, true) ||
      !Array.isArray(value.revisions) ||
      value.revisions.length > 200 ||
      !value.revisions.every((revision: unknown) => validRevision(revision))
    ) {
      throw new Error(
        "The backup contains an invalid case. Nothing was imported.",
      );
    }
    imported.push({
      id: crypto.randomUUID(),
      title: value.title,
      question: value.question,
      notes: value.notes,
      investigation_ids: value.investigation_ids,
      snapshot_id: value.snapshot_id,
      source_anchors: value.source_anchors ?? [],
      revision: value.revision,
      updated_at: value.updated_at,
      revisions: value.revisions,
    });
  }
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("cases", "readwrite");
    for (const value of imported) tx.objectStore("cases").add(value);
    tx.oncomplete = () => {
      db.close();
      resolve(imported.length);
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error("The backup could not be imported. No cases were changed."),
      );
    };
    tx.onabort = () => {
      db.close();
      reject(new Error("Import was interrupted. No cases were changed."));
    };
  });
}

"use client";

import {
  activeWorkspaceId,
  localWorkspaces,
  workspaceDatabaseName,
} from "./local-workspaces";
import { restoreCompleteWorkspace } from "./workspace-backup";
import { readDocument, type WorkspaceDocument } from "./workspace-documents";
import type { ResearchCase } from "./workspace-storage";

let importing: Promise<void> | undefined;

function readEarlierDatabase(
  name: string,
): Promise<{ cases: ResearchCase[]; documents: WorkspaceDocument[] }> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(name);
    opening.onerror = () =>
      reject(
        new Error(
          "Earlier saved research could not be read. Its original data has been preserved.",
        ),
      );
    opening.onsuccess = () => {
      const db = opening.result;
      const stores = ["cases", "documents"].filter((store) =>
        db.objectStoreNames.contains(store),
      );
      if (!stores.length) {
        db.close();
        resolve({ cases: [], documents: [] });
        return;
      }
      const tx = db.transaction(stores, "readonly");
      const cases = stores.includes("cases")
        ? tx.objectStore("cases").getAll()
        : null;
      const documents = stores.includes("documents")
        ? tx.objectStore("documents").getAll()
        : null;
      tx.oncomplete = () => {
        db.close();
        resolve({
          cases: cases?.result ?? [],
          documents: documents?.result ?? [],
        });
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(
          new Error(
            "Earlier saved research could not be read. Its original data has been preserved.",
          ),
        );
      };
    };
  });
}

/** Copy earlier separated research into the active library once, without changing its originals. */
export function bringEarlierResearchTogether(): Promise<void> {
  importing ??= (async () => {
    const target = activeWorkspaceId();
    const previous = localWorkspaces().filter((item) => item.id !== target);
    if (!previous.length) return;
    const databases = await indexedDB.databases();
    const names = new Set(databases.map((database) => database.name));
    for (const source of previous) {
      const name = workspaceDatabaseName(source.id);
      if (!names.has(name) || (await readDocument(`legacy-import:${name}`)))
        continue;
      const original = await readEarlierDatabase(name);
      const documents = original.documents.filter(
        (document) =>
          !["research_context", "remote_job", "migration"].includes(
            document.kind,
          ),
      );
      await restoreCompleteWorkspace(
        {
          version: 2,
          cases: original.cases.length,
          documents: documents.length,
          exported_at: new Date().toISOString(),
          input: { ...original, documents },
        },
        false,
        name,
      );
    }
  })().catch((reason) => {
    importing = undefined;
    throw reason;
  });
  return importing;
}

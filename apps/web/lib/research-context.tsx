"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import type { components } from "../../../packages/contracts/api-types";
import {
  readDocument,
  saveDocument,
  type WorkspaceDocument,
} from "./workspace-documents";

export type WorkspaceContext = components["schemas"]["WorkspaceContext"];
type ContextValue = {
  context: WorkspaceContext | null;
  updateContext: (patch: Partial<WorkspaceContext>) => void;
  storageError: string | null;
};
const ResearchContext = createContext<ContextValue>({
  context: null,
  updateContext: () => {
    throw new Error("Research context is unavailable.");
  },
  storageError: null,
});

export function ResearchContextProvider({
  snapshotId,
  children,
}: {
  snapshotId: string | null;
  children: React.ReactNode;
}) {
  const [context, setContext] = useState<WorkspaceContext | null>(null);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const document = useRef<WorkspaceDocument | null>(null);
  const pending = useRef(Promise.resolve());
  useEffect(() => {
    let alive = true;
    readDocument("active-research-context")
      .then((saved) => {
        if (!alive) return;
        document.current = saved;
        const selected = saved?.data.context;
        if (
          selected &&
          typeof selected === "object" &&
          "snapshot_id" in selected &&
          typeof selected.snapshot_id === "string" &&
          /^[a-f0-9]{64}$/.test(selected.snapshot_id) &&
          "schema_version" in selected &&
          selected.schema_version === 1 &&
          "context_version" in selected &&
          typeof selected.context_version === "string" &&
          (!("investigations" in selected) ||
            (Array.isArray(selected.investigations) &&
              selected.investigations.every(
                (value) => typeof value === "string" && /^PSI-\d+$/.test(value),
              ))) &&
          [
            "selected_sources",
            "selected_evidence",
            "selected_artifacts",
            "selected_private_inputs",
          ].every(
            (key) =>
              !(key in selected) ||
              Array.isArray((selected as Record<string, unknown>)[key]),
          )
        )
          setContext(selected as WorkspaceContext);
        setReady(true);
      })
      .catch((reason) => {
        if (alive) {
          setStorageError(
            reason instanceof Error
              ? reason.message
              : "Selection storage is unavailable.",
          );
          setReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready && snapshotId)
      setContext(
        (current) =>
          current ?? {
            schema_version: 1,
            snapshot_id: snapshotId,
            context_version: crypto.randomUUID(),
            investigations: [],
            selected_sources: [],
            selected_private_inputs: [],
          },
      );
  }, [ready, snapshotId]);
  const updateContext = useCallback((patch: Partial<WorkspaceContext>) => {
    setContext((current) => {
      if (!current) return null;
      const next = { ...current, ...patch };
      if (
        JSON.stringify({ ...next, context_version: "" }) ===
        JSON.stringify({ ...current, context_version: "" })
      )
        return current;
      return { ...next, context_version: crypto.randomUUID() };
    });
  }, []);
  useEffect(() => {
    if (!ready || !context) return;
    // Start the revision-checked write immediately so a full navigation after
    // saving an investigation cannot discard an unstarted selection update.
    pending.current = pending.current
      .then(async () => {
        document.current = await saveDocument(
          {
            id: "active-research-context",
            kind: "research_context",
            title: "Current research selection",
            snapshot_id: context.snapshot_id,
            data: { context },
          },
          document.current?.revision ?? 0,
        );
        setStorageError(null);
      })
      .catch((reason) => {
        setStorageError(
          reason instanceof Error
            ? reason.message
            : "This selection could not be saved.",
        );
      });
  }, [context, ready]);
  return (
    <ResearchContext.Provider value={{ context, updateContext, storageError }}>
      {children}
    </ResearchContext.Provider>
  );
}
export function useResearchContext() {
  return useContext(ResearchContext);
}

"use client";
import { isInvestigationId } from "./investigation-identifiers";

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
  WorkspaceConflict,
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
  const latestContextVersion = useRef<string | null>(null);
  latestContextVersion.current = context?.context_version ?? null;
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
              selected.investigations.every(isInvestigationId))) &&
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
    const savedContext = document.current?.data.context as
      WorkspaceContext | undefined;
    if (savedContext?.context_version === context.context_version) return;
    // Start the revision-checked write immediately so a full navigation after
    // saving an investigation cannot discard an unstarted selection update.
    pending.current = pending.current
      .then(async () => {
        // This is the current selection, not a conversation or authored note.
        // Read its latest revision so ordinary navigation in another tab does
        // not make a later explicit selection fail with a draft conflict.
        for (let attempt = 0; attempt < 2; attempt++) {
          if (latestContextVersion.current !== context.context_version) return;
          const latest = await readDocument("active-research-context");
          if (
            latest?.data.context &&
            (latest.data.context as WorkspaceContext).context_version ===
              context.context_version
          ) {
            document.current = latest;
            setStorageError(null);
            return;
          }
          if (latestContextVersion.current !== context.context_version) return;
          try {
            document.current = await saveDocument(
              {
                id: "active-research-context",
                kind: "research_context",
                title: "Current research selection",
                snapshot_id: context.snapshot_id,
                data: { context },
              },
              latest?.revision ?? 0,
            );
            setStorageError(null);
            return;
          } catch (reason) {
            if (!(reason instanceof WorkspaceConflict) || attempt > 0)
              throw reason;
          }
        }
      })
      .catch((reason) => {
        if (latestContextVersion.current !== context.context_version) return;
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

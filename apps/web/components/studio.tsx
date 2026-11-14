"use client";

import {
  BookOpen,
  Check,
  ChevronDown,
  GitFork,
  History,
  ImagePlus,
  LockKeyhole,
  MessageSquare,
  PanelRightOpen,
  Plus,
  Send,
  Square,
  Trash2,
  UnlockKeyhole,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useRouter } from "next/navigation";
import { downloadJson } from "../lib/api";
import { rememberJob } from "../lib/private-jobs";
import { readPreferences } from "../lib/workspace-backup";
import { useWorkspacePreferences } from "../lib/workspace-preferences";
import {
  deleteDocument,
  listDocuments,
  readDocument,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import {
  message,
  newSession,
  object,
  records,
  selectedHistory,
  sessionArtifacts,
  sourceImage,
  studioRequest,
  type JsonRecord,
  type ResearchInput,
  type StudioArtifact,
  type StudioSession,
  type StudioTurn,
  type WorkspaceContext,
} from "../lib/studio-session";
import {
  ArtifactCanvas,
  childOperations,
  ResearchMessage,
} from "./studio-artifacts";
import { VoiceConsole } from "./voice-console";
import styles from "./studio.module.css";

export type ResearchStudioProps = {
  sessionId?: string;
  intentId?: string;
  snapshotId: string;
  context?: WorkspaceContext;
  compact?: boolean;
  visible?: boolean;
  onSessionChange?: (id: string) => void;
  onExpand?: (id: string) => void;
  onSaveArtifact?: (artifact: StudioArtifact) => void | Promise<void>;
};

function parsedEvents(text: string): JsonRecord[] {
  return text.split("\n\n").flatMap((block) => {
    const data = block.split("\n").find((line) => line.startsWith("data: "));
    if (!data) return [];
    try {
      return [object(JSON.parse(data.slice(6)))];
    } catch {
      return [];
    }
  });
}

function contextSelection(value: WorkspaceContext): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key, item]) =>
            key !== "context_version" &&
            item != null &&
            (typeof item !== "object" || Object.keys(item).length > 0),
        )
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function ResearchStudio({
  sessionId,
  intentId,
  snapshotId,
  context,
  compact = false,
  visible = true,
  onSessionChange,
  onExpand,
  onSaveArtifact,
}: ResearchStudioProps) {
  const router = useRouter();
  const preferences = useWorkspacePreferences();
  const [session, setSession] = useState<StudioSession | null>(null);
  const [documents, setDocuments] = useState<
    WorkspaceDocument<StudioSession>[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState("");
  const [storageStatus, setStorageStatus] = useState(
    "Opening browser workspace…",
  );
  const [capability, setCapability] = useState<boolean | null>(null);
  const [requestLimit, setRequestLimit] = useState<number | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [selectedArtifact, setSelectedArtifact] = useState("");
  const [tab, setTab] = useState("");
  const [newOutput, setNewOutput] = useState(false);
  const [approvals, setApprovals] = useState<JsonRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const current = useRef<StudioSession | null>(null);
  const saved = useRef<WorkspaceDocument<StudioSession> | null>(null);
  const saving = useRef<Promise<void>>(Promise.resolve());
  const lastSaved = useRef("");
  const conversation = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const onSessionRef = useRef(onSessionChange);
  const incoming = useRef(context);
  incoming.current = context;
  onSessionRef.current = onSessionChange;
  current.current = session;
  const update = useCallback(
    (
      change:
        Partial<StudioSession> | ((previous: StudioSession) => StudioSession),
    ) => {
      setSession((previous) =>
        previous
          ? typeof change === "function"
            ? change(previous)
            : { ...previous, ...change }
          : previous,
      );
    },
    [],
  );
  const scope = session?.evidence_scope ?? "selection";
  const complexity = session?.complexity ?? "auto";
  const role = session?.role ?? "coordinator";
  const setScope = (value: string) =>
    update({ evidence_scope: value === "corpus" ? "corpus" : "selection" });
  const setComplexity = (value: ResearchInput["complexity"]) =>
    update({ complexity: value });
  const setRole = (value: ResearchInput["role"]) => update({ role: value });

  const persist = useCallback(async () => {
    const value = current.current;
    if (!value || JSON.stringify(value) === lastSaved.current) return;
    const serialized = JSON.stringify(value);
    saving.current = saving.current
      .catch(() => undefined)
      .then(async () => {
        const old = saved.current?.id === value.id ? saved.current : null;
        const stored = await saveDocument<StudioSession>(
          {
            id: value.id,
            kind: "studio_session",
            title: value.title,
            snapshot_id: value.context.snapshot_id,
            data: value,
            revision: old?.revision,
          },
          old?.revision,
        );
        saved.current = stored;
        lastSaved.current = serialized;
        setStorageStatus(
          JSON.stringify(current.current) === serialized
            ? "Saved in this browser"
            : "Saving changes in this browser…",
        );
      });
    try {
      await saving.current;
    } catch (failure) {
      setStorageStatus("Local save needs attention");
      setError(message(failure));
      throw failure;
    }
  }, []);

  useEffect(() => {
    // The parent remembers a newly opened local session before its debounced
    // save. Receiving that same identifier must not reload an unsaved draft.
    if (sessionId && current.current?.id === sessionId && !intentId) return;
    let active = true;
    async function load() {
      try {
        const list = await listDocuments<StudioSession>("studio_session");
        const doc = sessionId
          ? await readDocument<StudioSession>(sessionId)
          : (list[0] ?? null);
        const defaults = await readPreferences();
        if (!active) return;
        let next =
          doc?.kind === "studio_session"
            ? doc.data
            : newSession(snapshotId, incoming.current);
        if (!doc)
          next = {
            ...next,
            summary_depth: defaults.summary_depth,
            availability_scope: defaults.evidence_scope,
          };
        if (intentId) {
          const intent = await readDocument<JsonRecord>(intentId);
          if (
            intent?.kind === "studio_intent" &&
            typeof intent.data.question === "string"
          ) {
            const selected = {
              ...next.context,
              context_version: crypto.randomUUID(),
              investigations: Array.isArray(intent.data.investigations)
                ? intent.data.investigations.filter(
                    (item): item is string => typeof item === "string",
                  )
                : next.context.investigations,
            };
            if (typeof intent.data.snapshot_id === "string")
              selected.snapshot_id = intent.data.snapshot_id;
            const anchors = records(intent.data.anchors).filter(
              (item) =>
                typeof item.kind === "string" &&
                typeof item.source_sha256 === "string",
            );
            if (anchors.length)
              selected.selected_evidence =
                anchors as unknown as WorkspaceContext["selected_evidence"];
            next = {
              ...newSession(selected.snapshot_id, selected),
              title: intent.data.question.slice(0, 90),
              draft: intent.data.question,
              summary_depth: ["brief", "technical", "methods"].includes(
                String(intent.data.summary_depth),
              )
                ? (intent.data.summary_depth as StudioSession["summary_depth"])
                : defaults.summary_depth,
              availability_scope: defaults.evidence_scope,
            };
            const image = object(intent.data.image);
            if (
              typeof image.expected_sha256 === "string" &&
              typeof image.image_base64 === "string" &&
              ["image/png", "image/jpeg"].includes(String(image.media_type))
            ) {
              next.image = {
                ...image,
                consent: true,
              } as StudioSession["image"];
              next.image_name = String(
                intent.data.image_name ?? "Selected source region",
              );
              next.image_source = object(intent.data.image_source);
              next.image_consented = false;
              setImageOpen(true);
            }
          }
        }
        saved.current =
          doc?.kind === "studio_session" && !intentId ? doc : null;
        lastSaved.current = doc && !intentId ? JSON.stringify(next) : "";
        setDocuments(list);
        setSession(next);
        setStorageStatus(doc ? "Saved in this browser" : "New browser session");
        onSessionRef.current?.(next.id);
      } catch (failure) {
        if (active) {
          setSession(newSession(snapshotId, context));
          setError(message(failure));
          setStorageStatus(
            "Browser storage unavailable — export before leaving",
          );
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [sessionId, snapshotId, intentId]);
  useEffect(() => {
    if (!visible) setVoiceOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!session) return;
    if (JSON.stringify(session) !== lastSaved.current)
      setStorageStatus("Saving changes in this browser…");
    const timer = setTimeout(() => void persist().catch(() => undefined), 900);
    return () => clearTimeout(timer);
  }, [session, persist]);
  useEffect(() => {
    const flush = () => {
      void persist().catch(() => undefined);
    };
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("blur", flush);
      flush();
    };
  }, [persist]);
  useEffect(() => {
    const changed = () => {
      void listDocuments<StudioSession>("studio_session")
        .then(setDocuments)
        .catch((failure) => setError(message(failure)));
    };
    window.addEventListener("nova-ember-workspace-changed", changed);
    return () =>
      window.removeEventListener("nova-ember-workspace-changed", changed);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      studioRequest("/v1/capabilities/models", undefined, {
        signal: controller.signal,
      }),
      studioRequest("/v1/usage/models", undefined, {
        signal: controller.signal,
      }),
    ])
      .then(([capabilities, usage]) => {
        setCapability(capabilities.configured === true);
        const limit = Number(usage.request_limit_usd);
        if (Number.isFinite(limit) && limit >= 0) setRequestLimit(limit);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(message(failure));
      });
    return () => controller.abort();
  }, []);

  const activeTurns =
    session?.turns.filter(
      (turn) =>
        turn.job_id &&
        ["queued", "running", "cancel_requested", "waiting_approval"].includes(
          turn.status,
        ),
    ) ?? [];
  const activeIds = activeTurns.map((turn) => turn.job_id).join(",");
  useEffect(() => {
    if (!activeIds) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        for (const id of activeIds.split(",")) {
          const turn = current.current?.turns.find(
            (item) => item.job_id === id,
          );
          if (!turn) continue;
          const after = Number(turn.events.at(-1)?.sequence ?? 0);
          const [job, response] = await Promise.all([
            studioRequest(`/v1/workflows/${id}`, undefined, {
              signal: controller.signal,
            }),
            fetch(`/v1/workflows/${id}/events?after=${after}`, {
              credentials: "same-origin",
              headers: { Accept: "text/event-stream" },
              signal: controller.signal,
            }),
          ]);
          const events = response.ok ? parsedEvents(await response.text()) : [];
          if (controller.signal.aborted) return;
          const result = object(job.result ?? job.partial_result);
          update((previous) => ({
            ...previous,
            turns: previous.turns.map((item) =>
              item.job_id !== id
                ? item
                : {
                    ...item,
                    status: String(job.status),
                    events: [...item.events, ...events].slice(-200),
                    ...(Object.keys(result).length ? { result } : {}),
                    ...(job.error_code
                      ? {
                          error: `The task stopped: ${String(job.error_code)}. Retained work remains inspectable.`,
                        }
                      : {}),
                  },
            ),
          }));
          if (follow.current)
            requestAnimationFrame(() =>
              conversation.current?.scrollTo({
                top: conversation.current.scrollHeight,
                behavior: "instant",
              }),
            );
          else if (events.length || job.result) setNewOutput(true);
        }
      } catch (failure) {
        if (!controller.signal.aborted) setError(message(failure));
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 1400);
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [activeIds, update]);

  const children = childOperations(session?.turns ?? []);
  const childrenIds = children.map((item) => String(item.id)).join(",");
  useEffect(() => {
    if (!childrenIds) {
      setApprovals([]);
      return;
    }
    let live = true;
    const controller = new AbortController();
    const check = async () => {
      try {
        const jobs = await Promise.all(
          childrenIds.split(",").map((id) =>
            studioRequest(`/v1/workflows/${id}`, undefined, {
              signal: controller.signal,
            }),
          ),
        );
        if (live) setApprovals(jobs);
      } catch (failure) {
        if (live) setError(message(failure));
      }
    };
    void check();
    const timer = setInterval(check, 2200);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [childrenIds]);

  const artifacts = session ? sessionArtifacts(session) : [];
  const tabs = [
    "Dashboard",
    "Figures",
    "Tables",
    "Evidence",
    "Code",
    "Research case",
  ].filter((kind) => artifacts.some((item) => item.kind === kind));
  const activeTab = tabs.includes(tab) ? tab : tabs[0];
  const candidates = artifacts.filter((item) => item.kind === activeTab);
  const artifact =
    candidates.find((item) => item.id === selectedArtifact) ??
    candidates.at(-1);
  const incomingChanged = Boolean(
    context &&
    session &&
    contextSelection(context) !== contextSelection(session.context),
  );

  async function send() {
    if (!session || busy || activeTurns.length || !session.draft.trim()) return;
    if (capability !== true || requestLimit === null) {
      setError(
        "Model access or the current request allowance is unavailable. Your draft is retained.",
      );
      return;
    }
    const committed = session.turns.reduce(
      (sum, turn) =>
        sum +
        (turn.result && Number.isFinite(Number(turn.result.cost_usd))
          ? Number(turn.result.cost_usd)
          : turn.job_id
            ? requestLimit
            : 0),
      0,
    );
    if (committed + requestLimit > session.budget) {
      setError(
        `This request could reserve $${requestLimit.toFixed(2)}. Increase the text-session allowance explicitly or start a smaller direct tool task.`,
      );
      return;
    }
    if (
      (session.context.selected_private_inputs?.length ||
        session.context.selected_artifacts?.length) &&
      [
        ...(session.context.selected_private_inputs ?? []),
        ...(session.context.selected_artifacts ?? []),
      ].some((item) => !item.consent_to_model)
    ) {
      setError(
        "Review and explicitly consent to the selected private inputs before submitting them to a model.",
      );
      return;
    }
    if (session.image && !session.image_consented) {
      setError(
        "Confirm sharing this selected image, or remove it before sending.",
      );
      return;
    }
    const question = `${session.draft.trim()}${session.plan.trim() ? `\n\nMy task plan:\n${session.plan.trim()}` : ""}${session.image_source && session.image_consented ? `\n\nSelected image crop provenance (pixels only, not calibration): ${JSON.stringify(session.image_source)}` : ""}\n\nRequested evidence scope: ${scope === "selection" ? "the explicitly selected context; explain any evidence gap before broadening" : "the retained NASA corpus; preserve source-specific qualifications"}. Evidence availability: ${session.availability_scope === "catalog" ? "include catalog-only records, explicitly distinguish unacquired data" : "retained scientific assets; identify unavailable evidence"}. Summary depth: ${session.summary_depth ?? "technical"}; preserve all consequential limitations and source access.`;
    if (question.length > 6000) {
      setError(
        "Shorten the question and task plan to fit 6,000 characters together.",
      );
      return;
    }
    const input: ResearchInput = {
      question,
      context: session.context,
      expected_context_version: session.context.context_version,
      complexity,
      role,
      history: selectedHistory(session.turns),
      images: session.image ? [session.image] : [],
    };
    const turn: StudioTurn = {
      id: crypto.randomUUID(),
      question: session.draft.trim(),
      created_at: new Date().toISOString(),
      request: input,
      operation_key: crypto.randomUUID(),
      status: "submitting",
      events: [],
    };
    update((previous) => ({
      ...previous,
      draft: "",
      turns: [...previous.turns, turn],
    }));
    setBusy(true);
    setError("");
    try {
      const job = await studioRequest("/v1/research", input, {
        headers: { "Idempotency-Key": turn.operation_key },
      });
      update((previous) => ({
        ...previous,
        turns: previous.turns.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                job_id: String(job.id),
                status: String(job.status ?? "queued"),
              }
            : item,
        ),
      }));
    } catch (failure) {
      update((previous) => ({
        ...previous,
        turns: previous.turns.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: "submission_unconfirmed",
                error: `${message(failure)} Retry this same submission to recover its operation; no automatic paid retry was made.`,
              }
            : item,
        ),
      }));
    } finally {
      setBusy(false);
    }
  }
  async function recover(turn: StudioTurn) {
    setBusy(true);
    try {
      const job = await studioRequest("/v1/research", turn.request, {
        headers: { "Idempotency-Key": turn.operation_key },
      });
      update((previous) => ({
        ...previous,
        turns: previous.turns.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                job_id: String(job.id),
                status: String(job.status ?? "queued"),
                error: undefined,
              }
            : item,
        ),
      }));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    try {
      for (const turn of activeTurns) {
        const value = await studioRequest(
          `/v1/workflows/${turn.job_id}/cancel`,
          {},
        );
        update((previous) => ({
          ...previous,
          turns: previous.turns.map((item) =>
            item.id === turn.id
              ? { ...item, status: String(value.status ?? "cancel_requested") }
              : item,
          ),
        }));
      }
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function switchSession(
    doc?: WorkspaceDocument<StudioSession>,
    fork = false,
  ) {
    try {
      await persist();
    } catch {
      return;
    }
    let next = doc?.data ?? {
      ...newSession(snapshotId, context),
      summary_depth: preferences.summary_depth,
      availability_scope: preferences.evidence_scope,
    };
    if (fork && session)
      next = {
        ...session,
        id: crypto.randomUUID(),
        title: `${session.title} · fork`,
        forked_from: session.id,
        context: { ...session.context, context_version: crypto.randomUUID() },
      };
    saved.current = fork ? null : (doc ?? null);
    lastSaved.current = doc && !fork ? JSON.stringify(doc.data) : "";
    setSession(next);
    setSelectedArtifact("");
    setHistoryOpen(false);
    onSessionChange?.(next.id);
    composer.current?.focus();
  }
  async function saveArtifact(value: StudioArtifact) {
    if (onSaveArtifact) await onSaveArtifact(value);
    else
      await saveDocument({
        id: crypto.randomUUID(),
        kind: "research_artifact",
        title: value.title,
        snapshot_id: value.snapshot_id,
        data: value.data,
      });
  }
  async function expand() {
    try {
      await persist();
      if (session) {
        if (onExpand) onExpand(session.id);
        else router.push(`/app/agent/${session.id}`);
      }
    } catch {
      /* The visible storage error preserves the current draft. */
    }
  }
  async function attach(file?: File) {
    if (!file) return;
    try {
      update({
        image: await sourceImage(
          file,
          "Interpret the explicitly selected source figure; do not infer uncalibrated measurements.",
        ),
        image_name: file.name,
        image_source: undefined,
        image_consented: false,
      });
    } catch (failure) {
      setError(message(failure));
    }
  }
  async function capture() {
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const video = document.createElement("video");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!canvas.width || canvas.width * canvas.height > 8000000)
        throw new Error(
          "Choose a smaller selected view. The capture is not rescaled.",
        );
      canvas.getContext("2d")?.drawImage(video, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("This selected view could not be captured.")),
          "image/png",
        ),
      );
      await attach(
        new File([blob], "selected-view.png", { type: "image/png" }),
      );
    } catch (failure) {
      setError(message(failure));
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
    }
  }
  async function decide(operation: JsonRecord, approve: boolean) {
    try {
      const pending = object(operation.approval);
      const value = await studioRequest(
        `/v1/workflows/${operation.id}/${approve ? "approve" : "cancel"}`,
        approve
          ? {
              expected_revision: operation.approval_revision,
              inputs_sha256: pending.inputs_sha256,
            }
          : {},
      );
      setApprovals((previous) =>
        previous.map((item) =>
          item.id === operation.id ? { ...item, ...value } : item,
        ),
      );
    } catch (failure) {
      setError(message(failure));
    }
  }
  function evidence(id: string) {
    const found = artifacts.find((item) => item.id === id);
    if (found) {
      setTab(found.kind);
      setSelectedArtifact(id);
      if (compact) void expand();
      else document.getElementById("studio-artifact-canvas")?.focus();
    }
  }

  if (!session)
    return (
      <section className={styles.loading} aria-busy="true">
        <h1>Research Studio</h1>
        <p>Opening your browser-owned research session…</p>
      </section>
    );
  const contextEntries = [
    ...(session.context.investigations ?? []).map((value) => ({
      label: value,
      remove: () =>
        update({
          context: {
            ...session.context,
            context_version: crypto.randomUUID(),
            investigations: session.context.investigations?.filter(
              (item) => item !== value,
            ),
          },
        }),
    })),
    ...(session.context.selected_sources ?? []).map((value) => ({
      label: `Source ${value.asset_sha256.slice(0, 8)}${value.source_rows?.length ? ` · ${value.source_rows.length} selected rows` : ""}`,
      remove: () =>
        update({
          context: {
            ...session.context,
            context_version: crypto.randomUUID(),
            selected_sources: session.context.selected_sources?.filter(
              (item) => item !== value,
            ),
          },
        }),
    })),
    ...(session.context.selected_evidence ?? []).map((value, i) => ({
      label: `Passage ${i + 1} · ${value.kind.replaceAll("_", " ")}`,
      remove: () =>
        update({
          context: {
            ...session.context,
            context_version: crypto.randomUUID(),
            selected_evidence: session.context.selected_evidence?.filter(
              (item) => item !== value,
            ),
          },
        }),
    })),
    ...(session.context.selected_private_inputs ?? []).map((value) => ({
      label: `Private input ${(value.upload_id ?? value.source_job_id ?? "").slice(0, 8)}`,
      remove: () =>
        update({
          context: {
            ...session.context,
            context_version: crypto.randomUUID(),
            selected_private_inputs:
              session.context.selected_private_inputs?.filter(
                (item) => item !== value,
              ),
          },
        }),
    })),
  ];
  return (
    <section
      className={`${styles.studio} ${compact ? styles.compact : ""}`}
      aria-label={compact ? "Contextual research assistant" : "Research Studio"}
    >
      <header className={styles.header}>
        <div>
          <h1>{compact ? "Ask Nova Ember" : "Research Studio"}</h1>
          <p>
            Evidence, calculations and interpretation in one inspectable
            conversation.
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
          >
            <History size={16} /> Sessions
          </button>
          {compact ? (
            <button className="button" onClick={expand}>
              <PanelRightOpen size={16} /> Open Studio
            </button>
          ) : (
            <button className="button" onClick={() => switchSession()}>
              <Plus size={16} /> New session
            </button>
          )}
        </div>
      </header>
      {historyOpen && (
        <section
          className={styles.history}
          aria-label="Saved research sessions"
        >
          <h2>On this browser</h2>
          {!documents.length && (
            <p>Your first session will appear here after saving.</p>
          )}
          {documents.map((doc) => (
            <div key={doc.id}>
              <button
                className={styles.textButton}
                onClick={() => switchSession(doc)}
              >
                <MessageSquare size={16} />
                {doc.title}
                <span>revision {doc.revision}</span>
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${doc.title}`}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Remove this local conversation? Downloaded backups and remote jobs are separate.",
                    )
                  )
                    return;
                  try {
                    await deleteDocument(doc.id, doc.revision);
                    if (doc.id === session.id) await switchSession();
                  } catch (failure) {
                    setError(message(failure));
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </section>
      )}
      <div className={styles.sessionBar}>
        <label>
          <span className="visually-hidden">Session title</span>
          <input
            value={session.title}
            maxLength={120}
            onChange={(event) => update({ title: event.target.value })}
            onBlur={() => void persist().catch(() => undefined)}
          />
        </label>
        <button
          className={styles.textButton}
          onClick={() => switchSession(undefined, true)}
        >
          <GitFork size={15} /> Fork
        </button>
        <span className={styles.saveState} role="status">
          {storageStatus}
        </span>
      </div>
      {session.forked_from && (
        <p className={styles.muted}>
          Forked from <code>{session.forked_from.slice(0, 8)}</code>. Changes
          here preserve the original session.
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          <p>{error}</p>
          <div className={styles.actions}>
            <button
              className="button button-small"
              onClick={() => downloadJson(`${session.title}.json`, session)}
            >
              Download session backup
            </button>
            <button
              className="button button-small"
              onClick={() => setError("")}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {incomingChanged && (
        <div className={styles.contextNotice}>
          <p>
            {session.context_locked
              ? "Context is locked while you navigate."
              : "The current page has a different selection. This session keeps its pinned context until you choose to update it."}
          </p>
          <button
            className="button button-small"
            onClick={() => {
              if (context) update({ context, context_locked: false });
            }}
            disabled={activeTurns.length > 0}
          >
            Use current context
          </button>
        </div>
      )}
      {!compact && (
        <details className={styles.layoutControls}>
          <summary>Studio layout</summary>
          <label>
            Conversation width
            <input
              type="range"
              min={35}
              max={60}
              step={1}
              value={Math.min(
                60,
                Math.max(35, session.conversation_width ?? 42),
              )}
              aria-valuetext={`${Math.min(60, Math.max(35, session.conversation_width ?? 42))}% conversation, ${100 - Math.min(60, Math.max(35, session.conversation_width ?? 42))}% artifact canvas`}
              onChange={(event) =>
                update({ conversation_width: event.target.valueAsNumber })
              }
            />
          </label>
          <button
            className={styles.textButton}
            onClick={() => update({ conversation_width: 42 })}
          >
            Reset split to 42% / 58%
          </button>
        </details>
      )}
      <div
        className={styles.workspace}
        style={
          {
            "--studio-conversation": `${Math.min(60, Math.max(35, session.conversation_width ?? 42))}%`,
          } as CSSProperties
        }
      >
        <section className={styles.conversationPane} aria-label="Conversation">
          <div className={styles.scopeHeader}>
            <span>
              Snapshot{" "}
              <code title={session.context.snapshot_id}>
                {session.context.snapshot_id.slice(0, 12)}
              </code>
            </span>
            <span>Private session · local execution</span>
          </div>
          <div
            className={styles.conversation}
            ref={conversation}
            onScroll={() => {
              const element = conversation.current;
              if (element)
                follow.current =
                  element.scrollHeight -
                    element.scrollTop -
                    element.clientHeight <
                  100;
            }}
          >
            {!session.turns.length && (
              <div className={styles.welcome}>
                <BookOpen size={24} />
                <h2>Begin with a scientific question</h2>
                <p>
                  Ask about selected evidence, compare conditions, or plan a
                  reproducible calculation. Source values and model
                  interpretations stay distinguishable.
                </p>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    update({
                      draft:
                        "What can the selected evidence establish, and what remains unknown?",
                    })
                  }
                >
                  What does this evidence establish?
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    update({
                      draft:
                        "Compare the selected conditions and identify the measurements needed for a valid comparison.",
                    })
                  }
                >
                  Check whether conditions are comparable
                </button>
              </div>
            )}
            {session.turns.map((turn) => (
              <div key={turn.id}>
                <ResearchMessage turn={turn} onEvidence={evidence} />
                {turn.status === "submission_unconfirmed" && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => recover(turn)}
                  >
                    Recover this exact submission
                  </button>
                )}
              </div>
            ))}
          </div>
          {newOutput && (
            <button
              className={styles.newResponse}
              onClick={() => {
                conversation.current?.scrollTo({
                  top: conversation.current.scrollHeight,
                  behavior: "smooth",
                });
                follow.current = true;
                setNewOutput(false);
              }}
            >
              <ChevronDown size={15} /> New response
            </button>
          )}
          <div className={styles.composer}>
            <div className={styles.contextLabel}>
              <strong>Using selected context</strong>
              <button
                className={styles.textButton}
                onClick={() =>
                  update({ context_locked: !session.context_locked })
                }
              >
                {session.context_locked ? (
                  <LockKeyhole size={14} />
                ) : (
                  <UnlockKeyhole size={14} />
                )}
                {session.context_locked ? "Unlock context" : "Lock context"}
              </button>
            </div>
            <div className={styles.chips}>
              {contextEntries.length ? (
                contextEntries.map((entry, index) => (
                  <span key={index}>
                    {entry.label}
                    <button
                      aria-label={`Remove ${entry.label}`}
                      onClick={entry.remove}
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))
              ) : (
                <span>Retained NASA corpus · no private file selected</span>
              )}
              {session.context.focused_view && (
                <span>
                  Focused {session.context.focused_view.kind}
                  <button
                    aria-label="Remove focused view"
                    onClick={() =>
                      update({
                        context: {
                          ...session.context,
                          focused_view: null,
                          context_version: crypto.randomUUID(),
                        },
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </span>
              )}
            </div>
            <details className={styles.contextDetails}>
              <summary>
                Inspect shared context and private-input consent
              </summary>
              <pre>{JSON.stringify(session.context, null, 2)}</pre>
              {(session.context.selected_private_inputs?.length ?? 0) +
                (session.context.selected_artifacts?.length ?? 0) >
                0 && (
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={[
                      ...(session.context.selected_private_inputs ?? []),
                      ...(session.context.selected_artifacts ?? []),
                    ].every((item) => item.consent_to_model)}
                    onChange={(event) =>
                      update({
                        context: {
                          ...session.context,
                          context_version: crypto.randomUUID(),
                          selected_private_inputs:
                            session.context.selected_private_inputs?.map(
                              (item) => ({
                                ...item,
                                consent_to_model: event.target.checked,
                              }),
                            ),
                          selected_artifacts:
                            session.context.selected_artifacts?.map((item) => ({
                              ...item,
                              consent_to_model: event.target.checked,
                            })),
                        },
                      })
                    }
                  />{" "}
                  Share only these selected private inputs with the model for
                  this task.
                </label>
              )}
            </details>
            {imageOpen && (
              <div className={styles.attachments}>
                <p>
                  Select an original PNG/JPEG, or capture one selected view.
                  Nothing is sent until you consent and submit.
                </p>
                <label className={styles.fileLabel}>
                  Choose image
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    onChange={(event) => void attach(event.target.files?.[0])}
                  />
                </label>
                <button className="button button-small" onClick={capture}>
                  Capture selected view once
                </button>
                {session.image && (
                  <div>
                    {session.image.image_base64 && (
                      <img
                        className={styles.imagePreview}
                        src={`data:${session.image.media_type};base64,${session.image.image_base64}`}
                        alt="Preview of the explicitly selected image"
                      />
                    )}
                    <p>
                      {session.image_name} · SHA-256{" "}
                      <code>{session.image.expected_sha256.slice(0, 12)}</code>
                    </p>
                    {session.image_source && (
                      <details>
                        <summary>
                          Inspect original source and selected region
                        </summary>
                        <pre>
                          {JSON.stringify(session.image_source, null, 2)}
                        </pre>
                      </details>
                    )}
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={session.image_consented}
                        onChange={(event) =>
                          update({ image_consented: event.target.checked })
                        }
                      />
                      Share this selected image with the model. Pixels alone are
                      not calibrated measurements.
                    </label>
                    <button
                      className={styles.textButton}
                      onClick={() =>
                        update({
                          image: undefined,
                          image_name: undefined,
                          image_source: undefined,
                          image_consented: false,
                        })
                      }
                    >
                      Remove image
                    </button>
                  </div>
                )}
              </div>
            )}
            {planOpen && (
              <label className={styles.plan}>
                Task plan
                <textarea
                  value={session.plan}
                  maxLength={2000}
                  onChange={(event) => update({ plan: event.target.value })}
                  placeholder="State what to inspect, compare or calculate. Consequential execution proposals require their own confirmation."
                />
              </label>
            )}
            <label
              className="visually-hidden"
              htmlFor={
                compact ? "panel-research-question" : "studio-research-question"
              }
            >
              Research question
            </label>
            <textarea
              id={
                compact ? "panel-research-question" : "studio-research-question"
              }
              ref={composer}
              value={session.draft}
              maxLength={5500}
              placeholder="Ask a question grounded in the selected evidence…"
              onChange={(event) => update({ draft: event.target.value })}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void send();
                }
              }}
              onBlur={() => void persist().catch(() => undefined)}
            />
            <div className={styles.composerControls}>
              <button
                className="button button-small"
                onClick={() => setImageOpen(!imageOpen)}
                aria-expanded={imageOpen}
              >
                <ImagePlus size={16} /> Attach
              </button>
              <button
                className="button button-small"
                onClick={() => setVoiceOpen(!voiceOpen)}
                aria-expanded={voiceOpen}
              >
                Live voice
              </button>
              <button
                className={styles.textButton}
                onClick={() => setPlanOpen(!planOpen)}
                aria-expanded={planOpen}
              >
                Task plan
              </button>
              <div className={styles.send}>
                {activeTurns.length ? (
                  <button className="button" onClick={stop}>
                    <Square size={15} /> Stop research
                  </button>
                ) : (
                  <button
                    className="button button-primary"
                    disabled={
                      busy ||
                      capability !== true ||
                      requestLimit === null ||
                      !session.draft.trim()
                    }
                    onClick={send}
                  >
                    <Send size={16} />
                    {busy ? "Submitting…" : "Send"}
                  </button>
                )}
              </div>
            </div>
            <details className={styles.preferences}>
              <summary>Evidence scope, mode and allowance</summary>
              <label>
                Evidence scope
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                >
                  <option value="selection">Selected context requested</option>
                  <option value="corpus">Retained NASA corpus</option>
                </select>
              </label>
              <p>
                Scope accompanies the question. Inspect the returned citations
                to see which evidence was used.
              </p>
              <label>
                Reasoning mode
                <select
                  value={complexity}
                  onChange={(event) =>
                    setComplexity(
                      event.target.value as ResearchInput["complexity"],
                    )
                  }
                >
                  <option value="auto">Automatic complexity routing</option>
                  <option value="routine">Routine · Terra</option>
                  <option value="complex">Complex · Sol</option>
                </select>
              </label>
              <label>
                Research role
                <select
                  value={role}
                  onChange={(event) =>
                    setRole(event.target.value as ResearchInput["role"])
                  }
                >
                  {[
                    "coordinator",
                    "evidence",
                    "extraction",
                    "analysis",
                    "verification",
                  ].map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
              <label>
                Text-session allowance (USD)
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={session.budget}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value) && value >= 0)
                      update({ budget: value });
                  }}
                />
              </label>
              <p>
                Each request can reserve up to{" "}
                {requestLimit === null
                  ? "the server's current limit"
                  : `$${requestLimit.toFixed(2)}`}
                . Unconfirmed charges remain reserved. Voice has a separate
                displayed lease.
              </p>
            </details>
            {capability === false && (
              <p className={styles.qualification}>
                Model access is not configured. Your draft, sources and direct
                laboratory tools remain available.
              </p>
            )}
          </div>
        </section>
        {!compact && (
          <section
            className={styles.canvas}
            id="studio-artifact-canvas"
            tabIndex={-1}
            aria-label="Research artifact canvas"
          >
            {tabs.length ? (
              <>
                <div
                  className={styles.tabs}
                  role="tablist"
                  aria-label="Artifact types"
                >
                  {tabs.map((kind) => (
                    <button
                      key={kind}
                      role="tab"
                      aria-selected={kind === activeTab}
                      onClick={() => {
                        setTab(kind);
                        setSelectedArtifact("");
                      }}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
                {candidates.length > 1 && (
                  <label className={styles.artifactSelector}>
                    Artifact
                    <select
                      value={artifact?.id ?? ""}
                      onChange={(event) =>
                        setSelectedArtifact(event.target.value)
                      }
                    >
                      {candidates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {artifact && (
                  <ArtifactCanvas artifact={artifact} onSave={saveArtifact} />
                )}
              </>
            ) : (
              <div className={styles.emptyCanvas}>
                <MessageSquare size={30} />
                <h2>A canvas for the work behind the answer</h2>
                <p>
                  Source evidence, figures, tables, code and case proposals
                  appear here when they exist. Every result keeps its source
                  version and scientific qualifications.
                </p>
                <ul>
                  <li>Inspect exact source records and units.</li>
                  <li>Open real calculations and proposed code.</li>
                  <li>Save selected artifacts into your browser workspace.</li>
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
      {approvals.length > 0 && (
        <section className={styles.approvals} aria-label="Proposed operations">
          <h2>Proposed operations</h2>
          {approvals.map((operation) => (
            <div key={String(operation.id)}>
              <div>
                <strong>{String(operation.kind).replaceAll("_", " ")}</strong>
                <span className={styles.status}>
                  {String(operation.status).replaceAll("_", " ")}
                </span>
              </div>
              <details>
                <summary>Inspect exact operation and approval</summary>
                <pre>
                  {JSON.stringify(
                    {
                      proposal: children.find(
                        (item) => item.id === operation.id,
                      ),
                      approval: operation.approval,
                      result: operation.result,
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
              {operation.status === "waiting_approval" && (
                <div className={styles.actions}>
                  <button
                    className="button button-primary"
                    onClick={() => decide(operation, true)}
                  >
                    <Check size={15} />
                    {operation.kind === "execute_code"
                      ? "Run selected code"
                      : "Confirm selected export"}
                  </button>
                  <button
                    className="button"
                    onClick={() => decide(operation, false)}
                  >
                    Cancel proposal
                  </button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
      {voiceOpen && (
        <VoiceConsole
          context={session.context}
          images={
            session.image && session.image_consented ? [session.image] : []
          }
          transcript={session.voice_transcript}
          sessionId={session.voice_session_id}
          onSessionChange={(id) => update({ voice_session_id: id })}
          onTranscript={(value) => update({ voice_transcript: value })}
          onAskText={(text) => {
            update({ draft: text });
            composer.current?.focus();
          }}
          onResearchJob={(id, question, pinned) => {
            void rememberJob({
              id,
              kind: "research",
              status: "queued",
              snapshot_id: pinned.snapshot_id,
            });
            update((previous) =>
              previous.turns.some((turn) => turn.job_id === id)
                ? previous
                : {
                    ...previous,
                    turns: [
                      ...previous.turns,
                      {
                        id: crypto.randomUUID(),
                        question,
                        created_at: new Date().toISOString(),
                        request: {
                          question,
                          context: pinned,
                          expected_context_version: pinned.context_version,
                          complexity: "auto",
                          role: "coordinator",
                        },
                        operation_key: `voice-${id}`,
                        job_id: id,
                        status: "queued",
                        events: [],
                      },
                    ],
                  },
            );
          }}
          onClose={() => setVoiceOpen(false)}
        />
      )}
    </section>
  );
}

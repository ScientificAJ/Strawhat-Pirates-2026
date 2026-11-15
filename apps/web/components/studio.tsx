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
  freezeAgent,
  validateAgentProfile,
  type AgentSelection,
} from "../lib/agent-profiles";
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
import { useCitationReveal } from "./chat-sources";
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
  agentProfile?: AgentSelection;
};

function scopedSessions(
  documents: WorkspaceDocument<StudioSession>[],
  agentId?: string,
) {
  return documents.filter((document) =>
    agentId
      ? document.kind === "agent_session" &&
        document.data.agent?.profile_id === agentId
      : document.kind === "studio_session" && !document.data.agent,
  );
}

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
  agentProfile,
}: ResearchStudioProps) {
  const router = useRouter();
  const preferences = useWorkspacePreferences();
  const initialAgent = useRef(
    agentProfile ? freezeAgent(agentProfile) : undefined,
  );
  const agentMode = Boolean(initialAgent.current);
  const sessionKind = agentMode ? "agent_session" : "studio_session";
  const [session, setSession] = useState<StudioSession | null>(null);
  const [documents, setDocuments] = useState<
    WorkspaceDocument<StudioSession>[]
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [error, setError] = useState("");
  const [storageStatus, setStorageStatus] = useState("Opening your research…");
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
  const [autoSubmitSession, setAutoSubmitSession] = useState<string>();
  const autoSubmitted = useRef(new Set<string>());
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

  const persist = useCallback(
    async (value = current.current) => {
      if (!value || JSON.stringify(value) === lastSaved.current) return;
      const serialized = JSON.stringify(value);
      saving.current = saving.current
        .catch(() => undefined)
        .then(async () => {
          const old = saved.current?.id === value.id ? saved.current : null;
          const stored = await saveDocument<StudioSession>(
            {
              id: value.id,
              kind: sessionKind,
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
              ? "Saved automatically"
              : "Saving…",
          );
        });
      try {
        await saving.current;
      } catch (failure) {
        setStorageStatus("Saving needs attention");
        setError(message(failure));
        throw failure;
      }
    },
    [sessionKind],
  );

  useEffect(() => {
    // The parent remembers a newly opened local session before its debounced
    // save. Receiving that same identifier must not reload an unsaved draft.
    if (sessionId && current.current?.id === sessionId && !intentId) return;
    let active = true;
    async function load() {
      try {
        const list = scopedSessions(
          await listDocuments<StudioSession>(sessionKind),
          initialAgent.current?.id,
        );
        const doc = sessionId
          ? await readDocument<StudioSession>(sessionId)
          : agentMode
            ? null
            : (list[0] ?? null);
        if (doc && !scopedSessions([doc], initialAgent.current?.id).length)
          throw new Error(
            "Open this conversation from its matching research or agent library.",
          );
        if (doc?.data.agent)
          validateAgentProfile(doc.data.agent.frozen.profile);
        const defaults = await readPreferences();
        if (!active) return;
        let next =
          doc?.kind === sessionKind
            ? doc.data
            : newSession(snapshotId, incoming.current, initialAgent.current);
        if (!doc)
          next = {
            ...next,
            summary_depth: defaults.summary_depth,
            availability_scope: defaults.evidence_scope,
          };
        if (intentId && !agentMode) {
          const intent = await readDocument<JsonRecord>(intentId);
          if (
            intent?.kind === "studio_intent" &&
            typeof intent.data.question === "string"
          ) {
            const selected = {
              ...newSession(snapshotId).context,
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
              evidence_scope: selected.investigations?.length
                ? "selection"
                : "corpus",
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
        let stored = doc?.kind === sessionKind && !intentId ? doc : null;
        if (intentId && !agentMode) {
          const intent = await readDocument<JsonRecord>(intentId);
          if (intent?.kind === "studio_intent") {
            // One saved conversation per question makes refresh and parallel
            // opens resume the same idempotent operation.
            const id = `question-${intentId}`;
            stored = await readDocument<StudioSession>(id);
            if (!stored) {
              next = { ...next, id };
              try {
                stored = await saveDocument<StudioSession>(
                  {
                    id,
                    kind: sessionKind,
                    title: next.title,
                    snapshot_id: next.context.snapshot_id,
                    data: next,
                  },
                  0,
                );
              } catch (failure) {
                stored = await readDocument<StudioSession>(id);
                if (!stored) throw failure;
              }
            }
            next = stored.data;
            if (intent.data.auto_submit === true && !next.turns.length)
              setAutoSubmitSession(id);
          }
        }
        if (!active) return;
        saved.current = stored;
        lastSaved.current = stored ? JSON.stringify(next) : "";
        setDocuments(list);
        setSession(next);
        setStorageStatus(stored ? "Saved automatically" : "Saving…");
        onSessionRef.current?.(next.id);
      } catch (failure) {
        if (active) {
          setSession(newSession(snapshotId, context, initialAgent.current));
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
  }, [sessionId, snapshotId, intentId, sessionKind, agentMode]);
  useEffect(() => {
    if (!visible) setVoiceOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!session) return;
    if (JSON.stringify(session) !== lastSaved.current)
      setStorageStatus("Saving…");
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
      void listDocuments<StudioSession>(sessionKind)
        .then((documents) =>
          setDocuments(scopedSessions(documents, initialAgent.current?.id)),
        )
        .catch((failure) => setError(message(failure)));
    };
    window.addEventListener("nova-ember-workspace-changed", changed);
    return () =>
      window.removeEventListener("nova-ember-workspace-changed", changed);
  }, [sessionKind]);
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
            requestAnimationFrame(() => {
              const pane = conversation.current;
              const exchange = document.getElementById(
                `research-turn-${turn.id}`,
              );
              if (!pane) return;
              const top =
                job.status === "succeeded" && exchange
                  ? pane.scrollTop +
                    exchange.getBoundingClientRect().top -
                    pane.getBoundingClientRect().top
                  : pane.scrollHeight;
              pane.scrollTo({ top, behavior: "instant" });
            });
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
  const showCanvas =
    artifacts.some(
      (item) =>
        item.kind !== "Evidence" &&
        !String(item.data.origin ?? "").startsWith("source_"),
    ) || Boolean(selectedArtifact);
  const tabs = [
    "Dashboard",
    "Figures",
    "Simulations",
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
    if (
      !session ||
      busy ||
      activeTurns.length ||
      session.turns.some((turn) =>
        ["submitting", "submission_unconfirmed"].includes(turn.status),
      ) ||
      !session.draft.trim()
    )
      return;
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
        "Shorten your question and optional instructions to fit 6,000 characters together.",
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
      ...(session.agent ? { agent_profile: session.agent.frozen.profile } : {}),
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
    const submitting = {
      ...session,
      title:
        session.turns.length || session.title !== "Untitled research"
          ? session.title
          : session.draft.trim().slice(0, 90),
      draft: "",
      turns: [...session.turns, turn],
    };
    setSession(submitting);
    current.current = submitting;
    setBusy(true);
    setError("");
    try {
      // Persist the operation key before sending. A reload can then recover
      // the exact request without starting another paid operation.
      await persist(submitting);
      const job = await studioRequest("/v1/research", input, {
        headers: { "Idempotency-Key": turn.operation_key },
      });
      await attachJob(turn.id, job);
    } catch (failure) {
      update((previous) => ({
        ...previous,
        turns: previous.turns.map((item) =>
          item.id === turn.id
            ? {
                ...item,
                status: "submission_unconfirmed",
                error: `${message(failure)} Use Recover this request to check or resume this same operation.`,
              }
            : item,
        ),
      }));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !autoSubmitSession ||
      !session ||
      session.id !== autoSubmitSession ||
      capability === null ||
      requestLimit === null ||
      autoSubmitted.current.has(autoSubmitSession)
    )
      return;
    autoSubmitted.current.add(autoSubmitSession);
    void send();
  }, [autoSubmitSession, session, capability, requestLimit]);

  async function attachJob(turnId: string, job: JsonRecord) {
    const value = current.current;
    if (!value) return;
    const next = {
      ...value,
      turns: value.turns.map((item) =>
        item.id === turnId
          ? {
              ...item,
              job_id: String(job.id),
              status: String(job.status ?? "queued"),
              error: undefined,
            }
          : item,
      ),
    };
    // Save access to the accepted job before polling or showing its answer.
    await persist(next);
    current.current = next;
    setSession(next);
  }

  async function recover(turn: StudioTurn) {
    setBusy(true);
    try {
      await persist();
      const job = await studioRequest("/v1/research", turn.request, {
        headers: { "Idempotency-Key": turn.operation_key },
      });
      await attachJob(turn.id, job);
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
    if (busy) return;
    if (doc && !scopedSessions([doc], initialAgent.current?.id).length) {
      setError(
        "Choose a conversation from this agent’s saved session library.",
      );
      return;
    }
    try {
      if (doc?.data.agent) validateAgentProfile(doc.data.agent.frozen.profile);
      await persist();
    } catch (reason) {
      setError(message(reason));
      return;
    }
    let next = doc?.data ?? {
      ...newSession(snapshotId, context, initialAgent.current),
      summary_depth: preferences.summary_depth,
      availability_scope: preferences.evidence_scope,
    };
    if (fork && session)
      next = {
        ...session,
        id: crypto.randomUUID(),
        title: `${session.title} · copy`,
        forked_from: session.id,
        context: { ...session.context, context_version: crypto.randomUUID() },
      };
    saved.current = fork ? null : (doc ?? null);
    lastSaved.current = doc && !fork ? JSON.stringify(doc.data) : "";
    setSession(next);
    setSelectedArtifact("");
    setHistoryOpen(false);
    onSessionChange?.(next.id);
    current.current = next;
    try {
      await persist(next);
      if (!compact && !agentMode) router.replace(`/app/agent/${next.id}`);
    } catch (failure) {
      setError(message(failure));
    }
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
        data: { ...value.data, session_id: session?.id, artifact_id: value.id },
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
  function evidence(id: string, hasLocation: boolean) {
    const found = artifacts.find((item) => item.id === id);
    if (found) {
      setTab(found.kind);
      setSelectedArtifact(id);
      if (compact && !hasLocation) void expand();
      else if (!compact)
        document.getElementById("studio-artifact-canvas")?.focus();
    }
  }
  const { select: selectCitation, reveal: sourceReveal } = useCitationReveal(
    evidence,
    session ? `${session.id}:${contextSelection(session.context)}` : undefined,
    visible,
  );

  if (!session)
    return (
      <section className={styles.loading} aria-busy="true">
        <h1>Research assistant</h1>
        <p>Opening your conversation…</p>
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
      aria-label={
        compact ? "Contextual research assistant" : "Research assistant"
      }
    >
      <header className={styles.header}>
        <div>
          <h1>
            {session.agent?.frozen.profile.name ??
              (compact ? "Ask Nova Ember" : "Research assistant")}
          </h1>
          <p>
            Ask about combustion, follow the NASA sources, and explore the data
            behind an answer.
          </p>
          {session.agent && (
            <details className={styles.agentConfiguration}>
              <summary>Agent configuration for this conversation</summary>
              <p>
                A frozen copy of the role and skills is kept with this chat.
                Source, numerical and approval rules continue to apply.
              </p>
              <strong>Agent instructions</strong>
              <pre>{session.agent.frozen.profile.instructions}</pre>
              {session.agent.frozen.profile.skills.map((skill) => (
                <div key={skill.name}>
                  <strong>{skill.name}</strong>
                  <pre>{skill.instructions}</pre>
                </div>
              ))}
              <p>
                Tool groups:{" "}
                {session.agent.frozen.profile.capabilities.join(", ")}.
                Configuration is user-provided guidance, separate from
                scientific evidence.
              </p>
            </details>
          )}
        </div>
        <div className={styles.actions}>
          <button
            className="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            aria-expanded={historyOpen}
            disabled={busy}
          >
            <History size={16} /> Recent questions
          </button>
          {compact ? (
            <button className="button" onClick={expand}>
              <PanelRightOpen size={16} /> Open full conversation
            </button>
          ) : (
            <button
              className="button"
              onClick={() => switchSession()}
              disabled={busy}
            >
              <Plus size={16} /> New question
            </button>
          )}
        </div>
      </header>
      {historyOpen && (
        <section className={styles.history} aria-label="Recent conversations">
          <h2>Recent questions</h2>
          {!documents.length && (
            <p>Your questions appear here automatically as you research.</p>
          )}
          {documents.map((doc) => (
            <div key={doc.id}>
              <button
                className={styles.textButton}
                onClick={() => switchSession(doc)}
                disabled={busy}
              >
                <MessageSquare size={16} />
                {doc.title}
                <span>{new Date(doc.updated_at).toLocaleDateString()}</span>
              </button>
              <button
                className="icon-button"
                aria-label={`Remove ${doc.title}`}
                onClick={async () => {
                  if (
                    !window.confirm(
                      "Remove this conversation from your saved research? Downloaded backups and running tasks are kept separately.",
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
      {!compact && !showCanvas && artifacts.length > 0 && (
        <button
          className={styles.textButton}
          onClick={() => setSelectedArtifact(artifacts[0].id)}
        >
          Inspect retrieved evidence <BookOpen size={16} />
        </button>
      )}
      {!compact && showCanvas && (
        <details className={styles.layoutControls}>
          <summary>Adjust answer and evidence layout</summary>
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
        className={`${styles.workspace} ${!showCanvas ? styles.conversationOnly : ""}`}
        style={
          {
            "--studio-conversation": `${Math.min(60, Math.max(35, session.conversation_width ?? 42))}%`,
          } as CSSProperties
        }
      >
        <section className={styles.conversationPane} aria-label="Conversation">
          <details className={styles.scopeHeader}>
            <summary>Sources used for this conversation</summary>
            <p>
              NASA research sources are kept with this conversation so the
              evidence can be revisited.
            </p>
            <span>
              Source version <code>{session.context.snapshot_id}</code>
            </span>
          </details>
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
                <h2>What would you like to understand?</h2>
                <p>
                  Find the investigations that address your question, understand
                  their results, or work with the measurements behind them.
                </p>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    update({
                      draft:
                        "Which NASA investigations can help me understand how flames spread in spacecraft?",
                    })
                  }
                >
                  Find research on spacecraft fire spread
                </button>
                <button
                  className={styles.suggestion}
                  onClick={() =>
                    update({
                      draft:
                        "How does microgravity change the way a flame burns? Explain with NASA evidence.",
                    })
                  }
                >
                  Understand fire in microgravity
                </button>
              </div>
            )}
            {session.turns.map((turn) => (
              <div key={turn.id} id={`research-turn-${turn.id}`}>
                <ResearchMessage
                  turn={turn}
                  onSelectCitation={selectCitation}
                  assistantName={session.agent?.frozen.profile.name}
                  onRetry={() => {
                    update({ draft: turn.question });
                    composer.current?.focus();
                  }}
                />
                {["submission_unconfirmed", "submitting"].includes(
                  turn.status,
                ) && (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={() => recover(turn)}
                  >
                    Recover this request
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
            <details
              className={styles.contextDetails}
              open={Boolean(
                session.context.selected_private_inputs?.length ||
                session.context.selected_artifacts?.length,
              )}
            >
              <summary>
                {contextEntries.length
                  ? `${contextEntries.length} selected research items`
                  : "NASA sources · change scope"}
              </summary>
              <div className={styles.contextLabel}>
                <strong>
                  {contextEntries.length
                    ? "Research in this question"
                    : "Searching NASA research"}
                </strong>
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
                  <span>NASA combustion investigations</span>
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
              <details>
                <summary>Technical source context</summary>
                <pre>{JSON.stringify(session.context, null, 2)}</pre>
              </details>
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
              placeholder="Ask about the research, compare evidence, or explore a measurement…"
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
              {!agentMode && (
                <button
                  className="button button-small"
                  onClick={() => setVoiceOpen(!voiceOpen)}
                  aria-expanded={voiceOpen}
                >
                  Live voice
                </button>
              )}
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
                      !session.draft.trim() ||
                      session.turns.some((turn) =>
                        ["submitting", "submission_unconfirmed"].includes(
                          turn.status,
                        ),
                      )
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
              <summary>Research options</summary>
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
                  <option value="auto">Automatic</option>
                  <option value="routine">Routine reasoning</option>
                  <option value="complex">Deeper reasoning</option>
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
                . Unconfirmed charges remain reserved.
                {!agentMode && " Voice has a separate displayed lease."}
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
        {!compact && showCanvas && (
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
                  <ArtifactCanvas
                    key={artifact.id}
                    artifact={artifact}
                    onSave={saveArtifact}
                  />
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
                  <li>Save useful results to your research.</li>
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
      <details className={styles.conversationDetails}>
        <summary>
          Conversation details{" "}
          <span className={styles.saveState} role="status">
            {storageStatus}
          </span>
        </summary>
        <div className={styles.sessionBar}>
          <label>
            <span className="visually-hidden">Conversation title</span>
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
            disabled={busy}
          >
            <GitFork size={15} /> Make a copy
          </button>
        </div>
      </details>
      {session.forked_from && (
        <p className={styles.muted}>
          This is a separate copy. The original conversation is preserved.
        </p>
      )}
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
                <summary>Review what will run</summary>
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
      {!agentMode && voiceOpen && (
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
      {sourceReveal}
    </section>
  );
}

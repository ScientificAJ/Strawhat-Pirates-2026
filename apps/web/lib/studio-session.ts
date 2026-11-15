import type { components } from "../../../packages/contracts/api-types";
import { rememberJob } from "./private-jobs";
import type { AgentSelection, CustomAgentProfile } from "./agent-profiles";

export type WorkspaceContext = components["schemas"]["WorkspaceContext"];
export type ResearchInput = components["schemas"]["ResearchRequest"];
export type SharedImage = components["schemas"]["SelectedImage"];
export type JsonRecord = Record<string, unknown>;
export type StudioArtifact = {
  id: string;
  title: string;
  kind: string;
  snapshot_id: string;
  data: JsonRecord;
};
export type StudioTurn = {
  id: string;
  question: string;
  created_at: string;
  request: ResearchInput;
  operation_key: string;
  job_id?: string;
  status: string;
  events: JsonRecord[];
  result?: JsonRecord;
  error?: string;
};
export type StudioSession = {
  id: string;
  title: string;
  context: WorkspaceContext;
  draft: string;
  plan: string;
  budget: number;
  turns: StudioTurn[];
  forked_from?: string;
  context_locked: boolean;
  image?: SharedImage;
  image_name?: string;
  image_source?: JsonRecord;
  image_consented: boolean;
  voice_transcript: JsonRecord[];
  voice_session_id?: string;
  evidence_scope: "selection" | "corpus";
  complexity: ResearchInput["complexity"];
  role: ResearchInput["role"];
  summary_depth: "brief" | "technical" | "methods";
  availability_scope: "retained" | "catalog";
  conversation_width: number;
  agent?: {
    profile_id: string;
    profile_revision: number;
    frozen: { profile: CustomAgentProfile };
  };
};

export function object(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}
export function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(object) : [];
}
export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not complete. Your draft is retained.";
}
export async function studioRequest<T = JsonRecord>(
  url: string,
  body?: unknown,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    method: options.method ?? (body === undefined ? "GET" : "POST"),
    credentials: "same-origin",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value: unknown =
    response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = object(value).detail;
    throw new Error(
      typeof detail === "string"
        ? detail
        : response.status === 404
          ? "Temporary access has expired or belongs to another browser. Your local work is retained."
          : `The research service returned ${response.status}. Check the selected context and try again.`,
    );
  }
  if (response.status === 202 && !url.startsWith("/v1/voice/sessions"))
    void rememberJob(value);
  return value as T;
}
export function freshContext(snapshot: string): WorkspaceContext {
  return {
    schema_version: 1,
    context_version: crypto.randomUUID(),
    snapshot_id: snapshot,
  };
}
export function newSession(
  snapshot: string,
  context?: WorkspaceContext,
  agent?: AgentSelection,
): StudioSession {
  return {
    id: crypto.randomUUID(),
    title: agent ? `${agent.profile.name} research` : "Untitled research",
    context: context ?? freshContext(snapshot),
    draft: "",
    plan: "",
    budget: 1,
    turns: [],
    context_locked: false,
    image_consented: false,
    voice_transcript: [],
    evidence_scope: "selection",
    complexity: "auto",
    role: "coordinator",
    summary_depth: "technical",
    availability_scope: "retained",
    conversation_width: 42,
    ...(agent
      ? {
          agent: {
            profile_id: agent.id,
            profile_revision: agent.revision,
            frozen: { profile: structuredClone(agent.profile) },
          },
        }
      : {}),
  };
}
export function selectedHistory(
  turns: StudioTurn[],
): NonNullable<ResearchInput["history"]> {
  const result: NonNullable<ResearchInput["history"]> = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  const candidates = turns.flatMap((turn) => {
    const answer = object(turn.result?.answer);
    const claims = records(answer.claims)
      .map((claim) =>
        [
          String(claim.statement ?? ""),
          ...strings(claim.limitations).map(
            (limit) => `Qualification: ${limit}`,
          ),
        ].join("\n"),
      )
      .join("\n");
    const response = [
      claims,
      ...strings(answer.limitations).map((limit) => `Limit: ${limit}`),
      ...strings(answer.contradictions).map((item) => `Unresolved: ${item}`),
      ...strings(answer.next_actions).map(
        (action) => `Next research step: ${action}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");
    return [
      { role: "user" as const, text: turn.question },
      ...(response ? [{ role: "assistant" as const, text: response }] : []),
    ];
  });
  for (const turn of candidates.reverse()) {
    const size = encoder.encode(turn.text).length;
    if (turn.text.length > 6000 || size + bytes > 24000 || result.length === 16)
      break;
    result.unshift(turn);
    bytes += size;
  }
  return result;
}
export function sessionArtifacts(session: StudioSession): StudioArtifact[] {
  const artifacts = session.turns.flatMap((turn) =>
    records(turn.result?.facts).map((fact) => {
      const content = object(fact.content);
      let kind = "Evidence";
      if (
        content.artifact_type === "educational_simulation" ||
        content.artifact_type === "bass_fire_illustration"
      )
        kind = "Simulations";
      else if (content.plot || content.vega_lite) kind = "Figures";
      else if (content.dashboard || content.components) kind = "Dashboard";
      else if (
        content.values ||
        content.records ||
        content.data ||
        content.rows
      )
        kind = "Tables";
      else if (content.proposal && object(content.proposal).code) kind = "Code";
      else if (
        fact.label === "propose_note" ||
        content.expected_context_version
      )
        kind = "Research case";
      return {
        id: String(fact.id),
        title: String(fact.label ?? "Research artifact"),
        kind,
        snapshot_id: turn.request.context.snapshot_id,
        data: fact,
      };
    }),
  );
  return Array.from(
    new Map(artifacts.map((artifact) => [artifact.id, artifact])).values(),
  );
}
export async function sourceImage(
  file: File,
  purpose: string,
): Promise<SharedImage> {
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 900000) {
    throw new Error(
      "Choose an original PNG or JPEG no larger than 900,000 bytes. Images are not rescaled.",
    );
  }
  const bytes = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const expected_sha256 = Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
  const image_base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("This selected image could not be read."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
  return {
    consent: true,
    media_type: file.type as "image/png" | "image/jpeg",
    expected_sha256,
    image_base64,
    purpose,
  };
}

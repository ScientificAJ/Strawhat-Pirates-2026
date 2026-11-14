"use client";

import {
  deleteDocument,
  listDocuments,
  saveDocument,
  type WorkspaceDocument,
} from "./workspace-documents";

export const agentCapabilities = [
  {
    id: "sources",
    label: "Source evidence",
    description:
      "Find and inspect investigations, records and exact source passages.",
  },
  {
    id: "analysis",
    label: "Calculations and comparison",
    description: "Use registered calculations and compare explicit conditions.",
  },
  {
    id: "visualization",
    label: "Figures and simulations",
    description:
      "Prepare scientific figures and optional model visualizations.",
  },
  {
    id: "modeling",
    label: "Modeling",
    description:
      "Inspect, fit and assess registered models within their stated domains.",
  },
  {
    id: "code",
    label: "Code proposals",
    description:
      "Prepare inspectable code for separately approved local execution.",
  },
  {
    id: "workspace",
    label: "Workspace proposals",
    description: "Propose case updates or metadata corrections for review.",
  },
  {
    id: "export",
    label: "Exports",
    description: "Prepare frozen research exports for explicit confirmation.",
  },
] as const;

export type AgentCapability = (typeof agentCapabilities)[number]["id"];
export type AgentSkill = { name: string; instructions: string };
export type CustomAgentProfile = {
  name: string;
  description: string;
  instructions: string;
  skills: AgentSkill[];
  capabilities: AgentCapability[];
};
export type AgentSelection = {
  id: string;
  revision: number;
  profile: CustomAgentProfile;
};
export type AgentDraftProvenance = {
  model: string;
  prompt_version: string;
  cost_usd: string;
  description: string;
};
export type SavedAgent = WorkspaceDocument<{
  profile: CustomAgentProfile;
  draft_provenance?: AgentDraftProvenance;
}>;
export type SavedAgentSkill = WorkspaceDocument<{
  skill: AgentSkill;
  draft_provenance?: AgentDraftProvenance;
}>;
export type AgentCatalog = {
  profiles: { id: string; profile: CustomAgentProfile }[];
};
export type AgentDraft = {
  status: "draft";
  kind: "profile" | "skill";
  profile: CustomAgentProfile | null;
  skill: AgentSkill | null;
  model: string;
  prompt_version: string;
  cost_usd: string;
  limitations: string[];
};

export function parseAgentCatalog(value: unknown): AgentCatalog {
  const catalog = record(value);
  if (!Array.isArray(catalog.profiles))
    throw new Error("The built-in agent catalog could not be read.");
  return {
    profiles: catalog.profiles.map((entry) => {
      const item = record(entry);
      return {
        id: text(item.id, "Agent identifier", 80),
        profile: validateAgentProfile(item.profile),
      };
    }),
  };
}
export function parseAgentDraft(
  value: unknown,
  kind: "profile" | "skill",
): AgentDraft {
  const draft = record(value);
  if (
    draft.status !== "draft" ||
    draft.kind !== kind ||
    typeof draft.cost_usd !== "string" ||
    !draft.cost_usd.trim() ||
    !Number.isFinite(Number(draft.cost_usd)) ||
    Number(draft.cost_usd) < 0
  )
    throw new Error(
      "The agent draft response was incomplete. Your description is retained.",
    );
  return {
    status: "draft",
    kind,
    profile: kind === "profile" ? validateAgentProfile(draft.profile) : null,
    skill: kind === "skill" ? validateAgentSkill(draft.skill) : null,
    model: text(draft.model, "Draft model", 256),
    prompt_version: text(draft.prompt_version, "Draft prompt version", 256),
    cost_usd: draft.cost_usd,
    limitations: Array.isArray(draft.limitations)
      ? draft.limitations.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
  };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("The saved agent configuration is not an object.");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, maximum: number, required = true) {
  const normalized = typeof value === "string" ? value.trim() : null;
  if (
    normalized === null ||
    normalized.length > maximum ||
    (required && !normalized)
  )
    throw new Error(
      `${label} must ${required ? "contain text and " : ""}fit within ${maximum.toLocaleString()} characters.`,
    );
  return normalized;
}
function configurationName(value: unknown, label: string) {
  const name = text(value, label, 80);
  if (/[\x00-\x1f\x7f]/.test(name))
    throw new Error(
      `${label} must be a single line without control characters.`,
    );
  return name;
}
export function validateAgentSkill(value: unknown): AgentSkill {
  const skill = record(value);
  return {
    name: configurationName(skill.name, "Skill name"),
    instructions: text(skill.instructions, "Skill instructions", 4000),
  };
}
export function validateAgentProfile(value: unknown): CustomAgentProfile {
  const input = record(value);
  if (!Array.isArray(input.skills) || input.skills.length > 8)
    throw new Error("An agent can contain up to eight skills.");
  const skills = input.skills.map(validateAgentSkill);
  if (
    new Set(skills.map((skill) => skill.name.toLowerCase())).size !==
    skills.length
  )
    throw new Error("Give each attached skill a distinct name.");
  const allowed = new Set<string>(agentCapabilities.map((item) => item.id));
  if (
    !Array.isArray(input.capabilities) ||
    !input.capabilities.length ||
    input.capabilities.length > 7 ||
    input.capabilities.some(
      (item) => typeof item !== "string" || !allowed.has(item),
    ) ||
    new Set(input.capabilities).size !== input.capabilities.length
  )
    throw new Error(
      "Choose at least one available tool group, without duplicates.",
    );
  const instructions = text(input.instructions, "Agent instructions", 6000);
  if (
    instructions.length +
      skills.reduce((sum, skill) => sum + skill.instructions.length, 0) >
    16000
  )
    throw new Error(
      "Agent and attached skill instructions must fit within 16,000 characters together.",
    );
  return {
    name: configurationName(input.name, "Agent name"),
    description: text(input.description ?? "", "Description", 500, false),
    instructions,
    skills,
    capabilities: [...input.capabilities] as AgentCapability[],
  };
}
export function blankAgentProfile(): CustomAgentProfile {
  return {
    name: "",
    description: "",
    instructions: "",
    skills: [],
    capabilities: ["sources"],
  };
}
export function freezeAgent(selection: AgentSelection): AgentSelection {
  return {
    id: selection.id,
    revision: selection.revision,
    profile: validateAgentProfile(structuredClone(selection.profile)),
  };
}
export async function loadAgentLibrary() {
  const [profiles, skills] = await Promise.all([
    listDocuments<SavedAgent["data"]>("agent_profile"),
    listDocuments<SavedAgentSkill["data"]>("agent_skill"),
  ]);
  const agents: SavedAgent[] = [],
    reusableSkills: SavedAgentSkill[] = [],
    issues: string[] = [];
  for (const document of profiles) {
    try {
      agents.push({
        ...document,
        data: {
          ...document.data,
          profile: validateAgentProfile(document.data.profile),
        },
      });
    } catch {
      issues.push(
        `“${document.title}” has an unreadable agent configuration. Its saved record was preserved.`,
      );
    }
  }
  for (const document of skills) {
    try {
      reusableSkills.push({
        ...document,
        data: {
          ...document.data,
          skill: validateAgentSkill(document.data.skill),
        },
      });
    } catch {
      issues.push(
        `“${document.title}” has an unreadable skill configuration. Its saved record was preserved.`,
      );
    }
  }
  return { agents, skills: reusableSkills, issues };
}
export function saveAgentProfile(
  profile: CustomAgentProfile,
  previous: SavedAgent | null,
  provenance?: AgentDraftProvenance,
) {
  const validated = validateAgentProfile(profile);
  return saveDocument<SavedAgent["data"]>(
    {
      ...(previous ? { id: previous.id, revision: previous.revision } : {}),
      kind: "agent_profile",
      title: validated.name,
      snapshot_id: null,
      data: {
        profile: validated,
        ...(provenance ? { draft_provenance: provenance } : {}),
      },
    },
    previous?.revision,
  );
}
export function saveAgentSkill(
  skill: AgentSkill,
  previous: SavedAgentSkill | null,
  provenance?: AgentDraftProvenance,
) {
  const validated = validateAgentSkill(skill);
  return saveDocument<SavedAgentSkill["data"]>(
    {
      ...(previous ? { id: previous.id, revision: previous.revision } : {}),
      kind: "agent_skill",
      title: validated.name,
      snapshot_id: null,
      data: {
        skill: validated,
        ...(provenance ? { draft_provenance: provenance } : {}),
      },
    },
    previous?.revision,
  );
}
export function removeAgentDocument(document: SavedAgent | SavedAgentSkill) {
  return deleteDocument(document.id, document.revision);
}

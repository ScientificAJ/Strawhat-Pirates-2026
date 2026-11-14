import type { WorkspaceDocument } from "./workspace-documents";

export function researchDocumentLabel(kind: string): string {
  const labels: Record<string, string> = {
    artifact: "Saved file",
    research_artifact: "Saved result",
    studio_session: "Conversation",
    agent_session: "Conversation",
    bookmark: "Investigation",
    analysis: "Data analysis",
    scenario: "Research scenario",
    comparison: "Comparison",
    dashboard: "Research figure",
    saved_search: "Saved search",
    search: "Saved search",
    collection: "Source collection",
    evidence: "Evidence notes",
  };
  return labels[kind] ?? "Research notes";
}

export function researchDocumentHref(
  document: WorkspaceDocument,
): string | null {
  const id = encodeURIComponent(document.id);
  const data = document.data;
  const version = document.snapshot_id
    ? `?snapshot=${document.snapshot_id}`
    : "";
  switch (document.kind) {
    case "research_artifact":
      return typeof data.session_id === "string"
        ? `/app/agent/${encodeURIComponent(data.session_id)}`
        : null;
    case "studio_session":
      return `/app/agent/${id}`;
    case "agent_session":
      return `/app/agents?session=${id}`;
    case "bookmark":
      return typeof data.accession === "string" &&
        /^PSI-\d+$/.test(data.accession)
        ? `/app/investigations/${data.accession}${document.snapshot_id ? `?snapshot=${document.snapshot_id}` : ""}`
        : null;
    case "analysis":
      if (["code", "media"].includes(String(data.surface)))
        return `/app/lab/${data.surface}/${id}${version}`;
      if (!data.query && !data.method && data.surface !== "models") return null;
      return `/app/lab/${data.surface === "models" || data.method ? "models" : "data"}/${id}${version}`;
    case "scenario":
      return `/app/lab/scenarios/${id}${version}`;
    case "comparison":
      return `/app/compare/${id}${version}`;
    case "dashboard":
      return `/app/dashboards/${id}${version}`;
    case "hypothesis":
    case "control":
    case "earth_transfer":
    case "note":
      return `/app/lab/evidence/${typeof data.view === "string" ? encodeURIComponent(data.view) : "sources"}?saved=${id}${document.snapshot_id ? `&snapshot=${document.snapshot_id}` : ""}`;
    case "saved_search":
    case "search":
    case "collection":
      return `/app/investigations?saved=${id}${document.snapshot_id ? `&snapshot=${document.snapshot_id}` : ""}`;
    default:
      return null;
  }
}

export function visibleResearchDocuments(documents: WorkspaceDocument[]) {
  return documents.filter(
    (document) =>
      [
        "artifact",
        "research_artifact",
        "studio_session",
        "agent_session",
        "bookmark",
        "analysis",
        "scenario",
        "comparison",
        "dashboard",
        "saved_search",
        "search",
        "collection",
        "evidence",
        "hypothesis",
        "control",
        "earth_transfer",
        "note",
      ].includes(document.kind) &&
      !document.id.startsWith("laboratory-inputs-") &&
      !document.id.startsWith("laboratory-chart-") &&
      (document.kind !== "studio_session" ||
        (Array.isArray(document.data.turns) &&
          document.data.turns.length > 0) ||
        (typeof document.data.draft === "string" &&
          document.data.draft.trim().length > 0)),
  );
}

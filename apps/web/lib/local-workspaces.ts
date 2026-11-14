"use client";

export type LocalWorkspace = { id: string; name: string; created_at: string };
let mountedWorkspaceId: string | null = null;
const primary: LocalWorkspace = {
  id: "primary",
  name: "On this device",
  created_at: "",
};
export function activeWorkspaceId(): string {
  if (typeof window === "undefined") return "primary";
  if (mountedWorkspaceId) return mountedWorkspaceId;
  try {
    const saved = localStorage.getItem("nova-ember-active-workspace");
    mountedWorkspaceId =
      saved && /^[a-f0-9-]{36}$/.test(saved) ? saved : "primary";
  } catch {
    mountedWorkspaceId = "primary";
  }
  return mountedWorkspaceId;
}
export function workspaceDatabaseName(id = activeWorkspaceId()) {
  return id === "primary"
    ? "nova-ember-workspace"
    : `nova-ember-workspace-${id}`;
}
export function localWorkspaces(): LocalWorkspace[] {
  const raw = localStorage.getItem("nova-ember-local-workspaces");
  const values: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(values))
    throw new Error(
      "The local workspace list could not be read. Existing databases have not been changed.",
    );
  return [
    primary,
    ...values.filter(
      (value): value is LocalWorkspace =>
        !!value &&
        typeof value === "object" &&
        typeof value.id === "string" &&
        /^[a-f0-9-]{36}$/.test(value.id) &&
        typeof value.name === "string" &&
        typeof value.created_at === "string",
    ),
  ];
}
export function addLocalWorkspace(name: string) {
  const workspace = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 100) || "Research workspace",
    created_at: new Date().toISOString(),
  };
  localStorage.setItem(
    "nova-ember-local-workspaces",
    JSON.stringify([
      ...localWorkspaces().filter((item) => item.id !== "primary"),
      workspace,
    ]),
  );
  return workspace;
}
export function selectLocalWorkspace(id: string) {
  if (!localWorkspaces().some((item) => item.id === id))
    throw new Error("This local workspace is unavailable.");
  localStorage.setItem("nova-ember-active-workspace", id);
  window.dispatchEvent(new Event("nova-ember-workspace-selected"));
}

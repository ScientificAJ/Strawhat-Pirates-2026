"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Copy, Plus, Save, Trash2 } from "lucide-react";
import {
  agentCapabilities,
  blankAgentProfile,
  freezeAgent,
  loadAgentLibrary,
  parseAgentCatalog,
  removeAgentDocument,
  saveAgentProfile,
  saveAgentSkill,
  type AgentDraftProvenance,
  type AgentSelection,
  type AgentSkill,
  type CustomAgentProfile,
  type SavedAgent,
  type SavedAgentSkill,
} from "../lib/agent-profiles";
import {
  listDocuments,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import {
  message,
  studioRequest,
  type StudioSession,
  type WorkspaceContext,
} from "../lib/studio-session";
import { AgentDraftBuilder } from "./agent-draft-builder";
import { ResearchStudio } from "./studio";
import styles from "./agent-workshop.module.css";

type ActiveChat = {
  selection: AgentSelection;
  sessionId?: string;
  snapshotId: string;
  context?: WorkspaceContext;
  key: string;
};

export function AgentWorkshop({
  snapshotId,
  context,
}: {
  snapshotId: string | null;
  context?: WorkspaceContext;
}) {
  const reusableSkillId = useId();
  const [mode, setMode] = useState<"agents" | "skills">("agents");
  const [builtins, setBuiltins] = useState<
    { id: string; profile: CustomAgentProfile }[]
  >([]);
  const [agents, setAgents] = useState<SavedAgent[]>([]);
  const [skills, setSkills] = useState<SavedAgentSkill[]>([]);
  const [chats, setChats] = useState<WorkspaceDocument<StudioSession>[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [agentDocument, setAgentDocument] = useState<SavedAgent | null>(null);
  const [profile, setProfile] = useState(blankAgentProfile);
  const [agentProvenance, setAgentProvenance] =
    useState<AgentDraftProvenance>();
  const [dirty, setDirty] = useState(false);
  const [skillDocument, setSkillDocument] = useState<SavedAgentSkill | null>(
    null,
  );
  const [skill, setSkill] = useState<AgentSkill>({
    name: "",
    instructions: "",
  });
  const [skillProvenance, setSkillProvenance] =
    useState<AgentDraftProvenance>();
  const [skillDirty, setSkillDirty] = useState(false);
  const [attachment, setAttachment] = useState("");
  const [builder, setBuilder] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const blocked = busy || drafting;
  const busyRef = useRef(false);
  const [deleting, setDeleting] = useState<SavedAgent | SavedAgentSkill | null>(
    null,
  );
  const [active, setActive] = useState<ActiveChat | null>(null);
  const builtin = selected?.startsWith("builtin:") ?? false;
  const chatSnapshot = context?.snapshot_id ?? snapshotId;

  const refresh = useCallback(async () => {
    const [library, sessions] = await Promise.all([
      loadAgentLibrary(),
      listDocuments<StudioSession>("agent_session"),
    ]);
    setAgents(library.agents);
    setSkills(library.skills);
    setIssues(library.issues);
    setChats(sessions.filter((item) => Boolean(item.data.agent)));
  }, []);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    const changed = () => {
      void refresh().catch((reason) => {
        if (current) setError(message(reason));
      });
    };
    changed();
    void studioRequest<unknown>("/v1/agents/catalog", undefined, {
      signal: controller.signal,
    })
      .then(parseAgentCatalog)
      .then((catalog) => {
        if (current) setBuiltins(catalog.profiles);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setCatalogError(message(reason));
      });
    window.addEventListener("nova-ember-workspace-changed", changed);
    return () => {
      current = false;
      controller.abort();
      window.removeEventListener("nova-ember-workspace-changed", changed);
    };
  }, [refresh]);

  function discardAgent() {
    return !dirty || window.confirm("Discard the unsaved agent changes?");
  }
  function pickProfile(
    key: string,
    value: CustomAgentProfile,
    document: SavedAgent | null = null,
  ) {
    if (!discardAgent()) return;
    setSelected(key);
    setProfile(structuredClone(value));
    setAgentDocument(document);
    setAgentProvenance(document?.data.draft_provenance);
    setDirty(false);
    setError("");
    setNotice("");
  }
  function changeProfile(change: Partial<CustomAgentProfile>) {
    setProfile((previous) => ({ ...previous, ...change }));
    setDirty(true);
    setNotice("");
  }
  function newAgent() {
    pickProfile("new", blankAgentProfile());
  }
  function cloneAgent() {
    setNotice("");
    setError("");
    setSelected("new");
    setAgentDocument(null);
    setProfile({
      ...structuredClone(profile),
      name: `${profile.name.slice(0, 74)} copy`,
    });
    setDirty(true);
  }
  function useAgent() {
    if (!chatSnapshot || !selected || dirty) return;
    try {
      const selection = freezeAgent({
        id: agentDocument?.id ?? selected.replace(/^builtin:/, ""),
        revision: agentDocument?.revision ?? 0,
        profile,
      });
      setActive({
        selection,
        snapshotId: chatSnapshot,
        context: context ? structuredClone(context) : undefined,
        key: crypto.randomUUID(),
      });
    } catch (reason) {
      setError(message(reason));
    }
  }
  function resumeChat(document: WorkspaceDocument<StudioSession>) {
    try {
      const configuration = document.data.agent;
      if (!configuration?.frozen?.profile)
        throw new Error("This conversation has no saved agent configuration.");
      const selection = freezeAgent({
        id: configuration.profile_id,
        revision: configuration.profile_revision,
        profile: configuration.frozen.profile,
      });
      setActive({
        selection,
        sessionId: document.id,
        snapshotId: document.data.context.snapshot_id,
        context: document.data.context,
        key: crypto.randomUUID(),
      });
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current || builtin) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const stored = await saveAgentProfile(
        profile,
        agentDocument,
        agentProvenance,
      );
      setAgentDocument(stored);
      setSelected(`saved:${stored.id}`);
      setProfile(stored.data.profile);
      setDirty(false);
      setNotice(
        `Saved ${stored.title}, revision ${stored.revision}, on this device.`,
      );
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function pickSkill(document: SavedAgentSkill | null) {
    if (skillDirty && !window.confirm("Discard the unsaved skill changes?"))
      return;
    setSkillDocument(document);
    setSkill(
      document
        ? structuredClone(document.data.skill)
        : { name: "", instructions: "" },
    );
    setSkillProvenance(document?.data.draft_provenance);
    setSkillDirty(false);
    setError("");
    setNotice("");
  }
  async function saveSkill(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const stored = await saveAgentSkill(
        skill,
        skillDocument,
        skillProvenance,
      );
      setSkillDocument(stored);
      setSkill(stored.data.skill);
      setSkillDirty(false);
      setNotice(`Saved ${stored.title} in your reusable skill library.`);
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function removeSelected() {
    if (!deleting || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await removeAgentDocument(deleting);
      if (deleting.kind === "agent_profile") {
        setSelected(null);
        setAgentDocument(null);
        setDirty(false);
      } else {
        setSkillDocument(null);
        setSkill({ name: "", instructions: "" });
        setSkillDirty(false);
      }
      setDeleting(null);
      setNotice(
        "Removed the saved configuration. Existing chat and attached skill snapshots are preserved.",
      );
      await refresh();
    } catch (reason) {
      setError(message(reason));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (active)
    return (
      <div className={styles.workshop}>
        <div className={styles.chatNavigation}>
          <button className="button" onClick={() => setActive(null)}>
            <ArrowLeft size={16} /> Agents
          </button>
          <span>Profile and skills are frozen for this conversation.</span>
        </div>
        <ResearchStudio
          key={active.key}
          snapshotId={active.snapshotId}
          context={active.context}
          sessionId={active.sessionId}
          agentProfile={active.selection}
        />
      </div>
    );
  return (
    <div className={styles.workshop}>
      <div className="page-heading">
        <div>
          <h1>Agents</h1>
          <p>
            Choose a research role, or shape your own with instructions and
            reusable skills.
          </p>
        </div>
        <button
          className="button button-primary"
          disabled={blocked}
          onClick={() => {
            setMode("agents");
            newAgent();
          }}
        >
          <Plus size={16} /> New agent
        </button>
      </div>
      <p className={styles.introduction}>
        Agents are optional. Their instructions guide the role and working style
        within Nova Ember’s source, numerical and approval rules. Profiles,
        skills and conversations stay in this browser workspace and travel with
        its complete backup.
      </p>
      <div
        className={styles.toolbar}
        role="group"
        aria-label="Agent workshop sections"
      >
        <button
          className="button"
          disabled={blocked}
          aria-pressed={mode === "agents"}
          onClick={() => setMode("agents")}
        >
          Agent library
        </button>
        <button
          className="button"
          disabled={blocked}
          aria-pressed={mode === "skills"}
          onClick={() => setMode("skills")}
        >
          Reusable skills
        </button>
        <button
          className="text-button"
          disabled={blocked}
          aria-expanded={builder}
          onClick={() => setBuilder((open) => !open)}
        >
          Describe the {mode === "agents" ? "agent" : "skill"} you need
        </button>
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.feedback}>
          {notice}
        </p>
      )}
      {issues.length > 0 && (
        <div className={styles.feedback} role="alert">
          {issues.map((issue) => (
            <p key={issue}>{issue}</p>
          ))}
        </div>
      )}
      {deleting && (
        <div className={styles.feedback}>
          <p>
            Delete “{deleting.title}” from this library? Existing conversations
            and copied skill text keep their saved configuration.
          </p>
          <div className={styles.actions}>
            <button
              className="button"
              disabled={blocked}
              onClick={() => void removeSelected()}
            >
              Delete configuration
            </button>
            <button
              className="button"
              disabled={blocked}
              onClick={() => setDeleting(null)}
            >
              Keep configuration
            </button>
          </div>
        </div>
      )}
      {builder && (
        <AgentDraftBuilder
          kind={mode === "agents" ? "profile" : "skill"}
          onBusyChange={setDrafting}
          disabled={blocked || (mode === "agents" ? dirty : skillDirty)}
          onDraft={(draft, provenance) => {
            if (draft.profile) {
              setSelected("new");
              setAgentDocument(null);
              setProfile(draft.profile);
              setAgentProvenance(provenance);
              setDirty(true);
            }
            if (draft.skill) {
              setSkillDocument(null);
              setSkill(draft.skill);
              setSkillProvenance(provenance);
              setSkillDirty(true);
            }
            setNotice(
              "The returned draft is open below. Review its instructions and tool groups, then save it to your library.",
            );
          }}
        />
      )}
      {mode === "agents" ? (
        <>
          <div className={styles.layout}>
            <aside className={styles.library} aria-label="Agent library">
              <h2>Built-in agents</h2>
              {catalogError && (
                <p className={styles.help}>
                  Built-ins could not be loaded. Your local library and manual
                  editor remain available. {catalogError}
                </p>
              )}
              <ul className={styles.profileList}>
                {builtins.map((item) => (
                  <li key={item.id}>
                    <button
                      className={styles.profileChoice}
                      disabled={blocked}
                      aria-pressed={selected === `builtin:${item.id}`}
                      onClick={() =>
                        pickProfile(`builtin:${item.id}`, item.profile)
                      }
                    >
                      <strong>{item.profile.name}</strong>
                      <span>{item.profile.description}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <h2>Your agents</h2>
              {!agents.length && (
                <p className={styles.help}>
                  Create an agent or customize a built-in role to start your
                  personal library.
                </p>
              )}
              <ul className={styles.profileList}>
                {agents.map((item) => (
                  <li key={item.id}>
                    <button
                      className={styles.profileChoice}
                      disabled={blocked}
                      aria-pressed={selected === `saved:${item.id}`}
                      onClick={() =>
                        pickProfile(`saved:${item.id}`, item.data.profile, item)
                      }
                    >
                      <strong>{item.title}</strong>
                      <span>
                        {item.data.profile.description ||
                          `Saved revision ${item.revision}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <section className={styles.editor} aria-label="Agent editor">
              {selected ? (
                <form onSubmit={saveProfile}>
                  <div className={styles.sectionHeading}>
                    <div>
                      <h2>
                        {builtin
                          ? "Built-in role"
                          : agentDocument
                            ? "Edit agent"
                            : "Create an agent"}
                      </h2>
                      <p className={styles.help}>
                        {builtin
                          ? "Use this role as it is, or make a personal copy to customize."
                          : "Instructions and attached skills are shared with the model when you send a message."}
                      </p>
                    </div>
                    {dirty && (
                      <span className={styles.unsaved}>Unsaved changes</span>
                    )}
                  </div>
                  <label className={styles.field}>
                    Agent name
                    <input
                      required
                      maxLength={80}
                      readOnly={builtin || blocked}
                      value={profile.name}
                      onChange={(event) =>
                        changeProfile({ name: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    Short description
                    <textarea
                      aria-label="Short description"
                      maxLength={500}
                      rows={2}
                      readOnly={builtin || blocked}
                      value={profile.description}
                      onChange={(event) =>
                        changeProfile({ description: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    Agent instructions
                    <textarea
                      aria-label="Agent instructions"
                      required
                      maxLength={6000}
                      rows={8}
                      readOnly={builtin || blocked}
                      value={profile.instructions}
                      onChange={(event) =>
                        changeProfile({ instructions: event.target.value })
                      }
                    />
                  </label>
                  <fieldset className={styles.capabilities}>
                    <legend>Available tool groups</legend>
                    {agentCapabilities.map((item) => (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          disabled={builtin || blocked}
                          checked={profile.capabilities.includes(item.id)}
                          onChange={(event) =>
                            changeProfile({
                              capabilities: event.target.checked
                                ? [...profile.capabilities, item.id]
                                : profile.capabilities.filter(
                                    (id) => id !== item.id,
                                  ),
                            })
                          }
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                  <fieldset className={styles.attached}>
                    <legend>Attached skills</legend>
                    <p className={styles.help}>
                      Each attachment copies its current instruction text.
                      Editing the shared library later preserves existing agents
                      and chat snapshots.
                    </p>
                    {profile.skills.map((item, index) => (
                      <div className={styles.skillAttachment} key={index}>
                        <label className={styles.field}>
                          Skill name
                          <input
                            required
                            maxLength={80}
                            readOnly={builtin || blocked}
                            value={item.name}
                            onChange={(event) =>
                              changeProfile({
                                skills: profile.skills.map((value, position) =>
                                  position === index
                                    ? { ...value, name: event.target.value }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        <label className={styles.field}>
                          Skill instructions
                          <textarea
                            aria-label="Skill instructions"
                            required
                            maxLength={4000}
                            rows={4}
                            readOnly={builtin || blocked}
                            value={item.instructions}
                            onChange={(event) =>
                              changeProfile({
                                skills: profile.skills.map((value, position) =>
                                  position === index
                                    ? {
                                        ...value,
                                        instructions: event.target.value,
                                      }
                                    : value,
                                ),
                              })
                            }
                          />
                        </label>
                        {!builtin && (
                          <button
                            type="button"
                            className="text-button"
                            disabled={blocked}
                            onClick={() =>
                              changeProfile({
                                skills: profile.skills.filter(
                                  (_, position) => position !== index,
                                ),
                              })
                            }
                          >
                            Remove skill
                          </button>
                        )}
                      </div>
                    ))}
                    {!builtin && (
                      <div className={styles.actions}>
                        <div className={styles.field}>
                          <label htmlFor={reusableSkillId}>
                            Reusable skill
                          </label>
                          <select
                            id={reusableSkillId}
                            value={attachment}
                            disabled={blocked || profile.skills.length >= 8}
                            onChange={(event) =>
                              setAttachment(event.target.value)
                            }
                          >
                            <option value="">Choose a saved skill</option>
                            {skills.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.title}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          className="button"
                          disabled={
                            busy || !attachment || profile.skills.length >= 8
                          }
                          onClick={() => {
                            const item = skills.find(
                              (value) => value.id === attachment,
                            );
                            if (item)
                              changeProfile({
                                skills: [
                                  ...profile.skills,
                                  structuredClone(item.data.skill),
                                ],
                              });
                            setAttachment("");
                          }}
                        >
                          Attach skill
                        </button>
                      </div>
                    )}
                  </fieldset>
                  <div className={styles.actions}>
                    {!builtin && (
                      <button
                        type="submit"
                        className="button button-primary"
                        disabled={blocked}
                      >
                        <Save size={16} />
                        {busy ? "Saving…" : "Save agent"}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`button ${builtin ? "button-primary" : ""}`}
                      disabled={
                        busy ||
                        dirty ||
                        !chatSnapshot ||
                        (!builtin && !agentDocument)
                      }
                      onClick={useAgent}
                    >
                      Use agent
                    </button>
                    <button
                      type="button"
                      className="button"
                      disabled={blocked}
                      onClick={cloneAgent}
                    >
                      <Copy size={16} />
                      {builtin ? "Customize a copy" : "Clone agent"}
                    </button>
                    {dirty && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={blocked}
                        onClick={() => {
                          if (agentDocument) {
                            setProfile(
                              structuredClone(agentDocument.data.profile),
                            );
                            setDirty(false);
                          } else {
                            setSelected(null);
                            setDirty(false);
                          }
                        }}
                      >
                        Cancel changes
                      </button>
                    )}
                    {agentDocument && (
                      <button
                        type="button"
                        className="text-button"
                        disabled={blocked}
                        onClick={() => setDeleting(agentDocument)}
                      >
                        <Trash2 size={15} />
                        Delete agent
                      </button>
                    )}
                  </div>
                  {dirty && (
                    <p className={styles.help}>
                      Save the current configuration before starting its
                      conversation.
                    </p>
                  )}
                  {!chatSnapshot && (
                    <p className={styles.help}>
                      A source snapshot is needed to start research. You can
                      edit and save configurations while the source service is
                      unavailable.
                    </p>
                  )}
                </form>
              ) : (
                <div>
                  <h2>Choose a role or create an agent</h2>
                  <p className={styles.help}>
                    Inspect a built-in agent’s instructions, customize a copy,
                    or start with your own role and skills.
                  </p>
                  <button className="button" onClick={newAgent}>
                    <Plus size={16} />
                    Create manually
                  </button>
                </div>
              )}
            </section>
          </div>
          <section className={styles.sessions}>
            <h2>Agent conversations</h2>
            <p className={styles.help}>
              Each conversation keeps the exact profile and skill text it
              started with.
            </p>
            {!chats.length ? (
              <p className={styles.help}>
                Your agent conversations appear here after you choose Use agent.
              </p>
            ) : (
              <ul className={styles.sessionList}>
                {chats.map((item) => (
                  <li key={item.id}>
                    <button
                      className="text-button"
                      disabled={blocked}
                      onClick={() => resumeChat(item)}
                    >
                      {item.title}
                    </button>
                    <span>
                      {item.data.agent?.frozen?.profile?.name ?? "Saved agent"}{" "}
                      · chat revision {item.revision}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <div className={styles.layout}>
          <aside className={styles.library} aria-label="Reusable skill library">
            <div className={styles.sectionHeading}>
              <h2>Your skills</h2>
              <button
                className="button button-small"
                disabled={blocked}
                onClick={() => pickSkill(null)}
              >
                New skill
              </button>
            </div>
            <p className={styles.help}>
              Keep focused instruction blocks for methods, reviewing or
              teaching, then attach a copy to any agent.
            </p>
            <ul className={styles.profileList}>
              {skills.map((item) => (
                <li key={item.id}>
                  <button
                    className={styles.profileChoice}
                    disabled={blocked}
                    aria-pressed={skillDocument?.id === item.id}
                    onClick={() => pickSkill(item)}
                  >
                    <strong>{item.title}</strong>
                    <span>Revision {item.revision}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <section className={styles.editor} aria-label="Skill editor">
            <form onSubmit={saveSkill} aria-busy={blocked}>
              <h2>
                {skillDocument
                  ? "Edit reusable skill"
                  : "Create a reusable skill"}
              </h2>
              <label className={styles.field}>
                Skill name
                <input
                  required
                  maxLength={80}
                  value={skill.name}
                  readOnly={blocked}
                  onChange={(event) => {
                    setSkill({ ...skill, name: event.target.value });
                    setSkillDirty(true);
                  }}
                />
              </label>
              <label className={styles.field}>
                Skill instructions
                <textarea
                  aria-label="Skill instructions"
                  required
                  maxLength={4000}
                  rows={10}
                  value={skill.instructions}
                  readOnly={blocked}
                  onChange={(event) => {
                    setSkill({ ...skill, instructions: event.target.value });
                    setSkillDirty(true);
                  }}
                />
              </label>
              <div className={styles.actions}>
                <button
                  className="button button-primary"
                  disabled={blocked}
                  type="submit"
                >
                  <Save size={16} />
                  Save skill
                </button>
                <button
                  className="button"
                  disabled={
                    blocked || !skill.name.trim() || !skill.instructions.trim()
                  }
                  type="button"
                  onClick={() => {
                    setNotice("");
                    setError("");
                    setSkillDocument(null);
                    setSkill({
                      ...skill,
                      name: `${skill.name.slice(0, 74)} copy`,
                    });
                    setSkillDirty(true);
                  }}
                >
                  <Copy size={16} /> Clone skill
                </button>
                {skillDirty && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      setSkill(
                        skillDocument
                          ? structuredClone(skillDocument.data.skill)
                          : { name: "", instructions: "" },
                      );
                      setSkillProvenance(skillDocument?.data.draft_provenance);
                      setSkillDirty(false);
                    }}
                  >
                    Cancel changes
                  </button>
                )}
                {skillDocument && (
                  <button
                    className="text-button"
                    type="button"
                    disabled={blocked}
                    onClick={() => setDeleting(skillDocument)}
                  >
                    <Trash2 size={15} />
                    Delete skill
                  </button>
                )}
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

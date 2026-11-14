"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Plus,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";
import { downloadJson } from "../lib/api";
import {
  ResearchCase,
  saveCase,
  SavedRevision,
  workspaceBackup,
} from "../lib/workspace-storage";
import { Notice } from "./chrome";
import { CaseSourceEvidence } from "./case-source-evidence";

export function newCase(
  snapshot: string | null,
  ids: string[] = [],
  title = "Untitled research case",
): ResearchCase {
  return {
    id: crypto.randomUUID(),
    title,
    question: "",
    notes: "",
    investigation_ids: ids,
    snapshot_id: snapshot,
    source_anchors: [],
    revision: 0,
    updated_at: new Date().toISOString(),
    revisions: [],
  };
}

export function CaseNotebook({
  cases,
  entityId,
  snapshot,
  selected,
  onSaved,
}: {
  cases: ResearchCase[];
  entityId?: string;
  snapshot: string | null;
  selected: string[];
  onSaved: () => Promise<void>;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ResearchCase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (entityId === "new") setDraft(newCase(snapshot, selected));
    else setDraft(cases.find((item) => item.id === entityId) ?? null);
    setError(null);
    setSaved(false);
  }, [entityId]);
  useEffect(() => {
    if (entityId && entityId !== "new" && !draft)
      setDraft(cases.find((item) => item.id === entityId) ?? null);
  }, [cases, draft, entityId]);

  function change(field: "title" | "question" | "notes", value: string) {
    setSaved(false);
    setDraft((current) => (current ? { ...current, [field]: value } : null));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    const revision: SavedRevision = {
      revision: draft.revision + 1,
      saved_at: new Date().toISOString(),
      question: draft.question,
      notes: draft.notes,
      investigation_ids: draft.investigation_ids,
      snapshot_id: draft.snapshot_id,
      source_anchors: draft.source_anchors ?? [],
    };
    const next = {
      ...draft,
      revision: revision.revision,
      updated_at: revision.saved_at,
      revisions: [...draft.revisions, revision],
    };
    try {
      await saveCase(next, draft.revision || undefined);
      setDraft(next);
      setSaved(true);
      await onSaved();
      if (entityId === "new") router.replace(`/app/cases/${next.id}`);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This revision could not be saved. Download the draft to preserve it.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!entityId)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>Research cases</h1>
            <p>Your questions, evidence, and notes. Saved on this device.</p>
          </div>
          <Link className="button button-primary" href="/app/cases/new">
            <Plus size={17} />
            New research case
          </Link>
        </div>
        <Notice>
          <strong>A personal notebook without an account</strong>
          <p>
            Cases stay in this browser profile. Back up your workspace to move
            to another device or preserve it before clearing browser storage.
          </p>
        </Notice>
        {cases.length ? (
          <section className="case-list">
            {cases.map((item) => (
              <Link
                className="case-list-item"
                key={item.id}
                href={`/app/cases/${item.id}`}
              >
                <BookOpen size={23} />
                <div>
                  <h2>{item.title}</h2>
                  <p>{item.question || "No research question recorded yet."}</p>
                  <span className="muted">
                    Revision {item.revision} · {item.investigation_ids.length}{" "}
                    sources · Saved{" "}
                    {new Date(item.updated_at).toLocaleDateString()}
                  </span>
                </div>
                <ArrowRight size={19} />
              </Link>
            ))}
          </section>
        ) : (
          <div className="empty-state case-empty">
            <BookOpen size={36} />
            <h2>Begin with a question worth keeping</h2>
            <p>
              Open an investigation and save its evidence, or create a case to
              record what you want to understand.
            </p>
            <Link className="button" href="/app/investigations">
              Explore investigations
              <ArrowRight size={16} />
            </Link>
          </div>
        )}
      </>
    );

  if (!draft)
    return (
      <>
        <Link className="back-link" href="/app/cases">
          <ArrowLeft size={16} />
          Research cases
        </Link>
        <Notice>
          <strong>This case is not available in this browser.</strong>
          <p>
            Restore its workspace backup here, or return to the device where it
            was saved.
          </p>
        </Notice>
      </>
    );

  return (
    <>
      <Link className="back-link" href="/app/cases">
        <ArrowLeft size={16} />
        Research cases
      </Link>
      <div className="page-heading">
        <div>
          <h1>{draft.revision ? "Research notebook" : "New research case"}</h1>
          <p>
            {saved
              ? "This revision is saved in your browser."
              : "Record a question and keep its source context together."}
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            downloadJson(
              "nova-ember-research-case.json",
              workspaceBackup([draft]),
            )
          }
        >
          <ArrowDownToLine size={16} />
          Export {draft.revision && saved ? "case" : "draft"}
        </button>
      </div>
      <div className="notebook-layout">
        <form className="reading-surface notebook-form" onSubmit={save}>
          <label>
            Case title
            <input
              value={draft.title}
              maxLength={1000}
              required
              onChange={(event) => change("title", event.target.value)}
            />
          </label>
          <label>
            Research question
            <textarea
              value={draft.question}
              maxLength={10_000}
              rows={3}
              placeholder="What do you want to understand from this evidence?"
              onChange={(event) => change("question", event.target.value)}
            />
          </label>
          <label>
            Notes and unresolved questions
            <textarea
              className="notes-editor"
              value={draft.notes}
              maxLength={100_000}
              rows={9}
              placeholder="Record observations, source checks, limitations, and the next thing to investigate."
              onChange={(event) => change("notes", event.target.value)}
            />
          </label>
          {error && <Notice kind="error">{error}</Notice>}
          <div className="notebook-actions">
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || saved || !draft.title.trim()}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              {saving
                ? "Saving…"
                : saved
                  ? `Revision ${draft.revision} saved`
                  : "Save revision"}
            </button>
            <span className="field-help">
              On this device · No automatic cloud sync
            </span>
          </div>
        </form>
        <aside className="source-identity">
          <h2>Attached evidence</h2>
          {draft.investigation_ids.length ? (
            <ul className="linked-sources">
              {draft.investigation_ids.map((id) => (
                <li key={id}>
                  <Link href={`/app/investigations/${id}`}>
                    <span className="mono">{id}</span>
                    <ArrowUpRightSmall />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">
              No sources attached. Save an investigation to a case from its
              source view.
            </p>
          )}
          <CaseSourceEvidence anchors={draft.source_anchors ?? []} />
          <h2>Frozen context</h2>
          <p className="field-help">
            {draft.snapshot_id ? (
              <>
                Source snapshot{" "}
                <span className="mono hash-value">{draft.snapshot_id}</span>
              </>
            ) : (
              "No source snapshot selected."
            )}
          </p>
          <h2>Saved revisions</h2>
          {draft.revisions.length ? (
            <ol className="revision-list">
              {draft.revisions
                .slice()
                .reverse()
                .map((revision) => (
                  <li key={revision.revision}>
                    <strong>Revision {revision.revision}</strong>
                    <span>{new Date(revision.saved_at).toLocaleString()}</span>
                    <details>
                      <summary>Inspect saved notes</summary>
                      <p>{revision.question || "No question recorded."}</p>
                      <p className="preserve-lines">
                        {revision.notes || "No notes recorded."}
                      </p>
                      <CaseSourceEvidence
                        anchors={revision.source_anchors ?? []}
                      />
                    </details>
                  </li>
                ))}
            </ol>
          ) : (
            <p className="field-help">
              Save the first revision to preserve this question and its context.
            </p>
          )}
        </aside>
      </div>
    </>
  );
}

function ArrowUpRightSmall() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M4 12 12 4M5 4h7v7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

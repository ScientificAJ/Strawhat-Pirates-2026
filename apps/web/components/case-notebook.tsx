"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowLeft, Check, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  ResearchCase,
  saveCase,
  SavedRevision,
} from "../lib/workspace-storage";
import { Notice } from "./chrome";
import { SavedResearch } from "./saved-research";
import { CaseSourceEvidence } from "./case-source-evidence";
import {
  CaseResearchTools,
  type CaseResearchToolsHandle,
} from "./case-research-tools";

export function newCase(
  snapshot: string | null,
  ids: string[] = [],
  title = "Research notes",
): ResearchCase {
  return {
    id: crypto.randomUUID(),
    title,
    question: "",
    notes: "",
    investigation_ids: [...ids],
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
  const [toolsReady, setToolsReady] = useState(false);
  const structured = useRef<CaseResearchToolsHandle>(null);
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

  useEffect(() => {
    if (entityId !== "new" || !selected.length) return;
    setDraft((current) =>
      current &&
      current.revision === 0 &&
      !current.investigation_ids.length &&
      (!current.snapshot_id || current.snapshot_id === snapshot)
        ? {
            ...current,
            snapshot_id: snapshot,
            investigation_ids: [...selected],
          }
        : current,
    );
  }, [entityId, selected, snapshot]);

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
      let structuredSaved = false;
      try {
        await structured.current?.freeze(next);
        setSaved(true);
        structuredSaved = true;
      } catch (failure) {
        setSaved(false);
        setError(
          `Case revision ${next.revision} was saved, but its structured research snapshot needs recovery. ${failure instanceof Error ? failure.message : "Keep this draft open and save another revision after storage is available."}`,
        );
      }
      await onSaved();
      if (entityId === "new" && structuredSaved)
        router.replace(`/app/cases/${next.id}`);
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

  if (!entityId) return <SavedResearch cases={cases} />;

  if (!draft)
    return (
      <>
        <Link className="back-link" href="/app/cases">
          <ArrowLeft size={16} />
          Your research
        </Link>
        <Notice>
          <strong>These notes are not available in this browser.</strong>
          <p>
            Restore a research backup, or return to the device where it was
            saved.
          </p>
        </Notice>
      </>
    );

  return (
    <>
      <Link className="back-link" href="/app/cases">
        <ArrowLeft size={16} />
        Your research
      </Link>
      <div className="page-heading">
        <div>
          <h1>{draft.revision ? "Research notebook" : "Research notes"}</h1>
          <p>
            {saved
              ? "This revision is saved in your browser."
              : "Record your reasoning and keep the evidence alongside it."}
          </p>
        </div>
        <button
          className="button"
          onClick={() => structured.current?.openExport()}
        >
          <ArrowDownToLine size={16} />
          Export {draft.revision && saved ? "case" : "draft"}
        </button>
      </div>
      <div className="notebook-layout">
        <form className="reading-surface notebook-form" onSubmit={save}>
          <label>
            Notes title
            <input
              disabled={saving}
              value={draft.title}
              maxLength={1000}
              required
              onChange={(event) => change("title", event.target.value)}
            />
          </label>
          <label>
            Research question
            <textarea
              id="case-question"
              disabled={saving}
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
              disabled={saving}
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
              disabled={saving || saved || !draft.title.trim() || !toolsReady}
            >
              {saved ? <Check size={16} /> : <Save size={16} />}
              {saving
                ? "Saving…"
                : saved
                  ? `Revision ${draft.revision} saved`
                  : "Save revision"}
            </button>
            <span className="field-help">
              Create a revision to keep these notes and their evidence together.
            </span>
          </div>
        </form>
        <aside className="source-identity">
          <h2>Attached evidence</h2>
          {draft.investigation_ids.length ? (
            <ul className="linked-sources">
              {draft.investigation_ids.map((id) => (
                <li key={id}>
                  <Link
                    href={`/app/investigations/${id}${draft.snapshot_id ? `?snapshot=${encodeURIComponent(draft.snapshot_id)}` : ""}`}
                  >
                    <span className="mono">{id}</span>
                    <ArrowUpRightSmall />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="field-help">
              No sources attached yet. Explore an investigation and save it to
              your research.
            </p>
          )}
          <CaseSourceEvidence anchors={draft.source_anchors ?? []} />
          <details>
            <summary>Source version details</summary>
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
          </details>
          <details>
            <summary>Saved revisions</summary>
            {draft.revisions.length ? (
              <ol className="revision-list">
                {draft.revisions
                  .slice()
                  .reverse()
                  .map((revision) => (
                    <li key={revision.revision}>
                      <strong>Revision {revision.revision}</strong>
                      <span>
                        {new Date(revision.saved_at).toLocaleString()}
                      </span>
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
                Save the first revision to preserve this question and its
                context.
              </p>
            )}
          </details>
        </aside>
      </div>
      <details className="reading-surface">
        <summary>Prepare a research report or assess applicability</summary>
        <CaseResearchTools
          ref={structured}
          value={draft}
          onReady={setToolsReady}
          onDraftChange={() => setSaved(false)}
          onRestore={(historical) => {
            setDraft((current) =>
              current
                ? {
                    ...current,
                    title: historical.title,
                    question: historical.question,
                    notes: historical.notes,
                    investigation_ids: historical.investigation_ids,
                    snapshot_id: historical.snapshot_id,
                    source_anchors: historical.source_anchors ?? [],
                  }
                : current,
            );
            setSaved(false);
          }}
        />
      </details>
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

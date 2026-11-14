"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { useEffect, useState } from "react";
import type { ResearchCase } from "../lib/workspace-storage";
import { savedArtifactDownload } from "../lib/laboratory-api";
import { downloadJson } from "../lib/api";
import {
  listDocuments,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import {
  researchDocumentHref,
  researchDocumentLabel,
  visibleResearchDocuments,
} from "../lib/research-history";
import { Notice } from "./chrome";
import styles from "./saved-research.module.css";

export function SavedResearch({ cases }: { cases: ResearchCase[] }) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void listDocuments()
        .then((items) => {
          if (active) setDocuments(visibleResearchDocuments(items));
        })
        .catch((reason) => {
          if (active) setError(String(reason));
        });
    };
    refresh();
    window.addEventListener("nova-ember-workspace-changed", refresh);
    return () => {
      active = false;
      window.removeEventListener("nova-ember-workspace-changed", refresh);
    };
  }, []);
  const items = [
    ...documents.map((item) => ({
      id: item.id,
      title: item.title,
      label: researchDocumentLabel(item.kind),
      href: researchDocumentHref(item),
      date: item.updated_at,
      document: item,
      group:
        item.kind === "studio_session" || item.kind === "agent_session"
          ? "questions"
          : item.kind === "artifact"
            ? "files"
            : item.kind === "bookmark"
              ? "investigations"
              : ["evidence", "note"].includes(item.kind)
                ? "notes"
                : "analyses",
    })),
    ...cases.map((item) => ({
      id: item.id,
      title: item.title,
      label: "Research notes",
      document: undefined,
      href: `/app/cases/${item.id}`,
      date: item.updated_at,
      group: "notes",
    })),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const matching = items.filter(
    (item) =>
      (filter === "all" || item.group === filter) &&
      item.title.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Your research</h1>
          <p>
            Return to your questions, saved investigations, analyses and notes.
          </p>
        </div>
        <Link className="button" href="/app/cases/new">
          <BookOpen size={17} /> Add research notes
        </Link>
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {items.length ? (
        <section className={styles.library} aria-label="Saved research">
          <div className={styles.controls}>
            <label className={styles.search}>
              <Search size={18} />
              <span className="visually-hidden">Find saved research</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find something you worked on…"
              />
            </label>
            <label>
              <span className="visually-hidden">Research type</span>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="all">All research</option>
                <option value="questions">Questions</option>
                <option value="investigations">Investigations</option>
                <option value="analyses">Analyses & saved views</option>
                <option value="notes">Notes</option>
                <option value="files">Saved files</option>
              </select>
            </label>
          </div>
          {matching.length ? (
            <ul className={styles.list}>
              {matching.map((item) => (
                <li key={item.id}>
                  {item.document?.kind === "artifact" &&
                  typeof item.document.data.bytes_base64 === "string" &&
                  typeof item.document.data.file_name === "string" ? (
                    <div className={styles.item}>
                      <div>
                        <span className={styles.kind}>Saved file</span>
                        <h2>{item.title}</h2>
                        <small>
                          {typeof item.document.data.byte_size === "number"
                            ? `${item.document.data.byte_size.toLocaleString()} bytes`
                            : "Original saved bytes"}
                        </small>
                      </div>
                      <button
                        className="button"
                        onClick={() => {
                          const data = item.document!.data;
                          try {
                            savedArtifactDownload({
                              file_name: String(data.file_name),
                              media_type:
                                typeof data.media_type === "string"
                                  ? data.media_type
                                  : "application/octet-stream",
                              bytes_base64: String(data.bytes_base64),
                            });
                          } catch {
                            setError(
                              "This saved file could not be downloaded. Restore a research backup if the saved bytes are damaged.",
                            );
                          }
                        }}
                      >
                        Download saved file
                      </button>
                    </div>
                  ) : item.href ? (
                    <Link className={styles.item} href={item.href}>
                      <div>
                        <span className={styles.kind}>{item.label}</span>
                        <h2>{item.title}</h2>
                      </div>
                      <time dateTime={item.date}>
                        {new Date(item.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </time>
                      <ArrowRight size={18} />
                    </Link>
                  ) : (
                    <details className={styles.record}>
                      <summary className={styles.item}>
                        <div>
                          <span className={styles.kind}>{item.label}</span>
                          <h2>{item.title}</h2>
                        </div>
                        <span className={styles.kind}>
                          Inspect saved record
                        </span>
                      </summary>
                      <div className={styles.recordBody}>
                        <p>
                          The saved inputs, results and source references are
                          preserved below in their original structure.
                        </p>
                        <button
                          className="button"
                          onClick={() =>
                            downloadJson(
                              `${item.title.slice(0, 80)}.json`,
                              item.document,
                            )
                          }
                        >
                          Download saved record
                        </button>
                        <pre>
                          {JSON.stringify(
                            {
                              snapshot_id: item.document?.snapshot_id,
                              saved_at: item.date,
                              data: item.document?.data,
                            },
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}>
              <h2>No matching research</h2>
              <p>Try a shorter search or show all research.</p>
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Show all research
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className={styles.empty}>
          <BookOpen size={30} />
          <h2>A place to pick up where you left off</h2>
          <p>
            Your conversations appear here automatically. Save an investigation
            or an analysis as you explore, and return to it whenever you need.
          </p>
          <div className="inline-actions">
            <Link className="button button-primary" href="/app/agent">
              Ask a research question <ArrowRight size={16} />
            </Link>
            <Link className="button" href="/app/investigations">
              Find investigations
            </Link>
          </div>
        </section>
      )}
      <p className={styles.backup}>
        Taking your research to another device?{" "}
        <Link href="/app/settings">Download or restore a backup</Link>.
      </p>
    </>
  );
}

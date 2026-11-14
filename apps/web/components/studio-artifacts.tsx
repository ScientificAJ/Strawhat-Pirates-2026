"use client";

import { ArrowDownToLine, Check, Copy, ExternalLink, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ArtifactView } from "./artifact-view";
import { downloadJson } from "../lib/api";
import { isDropletVisualization } from "../lib/simulation";
import { chatCitations } from "../lib/chat-sources";
import {
  ChatSources,
  CitationButton,
  type SelectCitation,
} from "./chat-sources";
import {
  object,
  records,
  strings,
  type JsonRecord,
  type StudioArtifact,
  type StudioTurn,
} from "../lib/studio-session";
import styles from "./studio.module.css";

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function ResearchMessage({
  turn,
  onSelectCitation,
  assistantName = "Nova Ember",
}: {
  turn: StudioTurn;
  onSelectCitation: SelectCitation;
  assistantName?: string;
}) {
  const answer = object(turn.result?.answer);
  const claims = records(answer.claims);
  const limits = strings(answer.limitations);
  const citations = chatCitations(claims, turn.result?.facts);
  const citationById = new Map(
    citations.map((citation) => [citation.id, citation]),
  );
  const simulations = records(turn.result?.facts).filter((fact) =>
    isDropletVisualization(fact.content),
  );
  const retrievedInvestigations = [
    ...new Set(
      records(turn.result?.facts)
        .flatMap((fact) =>
          records(fact.sources).map((source) => source.accession),
        )
        .filter(
          (id): id is string => typeof id === "string" && /^PSI-\d+$/.test(id),
        ),
    ),
  ];
  const incomplete =
    turn.result &&
    typeof turn.result.status === "string" &&
    turn.result.status !== "completed";
  const [copied, setCopied] = useState(false);
  async function copy() {
    const body = claims
      .map(
        (claim) =>
          `${claim.statement} ${[...new Set(strings(claim.fact_ids))].map((id) => `[${citationById.get(id)?.number ?? "?"}]`).join(" ")}\n${strings(claim.limitations).join("\n")}`,
      )
      .join("\n\n");
    const unresolved = strings(answer.contradictions).map(
      (value) => `Unresolved: ${value}`,
    );
    const nextActions = strings(answer.next_actions).map(
      (value) => `Next research step: ${value}`,
    );
    const references = citations
      .map((citation) =>
        [
          `[${citation.number}] ${citation.label} · ${citation.origin}`,
          `Evidence identifier: ${citation.id}`,
          ...(citation.calculated
            ? [
                "Original source locations identify calculation inputs, not source measurements of the calculated result.",
              ]
            : []),
          ...(citation.scopeNote ? [citation.scopeNote] : []),
          `Recorded source locations: ${JSON.stringify(citation.anchors)}`,
        ].join("\n"),
      )
      .join("\n\n");
    const text = `${body}\n\n${[...limits, ...unresolved, ...nextActions].join("\n")}\n\nSources\n${references}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <article className={styles.turn} aria-label="Research exchange">
      <div className={styles.userMessage}>
        <span className={styles.messageLabel}>You</span>
        <p>{turn.question}</p>
      </div>
      <div className={styles.response}>
        <div className={styles.messageHeading}>
          <strong>{assistantName}</strong>
          <span className={styles.status}>
            {incomplete
              ? "Research stopped before a complete answer"
              : ((
                  {
                    queued: "Waiting to start",
                    running: "Researching…",
                    succeeded: "Answer ready",
                    canceled: "Stopped",
                    failed: "Could not complete",
                    submitting: "Sending…",
                    submission_unconfirmed: "Request needs recovery",
                    waiting_approval: "Confirmation needed",
                    cancel_requested: "Stopping…",
                  } as Record<string, string>
                )[turn.status] ?? turn.status.replaceAll("_", " "))}
          </span>
        </div>
        {turn.error && (
          <p role="alert" className={styles.error}>
            {turn.error}
          </p>
        )}
        {Boolean(answer.title) && <h2>{String(answer.title)}</h2>}
        {claims.map((claim, index) => (
          <section key={index} className={styles.claim}>
            <span className={styles.origin}>
              {(
                {
                  source_summary: "NASA source summary",
                  calculated: "Calculation",
                  predicted: "Model prediction",
                  model_interpretation: "Interpretation",
                  research_hypothesis: "Research hypothesis",
                  user_input_summary: "Your data",
                  unknown: "Evidence gap",
                } as Record<string, string>
              )[String(claim.origin)] ?? "Interpretation"}
            </span>
            <p>
              {String(claim.statement ?? "")}{" "}
              {[...new Set(strings(claim.fact_ids))].map((id) => {
                const citation = citationById.get(id);
                return citation ? (
                  <CitationButton
                    key={id}
                    citation={citation}
                    onSelect={onSelectCitation}
                  />
                ) : null;
              })}
            </p>
            {strings(claim.limitations).map((limit) => (
              <p className={styles.qualification} key={limit}>
                {limit}
              </p>
            ))}
          </section>
        ))}
        {!turn.result && !turn.error && (
          <p className={styles.muted}>
            Searching the research and preparing an answer. You can follow the
            sources and calculations as they become available.
          </p>
        )}
        {turn.result && !claims.length && (
          <p>
            {String(
              turn.result.failure ??
                "No answer was returned. Open the sources and research activity for details, or try a more specific question.",
            )}
          </p>
        )}
        {!claims.length && retrievedInvestigations.length > 0 && (
          <section aria-label="Retrieved investigations">
            <h3>Explore the sources retrieved so far</h3>
            <p>
              The assistant did not finish a synthesis. These investigation
              records remain available to inspect.
            </p>
            <div className={styles.actions}>
              {retrievedInvestigations.map((id) => (
                <Link
                  className="button button-small"
                  key={id}
                  href={`/app/investigations/${id}?snapshot=${turn.request.context.snapshot_id}`}
                >
                  {id}
                  <ExternalLink size={14} />
                </Link>
              ))}
            </div>
          </section>
        )}
        {limits.length > 0 && (
          <div className={styles.limitations}>
            <strong>Reading this result</strong>
            <ul>
              {limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </div>
        )}
        {records(answer.withheld_claims).length > 0 && (
          <details>
            <summary>
              {records(answer.withheld_claims).length} unsupported claims
              withheld
            </summary>
            {records(answer.withheld_claims).map((item, i) => (
              <p key={i}>
                {String(object(item.claim).statement)} —{" "}
                {strings(item.reasons).join(" ")}
              </p>
            ))}
          </details>
        )}
        {strings(answer.contradictions).length > 0 && (
          <div className={styles.limitations}>
            <strong>Unresolved evidence</strong>
            <ul>
              {strings(answer.contradictions).map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </div>
        )}
        {strings(answer.next_actions).length > 0 && (
          <section aria-label="Next research steps">
            <h3>Next research steps</h3>
            <ul>
              {strings(answer.next_actions).map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </section>
        )}
        {simulations.map((fact) => (
          <section key={String(fact.id)} aria-label="Prepared simulation">
            <ArtifactView value={fact.content} />
          </section>
        ))}
        {turn.result && (
          <ChatSources citations={citations} onSelect={onSelectCitation} />
        )}
        {(turn.events.length > 0 ||
          records(turn.result?.actions).length > 0) && (
          <details className={styles.activity}>
            <summary>Research activity · {turn.events.length} steps</summary>
            <ol>
              {turn.events.map((event, i) => (
                <li key={String(event.sequence ?? i)}>
                  <strong>
                    {String(event.event_type ?? "Recorded activity").replaceAll(
                      "_",
                      " ",
                    )}
                  </strong>
                  {Boolean(object(event.payload).tool) && (
                    <span>
                      {" "}
                      ·{" "}
                      {String(object(event.payload).tool).replaceAll("_", " ")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {records(turn.result?.actions).map((action, i) => (
              <details key={i}>
                <summary>
                  {String(action.tool).replaceAll("_", " ")} · inputs
                </summary>
                <pre>{JSON.stringify(action.inputs, null, 2)}</pre>
              </details>
            ))}
          </details>
        )}
        {turn.result && (
          <footer className={styles.messageFooter}>
            <details>
              <summary>Answer details</summary>
              <p>Model: {String(turn.result.model ?? "Not reported")}</p>
              <p>
                {Number.isFinite(Number(turn.result.cost_usd))
                  ? `Estimated usage: $${Number(turn.result.cost_usd).toFixed(4)}`
                  : "Usage not reported"}
              </p>
            </details>
            <button className={styles.textButton} onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied with evidence" : "Copy with evidence"}
            </button>
          </footer>
        )}
      </div>
    </article>
  );
}

export function ArtifactCanvas({
  artifact,
  onSave,
}: {
  artifact: StudioArtifact;
  onSave?: (artifact: StudioArtifact) => void | Promise<void>;
}) {
  const [notice, setNotice] = useState("");
  const content = object(artifact.data.content);
  const sources = records(artifact.data.sources);
  const proposal = object(content.proposal);
  async function save() {
    try {
      await onSave?.(artifact);
      setNotice("Saved to Your research.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The artifact could not be saved. Export a copy to retain it.",
      );
    }
  }
  const table = object(content.data);
  const rows = records(
    content.values ?? content.records ?? content.rows ?? table.values,
  );
  return (
    <section className={styles.artifact} aria-label={artifact.title}>
      <header className={styles.artifactHeading}>
        <div>
          <h2>{artifact.title}</h2>
          <span className={styles.origin}>
            {String(
              artifact.data.origin ?? "Recorded research artifact",
            ).replaceAll("_", " ")}
          </span>
        </div>
        <div className={styles.actions}>
          <button
            className="button button-small"
            onClick={save}
            disabled={!onSave}
          >
            <Save size={16} /> Save
          </button>
          <button
            className="button button-small"
            onClick={() =>
              downloadJson(
                `${artifact.kind.toLowerCase()}-${artifact.id.slice(0, 8)}.json`,
                artifact,
              )
            }
          >
            <ArrowDownToLine size={16} /> Export
          </button>
        </div>
      </header>
      {notice && <p role="status">{notice}</p>}
      <ArtifactView value={content} />
      {Boolean(proposal.code) && (
        <div className={styles.code}>
          <h3>{String(proposal.language ?? "Code")} proposal</h3>
          <p>
            {String(
              proposal.purpose ??
                "Inspect the code and exact selected inputs before approving execution.",
            )}
          </p>
          <pre>
            <code>{String(proposal.code)}</code>
          </pre>
        </div>
      )}
      {rows.length > 0 && !content.plot && (
        <details>
          <summary>Inspect exact data · {rows.length} returned entries</summary>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  {Object.keys(rows[0]).map((key) => (
                    <th key={key}>{key.replaceAll("_", " ")}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, i) => (
                  <tr key={i}>
                    {Object.keys(rows[0]).map((key) => (
                      <td key={key}>
                        {row[key] === null
                          ? "Not available"
                          : typeof row[key] === "object"
                            ? JSON.stringify(row[key])
                            : String(row[key] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 && (
              <p>
                Showing the first 100 returned entries. The export retains the
                complete stored artifact.
              </p>
            )}
          </div>
        </details>
      )}
      {strings(artifact.data.limitations).length > 0 && (
        <details className={styles.limitations}>
          <summary>Scientific qualifications</summary>
          <ul>
            {strings(artifact.data.limitations).map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </details>
      )}
      <details className={styles.sourceList}>
        <summary>Source references & provenance</summary>
        <p>
          Snapshot <code>{artifact.snapshot_id}</code>
        </p>
        {sources.map((source, i) => (
          <div key={i}>
            <strong>
              {String(
                source.file_name ??
                  source.accession ??
                  source.kind ??
                  "Selected source",
              )}
            </strong>
            <p>
              {source.source_row ? `Source row ${source.source_row} · ` : ""}
              {String(source.sha256 ?? source.source_sha256 ?? "")}
            </p>
            {sourceUrl(source.source_url) && (
              <a
                href={sourceUrl(source.source_url)}
                target="_blank"
                rel="noreferrer"
              >
                Open original source <ExternalLink size={13} />
              </a>
            )}
          </div>
        ))}
      </details>
      <details>
        <summary>Full method and artifact record</summary>
        <pre>{JSON.stringify(artifact.data, null, 2)}</pre>
      </details>
    </section>
  );
}

export function childOperations(turns: StudioTurn[]): JsonRecord[] {
  const found = new Map<string, JsonRecord>();
  for (const turn of turns)
    for (const fact of records(turn.result?.facts)) {
      const content = object(fact.content);
      const operation = object(content.operation);
      if (typeof operation.id === "string")
        found.set(operation.id, {
          ...operation,
          proposal: content.proposal,
          frozen_inputs: content.frozen_inputs,
          snapshot_id: turn.request.context.snapshot_id,
        });
    }
  return Array.from(found.values());
}

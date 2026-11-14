"use client";

import {
  ArrowDownToLine,
  BookOpen,
  Check,
  Copy,
  ExternalLink,
  Save,
} from "lucide-react";
import { useState } from "react";
import { ArtifactView } from "./artifact-view";
import { downloadJson } from "../lib/api";
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
  onEvidence,
}: {
  turn: StudioTurn;
  onEvidence: (id: string) => void;
}) {
  const answer = object(turn.result?.answer);
  const claims = records(answer.claims);
  const limits = strings(answer.limitations);
  const [copied, setCopied] = useState(false);
  async function copy() {
    const text = claims
      .map(
        (claim) =>
          `${claim.statement}\n${strings(claim.limitations).join("\n")}\nEvidence: ${strings(claim.fact_ids).join(", ")}`,
      )
      .join("\n\n");
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
          <strong>Nova Ember</strong>
          <span className={styles.status}>
            {turn.status.replaceAll("_", " ")}
            {turn.result?.status && turn.result.status !== "completed"
              ? ` · ${String(turn.result.status).replaceAll("_", " ")}`
              : ""}
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
              {String(
                claim.interpretation_status ?? claim.origin ?? "Interpretation",
              ).replaceAll("_", " ")}
            </span>
            <p>{String(claim.statement ?? "")}</p>
            {strings(claim.limitations).map((limit) => (
              <p className={styles.qualification} key={limit}>
                {limit}
              </p>
            ))}
            <div className={styles.evidenceLinks}>
              {strings(claim.fact_ids).map((id, i) => (
                <button
                  className={styles.textButton}
                  key={id}
                  onClick={() => onEvidence(id)}
                >
                  <BookOpen size={14} /> Evidence {i + 1}
                </button>
              ))}
            </div>
          </section>
        ))}
        {!turn.result && !turn.error && (
          <p className={styles.muted}>
            The checked written response will appear here. Activity below
            reflects recorded backend events.
          </p>
        )}
        {turn.result && !claims.length && (
          <p>
            {String(
              turn.result.failure ??
                "No checked scientific claim was returned. Inspect retained evidence and activity for the precise gap.",
            )}
          </p>
        )}
        {limits.length > 0 && (
          <div className={styles.limitations}>
            <strong>What this does and does not establish</strong>
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
          <details>
            <summary>Suggested next steps</summary>
            <ul>
              {strings(answer.next_actions).map((value) => (
                <li key={value}>{value}</li>
              ))}
            </ul>
          </details>
        )}
        {(turn.events.length > 0 ||
          records(turn.result?.actions).length > 0) && (
          <details className={styles.activity}>
            <summary>
              Inspect activity · {turn.events.length} recorded events
            </summary>
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
            <span>
              {String(turn.result.model ?? "Recorded model")} · $
              {String(turn.result.cost_usd ?? "unconfirmed")} estimated
            </span>
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
      setNotice("Saved to your research workspace.");
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
        <div className={styles.limitations}>
          <strong>Scientific qualifications</strong>
          <ul>
            {strings(artifact.data.limitations).map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        </div>
      )}
      <div className={styles.sourceList}>
        <h3>Provenance</h3>
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
      </div>
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

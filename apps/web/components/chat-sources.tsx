"use client";
import { isInvestigationId } from "../lib/investigation-identifiers";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ChatCitation } from "../lib/chat-sources";
import { SourceInspector, anchorLabel } from "./workbench-common";
import styles from "./chat-sources.module.css";

export type SelectCitation = (
  citation: ChatCitation,
  trigger: HTMLButtonElement,
) => void;

export function useCitationReveal(
  onEvidence: (id: string, hasLocation: boolean) => void,
  scopeKey?: string,
  visible = true,
) {
  const [selected, setSelected] = useState<ChatCitation | null>(null);
  const [location, setLocation] = useState(0);
  const [activation, setActivation] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    trigger.current = null;
    setSelected(null);
    setLocation(0);
  }, [scopeKey, visible]);
  const select: SelectCitation = (citation, button) => {
    trigger.current = button;
    if (citation.available)
      onEvidence(citation.id, citation.anchors.length > 0);
    setLocation(0);
    setActivation((value) => value + 1);
    setSelected(citation);
  };
  function close() {
    setSelected(null);
  }
  const anchor = selected?.anchors[location];
  return {
    select,
    reveal:
      selected && anchor ? (
        <SourceInspector
          key={activation}
          anchor={anchor}
          onClose={close}
          returnFocus={trigger.current}
          contextLabel={
            (selected.calculated
              ? `[${selected.number}] ${selected.label} · Calculation inputs`
              : `[${selected.number}] ${selected.label} · ${selected.origin}`) +
            (selected.scopeNote ? ` ${selected.scopeNote}` : "")
          }
          navigation={
            selected.anchors.length > 1 ? (
              <label className={styles.locationPicker}>
                Recorded source location
                <select
                  value={location}
                  onChange={(event) => setLocation(Number(event.target.value))}
                >
                  {selected.anchors.map((item, index) => (
                    <option value={index} key={index}>
                      {index + 1}. {anchorLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            ) : undefined
          }
        />
      ) : selected ? (
        <p role="status" className={styles.notice}>
          [{selected.number}]{" "}
          {selected.available
            ? "The evidence record is selected. An exact original-source location was not recorded for this fact."
            : "This cited evidence record is unavailable in the saved reply. Its source location cannot be resolved."}
        </p>
      ) : null,
  };
}

export function CitationButton({
  citation,
  onSelect,
}: {
  citation: ChatCitation;
  onSelect: SelectCitation;
}) {
  return (
    <button
      className={styles.citation}
      aria-label={`Source ${citation.number}: ${citation.label}${citation.available ? "" : " (unavailable)"}`}
      title={citation.label}
      onClick={(event) => onSelect(citation, event.currentTarget)}
    >
      [{citation.number}]
    </button>
  );
}

export function ChatSources({
  citations,
  onSelect,
}: {
  citations: ChatCitation[];
  onSelect: SelectCitation;
}) {
  const investigations = new Map<string, Set<string>>();
  for (const citation of citations) {
    for (const anchor of citation.anchors) {
      if (!isInvestigationId(anchor.accession)) continue;
      const accessions =
        investigations.get(anchor.snapshot_id) ?? new Set<string>();
      accessions.add(anchor.accession);
      investigations.set(anchor.snapshot_id, accessions);
    }
  }
  return (
    <section className={styles.sources} aria-label="Sources for this reply">
      <h3>Sources</h3>
      {citations.length ? (
        <ol>
          {citations.map((citation) => (
            <li key={citation.id}>
              <CitationButton citation={citation} onSelect={onSelect} />
              <div>
                <button
                  className={styles.sourceTitle}
                  onClick={(event) => onSelect(citation, event.currentTarget)}
                >
                  {citation.label}
                </button>
                <p>{citation.origin}</p>
                {citation.anchors.length ? (
                  <p>
                    {anchorLabel(citation.anchors[0])}
                    {citation.anchors.length > 1
                      ? ` · ${citation.anchors.length} recorded locations`
                      : ""}
                  </p>
                ) : (
                  <p>
                    {citation.available
                      ? "Exact source location not recorded; open the evidence record."
                      : "Cited record unavailable."}
                  </p>
                )}
                {citation.scopeNote && <p>{citation.scopeNote}</p>}
                <div className={styles.nextSteps}>
                  {[
                    ...new Map(
                      citation.anchors
                        .filter((anchor) => isInvestigationId(anchor.accession))
                        .map((anchor) => [
                          `${anchor.snapshot_id}:${anchor.accession}`,
                          anchor,
                        ]),
                    ).values(),
                  ].map((anchor) => (
                    <Link
                      key={`${anchor.snapshot_id}:${anchor.accession}`}
                      href={`/app/investigations/${anchor.accession}?snapshot=${anchor.snapshot_id}`}
                    >
                      Explore investigation {anchor.accession}{" "}
                      <ArrowRight size={14} />
                    </Link>
                  ))}
                </div>
                <details>
                  <summary>Evidence identifier</summary>
                  <code>{citation.id}</code>
                </details>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>
          No source references were attached to the displayed claims.
        </p>
      )}
      {[...investigations.entries()]
        .filter(([, accessions]) => accessions.size > 1)
        .map(([snapshot, accessions]) => (
          <Link
            className={styles.compare}
            key={snapshot}
            href={`/app/compare?ids=${[...accessions].slice(0, 8).join(",")}&snapshot=${snapshot}`}
          >
            {accessions.size > 8
              ? "Compare the first 8 cited investigations"
              : "Compare cited investigations"}{" "}
            <ArrowRight size={16} />
          </Link>
        ))}
    </section>
  );
}

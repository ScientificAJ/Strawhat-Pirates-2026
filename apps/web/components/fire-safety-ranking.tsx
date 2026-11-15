"use client";

import Link from "next/link";
import { useState } from "react";
import { type Investigation, useResource } from "../lib/api";
import { type Anchor, SourceInspector } from "./workbench-common";
import styles from "./fire-safety-ranking.module.css";

export type FireSafetyArea = "prevention" | "detection" | "suppression";
type RankingItem = {
  rank: number;
  investigation: Pick<Investigation, "accession" | "acronym" | "title">;
  relevance: "direct" | "related";
  data_availability:
    "source_table" | "conditions_table" | "other_assets" | "catalog_only";
  evidence: { quote: string; anchor: Anchor };
};
type Ranking = { criteria: string[]; items: RankingItem[] };

const availability: Record<RankingItem["data_availability"], string> = {
  source_table: "Source table retained",
  conditions_table: "Conditions table retained",
  other_assets: "Other source files retained",
  catalog_only: "Catalog record",
};

export function FireSafetyRanking({
  area,
  snapshotId,
  compact = false,
  selectedIds,
}: {
  area: FireSafetyArea;
  snapshotId: string;
  compact?: boolean;
  selectedIds?: string[];
}) {
  const result = useResource<Ranking>(
    `/v1/discovery/fire-safety-ranking?area=${area}&snapshot_id=${encodeURIComponent(snapshotId)}`,
  );
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  if (result.loading) return <p role="status">Ranking investigations…</p>;
  if (result.error)
    return (
      <p>
        Rankings are unavailable.{" "}
        <button className="text-button" onClick={result.reload}>
          Try again
        </button>
      </p>
    );
  const items = (result.data?.items ?? []).filter(
    (item) =>
      !selectedIds || selectedIds.includes(item.investigation.accession),
  );
  const shown = compact ? items.slice(0, 3) : items;
  const compareIds = items
    .slice(0, 2)
    .map((item) => item.investigation.accession);
  const unranked =
    selectedIds?.filter(
      (id) => !items.some((item) => item.investigation.accession === id),
    ) ?? [];
  return (
    <div className={styles.ranking}>
      {!compact && (
        <p>
          Ordered by research focus, then by the source material available to
          inspect. Studies with the same basis share a rank.
        </p>
      )}
      {shown.length ? (
        <ol className={styles.list}>
          {shown.map((item) => (
            <li key={item.investigation.accession}>
              <span className={styles.rank} aria-label={`Rank ${item.rank}`}>
                {item.rank}
              </span>
              <div>
                <Link
                  href={`/app/investigations/${item.investigation.accession}?snapshot=${snapshotId}`}
                >
                  {item.investigation.acronym || item.investigation.title}
                </Link>
                <small>
                  {item.relevance === "direct"
                    ? "Direct focus"
                    : "Related research"}{" "}
                  · {availability[item.data_availability]}
                </small>
                {!compact && (
                  <details>
                    <summary>Why this rank?</summary>
                    <blockquote>{item.evidence.quote}</blockquote>
                    <button
                      className="text-button"
                      onClick={() => setAnchor(item.evidence.anchor)}
                    >
                      Inspect NASA source
                    </button>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p>No ranked studies match this selection.</p>
      )}
      {unranked.length > 0 && (
        <p>Not ranked for this focus: {unranked.join(", ")}.</p>
      )}
      {!selectedIds && compareIds.length === 2 && (
        <Link
          className="text-button"
          href={`/app/compare?ids=${compareIds.join(",")}&focus=${area}&snapshot=${snapshotId}`}
        >
          Compare the first two
        </Link>
      )}
      {compact && (
        <Link href={`/app/investigations?focus=${area}`}>
          See all ranked studies
        </Link>
      )}
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </div>
  );
}

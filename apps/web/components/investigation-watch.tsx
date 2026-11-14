"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useState } from "react";
import { useResource } from "../lib/api";
import {
  listDocuments,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import { ErrorState } from "./chrome";
import { RecordDetails } from "./artifact-view";

type Changes = {
  observed_changes: {
    accession: string;
    status: string;
    changed_fields?: string[];
  }[];
  limitations: string[];
  released_changes: unknown;
};
export function InvestigationWatch({
  accession,
  snapshotId,
  version,
  assetIds,
}: {
  accession: string;
  snapshotId: string;
  version: number;
  assetIds: string[];
}) {
  const [watch, setWatch] = useState<WorkspaceDocument | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void listDocuments("watch")
      .then((items) => {
        if (active) {
          setWatch(
            items.find((item) => item.data.accession === accession) ?? null,
          );
          setReady(true);
        }
      })
      .catch((reason) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [accession]);
  const enabled = !!watch && watch.data.enabled !== false;
  const feed = useResource<Changes>(
    enabled && watch.snapshot_id
      ? `/v1/snapshots/${watch.snapshot_id}/changes`
      : null,
  );
  useEffect(() => {
    const focus = () => {
      if (enabled) feed.reload();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [enabled, feed.reload]);
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      const value = await saveDocument(
        {
          id: watch?.id ?? `investigation-watch-${accession}`,
          kind: "watch",
          title: `Watch ${accession}`,
          snapshot_id: enabled ? watch!.snapshot_id : snapshotId,
          data: enabled
            ? { ...watch!.data, enabled: false }
            : {
                accession,
                investigation_version: version,
                source_ids: assetIds,
                enabled: true,
                check: "on_return",
              },
        },
        watch?.revision ?? 0,
      );
      setWatch(value);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false);
    }
  }
  const changes =
    feed.data?.observed_changes.filter(
      (change) => change.accession === accession,
    ) ?? [];
  return (
    <section
      className="investigation-watch"
      aria-label={`Evidence watch for ${accession}`}
    >
      <div className="inline-actions">
        <button
          className="button"
          disabled={!ready || busy}
          onClick={() => void toggle()}
        >
          <Bookmark size={16} />
          {enabled ? "Pause source watch" : "Watch source changes"}
        </button>
        {enabled && (
          <button className="button" onClick={feed.reload}>
            Refresh source changes
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
      {enabled && (
        <>
          <p>
            Watching {accession} · baseline snapshot{" "}
            {watch.snapshot_id?.slice(0, 12)}. Changes are checked on return or
            refresh; this frozen dossier stays pinned.
          </p>
          {feed.error ? (
            <ErrorState message={feed.error} retry={feed.reload} />
          ) : feed.loading ? (
            <p role="status">Checking public source observations…</p>
          ) : (
            feed.data && (
              <>
                <p role="status">
                  {changes.length} observed changes for {accession}.
                </p>
                <ul>
                  {changes.map((change, index) => (
                    <li key={index}>
                      {change.status.replaceAll("_", " ")}
                      {change.changed_fields?.length
                        ? `: ${change.changed_fields.join(", ")}`
                        : ""}
                    </li>
                  ))}
                </ul>
                {!changes.length && (
                  <p>
                    No changes are listed in the latest completed observation.
                    This does not establish that the upstream archive is
                    unchanged.
                  </p>
                )}
                <ul>
                  {feed.data.limitations.map((limit, index) => (
                    <li key={index}>{limit}</li>
                  ))}
                </ul>
                <RecordDetails value={feed.data} />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}

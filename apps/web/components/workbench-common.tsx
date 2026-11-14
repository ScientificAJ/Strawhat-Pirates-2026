"use client";

import { ExternalLink, X, BookOpen, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Asset, request } from "../lib/api";
import { ErrorState, LoadingRows } from "./chrome";
import s from "./workbench.module.css";

export type Anchor = {
  snapshot_id: string;
  source_sha256: string;
  kind: string;
  accession?: string | null;
  investigation_version?: number;
  source_kind?: string;
  document_id?: string;
  capture_id?: string;
  asset_id?: string | null;
  field?: string | null;
  source_row?: number | null;
  column?: number | null;
  line_end?: number | null;
  sheet?: string | null;
  cell?: string | null;
  page?: number | null;
  paragraph?: number | null;
  start?: number | null;
  end?: number | null;
  member?: string | null;
  member_sha256?: string | null;
};
export type EvidenceHit = { anchor: Anchor; text: string; field_role?: string };
export type SourceRead = {
  text: string;
  anchor: Anchor;
  source_url?: string;
  citation_url?: string;
  asset?: Asset;
  status: string;
  scientific_verification?: string;
  limitation?: string;
  limitations?: string[];
};

export function human(value: string | null | undefined) {
  return value ? value.replaceAll("_", " ") : "Not reported";
}
export function errorMessage(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "The requested operation could not complete. Your inputs remain here.";
}
export function post<T>(url: string, body: unknown, signal?: AbortSignal) {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
export function useQuery<T>(url: string, body: unknown, enabled = true) {
  const serialized = JSON.stringify(body);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(enabled);
  const [version, setVersion] = useState(0);
  const [resolvedRequest, setResolvedRequest] = useState("");
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    post<T>(url, JSON.parse(serialized), controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setResolvedRequest(serialized);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, serialized, enabled, version]);
  return {
    data,
    error,
    loading,
    resolvedRequest,
    reload: () => setVersion((value) => value + 1),
  };
}
export function anchorLabel(anchor: Anchor) {
  const source = anchor.accession ?? "NTRS " + anchor.document_id;
  const place =
    anchor.field ??
    (anchor.sheet
      ? anchor.sheet + "!" + anchor.cell
      : anchor.page
        ? "page " + anchor.page
        : anchor.paragraph
          ? "paragraph " + anchor.paragraph
          : "source line " +
            anchor.source_row +
            (anchor.column != null ? ", column " + (anchor.column + 1) : ""));
  return source + " · " + human(anchor.kind) + " · " + place;
}
export function sourceUrl(asset: Asset, snapshotId: string, mode = "raw") {
  return (
    "/v1/assets/" +
    asset.sha256 +
    "/" +
    mode +
    "?" +
    new URLSearchParams({
      snapshot_id: snapshotId,
      accession: asset.accession,
      asset_id: asset.id,
    })
  );
}
export function Scope({
  snapshotId,
  children,
}: {
  snapshotId: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={s.scope}>
      <span>
        Frozen source snapshot{" "}
        <code title={snapshotId}>{snapshotId.slice(0, 12)}</code>
      </span>
      {children}
    </div>
  );
}
export function Limitations({ values }: { values?: string[] }) {
  return values?.length ? (
    <div className={s.limitations}>
      <h3>Interpretation limits</h3>
      <ul>
        {values.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    </div>
  ) : null;
}
export function SourceInspector({
  anchor,
  onClose,
}: {
  anchor: Anchor | null;
  onClose: () => void;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeButton = useRef<HTMLButtonElement>(null);
  const result = useQuery<SourceRead>(
    "/v1/evidence/read",
    anchor,
    Boolean(anchor),
  );
  useEffect(() => {
    if (!anchor) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButton.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      previous?.focus();
    };
  }, [anchor]);
  if (!anchor) return null;
  const data = result.data;
  return (
    <aside
      className={s.inspector}
      aria-label="Exact source inspector"
      aria-busy={result.loading}
    >
      <div className={s.sectionHeading}>
        <div>
          <h2>Evidence reveal</h2>
          <p>{anchorLabel(anchor)}</p>
        </div>
        <button
          className="icon-button"
          ref={closeButton}
          aria-label="Close source inspector"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <Scope snapshotId={anchor.snapshot_id} />
      {result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : result.loading ? (
        <LoadingRows label="Resolving exact source" />
      ) : (
        data && (
          <>
            <blockquote className={s.sourceText}>
              {data.text ||
                "This source location contains an empty reported value."}
            </blockquote>
            <dl className={s.facts}>
              <div>
                <dt>Source identity</dt>
                <dd>{anchor.accession ?? anchor.document_id}</dd>
              </div>
              <div>
                <dt>Investigation version</dt>
                <dd>
                  {anchor.investigation_version ??
                    "NTRS capture " + anchor.capture_id?.slice(0, 12)}
                </dd>
              </div>
              <div>
                <dt>Original checksum</dt>
                <dd>
                  <code>{anchor.source_sha256}</code>
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{anchorLabel(anchor)}</dd>
              </div>
            </dl>
            <p className={s.help}>
              {data.scientific_verification ??
                "This is source text; resolving its location does not establish an experimental interpretation."}
            </p>
            <div className={s.actions}>
              {data.asset?.license === "CC0-1.0" && (
                <a
                  className="button"
                  href={sourceUrl(data.asset, anchor.snapshot_id)}
                >
                  <Download size={16} /> Original source
                </a>
              )}
              {data.source_url && /^https:\/\//.test(data.source_url) && (
                <a
                  className="button"
                  href={data.source_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Publisher source <ExternalLink size={16} />
                </a>
              )}
            </div>
            <Limitations
              values={[
                ...(data.limitations ?? []),
                ...(data.limitation ? [data.limitation] : []),
              ]}
            />
          </>
        )
      )}
    </aside>
  );
}
export function InspectButton({
  anchor,
  onInspect,
}: {
  anchor: Anchor;
  onInspect: (anchor: Anchor) => void;
}) {
  return (
    <button className="text-button" onClick={() => onInspect(anchor)}>
      <BookOpen size={16} /> Inspect exact source
    </button>
  );
}
export function CompiledQuery({ value }: { value: unknown }) {
  return (
    <details className={s.compiled}>
      <summary>Inspect the typed query and source scope</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className={s.empty}>{children}</div>;
}

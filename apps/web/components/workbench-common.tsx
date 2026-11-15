"use client";

import { ExternalLink, X, BookOpen, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Asset, request } from "../lib/api";
import { isPublishedTranscription } from "../lib/source-description";
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
  frame?: number | null;
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
  content_kind?: string;
  member?: string;
  source_origin?: string;
  upstream_sources?: { label: string; source_url: string; anchor?: Anchor }[];
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
  const source =
    anchor.accession ??
    (anchor.document_id ? "NTRS " + anchor.document_id : "Recorded source");
  let place = "Location not recorded";
  if (anchor.field) place = anchor.field;
  else if (anchor.sheet && anchor.cell)
    place = anchor.sheet + "!" + anchor.cell;
  else if (anchor.page != null) place = "page " + anchor.page;
  else if (anchor.paragraph != null) place = "paragraph " + anchor.paragraph;
  else if (anchor.member) place = "embedded figure " + anchor.member;
  else if (anchor.frame != null)
    place = "frame " + anchor.frame + " (zero-based)";
  else if (anchor.source_row != null) {
    place = "source line " + anchor.source_row;
    if (anchor.line_end != null && anchor.line_end !== anchor.source_row)
      place += "–" + anchor.line_end;
    if (anchor.column != null) place += ", column " + (anchor.column + 1);
  }
  if (anchor.start != null && anchor.end != null)
    place += ` · characters ${anchor.start}–${anchor.end} (zero-based, end exclusive)`;
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
      {children}
      <details className="source-version-details">
        <summary>Source version</summary>
        <p>
          This view uses a preserved copy of the NASA sources so its references
          can be reproduced.
        </p>
        <code>{snapshotId}</code>
      </details>
    </div>
  );
}
export function Limitations({ values }: { values?: string[] }) {
  return values?.length ? (
    <details className={s.limitations}>
      <summary>Source and method notes</summary>
      <ul>
        {values.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    </details>
  ) : null;
}
export function SourceInspector({
  anchor,
  onClose,
  navigation,
  contextLabel,
  returnFocus,
}: {
  anchor: Anchor | null;
  onClose: () => void;
  navigation?: React.ReactNode;
  contextLabel?: string;
  returnFocus?: HTMLElement | null;
}) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  const result = useQuery<SourceRead>(
    "/v1/evidence/read",
    anchor,
    Boolean(anchor),
  );
  const open = Boolean(anchor);
  useEffect(() => {
    if (!open) return;
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
      const target =
        returnFocusRef.current === undefined
          ? previous
          : returnFocusRef.current;
      if (target?.isConnected) target.focus();
    };
  }, [open]);
  if (!anchor) return null;
  const data =
    result.resolvedRequest === JSON.stringify(anchor) ? result.data : null;
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
      {contextLabel && <p className={s.help}>{contextLabel}</p>}
      {navigation}
      {result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : result.loading ? (
        <LoadingRows label="Resolving exact source" />
      ) : (
        data && (
          <>
            {data.content_kind === "source_image" && data.asset ? (
              <figure>
                {/* Exact retained bytes are verified by the source reader before display. */}
                <img
                  src={
                    data.member
                      ? `${sourceUrl(data.asset, anchor.snapshot_id, "embedded-figure")}&${new URLSearchParams({ member: data.member })}`
                      : sourceUrl(
                          data.asset,
                          anchor.snapshot_id,
                          "media/preview",
                        )
                  }
                  alt={
                    data.member
                      ? `Embedded figure: ${data.member}`
                      : `NASA image: ${data.asset.file_name}`
                  }
                  style={{ display: "block", maxWidth: "100%", height: "auto" }}
                />
                <figcaption>{anchorLabel(anchor)}</figcaption>
              </figure>
            ) : (
              <blockquote className={s.sourceText}>
                {data.text ||
                  "This source location contains an empty reported value."}
              </blockquote>
            )}
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
                <dt>Retained source checksum</dt>
                <dd>
                  <code>{anchor.source_sha256}</code>
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{anchorLabel(anchor)}</dd>
              </div>
            </dl>
            {(data.source_origin === "published_table_transcription" ||
              (data.asset && isPublishedTranscription(data.asset))) && (
              <p className={s.help}>
                {data.source_origin === "planned_conditions"
                  ? "Planned test conditions"
                  : "Published table transcription"}
              </p>
            )}
            <div className={s.actions}>
              {data.asset?.license === "CC0-1.0" && (
                <a
                  className="button"
                  href={sourceUrl(data.asset, anchor.snapshot_id)}
                >
                  <Download size={16} />{" "}
                  {isPublishedTranscription(data.asset)
                    ? "Transcribed table"
                    : "Original source"}
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
            {Boolean(data.upstream_sources?.length) && (
              <div className={s.stack}>
                <h3>Original NASA sources</h3>
                {data.upstream_sources
                  ?.filter((source) => /^https:\/\//.test(source.source_url))
                  .map((source, index) => (
                    <a
                      key={source.source_url + index}
                      href={source.source_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {source.label} <ExternalLink size={14} />
                    </a>
                  ))}
              </div>
            )}
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

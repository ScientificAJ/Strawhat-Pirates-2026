"use client";

import {
  ArrowDownToLine,
  Bell,
  Check,
  Paperclip,
  Plus,
  Printer,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { downloadJson } from "../lib/api";
import type { ResearchCase } from "../lib/workspace-storage";
import {
  listDocuments,
  readDocument,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import {
  message,
  object,
  records,
  strings,
  studioRequest,
  type JsonRecord,
} from "../lib/studio-session";
import { ArtifactView } from "./artifact-view";
import styles from "./case-research-tools.module.css";

const sections = [
  ["scenario", "Scenario and assumptions"],
  ["evidence", "Evidence"],
  ["analysis", "Analysis"],
  ["findings", "Findings"],
  ["limitations", "Limitations and applicability"],
  ["checks", "Source checks"],
  ["reproducibility", "Reproducibility"],
] as const;
type SectionKey = (typeof sections)[number][0];
type Attachment = {
  id: string;
  revision: number;
  title: string;
  kind: string;
  snapshot_id: string | null;
  data: JsonRecord;
  private_data: boolean;
};
type Annotation = {
  id: string;
  target: string;
  target_revision: number;
  type: "note" | "correction";
  original: string;
  proposed: string;
  reason: string;
  source: string;
  status: "unresolved" | "personal_proposal";
  created_at: string;
};
type CaseSnapshot = Pick<
  ResearchCase,
  | "title"
  | "question"
  | "notes"
  | "investigation_ids"
  | "snapshot_id"
  | "source_anchors"
  | "revision"
>;
type CasePayload = {
  sections: Record<SectionKey, string>;
  attachments: Attachment[];
  annotations: Annotation[];
  stale_sections: SectionKey[];
  watch: boolean;
  restored_from?: number;
};
type FrozenCase = {
  case_snapshot: CaseSnapshot;
  payload: CasePayload;
  frozen_at: string;
  sha256: string;
};
type CaseData = CasePayload & { frozen: FrozenCase[] };
export type CaseResearchToolsHandle = {
  freeze: (value: ResearchCase) => Promise<void>;
  openExport: () => void;
};

function qualifications(value: unknown, depth = 0): string[] {
  if (depth > 12 || value === null || typeof value !== "object") return [];
  if (Array.isArray(value))
    return value.flatMap((item) => qualifications(item, depth + 1));
  const record = object(value);
  return Array.from(
    new Set([
      ...strings(record.limitations),
      ...strings(record.assumptions),
      ...Object.entries(record)
        .filter(([key]) => !["limitations", "assumptions"].includes(key))
        .flatMap(([, item]) => qualifications(item, depth + 1)),
    ]),
  );
}
function validPayload(value: unknown): boolean {
  const record = object(value);
  return (
    sections.every(
      ([key]) => typeof object(record.sections)[key] === "string",
    ) &&
    Array.isArray(record.attachments) &&
    records(record.attachments).every(
      (item) =>
        typeof item.id === "string" &&
        typeof item.revision === "number" &&
        typeof item.title === "string" &&
        typeof item.data === "object",
    ) &&
    Array.isArray(record.annotations) &&
    records(record.annotations).every((item) =>
      ["target", "reason", "original", "proposed", "source"].every(
        (key) => typeof item[key] === "string",
      ),
    ) &&
    Array.isArray(record.stale_sections)
  );
}

function emptyData(): CaseData {
  return {
    sections: {
      scenario: "",
      evidence: "",
      analysis: "",
      findings: "",
      limitations: "",
      checks: "",
      reproducibility: "",
    },
    attachments: [],
    annotations: [],
    stale_sections: [],
    watch: false,
    frozen: [],
  };
}
function caseSnapshot(value: ResearchCase): CaseSnapshot {
  return {
    title: value.title,
    question: value.question,
    notes: value.notes,
    investigation_ids: value.investigation_ids,
    snapshot_id: value.snapshot_id,
    source_anchors: value.source_anchors ?? [],
    revision: value.revision,
  };
}
async function digest(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function escaped(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
function htmlReport(report: JsonRecord): string {
  const values = object(report.sections);
  const stale = strings(object(report.reproducibility).stale_sections);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escaped(report.title)}</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#151922;max-width:850px;margin:48px auto;padding:24px}h1{font-size:30px}h2{margin-top:32px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace;background:#f4f6f8;padding:16px}section>p{white-space:pre-wrap}small{color:#586273}@media print{body{margin:0;padding:0;max-width:none}section{break-inside:avoid}pre{font-size:10px}}</style></head><body><h1>${escaped(report.title)}</h1><p>${escaped(report.question)}</p><small>Frozen case revision ${escaped(report.case_revision)} · Source snapshot ${escaped(report.snapshot_id)} · SHA-256 ${escaped(report.frozen_sha256)}</small>${stale.length ? `<p><strong>Review required:</strong> ${escaped(stale.join(", "))} remain marked for review after changed assumptions or evidence. Retained findings have not been revalidated by this export.</p>` : ""}${Object.entries(
    values,
  )
    .map(
      ([key, value]) =>
        `<section><h2>${escaped(sections.find((item) => item[0] === key)?.[1] ?? key)}</h2><p>${escaped(value)}</p></section>`,
    )
    .join(
      "",
    )}<section><h2>Sources and selected artifact references</h2><pre>${escaped(JSON.stringify({ source_anchors: report.source_anchors, artifacts: report.artifacts }, null, 2))}</pre></section>${report.private_notes ? `<section><h2>Selected personal notes</h2><pre>${escaped(report.private_notes)}</pre></section>` : ""}${report.annotations ? `<section><h2>Selected personal annotations</h2><pre>${escaped(JSON.stringify(report.annotations, null, 2))}</pre></section>` : ""}<section><h2>Provenance and limits</h2><p>Researcher-authored case. Original source values, personal corrections, calculations and model interpretations retain their recorded origins. This export is an independent copy; it does not establish measurement validity or experimental independence.</p><pre>${escaped(JSON.stringify(report.reproducibility, null, 2))}</pre></section></body></html>`;
}
function saveHtml(html: string) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "nova-ember-research-report.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportParagraphs(value: string): string[] {
  // The API limits individual qualification strings, while the complete
  // original section also remains verbatim in the frozen report payload.
  return value.match(/[\s\S]{1,2000}/g) ?? [];
}

export const CaseResearchTools = forwardRef<
  CaseResearchToolsHandle,
  {
    value: ResearchCase;
    onDraftChange: () => void;
    onRestore: (value: CaseSnapshot) => void;
    onReady?: (ready: boolean) => void;
  }
>(function CaseResearchTools(
  { value, onDraftChange, onRestore, onReady },
  ref,
) {
  const [data, setData] = useState<CaseData>(emptyData);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [readProblem, setReadProblem] = useState(false);
  const [attachmentId, setAttachmentId] = useState("");
  const [attachmentRevision, setAttachmentRevision] = useState(0);
  const [annotationType, setAnnotationType] =
    useState<Annotation["type"]>("note");
  const [target, setTarget] = useState("section:findings");
  const [original, setOriginal] = useState("");
  const [proposed, setProposed] = useState("");
  const [reason, setReason] = useState("");
  const [source, setSource] = useState("");
  const [watchResult, setWatchResult] = useState<JsonRecord | null>(null);
  const [preview, setPreview] = useState(false);
  const [exportRevision, setExportRevision] = useState(0);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
  const [includeData, setIncludeData] = useState<string[]>([]);
  const [includedSections, setIncludedSections] = useState<SectionKey[]>(
    sections.map((item) => item[0]),
  );
  const [bundle, setBundle] = useState<JsonRecord | null>(null);
  const stored = useRef<WorkspaceDocument<CaseData> | null>(null);
  const current = useRef(data);
  current.current = data;
  const queue = useRef(Promise.resolve());
  const lastPersisted = useRef("");
  const callbacks = useRef({ onReady, onDraftChange });
  callbacks.current = { onReady, onDraftChange };
  const documentId = `case-research-${value.id}`;
  async function persist(next: CaseData) {
    const serialized = JSON.stringify(next);
    if (serialized === lastPersisted.current) return queue.current;
    queue.current = queue.current
      .catch(() => undefined)
      .then(async () => {
        stored.current = await saveDocument<CaseData>(
          {
            id: documentId,
            kind: "case_research",
            title: value.title,
            snapshot_id: value.snapshot_id,
            data: next,
          },
          stored.current?.revision ?? 0,
        );
        lastPersisted.current = serialized;
      });
    await queue.current;
  }
  useImperativeHandle(ref, () => ({
    openExport: () => {
      setPreview(true);
      requestAnimationFrame(() =>
        document
          .getElementById("case-export-preview")
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    freeze: async (next) => {
      if (!ready || readProblem)
        throw new Error(
          "Research sections are still opening. Keep the draft and try saving again.",
        );
      const { frozen: history, ...payload } = current.current;
      const frozen = {
        case_snapshot: caseSnapshot(next),
        payload,
        frozen_at: new Date().toISOString(),
        sha256: await digest({ case_snapshot: caseSnapshot(next), payload }),
      };
      const updated = { ...current.current, frozen: [...history, frozen] };
      await persist(updated);
      setData(updated);
      setNotice(
        `Structured research frozen with case revision ${next.revision}.`,
      );
    },
  }));
  useEffect(() => {
    let live = true;
    setReady(false);
    callbacks.current.onReady?.(false);
    Promise.all([readDocument<CaseData>(documentId), listDocuments()])
      .then(([record, list]) => {
        if (!live) return;
        stored.current = record;
        if (
          record &&
          (!validPayload(record.data) ||
            !Array.isArray(record.data.frozen) ||
            !record.data.frozen.every(
              (item) =>
                validPayload(item.payload) &&
                typeof item.case_snapshot?.revision === "number",
            ))
        ) {
          setReadProblem(true);
          setError(
            "This stored research record has an unsupported structure. Its original is retained; download it and restore a valid workspace backup before replacing it.",
          );
          setReady(true);
          callbacks.current.onReady?.(false);
          return;
        }
        lastPersisted.current = record ? JSON.stringify(record.data) : "";
        setData(record?.data ?? emptyData());
        setDocuments(
          list.filter(
            (item) =>
              ![
                "remote_job",
                "studio_session",
                "studio_intent",
                "research_context",
                "case_research",
                "settings",
              ].includes(item.kind),
          ),
        );
        setReady(true);
        callbacks.current.onReady?.(true);
      })
      .catch((failure) => {
        if (live) {
          setError(message(failure));
          setReady(true);
          callbacks.current.onReady?.(true);
        }
      });
    return () => {
      live = false;
    };
  }, [documentId]);
  useEffect(() => {
    if (!ready || readProblem) return;
    const timer = setTimeout(
      () => void persist(data).catch((failure) => setError(message(failure))),
      1000,
    );
    return () => clearTimeout(timer);
  }, [data, ready, readProblem]);
  async function watch() {
    if (!value.snapshot_id) {
      setError("Pin a source snapshot before checking evidence changes.");
      return;
    }
    try {
      setWatchResult(
        await studioRequest(`/v1/snapshots/${value.snapshot_id}/changes`),
      );
    } catch (failure) {
      setError(message(failure));
    }
  }
  useEffect(() => {
    if (ready && data.watch && value.snapshot_id) void watch();
  }, [ready, value.id, value.snapshot_id]);
  function change(next: Partial<CaseData>, stale = false) {
    setData((previous) => ({
      ...previous,
      ...next,
      stale_sections: stale
        ? Array.from(
            new Set([...previous.stale_sections, "analysis", "findings"]),
          )
        : (next.stale_sections ?? previous.stale_sections),
    }));
    callbacks.current.onDraftChange();
    setNotice("");
  }
  async function attach() {
    const doc = documents.find((item) => item.id === attachmentId);
    if (!doc) return;
    const revision =
      doc.revisions.find((item) => item.revision === attachmentRevision) ??
      doc.revisions.at(-1);
    if (!revision) return;
    const attachment: Attachment = {
      id: doc.id,
      revision: revision.revision,
      title: revision.title,
      kind: doc.kind,
      snapshot_id: revision.snapshot_id,
      data: revision.data,
      private_data: true,
    };
    if (
      data.attachments.some(
        (item) =>
          item.id === attachment.id && item.revision === attachment.revision,
      )
    ) {
      setNotice("That exact revision is already attached.");
      return;
    }
    change({ attachments: [...data.attachments, attachment] }, true);
    setNotice(
      "Attached a frozen local copy. Later edits to the source document do not replace it.",
    );
  }
  function annotate() {
    if (
      !reason.trim() ||
      (annotationType === "correction" &&
        (!original.trim() || !proposed.trim() || !source.trim()))
    ) {
      setError(
        "A correction requires the original, proposed value, reason and supporting source. A note requires its text.",
      );
      return;
    }
    change(
      {
        annotations: [
          ...data.annotations,
          {
            id: crypto.randomUUID(),
            target,
            target_revision: value.revision,
            type: annotationType,
            original,
            proposed,
            reason,
            source,
            status:
              annotationType === "correction"
                ? "personal_proposal"
                : "unresolved",
            created_at: new Date().toISOString(),
          },
        ],
      },
      annotationType === "correction",
    );
    setOriginal("");
    setProposed("");
    setReason("");
    setSource("");
    setError("");
  }
  const frozen =
    data.frozen.find(
      (item) => item.case_snapshot.revision === exportRevision,
    ) ?? data.frozen.at(-1);
  const selectedDocument = documents.find((item) => item.id === attachmentId);
  const payload = frozen?.payload;
  const report: JsonRecord | null = frozen
    ? {
        format: "nova-ember-research-report",
        version: 1,
        title: frozen.case_snapshot.title,
        question: frozen.case_snapshot.question,
        case_id: value.id,
        case_revision: frozen.case_snapshot.revision,
        snapshot_id: frozen.case_snapshot.snapshot_id,
        frozen_sha256: frozen.sha256,
        sections: Object.fromEntries(
          sections
            .filter(
              ([key]) =>
                includedSections.includes(key) || key === "limitations",
            )
            .map(([key]) => [key, payload?.sections[key] ?? ""]),
        ),
        source_anchors: frozen.case_snapshot.source_anchors ?? [],
        artifacts: payload?.attachments.map((item) => ({
          id: item.id,
          revision: item.revision,
          title: item.title,
          kind: item.kind,
          snapshot_id: item.snapshot_id,
          limitations: qualifications(item.data),
          ...(includeData.includes(`${item.id}:${item.revision}`)
            ? { data: item.data, private_data_explicitly_selected: true }
            : { inclusion: "reference_only" }),
        })),
        ...(includeNotes ? { private_notes: frozen.case_snapshot.notes } : {}),
        ...(includeAnnotations ? { annotations: payload?.annotations } : {}),
        reproducibility: {
          frozen_at: frozen.frozen_at,
          exact_sources: frozen.case_snapshot.source_anchors,
          document_revisions: payload?.attachments.map((item) => ({
            id: item.id,
            revision: item.revision,
            snapshot_id: item.snapshot_id,
          })),
          source_values_rescaled: false,
          environment:
            payload?.sections.reproducibility ||
            "Environment/method versions remain as recorded in each selected artifact; missing information is unresolved.",
          stale_sections: payload?.stale_sections,
          interpretation_status: "personal_research_not_independent_validation",
        },
      }
    : null;
  async function exportReady() {
    if (!frozen || !report) {
      setError(
        "Save a case revision before exporting a frozen research report.",
      );
      return false;
    }
    if (
      (await digest({
        case_snapshot: frozen.case_snapshot,
        payload: frozen.payload,
      })) !== frozen.sha256
    ) {
      setError(
        "This frozen revision no longer matches its recorded content hash. Preserve the stored record and restore a valid backup before exporting it as reproducible.",
      );
      return false;
    }
    if (
      frozen.payload.sections.findings.trim() &&
      !frozen.payload.sections.limitations.trim()
    ) {
      setError(
        "Add the limitations and applicability of these findings before exporting. A polished conclusion cannot omit its qualifications.",
      );
      return false;
    }
    return true;
  }
  async function print() {
    if (!(await exportReady()) || !report) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    frame.style.position = "fixed";
    frame.style.width = "1px";
    frame.style.height = "1px";
    frame.style.opacity = "0";
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 1000);
    };
    frame.srcdoc = htmlReport(report);
    document.body.appendChild(frame);
  }
  async function reproducibilityBundle() {
    if (!(await exportReady()) || !frozen) return;
    if (!frozen.case_snapshot.snapshot_id) {
      setError(
        "Pin a source snapshot before building a server reproducibility bundle. Local JSON and HTML reports remain available.",
      );
      return;
    }
    try {
      const selected = frozen.payload.attachments.filter((item) =>
        includeData.includes(`${item.id}:${item.revision}`),
      );
      if (
        selected.some(
          (item) => item.snapshot_id !== frozen.case_snapshot.snapshot_id,
        )
      ) {
        throw new Error(
          "This bundle requires one scientific snapshot. Export the exact mixed-snapshot artifacts with the local JSON/HTML report, or select only artifacts from this case's pinned snapshot.",
        );
      }
      const queries = selected
        .map((item) => item.data.query)
        .filter((item) => item && typeof item === "object");
      const charts = selected
        .map((item) => item.data.chart_spec)
        .filter((item) => item && typeof item === "object");
      const created = await studioRequest("/v1/exports", {
        selection: {
          snapshot_id: frozen.case_snapshot.snapshot_id,
          case_id: value.id,
          revision: frozen.case_snapshot.revision,
          question: frozen.case_snapshot.question || frozen.case_snapshot.title,
          notes: [
            includeNotes ? frozen.case_snapshot.notes : "",
            includeAnnotations
              ? `Selected personal annotations (not canonical corrections):\n${JSON.stringify(frozen.payload.annotations, null, 2)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          queries,
          charts,
          assumptions: exportParagraphs(frozen.payload.sections.scenario),
          limitations: exportParagraphs(
            frozen.payload.sections.limitations ||
              "Personal research case; source qualification remains unresolved.",
          ),
          artifacts: [
            {
              artifact_id: `case-report-${value.id}-revision-${frozen.case_snapshot.revision}`,
              kind: "analysis",
              snapshot_id: frozen.case_snapshot.snapshot_id,
              scientific_origin: "unknown",
              payload: {
                ...report,
                artifacts: (payload?.attachments ?? []).map((item) => ({
                  id: item.id,
                  revision: item.revision,
                  title: item.title,
                  snapshot_id: item.snapshot_id,
                  limitations: qualifications(item.data),
                  inclusion: includeData.includes(`${item.id}:${item.revision}`)
                    ? "separate_frozen_artifact"
                    : "reference_only",
                })),
              },
              provenance: {
                origin: "personal_research_report",
                frozen_sha256: frozen.sha256,
                source_anchors: frozen.case_snapshot.source_anchors,
              },
              source_sha256: [],
              limitations: exportParagraphs(
                frozen.payload.sections.limitations ||
                  "Scientific applicability remains unresolved.",
              ),
            },
            ...selected.map((item) => ({
              artifact_id: item.id,
              kind: "analysis",
              snapshot_id: item.snapshot_id,
              scientific_origin: "unknown",
              payload: item.data,
              provenance: {
                local_document_id: item.id,
                revision: item.revision,
                origin: "selected_browser_artifact",
              },
              source_sha256: [],
              limitations: strings(object(item.data.result).limitations).length
                ? strings(object(item.data.result).limitations).flatMap(
                    exportParagraphs,
                  )
                : [
                    "Retain the original artifact's source, method and applicability qualifications.",
                  ],
            })),
          ],
          include_original_bytes: false,
          format: "bundle",
        },
        confirmed_selected_private_data: true,
      });
      setBundle(created);
      setNotice(
        "Reproducibility bundle queued. Original-file redistribution is disabled; frozen references and selected artifacts remain included.",
      );
    } catch (failure) {
      setError(message(failure));
    }
  }
  useEffect(() => {
    if (
      !bundle?.id ||
      ["succeeded", "failed", "canceled"].includes(String(bundle.status))
    )
      return;
    const controller = new AbortController();
    const timer = setInterval(() => {
      void studioRequest(`/v1/workflows/${bundle.id}`, undefined, {
        signal: controller.signal,
      })
        .then(setBundle)
        .catch((failure) => {
          if (!controller.signal.aborted) setError(message(failure));
        });
    }, 1200);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [bundle?.id, bundle?.status]);
  if (!ready)
    return (
      <section className={styles.tools} aria-busy="true">
        <h2>Structured research case</h2>
        <p>Opening frozen documents and personal annotations…</p>
      </section>
    );
  if (readProblem)
    return (
      <section className={styles.tools}>
        <h2>Stored research needs recovery</h2>
        <p role="alert" className={styles.error}>
          {error}
        </p>
        <button
          className="button"
          type="button"
          onClick={() =>
            downloadJson(
              "nova-ember-stored-research-recovery.json",
              stored.current,
            )
          }
        >
          Download the original stored record
        </button>
      </section>
    );
  return (
    <section className={styles.tools} aria-label="Structured research case">
      <header>
        <div>
          <h2>Structured research case</h2>
          <p>
            Research sections, exact artifact revisions and personal source
            checks. The public corpus is unchanged.
          </p>
        </div>
        <button
          className="button"
          type="button"
          onClick={() => setPreview(!preview)}
        >
          <ArrowDownToLine size={16} /> Export preview
        </button>
      </header>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <nav aria-label="Case outline" className={styles.outline}>
        <a href="#case-question">Question</a>
        {sections.map(([key, title]) => (
          <a key={key} href={`#case-${key}`}>
            {title}
          </a>
        ))}
        <a href="#case-annotations">Notes and corrections</a>
      </nav>
      <div className={styles.document}>
        {sections.map(([key, title]) => (
          <section id={`case-${key}`} key={key}>
            <label htmlFor={`case-${value.id}-${key}-input`}>{title}</label>
            {data.stale_sections.includes(key) && (
              <span
                id={`case-${value.id}-${key}-stale`}
                className={styles.stale}
              >
                Revisit after changed assumptions or evidence
              </span>
            )}
            <textarea
              id={`case-${value.id}-${key}-input`}
              aria-describedby={
                data.stale_sections.includes(key)
                  ? `case-${value.id}-${key}-stale`
                  : undefined
              }
              value={data.sections[key]}
              maxLength={20000}
              rows={key === "findings" || key === "analysis" ? 5 : 3}
              placeholder={
                key === "limitations"
                  ? "State missing evidence, unsupported conditions, uncertainty meanings and applicability limits."
                  : key === "reproducibility"
                    ? "Record methods/models, code/environment versions, source hashes, transformations and rerun instructions."
                    : `Record the case's ${title.toLowerCase()}.`
              }
              onChange={(event) =>
                change(
                  {
                    sections: { ...data.sections, [key]: event.target.value },
                  },
                  key === "scenario" || key === "evidence",
                )
              }
            />
            {data.stale_sections.includes(key) && (
              <button
                className={styles.textButton}
                type="button"
                onClick={() =>
                  change({
                    stale_sections: data.stale_sections.filter(
                      (item) => item !== key,
                    ),
                  })
                }
              >
                Record that this section was revisited
              </button>
            )}
          </section>
        ))}
      </div>
      <section className={styles.attach}>
        <h3>Attach a frozen workspace revision</h3>
        <p>
          Select only the documents this case needs. Their current values,
          source versions and scientific qualifications are copied into the
          case.
        </p>
        <div className={styles.row}>
          <label>
            Workspace document
            <select
              value={attachmentId}
              onChange={(event) => {
                setAttachmentId(event.target.value);
                setAttachmentRevision(0);
              }}
            >
              <option value="">Choose a document</option>
              {documents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.kind}
                </option>
              ))}
            </select>
          </label>
          <label>
            Revision
            <select
              value={attachmentRevision}
              onChange={(event) =>
                setAttachmentRevision(Number(event.target.value))
              }
            >
              <option value={0}>Latest saved revision</option>
              {selectedDocument?.revisions.map((item) => (
                <option value={item.revision} key={item.revision}>
                  Revision {item.revision} ·{" "}
                  {new Date(item.saved_at).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            type="button"
            disabled={!attachmentId}
            onClick={attach}
          >
            <Paperclip size={15} /> Attach revision
          </button>
        </div>
        {!documents.length && (
          <p>
            Save an analysis, scenario, dashboard or source selection first. It
            will then be available here.
          </p>
        )}
        {data.attachments.map((item) => (
          <article
            className={styles.attached}
            key={`${item.id}:${item.revision}`}
          >
            <div>
              <strong>{item.title}</strong>
              <span>
                Revision {item.revision} · {item.kind}
                {item.snapshot_id !== value.snapshot_id
                  ? " · different source snapshot"
                  : ""}
              </span>
              <button
                className="icon-button"
                type="button"
                aria-label={`Remove ${item.title}`}
                onClick={() =>
                  change(
                    {
                      attachments: data.attachments.filter(
                        (entry) => entry !== item,
                      ),
                    },
                    true,
                  )
                }
              >
                <X size={15} />
              </button>
            </div>
            <details>
              <summary>Inspect frozen content and source identity</summary>
              <p>
                Source snapshot <code>{item.snapshot_id ?? "Unspecified"}</code>
              </p>
              <ArtifactView value={item.data} />
              <pre>{JSON.stringify(item.data, null, 2)}</pre>
            </details>
          </article>
        ))}
      </section>
      <section id="case-annotations">
        <h3>Personal notes and corrections</h3>
        <p>
          Every note keeps its exact target and case revision. Corrections are
          proposals, with the original value preserved.
        </p>
        <div className={styles.row}>
          <label>
            Annotation type
            <select
              value={annotationType}
              onChange={(event) =>
                setAnnotationType(event.target.value as Annotation["type"])
              }
            >
              <option value="note">Personal note</option>
              <option value="correction">Proposed correction</option>
            </select>
          </label>
          <label>
            Exact target
            <select
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            >
              {sections.map(([key, title]) => (
                <option key={key} value={`section:${key}`}>
                  {title}
                </option>
              ))}
              {(value.source_anchors ?? []).map((anchor, index) => (
                <option key={index} value={`source:${JSON.stringify(anchor)}`}>
                  {anchor.accession} · row {anchor.source_row} ·{" "}
                  {anchor.source_sha256.slice(0, 8)}
                </option>
              ))}
              {data.attachments.map((item) => (
                <option
                  key={`${item.id}:${item.revision}`}
                  value={`artifact:${item.id}:revision:${item.revision}`}
                >
                  {item.title} · revision {item.revision}
                </option>
              ))}
            </select>
          </label>
        </div>
        {annotationType === "correction" && (
          <div className={styles.row}>
            <label>
              Original value and unit
              <input
                value={original}
                maxLength={2000}
                onChange={(event) => setOriginal(event.target.value)}
              />
            </label>
            <label>
              Proposed value and unit
              <input
                value={proposed}
                maxLength={2000}
                onChange={(event) => setProposed(event.target.value)}
              />
            </label>
          </div>
        )}
        <label>
          {annotationType === "correction"
            ? "Reason for proposed correction"
            : "Personal note"}
          <textarea
            value={reason}
            maxLength={6000}
            rows={3}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label>
          Supporting source or exact evidence locator
          <input
            value={source}
            maxLength={2000}
            onChange={(event) => setSource(event.target.value)}
          />
        </label>
        <button className="button" type="button" onClick={annotate}>
          <Plus size={15} /> Add{" "}
          {annotationType === "correction" ? "personal correction" : "note"}
        </button>
        {data.annotations.map((item) => (
          <article className={styles.annotation} key={item.id}>
            <strong>
              {item.type === "correction"
                ? "Personal correction proposal"
                : "Unresolved personal note"}{" "}
              · case revision {item.target_revision}
            </strong>
            <p className={styles.target}>Target: {item.target}</p>
            {item.type === "correction" && (
              <dl>
                <dt>Original</dt>
                <dd>{item.original}</dd>
                <dt>Proposed</dt>
                <dd>{item.proposed}</dd>
              </dl>
            )}
            <p>{item.reason}</p>
            <p>Source: {item.source || "Not supplied; unresolved."}</p>
            <small>{new Date(item.created_at).toLocaleString()}</small>
            <button
              className={styles.textButton}
              type="button"
              onClick={() =>
                change({
                  annotations: data.annotations.filter(
                    (entry) => entry.id !== item.id,
                  ),
                })
              }
            >
              Remove from current draft
            </button>
          </article>
        ))}
      </section>
      <section className={styles.watch}>
        <h3>Watch this case&apos;s evidence</h3>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={data.watch}
            onChange={(event) => {
              change({ watch: event.target.checked });
              if (event.target.checked) void watch();
            }}
          />
          <Bell size={15} /> Check pinned source dependencies when this case is
          opened on this browser.
        </label>
        <button className="button" type="button" onClick={watch}>
          Check source changes now
        </button>
        {watchResult && (
          <div>
            <p>
              {records(watchResult.observed_changes).length} observed source
              changes. New observations do not automatically replace this
              case&apos;s scientific snapshot.
            </p>
            <details>
              <summary>Inspect released and observed source changes</summary>
              <pre>{JSON.stringify(watchResult, null, 2)}</pre>
            </details>
            <button
              className="button"
              type="button"
              onClick={() => {
                change({
                  stale_sections: ["evidence", "analysis", "findings"],
                });
                setNotice(
                  "A new local evidence-review draft is ready. Its frozen source snapshot is preserved until explicitly changed.",
                );
              }}
            >
              Prepare a local evidence-review revision
            </button>
          </div>
        )}
      </section>
      <section>
        <h3>Frozen research revisions</h3>
        {!data.frozen.length && (
          <p>
            Use Save revision above to freeze the question, research sections,
            exact artifact revisions and notes together.
          </p>
        )}
        {data.frozen
          .slice()
          .reverse()
          .map((item) => (
            <article className={styles.frozen} key={item.sha256}>
              <strong>Case revision {item.case_snapshot.revision}</strong>
              <span>{new Date(item.frozen_at).toLocaleString()}</span>
              <code title={item.sha256}>{item.sha256.slice(0, 16)}</code>
              <button
                className="button button-small"
                type="button"
                onClick={() => {
                  const currentHistory = data.frozen;
                  change({
                    ...item.payload,
                    frozen: currentHistory,
                    restored_from: item.case_snapshot.revision,
                    stale_sections: ["analysis", "findings"],
                  });
                  onRestore(item.case_snapshot);
                  setNotice(
                    `Revision ${item.case_snapshot.revision} copied into a new draft. Existing frozen revisions are unchanged.`,
                  );
                }}
              >
                <RotateCcw size={14} /> Restore as new draft
              </button>
            </article>
          ))}
      </section>
      {preview && (
        <section
          id="case-export-preview"
          className={styles.preview}
          aria-label="Frozen research export preview"
        >
          <h3>Export preview</h3>
          {frozen && frozen.payload.stale_sections.length > 0 && (
            <p className={styles.stale}>
              Review required: {frozen.payload.stale_sections.join(", ")}. This
              frozen revision retains its marked findings; exporting does not
              revalidate them.
            </p>
          )}
          {!frozen ? (
            <div>
              <p>
                Save a case revision first. Exports use a frozen revision, not a
                moving draft.
              </p>
              <button
                className="button"
                type="button"
                onClick={() =>
                  downloadJson("nova-ember-private-case-draft.json", {
                    format: "nova-ember-private-case-draft",
                    case: value,
                    structured_draft: data,
                  })
                }
              >
                Download complete private draft backup
              </button>
              <p>
                This recovery copy includes personal notes and draft
                attachments. Keep it private.
              </p>
            </div>
          ) : (
            <>
              <label>
                Frozen case revision
                <select
                  value={exportRevision}
                  onChange={(event) =>
                    setExportRevision(Number(event.target.value))
                  }
                >
                  <option value={0}>Latest frozen revision</option>
                  {data.frozen.map((item) => (
                    <option
                      key={item.sha256}
                      value={item.case_snapshot.revision}
                    >
                      Case revision {item.case_snapshot.revision}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                Exporting <strong>{frozen.case_snapshot.title}</strong>,
                revision {frozen.case_snapshot.revision}. Limitations and
                applicability remain included.
              </p>
              <fieldset>
                <legend>Report sections</legend>
                {sections.map(([key, title]) => (
                  <label key={key} className={styles.check}>
                    <input
                      type="checkbox"
                      checked={
                        key === "limitations" || includedSections.includes(key)
                      }
                      disabled={key === "limitations"}
                      onChange={(event) =>
                        setIncludedSections((previous) =>
                          event.target.checked
                            ? [...previous, key]
                            : previous.filter((item) => item !== key),
                        )
                      }
                    />
                    {title}
                  </label>
                ))}
              </fieldset>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(event) => setIncludeNotes(event.target.checked)}
                />
                Include private case notes
              </label>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={includeAnnotations}
                  onChange={(event) =>
                    setIncludeAnnotations(event.target.checked)
                  }
                />
                Include selected personal annotations and correction proposals
              </label>
              <fieldset>
                <legend>Private artifact data — explicit inclusion</legend>
                {frozen.payload.attachments.map((item) => (
                  <label
                    className={styles.check}
                    key={`${item.id}:${item.revision}`}
                  >
                    <input
                      type="checkbox"
                      checked={includeData.includes(
                        `${item.id}:${item.revision}`,
                      )}
                      onChange={(event) =>
                        setIncludeData((previous) =>
                          event.target.checked
                            ? [...previous, `${item.id}:${item.revision}`]
                            : previous.filter(
                                (value) =>
                                  value !== `${item.id}:${item.revision}`,
                              ),
                        )
                      }
                    />
                    Include {item.title}, revision {item.revision}, with its
                    full stored data
                  </label>
                ))}
                <p>
                  Unchecked artifacts retain references only. This flow does not
                  redistribute original source files; their rights remain
                  separate.
                </p>
              </fieldset>
              <div className={styles.checklist}>
                <strong>Reproducibility manifest</strong>
                <ul>
                  <li>Frozen case revision and content hash</li>
                  <li>Exact source anchors and dataset/file hashes</li>
                  <li>
                    Selected code, figures and data with their recorded origins
                  </li>
                  <li>Methods/environment notes and unresolved limitations</li>
                </ul>
              </div>
              <div className={styles.row}>
                <button
                  className="button"
                  type="button"
                  onClick={async () => {
                    if (await exportReady())
                      downloadJson("nova-ember-frozen-research.json", report);
                  }}
                >
                  <ArrowDownToLine size={15} /> Download JSON
                </button>
                <button
                  className="button"
                  type="button"
                  onClick={async () => {
                    if ((await exportReady()) && report)
                      saveHtml(htmlReport(report));
                  }}
                >
                  <ArrowDownToLine size={15} /> Download safe HTML
                </button>
                <button className="button" type="button" onClick={print}>
                  <Printer size={15} /> Print report
                </button>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={reproducibilityBundle}
                >
                  Build reproducibility bundle
                </button>
              </div>
            </>
          )}
          {bundle && (
            <div>
              <p>
                Bundle {String(bundle.status)} · {String(bundle.id).slice(0, 8)}
              </p>
              {Boolean(object(bundle.result).artifact) && (
                <a
                  className="button"
                  href={`/v1/workflows/${bundle.id}/artifacts/${object(object(bundle.result).artifact).id}`}
                  download
                >
                  Download completed bundle
                </a>
              )}
            </div>
          )}
        </section>
      )}
      <footer>
        <Save size={15} />
        <span>
          Structured drafts save in this browser. Save revision above freezes
          the full case. Original source values are never replaced by personal
          corrections.
        </span>
      </footer>
    </section>
  );
});

"use client";

import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Asset,
  ScientificField,
  ScientificRecord,
  ScientificRecords,
  useResource,
} from "../lib/api";
import {
  listCases,
  ResearchCase,
  saveCase,
  SourceAnchor,
} from "../lib/workspace-storage";
import { ErrorState, LoadingRows, Notice } from "./chrome";
import styles from "./scientific-records.module.css";

const roleLabels: Record<string, string> = {
  source_test_record: "Source test record",
  condition_record: "Condition record",
  range_summary: "Condition-range summary",
  daily_summary: "Daily summary",
  session_record: "Session record",
  sample_record: "Sample record",
  flow_visualization: "Flow visualization",
  note: "Source note",
  unclassified_record: "Unclassified source record",
};

const missingLabels: Record<string, string> = {
  not_reported: "Not reported",
  not_measured: "Not measured",
  not_applicable: "Not applicable",
  inaccessible: "Inaccessible source",
  unreadable: "Unreadable source",
  below_detection: "Below detection limit",
  censored: "Censored observation",
  conflicting: "Conflicting source values",
  pending_review: "Pending source review",
  ambiguous: "Ambiguous source meaning",
  invalid: "Invalid source value",
};

export function sourceRole(value: string) {
  return roleLabels[value] ?? value.replaceAll("_", " ");
}
function missingLabel(value: string) {
  return missingLabels[value] ?? value.replaceAll("_", " ");
}
export function physicalRows(record: { source_row: number; line_end: number }) {
  return record.source_row === record.line_end
    ? String(record.source_row)
    : `${record.source_row}–${record.line_end}`;
}

export function ScientificRecordView({
  asset,
  snapshotId,
  quality,
  onOriginal,
}: {
  asset: Asset;
  snapshotId?: string;
  quality: boolean;
  onOriginal: () => void;
}) {
  const [offset, setOffset] = useState(0);
  const [rowKind, setRowKind] = useState("");
  const query = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (snapshotId) query.set("snapshot_id", snapshotId);
  if (rowKind) query.set("row_kind", rowKind);
  const result = useResource<ScientificRecords>(
    `/v1/assets/${asset.sha256}/records?${query}`,
  );
  const data = result.data;
  return (
    <section
      className="source-table-panel scientific-records"
      aria-label={quality ? "Source quality" : "Scientific source records"}
      aria-busy={result.loading}
    >
      <div className="section-heading">
        <h2>{quality ? "Source quality" : "Experimental records"}</h2>
        <button className="text-button" onClick={onOriginal}>
          Read original table <ArrowRight size={15} />
        </button>
      </div>
      {result.error ? (
        <>
          <ErrorState message={result.error} retry={result.reload} />
          <button className="button" onClick={onOriginal}>
            Return to original values
            <ArrowRight size={16} />
          </button>
        </>
      ) : !data ? (
        <LoadingRows label="Reading source-specific records" />
      ) : (
        <>
          <p className={styles.count} aria-live="polite">
            {data.total_records}{" "}
            {data.total_records === 1 ? "record" : "records"}
            {rowKind ? " in this category" : ""}
            {result.loading ? " · Updating…" : ""}
          </p>
          {data.status === "schema_unrecognized" && (
            <Notice kind="caution">
              <strong>
                No source-specific mapping is available for this table.
              </strong>
              <p>
                Inspect the original values and protocol. Unclassified records
                do not supply normalized measurements or analysis-ready runs.
              </p>
              <button className="text-button" onClick={onOriginal}>
                Inspect original source
                <ArrowRight size={15} />
              </button>
            </Notice>
          )}
          {quality ? (
            <>
              <QualityView data={data} />
              <RecordPagination
                data={data}
                loading={result.loading}
                onOffset={setOffset}
              />
            </>
          ) : (
            <>
              {Object.keys(data.row_kind_counts).length > 1 && (
                <div className="record-toolbar">
                  <label htmlFor={`source-role-${asset.sha256}`}>
                    Record category
                  </label>
                  <select
                    id={`source-role-${asset.sha256}`}
                    value={rowKind}
                    onChange={(event) => {
                      setRowKind(event.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">All categories</option>
                    {Object.entries(data.row_kind_counts).map(
                      ([role, count]) => (
                        <option value={role} key={role}>
                          {sourceRole(role)} ({count})
                        </option>
                      ),
                    )}
                  </select>
                </div>
              )}
              {data.records.length ? (
                <RecordDataTable data={data} />
              ) : (
                <div className="empty-state compact-empty">
                  <p>
                    No records match this category. Choose another category to
                    continue.
                  </p>
                </div>
              )}
              <RecordPagination
                data={data}
                loading={result.loading}
                onOffset={setOffset}
              />
              {data.refusals.length > 0 && (
                <Notice kind="caution">
                  <strong>Interpretations withheld</strong>
                  <ul>
                    {data.refusals.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                </Notice>
              )}
            </>
          )}
          <details className={styles.interpretation}>
            <summary>How to interpret these records</summary>
            <p>
              Values are shown as reported in the source. Open a record for
              units, conversions, conditions and interpretation notes. Missing
              values remain missing.
            </p>
            <p>
              Records may describe tests, sessions, summaries or notes. They are
              not automatically independent experiments; check their identity
              and conditions before combining results or fitting a model.
            </p>
            <p>
              {data.empty_record_count > 0
                ? `${data.empty_record_count} empty source records were excluded. `
                : ""}
              {data.independent_run_count === null
                ? "Independent experimental units have not been established for this table."
                : `${data.independent_run_count} independent experimental units are identified.`}
            </p>
            <ul>
              {data.limitations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
            <dl>
              <dt>Source file</dt>
              <dd>{asset.file_name}</dd>
              <dt>Interpretation method</dt>
              <dd>{data.adapter_id}</dd>
              <dt>Source identifier</dt>
              <dd>
                <code>{asset.sha256}</code>
              </dd>
              <dt>Source version</dt>
              <dd>
                <code>{data.snapshot_id}</code>
              </dd>
            </dl>
          </details>
        </>
      )}
    </section>
  );
}

function RecordDataTable({ data }: { data: ScientificRecords }) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const columns = Array.from(
    {
      length: Math.max(
        data.headers.length,
        ...data.records.map((record) => record.raw_cells.length),
      ),
    },
    (_, column) => data.headers[column] || `Column ${column + 1}`,
  );
  const unresolvedColumns = new Set(
    columns.flatMap((_, column) => {
      const fields = data.records.flatMap((record) =>
        record.fields.filter(
          (field) => field.column_index === column && field.raw_text,
        ),
      );
      return fields.length > 0 &&
        fields.every((field) => field.status === "unresolved")
        ? [column]
        : [];
    }),
  );
  return (
    <>
      <p className={styles.tableHint}>
        Reported source values · Scroll to see all columns. Open a record for
        its interpretation.
      </p>
      <div
        className={styles.tableScroll}
        role="region"
        aria-label="Experimental source values"
        tabIndex={0}
      >
        <table className={styles.values}>
          <thead>
            <tr>
              <th scope="col">Source record</th>
              {columns.map((header, column) => (
                <th scope="col" key={column}>
                  {header || `Column ${column + 1}`}
                  {unresolvedColumns.has(column) && (
                    <small>Meaning unresolved</small>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.records.map((record) => (
              <SourceDataRow
                key={record.source_row}
                data={data}
                record={record}
                columns={columns}
                open={selectedRow === record.source_row}
                unresolvedColumns={unresolvedColumns}
                onToggle={() =>
                  setSelectedRow(
                    selectedRow === record.source_row
                      ? null
                      : record.source_row,
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SourceDataRow({
  data,
  record,
  columns,
  open,
  unresolvedColumns,
  onToggle,
}: {
  data: ScientificRecords;
  record: ScientificRecord;
  columns: string[];
  open: boolean;
  unresolvedColumns: Set<number>;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <th scope="row">
          <button
            className="text-button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={`source-detail-${data.asset.sha256}-${record.source_row}`}
          >
            Record {physicalRows(record)}
          </button>
        </th>
        {columns.map((_, column) => {
          const field = record.fields.find(
            (value) => value.column_index === column,
          );
          return (
            <td key={column}>
              {record.raw_cells[column] || <span className="muted">—</span>}
              {field?.status === "unresolved" &&
                !unresolvedColumns.has(column) && (
                  <small>Meaning unresolved</small>
                )}
              {field?.missing_reason && (
                <small>{missingLabel(field.missing_reason)}</small>
              )}
            </td>
          );
        })}
      </tr>
      {open && (
        <tr id={`source-detail-${data.asset.sha256}-${record.source_row}`}>
          <td colSpan={columns.length + 1}>
            <div className={styles.recordDetail}>
              <div className="section-heading">
                <h3>
                  Record {physicalRows(record)} · {sourceRole(record.row_kind)}
                </h3>
                <button className="text-button" onClick={onToggle}>
                  Close record
                </button>
              </div>
              <FieldTable fields={record.fields} />
              <Link
                className="button button-small"
                href={`/app/runs/${encodeURIComponent(JSON.stringify([data.asset.accession, data.asset.id, data.asset.sha256, record.source_row]))}?snapshot=${data.snapshot_id}`}
              >
                Ask about or analyze this record <ArrowRight size={15} />
              </Link>
              <details className={styles.interpretation}>
                <summary>Attach this record to saved research</summary>
                <AttachSourceRow data={data} record={record} />
              </details>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function FieldTable({ fields }: { fields: ScientificField[] }) {
  return (
    <>
      <div className="table-scroll field-table">
        <table>
          <thead>
            <tr>
              <th scope="col">Source column</th>
              <th scope="col">Original text</th>
              <th scope="col">Converted value</th>
              <th scope="col">Meaning and qualifications</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.column_index}>
                <th scope="row">
                  {field.source_column ||
                    `Unnamed source column ${field.column_index + 1}`}
                </th>
                <td className="original-cell">
                  <OriginalValue field={field} />
                </td>
                <td>
                  <NormalizedValue field={field} />
                </td>
                <td>
                  <FieldMeaning field={field} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-field-list">
        {fields.map((field) => (
          <section className="mobile-scientific-field" key={field.column_index}>
            <h4>
              {field.source_column ||
                `Unnamed source column ${field.column_index + 1}`}
            </h4>
            <dl className="source-value-pair">
              <div>
                <dt>Original text</dt>
                <dd className="field-original original-cell">
                  <OriginalValue field={field} />
                </dd>
              </div>
              <div>
                <dt>Converted value</dt>
                <dd className="field-normalized">
                  <NormalizedValue field={field} />
                </dd>
              </div>
            </dl>
            <div className="mobile-field-meaning">
              <FieldMeaning field={field} />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

function OriginalValue({ field }: { field: ScientificField }) {
  return field.raw_text === "" ? (
    <span className="muted">Empty cell</span>
  ) : (
    field.raw_text
  );
}

function NormalizedValue({ field }: { field: ScientificField }) {
  if (field.canonical_value !== null)
    return (
      <span className="mono">
        {String(field.canonical_value)}
        {field.canonical_unit ? ` ${field.canonical_unit}` : ""}
      </span>
    );
  return (
    <span className="muted">
      {field.status === "missing"
        ? "No reported value"
        : field.status === "unresolved"
          ? "Meaning unresolved"
          : "Source text"}
    </span>
  );
}

function FieldMeaning({ field }: { field: ScientificField }) {
  return (
    <>
      {field.missing_reason && (
        <span className="field-state">
          {missingLabel(field.missing_reason)}
        </span>
      )}
      {field.status === "unresolved" && !field.missing_reason && (
        <span className="field-state">Unresolved meaning</span>
      )}
      {field.qualifier && (
        <span className="field-state">Qualifier: {field.qualifier}</span>
      )}
      {field.original_unit && (
        <span className="field-context">
          Original unit: {field.original_unit}
        </span>
      )}
      {field.quantity_kind && (
        <span className="field-context">
          Quantity: {field.quantity_kind.replaceAll("_", " ")}
        </span>
      )}
      {field.location && (
        <span className="field-context">
          Location: {field.location.replaceAll("_", " ")}
        </span>
      )}
      {field.basis && (
        <span className="field-context">
          Basis: {field.basis.replaceAll("_", " ")}
        </span>
      )}
      {field.source_value_kind && (
        <span className="field-context">
          Source value type: {field.source_value_kind.replaceAll("_", " ")}
        </span>
      )}
      {field.transformation_formula && (
        <span className="field-context">
          Conversion: {field.transformation_formula}
        </span>
      )}
      {field.notes.map((note, index) => (
        <span className="field-context" key={index}>
          {note}
        </span>
      ))}
    </>
  );
}

function QualityView({ data }: { data: ScientificRecords }) {
  const unresolved = data.records.flatMap((record) =>
    record.fields
      .filter(
        (field) => field.status === "missing" || field.status === "unresolved",
      )
      .map((field) => ({ record, field })),
  );
  return (
    <div className="quality-view">
      <h3>Interpretation limits</h3>
      {data.limitations.length > 0 ? (
        <ul>
          {data.limitations.map((text, index) => (
            <li key={index}>{text}</li>
          ))}
        </ul>
      ) : (
        <p>
          No additional table-level qualifications were returned. This does not
          establish calibration or analysis readiness.
        </p>
      )}
      {data.refusals.length > 0 && (
        <>
          <h3>Calculations and meanings withheld</h3>
          <ul>
            {data.refusals.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </>
      )}
      <h3>Unresolved fields in this page</h3>
      <p className="field-help">
        Records {data.total_records ? data.offset + 1 : 0}–
        {Math.min(data.offset + data.records.length, data.total_records)} of{" "}
        {data.total_records}. These entries describe only the displayed source
        records.
      </p>
      {unresolved.length ? (
        <div className="table-scroll quality-table">
          <table>
            <thead>
              <tr>
                <th scope="col">Physical row</th>
                <th scope="col">Source column</th>
                <th scope="col">Original text</th>
                <th scope="col">Meaning</th>
              </tr>
            </thead>
            <tbody>
              {unresolved.map(({ record, field }) => (
                <tr key={`${record.source_row}-${field.column_index}`}>
                  <td className="mono">{physicalRows(record)}</td>
                  <th scope="row">
                    {field.source_column ||
                      `Unnamed source column ${field.column_index + 1}`}
                  </th>
                  <td>
                    {field.raw_text === "" ? (
                      <span className="muted">Empty cell</span>
                    ) : (
                      field.raw_text
                    )}
                  </td>
                  <td>
                    {field.missing_reason
                      ? missingLabel(field.missing_reason)
                      : "Unresolved meaning"}
                    {field.notes.map((note, index) => (
                      <span className="field-context" key={index}>
                        {note}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="field-help">
          No fields on this page are marked missing or unresolved by this
          mapping. Other calibration and comparability requirements still apply.
        </p>
      )}
      <details className="method-details">
        <summary>Mapping and frozen source identity</summary>
        <dl>
          <dt>Mapping</dt>
          <dd className="mono">{data.adapter_id}</dd>
          <dt>Source SHA-256</dt>
          <dd className="mono hash-value">{data.asset.sha256}</dd>
          <dt>Snapshot</dt>
          <dd className="mono hash-value">{data.snapshot_id}</dd>
        </dl>
      </details>
    </div>
  );
}

function RecordPagination({
  data,
  loading,
  onOffset,
}: {
  data: ScientificRecords;
  loading: boolean;
  onOffset: (offset: number) => void;
}) {
  return (
    <div className="table-pagination">
      <span>
        Records {data.total_records ? data.offset + 1 : 0}–
        {Math.min(data.offset + data.records.length, data.total_records)} of{" "}
        {data.total_records}
      </span>
      <div>
        <button
          className="button button-small"
          disabled={data.offset === 0 || loading}
          onClick={() => onOffset(Math.max(0, data.offset - 30))}
        >
          Previous records
        </button>
        <button
          className="button button-small"
          disabled={data.offset + 30 >= data.total_records || loading}
          onClick={() => onOffset(data.offset + 30)}
        >
          Next records
        </button>
      </div>
    </div>
  );
}

function AttachSourceRow({
  data,
  record,
}: {
  data: ScientificRecords;
  record: ScientificRecord;
}) {
  const [cases, setCases] = useState<ResearchCase[]>([]);
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    listCases()
      .then(setCases)
      .catch((reason: unknown) =>
        setError(
          reason instanceof Error
            ? reason.message
            : "Personal cases could not be opened.",
        ),
      );
  }, []);
  async function attach() {
    const current = cases.find((value) => value.id === selected);
    if (!current) return;
    const source: SourceAnchor = {
      accession: data.asset.accession,
      investigation_version: data.asset.investigation_version,
      file_name: data.asset.file_name,
      file_version: data.asset.file_version,
      source_sha256: data.asset.sha256,
      snapshot_id: data.snapshot_id,
      source_row: record.source_row,
      line_end: record.line_end,
      row_kind: record.row_kind,
      adapter_id: data.adapter_id,
      source_columns: data.headers,
      raw_cells: record.raw_cells,
    };
    if (
      current.source_anchors?.some(
        (anchor) =>
          anchor.snapshot_id === source.snapshot_id &&
          anchor.source_sha256 === source.source_sha256 &&
          anchor.source_row === source.source_row &&
          anchor.line_end === source.line_end,
      )
    ) {
      setMessage("This exact source row is already attached to the case.");
      return;
    }
    if (
      (current.source_anchors?.length ?? 0) >= 500 ||
      current.revisions.length >= 200
    ) {
      setError(
        "This case has reached its source or revision limit. Export it and begin another case to retain more evidence.",
      );
      return;
    }
    const anchors = [...(current.source_anchors ?? []), source];
    const investigationIds = Array.from(
      new Set([...current.investigation_ids, source.accession]),
    );
    const time = new Date().toISOString();
    const revision = current.revision + 1;
    const next: ResearchCase = {
      ...current,
      source_anchors: anchors,
      investigation_ids: investigationIds,
      revision,
      updated_at: time,
      revisions: [
        ...current.revisions,
        {
          revision,
          saved_at: time,
          question: current.question,
          notes: current.notes,
          investigation_ids: investigationIds,
          snapshot_id: current.snapshot_id,
          source_anchors: anchors,
        },
      ],
    };
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await saveCase(next, current.revision);
      setCases(await listCases());
      setMessage(
        `Physical row ${physicalRows(record)} attached as revision ${revision}.`,
      );
      window.dispatchEvent(new Event("nova-ember-workspace-changed"));
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The source row could not be attached. Your existing case is unchanged.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="attach-source-row">
      <div>
        <h3>
          <BookOpen size={17} />
          Keep this exact evidence
        </h3>
        <p>
          The physical row, original cells, file version, hash, and snapshot are
          saved with the case revision.
        </p>
      </div>
      {cases.length ? (
        <div className="attach-source-controls">
          <label
            className="visually-hidden"
            htmlFor={`case-for-row-${data.asset.sha256}-${record.source_row}`}
          >
            Research case for physical row {physicalRows(record)}
          </label>
          <select
            id={`case-for-row-${data.asset.sha256}-${record.source_row}`}
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={saving}
          >
            <option value="">Choose a research case</option>
            {cases.map((value) => (
              <option value={value.id} key={value.id}>
                {value.title}
              </option>
            ))}
          </select>
          <button
            className="button button-small"
            disabled={!selected || saving}
            onClick={attach}
          >
            {message ? <Check size={15} /> : <FileText size={15} />}
            {saving ? "Attaching…" : "Attach source row"}
          </button>
        </div>
      ) : (
        <Link className="button button-small" href="/app/cases/new">
          Create a case first
          <ArrowRight size={15} />
        </Link>
      )}
      {message && (
        <p className="attachment-result" role="status">
          {message}
        </p>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      <a
        className="text-button source-original-download"
        href={`/v1/assets/${data.asset.sha256}/raw?snapshot_id=${data.snapshot_id}`}
      >
        <ArrowDownToLine size={14} />
        Download original source
      </a>
    </div>
  );
}

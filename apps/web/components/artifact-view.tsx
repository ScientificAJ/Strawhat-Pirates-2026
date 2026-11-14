"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Notice } from "./chrome";

const ScientificChart = dynamic(
  () => import("./scientific-chart").then((module) => module.ScientificChart),
  {
    ssr: false,
    loading: () => <p role="status">Preparing the scientific figure…</p>,
  },
);
const ScientificResultSummary = dynamic(() =>
  import("./scientific-result").then(
    (module) => module.ScientificResultSummary,
  ),
);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown): string {
  return value === null || value === undefined
    ? "Not reported"
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
}
const origins: Record<string, string> = {
  source_metadata: "Source metadata",
  source_measurement: "Source records",
  source_text: "Source text",
  source_media: "Source media",
  deterministic_calculation: "Calculation",
  prediction: "Model prediction",
  model_interpretation: "Model interpretation",
  research_hypothesis: "Research hypothesis",
  user_supplied_input: "User-supplied input",
  model_proposal: "Proposed change",
  unknown: "Unknown",
};
export function ArtifactView({
  value,
  summarize = true,
}: {
  value: unknown;
  summarize?: boolean;
}) {
  if (!isRecord(value)) return <p>{text(value)}</p>;
  if ("vega_lite" in value) return <ScientificChart chart={value} />;
  const nestedResult = isRecord(value.result)
    ? value.result
    : isRecord(value.measurement)
      ? value.measurement
      : null;
  if (nestedResult)
    return (
      <section className="artifact-record">
        {typeof value.scientific_origin === "string" && (
          <p className="status-line">
            {origins[value.scientific_origin] ??
              value.scientific_origin.replaceAll("_", " ")}
          </p>
        )}
        {(value.incomplete === true || value.status === "incomplete") && (
          <Notice kind="caution">
            Incomplete research output. Its missing work and qualifications
            remain part of this record.
          </Notice>
        )}
        <ArtifactView value={nestedResult} summarize={summarize} />
        <EnvelopeQualifications value={value} />
        <RecordDetails value={value} />
      </section>
    );
  if (isRecord(value.content))
    return (
      <section className="artifact-record">
        <div className="section-heading">
          <h3>{text(value.label ?? value.title ?? "Research artifact")}</h3>
          {typeof value.origin === "string" && (
            <span className="status">
              {origins[value.origin] ?? value.origin.replaceAll("_", " ")}
            </span>
          )}
        </div>
        <ArtifactView value={value.content} summarize={summarize} />
        <EnvelopeQualifications value={value} />
        <RecordDetails value={value} />
      </section>
    );
  if (Array.isArray(value.columns) && Array.isArray(value.values))
    return <ArtifactTable value={value} />;
  if (isRecord(value.data) && Array.isArray(value.data.values))
    return (
      <section className="artifact-record">
        <ArtifactTable value={value.data} />
        <EnvelopeQualifications value={value} />
        <RecordDetails value={value} />
      </section>
    );
  const counts = Array.isArray(value.counts)
    ? value.counts.filter(isRecord)
    : null;
  const reasons = Array.isArray(value.reasons) ? value.reasons : [];
  const points = Array.isArray(value.points)
    ? value.points
    : Array.isArray(value.residuals)
      ? value.residuals
      : null;
  return (
    <section className="artifact-record">
      {summarize && typeof value.method_id === "string" && (
        <ScientificResultSummary value={value} />
      )}
      {typeof value.status === "string" && (
        <p className="status-line">{value.status.replaceAll("_", " ")}</p>
      )}
      {value.value !== undefined && (
        <p className="scientific-result">
          <strong>{text(value.value)}</strong>{" "}
          {typeof value.unit === "string" ? value.unit : ""}
        </p>
      )}
      {typeof value.definition === "string" && <p>{value.definition}</p>}
      {typeof value.interpretation === "string" && (
        <p>{value.interpretation}</p>
      )}
      {typeof value.text === "string" && (
        <blockquote className="source-quote">{value.text}</blockquote>
      )}
      {typeof value.original_text === "string" && (
        <pre className="artifact-code">{value.original_text}</pre>
      )}
      {counts && (
        <table>
          <caption>
            Source-reported categories; record counts are not automatically
            independent experiments.
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Source records</th>
            </tr>
          </thead>
          <tbody>
            {counts.map((row, index) => (
              <tr key={index}>
                <th scope="row">{text(row.label)}</th>
                <td>{text(row.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {value.independent_run_count === null && (
        <p className="data-caveat">
          Independent experimental-run count is not established.
        </p>
      )}
      {reasons.length > 0 && (
        <Notice kind="caution">
          <ul>
            {reasons.map((reason, index) => (
              <li key={index}>{text(reason)}</li>
            ))}
          </ul>
          {Array.isArray(value.required_inputs) && (
            <p>Needed inputs: {value.required_inputs.map(text).join("; ")}</p>
          )}
        </Notice>
      )}
      {points && points.every(isRecord) && (
        <ArtifactTable
          value={{
            values: points,
            columns: Object.keys(points[0] ?? {}).map((key) => ({
              key,
              title: key.replaceAll("_", " "),
              units: [],
            })),
          }}
        />
      )}
      {typeof value.stdout === "string" && (
        <section>
          <h4>Python / shell output</h4>
          <pre className="artifact-code">
            {value.stdout || "No standard output."}
          </pre>
          {typeof value.stderr === "string" && value.stderr && (
            <pre className="artifact-code">{value.stderr}</pre>
          )}
        </section>
      )}
      <EnvelopeQualifications value={value} />
      <RecordDetails value={value} />
    </section>
  );
}
function EnvelopeQualifications({ value }: { value: Record<string, unknown> }) {
  const groups = [
    ["assumptions", "Assumptions"],
    ["limitations", "Scientific limitations"],
    ["restrictions", "Use restrictions"],
  ] as const;
  return (
    <>
      {groups.map(([key, title]) => {
        const items = Array.isArray(value[key])
          ? value[key].filter(
              (item): item is string => typeof item === "string",
            )
          : [];
        return items.length ? (
          <div className="artifact-limitations" key={key}>
            <h4>{title}</h4>
            <ul>
              {items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null;
      })}
    </>
  );
}
export function RecordDetails({ value }: { value: unknown }) {
  return (
    <details className="artifact-details">
      <summary>Full scientific record and provenance</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function ArtifactTable({ value }: { value: Record<string, unknown> }) {
  const [page, setPage] = useState(0);
  const rows = Array.isArray(value.values) ? value.values.filter(isRecord) : [];
  const columns: Record<string, unknown>[] = Array.isArray(value.columns)
    ? value.columns.map((column) =>
        isRecord(column)
          ? column
          : { key: String(column), title: String(column) },
      )
    : Object.keys(rows[0] ?? {}).map((key) => ({ key, title: key }));
  const shown = rows.slice(page * 30, (page + 1) * 30);
  return (
    <section className="artifact-table">
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Scientific values"
      >
        <table>
          <caption>Exact returned values. Missing data stays missing.</caption>
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th scope="col" key={index}>
                  {text(column.display_title ?? column.title ?? column.key)}{" "}
                  {Array.isArray(column.units) &&
                    column.units.length > 0 &&
                    `[${column.units.join(", ")}]`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, index) => (
              <tr key={index}>
                {columns.map((column, field) => (
                  <td key={field}>{text(row[String(column.key)])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No eligible rows in this selection.</p>}
      {rows.length > 30 && (
        <div className="table-pagination">
          <span>
            {page * 30 + 1}–{Math.min((page + 1) * 30, rows.length)} of{" "}
            {rows.length} returned values
          </span>
          <button
            className="button button-small"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous values
          </button>
          <button
            className="button button-small"
            disabled={(page + 1) * 30 >= rows.length}
            onClick={() => setPage(page + 1)}
          >
            Next values
          </button>
        </div>
      )}
      <EnvelopeQualifications value={value} />
      <RecordDetails value={value} />
    </section>
  );
}

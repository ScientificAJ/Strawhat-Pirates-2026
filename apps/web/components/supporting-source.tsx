"use client";

import { ArrowDownToLine, FileSpreadsheet, FileText } from "lucide-react";
import { useState } from "react";
import { Asset, useResource } from "../lib/api";
import { ErrorState, LoadingRows, Notice } from "./chrome";
import { isPublishedTranscription } from "../lib/source-description";

type WorkbookCell = {
  sheet: string;
  coordinate: string;
  cell_type: string;
  text: string | null;
  raw_value: string | null;
  formula: string | null;
  has_formula: boolean;
  formula_attributes: Record<string, string>;
  cached_value: string | null;
  style_index: string | null;
};
type WorkbookSource = {
  asset: Asset;
  snapshot_id: string;
  sheets: {
    name: string;
    state: string;
    dimension: string | null;
    merged_ranges: string[];
    cell_count: number | null;
  }[];
  selected_sheet: string;
  cells: WorkbookCell[];
  total_cells: number;
  limit: number;
  offset: number;
  limitations: string[];
};
type TextSource = {
  asset: Asset;
  snapshot_id: string;
  encoding: string;
  lines: { line_number: number; text: string }[];
  total_lines: number;
  limit: number;
  offset: number;
};

export function SupportingSource({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId: string;
}) {
  return asset.file_name.toLowerCase().endsWith(".xlsx") ? (
    <WorkbookInspector asset={asset} snapshotId={snapshotId} />
  ) : asset.file_name.toLowerCase().endsWith(".txt") ? (
    <TextInspector asset={asset} snapshotId={snapshotId} />
  ) : (
    <section className="source-table-panel">
      <h2>Original source file</h2>
      <p>{asset.file_name}</p>
      <Notice>
        No reviewed inline reader is available for this file format. The
        retained original remains identified by its version and hash.
      </Notice>
      <SourceIdentity asset={asset} snapshotId={snapshotId} />
    </section>
  );
}

function SourceIdentity({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId: string;
}) {
  return (
    <div className="supporting-source-identity">
      <div className="source-metadata">
        <span>
          Investigation v{asset.investigation_version} · File v
          {asset.file_version}
        </span>
        <span className="mono" title={asset.sha256}>
          SHA-256 {asset.sha256.slice(0, 12)}…
        </span>
      </div>
      {asset.license === "CC0-1.0" && (
        <a
          className="button button-small"
          href={`/v1/assets/${asset.sha256}/raw?snapshot_id=${snapshotId}`}
        >
          <ArrowDownToLine size={15} />
          {isPublishedTranscription(asset)
            ? "Download transcribed table"
            : "Download original file"}
        </a>
      )}
    </div>
  );
}

function WorkbookInspector({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId: string;
}) {
  const [sheet, setSheet] = useState("");
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({
    limit: "100",
    offset: String(offset),
    snapshot_id: snapshotId,
  });
  if (sheet) query.set("sheet", sheet);
  const result = useResource<WorkbookSource>(
    `/v1/assets/${asset.sha256}/workbook?${query}`,
  );
  const data = result.data;
  const selectedSheet = data?.sheets.find(
    (item) => item.name === data.selected_sheet,
  );
  return (
    <section
      className="source-table-panel workbook-inspector"
      aria-label="Original workbook cells"
      aria-busy={result.loading}
    >
      <div className="section-heading">
        <div>
          <h2>
            <FileSpreadsheet size={21} />
            Original workbook cells
          </h2>
          <p>{asset.file_name}</p>
        </div>
        <span className="status status-neutral">Source text and formulas</span>
      </div>
      {result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : !data ? (
        <LoadingRows label="Opening the retained workbook" />
      ) : (
        <>
          <Notice>
            <strong>
              Formulas are preserved as source text and are not executed.
            </strong>
            <p>
              Cached results belong to the original workbook and may be stale. A
              source cell does not establish a valid calibration or independent
              measurement.
            </p>
          </Notice>
          <div className="record-toolbar">
            <label htmlFor={`sheet-${asset.sha256}`}>Worksheet</label>
            <select
              id={`sheet-${asset.sha256}`}
              value={data.selected_sheet}
              onChange={(event) => {
                setSheet(event.target.value);
                setOffset(0);
              }}
            >
              {data.sheets.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name} ·{" "}
                  {item.cell_count === null
                    ? "count on selection"
                    : `${item.cell_count} cells`}
                  {item.state !== "visible" ? ` · ${item.state}` : ""}
                </option>
              ))}
            </select>
            <span>{data.total_cells} retained cells</span>
          </div>
          {selectedSheet && (
            <p className="field-help workbook-dimensions">
              Source range: {selectedSheet.dimension || "Not reported"}.{" "}
              {selectedSheet.merged_ranges.length
                ? `Merged ranges: ${selectedSheet.merged_ranges.join(", ")}.`
                : "No merged ranges are reported."}
            </p>
          )}
          <div className="table-scroll workbook-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Cell</th>
                  <th scope="col">Source text or value</th>
                  <th scope="col">Formula text</th>
                  <th scope="col">Cached formula result</th>
                  <th scope="col">Source details</th>
                </tr>
              </thead>
              <tbody>
                {data.cells.map((cell) => (
                  <tr key={cell.coordinate}>
                    <th scope="row" className="mono">
                      {cell.coordinate}
                    </th>
                    <td className="original-cell">
                      {cell.text === null ? (
                        <span className="muted">No stored value</span>
                      ) : cell.text === "" ? (
                        <span className="muted">Empty source text</span>
                      ) : (
                        cell.text
                      )}
                    </td>
                    <td className="mono formula-text">
                      {cell.has_formula ? (
                        (cell.formula ??
                        "Shared formula reference — inspect source attributes")
                      ) : (
                        <span className="muted">No formula</span>
                      )}
                    </td>
                    <td>
                      {cell.has_formula ? (
                        cell.cached_value === null ? (
                          <span className="muted">No cached result</span>
                        ) : (
                          <span className="mono">{cell.cached_value}</span>
                        )
                      ) : (
                        <span className="muted">Not applicable</span>
                      )}
                    </td>
                    <td>
                      <details>
                        <summary>Inspect cell attributes</summary>
                        <dl>
                          <dt>Worksheet</dt>
                          <dd>{cell.sheet}</dd>
                          <dt>Source cell type</dt>
                          <dd className="mono">{cell.cell_type}</dd>
                          <dt>Raw XML value</dt>
                          <dd className="mono">
                            {cell.raw_value === null
                              ? "Absent"
                              : cell.raw_value}
                          </dd>
                          <dt>Style index</dt>
                          <dd className="mono">
                            {cell.style_index ?? "Not reported"}
                          </dd>
                          {Object.keys(cell.formula_attributes).length > 0 && (
                            <>
                              <dt>Formula attributes</dt>
                              <dd className="mono">
                                {JSON.stringify(cell.formula_attributes)}
                              </dd>
                            </>
                          )}
                        </dl>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourcePagination
            noun="Cells"
            offset={data.offset}
            count={data.cells.length}
            total={data.total_cells}
            limit={100}
            loading={result.loading}
            onOffset={setOffset}
          />
          <details className="method-details">
            <summary>Source interpretation limits</summary>
            <ul>
              {data.limitations.map((text, index) => (
                <li key={index}>{text}</li>
              ))}
            </ul>
          </details>
        </>
      )}
      <SourceIdentity
        asset={asset}
        snapshotId={data?.snapshot_id ?? snapshotId}
      />
    </section>
  );
}

function TextInspector({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId: string;
}) {
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({
    limit: "100",
    offset: String(offset),
    snapshot_id: snapshotId,
  });
  const result = useResource<TextSource>(
    `/v1/assets/${asset.sha256}/text?${query}`,
  );
  const data = result.data;
  return (
    <section
      className="source-table-panel text-inspector"
      aria-label="Original source text"
      aria-busy={result.loading}
    >
      <div className="section-heading">
        <div>
          <h2>
            <FileText size={21} />
            Original source text
          </h2>
          <p>{asset.file_name}</p>
        </div>
        <span className="status status-neutral">Unchanged source lines</span>
      </div>
      {result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : !data ? (
        <LoadingRows label="Opening retained source lines" />
      ) : (
        <>
          <div className="source-metadata">
            <span>{data.encoding} encoding</span>
            <span>{data.total_lines} source lines</span>
          </div>
          <Notice>
            Column meanings, units, time bases, and calibrations require the
            source protocol. Displaying a trace does not establish that its
            measurements are ready for fitting.
          </Notice>
          <div className="table-scroll source-text-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Line</th>
                  <th scope="col">Original text</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.line_number}>
                    <th scope="row" className="mono">
                      {line.line_number}
                    </th>
                    <td>
                      <code>
                        {line.text === "" ? (
                          <span className="muted">Empty line</span>
                        ) : (
                          line.text
                        )}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SourcePagination
            noun="Lines"
            offset={data.offset}
            count={data.lines.length}
            total={data.total_lines}
            limit={100}
            loading={result.loading}
            onOffset={setOffset}
          />
        </>
      )}
      <SourceIdentity
        asset={asset}
        snapshotId={data?.snapshot_id ?? snapshotId}
      />
    </section>
  );
}

function SourcePagination({
  noun,
  offset,
  count,
  total,
  limit,
  loading,
  onOffset,
}: {
  noun: string;
  offset: number;
  count: number;
  total: number;
  limit: number;
  loading: boolean;
  onOffset: (value: number) => void;
}) {
  return (
    <div className="table-pagination">
      <span>
        {noun} {total ? offset + 1 : 0}–{Math.min(offset + count, total)} of{" "}
        {total}
        {loading ? " · Updating…" : ""}
      </span>
      <div>
        <button
          className="button button-small"
          disabled={loading || offset === 0}
          onClick={() => onOffset(Math.max(0, offset - limit))}
        >
          Previous {noun.toLowerCase()}
        </button>
        <button
          className="button button-small"
          disabled={loading || offset + limit >= total}
          onClick={() => onOffset(offset + limit)}
        >
          Next {noun.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

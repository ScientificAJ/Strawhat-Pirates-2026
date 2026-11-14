"use client";

import { useState } from "react";
import { Asset, useResource } from "../lib/api";
import { ErrorState, LoadingRows } from "./chrome";
import {
  Anchor,
  InspectButton,
  Limitations,
  sourceUrl,
} from "./workbench-common";
import s from "./workbench.module.css";

type FormatPage = {
  format: string;
  paragraphs?: {
    paragraph: number;
    text: string;
    table?: number;
    row?: number;
    column?: number;
    deleted_text?: string[];
    has_tracked_changes?: boolean;
  }[];
  total_paragraphs?: number;
  pages?: { page: number; preview_text: string; character_count: number }[];
  total_pages?: number;
  cells?: {
    row: number;
    column: number;
    raw_value: unknown;
    cell_type: number;
    style_index: number;
  }[];
  total_cells?: number;
  sheet_names?: string[];
  selected_sheet?: string;
  date_mode?: number;
  variables?: { name: string; shape: number[]; matlab_class: string }[];
  members?: { name: string; byte_size: number; directory: boolean }[];
  total_members?: number;
  embedded_figures?: { member: string; media_type: string; sha256: string }[];
  extraction_method?: string;
  limitations?: string[];
};
function coordinate(row: number, column: number) {
  let letters = "";
  while (column) {
    const remainder = (column - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    column = Math.floor((column - 1) / 26);
  }
  return letters + row;
}
export function RetainedFormatView({
  asset,
  snapshotId,
  onInspect,
}: {
  asset: Asset;
  snapshotId: string;
  onInspect: (anchor: Anchor) => void;
}) {
  const [offset, setOffset] = useState(0);
  const [sheet, setSheet] = useState("");
  const size = 25;
  const result = useResource<FormatPage>(
    sourceUrl(asset, snapshotId, "format") +
      "&limit=" +
      size +
      "&offset=" +
      offset +
      (sheet ? "&sheet=" + encodeURIComponent(sheet) : ""),
  );
  const anchor = (kind: string, place: Partial<Anchor>): Anchor => ({
    kind,
    snapshot_id: snapshotId,
    accession: asset.accession,
    investigation_version: asset.investigation_version,
    asset_id: asset.id,
    source_sha256: asset.sha256,
    ...place,
  });
  if (result.error)
    return <ErrorState message={result.error} retry={result.reload} />;
  if (!result.data)
    return <LoadingRows label="Opening retained source format" />;
  const data = result.data;
  const total =
    data.total_paragraphs ??
    data.total_pages ??
    data.total_cells ??
    data.total_members ??
    0;
  return (
    <div className={s.stack} aria-busy={result.loading}>
      <div className={s.toolbar}>
        <div>
          <h3>
            Retained{" "}
            {data.format === "matlab"
              ? "MATLAB variable inventory"
              : data.format === "archive"
                ? "archive inventory"
                : "source content"}
          </h3>
          <p className={s.help}>
            Original source values ·{" "}
            {data.extraction_method ?? "bounded format reader"}. Extraction does
            not establish scientific meaning or calibration.
          </p>
        </div>
        <a className="button" href={sourceUrl(asset, snapshotId)}>
          Download original file
        </a>
      </div>
      {data.sheet_names && (
        <label className={s.field}>
          Worksheet
          <select
            value={data.selected_sheet}
            onChange={(e) => {
              setSheet(e.target.value);
              setOffset(0);
            }}
          >
            {data.sheet_names.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
      )}
      {data.date_mode !== undefined && (
        <p className={s.help}>
          Original workbook date mode: {data.date_mode}. Date serials are not
          converted to guessed timestamps.
        </p>
      )}
      {data.paragraphs?.map((paragraph) => (
        <section key={paragraph.paragraph}>
          <h4>
            Paragraph {paragraph.paragraph}
            {paragraph.table
              ? " · table " +
                paragraph.table +
                ", row " +
                paragraph.row +
                ", column " +
                paragraph.column
              : ""}
          </h4>
          <p className={s.sourceText}>
            {paragraph.text || "Empty source paragraph"}
          </p>
          {paragraph.has_tracked_changes && (
            <p className={s.help}>
              Tracked changes are present. Deleted text is separate:{" "}
              {paragraph.deleted_text?.join(" · ") ||
                "No deleted text in this paragraph"}
              .
            </p>
          )}
          <InspectButton
            anchor={anchor("document_paragraph", {
              paragraph: paragraph.paragraph,
            })}
            onInspect={onInspect}
          />
        </section>
      ))}
      {data.pages?.map((page) => (
        <section key={page.page}>
          <h4>Page {page.page}</h4>
          <p className={s.sourceText}>
            {page.preview_text ||
              "No extracted text. Inspect the original page; image-only content is not OCR."}
          </p>
          <p className={s.help}>
            {page.character_count} extracted characters; this preview is limited
            to 1,000. Inspect the exact page for the full extraction and
            original context.
          </p>
          <div className={s.actions}>
            <InspectButton
              anchor={anchor("document_page", { page: page.page })}
              onInspect={onInspect}
            />
            <a
              className="button"
              target="_blank"
              rel="noreferrer"
              href={sourceUrl(asset, snapshotId) + "#page=" + page.page}
            >
              Open original page
            </a>
          </div>
        </section>
      ))}
      {data.cells && (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Cell</th>
                <th scope="col">Stored / cached value</th>
                <th scope="col">Source type</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.cells.map((cell) => (
                <tr key={cell.row + ":" + cell.column}>
                  <th scope="row">{coordinate(cell.row, cell.column)}</th>
                  <td>
                    {cell.raw_value === null
                      ? "Non-finite value withheld"
                      : String(cell.raw_value)}
                  </td>
                  <td>
                    Type {cell.cell_type} · style {cell.style_index}
                  </td>
                  <td>
                    <InspectButton
                      anchor={anchor("workbook_cell", {
                        sheet: data.selected_sheet,
                        cell: coordinate(cell.row, cell.column),
                      })}
                      onInspect={onInspect}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.variables && (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Variable</th>
                <th scope="col">Shape</th>
                <th scope="col">MATLAB class</th>
              </tr>
            </thead>
            <tbody>
              {data.variables.map((variable) => (
                <tr key={variable.name}>
                  <th scope="row">{variable.name}</th>
                  <td>{variable.shape.join(" × ")}</td>
                  <td>{variable.matlab_class}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.help}>
            Metadata only. No MATLAB code is executed; units, calibration and
            independent samples remain unresolved.
          </p>
        </div>
      )}
      {data.members && (
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Member</th>
                <th scope="col">Reported bytes</th>
                <th scope="col">Kind</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((member) => (
                <tr key={member.name}>
                  <th scope="row">{member.name}</th>
                  <td>{member.byte_size}</td>
                  <td>{member.directory ? "Directory" : "File"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={s.help}>
            Inventory only. Members are not extracted into the application or
            treated as experiments.
          </p>
        </div>
      )}
      {data.embedded_figures
        ?.filter((figure) =>
          ["image/png", "image/jpeg"].includes(figure.media_type),
        )
        .map((figure) => (
          <figure key={figure.member}>
            <img
              className={s.media}
              loading="lazy"
              src={
                sourceUrl(asset, snapshotId, "embedded-figure") +
                "&member=" +
                encodeURIComponent(figure.member)
              }
              alt={"Original embedded source figure " + figure.member}
            />
            <figcaption>
              {figure.member} · exact original image; no values are extracted or
              inferred.
              <InspectButton
                anchor={anchor("document_figure", {
                  member: figure.member,
                  member_sha256: figure.sha256,
                })}
                onInspect={onInspect}
              />
            </figcaption>
          </figure>
        ))}
      {total > 0 && (
        <div className={s.toolbar}>
          <span>
            {offset + 1}–{Math.min(offset + size, total)} of {total} source
            locations {result.loading ? "· Updating…" : ""}
          </span>
          <div className={s.actions}>
            <button
              className="button"
              disabled={!offset || result.loading}
              onClick={() => setOffset(Math.max(0, offset - size))}
            >
              Previous source locations
            </button>
            <button
              className="button"
              disabled={offset + size >= total || result.loading}
              onClick={() => setOffset(offset + size)}
            >
              Next source locations
            </button>
          </div>
        </div>
      )}
      <Limitations values={data.limitations} />
    </div>
  );
}

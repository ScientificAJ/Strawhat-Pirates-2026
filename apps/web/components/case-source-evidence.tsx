import { ArrowDownToLine } from "lucide-react";
import { SourceAnchor } from "../lib/workspace-storage";

export function CaseSourceEvidence({ anchors }: { anchors: SourceAnchor[] }) {
  if (!anchors.length) return null;
  return (
    <section className="case-source-evidence" aria-label="Pinned source rows">
      <h2>Pinned source rows</h2>
      {anchors.map((anchor) => (
        <details
          key={`${anchor.snapshot_id}-${anchor.source_sha256}-${anchor.source_row}`}
        >
          <summary>
            <span className="mono">{anchor.accession}</span> · Physical row{" "}
            {anchor.source_row}
            {anchor.line_end !== anchor.source_row ? `–${anchor.line_end}` : ""}
          </summary>
          <p className="field-help">
            {anchor.file_name} · Investigation v{anchor.investigation_version} ·
            File v{anchor.file_version}
          </p>
          <p className="field-help">
            Source role: {anchor.row_kind.replaceAll("_", " ")}
          </p>
          <p className="field-help">
            Mapping:{" "}
            <span className="mono">
              {anchor.adapter_id ?? "Not recorded in this backup"}
            </span>
          </p>
          <div className="table-scroll case-source-excerpt">
            <table>
              <thead>
                <tr>
                  <th scope="col">Original source column</th>
                  <th scope="col">Saved original text</th>
                </tr>
              </thead>
              <tbody>
                {anchor.raw_cells.map((cell, index) => (
                  <tr key={index}>
                    <th scope="row">
                      {anchor.source_columns[index] ||
                        `Unnamed source column ${index + 1}`}
                    </th>
                    <td>
                      {cell === "" ? (
                        <span className="muted">Empty cell</span>
                      ) : (
                        cell
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl>
            <dt>Source SHA-256</dt>
            <dd className="mono hash-value">{anchor.source_sha256}</dd>
            <dt>Frozen snapshot</dt>
            <dd className="mono hash-value">{anchor.snapshot_id}</dd>
          </dl>
          <a
            className="text-button"
            href={`/v1/assets/${anchor.source_sha256}/raw?snapshot_id=${anchor.snapshot_id}`}
          >
            <ArrowDownToLine size={14} />
            Download retained source
          </a>
        </details>
      ))}
    </section>
  );
}

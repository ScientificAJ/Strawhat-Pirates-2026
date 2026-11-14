"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  FileText,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  Asset,
  Catalog,
  Dossier,
  family,
  Investigation,
  SourceTable,
  useResource,
} from "../lib/api";
import { ErrorState, LoadingRows, Notice } from "./chrome";
import { ScientificRecordView } from "./scientific-records";
import { SupportingSource } from "./supporting-source";

export function InvestigationTable({
  items,
  selected = [],
  onSelect,
  compact = false,
  snapshotId,
}: {
  items: Investigation[];
  selected?: string[];
  onSelect?: (accession: string) => void;
  compact?: boolean;
  snapshotId?: string;
}) {
  return (
    <div className="table-scroll">
      <table
        className={`investigation-table ${compact ? "compact-table" : ""}`}
      >
        <thead>
          <tr>
            {onSelect && (
              <th className="checkbox-cell" scope="col">
                <span className="visually-hidden">Select for comparison</span>
              </th>
            )}
            <th scope="col">Investigation</th>
            <th scope="col">Research focus</th>
            {!compact && <th scope="col">Evidence state</th>}
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.accession}
              className={
                selected.includes(item.accession) ? "row-selected" : ""
              }
            >
              {onSelect && (
                <td className="checkbox-cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${item.acronym || item.title} for comparison`}
                    checked={selected.includes(item.accession)}
                    onChange={() => onSelect(item.accession)}
                  />
                </td>
              )}
              <td>
                <Link
                  className="investigation-title"
                  href={`/app/investigations/${item.accession}${snapshotId ? `?snapshot=${snapshotId}` : ""}`}
                >
                  {item.acronym || item.title}
                  <ArrowUpRight size={15} />
                </Link>
                <span className="investigation-description">
                  {item.acronym && item.title !== item.acronym
                    ? item.title
                    : item.objective ||
                      item.description ||
                      "Open the NASA source record for investigation details."}
                </span>
              </td>
              <td>
                <span className="focus-label">{family(item.accession)}</span>
              </td>
              {!compact && (
                <td>
                  <span className="status status-neutral">Catalog indexed</span>
                </td>
              )}
              <td className="source-cell">
                <span className="mono">{item.accession}</span>
                <span className="muted">Version {item.version}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Explorer({
  catalog,
  loading,
  error,
  retry,
  selected,
  onSelect,
  initialQuery,
}: {
  catalog: Catalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
  selected: string[];
  onSelect: (id: string) => void;
  initialQuery: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [activeFamily, setActiveFamily] = useState("All investigations");
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  const items = useMemo(
    () =>
      (catalog?.items ?? []).filter((item) => {
        const matchesQuery = [
          item.accession,
          item.title,
          item.acronym,
          item.description,
          item.objective,
          family(item.accession),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.trim().toLowerCase());
        return (
          matchesQuery &&
          (activeFamily === "All investigations" ||
            family(item.accession) === activeFamily)
        );
      }),
    [catalog, query, activeFamily],
  );
  const groups = [
    "All investigations",
    "Solid fuels and spread",
    "Droplets and cool flames",
    "Smoke and detection",
    "Gas flames and transport",
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Investigations</h1>
          <p>Find the evidence behind combustion in reduced gravity.</p>
        </div>
        <a
          className="button"
          href="https://psi.nasa.gov/physci/repo"
          target="_blank"
          rel="noreferrer"
        >
          NASA repository
          <ArrowUpRight size={16} />
        </a>
      </div>
      <div className="explorer-toolbar">
        <label className="search-input">
          <Search size={19} />
          <span className="visually-hidden">Search investigations</span>
          <input
            value={query}
            placeholder="Search by investigation, material, or research question"
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={16} />
            </button>
          )}
        </label>
        <span className="result-count" aria-live="polite">
          {catalog
            ? `${items.length} investigations`
            : "Loading investigations"}
        </span>
      </div>
      <div className="explorer-layout">
        <aside className="filter-panel" aria-label="Investigation filters">
          <h2>Research focus</h2>
          {groups.map((group) => {
            const count =
              group === "All investigations"
                ? catalog?.items.length
                : catalog?.items.filter(
                    (item) => family(item.accession) === group,
                  ).length;
            return (
              <button
                key={group}
                className={`filter-item ${activeFamily === group ? "filter-selected" : ""}`}
                aria-pressed={activeFamily === group}
                onClick={() => setActiveFamily(group)}
              >
                <span>{group}</span>
                <span className="filter-count">{count ?? "—"}</span>
              </button>
            );
          })}
          <div className="filter-note">
            <FileText size={18} />
            <p>
              Start with catalog records. Open a source to inspect the
              measurements and their limitations.
            </p>
          </div>
        </aside>
        <section
          className="data-surface"
          aria-label="Investigation results"
          aria-busy={loading}
        >
          <div className="surface-heading">
            <span>NASA combustion evidence</span>
            <span className="muted">Sorted by accession</span>
          </div>
          {error ? (
            <ErrorState message={error} retry={retry} />
          ) : loading && !catalog ? (
            <LoadingRows />
          ) : items.length ? (
            <InvestigationTable
              items={items}
              selected={selected}
              onSelect={onSelect}
            />
          ) : (
            <div className="empty-state">
              <Search size={28} />
              <h2>No investigations match these filters</h2>
              <p>
                Try a broader phrase or include another research focus. No
                filters will be changed automatically.
              </p>
              <button
                className="button"
                onClick={() => {
                  setQuery("");
                  setActiveFamily("All investigations");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </section>
      </div>
      {selected.length > 0 && (
        <div className="selection-tray">
          <span>
            <Check size={17} />
            {selected.length}{" "}
            {selected.length === 1 ? "investigation" : "investigations"}{" "}
            selected
          </span>
          <Link
            className="button button-primary button-small"
            href="/app/compare"
          >
            Compare selections
            <ArrowRight size={15} />
          </Link>
        </div>
      )}
    </>
  );
}

export function RawTable({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId?: string;
}) {
  const [view, setView] = useState<"original" | "records" | "quality">(
    "original",
  );
  return (
    <div className="source-inspector">
      <div
        className="source-view-buttons"
        role="group"
        aria-label="Source inspection views"
      >
        <button
          className="button button-small"
          aria-pressed={view === "original"}
          onClick={() => setView("original")}
        >
          Original
        </button>
        <button
          className="button button-small"
          aria-pressed={view === "records"}
          onClick={() => setView("records")}
        >
          Scientific records
        </button>
        <button
          className="button button-small"
          aria-pressed={view === "quality"}
          onClick={() => setView("quality")}
        >
          Quality
        </button>
      </div>
      {view === "original" ? (
        <OriginalTable asset={asset} snapshotId={snapshotId} />
      ) : (
        <ScientificRecordView
          asset={asset}
          snapshotId={snapshotId}
          quality={view === "quality"}
          onOriginal={() => setView("original")}
        />
      )}
    </div>
  );
}

function OriginalTable({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId?: string;
}) {
  const [offset, setOffset] = useState(0);
  const query = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (snapshotId) query.set("snapshot_id", snapshotId);
  const table = useResource<SourceTable>(
    `/v1/assets/${asset.sha256}/table?${query}`,
  );
  return (
    <section
      className="source-table-panel"
      aria-label="Original source table"
      aria-busy={table.loading}
    >
      <div className="section-heading">
        <div>
          <h2>Original source table</h2>
          <p>{asset.file_name}</p>
        </div>
        <span className="status status-neutral">Raw source values</span>
      </div>
      {table.error ? (
        <ErrorState message={table.error} retry={table.reload} />
      ) : !table.data ? (
        <LoadingRows label="Opening source rows" />
      ) : (
        <>
          <div className="source-metadata">
            <span>{table.data.encoding} encoding</span>
            <span>{table.data.total_rows} source records</span>
            <span className="mono" title={asset.sha256}>
              SHA-256 {asset.sha256.slice(0, 12)}…
            </span>
          </div>
          <div className="table-scroll raw-table">
            <table>
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  {table.data.headers.map((header, index) => (
                    <th key={index} scope="col">
                      {header || `Unnamed column ${index + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.data.rows.map((row) => (
                  <tr key={row.row_number}>
                    <th scope="row" className="mono">
                      {row.row_number}
                    </th>
                    {row.cells.map((cell, index) => (
                      <td key={index}>
                        {cell === "" ? (
                          <span className="muted">Empty cell</span>
                        ) : (
                          cell
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-pagination">
            <span>
              Records {table.data.offset + 1}–
              {Math.min(
                table.data.offset + table.data.rows.length,
                table.data.total_rows,
              )}{" "}
              of {table.data.total_rows}
              {table.loading ? " · Updating…" : ""}
            </span>
            <div>
              <button
                className="button button-small"
                disabled={offset === 0 || table.loading}
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                Previous
              </button>
              <button
                className="button button-small"
                disabled={offset + 30 >= table.data.total_rows || table.loading}
                onClick={() => setOffset(offset + 30)}
              >
                Next
              </button>
            </div>
          </div>
          {table.data.caveats.length > 0 && (
            <Notice kind="caution">
              <strong>Interpretation notes</strong>
              <ul>
                {table.data.caveats.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Notice>
          )}
        </>
      )}
    </section>
  );
}

export function InvestigationDetail({
  accession,
  selected,
  onSelect,
  onSave,
}: {
  accession: string;
  selected: string[];
  onSelect: (id: string) => void;
  onSave: (id: string) => void;
}) {
  const result = useResource<Dossier>(
    `/v1/investigations/${encodeURIComponent(accession)}`,
  );
  const [tableAsset, setTableAsset] = useState<Asset | null>(null);
  useEffect(() => {
    setTableAsset(null);
  }, [accession]);
  if (result.error)
    return <ErrorState message={result.error} retry={result.reload} />;
  if (!result.data || result.loading)
    return <LoadingRows label="Opening investigation evidence" />;
  const item = result.data;
  return (
    <>
      <Link className="back-link" href="/app/investigations">
        <ArrowLeft size={16} />
        All investigations
      </Link>
      <div className="page-heading dossier-heading">
        <div>
          <div className="record-meta">
            <span className="mono">{item.accession}</span>
            <span>Version {item.version}</span>
            <span>{family(item.accession)}</span>
          </div>
          <h1>{item.acronym || item.title}</h1>
          {item.title !== item.acronym && <p>{item.title}</p>}
        </div>
        <div className="button-row">
          <button className="button" onClick={() => onSelect(item.accession)}>
            {selected.includes(item.accession) ? (
              <>
                <Check size={16} />
                Selected
              </>
            ) : (
              "Add to comparison"
            )}
          </button>
          <button
            className="button button-primary"
            onClick={() => onSave(item.accession)}
          >
            Save to a case
          </button>
        </div>
      </div>
      <div className="dossier-grid">
        <section className="reading-surface">
          <h2>Research objective</h2>
          <p className="reading-text">
            {item.objective ||
              item.description ||
              "This field is not reported in the selected catalog record. Inspect the NASA record and retained methods before drawing a conclusion."}
          </p>
          {item.approach && (
            <>
              <h2>Experimental approach</h2>
              <p className="reading-text">{item.approach}</p>
            </>
          )}
          <h2>Findings and interpretation</h2>
          <p className="reading-text">
            The catalog describes this investigation. Specific findings require
            the linked measurements, methods, and source publications.
          </p>
          {item.quality_notes.length > 0 && (
            <Notice kind="caution">
              <strong>Source qualifications</strong>
              <ul>
                {item.quality_notes.map((note, index) => (
                  <li key={index}>{note}</li>
                ))}
              </ul>
            </Notice>
          )}
        </section>
        <aside className="source-identity">
          <h2>Source identity</h2>
          <dl>
            <dt>Repository</dt>
            <dd>NASA PSI</dd>
            <dt>Accession</dt>
            <dd className="mono">{item.accession}</dd>
            <dt>Investigation version</dt>
            <dd>{item.version}</dd>
            <dt>DOI</dt>
            <dd>
              {item.doi ? (
                <a
                  href={`https://doi.org/${item.doi}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.doi}
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                "Not reported"
              )}
            </dd>
            <dt>License</dt>
            <dd>{item.license || "Unresolved — inspect source rights"}</dd>
            <dt>Platform</dt>
            <dd>{item.platform || "Not reported"}</dd>
          </dl>
          <a
            className="button"
            href={item.source_url}
            target="_blank"
            rel="noreferrer"
          >
            Open NASA record
            <ArrowUpRight size={15} />
          </a>
        </aside>
      </div>
      <section className="data-surface source-list">
        <div className="section-heading">
          <div>
            <h2>Retained source files</h2>
            <p>
              Original bytes and identifiers remain linked to every analysis.
            </p>
          </div>
          <span className="muted">
            {item.assets.length} {item.assets.length === 1 ? "file" : "files"}
          </span>
        </div>
        {item.assets.length ? (
          item.assets.map((asset) => (
            <div className="asset-row" key={asset.sha256}>
              <FileText size={21} />
              <div className="asset-description">
                <strong>{asset.file_name}</strong>
                <span>
                  {asset.media_type} · File version {asset.file_version} ·{" "}
                  {new Intl.NumberFormat().format(asset.byte_size)} bytes
                </span>
              </div>
              {asset.media_type.includes("csv") ||
              asset.file_name.toLowerCase().endsWith(".csv") ? (
                <button
                  className="button button-small"
                  onClick={() => setTableAsset(asset)}
                >
                  Inspect table
                  <ArrowRight size={15} />
                </button>
              ) : (
                <button
                  className="button button-small"
                  onClick={() => setTableAsset(asset)}
                >
                  Inspect source
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          ))
        ) : (
          <div className="empty-state compact-empty">
            <p>
              No source files have been retained for this investigation in this
              snapshot. The NASA record remains available.
            </p>
          </div>
        )}
      </section>
      {tableAsset &&
        (tableAsset.file_name.toLowerCase().endsWith(".csv") ? (
          <RawTable
            key={tableAsset.sha256}
            asset={tableAsset}
            snapshotId={item.snapshot_id}
          />
        ) : (
          <SupportingSource
            key={tableAsset.sha256}
            asset={tableAsset}
            snapshotId={item.snapshot_id}
          />
        ))}
    </>
  );
}

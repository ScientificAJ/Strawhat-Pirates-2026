"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpen } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Asset,
  Dossier,
  ScientificField,
  ScientificRecord,
  useResource,
} from "../lib/api";
import { parseRunIdentity, RecordHit, runHref } from "../lib/discovery-helpers";
import { saveDocument } from "../lib/workspace-documents";
import { useResearchContext } from "../lib/research-context";
import { ErrorState, LoadingRows } from "./chrome";
import { sourceRole } from "./scientific-records";
import { ScientificRecordView } from "./scientific-records";
import { SupportingSource } from "./supporting-source";
import { FlexAnalysis } from "./laboratory";
import { RawTable } from "./catalog";
import { useWorkspacePreferences } from "../lib/workspace-preferences";
import { RetainedFormatView } from "./retained-format-view";
import { InvestigationWatch } from "./investigation-watch";
import { SimulationLauncher } from "./simulation-launcher";
import {
  Anchor,
  Empty,
  errorMessage,
  human,
  InspectButton,
  Limitations,
  post,
  sourceUrl,
  SourceInspector,
  useQuery,
} from "./workbench-common";
import s from "./workbench.module.css";
import journey from "./research-journey.module.css";

type DeepDossier = Dossier & {
  source_fields: Record<
    string,
    { value: unknown; anchor: Anchor; scientific_role: string }
  >;
  coverage: {
    metadata: string;
    manifest: string;
    acquired_assets: number;
    row_roles: Record<string, number>;
    model_readiness: string;
    calibration_status: string;
  };
  findings: null;
  findings_status: string;
};
export function ActualThumbnail({
  accession,
  snapshotId,
}: {
  accession: string;
  snapshotId: string;
}) {
  const details = useResource<Dossier>(
    "/v1/investigations/" + accession + "?snapshot_id=" + snapshotId,
  );
  const image = details.data?.assets.find(
    (asset) =>
      ["image/jpeg", "image/png"].includes(asset.media_type) &&
      asset.license === "CC0-1.0",
  );
  return image ? (
    <img
      className={s.thumb}
      src={sourceUrl(image, snapshotId, "media/preview")}
      alt={
        "Authentic NASA source example from " +
        accession +
        "; not a calibrated measurement"
      }
      loading="lazy"
    />
  ) : null;
}
function OriginalMedia({
  asset,
  snapshotId,
}: {
  asset: Asset;
  snapshotId: string;
}) {
  if (asset.license !== "CC0-1.0")
    return (
      <Empty>
        The retained source has no confirmed redistribution permission. Inspect
        the publisher record.
      </Empty>
    );
  if (asset.media_type.startsWith("video/"))
    return (
      <div>
        <video
          controls
          preload="metadata"
          className={s.media}
          src={sourceUrl(asset, snapshotId, "media/preview")}
          aria-label={asset.file_name}
        >
          <a href={asset.source_url}>Open original video</a>
        </video>
        <p className={s.help}>
          Starts paused. The source camera clock is not an inferred experimental
          clock. This investigation example is not automatically associated with
          the selected record.
        </p>
      </div>
    );
  if (asset.media_type.startsWith("image/"))
    return (
      <figure>
        <img
          className={s.media}
          src={sourceUrl(asset, snapshotId, "media/preview")}
          alt={"Original source image: " + asset.file_name}
        />
        <figcaption className={s.help}>
          Original source image. Spatial calibration and run association require
          their own evidence.
        </figcaption>
      </figure>
    );
  return null;
}
async function studioDraft(
  question: string,
  snapshotId: string,
  accession: string,
  anchors: Anchor[] = [],
  depth = "technical",
) {
  return saveDocument({
    kind: "studio_intent",
    title: question.slice(0, 100),
    snapshot_id: snapshotId,
    data: {
      question,
      snapshot_id: snapshotId,
      investigations: [accession],
      anchors,
      summary_depth: depth,
      auto_submit: true,
    },
  });
}

export function InvestigationDossier({
  accession,
  snapshotId,
  onSave,
}: {
  accession: string;
  snapshotId: string;
  onSave?: (accession: string) => void;
}) {
  const preferences = useWorkspacePreferences();
  const router = useRouter();
  const { context, updateContext } = useResearchContext();
  const result = useResource<DeepDossier>(
    "/v1/investigations/" + accession + "/dossier?snapshot_id=" + snapshotId,
  );
  const data = result.data;
  useEffect(() => {
    if (!data || !context) return;
    updateContext({
      snapshot_id: snapshotId,
      investigations: [accession],
      selected_sources: [],
      selected_evidence: [],
    });
  }, [data, accession, snapshotId, context?.snapshot_id, updateContext]);
  const sections = ["overview", "runs", "findings", "methods", "sources"];
  const [section, setSection] = useState("overview");
  const [depth, setDepth] = useState("brief");
  useEffect(() => {
    setDepth(preferences.summary_depth);
  }, [preferences.summary_depth]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [sourceId, setSourceId] = useState("");
  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get("section");
    if (selected && sections.includes(selected)) setSection(selected);
    // The tab reads the route once; subsequent changes are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function tab(value: string) {
    setSection(value);
    const url = new URL(window.location.href);
    url.searchParams.set("section", value);
    url.searchParams.set("snapshot", snapshotId);
    window.history.replaceState(null, "", url);
  }
  async function ask(question?: string) {
    try {
      updateContext({ investigations: [accession] });
      const intent = await studioDraft(
        question ??
          "Explain " +
            accession +
            " at " +
            depth +
            " depth, distinguishing objectives, available findings, methods and applicability. Cite the selected source version.",
        snapshotId,
        accession,
        Object.values(data?.source_fields ?? {}).map((value) => value.anchor),
        depth,
      );
      router.push("/app/agent?intent=" + intent.id);
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  function comparison() {
    router.push(`/app/compare?ids=${accession}&snapshot=${snapshotId}`);
  }
  if (result.error)
    return <ErrorState message={result.error} retry={result.reload} />;
  if (!data) return <LoadingRows label="Opening the investigation" />;
  const table = data.assets.find((asset) => asset.file_name.endsWith(".csv"));
  const media = data.assets.find(
    (asset) =>
      asset.media_type.startsWith("image/") ||
      asset.media_type.startsWith("video/"),
  );
  const selected = data.assets.find((asset) => asset.id === sourceId);
  const fields =
    section === "methods"
      ? ["approach", "experimentHardware", "flightProgram", "missionName"]
      : depth === "brief"
        ? ["objective", "description"]
        : [
            "objective",
            "description",
            "approach",
            "hypothesis",
            "researchImpacts",
          ];
  return (
    <section className={s.workbench}>
      <Link
        className="text-button"
        href={"/app/investigations?snapshot=" + snapshotId}
      >
        <ArrowLeft size={16} /> All investigations
      </Link>
      <div className="page-heading">
        <div>
          <h1>{data.acronym || data.title}</h1>
          <p>{data.title}</p>
        </div>
        <div className={s.actions}>
          <button className="button button-primary" onClick={() => void ask()}>
            Ask about this research <ArrowRight size={16} />
          </button>
          <button className="button" onClick={() => void comparison()}>
            Compare with another investigation
          </button>
          {onSave && (
            <button className="button" onClick={() => onSave(accession)}>
              Save investigation
            </button>
          )}
        </div>
      </div>
      <div className={journey.nextSteps}>
        <span className={s.help}>
          {data.accession} · {data.platform || "NASA combustion research"}
        </span>
        <a
          className="text-button"
          href={data.source_url}
          target="_blank"
          rel="noreferrer"
        >
          NASA source record <ArrowRight size={15} />
        </a>
      </div>
      <div
        className={s.tabs}
        role="tablist"
        aria-label="Investigation dossier sections"
      >
        {sections.map((value) => (
          <button
            key={value}
            role="tab"
            aria-selected={section === value}
            onClick={() => tab(value)}
          >
            {
              {
                overview: "Overview",
                runs: "Explore data",
                findings: "Interpret the evidence",
                methods: "Methods and hardware",
                sources: "Sources",
              }[value]
            }
          </button>
        ))}
      </div>
      {problem && (
        <p role="alert" className={s.error}>
          {problem}
        </p>
      )}
      {message && (
        <p role="status" className={s.success}>
          {message}
        </p>
      )}
      {["overview", "methods"].includes(section) && (
        <div className={s.dossier}>
          <div className={s.stack}>
            <details className={journey.sourceDetails}>
              <summary>Reading detail</summary>
              <div className={s.actions} aria-label="Summary depth">
                {["brief", "technical", "methods"].map((value) => (
                  <button
                    className="button"
                    key={value}
                    aria-pressed={depth === value}
                    onClick={() => {
                      setDepth(value);
                      if (value === "methods") tab("methods");
                    }}
                  >
                    {human(value)}
                  </button>
                ))}
              </div>
            </details>
            {fields.map((name) => {
              const field = data.source_fields[name];
              return field ? (
                <section key={name} className={journey.researchSummary}>
                  <h2>
                    {{
                      objective: "What the researchers wanted to understand",
                      description: "About the investigation",
                      approach: "How the research was carried out",
                      hypothesis: "Research hypothesis",
                      researchImpacts: "Potential applications",
                      experimentHardware: "Experimental hardware",
                      flightProgram: "Flight program",
                      missionName: "Mission",
                    }[name] ?? human(name)}
                  </h2>
                  <div className={s.prose}>
                    {typeof field.value === "string"
                      ? field.value
                      : JSON.stringify(field.value, null, 2)}
                  </div>
                  <InspectButton anchor={field.anchor} onInspect={setAnchor} />
                </section>
              ) : null;
            })}
          </div>
          <aside className={s.stack}>
            {media ? (
              <OriginalMedia asset={media} snapshotId={snapshotId} />
            ) : null}
            <section className={s.surface}>
              <h2>Work with this investigation</h2>
              <p className={s.help}>
                {data.coverage.acquired_assets > 0
                  ? `${data.coverage.acquired_assets} source files are available to inspect.`
                  : "The NASA catalog describes this investigation. Its experimental files are not yet available here."}
              </p>
              <div className={s.stack}>
                <button className="button" onClick={() => tab("runs")}>
                  Explore data and conditions <ArrowRight size={15} />
                </button>
                <button className="button" onClick={() => tab("sources")}>
                  Read original sources <BookOpen size={15} />
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void ask(
                      `What does ${accession} tell us about fire-safety controls or equipment? Identify relevant source evidence, experimental conditions and what remains untested.`,
                    )
                  }
                >
                  Explore fire-safety relevance <ArrowRight size={15} />
                </button>
                <button
                  className="text-button"
                  onClick={() =>
                    void ask(
                      `Which possible Earth applications are described for ${accession}? Distinguish documented applications from research hypotheses and explain the conditions that would need to change.`,
                    )
                  }
                >
                  Explore possible Earth applications <ArrowRight size={15} />
                </button>
              </div>
            </section>
            <details className={journey.sourceDetails}>
              <summary>Source coverage and scientific readiness</summary>
              <dl className={s.facts}>
                <div>
                  <dt>Hardware</dt>
                  <dd>{data.hardware || "Not reported"}</dd>
                </div>
                <div>
                  <dt>DOI</dt>
                  <dd>{data.doi || "Not reported"}</dd>
                </div>
                <div>
                  <dt>Calibration evidence</dt>
                  <dd>{human(data.coverage.calibration_status)}</dd>
                </div>
                <div>
                  <dt>Predictive modeling</dt>
                  <dd>{human(data.coverage.model_readiness)}</dd>
                </div>
              </dl>
              <Limitations values={data.quality_notes ?? []} />
              <p>Investigation version {data.version}</p>
              <code>{snapshotId}</code>
            </details>
          </aside>
        </div>
      )}
      {section === "methods" && (
        <SimulationLauncher
          key={`${accession}:${snapshotId}`}
          accession={accession}
          snapshotId={snapshotId}
        />
      )}
      {section === "runs" && (
        <>
          <div className={s.notice}>
            <h2>Explore the experimental records</h2>
            <p>
              Read the reported conditions and observations, then open a record
              for its measurements and sources. Records may describe tests,
              sessions or summaries; they are not automatically independent
              experiments.
            </p>
            <Link
              className="button"
              href={
                "/app/investigations?entity=records&accession=" +
                accession +
                "&snapshot=" +
                snapshotId
              }
            >
              Filter this investigation&apos;s records <ArrowRight size={16} />
            </Link>
          </div>
          <div className={s.actions}>
            {Object.entries(data.coverage.row_roles).map(([role, count]) => (
              <span className={s.chip} key={role}>
                {sourceRole(role)}: {count}
              </span>
            ))}
          </div>
          <details className={journey.advanced}>
            <summary>Which conditions and measurements are available?</summary>
            <SourceFactorMatrix
              accession={accession}
              snapshotId={snapshotId}
              onInspect={setAnchor}
            />
          </details>
          {table && (
            <Link
              className="button button-primary"
              href={`/app/lab/data/${table.sha256}?snapshot=${snapshotId}`}
            >
              Analyze or export this dataset <ArrowRight size={16} />
            </Link>
          )}
          {table ? (
            <ScientificRecordView
              asset={table}
              snapshotId={snapshotId}
              quality={false}
              onOriginal={() => {
                setSourceId(table.id);
                tab("sources");
              }}
            />
          ) : (
            <Empty>
              An experimental table is not available here yet. Open Sources to
              read the available documents or visit the NASA record for
              additional data.
            </Empty>
          )}
        </>
      )}
      {section === "findings" && (
        <>
          {accession === "PSI-69" && (
            <FlexAnalysis
              snapshotId={snapshotId}
              onSave={(id) => onSave?.(id)}
            />
          )}
          <div className={s.surface}>
            <h2>What can the evidence tell us?</h2>
            <p className={s.prose}>
              The research objective explains what the team set out to study. To
              understand what they found, follow the source reports and
              measurements. Ask for a cited interpretation, or inspect the
              original data yourself.
            </p>
            <div className={journey.nextSteps}>
              <button
                className="button button-primary"
                onClick={() => void ask()}
              >
                Explain the available evidence <ArrowRight size={16} />
              </button>
              <button className="button" onClick={() => tab("sources")}>
                Read sources
              </button>
            </div>
          </div>
          {data.source_fields.researchImpacts && (
            <section>
              <h2>Reported prospective impacts</h2>
              <p className={s.prose}>
                {String(data.source_fields.researchImpacts.value)}
              </p>
              <InspectButton
                anchor={data.source_fields.researchImpacts.anchor}
                onInspect={setAnchor}
              />
            </section>
          )}
        </>
      )}
      {section === "sources" && (
        <>
          <div className={s.toolbar}>
            <h2>Original sources</h2>
          </div>
          <InvestigationWatch
            key={accession}
            accession={accession}
            snapshotId={snapshotId}
            version={data.version}
            assetIds={data.assets.map((asset) => asset.id)}
          />
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Source file</th>
                  <th>Version and rights</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.assets.map((asset) => (
                  <tr key={asset.id} className="asset-row">
                    <td>
                      {asset.file_name}
                      <small>{asset.media_type}</small>
                    </td>
                    <td>
                      File v{asset.file_version}
                      <small>{asset.license ?? "Rights unresolved"}</small>
                      <details className={journey.sourceDetails}>
                        <summary>Source identifier</summary>
                        <code>{asset.sha256}</code>
                      </details>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSourceId(asset.id)}
                      >
                        <BookOpen size={16} /> Inspect source
                      </button>
                      {asset.license === "CC0-1.0" && (
                        <a
                          className="text-button"
                          href={sourceUrl(asset, snapshotId)}
                        >
                          Download original
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selected && (
            <section className={s.surface}>
              <h2>{selected.file_name}</h2>
              {selected.file_name.endsWith(".csv") ? (
                <RawTable asset={selected} snapshotId={snapshotId} />
              ) : selected.media_type.startsWith("image/") ||
                selected.media_type.startsWith("video/") ? (
                <OriginalMedia asset={selected} snapshotId={snapshotId} />
              ) : /\.(pdf|docx|rtf|xls|mat|zip|tar|tgz|tar\.gz)$/i.test(
                  selected.file_name,
                ) ? (
                <RetainedFormatView
                  key={selected.id}
                  asset={selected}
                  snapshotId={snapshotId}
                  onInspect={setAnchor}
                />
              ) : (
                <SupportingSource asset={selected} snapshotId={snapshotId} />
              )}
            </section>
          )}
        </>
      )}
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </section>
  );
}

type FrozenSelection = {
  resolved_sources: {
    asset: Asset;
    records: ScientificRecord[];
    limitations: string[];
    refusals: string[];
  }[];
  independent_run_count: null;
};
export function RunWorkbench({
  id,
  snapshotId,
}: {
  id: string;
  snapshotId: string;
}) {
  const preferences = useWorkspacePreferences();
  const router = useRouter();
  const identity = useMemo(() => {
    try {
      return { value: parseRunIdentity(id), error: "" };
    } catch (reason) {
      return { value: null, error: errorMessage(reason) };
    }
  }, [id]);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const { context, updateContext } = useResearchContext();
  const value = identity.value;
  const result = useQuery<FrozenSelection>(
    "/v1/cohorts/resolve",
    {
      snapshot_id: snapshotId,
      selections: value
        ? [{ asset_sha256: value[2], source_rows: [value[3]] }]
        : [],
    },
    Boolean(value),
  );
  const dossier = useResource<Dossier>(
    value
      ? "/v1/investigations/" + value[0] + "?snapshot_id=" + snapshotId
      : null,
  );
  const source = result.data?.resolved_sources[0];
  const record = source?.records[0];
  const media = dossier.data?.assets.find(
    (asset) =>
      asset.media_type.startsWith("video/") ||
      asset.media_type.startsWith("image/"),
  );
  useEffect(() => {
    if (
      !value ||
      !source ||
      !record ||
      !context ||
      source.asset.id !== value[1] ||
      source.asset.accession !== value[0]
    )
      return;
    updateContext({
      snapshot_id: snapshotId,
      investigations: [value[0]],
      selected_sources: [
        {
          asset_sha256: value[2],
          accession: value[0],
          asset_id: value[1],
          source_rows: [value[3]],
          columns: [],
        },
      ],
      selected_evidence: [
        {
          snapshot_id: snapshotId,
          source_sha256: value[2],
          accession: value[0],
          asset_id: value[1],
          kind: "table_cell",
          source_kind: "psi",
          source_row: value[3],
          column: 0,
        },
      ],
    });
  }, [value, source, record, snapshotId, context?.snapshot_id, updateContext]);
  if (identity.error)
    return (
      <Empty>
        <h1>Source record unavailable</h1>
        <p>{identity.error}</p>
        <Link href="/app/investigations?entity=records">
          Return to record discovery
        </Link>
      </Empty>
    );
  if (result.error)
    return <ErrorState message={result.error} retry={result.reload} />;
  if (!source || !record || !value)
    return <LoadingRows label="Resolving the frozen source record" />;
  if (source.asset.id !== value[1] || source.asset.accession !== value[0])
    return (
      <Empty>
        This source identity does not match the linked investigation. Reopen the
        exact record from discovery.
      </Empty>
    );
  const sourceAnchor = (column: number): Anchor => ({
    snapshot_id: snapshotId,
    accession: source.asset.accession,
    investigation_version: source.asset.investigation_version,
    source_sha256: source.asset.sha256,
    asset_id: source.asset.id,
    kind: "table_cell",
    source_row: record.source_row,
    column,
  });
  async function saveNote() {
    try {
      await saveDocument({
        kind: "note",
        title: "Source-record note · " + value?.[0],
        snapshot_id: snapshotId,
        data: {
          note,
          source_anchor: sourceAnchor(0),
          source_record: record,
          status: "personal_annotation",
        },
      });
      setMessage("Personal note saved against this exact source record.");
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  return (
    <section className={s.workbench}>
      <Link
        className="text-button"
        href={
          "/app/investigations/" +
          value[0] +
          "?section=runs&snapshot=" +
          snapshotId
        }
      >
        <ArrowLeft size={16} /> Parent investigation
      </Link>
      <div className="page-heading">
        <div>
          <h1>
            {value[0]} · source record{" "}
            {record.raw_cells[1] || record.source_row}
          </h1>
          <p>
            {sourceRole(record.row_kind)} · physical source line{" "}
            {record.source_row}
            {record.line_end !== record.source_row ? "–" + record.line_end : ""}
          </p>
        </div>
      </div>
      <details className={journey.sourceDetails}>
        <summary>Source identity and version</summary>
        <p>
          {source.asset.file_name} · file version {source.asset.file_version}
        </p>
        <code>{snapshotId}</code>
      </details>
      <div className={journey.nextSteps}>
        <button
          className="button button-primary"
          onClick={() => {
            void studioDraft(
              `Explain this selected ${value[0]} source record at physical line ${record.source_row}. Describe what was reported, which quantities can be interpreted and what its evidence can support. Cite the exact source cells.`,
              snapshotId,
              value[0],
              record.fields.map((field) => sourceAnchor(field.column_index)),
            )
              .then((intent) => router.push(`/app/agent?intent=${intent.id}`))
              .catch((reason) => setProblem(errorMessage(reason)));
          }}
        >
          Ask about this record <ArrowRight size={16} />
        </button>
        <Link
          className="button"
          href={`/app/lab/data/${source.asset.sha256}?snapshot=${snapshotId}`}
        >
          Analyze or export data <ArrowRight size={16} />
        </Link>
      </div>
      <div className={s.chips}>
        {record.fields
          .filter((field) => field.quantity_kind && field.raw_text)
          .slice(0, 5)
          .map((field) => (
            <span className={s.chip} key={field.column_index}>
              {field.source_column}: {field.raw_text}
            </span>
          ))}
      </div>
      <div className={s.notice}>
        <p>
          The record is preserved at its original grain. A source event label is
          not automatically complete chemical extinction, and raw settings are
          not calibrated measurements.
        </p>
      </div>
      <div className={s.dossier}>
        <section>
          <h2>Conditions, specimen and observations</h2>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Source field</th>
                  <th>
                    {preferences.units === "si"
                      ? "Reviewed SI interpretation"
                      : "Original value"}
                  </th>
                  <th>
                    {preferences.units === "si"
                      ? "Original value"
                      : "Reviewed interpretation"}
                  </th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {record.fields.map((field) => (
                  <tr key={field.column_index}>
                    <td>
                      {field.source_column || "Unheaded source cell"}
                      <small>{human(field.source_value_kind)}</small>
                    </td>
                    <td>
                      {preferences.units === "si" ? (
                        <InterpretedValue field={field} />
                      ) : (
                        <OriginalValue field={field} />
                      )}
                    </td>
                    <td>
                      {preferences.units === "si" ? (
                        <OriginalValue field={field} />
                      ) : (
                        <InterpretedValue field={field} />
                      )}
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() =>
                          setAnchor(sourceAnchor(field.column_index))
                        }
                      >
                        Original cell
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Limitations values={[...source.limitations, ...source.refusals]} />
        </section>
        <aside className={s.stack}>
          {media && <OriginalMedia asset={media} snapshotId={snapshotId} />}
          <section className={s.surface}>
            <h2>Continue with this data</h2>
            <a className="button" href={sourceUrl(source.asset, snapshotId)}>
              Download original file
            </a>
            <p className={s.help}>
              Recorded geometry, clocks, calibration, endpoint and experimental
              dependence must support any analysis.
            </p>
            <Link
              className="button"
              href={
                "/app/lab/data/" +
                source.asset.sha256 +
                "?snapshot=" +
                snapshotId
              }
            >
              Analyze or export data <ArrowRight size={15} />
            </Link>
          </section>
          <label className={s.field}>
            Personal source note
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record a qualification, unresolved question, or interpretation."
            />
          </label>
          <button
            className="button"
            disabled={!note.trim()}
            onClick={() => void saveNote()}
          >
            Save anchored note
          </button>
          {message && (
            <p role="status" className={s.success}>
              {message}
            </p>
          )}
          {problem && (
            <p role="alert" className={s.error}>
              {problem}
            </p>
          )}
        </aside>
      </div>
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </section>
  );
}

function OriginalValue({ field }: { field: ScientificField }) {
  return (
    <>
      {field.raw_text || "Not reported"}
      {(field.basis || field.location) && (
        <small>
          {[field.basis, field.location].filter(Boolean).map(human).join(" · ")}
        </small>
      )}
    </>
  );
}
function InterpretedValue({ field }: { field: ScientificField }) {
  return (
    <>
      {field.canonical_value !== null ? (
        <>
          <span className={s.number}>
            {String(field.canonical_value)} {field.canonical_unit}
          </span>
          <small>Converted from the reported unit</small>
        </>
      ) : (
        human(field.missing_reason || field.status)
      )}
      {field.qualifier && <small>{human(field.qualifier)}</small>}
      {field.notes.length > 0 && (
        <details className={journey.sourceDetails}>
          <summary>Interpretation notes</summary>
          {field.notes.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
        </details>
      )}
    </>
  );
}

function SourceFactorMatrix({
  accession,
  snapshotId,
  onInspect,
}: {
  accession: string;
  snapshotId: string;
  onInspect: (anchor: Anchor) => void;
}) {
  const [rows, setRows] = useState<RecordHit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState("");
  const [all, setAll] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setProblem("");
    setRows([]);
    void (async () => {
      const found: RecordHit[] = [];
      let cursor: string | undefined;
      do {
        const page = await post<{
          items: RecordHit[];
          total: number;
          next_cursor: string | null;
        }>(
          "/v1/discovery/records",
          {
            snapshot_id: snapshotId,
            accessions: [accession],
            limit: 100,
            ...(cursor ? { cursor } : {}),
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        found.push(...page.items);
        setTotal(page.total);
        cursor = page.next_cursor ?? undefined;
      } while (cursor && found.length < 1000);
      if (!controller.signal.aborted) setRows(found);
    })()
      .catch((reason) => {
        if (!controller.signal.aborted) setProblem(errorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accession, snapshotId]);
  const factors = useMemo(() => {
    const result = new Map<
      string,
      {
        name: string;
        kind: string;
        values: Set<string>;
        missing: number;
        anchor: Anchor;
      }
    >();
    for (const row of rows)
      for (const field of row.record.fields) {
        if (!field.source_column) continue;
        const key = JSON.stringify([
          field.source_column,
          field.quantity_kind,
          field.basis,
          field.location,
        ]);
        const factor = result.get(key) ?? {
          name: field.source_column,
          kind: human(field.source_value_kind),
          values: new Set<string>(),
          missing: 0,
          anchor: {
            ...row.anchor,
            kind: "table_cell",
            column: field.column_index,
            asset_id: row.asset.id,
          },
        };
        if (field.missing_reason || !field.raw_text.trim()) factor.missing++;
        else factor.values.add(field.raw_text);
        result.set(key, factor);
      }
    return [...result.values()].sort((left, right) => {
      const order = [
        "condition",
        "setting",
        "measurement",
        "derived",
        "source reported",
      ];
      const rank = (value: string) => {
        const index = order.indexOf(value);
        return index < 0 ? order.length : index;
      };
      return rank(left.kind) - rank(right.kind);
    });
  }, [rows]);
  if (problem)
    return (
      <p className={s.error} role="alert">
        Source-factor summary unavailable: {problem}. The original table remains
        available below.
      </p>
    );
  return (
    <section className={s.stack}>
      <h2>Source factor matrix</h2>
      <p className={s.help}>
        Variation across {rows.length} of {total} retained source records in
        this snapshot. Source measurements, settings and conditions remain
        separate. Repeated values alone do not establish a protocol-controlled
        factor or independent replication.
      </p>
      {loading ? (
        <LoadingRows label="Reading source-factor coverage" />
      ) : (
        <>
          <div className={s.scroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th scope="col">Original field</th>
                  <th scope="col">Source role</th>
                  <th scope="col">Varied / constant in these records</th>
                  <th scope="col">Reported values</th>
                  <th scope="col">Unresolved</th>
                  <th scope="col">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {(all ? factors : factors.slice(0, 12)).map((factor, index) => (
                  <tr key={index}>
                    <th scope="row">{factor.name}</th>
                    <td>{factor.kind}</td>
                    <td>
                      {factor.values.size > 1
                        ? "Varied source values"
                        : factor.values.size === 1
                          ? "Constant reported value; held-constant protocol not established"
                          : "Not reported"}
                    </td>
                    <td>
                      {[...factor.values].slice(0, 6).join(" · ")}
                      {factor.values.size > 6
                        ? " · plus " +
                          (factor.values.size - 6) +
                          " other original values"
                        : ""}
                    </td>
                    <td>{factor.missing} unresolved cells</td>
                    <td>
                      <InspectButton
                        anchor={factor.anchor}
                        onInspect={onInspect}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {factors.length > 12 && (
            <button
              className="text-button"
              onClick={() => setAll((value) => !value)}
            >
              {all ? "Show fewer factors" : "Show all source fields"}
            </button>
          )}
          {rows.length < total && (
            <p className={s.help}>
              This summary is bounded to 1,000 source records. Use the record
              query or condition-coverage workbench for a larger scope.
            </p>
          )}
        </>
      )}
    </section>
  );
}

"use client";
import Link from "next/link";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Database,
  FlaskConical,
  Image,
  Code,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { Asset } from "../lib/api";
import {
  message,
  post,
  type FrozenInput,
  type ValidatedChart,
} from "../lib/laboratory-api";
import { readDocument, saveDocument } from "../lib/workspace-documents";
import { useResearchContext } from "../lib/research-context";
import { DatasetWorkbench } from "./dataset-workbench";
import { ExecutionWorkbench } from "./execution-workbench";
import { InputWorkbench } from "./input-workbench";
import { MediaWorkbench } from "./media-workbench";
import { ModelWorkbench } from "./model-workbench";
import { ScenarioWorkbench } from "./scenario-workbench";
import { DashboardWorkbench } from "./dashboard-workbench";
import styles from "./laboratory-workbench.module.css";

export function LaboratoryWorkbench({
  view = "start",
  entityId,
  snapshotId,
}: {
  view?: string;
  entityId?: string;
  snapshotId: string;
}) {
  const mode = view === "inputs" ? "uploads" : view;
  const [inputs, setInputs] = useState<FrozenInput[]>([]);
  const [chart, setChart] = useState<ValidatedChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const { context, updateContext } = useResearchContext();
  useEffect(() => {
    let active = true;
    void readDocument<{ items: FrozenInput[] }>(
      `laboratory-inputs-${snapshotId}`,
    )
      .then((doc) => {
        if (active && doc) setInputs(doc.data.items);
      })
      .catch((reason) => setError(message(reason)));
    void readDocument<{ spec: unknown }>(`laboratory-chart-${snapshotId}`)
      .then(async (doc) => {
        if (!doc) return;
        const spec = doc.data.spec;
        if (spec && typeof spec === "object") {
          const value = await post<ValidatedChart>(
            "query" in spec ? "/v1/charts/validate" : "/v1/charts/method",
            spec,
          );
          if (active) setChart(value);
        }
      })
      .catch(() => {
        if (active)
          setNotice(
            "The last chart could not be revalidated. Its saved source selection remains in local analyses.",
          );
      });
    return () => {
      active = false;
    };
  }, [snapshotId]);
  async function remember(input: FrozenInput) {
    setInputs((previous) => [
      ...previous.filter((item) => item.id !== input.id),
      input,
    ]);
    setNotice(`${input.name} is ready for analysis in Python & shell.`);
    try {
      const existing = await readDocument<{ items: FrozenInput[] }>(
        `laboratory-inputs-${snapshotId}`,
      );
      const items = [
        ...(existing?.data.items ?? []).filter((item) => item.id !== input.id),
        input,
      ];
      await saveDocument(
        {
          id: `laboratory-inputs-${snapshotId}`,
          kind: "analysis",
          title: "Selected data files",
          snapshot_id: snapshotId,
          data: { items },
        },
        existing?.revision ?? 0,
      );
      if (input.kind !== "public" && input.sha256) {
        const prior =
          context?.snapshot_id === snapshotId
            ? (context.selected_private_inputs ?? [])
            : [];
        const source =
          input.kind === "upload"
            ? {
                upload_id: input.id,
                expected_sha256: input.sha256,
                consent_to_model: false,
              }
            : {
                source_job_id: input.id,
                expected_sha256: input.sha256,
                consent_to_model: false,
              };
        updateContext({
          snapshot_id: snapshotId,
          selected_private_inputs: [
            ...prior.filter(
              (item) =>
                item.upload_id !== input.id && item.source_job_id !== input.id,
            ),
            source,
          ].slice(-8),
        });
      }
    } catch (reason) {
      setError(message(reason));
    }
  }
  function publicInput(asset: Asset) {
    void remember({
      id: asset.sha256,
      kind: "public",
      name: asset.file_name,
      sha256: asset.sha256,
      byte_size: asset.byte_size,
      ready: true,
      license: asset.license,
    });
    const prior =
      context?.snapshot_id === snapshotId
        ? (context.selected_sources ?? [])
        : [];
    updateContext({
      snapshot_id: snapshotId,
      investigations: [asset.accession],
      selected_sources: [
        ...prior.filter((item) => item.asset_sha256 !== asset.sha256),
        {
          asset_sha256: asset.sha256,
          accession: asset.accession,
          asset_id: asset.id,
          source_rows: [],
          columns: [],
        },
      ].slice(-8),
    });
  }
  async function focused(value: ValidatedChart) {
    setChart(value);
    updateContext({
      snapshot_id: snapshotId,
      focused_view: { kind: "chart", spec: { ...value.spec } },
    });
    try {
      const existing = await readDocument(`laboratory-chart-${snapshotId}`);
      await saveDocument(
        {
          id: `laboratory-chart-${snapshotId}`,
          kind: "analysis",
          title: value.spec.title,
          snapshot_id: snapshotId,
          data: { spec: value.spec },
        },
        existing?.revision ?? 0,
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  if (mode === "dashboards")
    return <DashboardWorkbench id={entityId} snapshotId={snapshotId} />;
  const titles: Record<string, string> = {
    start: "Data & models",
    data: "Explore source data",
    models: "Calculations & fits",
    scenarios: "Conditions & safety",
    media: "Images & video",
    code: "Python & shell",
    uploads: "Add your data",
  };
  return (
    <div className={styles.workbench}>
      <div className={styles.heading}>
        <div>
          <h1>{titles[mode] ?? "Data & models"}</h1>
          <p>
            {mode === "start"
              ? "Turn an investigation into a dataset, a figure or a reproducible calculation."
              : mode === "data"
                ? "Choose an investigation, select variables and export the data behind your question."
                : mode === "models"
                  ? "Calculate from known inputs or fit measured data. Keep the method and its sources together."
                  : mode === "scenarios"
                    ? "Describe the conditions that matter to your question, then look for comparable evidence."
                    : mode === "media"
                      ? "Inspect NASA images and recordings; calibrate a measurement when the source supports it."
                      : "Bring your data and research methods together."}
          </p>
        </div>
        {mode !== "start" && (
          <Link className="text-button" href="/app/lab">
            All analysis tools <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {mode !== "start" && (
        <nav className="lab-subnav" aria-label="Analysis tools">
          {["data", "models", "scenarios", "media"].map((key) => (
            <Link
              key={key}
              href={`/app/lab/${key}`}
              aria-current={mode === key ? "page" : undefined}
            >
              {titles[key]}
            </Link>
          ))}
          <details>
            <summary>More tools</summary>
            <div className="inline-actions">
              <Link href="/app/lab/uploads">Add your data</Link>
              <Link href="/app/lab/code">Python & shell</Link>
              <Link href="/app/dashboards">Research figures</Link>
              <Link href="/app/lab/evidence">Evidence & sources</Link>
            </div>
          </details>
        </nav>
      )}
      {mode === "start" && (
        <>
          <section className="lab-introduction">
            <div>
              <h2>What would you like to work with?</h2>
              <p>
                Start from a NASA investigation or bring your own measurements.
                Source references and units stay with the data through
                selection, calculation and export.
              </p>
              {context?.investigations?.[0] && (
                <Link
                  className="button button-primary"
                  href={`/app/lab/data/${context.investigations[0]}`}
                >
                  Continue with {context.investigations[0]}{" "}
                  <ArrowRight size={16} />
                </Link>
              )}
              <Link className="text-button" href="/app/investigations">
                Find an investigation first <ArrowRight size={16} />
              </Link>
            </div>
            <div className="lab-start-list">
              <Link href="/app/lab/data">
                <Database size={22} />
                <span>
                  <strong>Explore and extract data</strong>
                  <small>
                    Select variables, build a chart and export a dataset.
                  </small>
                </span>
                <ArrowRight size={18} />
              </Link>
              <Link href="/app/lab/models">
                <ChartNoAxesCombined size={22} />
                <span>
                  <strong>Calculate or fit measurements</strong>
                  <small>
                    Use scientific methods and inspect what a fit establishes.
                  </small>
                </span>
                <ArrowRight size={18} />
              </Link>
              <Link href="/app/lab/scenarios">
                <FlaskConical size={22} />
                <span>
                  <strong>Explore conditions and fire safety</strong>
                  <small>
                    Compare your research conditions with available evidence.
                  </small>
                </span>
                <ArrowRight size={18} />
              </Link>
              <Link href="/app/lab/media">
                <Image size={22} />
                <span>
                  <strong>Inspect images and video</strong>
                  <small>
                    Explore flame recordings and source-based measurements.
                  </small>
                </span>
                <ArrowRight size={18} />
              </Link>
            </div>
          </section>
          <nav className="lab-subnav" aria-label="Additional analysis tools">
            <Link href="/app/lab/uploads">Add your own data</Link>
            <Link href="/app/lab/code">
              <Code size={15} /> Python & shell
            </Link>
            <Link href="/app/dashboards">Research figures</Link>
            <Link href="/app/lab/evidence/controls">
              Safety-control research
            </Link>
            <Link href="/app/lab/evidence/earth">Earth applications</Link>
          </nav>
        </>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={styles.status}>
          {notice}
        </p>
      )}
      {mode === "start" ? null : mode === "code" ? (
        <ExecutionWorkbench
          snapshotId={snapshotId}
          entityId={entityId}
          inputs={inputs}
        />
      ) : mode === "models" ? (
        <ModelWorkbench
          snapshotId={snapshotId}
          entityId={entityId}
          sourceChart={chart}
        />
      ) : mode === "scenarios" ? (
        <ScenarioWorkbench snapshotId={snapshotId} entityId={entityId} />
      ) : mode === "uploads" ? (
        <InputWorkbench
          snapshotId={snapshotId}
          onInput={(input) => void remember(input)}
        />
      ) : mode === "media" ? (
        <MediaWorkbench
          snapshotId={snapshotId}
          entityId={entityId}
          sourceChart={chart}
        />
      ) : (
        <DatasetWorkbench
          snapshotId={snapshotId}
          entityId={entityId}
          onInput={publicInput}
          onChart={(value) => void focused(value)}
        />
      )}
    </div>
  );
}

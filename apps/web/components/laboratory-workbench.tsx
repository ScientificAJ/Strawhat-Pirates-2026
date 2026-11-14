"use client";
import Link from "next/link";
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
  view = "data",
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
    setNotice(
      `${input.name} is available in the Code tab. No code or AI request was started.`,
    );
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
          title: "Selected laboratory input references",
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
    data: "Data laboratory",
    models: "Methods and modeling",
    scenarios: "Scenario laboratory",
    code: "Python and shell",
    media: "Media and measurements",
    uploads: "Scientific input files",
  };
  return (
    <div className={styles.workbench}>
      <div className={styles.heading}>
        <div>
          <h1>{titles[mode] ?? "Data laboratory"}</h1>
          <p>
            Inspect source evidence, make explicit transformations, and preserve
            a reproducible research record.
          </p>
        </div>
        <Link className="button" href="/app/dashboards/new">
          Compose a dashboard
        </Link>
      </div>
      <nav className={styles.tabs} aria-label="Scientific laboratory">
        {Object.entries(titles).map(([key, label]) => (
          <Link
            key={key}
            href={`/app/lab/${key}`}
            aria-current={mode === key ? "page" : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
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
      {mode === "code" ? (
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
          onInput={publicInput}
          onChart={(value) => void focused(value)}
        />
      )}
    </div>
  );
}

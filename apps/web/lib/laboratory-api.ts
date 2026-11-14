"use client";

import type { components } from "../../../packages/contracts/api-types";
import { rememberJob } from "./private-jobs";

export type QuerySpec = components["schemas"]["QuerySpec"];
export type ChartSpec = components["schemas"]["ChartSpec"];
export type DashboardSpec = components["schemas"]["DashboardSpec"];
export type DashboardComponent = components["schemas"]["DashboardComponent"];
export type MethodChartSpec = components["schemas"]["MethodChartSpec"];
export type QueryColumn = {
  key: string;
  source_index: number | null;
  title?: string;
  display_title?: string;
  units: string[];
  quantity_kinds?: string[];
  representation?: string;
  transformation_ids?: string[];
};
export type QueryResult = {
  snapshot_id: string;
  asset: { sha256: string; accession: string; file_name?: string };
  columns: QueryColumn[];
  values: Record<string, unknown>[];
  total_source_records: number;
  returned_source_records: number;
  independent_run_count: number | null;
  limitations?: string[];
  truncated?: boolean;
  adapter_status?: string;
  query?: QuerySpec;
};
export type ValidatedChart = {
  spec: ChartSpec | MethodChartSpec;
  vega_lite: Record<string, unknown>;
  data: QueryResult;
  plot?: {
    caption?: string;
    transformations?: unknown[];
    domain_mask?: unknown[];
    missing_coordinate_count?: number;
  };
  status: string;
  uncertainty_interpretation?: string;
  uncertainty_details?: unknown;
  provenance?: unknown;
};
export type Job = {
  id: string;
  kind?: string;
  status: string;
  snapshot_id?: string;
  attempt?: number;
  approval_revision?: number;
  approval?: { inputs_sha256?: string };
  result?: Record<string, unknown> | null;
  partial_result?: Record<string, unknown> | null;
  error_code?: string | null;
  expires_at?: string;
};
export type JobEvent = {
  sequence: number;
  event_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
};
export type FrozenInput = {
  id: string;
  kind: "public" | "acquired" | "upload";
  name: string;
  sha256?: string;
  byte_size?: number;
  ready: boolean;
  expires_at?: string;
  license?: string | null;
};

export async function post<T>(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      data && typeof data === "object" && "detail" in data ? data.detail : null;
    const explanation =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail
              .slice(0, 8)
              .map((item) =>
                item && typeof item === "object"
                  ? `${Array.isArray(item.loc) ? item.loc.join(" → ") : "Input"}: ${String(item.msg ?? "invalid value")}`
                  : String(item),
              )
              .join("; ")
          : `The scientific operation returned ${response.status}. Your inputs remain available for correction.`;
    throw new Error(explanation);
  }
  if (response.status === 202) await rememberJob(data);
  return data as T;
}

export function readable(value: unknown): string {
  if (value === null || value === undefined) return "Not reported";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
export function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The operation did not complete. Your inputs remain available.";
}
export function fileDownload(
  name: string,
  value: Blob | string,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    typeof value === "string" ? new Blob([value], { type }) : value,
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function digestFile(file: Blob) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
    ),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}
export async function downloadArtifact(
  jobId: string,
  artifactId: string,
  name: string,
) {
  const response = await fetch(
    `/v1/workflows/${jobId}/artifacts/${artifactId}`,
    { credentials: "same-origin" },
  );
  if (!response.ok)
    throw new Error(
      "This artifact has expired or is unavailable to this browser. Saved local work is retained.",
    );
  fileDownload(name, await response.blob());
}
export function queryDefaults(
  snapshot: string,
  digest: string,
  columns: number[],
): QuerySpec {
  return {
    schema_version: 1,
    snapshot_id: snapshot,
    asset_sha256: digest,
    columns,
    source_rows: null,
    filters: [],
    representation: "canonical",
    column_representations: {},
    limit: 1000,
    group_by: [],
    aggregations: [],
  };
}
export function chartDefaults(query: QuerySpec): ChartSpec {
  return {
    schema_version: 1,
    title: "Selected source measurements",
    query,
    mark: "point",
    x_column: query.columns[0] ?? 0,
    y_column: query.columns[1] ?? query.columns[0] ?? 0,
    x_type: "quantitative",
    y_type: "quantitative",
    x_scale: "linear",
    y_scale: "linear",
    uncertainty: "not_available",
    caption: "",
    histogram_bins: 10,
    response_columns: [],
  };
}
export function methodContext(
  snapshot: string,
  source: string,
  locator: string,
  origin: "measured" | "analyst_input" | "synthetic_reference" = "measured",
) {
  return {
    input_origin: origin,
    source_snapshot: snapshot,
    sources: [{ source_id: source, locator }],
    conditions: {},
    assumptions: [],
  };
}
export async function fetchEvents(
  id: string,
  after = 0,
  signal?: AbortSignal,
): Promise<JobEvent[]> {
  const response = await fetch(`/v1/workflows/${id}/events?after=${after}`, {
    credentials: "same-origin",
    signal,
    headers: { Accept: "text/event-stream" },
  });
  if (!response.ok)
    throw new Error(
      "Job events are unavailable; inspect the saved job status or retry.",
    );
  return (await response.text()).split("\n\n").flatMap((block) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return [];
    try {
      return [JSON.parse(data) as JobEvent];
    } catch {
      return [];
    }
  });
}

export async function keepArtifact(
  jobId: string,
  artifactId: string,
  name: string,
  expectedSha256?: string,
) {
  const response = await fetch(
    `/v1/workflows/${jobId}/artifacts/${artifactId}`,
    { credentials: "same-origin" },
  );
  if (!response.ok)
    throw new Error(
      "The output file is unavailable or expired. Previously saved local outputs remain available.",
    );
  const blob = await response.blob();
  if (blob.size > 16 * 1024 * 1024)
    throw new Error(
      "This file exceeds the sixteen-MiB browser artifact profile. Download it directly instead.",
    );
  const hash = await digestFile(blob);
  if (expectedSha256 && hash !== expectedSha256)
    throw new Error("The output hash changed; no local copy was saved.");
  const encoded = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () =>
      reject(new Error("The file could not be read for local storage."));
    reader.readAsDataURL(blob);
  });
  const { readDocument, saveDocument } = await import("./workspace-documents");
  const previous = await readDocument(`output-${artifactId}`);
  await saveDocument(
    {
      id: `output-${artifactId}`,
      kind: "artifact",
      title: name,
      data: {
        file_name: name,
        media_type: blob.type,
        sha256: hash,
        byte_size: blob.size,
        bytes_base64: encoded,
        origin_job_id: jobId,
        artifact_id: artifactId,
        scientific_origin: "retained_original_artifact_bytes",
      },
    },
    previous?.revision ?? 0,
  );
}
export function savedArtifactDownload(value: {
  file_name: string;
  media_type: string;
  bytes_base64: string;
}) {
  const binary = atob(value.bytes_base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  fileDownload(value.file_name, new Blob([bytes], { type: value.media_type }));
}

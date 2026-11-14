"use client";

import { useCallback, useEffect, useState } from "react";

export type Investigation = {
  accession: string;
  title: string;
  acronym: string;
  doi: string | null;
  version: number;
  description: string;
  objective: string;
  approach: string;
  research_area: string;
  sub_research_area: string;
  license: string | null;
  source_url: string;
  declared_bytes: number | null;
  hardware: string;
  platform: string;
  quality_notes: string[];
};

export type Asset = {
  id: string;
  accession: string;
  investigation_version: number;
  file_name: string;
  file_version: number;
  sha256: string;
  byte_size: number;
  media_type: string;
  encoding: string | null;
  source_url: string;
  doi: string | null;
  license: string | null;
  kind: string;
};

export type Catalog = {
  snapshot_id: string;
  items: Investigation[];
  total: number;
  limit: number;
  offset: number;
};
export type Dossier = Investigation & { snapshot_id: string; assets: Asset[] };
export type SourceTable = {
  asset: Asset;
  headers: string[];
  rows: { row_number: number; cells: string[] }[];
  total_rows: number;
  encoding: string;
  caveats: string[];
  limit: number;
  offset: number;
};
export type EndpointAnalysis = {
  id: string;
  title: string;
  snapshot_id: string;
  origin: "derived_from_source_table";
  counts: { label: string; count: number }[];
  total_rows: number;
  independent_run_count: number | null;
  asset: Asset;
  source_columns: string[];
  limitations: string[];
  method: { id: string; version: string; description: string };
  source_rows: { row_number: number; label: string }[];
};
export type OxygenResult = {
  method_id: string;
  value: number;
  unit: string;
  origin: "derived_from_assumptions";
  inputs: {
    oxygen_percent: number;
    absolute_pressure: number;
    pressure_unit: string;
    fraction_basis: string;
  };
  equation: string;
  assumptions: string[];
  limitations: string[];
};

export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      body && typeof body === "object" && "detail" in body ? body.detail : null;
    throw new Error(
      typeof detail === "string"
        ? detail
        : `The research service returned ${response.status}. Try again after the local service is ready.`,
    );
  }
  return response.json() as Promise<T>;
}

export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request<T>(url, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "The research service could not be reached.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, attempt]);

  return { data, error, loading, reload };
}

export function downloadJson(fileName: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function family(accession: string) {
  if (["PSI-39", "PSI-68", "PSI-69", "PSI-117", "PSI-142"].includes(accession))
    return "Droplets and cool flames";
  if (
    ["PSI-25", "PSI-26", "PSI-62", "PSI-98", "PSI-99", "PSI-100"].includes(
      accession,
    )
  )
    return "Solid fuels and spread";
  if (["PSI-47", "PSI-101", "PSI-102", "PSI-115"].includes(accession))
    return "Smoke and detection";
  return "Gas flames and transport";
}

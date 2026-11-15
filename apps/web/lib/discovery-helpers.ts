import type { Asset, ScientificRecord } from "./api";
import type { Anchor } from "../components/workbench-common";
import { isInvestigationId } from "./investigation-identifiers";

export type RecordHit = {
  accession: string;
  asset: Asset;
  record: ScientificRecord;
  anchor: Anchor;
  match_explanation: string;
  adapter_id: string;
};
export type Filters = {
  entity: "investigations" | "records";
  text: string;
  hardware: string;
  platform: string;
  availability: string;
  accession: string;
  rowKind: string;
  quantity: string;
  minimum: string;
  maximum: string;
  unit: string;
  basis: string;
  location: string;
  valueKind: string;
  includeMissing: boolean;
  requireQuantity: boolean;
  minimumExclusive: boolean;
  maximumExclusive: boolean;
  additionalPredicates: SourcePredicate[];
  catalogFacets: Record<string, string[]>;
};
export type SourcePredicate = {
  quantity_kind: string | null;
  source_column?: string;
  operator: string;
  value?: string | number;
  unit?: string;
  basis?: string;
  location?: string;
  source_value_kind?: string;
  include_missing?: boolean;
};
export const initialFilters: Filters = {
  entity: "investigations",
  text: "",
  hardware: "",
  platform: "",
  availability: "",
  accession: "",
  rowKind: "",
  quantity: "oxygen_fraction",
  minimum: "",
  maximum: "",
  unit: "1",
  basis: "",
  location: "",
  valueKind: "",
  includeMissing: false,
  requireQuantity: false,
  minimumExclusive: false,
  maximumExclusive: false,
  additionalPredicates: [],
  catalogFacets: {},
};
export const rowRoles = [
  "source_test_record",
  "condition_record",
  "range_summary",
  "daily_summary",
  "session_record",
  "sample_record",
  "flow_visualization",
  "note",
  "unclassified_record",
];
export function compileFilters(
  filters: Filters,
  snapshotId: string,
  cursor?: string | null,
) {
  const common = {
    snapshot_id: snapshotId,
    catalog_facets: filters.catalogFacets ?? {},
    text: filters.text.trim(),
    accessions: filters.accession ? [filters.accession] : [],
    limit: 25,
    ...(cursor ? { cursor } : {}),
  };
  if (filters.entity === "investigations")
    return {
      ...common,
      ...(filters.hardware ? { hardware: filters.hardware } : {}),
      ...(filters.platform ? { platform: filters.platform } : {}),
      ...(filters.availability ? { availability: filters.availability } : {}),
    };
  const predicates: {
    quantity_kind: string;
    operator: string;
    value?: number;
    unit: string;
    include_missing: boolean;
    basis?: string;
    location?: string;
    source_value_kind?: string;
  }[] = [];
  for (const [operator, raw] of [
    [filters.minimumExclusive ? "gt" : "gte", filters.minimum],
    [filters.maximumExclusive ? "lt" : "lte", filters.maximum],
  ]) {
    if (!raw.trim()) continue;
    if (!Number.isFinite(Number(raw)))
      throw new Error(
        "Enter a finite " +
          (operator.startsWith("g") ? "minimum" : "maximum") +
          " in the displayed canonical unit.",
      );
    predicates.push({
      quantity_kind: filters.quantity,
      operator,
      value: Number(raw),
      unit: filters.unit,
      include_missing: filters.includeMissing,
      ...(filters.basis ? { basis: filters.basis } : {}),
      ...(filters.location ? { location: filters.location } : {}),
      ...(filters.valueKind ? { source_value_kind: filters.valueKind } : {}),
    });
  }
  if (
    !predicates.length &&
    (filters.requireQuantity ||
      filters.basis ||
      filters.location ||
      filters.valueKind)
  ) {
    predicates.push({
      quantity_kind: filters.quantity,
      operator: "present",
      unit: filters.unit,
      include_missing: filters.includeMissing,
      ...(filters.basis ? { basis: filters.basis } : {}),
      ...(filters.location ? { location: filters.location } : {}),
      ...(filters.valueKind ? { source_value_kind: filters.valueKind } : {}),
    });
  }
  if (
    filters.minimum &&
    filters.maximum &&
    Number(filters.minimum) > Number(filters.maximum)
  )
    throw new Error("The minimum must not exceed the maximum.");
  return {
    ...common,
    row_kinds: filters.rowKind ? [filters.rowKind] : [],
    predicates: [...predicates, ...(filters.additionalPredicates ?? [])],
  };
}
export function proposeLanguage(text: string, current: Filters) {
  const filters = { ...current };
  const explanations: string[] = [];
  const accession = text
    .match(/\b(?:PSI|NASA)-[A-Z0-9-]+\b/gi)
    ?.map((value) => value.toUpperCase())
    .find(isInvestigationId);
  if (accession) {
    filters.accession = accession;
    explanations.push(
      "Uses the explicitly named investigation " + filters.accession + ".",
    );
  }
  if (/\b(runs?|records?|tests?)\b/i.test(text)) {
    filters.entity = "records";
    explanations.push(
      "Searches source records; their experimental independence is not presumed.",
    );
  }
  const oxygen = text.match(
    /oxygen\s+(mole|volume)\s+fraction\s+(above|at least|below|at most)\s+([0-9]+(?:\.[0-9]+)?)\s*(%)?/i,
  );
  if (oxygen) {
    const value = Number(oxygen[3]) / (oxygen[4] ? 100 : 1);
    filters.entity = "records";
    filters.quantity = "oxygen_fraction";
    filters.unit = "1";
    filters.basis = oxygen[1].toLowerCase();
    if (/above|at least/i.test(oxygen[2])) {
      filters.minimum = String(value);
      filters.minimumExclusive = /above/i.test(oxygen[2]);
    } else {
      filters.maximum = String(value);
      filters.maximumExclusive = /below/i.test(oxygen[2]);
    }
    explanations.push(
      "Converts the explicit oxygen threshold to a " +
        filters.basis +
        " fraction in unit 1; the stated boundary and its inclusion remain editable.",
    );
  }
  const quoted = text.match(/"([^"]+)"/);
  if (quoted) {
    filters.text = quoted[1];
    explanations.push(
      "Uses the quoted phrase as the exact source-text constraint.",
    );
  }
  if (!oxygen && /oxygen|pressure|airflow|gravity|high|low/i.test(text))
    explanations.push(
      "No numerical threshold, pressure reference, calibration or gravity transfer was inferred. Add those explicitly or search by meaning.",
    );
  if (!explanations.length)
    explanations.push(
      "This question does not define an unambiguous hard filter. Use its wording as a labeled semantic query; no records will be silently excluded.",
    );
  return { filters, explanations, semanticText: text };
}
export function recordIdentity(hit: RecordHit) {
  return JSON.stringify([
    hit.accession,
    hit.asset.id,
    hit.asset.sha256,
    hit.record.source_row,
  ]);
}
export function runHref(hit: RecordHit, snapshotId: string) {
  return (
    "/app/runs/" +
    encodeURIComponent(recordIdentity(hit)) +
    "?snapshot=" +
    encodeURIComponent(snapshotId)
  );
}
export function parseRunIdentity(id: string): [string, string, string, number] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(id);
  } catch {
    try {
      parsed = JSON.parse(decodeURIComponent(id));
    } catch {
      throw new Error(
        "This run link has no complete frozen source identity. Reopen the source record from discovery.",
      );
    }
  }
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 4 ||
    !isInvestigationId(parsed[0]) ||
    typeof parsed[1] !== "string" ||
    typeof parsed[2] !== "string" ||
    !/^[a-f0-9]{64}$/.test(parsed[2]) ||
    !Number.isSafeInteger(parsed[3]) ||
    parsed[3] < 2
  )
    throw new Error(
      "This run link is incomplete. Select the exact source record again.",
    );
  return parsed as [string, string, string, number];
}
export function sensitivityScore(
  components: Record<string, number | null>,
  weights: Record<string, number>,
) {
  let lower = 0,
    unknown = 0;
  for (const [name, weight] of Object.entries(weights)) {
    const value = components[name];
    if (value === null || value === undefined) unknown += weight;
    else lower += value * weight;
  }
  return { lower, upper: lower + unknown, complete: unknown === 0 };
}

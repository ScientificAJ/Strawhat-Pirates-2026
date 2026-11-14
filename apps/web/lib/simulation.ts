import type { components } from "../../../packages/contracts/api-types";

export type DropletVisualization =
  | components["schemas"]["DropletVisualizationResult"]
  | components["schemas"]["SourceDropletVisualizationResult"];
export type DropletVisualizationRequest =
  components["schemas"]["DropletVisualizationRequest"];

export function isSourceDropletVisualization(
  value: DropletVisualization,
): value is components["schemas"]["SourceDropletVisualizationResult"] {
  return (
    value.parameter_origin === "source_reported_nominal" &&
    "parameter_sources" in value &&
    "source_conditions" in value &&
    "source_record_limitations" in value
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function positive(value: unknown): value is number {
  return finite(value) && value > 0;
}
function strings(value: unknown, allowEmpty = false): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    (allowEmpty || value.length > 0) &&
    value.every((item) => typeof item === "string" && item.length <= 8000)
  );
}
function quantity(value: unknown, expectedValue: number, unit: string) {
  return record(value) && value.value === expectedValue && value.unit === unit;
}
function reportedParameter(
  value: unknown,
  snapshot: string,
  expectedValue: number,
  unit: string,
) {
  if (
    !quantity(value, expectedValue, unit) ||
    !record(value) ||
    value.origin !== "source_reported_nominal" ||
    typeof value.source_text !== "string" ||
    !value.source_text.trim() ||
    !record(value.anchor)
  )
    return false;
  const anchor = value.anchor;
  return (
    anchor.kind === "text_lines" &&
    anchor.accession === "PSI-69" &&
    anchor.snapshot_id === snapshot &&
    typeof anchor.source_sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(anchor.source_sha256) &&
    typeof anchor.asset_id === "string" &&
    anchor.asset_id.startsWith("PSI-69:") &&
    Number.isInteger(anchor.investigation_version) &&
    Number(anchor.investigation_version) > 0 &&
    Number.isInteger(anchor.source_row) &&
    Number(anchor.source_row) > 0 &&
    anchor.line_end === anchor.source_row
  );
}

/** Check serialized artifacts before allowing source-specific scientific wording. */
export function isDropletVisualization(
  value: unknown,
): value is DropletVisualization {
  if (
    !record(value) ||
    value.artifact_type !== "educational_simulation" ||
    value.model_id !== "droplet_d_squared_v1" ||
    value.method_id !== value.model_id ||
    value.status !== "illustrative_model" ||
    value.origin !== "deterministic_calculation" ||
    value.requires_open !== true ||
    value.autoplay !== false ||
    typeof value.scientific_qualification !== "string" ||
    !value.scientific_qualification.trim() ||
    !["analyst_assumptions", "source_reported_nominal"].includes(
      String(value.parameter_origin),
    ) ||
    !record(value.request) ||
    !record(value.context) ||
    !record(value.summaries) ||
    !record(value.units)
  )
    return false;
  const request = value.request;
  const context = value.context;
  const snapshot = context.source_snapshot;
  if (
    request.parameter_origin !== value.parameter_origin ||
    request.model_id !== value.model_id ||
    !positive(request.initial_diameter_mm) ||
    !positive(request.burning_constant_mm2_s) ||
    !positive(value.initial_diameter_squared_mm2) ||
    !positive(value.idealized_endpoint_s) ||
    typeof snapshot !== "string" ||
    !/^[a-f0-9]{64}$/.test(snapshot) ||
    !record(request.context) ||
    request.context.source_snapshot !== snapshot ||
    request.context.input_origin !== context.input_origin ||
    !["analyst_input", "synthetic_reference"].includes(
      String(context.input_origin),
    ) ||
    !Array.isArray(context.sources) ||
    !context.sources.length ||
    !["equations", "assumptions", "limitations", "references"].every((key) =>
      strings(value[key]),
    )
  )
    return false;
  const summaries = value.summaries;
  if (
    !quantity(summaries.initial_diameter, request.initial_diameter_mm, "mm") ||
    !quantity(
      summaries.burning_constant,
      request.burning_constant_mm2_s,
      "mm^2/s",
    ) ||
    !quantity(summaries.idealized_endpoint, value.idealized_endpoint_s, "s") ||
    !quantity(
      summaries.initial_diameter_squared,
      value.initial_diameter_squared_mm2,
      "mm^2",
    ) ||
    value.units.diameter_mm !== "mm" ||
    value.units.diameter_squared_mm2 !== "mm^2" ||
    value.units.time_s !== "s" ||
    !["dimensionless", "1"].includes(String(value.units.relative_mass))
  )
    return false;
  if (value.parameter_origin === "source_reported_nominal") {
    if (
      value.source_profile_id !== "flex-007-nominal-v1" ||
      request.source_profile_id !== value.source_profile_id ||
      request.investigation_accession !== "PSI-69" ||
      !record(value.parameter_sources) ||
      !reportedParameter(
        value.parameter_sources.initial_diameter,
        snapshot,
        request.initial_diameter_mm,
        "mm",
      ) ||
      !reportedParameter(
        value.parameter_sources.burning_constant,
        snapshot,
        request.burning_constant_mm2_s,
        "mm^2/s",
      ) ||
      !record(value.source_conditions) ||
      !Object.keys(value.source_conditions).length ||
      !Object.values(value.source_conditions).every(
        (item) => typeof item === "string",
      ) ||
      !strings(value.source_record_limitations)
    )
      return false;
  }
  if (
    !Array.isArray(value.points) ||
    value.points.length < 2 ||
    value.points.length > 601 ||
    value.point_count !== value.points.length ||
    request.sample_count !== value.points.length
  )
    return false;
  let previousTime = -1;
  for (const point of value.points) {
    if (
      !record(point) ||
      !["time_s", "diameter_mm", "diameter_squared_mm2", "relative_mass"].every(
        (key) => finite(point[key]) && point[key] >= 0,
      ) ||
      Number(point.time_s) <= previousTime ||
      Number(point.relative_mass) > 1 ||
      Number(point.diameter_mm) >
        request.initial_diameter_mm * (1 + 4 * Number.EPSILON) ||
      Number(point.diameter_squared_mm2) > value.initial_diameter_squared_mm2
    )
      return false;
    previousTime = Number(point.time_s);
  }
  const first = value.points[0];
  const last = value.points.at(-1);
  return (
    first.time_s === 0 &&
    first.diameter_squared_mm2 === value.initial_diameter_squared_mm2 &&
    first.relative_mass === 1 &&
    last.time_s === value.idealized_endpoint_s &&
    last.diameter_mm === 0 &&
    last.diameter_squared_mm2 === 0 &&
    last.relative_mass === 0
  );
}

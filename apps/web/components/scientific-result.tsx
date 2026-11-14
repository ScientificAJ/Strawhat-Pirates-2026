"use client";
import { ArtifactView, isRecord } from "./artifact-view";
import { readable } from "../lib/laboratory-api";
import styles from "./laboratory-workbench.module.css";
export function ScientificResult({ value }: { value: unknown }) {
  return (
    <div className={styles.stack}>
      <ScientificResultSummary value={value} />
      <ArtifactView value={value} summarize={false} />
    </div>
  );
}
export function ScientificResultSummary({ value }: { value: unknown }) {
  if (!isRecord(value)) return null;
  const result = isRecord(value.result) ? value.result : value;
  const measure = isRecord(result.measurement) ? result.measurement : result;
  const interval = isRecord(measure.interval)
    ? measure.interval
    : isRecord(measure.central_output_interval)
      ? measure.central_output_interval
      : null;
  const request = isRecord(measure.request) ? measure.request : {};
  const outputUnits = Array.isArray(request.output_units)
    ? request.output_units.map((unit) =>
        typeof unit === "string" ? unit : "Unit not reported",
      )
    : [];
  const stats = [
    "signed_slope",
    "intercept_at_interval_start",
    "interval_start_seconds",
    "interval_end_seconds",
    "point_count",
    "independent_run_count",
    "root_mean_square_residual",
    "coefficient_of_determination",
    "residual_lag_one_correlation",
    "slope_standard_error",
    "training_count",
    "held_out_count",
    "training_group_count",
    "held_out_group_count",
    "standard_deviation",
    "converged",
    "value_metres",
    "calibrated_proposal_metres",
    "foreground_pixel_count",
    "component_count",
    "median_boundary_coordinate_pixels",
    "foreground_area_square_metres",
    "calibrated_area_proposal_square_metres",
  ].filter((key) => key in measure);
  return (
    <div className={styles.stack}>
      {isRecord(measure.context) &&
        measure.context.input_origin !== "measured" && (
          <p className={styles.warning}>
            {measure.context.input_origin === "synthetic_reference"
              ? "Synthetic analytical reference — these values are not NASA observations."
              : "Researcher-supplied analytical inputs; calculation success does not establish measurement accuracy."}
          </p>
        )}
      {Array.isArray(measure.missing_requirements) &&
        measure.missing_requirements.length > 0 && (
          <div className={styles.warning}>
            <h3>Physical measurement remains a proposal</h3>
            <ul>
              {measure.missing_requirements.map((item, index) => (
                <li key={index}>{readable(item)}</li>
              ))}
            </ul>
          </div>
        )}
      {typeof measure.residual_unit === "string" && (
        <p className={styles.caption}>
          Trace time is in seconds. Observed, fitted and residual coordinates
          use {measure.residual_unit}; the reported slope statistic uses{" "}
          {readable(measure.unit)}.
        </p>
      )}
      {interval ? (
        <div className={styles.status}>
          <h3>
            {"central_output_interval" in measure
              ? "Central output-distribution interval"
              : "Reported conditional uncertainty interval"}
          </h3>
          <p>
            {readable(interval.lower)} to {readable(interval.upper)}{" "}
            {readable(measure.unit)} · level {readable(interval.level)}
          </p>
          <p>{readable(interval.interpretation)}</p>
        </div>
      ) : measure.status === "descriptive_fit" ? (
        <p className={styles.warning}>
          No justified uncertainty interval is reported for this fit. The
          measured points, residuals and limitations remain available.
        </p>
      ) : null}
      {stats.length > 0 && (
        <dl className={styles.summary}>
          {stats.map((key) => (
            <div key={key}>
              <dt>{key.replaceAll("_", " ")}</dt>
              <dd>
                {readable(measure[key])}
                {["signed_slope", "slope_standard_error"].includes(key) &&
                typeof measure.unit === "string"
                  ? ` ${measure.unit}`
                  : [
                        "root_mean_square_residual",
                        "intercept_at_interval_start",
                      ].includes(key) &&
                      typeof measure.residual_unit === "string"
                    ? ` ${measure.residual_unit}`
                    : key === "standard_deviation" &&
                        typeof measure.unit === "string"
                      ? ` ${measure.unit}`
                      : key.endsWith("_seconds")
                        ? " s"
                        : ""}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {[
        "held_out_metrics",
        "held_out_baseline_metrics",
        "output_standard_uncertainty",
        "output_covariance",
        "confusion_matrix",
        "suitability",
      ]
        .filter((key) => key in measure)
        .map((key) => (
          <section key={key}>
            <h3>{key.replaceAll("_", " ")}</h3>
            {key === "output_covariance" && (
              <p className={styles.caption}>
                Output row/column units:{" "}
                {outputUnits.length
                  ? outputUnits
                      .map((unit, index) => `${index + 1}: ${unit}`)
                      .join("; ")
                  : "Not reported"}
                . Entry (i, j) has the product of output i and output j units.
              </p>
            )}
            {isRecord(measure[key]) ? (
              <dl>
                {Object.entries(measure[key]).map(([name, item]) => (
                  <div key={name}>
                    <dt>{name.replaceAll("_", " ")}</dt>
                    <dd>{readable(item)}</dd>
                  </div>
                ))}
              </dl>
            ) : Array.isArray(measure[key]) ? (
              <ol>
                {measure[key].map((item: unknown, index: number) => (
                  <li key={index}>
                    {readable(item)}
                    {key === "output_standard_uncertainty"
                      ? ` ${outputUnits[index] ?? "Unit not reported"}`
                      : ""}
                  </li>
                ))}
              </ol>
            ) : (
              <p>{readable(measure[key])}</p>
            )}
          </section>
        ))}
    </div>
  );
}
export function CoverageTable({ value }: { value: Record<string, unknown> }) {
  const axes = Array.isArray(value.axes) ? value.axes.filter(isRecord) : [];
  const cells = Array.isArray(value.cells) ? value.cells.filter(isRecord) : [];
  function coordinate(value: unknown) {
    if (!isRecord(value)) return "Unknown";
    return value.value === null || value.value === undefined
      ? `Unknown: ${readable(value.reason ?? value.state)}`
      : `${readable(value.value)} ${typeof value.unit === "string" ? value.unit : ""} · ${readable(value.state)}`;
  }
  return (
    <div className={styles.stack}>
      <div className={styles.summary}>
        <span>
          <strong>{readable(value.source_record_count)}</strong> source records
        </span>
        <span>
          Independent runs:{" "}
          <strong>{readable(value.independent_run_count)}</strong>
        </span>
        <span>
          Unobserved combinations within observed axis levels:{" "}
          <strong>{readable(value.unobserved_combination_count)}</strong>
        </span>
      </div>
      <div className={styles.table}>
        <table>
          <caption>
            Observed source-condition combinations. Unknown conditions stay
            explicit; missing combinations are not zero risk.
          </caption>
          <thead>
            <tr>
              {axes.map((axis, index) => (
                <th key={index}>
                  {readable(axis.quantity_kind).replaceAll("_", " ")}
                  {typeof axis.canonical_unit === "string"
                    ? ` [${axis.canonical_unit}]`
                    : ""}
                </th>
              ))}
              <th>Source record count</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((cell, index) => (
              <tr key={index}>
                {(Array.isArray(cell.coordinates) ? cell.coordinates : []).map(
                  (item, axis) => (
                    <td key={axis}>{coordinate(item)}</td>
                  ),
                )}
                <td>{readable(cell.source_record_count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Array.isArray(value.limitations) && (
        <ul>
          {value.limitations.map((limit, index) => (
            <li key={index}>{readable(limit)}</li>
          ))}
        </ul>
      )}
      <details className={styles.details}>
        <summary>
          Scope, unobserved combinations, exact source coordinates and method
        </summary>
        <pre className={styles.output}>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </div>
  );
}

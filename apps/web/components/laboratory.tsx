"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  CircleHelp,
  FileText,
  FlaskConical,
} from "lucide-react";
import { useState } from "react";
import {
  downloadJson,
  EndpointAnalysis,
  OxygenResult,
  request,
  useResource,
} from "../lib/api";
import { ErrorState, LoadingRows, Notice } from "./chrome";
import { RawTable } from "./catalog";

export function FlexAnalysis({
  onSave,
  compact = false,
  snapshotId,
}: {
  onSave: (id: string) => void;
  compact?: boolean;
  snapshotId?: string;
}) {
  const result = useResource<EndpointAnalysis>(
    "/v1/analyses/flex-endpoints" +
      (snapshotId ? `?snapshot_id=${snapshotId}` : ""),
  );
  const [showSource, setShowSource] = useState(false);
  if (result.error)
    return <ErrorState message={result.error} retry={result.reload} />;
  if (!result.data)
    return <LoadingRows label="Checking the FLEX source table" />;
  const analysis = result.data;
  const maximum = Math.max(...analysis.counts.map((item) => item.count), 1);
  return (
    <>
      <section
        className={`analysis-surface ${compact ? "analysis-compact" : ""}`}
      >
        <div className="section-heading">
          <div>
            <h2>How did the FLEX tests end?</h2>
            <p>Source labels from the retained experimental table</p>
          </div>
          <span className="status status-derived">Reproduced calculation</span>
        </div>
        <div
          className="endpoint-chart"
          role="img"
          aria-label={analysis.counts
            .map((item) => `${item.label}: ${item.count} records`)
            .join("; ")}
        >
          {analysis.counts.map((item, index) => (
            <div className="endpoint-bar-row" key={item.label}>
              <span className="endpoint-label">{item.label}</span>
              <div className="endpoint-track">
                <div
                  className={`endpoint-bar endpoint-series-${index}`}
                  style={{ width: `${(item.count / maximum) * 100}%` }}
                />
              </div>
              <strong className="mono">{item.count}</strong>
            </div>
          ))}
        </div>
        <div className="chart-caption">
          <span>{analysis.total_rows} table records</span>
          <span>Experimental run independence not established</span>
        </div>
        <p className="reading-text analysis-explanation">
          A test ending in disruption is distinct from extinction. These counts
          describe source-table labels; they do not measure suppression
          effectiveness or fire probability.
        </p>
        <div className="analysis-source">
          <FileText size={17} />
          <span>
            <strong>FLEX</strong> · {analysis.asset.accession} · Investigation v
            {analysis.asset.investigation_version}
          </span>
          <a
            href={analysis.asset.source_url}
            target="_blank"
            rel="noreferrer"
            aria-label="Open FLEX source record"
          >
            <ArrowUpRight size={16} />
          </a>
        </div>
        <div className="button-row analysis-actions">
          <button
            className="button button-small"
            onClick={() => setShowSource((value) => !value)}
          >
            {showSource ? "Hide source rows" : "Inspect source rows"}
            <ArrowRight size={15} />
          </button>
          <button
            className="button button-small"
            onClick={() => onSave("PSI-69")}
          >
            Save investigation
          </button>
          {!compact && (
            <button
              className="button button-small"
              onClick={() =>
                downloadJson("nova-ember-flex-test-end-labels.json", analysis)
              }
            >
              <ArrowDownToLine size={15} />
              Export analysis
            </button>
          )}
        </div>
        {!compact && (
          <details className="method-details">
            <summary>Method, provenance, and limitations</summary>
            <dl>
              <dt>Method</dt>
              <dd>
                {analysis.method.id} · {analysis.method.version}
              </dd>
              <dt>Operation</dt>
              <dd>{analysis.method.description}</dd>
              <dt>Source columns</dt>
              <dd>{analysis.source_columns.join(", ")}</dd>
              <dt>Source hash</dt>
              <dd className="mono hash-value">{analysis.asset.sha256}</dd>
              <dt>Snapshot</dt>
              <dd className="mono hash-value">{analysis.snapshot_id}</dd>
            </dl>
            <ul>
              {analysis.limitations.map((limitation, index) => (
                <li key={index}>{limitation}</li>
              ))}
            </ul>
          </details>
        )}
      </section>
      {showSource && (
        <RawTable asset={analysis.asset} snapshotId={analysis.snapshot_id} />
      )}
    </>
  );
}

export function ScenarioCalculator() {
  const [oxygen, setOxygen] = useState("21");
  const [pressure, setPressure] = useState("14.7");
  const [unit, setUnit] = useState("psia");
  const [result, setResult] = useState<OxygenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [stale, setStale] = useState(false);
  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const value = await request<OxygenResult>(
        "/v1/calculations/oxygen-partial-pressure",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            oxygen_percent: Number(oxygen),
            absolute_pressure: Number(pressure),
            pressure_unit: unit,
            fraction_basis: "mole",
          }),
        },
      );
      setResult(value);
      setStale(false);
    } catch (reason: unknown) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The calculation could not be completed.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="scenario-layout">
      <section className="reading-surface">
        <h2>Atmosphere assumptions</h2>
        <p className="reading-text">
          Keep oxygen concentration and total pressure separate. These values
          describe a research scenario, not a measured habitat.
        </p>
        <form className="scenario-form" onSubmit={calculate}>
          <label>
            Oxygen mole fraction
            <span className="quantity-input">
              <input
                type="number"
                value={oxygen}
                disabled={loading}
                required
                min="0"
                max="100"
                step="any"
                onChange={(event) => {
                  setOxygen(event.target.value);
                  setStale(true);
                }}
              />
              <span>%</span>
            </span>
          </label>
          <label>
            Total absolute pressure
            <span className="quantity-input">
              <input
                type="number"
                value={pressure}
                disabled={loading}
                required
                min="0.000001"
                step="any"
                onChange={(event) => {
                  setPressure(event.target.value);
                  setStale(true);
                }}
              />
              <select
                aria-label="Absolute pressure unit"
                disabled={loading}
                value={unit}
                onChange={(event) => {
                  setUnit(event.target.value);
                  setStale(true);
                }}
              >
                <option value="psia">psia</option>
                <option value="kPa">kPa</option>
                <option value="Pa">Pa</option>
                <option value="bar">bar</option>
              </select>
            </span>
          </label>
          <p className="field-help">
            Use absolute pressure. Gauge pressure requires a known reference and
            cannot be entered directly.
          </p>
          <button
            type="submit"
            className="button button-primary"
            disabled={loading}
          >
            <Calculator size={16} />
            {loading ? "Calculating…" : "Calculate partial pressure"}
          </button>
        </form>
        {error && <Notice kind="error">{error}</Notice>}
      </section>
      <section className="calculation-result" aria-live="polite">
        <h2>Oxygen partial pressure</h2>
        <div className="equation">
          p<sub>O₂</sub> = x<sub>O₂</sub> × P<sub>absolute</sub>
        </div>
        {result ? (
          <>
            <div className={`calculated-value ${stale ? "stale-result" : ""}`}>
              <strong>
                {new Intl.NumberFormat(undefined, {
                  maximumSignificantDigits: 12,
                }).format(result.value)}
              </strong>
              <span>{result.unit}</span>
            </div>
            <span
              className={`status ${stale ? "status-caution" : "status-derived"}`}
            >
              {stale
                ? "Inputs changed — recalculate"
                : "Calculated from your assumptions"}
            </span>
            {!stale && (
              <p className="field-help">
                {result.inputs.oxygen_percent}% oxygen ×{" "}
                {result.inputs.absolute_pressure} {result.inputs.pressure_unit}{" "}
                absolute
              </p>
            )}
            <button
              className="text-button export-calculation"
              onClick={() =>
                downloadJson("nova-ember-oxygen-partial-pressure.json", result)
              }
              disabled={stale}
            >
              <ArrowDownToLine size={16} />
              Export calculation
            </button>
          </>
        ) : (
          <div className="calculation-placeholder">
            <Calculator size={30} />
            <p>Enter the two assumptions and run the calculation.</p>
          </div>
        )}
        <Notice kind="caution">
          <strong>
            Similar partial pressures do not establish equivalent flammability.
          </strong>
          <p>
            Material, geometry, flow, gravity, and the full atmosphere still
            matter. No fire-risk score is derived here.
          </p>
        </Notice>
        {result && (
          <details className="method-details">
            <summary>Assumptions and limitations</summary>
            <ul>
              {[...result.assumptions, ...result.limitations].map(
                (text, index) => (
                  <li key={index}>{text}</li>
                ),
              )}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}

export function Laboratory({
  tab,
  onSave,
}: {
  tab?: string;
  onSave: (id: string) => void;
}) {
  const active = tab ?? "data";
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Laboratory</h1>
          <p>Inspect the inputs. Reproduce the calculation. Keep the source.</p>
        </div>
      </div>
      <nav className="tab-navigation" aria-label="Laboratory views">
        <Link
          href="/app/lab"
          aria-current={active === "data" ? "page" : undefined}
        >
          Data
        </Link>
        <Link
          href="/app/lab/scenarios"
          aria-current={active === "scenarios" ? "page" : undefined}
        >
          Scenarios
        </Link>
        <Link
          href="/app/lab/models"
          aria-current={active === "models" ? "page" : undefined}
        >
          Models
        </Link>
        <Link
          href="/app/lab/evidence"
          aria-current={active === "evidence" ? "page" : undefined}
        >
          Evidence
        </Link>
      </nav>
      {active === "scenarios" ? (
        <ScenarioCalculator />
      ) : active === "data" ? (
        <FlexAnalysis onSave={onSave} />
      ) : active === "models" ? (
        <section className="reading-surface">
          <FlaskConical className="section-icon" size={28} />
          <h2>Measured traces come first</h2>
          <p className="reading-text">
            The modeling workbench will fit calibrated flame-front position and
            squared droplet diameter over an explicitly selected interval. No
            calibrated trace profile has been released in this local snapshot.
          </p>
          <Notice>
            <strong>No predictive model is registered.</strong>
            <p>
              A prediction for another run requires independent validation and
              support for the requested conditions. You can inspect the source
              data and reproduce the available table analysis now.
            </p>
          </Notice>
          <Link className="button" href="/app/lab">
            Inspect source analysis
            <ArrowRight size={16} />
          </Link>
        </section>
      ) : (
        <section className="reading-surface">
          <CircleHelp className="section-icon" size={28} />
          <h2>Make the missing evidence visible</h2>
          <p className="reading-text">
            The retained FLEX table distinguishes Extinction, Disruption, and
            Completion. Its burning-rate header and species labels require the
            experimental protocol before normalization.
          </p>
          <Notice kind="caution">
            <strong>Unresolved source meaning</strong>
            <p>
              The table’s burning-rate header is not sufficient to assign a
              squared-length-per-time unit. The original text remains preserved.
            </p>
          </Notice>
          <Link className="button" href="/app/investigations/PSI-69">
            Inspect FLEX evidence
            <ArrowRight size={16} />
          </Link>
        </section>
      )}
    </>
  );
}

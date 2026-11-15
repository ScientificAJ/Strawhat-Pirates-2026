"use client";

import dynamic from "next/dynamic";
import { useEffect, useId, useRef, useState } from "react";
import { Download, Pause, Play, RotateCcw, X } from "lucide-react";
import { downloadJson } from "../lib/api";
import { post } from "../lib/laboratory-api";
import {
  isSourceDropletVisualization,
  isDropletVisualization,
  type DropletVisualization,
  type DropletVisualizationRequest,
} from "../lib/simulation";
import { useWorkspacePreferences } from "../lib/workspace-preferences";
import styles from "./droplet-simulation.module.css";

const SimulationScene = dynamic(
  () => import("./simulation-scene").then((module) => module.SimulationScene),
  {
    ssr: false,
    loading: () => <p role="status">Preparing the 3D illustration…</p>,
  },
);
const PLAYBACK_SECONDS = 12;
const display = (value: number) =>
  value.toLocaleString(undefined, { maximumSignificantDigits: 7 });

function referenceLabel(reference: string) {
  try {
    const url = new URL(reference);
    if (
      url.hostname === "ntrs.nasa.gov" &&
      url.pathname.includes("19890010934")
    )
      return "NASA Technical Memorandum 4069: classical droplet combustion";
    if (
      url.hostname === "www.princeton.edu" &&
      url.pathname.includes("fldryer")
    )
      return "Princeton droplet-combustion research background";
    if (decodeURIComponent(reference).includes("FLEX-007_TestSheet"))
      return "FLEX-007 source test sheet";
    return `Source reference · ${url.hostname}`;
  } catch {
    return "Source reference";
  }
}

function reportedCondition(line: string): string {
  const separator = line.indexOf("=");
  return separator >= 0
    ? line.slice(separator + 1).trim()
    : line.replace(/^[^:]+:\s*/, "");
}

export function DropletSimulation({
  snapshotId,
  accession,
  initialResult,
  onClose,
}: {
  snapshotId: string;
  accession?: string;
  initialResult?: DropletVisualization;
  onClose?: () => void;
}) {
  const titleId = useId();
  const preferences = useWorkspacePreferences();
  const root = useRef<HTMLElement>(null);
  const request = useRef<AbortController | null>(null);
  const [diameter, setDiameter] = useState(
    initialResult ? String(initialResult.request.initial_diameter_mm) : "",
  );
  const [constant, setConstant] = useState(
    initialResult ? String(initialResult.request.burning_constant_mm2_s) : "",
  );
  const [result, setResult] = useState(initialResult ?? null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [visible, setVisible] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(false);
  const [systemReduced, setSystemReduced] = useState(true);
  const reduceMotion = preferences.reduce_motion || systemReduced;
  const canPlay = visible && documentVisible && !reduceMotion;
  const stale =
    result !== null &&
    (Number(diameter) !== result.request.initial_diameter_mm ||
      Number(constant) !== result.request.burning_constant_mm2_s);
  const point = result?.points[index] ?? result?.points[0];
  const sourceParameterized =
    result !== null && isSourceDropletVisualization(result);

  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setSystemReduced(media.matches);
    const visibility = () => setDocumentVisible(!document.hidden);
    const observer = new IntersectionObserver(([entry]) =>
      setVisible(entry.isIntersecting),
    );
    if (root.current) observer.observe(root.current);
    motion();
    visibility();
    media.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!canPlay || stale) setPlaying(false);
  }, [canPlay, stale]);
  useEffect(() => {
    if (!playing || !result || !canPlay || stale) return;
    const last = result.points.length - 1;
    const initialIndex = index === last ? 0 : index;
    const start = performance.now();
    let frame = 0;
    let previous = -Infinity;
    function tick(now: number) {
      if (document.hidden) {
        setPlaying(false);
        return;
      }
      if (now - previous >= 50) {
        const next = Math.min(
          last,
          initialIndex +
            Math.floor(((now - start) / (PLAYBACK_SECONDS * 1000)) * last),
        );
        setIndex(next);
        previous = now;
        if (next === last) {
          setPlaying(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // The playback starts from the current index; frame updates do not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, result, canPlay, stale]);

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    if (sourceParameterized && !stale) {
      await prepare("/v1/visualizations/flex-007", {
        snapshot_id: snapshotId,
        sample_count: result.points.length,
      });
      return;
    }
    const body: DropletVisualizationRequest = {
      model_id: "droplet_d_squared_v1",
      investigation_accession: accession ?? null,
      initial_diameter_mm: Number(diameter),
      burning_constant_mm2_s: Number(constant),
      sample_count: 241,
      parameter_origin: "analyst_assumptions",
      context: {
        input_origin: "analyst_input",
        source_snapshot: snapshotId,
        sources: [
          {
            source_id: accession ?? "analyst-assumptions",
            locator:
              "Investigation context only; D0 and K are explicit analyst assumptions.",
          },
        ],
        conditions: {},
        assumptions: [
          "D0 and K were supplied explicitly for an educational constant-K model.",
        ],
      },
    };
    await prepare("/v1/visualizations/droplet", body);
  }

  async function prepare(path: string, body: unknown) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setPlaying(false);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    try {
      const value = await post<DropletVisualization>(
        path,
        body,
        controller.signal,
      );
      if (!isDropletVisualization(value))
        throw new Error(
          "The returned model record is incomplete or inconsistent. Your previous result and inputs are preserved.",
        );
      setResult(value);
      setDiameter(String(value.request.initial_diameter_mm));
      setConstant(String(value.request.burning_constant_mm2_s));
      setIndex(0);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "The model could not be calculated. Your inputs are preserved.",
        );
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        busyRef.current = false;
      }
    }
  }

  return (
    <section ref={root} className={styles.simulation} aria-labelledby={titleId}>
      <div className={styles.heading}>
        <div>
          <h2 id={titleId}>
            {sourceParameterized
              ? "FLEX-007 source-parameterized droplet model"
              : "Droplet combustion visualization"}
          </h2>
          <p>
            Idealized D²-law model ·{" "}
            {accession ?? "explicit analyst assumptions"}
          </p>
        </div>
        {onClose && (
          <button
            className="icon-button"
            aria-label="Close droplet visualization"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <p className={styles.qualification}>
        {sourceParameterized
          ? "Prepared from the retained FLEX-007 test sheet: the stated units are checked, exact parameter lines are preserved, and the D² law is applied to its reported diameter and average burning constant."
          : "Compute a D²-law trajectory for your chosen initial diameter and burning constant, then inspect the calculated diameter and remaining mass at each model time."}{" "}
        The constant-K law defines the trajectory; the rendered flame envelope
        and colors provide a visual guide.
      </p>
      <form className={styles.inputs} onSubmit={calculate} aria-busy={busy}>
        <label>
          Initial droplet diameter D₀ (mm)
          <input
            required
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            readOnly={busy}
            value={diameter}
            onChange={(event) => {
              setDiameter(event.target.value);
              setPlaying(false);
            }}
          />
        </label>
        <label>
          Burning constant K (mm²/s)
          <input
            required
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            readOnly={busy}
            value={constant}
            onChange={(event) => {
              setConstant(event.target.value);
              setPlaying(false);
            }}
          />
        </label>
        <div className={styles.actions}>
          {accession === "PSI-69" && (
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={() =>
                void prepare("/v1/visualizations/flex-007", {
                  snapshot_id: snapshotId,
                  sample_count: 241,
                })
              }
            >
              Use source-reported FLEX-007 inputs
            </button>
          )}
          <button
            className="button button-primary"
            disabled={
              busy ||
              !Number.isFinite(Number(diameter)) ||
              Number(diameter) <= 0 ||
              !Number.isFinite(Number(constant)) ||
              Number(constant) <= 0
            }
          >
            {busy ? "Calculating…" : "Calculate visualization"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => {
              setDiameter("2");
              setConstant("0.5");
              setPlaying(false);
            }}
          >
            Use teaching example
          </button>
        </div>
      </form>
      <p className={styles.help}>
        Manually entered D₀ and K are assigned assumptions. The teaching example
        uses D₀ = 2 mm and K = 0.5 mm²/s for arithmetic only; these are not
        extracted FLEX measurements.
      </p>
      {busy && (
        <p role="status">
          Computing the analytical states with their scientific qualifications…
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {stale && (
        <p role="status" className={styles.warning}>
          Inputs changed. The displayed result retains its previous inputs and
          provenance; calculate again to update it.
        </p>
      )}
      {result && point && (
        <>
          <SimulationScene
            diameterRatio={Math.min(
              1,
              point.diameter_mm / result.request.initial_diameter_mm,
            )}
            playing={playing && canPlay && !stale}
            reducedMotion={reduceMotion}
          />
          {isSourceDropletVisualization(result) ? (
            <section aria-label="FLEX-007 source conditions">
              <h3>FLEX-007 source conditions</h3>
              <dl className={styles.values}>
                <div>
                  <dt>Investigation / test</dt>
                  <dd>PSI-69 · FLEX-007</dd>
                </div>
                {[
                  ["Fuel:", "Fuel"],
                  ["O2 Mole Fraction", "Oxygen mole fraction"],
                  ["Pressure (atm)", "Pressure (atm)"],
                  ["Temperature (K)", "Temperature (K)"],
                ].map(([key, label]) => {
                  const line = result.source_conditions[key];
                  return line ? (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>{reportedCondition(line)}</dd>
                    </div>
                  ) : null;
                })}
                <div>
                  <dt>Initial diameter · source nominal</dt>
                  <dd>{display(result.request.initial_diameter_mm)} mm</dd>
                </div>
                <div>
                  <dt>Burning constant · source average</dt>
                  <dd>
                    {display(result.request.burning_constant_mm2_s)} mm²/s
                  </dd>
                </div>
              </dl>
              <p className={styles.help}>
                The droplet follows the calculated diameter; the flame shell is
                illustrative.{" "}
                <a
                  href={`/app/investigations/PSI-69?snapshot=${snapshotId}&section=sources`}
                >
                  Explore FLEX sources
                </a>
              </p>
            </section>
          ) : (
            <p className={styles.help}>
              Analyst inputs: D₀ {display(result.request.initial_diameter_mm)}{" "}
              mm · K {display(result.request.burning_constant_mm2_s)} mm²/s. The
              droplet follows the calculated diameter; the flame shell is
              illustrative.
            </p>
          )}
          <div className={styles.playback}>
            <button
              className="button"
              disabled={!canPlay || stale}
              onClick={() => {
                if (index === result.points.length - 1) setIndex(0);
                setPlaying((current) => !current);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
              {playing ? "Pause visualization" : "Play visualization"}
            </button>
            <button
              className="button"
              onClick={() => {
                setPlaying(false);
                setIndex(0);
              }}
            >
              <RotateCcw size={16} />
              Reset time
            </button>
            <label>
              Model time
              <input
                aria-label="Model time"
                aria-valuetext={`${display(point.time_s)} seconds of model time`}
                type="range"
                min={0}
                max={result.points.length - 1}
                step={1}
                value={index}
                onChange={(event) => {
                  setPlaying(false);
                  setIndex(Number(event.target.value));
                }}
              />
            </label>
          </div>
          <p className={styles.help}>
            {reduceMotion
              ? "Reduced motion is enabled. Use the timeline to inspect individual calculated states."
              : `Playback maps the full modeled interval to ${PLAYBACK_SECONDS} seconds of viewing time. The model clock below is independent of playback time.`}
          </p>
          <dl className={styles.values}>
            <div>
              <dt>Model time</dt>
              <dd>{display(point.time_s)} s</dd>
            </div>
            <div>
              <dt>Droplet diameter D</dt>
              <dd>{display(point.diameter_mm)} mm</dd>
            </div>
            <div>
              <dt>Diameter squared D²</dt>
              <dd>{display(point.diameter_squared_mm2)} mm²</dd>
            </div>
            <div>
              <dt>Remaining mass / initial mass</dt>
              <dd>{display(point.relative_mass)}</dd>
            </div>
          </dl>
          <p>
            Idealized zero-diameter endpoint:{" "}
            <strong>{display(result.idealized_endpoint_s)} s</strong>. Actual
            extinction can occur at a finite diameter and is outside this model.
          </p>
          <div className={styles.actions}>
            <button
              className="button"
              onClick={() =>
                downloadJson("droplet-d-squared-model.json", result)
              }
            >
              <Download size={16} />
              Export exact model record
            </button>
          </div>
          <details className={styles.details}>
            <summary>Equations, derivation and parameter provenance</summary>
            <p>
              Integrate d(D²)/dt = −K with the initial condition D(0) = D₀.
              Constant K gives a straight line in D² against time. Taking the
              nonnegative square root gives diameter. With a spherical droplet
              and constant liquid density, mass is proportional to D³, giving
              the relative-mass relation.
            </p>
            <pre>{result.equations.join("\n")}</pre>
            <dl className={styles.values}>
              <div>
                <dt>
                  {sourceParameterized
                    ? "Source-reported nominal D₀"
                    : "Assigned D₀"}
                </dt>
                <dd>{display(result.request.initial_diameter_mm)} mm</dd>
              </div>
              <div>
                <dt>
                  {sourceParameterized
                    ? "Source-reported average K"
                    : "Assigned K"}
                </dt>
                <dd>{display(result.request.burning_constant_mm2_s)} mm²/s</dd>
              </div>
            </dl>
            <p>
              The backend computes {result.points.length} analytical states over
              the idealized interval. Display values use seven significant
              digits; the exported record retains computational precision. The
              renderer changes the liquid sphere’s diameter using those returned
              states. Flame-shell dimensions, chamber geometry and color do not
              encode measured quantities.
            </p>
            <p>
              Model context origin:{" "}
              {result.context.input_origin.replaceAll("_", " ")}. Parameter
              origin: {result.parameter_origin.replaceAll("_", " ")}. Snapshot
              context: <code>{result.context.source_snapshot}</code>.
            </p>
            {isSourceDropletVisualization(result) && (
              <>
                <h3>Source-reported inputs and conditions</h3>
                <p>
                  The values below were read from the retained FLEX-007 test
                  sheet, checked against its explicit units, and linked to their
                  exact source lines. They parameterize this calculation.
                  Extending the reported average coefficient as a constant
                  remains a model assumption, rather than a calibrated
                  reconstruction of the recorded history.
                </p>
                <pre>
                  {JSON.stringify(
                    {
                      parameter_sources: result.parameter_sources,
                      condition_sources: result.condition_sources,
                      source_conditions: result.source_conditions,
                      source_record_limitations:
                        result.source_record_limitations,
                    },
                    null,
                    2,
                  )}
                </pre>
              </>
            )}
            {accession && (
              <a
                href={`/app/investigations/${accession}?snapshot=${snapshotId}&section=sources`}
              >
                Inspect this investigation’s source evidence
              </a>
            )}
            <h3>Model assumptions</h3>
            <ul>
              {result.assumptions.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <h3>Scientific limits</h3>
            <ul>
              {result.limitations.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            <h3>Method references</h3>
            <ul>
              {result.references
                .filter((reference) => reference.startsWith("https://"))
                .map((reference) => (
                  <li key={reference}>
                    <a href={reference}>{referenceLabel(reference)}</a>
                  </li>
                ))}
            </ul>
          </details>
          <details className={styles.details}>
            <summary>Inspect all exact calculated states</summary>
            <div className={styles.table}>
              <table>
                <caption>
                  Deterministic model calculations; parameter provenance:{" "}
                  {result.parameter_origin.replaceAll("_", " ")}. These rows are
                  not experimental observations.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Time (s)</th>
                    <th scope="col">D (mm)</th>
                    <th scope="col">D² (mm²)</th>
                    <th scope="col">m/m₀</th>
                  </tr>
                </thead>
                <tbody>
                  {result.points.map((item, i) => (
                    <tr key={i}>
                      <td>{item.time_s}</td>
                      <td>{item.diameter_mm}</td>
                      <td>{item.diameter_squared_mm2}</td>
                      <td>{item.relative_mass}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

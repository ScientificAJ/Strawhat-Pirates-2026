"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Copy, ArrowDownToLine, ArrowRight } from "lucide-react";
import { useResource, type OxygenResult } from "../lib/api";
import {
  fileDownload,
  message,
  methodContext,
  post,
  readable,
} from "../lib/laboratory-api";
import {
  listDocuments,
  readDocument,
  saveDocument,
  type WorkspaceDocument,
} from "../lib/workspace-documents";
import { useResearchContext } from "../lib/research-context";
import styles from "./laboratory-workbench.module.css";
import { CoverageTable } from "./scientific-result";

type Assumption = {
  value: string;
  unit: string;
  basis: string;
  status: string;
  source: string;
};
type Scenario = {
  title: string;
  environment: string;
  endpoint: string;
  conditions: Record<string, Assumption>;
  notes: string;
  preset?: unknown;
};
const sections: { title: string; fields: [string, string, string][] }[] = [
  {
    title: "Environment",
    fields: [
      ["gravity_magnitude", "Gravity magnitude", "m/s^2"],
      ["gravity_direction", "Gravity direction", ""],
      ["gravity_time_history", "Acceleration history", ""],
      ["confinement", "Confinement / enclosure", ""],
      ["apparatus", "Apparatus / scale", ""],
      ["ignition_protocol", "Ignition protocol", ""],
    ],
  },
  {
    title: "Atmosphere",
    fields: [
      ["oxygen_fraction", "Oxygen mole fraction", "%"],
      ["pressure", "Total absolute pressure", "Pa"],
      ["temperature", "Temperature", "K"],
      ["diluent_composition", "Diluent composition", ""],
      ["composition_basis", "Composition basis", ""],
      ["composition_location", "Composition reference location", ""],
      ["dry_wet_basis", "Dry / wet basis", ""],
    ],
  },
  {
    title: "Materials and geometry",
    fields: [
      ["material", "Exact material / composition", ""],
      ["geometry", "Geometry and dimensions", ""],
      ["specimen", "Specimen configuration", ""],
    ],
  },
  {
    title: "Flow",
    fields: [
      ["flow_velocity", "Flow velocity", "m/s"],
      ["flow_direction", "Flow direction", ""],
      ["flow_reference_conditions", "Flow reference conditions", ""],
    ],
  },
  {
    title: "Detection and suppression context",
    fields: [
      ["sensor_response", "Sensor / detector response", ""],
      ["suppression_protocol", "Suppression context", ""],
      ["observation_window", "Observation window", "s"],
      ["data_processing", "Processing / calibration", ""],
    ],
  },
];
const blank = (): Scenario => ({
  title: "Untitled research scenario",
  environment: "spacecraft",
  endpoint: "",
  conditions: Object.fromEntries(
    sections.flatMap((section) =>
      section.fields.map(([key, , unit]) => [
        key,
        {
          value: "",
          unit,
          basis:
            key === "pressure"
              ? "absolute"
              : key === "oxygen_fraction"
                ? "mole"
                : "",
          status: "not_reported",
          source: "",
        },
      ]),
    ),
  ),
  notes: "",
});
type RecordMatch = {
  accession: string;
  asset: { sha256: string; file_name: string };
  record: {
    source_row: number;
    fields: {
      quantity_kind: string | null;
      canonical_value: number | null;
      canonical_unit: string | null;
      raw_text: string;
      status: string;
      source_value_kind?: string;
      basis: string | null;
      location: string | null;
      source_column: string | null;
    }[];
  };
  anchor: unknown;
};
export function ScenarioWorkbench({
  snapshotId,
  entityId,
}: {
  snapshotId: string;
  entityId?: string;
}) {
  const router = useRouter();
  const [finding, setFinding] = useState(false);
  const presets = useResource<{
    presets: {
      id: string;
      title: string;
      status: string;
      oxygen_percent: number | null;
      absolute_pressure: number | null;
      pressure_unit: string | null;
      assumptions: string[];
    }[];
  }>("/v1/scenarios/presets");
  const { updateContext } = useResearchContext();
  const [scenario, setScenario] = useState<Scenario>(blank);
  const [id, setId] = useState(entityId);
  const [revision, setRevision] = useState<number | undefined>();
  const [saved, setSaved] = useState<WorkspaceDocument<Scenario> | null>(null);
  const [versions, setVersions] = useState<WorkspaceDocument<Scenario>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [calculation, setCalculation] = useState<OxygenResult | null>(null);
  const [matches, setMatches] = useState<RecordMatch[]>([]);
  const [coverage, setCoverage] = useState<Record<string, unknown> | null>(
    null,
  );
  const [passport, setPassport] = useState<Record<string, unknown> | null>(
    null,
  );
  const [passportStale, setPassportStale] = useState(false);
  const selectedMatch = useRef<RecordMatch | null>(null);
  const comparisonVersion = useRef(0);
  const [stale, setStale] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [tab, setTab] = useState("assumptions");
  const [compareId, setCompareId] = useState("");
  useEffect(() => {
    void listDocuments<Scenario>("scenario")
      .then(setVersions)
      .catch((reason) => setError(message(reason)));
    if (entityId)
      void readDocument<Scenario>(entityId)
        .then((doc) => {
          if (doc) {
            setScenario(doc.data);
            setId(doc.id);
            setRevision(doc.revision);
            setSaved(doc);
          }
        })
        .catch((reason) => setError(message(reason)));
  }, [entityId]);
  useEffect(() => {
    if (
      !scenario.endpoint.trim() &&
      !scenario.conditions.material.value.trim()
    ) {
      setMatches([]);
      setCoverage(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setUpdating(true);
      const query = {
        snapshot_id: snapshotId,
        text: [scenario.endpoint, scenario.conditions.material.value]
          .filter(Boolean)
          .join(" ")
          .slice(0, 500),
        limit: 50,
      };
      void Promise.all([
        post<{ items: RecordMatch[] }>(
          "/v1/discovery/records",
          query,
          controller.signal,
        ),
        post<Record<string, unknown>>(
          "/v1/evidence/condition-coverage",
          {
            query,
            axes: [
              {
                quantity_kind: "oxygen_fraction",
                kind: "numeric",
                canonical_unit: "1",
                bin_edges: [],
              },
              {
                quantity_kind: "pressure",
                kind: "numeric",
                canonical_unit: "Pa",
                bin_edges: [],
              },
            ],
          },
          controller.signal,
        ),
      ])
        .then(([records, coverage]) => {
          if (!controller.signal.aborted) {
            setMatches(records.items);
            setCoverage(coverage);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) setError(message(reason));
        })
        .finally(() => {
          if (!controller.signal.aborted) setUpdating(false);
        });
    }, 400);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [snapshotId, scenario.endpoint, scenario.conditions.material.value]);
  function change(key: string, part: Partial<Assumption>) {
    setScenario((previous) => ({
      ...previous,
      conditions: {
        ...previous.conditions,
        [key]: { ...previous.conditions[key], ...part },
      },
    }));
    setStale(true);
    setPassportStale(Boolean(passport));
  }
  async function save(copy = false) {
    try {
      const doc = await saveDocument<Scenario>(
        {
          id: copy ? undefined : id,
          kind: "scenario",
          title: scenario.title,
          snapshot_id: snapshotId,
          data: scenario,
        },
        copy ? undefined : revision,
      );
      setId(doc.id);
      setRevision(doc.revision);
      setSaved(doc);
      setVersions(await listDocuments<Scenario>("scenario"));
      updateContext({
        scenario: { ...scenario, id: doc.id, revision: doc.revision },
      });
      setNotice(
        "Scenario revision saved on this browser; missing assumptions remain explicit.",
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function calculate() {
    setError(null);
    try {
      const oxygen = Number(scenario.conditions.oxygen_fraction.value),
        pressure = Number(scenario.conditions.pressure.value);
      if (
        scenario.conditions.oxygen_fraction.value === "" ||
        scenario.conditions.pressure.value === ""
      )
        throw new Error(
          "Supply separate oxygen mole fraction and absolute pressure before calculating.",
        );
      const basis = scenario.conditions.oxygen_fraction.basis
        .toLowerCase()
        .trim();
      if (!["mole", "molar"].includes(basis))
        throw new Error(
          "This calculation requires an explicit mole-fraction basis; mass or unresolved composition cannot be substituted.",
        );
      if (
        scenario.conditions.pressure.basis.toLowerCase().trim() !== "absolute"
      )
        throw new Error(
          "An absolute pressure reference is required. Gauge pressure needs an independently documented reference conversion.",
        );
      const oxygenUnit = scenario.conditions.oxygen_fraction.unit.trim();
      if (!["%", "1", "fraction"].includes(oxygenUnit))
        throw new Error(
          "Declare oxygen as percent (%) or dimensionless mole fraction (1); no other composition unit is inferred.",
        );
      if (
        ["not_reported", "unresolved"].includes(
          scenario.conditions.oxygen_fraction.status,
        ) ||
        ["not_reported", "unresolved"].includes(
          scenario.conditions.pressure.status,
        )
      )
        throw new Error(
          "State supported or explicit nominal atmosphere assumptions before calculating; unresolved quantities remain unavailable.",
        );
      const result = await post<OxygenResult>(
        "/v1/calculations/oxygen-partial-pressure",
        {
          oxygen_percent: oxygenUnit === "%" ? oxygen : oxygen * 100,
          absolute_pressure: pressure,
          pressure_unit: scenario.conditions.pressure.unit,
          fraction_basis: "mole",
        },
      );
      setCalculation(result);
      setStale(false);
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function compare(match: RecordMatch) {
    selectedMatch.current = match;
    const version = ++comparisonVersion.current;
    setPassportStale(Boolean(passport));
    try {
      const userConditions: Record<string, unknown> = {};
      for (const [key, field] of Object.entries(scenario.conditions)) {
        if (
          !field.value ||
          ["not_reported", "unresolved"].includes(field.status)
        ) {
          userConditions[key] = {
            value: null,
            status:
              field.status === "unresolved" ? "unresolved" : "not_reported",
          };
          continue;
        }
        userConditions[key] = {
          value:
            field.unit && Number.isFinite(Number(field.value))
              ? Number(field.value)
              : field.value,
          unit: field.unit || null,
          status:
            field.status === "measured" && field.source
              ? "measured"
              : "nominal",
          reference_basis: field.basis || null,
          source_locator: field.source || `Personal scenario ${id ?? "draft"}`,
        };
      }
      const sourceConditions: Record<string, unknown> = {};
      for (const field of match.record.fields) {
        if (!field.quantity_kind) continue;
        sourceConditions[field.quantity_kind] =
          field.canonical_value === null ||
          !["measurement", "derived", "condition", "setting"].includes(
            field.source_value_kind ?? "",
          )
            ? {
                value: null,
                status:
                  field.status === "unresolved" ? "unresolved" : "not_reported",
              }
            : {
                value: field.canonical_value,
                unit: field.canonical_unit,
                status:
                  field.source_value_kind === "measurement"
                    ? "measured"
                    : field.source_value_kind === "derived"
                      ? "derived"
                      : "nominal",
                reference_basis: field.basis,
                source_locator: `${match.asset.sha256}:row:${match.record.source_row}:${field.source_column}`,
              };
      }
      const result = await post<Record<string, unknown>>(
        "/v1/methods/calculate",
        {
          method: "comparison",
          parameters: {
            profiles: [
              {
                run_id: `personal-scenario:${id ?? "draft"}`,
                conditions: userConditions,
                context: methodContext(
                  snapshotId,
                  "personal-scenario",
                  "Declared scenario assumptions",
                  "analyst_input",
                ),
              },
              {
                run_id: `${match.asset.sha256}:${match.record.source_row}`,
                conditions: sourceConditions,
                context: methodContext(
                  snapshotId,
                  match.accession,
                  `row:${match.record.source_row}`,
                  "measured",
                ),
              },
            ],
          },
        },
      );
      if (version === comparisonVersion.current) {
        setPassport(result);
        setPassportStale(false);
      }
    } catch (reason) {
      setError(message(reason));
    }
  }
  useEffect(() => {
    if (!selectedMatch.current) return;
    setPassportStale(true);
    const timer = setTimeout(() => {
      if (selectedMatch.current) void compare(selectedMatch.current);
    }, 400);
    return () => {
      clearTimeout(timer);
      comparisonVersion.current += 1;
    };
  }, [scenario.conditions]);
  async function findResearch() {
    if (!scenario.endpoint.trim() || finding) return;
    setFinding(true);
    setError(null);
    try {
      const known = Object.entries(scenario.conditions)
        .filter(([, item]) => item.value.trim())
        .map(
          ([key, item]) =>
            `${key.replaceAll("_", " ")}: ${item.value} ${item.unit} (${item.status.replaceAll("_", " ")}${item.source ? "; source: " + item.source : ""})`,
        )
        .join("; ");
      const question = `${scenario.endpoint.trim()}${known ? ". Conditions I want to study: " + known : ""}. Find and explain relevant NASA investigations, compare their actual experimental conditions with my question and cite the evidence. Separate research implications from established safety limits.`;
      const intent = await saveDocument({
        kind: "studio_intent",
        title: scenario.endpoint.slice(0, 100),
        snapshot_id: snapshotId,
        data: {
          question,
          snapshot_id: snapshotId,
          investigations: [],
          auto_submit: true,
        },
      });
      router.push(`/app/agent?intent=${intent.id}`);
    } catch (reason) {
      setError(message(reason));
      setFinding(false);
    }
  }
  const differences = Array.isArray(passport?.conditions)
    ? (passport.conditions as Record<string, unknown>[])
    : [];
  const compared = versions.find((doc) => doc.id === compareId);
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <div>
          <h2>Match research to your conditions</h2>
          <p>
            Start with the outcome you want to understand. Add the conditions
            you know, then inspect relevant source records.
          </p>
        </div>
        <div className={styles.actions}>
          <button className="button" onClick={() => save()}>
            <Save size={15} />
            Save scenario
          </button>
          {id && (
            <button className="button" onClick={() => save(true)}>
              <Copy size={15} />
              Duplicate
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className={styles.status} role="status">
          {notice}
        </p>
      )}
      <nav className={styles.tabs}>
        <button
          role="tab"
          aria-selected={tab === "assumptions"}
          onClick={() => setTab("assumptions")}
        >
          Question & evidence
        </button>
        <button
          role="tab"
          aria-selected={tab === "versions"}
          onClick={() => setTab("versions")}
        >
          Saved versions
        </button>
      </nav>
      {tab === "assumptions" ? (
        <div className={styles.split}>
          <section className={styles.stack}>
            <div className={styles.surface}>
              <details>
                <summary>Name this scenario (optional)</summary>
                <label className={styles.field}>
                  Scenario name
                  <input
                    value={scenario.title}
                    onChange={(event) =>
                      setScenario({ ...scenario, title: event.target.value })
                    }
                  />
                </label>
              </details>
              <label className={styles.field}>
                Starting conditions (optional)
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const preset = presets.data?.presets.find(
                      (item) => item.id === event.target.value,
                    );
                    if (!preset) return;
                    const next = blank();
                    next.title = preset.title;
                    next.environment = preset.id;
                    next.preset = preset;
                    if (preset.oxygen_percent !== null)
                      next.conditions.oxygen_fraction = {
                        value: String(preset.oxygen_percent),
                        unit: "%",
                        basis: "mole",
                        status: "nominal",
                        source: "Hypothetical example, not a mission standard",
                      };
                    if (preset.absolute_pressure !== null)
                      next.conditions.pressure = {
                        value: String(preset.absolute_pressure),
                        unit: preset.pressure_unit ?? "Pa",
                        basis: "absolute",
                        status: "nominal",
                        source: "Hypothetical example, not a mission standard",
                      };
                    setScenario(next);
                    setStale(true);
                  }}
                >
                  <option value="">
                    Choose a starting example, or enter your own conditions
                  </option>
                  {presets.data?.presets.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} · {item.status.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {scenario.preset !== undefined && (
                <details>
                  <summary>Preset origin and limitations</summary>
                  <pre className={styles.output}>
                    {JSON.stringify(scenario.preset, null, 2)}
                  </pre>
                </details>
              )}
              <label className={styles.field}>
                What outcome do you want to understand?
                <input
                  value={scenario.endpoint}
                  onChange={(event) =>
                    setScenario({ ...scenario, endpoint: event.target.value })
                  }
                  placeholder="For example, flame spread over a fabric sample"
                />
              </label>
              <div className={styles.actions}>
                <button
                  className="button button-primary"
                  disabled={!scenario.endpoint.trim() || finding}
                  onClick={() => void findResearch()}
                >
                  {finding
                    ? "Opening your research question…"
                    : "Find research for these conditions"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
            {sections.map((section) => (
              <details
                key={section.title}
                className={styles.surface}
                open={undefined}
              >
                <summary>
                  <strong>{section.title}</strong>
                </summary>
                <div className={styles.stack}>
                  {section.fields.map(([key, label]) => {
                    const value = scenario.conditions[key];
                    return (
                      <fieldset key={key} className={styles.stack}>
                        <legend>{label}</legend>
                        <div className={styles.fields}>
                          <label className={styles.field}>
                            {label}
                            <input
                              value={value.value}
                              onChange={(event) =>
                                change(key, {
                                  value: event.target.value,
                                  status: event.target.value
                                    ? "nominal"
                                    : "not_reported",
                                })
                              }
                            />
                          </label>
                          <label className={styles.field}>
                            Unit
                            <input
                              value={value.unit}
                              onChange={(event) =>
                                change(key, { unit: event.target.value })
                              }
                            />
                          </label>
                          <details className={styles.full}>
                            <summary>Source & interpretation details</summary>
                            <div className={styles.fields}>
                              <label className={styles.field}>
                                Basis / reference
                                <input
                                  value={value.basis}
                                  onChange={(event) =>
                                    change(key, { basis: event.target.value })
                                  }
                                />
                              </label>
                              <label className={styles.field}>
                                Source status
                                <select
                                  value={value.status}
                                  onChange={(event) =>
                                    change(key, { status: event.target.value })
                                  }
                                >
                                  <option value="not_reported">
                                    Unknown / not reported
                                  </option>
                                  <option value="nominal">
                                    Declared research assumption
                                  </option>
                                  <option value="measured">
                                    Source-backed measured value
                                  </option>
                                  <option value="unresolved">
                                    Unresolved / conflicting
                                  </option>
                                </select>
                              </label>
                              <label
                                className={`${styles.field} ${styles.full}`}
                              >
                                Supporting source / edition / date
                                <input
                                  value={value.source}
                                  onChange={(event) =>
                                    change(key, { source: event.target.value })
                                  }
                                />
                              </label>
                            </div>
                          </details>
                        </div>
                      </fieldset>
                    );
                  })}
                </div>
              </details>
            ))}
            <details className={styles.surface}>
              <summary>
                <strong>Calculate oxygen partial pressure</strong>
              </summary>
              <p>
                pO₂ = xO₂ × total absolute pressure. Oxygen input is percent by
                mole; pressure units must be supported by the calculation.
              </p>
              <button className="button" onClick={calculate}>
                Calculate partial pressure
              </button>
              {stale && calculation && (
                <p className={styles.warning}>
                  Atmosphere changed; prior calculation is stale.
                </p>
              )}
              {calculation && (
                <div className={styles.stack}>
                  <p className="calculated-value">
                    <strong>
                      {Number(calculation.value.toPrecision(12)).toString()}
                    </strong>
                    <span>{calculation.unit}</span>
                  </p>
                  <p>
                    {calculation.inputs.oxygen_percent}% oxygen ×{" "}
                    {calculation.inputs.absolute_pressure}{" "}
                    {calculation.inputs.pressure_unit} absolute
                  </p>
                  <p>{calculation.equation}</p>
                  <p className={styles.caption}>
                    Display rounded to twelve significant digits; saved inputs
                    and outputs retain full computational precision. Display
                    formatting does not establish measurement uncertainty.
                  </p>
                  <ul>
                    {[
                      ...calculation.assumptions,
                      ...calculation.limitations,
                    ].map((value, index) => (
                      <li key={index}>{value}</li>
                    ))}
                  </ul>
                  <button
                    className="button button-small"
                    disabled={stale}
                    onClick={() =>
                      fileDownload(
                        "oxygen-partial-pressure.json",
                        JSON.stringify(calculation, null, 2),
                      )
                    }
                  >
                    Export calculation
                  </button>
                  <details className={styles.details}>
                    <summary>
                      Calculation version, exact inputs and full precision
                    </summary>
                    <pre className={styles.output}>
                      {JSON.stringify(calculation, null, 2)}
                    </pre>
                  </details>
                </div>
              )}
              <p className={styles.caption}>
                Similar partial pressure does not establish equivalent
                flammability. A lunar or Martian context never rescales a
                microgravity measurement.
              </p>
            </details>
          </section>
          <section className={styles.stack} aria-busy={updating}>
            <div className={styles.surface}>
              <div className={styles.row}>
                <h2>Related source records</h2>
                {updating && (
                  <span className={styles.badge}>
                    Updating source candidates…
                  </span>
                )}
              </div>
              <p className={styles.caption}>
                These records match the words in your outcome or material.
                Compare the test conditions before using them for your question.
              </p>
              {matches.length === 0 ? (
                <p>
                  {!scenario.endpoint.trim() &&
                  !scenario.conditions.material.value.trim()
                    ? "Enter an outcome or material to look for source records. Use the research assistant to find and explain relevant investigations."
                    : "No source records match those exact terms. Find research with the assistant to explore related investigations and different terminology."}
                </p>
              ) : (
                <ul className={styles.list}>
                  {matches.map((match) => (
                    <li
                      key={`${match.asset.sha256}-${match.record.source_row}`}
                      className={styles.item}
                    >
                      <strong>
                        {match.accession} · physical row{" "}
                        {match.record.source_row}
                      </strong>
                      <p className={styles.caption}>{match.asset.file_name}</p>
                      <button
                        className="button button-small"
                        onClick={() => compare(match)}
                      >
                        Compare test conditions
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {passport && (
              <div className={styles.surface}>
                <h3>Condition comparison: {readable(passport.status)}</h3>
                {passportStale && (
                  <p className={styles.warning}>
                    Assumptions changed; updating this candidate's condition
                    passport. Its prior result remains visible until the
                    replacement is ready.
                  </p>
                )}
                <div className={styles.table}>
                  <table>
                    <thead>
                      <tr>
                        <th>Condition</th>
                        <th>State</th>
                        <th>Scientific consequence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {differences.map((item) => (
                        <tr key={String(item.field)}>
                          <th>{String(item.field).replaceAll("_", " ")}</th>
                          <td>{String(item.status)}</td>
                          <td>{String(item.explanation)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details>
                  <summary>Values, units, provenance and permitted use</summary>
                  <pre className={styles.output}>
                    {JSON.stringify(passport, null, 2)}
                  </pre>
                </details>
              </div>
            )}
            {coverage && (
              <div className={styles.surface}>
                <h3>Observed joint-condition coverage</h3>
                <p className={styles.caption}>
                  Only source-supported axis combinations are counted. Unknown
                  or empty regions never become zero risk.
                </p>
                <CoverageTable value={coverage} />
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className={styles.surface}>
          <h2>Scenario revisions</h2>
          <label className={styles.field}>
            Compare with another saved scenario
            <select
              value={compareId}
              onChange={(event) => setCompareId(event.target.value)}
            >
              <option value="">Select a saved scenario</option>
              {versions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · revision {item.revision}
                </option>
              ))}
            </select>
          </label>
          {compared && (
            <div className={styles.table}>
              <table>
                <thead>
                  <tr>
                    <th>Assumption</th>
                    <th>Current scenario</th>
                    <th>{compared.title}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(scenario.conditions).map((key) => (
                    <tr key={key}>
                      <th>{key.replaceAll("_", " ")}</th>
                      <td>
                        {scenario.conditions[key].value || "Unknown"}{" "}
                        {scenario.conditions[key].unit}
                      </td>
                      <td>
                        {compared.data.conditions?.[key]?.value || "Unknown"}{" "}
                        {compared.data.conditions?.[key]?.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {saved?.revisions.map((item) => (
            <div key={item.revision} className={styles.item}>
              <strong>
                Revision {item.revision} ·{" "}
                {new Date(item.saved_at).toLocaleString()}
              </strong>
              <button
                className="text-button"
                onClick={() => {
                  setScenario(item.data);
                  setStale(true);
                  setNotice(
                    "Prior assumptions restored into the draft. Saving creates a new revision.",
                  );
                }}
              >
                Restore into draft
              </button>
            </div>
          ))}
        </section>
      )}
      <div className={styles.actions}>
        <button
          className="button"
          onClick={() =>
            fileDownload(
              "research-scenario.json",
              JSON.stringify(
                {
                  scenario,
                  snapshot_id: snapshotId,
                  revision,
                  calculation,
                  passport,
                  coverage,
                },
                null,
                2,
              ),
            )
          }
        >
          <ArrowDownToLine size={15} />
          Export scenario and evidence context
        </button>
      </div>
    </div>
  );
}

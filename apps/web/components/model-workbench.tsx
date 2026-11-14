"use client";
import { useEffect, useState } from "react";
import { Save, Play, ArrowDownToLine } from "lucide-react";
import { useResource } from "../lib/api";
import {
  fileDownload,
  message,
  methodContext,
  post,
  type Job,
  type ValidatedChart,
} from "../lib/laboratory-api";
import { readDocument, saveDocument } from "../lib/workspace-documents";
import {
  ScientificMethodFields,
  emptyMethodValue,
  type MethodSchema,
} from "./scientific-method-form";
import { ScientificChart } from "./scientific-chart";
import { ArtifactView, isRecord } from "./artifact-view";
import { ScientificResult } from "./scientific-result";
import { JobMonitor } from "./job-monitor";
import styles from "./laboratory-workbench.module.css";

type Method = { id: string; title: string; schema: MethodSchema };
export function ModelWorkbench({
  snapshotId,
  entityId,
  sourceChart,
}: {
  snapshotId: string;
  entityId?: string;
  sourceChart?: ValidatedChart | null;
}) {
  const catalog = useResource<{ methods: Method[]; limitations: string[] }>(
    "/v1/methods",
  );
  const models = useResource<{
    regressions: Record<string, unknown>[];
    limitations?: string[];
  }>("/v1/models");
  const [tab, setTab] = useState("fits");
  const [methodId, setMethodId] = useState("trace-fit");
  const [parameters, setParameters] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [chart, setChart] = useState<ValidatedChart | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [revision, setRevision] = useState<number | undefined>();
  const [id, setId] = useState(entityId);
  const [selectedModel, setSelectedModel] = useState("");
  const [predictor, setPredictor] = useState("");
  const [conditions, setConditions] = useState<Record<string, unknown>>({});
  const [domain, setDomain] = useState<Record<string, unknown> | null>(null);
  const [restored, setRestored] = useState<Record<string, unknown> | null>(
    null,
  );
  const card = useResource<Record<string, unknown>>(
    selectedModel ? `/v1/models/${selectedModel}` : null,
  );
  const method = catalog.data?.methods.find((item) => item.id === methodId);
  useEffect(() => {
    if (!method) return;
    if (
      restored?.method === methodId &&
      restored.parameters &&
      typeof restored.parameters === "object"
    ) {
      setParameters(restored.parameters as Record<string, unknown>);
      return;
    }
    const initial = emptyMethodValue(method.schema, method.schema);
    setParameters({
      ...(initial as Record<string, unknown>),
      context: methodContext(
        snapshotId,
        "researcher-supplied-input",
        "Explicit manual research input",
        "analyst_input",
      ),
    });
    setResult(null);
    setChart(null);
    setStale(false);
  }, [method, snapshotId, restored, methodId]);
  useEffect(() => {
    if (entityId)
      void readDocument<Record<string, unknown>>(entityId)
        .then((doc) => {
          if (doc) {
            setRestored(doc.data);
            setId(doc.id);
            setRevision(doc.revision);
            if (typeof doc.data.method === "string")
              setMethodId(doc.data.method);
            if (doc.data.parameters && typeof doc.data.parameters === "object")
              setParameters(doc.data.parameters as Record<string, unknown>);
            if (typeof doc.data.job_id === "string") setJobId(doc.data.job_id);
            if (doc.data.result && typeof doc.data.result === "object")
              setResult(doc.data.result as Record<string, unknown>);
          }
        })
        .catch((reason) => setError(message(reason)));
  }, [entityId]);
  function changed(value: unknown) {
    setParameters(value as Record<string, unknown>);
    setStale(true);
  }
  async function run() {
    setBusy(true);
    setError(null);
    try {
      const value = await post<Record<string, unknown>>(
        "/v1/methods/calculate",
        { method: methodId, parameters },
      );
      if (typeof value.id === "string") {
        setJobId(value.id);
        setResult(null);
      } else setResult(value);
      setStale(false);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  async function view(
    view:
      | "fit"
      | "residual"
      | "interval"
      | "observed_predicted"
      | "track"
      | "boundary",
  ) {
    if (!jobId) return;
    setError(null);
    try {
      setChart(
        await post<ValidatedChart>("/v1/charts/method", {
          title: `${method?.title ?? "Registered result"} — ${view.replaceAll("_", " ")}`,
          job_ids: [jobId],
          view,
          x_scale: "linear",
          y_scale: "linear",
        }),
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  function importSelection() {
    if (!sourceChart || !("query" in sourceChart.spec)) return;
    const spec = sourceChart.spec;
    const query = spec.query;
    const points = sourceChart.data.values
      .filter(
        (row) =>
          typeof row[`column_${spec.x_column}`] === "number" &&
          typeof row[`column_${spec.y_column}`] === "number",
      )
      .map((row) => ({
        source_locator: `${query.asset_sha256}:row:${row.source_row}`,
        time: row[`column_${spec.x_column}`],
        value: row[`column_${spec.y_column}`],
        exclude_reason: null,
      }));
    setParameters((previous) => ({
      ...previous,
      points,
      time_unit: spec.x_unit ?? "",
      length_unit: spec.y_unit ?? "",
      context: {
        ...methodContext(
          snapshotId,
          query.asset_sha256,
          "Selected physical source rows",
          "measured",
        ),
        sources: [
          {
            source_id: sourceChart.data.asset.accession,
            locator: "Selected physical source rows",
            asset_sha256: query.asset_sha256,
          },
        ],
      },
    }));
    setStale(true);
    setNotice(
      "Source points copied with exact row anchors. Confirm units, calibration, interval and regime; no missing assumption has been supplied.",
    );
  }
  async function save() {
    try {
      const doc = await saveDocument(
        {
          id,
          kind: "analysis",
          title: method?.title ?? "Scientific method",
          snapshot_id: snapshotId,
          data: {
            surface: "models",
            method: methodId,
            parameters,
            result,
            job_id: jobId,
          },
        },
        revision,
      );
      setId(doc.id);
      setRevision(doc.revision);
      setNotice(
        "Saved with original inputs, method and result in this browser.",
      );
    } catch (reason) {
      setError(message(reason));
    }
  }
  async function checkDomain(predict = false) {
    setBusy(true);
    setError(null);
    try {
      const body = {
        predictor_value: Number(predictor),
        conditions,
        interval_level: 0.95,
        context: methodContext(
          snapshotId,
          "researcher-supplied-scenario",
          "Requested model input",
          "analyst_input",
        ),
      };
      const value = await post<Record<string, unknown>>(
        `/v1/models/${encodeURIComponent(selectedModel)}/${predict ? "predict" : "domain-check"}`,
        body,
      );
      if (predict) setResult(value);
      else setDomain(value);
    } catch (reason) {
      setError(message(reason));
    } finally {
      setBusy(false);
    }
  }
  const model = models.data?.regressions.find(
    (item) => item.id === selectedModel || item.identifier === selectedModel,
  );
  return (
    <div className={styles.stack}>
      <section className={styles.surface}>
        <div className={styles.row}>
          <div>
            <h2>Methods and modeling</h2>
            <p className={styles.caption}>
              Registered calculations keep measurements, assumptions,
              descriptive fits and qualified predictions distinct.
            </p>
          </div>
          <button className="button" onClick={save}>
            <Save size={16} />
            Save research draft
          </button>
        </div>
        <nav className={styles.tabs} aria-label="Model laboratory">
          <button
            role="tab"
            aria-selected={tab === "fits"}
            onClick={() => {
              setTab("fits");
              setMethodId("trace-fit");
            }}
          >
            Measured-trace fits
          </button>
          <button
            role="tab"
            aria-selected={tab === "library"}
            onClick={() => setTab("library")}
          >
            Scientific method library
          </button>
          <button
            role="tab"
            aria-selected={tab === "predictions"}
            onClick={() => setTab("predictions")}
          >
            Qualified predictions
          </button>
        </nav>
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
        {stale && (
          <p className={styles.warning}>
            Inputs changed. The previous result is retained for inspection and
            is not current.
          </p>
        )}
        {tab !== "predictions" ? (
          <>
            <label className={styles.field}>
              Registered method
              <select
                value={methodId}
                onChange={(event) => {
                  setRestored(null);
                  setMethodId(event.target.value);
                }}
              >
                {catalog.data?.methods
                  .filter(
                    (item) => tab === "library" || item.id === "trace-fit",
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
            {methodId === "trace-fit" && (
              <>
                <p className={styles.status}>
                  Fit calibrated front position against time or measured droplet
                  diameter squared against time over a declared regime. These
                  are descriptions of this run. Within-trace fit quality does
                  not establish a prediction for another run.
                </p>
                <button
                  className="button button-small"
                  disabled={!sourceChart}
                  onClick={importSelection}
                >
                  Use selected chart points with source anchors
                </button>
              </>
            )}
            {catalog.loading ? (
              <div className={styles.skeleton} />
            ) : (
              method && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void run();
                  }}
                  className={styles.stack}
                >
                  <ScientificMethodFields
                    schema={method.schema}
                    root={method.schema}
                    value={parameters}
                    onChange={changed}
                    label={method.title}
                  />
                  <div className={styles.actions}>
                    <button
                      className="button button-primary"
                      type="submit"
                      disabled={busy}
                    >
                      <Play size={15} />
                      {busy
                        ? "Submitting registered calculation…"
                        : "Run selected method"}
                    </button>
                    <button
                      type="button"
                      className="button"
                      onClick={() =>
                        fileDownload(
                          "method-inputs.json",
                          JSON.stringify(
                            { method: methodId, parameters },
                            null,
                            2,
                          ),
                        )
                      }
                    >
                      <ArrowDownToLine size={15} />
                      Export exact inputs
                    </button>
                  </div>
                </form>
              )
            )}
          </>
        ) : (
          <>
            <p className={styles.status}>
              Sequence: select a registered model, inspect its held-out evidence
              and domain, check the requested conditions, then execute
              explicitly. A source with insufficient support returns a reason
              without a validated value.
            </p>
            {models.loading ? (
              <div className={styles.skeleton} />
            ) : !models.data?.regressions.length ? (
              <div className={styles.empty}>
                <h3>No qualified NASA predictor is activated</h3>
                <p>
                  Source-specific descriptive fits remain available.
                  Registration requires independent grouped evaluation,
                  justified intervals and a complete supported condition domain.
                </p>
              </div>
            ) : (
              <div className={styles.fields}>
                <label className={styles.field}>
                  Registered model
                  <select
                    value={selectedModel}
                    onChange={(event) => {
                      setSelectedModel(event.target.value);
                      setDomain(null);
                      setConditions({});
                    }}
                  >
                    <option value="">Select a model</option>
                    {models.data.regressions.map((item) => (
                      <option
                        key={String(item.id ?? item.identifier)}
                        value={String(item.id ?? item.identifier)}
                      >
                        {String(item.title ?? item.id ?? item.identifier)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  Predictor value in the model's stated unit
                  <input
                    type="number"
                    step="any"
                    value={predictor}
                    onChange={(event) => {
                      setPredictor(event.target.value);
                      setDomain(null);
                    }}
                  />
                </label>
                <div className={styles.full}>
                  <ScientificMethodFields
                    schema={{
                      type: "object",
                      additionalProperties: { type: "string" },
                    }}
                    root={{}}
                    value={conditions}
                    onChange={(value) => {
                      setConditions(value as Record<string, unknown>);
                      setDomain(null);
                    }}
                    label="Exact joint scientific conditions"
                  />
                </div>
                <div className={styles.actions}>
                  <button
                    className="button"
                    disabled={busy || !selectedModel || predictor === ""}
                    onClick={() => checkDomain()}
                  >
                    Check supported domain
                  </button>
                  <button
                    className="button button-primary"
                    disabled={busy || !domain || domain.status !== "predicted"}
                    onClick={() => checkDomain(true)}
                  >
                    Execute requested prediction
                  </button>
                </div>
              </div>
            )}
            {model && (
              <details className={styles.details}>
                <summary>
                  Model version, validation evidence and supported conditions
                </summary>
                <ScientificResult
                  value={
                    card.data && isRecord(card.data.card)
                      ? card.data.card
                      : (card.data ?? model)
                  }
                />
                {card.data &&
                  isRecord(card.data.card) &&
                  isRecord(card.data.card.request) &&
                  isRecord(card.data.card.request.protocol) && (
                    <>
                      <h3>Declared supported protocol</h3>
                      <dl>
                        {Object.entries(card.data.card.request.protocol)
                          .filter(([, value]) => typeof value !== "object")
                          .map(([key, value]) => (
                            <div key={key}>
                              <dt>{key.replaceAll("_", " ")}</dt>
                              <dd>{String(value)}</dd>
                            </div>
                          ))}
                      </dl>
                      <button
                        className="button button-small"
                        onClick={() => {
                          const protocol = (
                            (card.data!.card as Record<string, unknown>)
                              .request as Record<string, unknown>
                          ).protocol as Record<string, unknown>;
                          if (isRecord(protocol.fixed_conditions))
                            setConditions(protocol.fixed_conditions);
                          setDomain(null);
                        }}
                      >
                        Copy the model's declared fixed conditions for review
                      </button>
                    </>
                  )}
              </details>
            )}
            {domain && (
              <div className={styles.status}>
                <h3>Domain check</h3>
                <ScientificResult value={domain} />
              </div>
            )}
          </>
        )}
      </section>
      {jobId && (
        <>
          <JobMonitor
            id={jobId}
            onComplete={(job) => {
              if (job.result) setResult(job.result);
            }}
          />
          <div className={styles.actions}>
            {(
              [
                "fit",
                "residual",
                "interval",
                "observed_predicted",
                "track",
                "boundary",
              ] as const
            ).map((value) => (
              <button
                key={value}
                className="button button-small"
                disabled={stale}
                onClick={() => view(value)}
              >
                {value.replaceAll("_", " ")} view
              </button>
            ))}
          </div>
        </>
      )}
      {chart && (
        <div className={styles.surface}>
          <ScientificChart chart={chart} />
        </div>
      )}
      {result && (
        <section className={styles.surface}>
          <h2>Result, assumptions and limitations</h2>
          {typeof result.status === "string" && (
            <p className={styles.status}>
              {result.status.replaceAll("_", " ")}
            </p>
          )}
          <ScientificResult value={result} />
          <button
            className="button"
            disabled={stale}
            onClick={() =>
              fileDownload(
                "scientific-result.json",
                JSON.stringify(
                  { method: methodId, parameters, result },
                  null,
                  2,
                ),
              )
            }
          >
            Export source-linked result
          </button>
        </section>
      )}
    </div>
  );
}

"use client";
import { isInvestigationId } from "../lib/investigation-identifiers";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { Investigation, useResource } from "../lib/api";
import {
  RecordHit,
  recordIdentity,
  sensitivityScore,
  runHref,
} from "../lib/discovery-helpers";
import {
  readDocument,
  saveDocument,
  WorkspaceDocument,
} from "../lib/workspace-documents";
import { useResearchContext } from "../lib/research-context";
import { ErrorState, LoadingRows } from "./chrome";
import {
  Anchor,
  CompiledQuery,
  Empty,
  errorMessage,
  human,
  Limitations,
  post,
  SourceInspector,
  useQuery,
} from "./workbench-common";
import s from "./workbench.module.css";
import journey from "./research-journey.module.css";

type Condition = {
  value?: string | number | null;
  unit?: string | null;
  reference_basis?: string | null;
  source_locator?: string | null;
  status: string;
};
type Profile = {
  run_id: string;
  independent_unit_id: string | null;
  dependency_group_id: string | null;
  conditions: Record<string, Condition>;
  context: {
    input_origin: string;
    sources: { source_id: string; locator: string; asset_sha256?: string }[];
    source_snapshot: string;
  };
};
type Difference = {
  field: string;
  status: string;
  explanation: string;
  critical: boolean;
  values_by_run: Record<string, Condition | null>;
};
type Comparison = {
  method_id: string;
  status: string;
  conditions: Difference[];
  suitability: Record<string, string>;
  independent_unit_count: number | null;
  limitations: string[];
};
type StoredComparison = {
  level?: string;
  items?: (Investigation | RecordHit)[];
  investigation_ids?: string[];
  profiles?: Profile[];
  result?: Comparison;
  question?: string;
  notes?: Record<string, string>;
  weights?: Record<string, number>;
  assessments?: Record<string, Assessment>;
  ranking_mode?: string;
  ranking_signature?: string;
  ranking_result?: {
    items: {
      item_id: string;
      score: number | null;
      missing_components: string[];
    }[];
    limitations: string[];
  } | null;
};
const relevance = {
  question_outcome: 0.3,
  material_geometry: 0.25,
  environment: 0.25,
  measurement: 0.1,
  scale_protocol: 0.1,
};
const applicability = {
  endpoint: 0.25,
  material_geometry: 0.2,
  atmosphere: 0.2,
  flow_gravity: 0.2,
  apparatus_measurement: 0.15,
};
type Assessment = {
  components: Record<string, string>;
  evidence: Record<string, string>;
  support: string;
  readiness: string;
  readinessReason?: string;
  supportReason?: string;
};
function profile(id: string, snapshot: string, source?: RecordHit): Profile {
  return {
    run_id: id,
    independent_unit_id: null,
    dependency_group_id: null,
    conditions: {},
    context: {
      input_origin: "analyst_input",
      source_snapshot: snapshot,
      sources: [
        {
          source_id: source?.asset.id ?? id,
          locator: source
            ? "Physical source line " + source.record.source_row
            : "Investigation-level selection; run conditions remain unresolved",
          ...(source ? { asset_sha256: source.asset.sha256 } : {}),
        },
      ],
    },
  };
}
function formatCondition(value: Condition | null) {
  if (!value || value.status === "not_reported") return "Not reported";
  if (value.value === null || value.value === undefined)
    return human(value.status);
  return (
    String(value.value) +
    (value.unit ? " " + value.unit : "") +
    " · " +
    human(value.status)
  );
}
export function ComparisonWorkbench({
  id,
  snapshotId,
  investigationIds = [],
}: {
  id?: string;
  snapshotId: string;
  investigationIds?: string[];
}) {
  const { updateContext } = useResearchContext();
  const router = useRouter();
  const catalog = useResource<{ items: Investigation[] }>(
    "/v1/investigations?limit=100&snapshot_id=" + snapshotId,
  );
  const [document, setDocument] =
    useState<WorkspaceDocument<StoredComparison> | null>(null);
  const [loaded, setLoaded] = useState(!id || id === "new");
  const [selected, setSelected] = useState<string[]>(investigationIds);
  const [recordItems, setRecordItems] = useState<RecordHit[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>(
    investigationIds.map((value) => profile(value, snapshotId)),
  );
  const [question, setQuestion] = useState("");
  const [title, setTitle] = useState("Scientific evidence comparison");
  const [view, setView] = useState("side");
  const [allFields, setAllFields] = useState(false);
  const [selectedField, setSelectedField] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [editItem, setEditItem] = useState("");
  const [field, setField] = useState("oxygen_fraction");
  const [condition, setCondition] = useState<Condition>({
    status: "not_reported",
    value: "",
    unit: "",
    reference_basis: "",
    source_locator: "",
  });
  const [numberValue, setNumberValue] = useState(false);
  const [rankingSignature, setRankingSignature] = useState("");
  const [rankingMode, setRankingMode] = useState("relevance");
  const [assessments, setAssessments] = useState<Record<string, Assessment>>(
    {},
  );
  const [weights, setWeights] = useState<Record<string, number>>({
    ...relevance,
  });
  const [rankResult, setRankResult] = useState<{
    items: {
      item_id: string;
      score: number | null;
      missing_components: string[];
    }[];
    limitations: string[];
  } | null>(null);
  const rankingInputs = JSON.stringify({
    assessments,
    weights,
    rankingMode,
    snapshotId,
  });
  const result = useQuery<Comparison>(
    "/v1/methods/calculate",
    { method: "comparison", parameters: { profiles } },
    loaded && profiles.length >= 2,
  );
  const data = result.data;
  const names = new Map(
    (catalog.data?.items ?? []).map((item) => [
      item.accession,
      item.acronym || item.title,
    ]),
  );
  const ids = profiles.map((item) => item.run_id);
  for (const item of recordItems)
    names.set(
      recordIdentity(item),
      item.accession +
        " · line " +
        item.record.source_row +
        " · " +
        item.asset.file_name,
    );
  const baseWeights: Record<string, number> =
    rankingMode === "applicability" ? applicability : relevance;
  useEffect(() => {
    if (!id || id === "new") {
      const routeIds = new URLSearchParams(window.location.search)
        .get("ids")
        ?.split(",")
        .filter(isInvestigationId);
      if (routeIds?.length && !investigationIds.length) {
        setSelected(routeIds);
        setProfiles(routeIds.map((value) => profile(value, snapshotId)));
      }
      return;
    }
    let active = true;
    readDocument<StoredComparison>(id)
      .then((value) => {
        if (!active) return;
        if (!value)
          throw new Error(
            "This saved comparison is unavailable. Restore a research backup or choose investigations to start again.",
          );
        setDocument(value);
        setTitle(value.title);
        setQuestion(value.data.question ?? "");
        setNotes(value.data.notes ?? {});
        setAssessments(value.data.assessments ?? {});
        setRankingMode(value.data.ranking_mode ?? "relevance");
        setWeights(value.data.weights ?? relevance);
        setRankResult(value.data.ranking_result ?? null);
        setRankingSignature(value.data.ranking_signature ?? "");
        if (value.snapshot_id !== snapshotId) {
          setProblem(
            "This comparison belongs to another source snapshot. Open its frozen snapshot before editing it.",
          );
          setLoaded(true);
          return;
        }
        const records = (value.data.items ?? []).filter(
          (item): item is RecordHit => "record" in item,
        );
        setRecordItems(records);
        const next =
          value.data.investigation_ids ??
          (value.data.items ?? []).map((item) => item.accession);
        setSelected([...new Set(next)]);
        const restored =
          value.data.profiles ??
          (records.length
            ? records.map((item) =>
                profile(recordIdentity(item), snapshotId, item),
              )
            : [...new Set(next)].map((item) => profile(item, snapshotId)));
        setProfiles(restored);
        setView(restored.length > 2 ? "matrix" : "side");
        setLoaded(true);
      })
      .catch((reason) => {
        if (active) {
          setProblem(errorMessage(reason));
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [id, snapshotId]);
  function select(accession: string) {
    const next = selected.includes(accession)
      ? selected.filter((value) => value !== accession)
      : [...selected, accession];
    if (next.length > 8) {
      setProblem(
        "Select up to eight investigations for this matrix; keep larger selections as a collection.",
      );
      return;
    }
    if (next.length > 2) setView("matrix");
    setProblem("");
    setSelected(next);
    setProfiles(
      next.map(
        (value) =>
          profiles.find((item) => item.run_id === value) ??
          profile(value, snapshotId),
      ),
    );
    updateContext({ investigations: next });
  }
  async function save() {
    try {
      if (
        profiles.length >= 2 &&
        result.resolvedRequest !==
          JSON.stringify({ method: "comparison", parameters: { profiles } })
      )
        throw new Error(
          "Wait for the current comparison to finish before freezing its inputs and result together.",
        );
      const value = await saveDocument<StoredComparison>({
        id: document?.id,
        revision: document?.revision,
        kind: "comparison",
        title,
        snapshot_id: snapshotId,
        data: {
          level: recordItems.length ? "records" : "investigations",
          items: recordItems.length ? recordItems : undefined,
          investigation_ids: selected,
          profiles,
          result: data ?? undefined,
          question,
          notes,
          weights,
          assessments,
          ranking_mode: rankingMode,
          ranking_result: rankResult,
          ranking_signature: rankingSignature,
        },
      });
      setDocument(value);
      setMessage(
        "Frozen comparison revision " +
          value.revision +
          " saved in this browser.",
      );
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  function addCondition() {
    if (!editItem) {
      setProblem("Choose the source item whose condition you are recording.");
      return;
    }
    const known = ["measured", "nominal", "derived"].includes(condition.status);
    if (
      known &&
      (!String(condition.value).trim() ||
        !condition.source_locator?.trim() ||
        !condition.reference_basis?.trim())
    ) {
      setProblem(
        "A known condition requires its value, source locator, and reference basis/location.",
      );
      return;
    }
    if (
      known &&
      numberValue &&
      (!condition.unit || !Number.isFinite(Number(condition.value)))
    ) {
      setProblem(
        "Enter a finite numerical condition and its physical unit, including 1 for dimensionless values.",
      );
      return;
    }
    const next: Condition = {
      ...condition,
      value: known
        ? numberValue
          ? Number(condition.value)
          : String(condition.value)
        : null,
    };
    setProfiles((values) =>
      values.map((item) =>
        item.run_id === editItem
          ? { ...item, conditions: { ...item.conditions, [field]: next } }
          : item,
      ),
    );
    setProblem("");
    setMessage(
      "Source-backed condition added to this draft; save a revision to freeze it.",
    );
  }
  function assess(
    itemId: string,
    key: string,
    value: string,
    explanation = false,
  ) {
    setAssessments((current) => {
      const previous = current[itemId] ?? {
        components: {},
        evidence: {},
        support: "unknown",
        readiness: "unknown",
      };
      return {
        ...current,
        [itemId]: explanation
          ? { ...previous, evidence: { ...previous.evidence, [key]: value } }
          : {
              ...previous,
              components: { ...previous.components, [key]: value },
            },
      };
    });
  }
  async function rank() {
    try {
      const candidates = ids.map((itemId) => {
        const entry = assessments[itemId] ?? {
          components: {},
          evidence: {},
          support: "unknown",
          readiness: "unknown",
        };
        const components = Object.fromEntries(
          Object.keys(baseWeights).map((name) => {
            const value = entry.components[name];
            if (
              value &&
              (!Number.isFinite(Number(value)) ||
                Number(value) < 0 ||
                Number(value) > 1)
            )
              throw new Error(
                "Ranking components must be between 0 and 1, or left unknown.",
              );
            if (value && !entry.evidence[name]?.trim())
              throw new Error(
                "Explain the evidence for each supplied ranking component; unknowns are not silently scored.",
              );
            return [name, value ? Number(value) : null];
          }),
        );
        return {
          item_id: itemId,
          exact_filters_passed: true,
          components,
          component_evidence: entry.evidence,
          evidence_support: entry.support,
          modeling_readiness: entry.readiness,
          critical_mismatches: [],
        };
      });
      const ranked = await post<NonNullable<typeof rankResult>>(
        "/v1/methods/calculate",
        {
          method: "ranking",
          parameters: {
            policy:
              rankingMode === "applicability"
                ? "scenario-applicability-v1"
                : "question-relevance-v1",
            candidates,
            context: {
              input_origin: "analyst_input",
              source_snapshot: snapshotId,
              sources: [
                {
                  source_id: document?.id ?? "selected-comparison",
                  locator:
                    "Explicit researcher ranking inputs and evidence explanations",
                },
              ],
            },
          },
        },
      );
      setRankResult(ranked);
      setRankingSignature(rankingInputs);
      setProblem("");
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  const weightTotal = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  );
  const sensitivity = ids
    .map((itemId) => ({
      itemId,
      ...sensitivityScore(
        Object.fromEntries(
          Object.keys(weights).map((name) => [
            name,
            assessments[itemId]?.components[name]
              ? Number(assessments[itemId].components[name])
              : null,
          ]),
        ),
        weights,
      ),
    }))
    .sort(
      (left, right) =>
        right.lower - left.lower || left.itemId.localeCompare(right.itemId),
    );
  const visible =
    data?.conditions.filter((item) => allFields || item.status !== "matched") ??
    [];
  const plotted = data?.conditions.find((item) => item.field === selectedField);
  const plottedValues = ids.map((item) => plotted?.values_by_run[item]);
  const plotAllowed =
    plottedValues.length > 1 &&
    plottedValues.every(
      (item) =>
        typeof item?.value === "number" &&
        item.unit === plottedValues[0]?.unit &&
        item.reference_basis === plottedValues[0]?.reference_basis,
    );
  if (!loaded) return <LoadingRows label="Opening the saved comparison" />;
  return (
    <section className={s.workbench}>
      <div className="page-heading">
        <div>
          <h1>Compare the evidence</h1>
          <p>
            See what investigations study, how their approaches differ, and
            which evidence fits your question.
          </p>
        </div>
        <button
          className="button"
          onClick={() => void save()}
          disabled={
            Boolean(document && document.snapshot_id !== snapshotId) ||
            profiles.length < 2
          }
        >
          <Save size={16} /> Save comparison
        </button>
      </div>
      {profiles.length < 2 && (
        <p className={journey.intro}>
          Choose at least two investigations to read their purpose and methods
          side by side. For numerical comparisons, check that materials,
          conditions and outcome definitions match.
        </p>
      )}
      {problem && (
        <div role="alert" className={s.error}>
          {problem}
          {document?.snapshot_id !== snapshotId && document?.snapshot_id && (
            <Link
              href={
                "/app/compare/" +
                document.id +
                "?snapshot=" +
                document.snapshot_id
              }
            >
              Open the saved snapshot
            </Link>
          )}
        </div>
      )}
      {message && (
        <p role="status" className={s.success}>
          {message}
        </p>
      )}
      <label className={s.field}>
        What would you like to compare?
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="For example: how do these investigations study flame extinction?"
        />
      </label>
      {!recordItems.length && (
        <details className={s.surface} open={profiles.length < 2}>
          <summary>
            {profiles.length < 2
              ? "Choose investigations to compare"
              : "Change selected investigations"}{" "}
            ({selected.length}/8)
          </summary>
          {catalog.error && (
            <ErrorState message={catalog.error} retry={catalog.reload} />
          )}
          {catalog.loading && <LoadingRows label="Finding investigations" />}
          <div className={journey.comparisonPicker}>
            {catalog.data?.items.map((item) => (
              <label className={journey.comparisonChoice} key={item.accession}>
                <input
                  type="checkbox"
                  checked={selected.includes(item.accession)}
                  onChange={() => select(item.accession)}
                />{" "}
                <span>
                  <strong>{item.acronym || item.accession}</strong>
                  <small>{item.title}</small>
                </span>
              </label>
            ))}
          </div>
        </details>
      )}
      {!recordItems.length && selected.length >= 2 && catalog.data && (
        <section className={journey.researchSummary}>
          <h2>Research side by side</h2>
          <div className={s.scroll}>
            <table className={s.table + " " + journey.comparisonTable}>
              <thead>
                <tr>
                  <th scope="col">Research context</th>
                  {selected.map((accession) => {
                    const item = (catalog.data?.items ?? []).find(
                      (value) => value.accession === accession,
                    );
                    return (
                      <th scope="col" key={accession}>
                        <Link
                          href={`/app/investigations/${accession}?snapshot=${snapshotId}`}
                        >
                          {item?.acronym || accession}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Question and purpose", "objective"],
                    ["Approach", "approach"],
                    ["Platform", "platform"],
                    ["Hardware", "hardware"],
                  ] as const
                ).map(([label, field]) => (
                  <tr key={field}>
                    <th scope="row">{label}</th>
                    {selected.map((accession) => {
                      const item = (catalog.data?.items ?? []).find(
                        (value) => value.accession === accession,
                      );
                      return (
                        <td key={accession}>
                          {item?.[field] ? (
                            <>
                              <p>
                                {item[field].length > 420
                                  ? item[field]
                                      .slice(0, 420)
                                      .replace(/\s+\S*$/, "") + "…"
                                  : item[field]}
                              </p>
                              {item[field].length > 420 && (
                                <details className={journey.sourceDetails}>
                                  <summary>Full source wording</summary>
                                  <p>{item[field]}</p>
                                </details>
                              )}
                            </>
                          ) : (
                            "Not described in the catalog. Open the investigation’s sources for details."
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Explore further</th>
                  {selected.map((accession) => (
                    <td key={accession}>
                      <Link
                        href={`/app/investigations/${accession}?section=runs&snapshot=${snapshotId}`}
                      >
                        Explore data <ArrowRight size={14} />
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className={s.help}>
            These are source-reported research aims and methods. Similar aims do
            not establish matching test conditions or interchangeable results.
          </p>
          <button
            className="button button-primary"
            onClick={() => {
              void saveDocument({
                kind: "studio_intent",
                title: question || "Compare selected research",
                snapshot_id: snapshotId,
                data: {
                  question:
                    question ||
                    `Compare ${selected.join(" and ")}. Explain their research questions, available evidence and important experimental differences. Cite the sources and identify which comparisons the evidence supports.`,
                  investigations: selected,
                  snapshot_id: snapshotId,
                  auto_submit: true,
                },
              })
                .then((intent) => router.push(`/app/agent?intent=${intent.id}`))
                .catch((reason) => setProblem(errorMessage(reason)));
            }}
          >
            Ask about these investigations <ArrowRight size={16} />
          </button>
        </section>
      )}
      {profiles.length < 2 ? (
        <Empty>
          {profiles.length === 1
            ? "One investigation selected. Choose another above to see them side by side."
            : "Choose two investigations above, or explore the catalog to find research for your question."}
          <Link className="text-button" href="/app/investigations">
            Explore investigations <ArrowRight size={15} />
          </Link>
        </Empty>
      ) : result.error ? (
        <ErrorState message={result.error} retry={result.reload} />
      ) : !data ? (
        <LoadingRows label="Assessing explicit condition profiles" />
      ) : (
        <details
          className={journey.advanced}
          open={recordItems.length > 0 ? true : undefined}
        >
          <summary>Check experimental comparability and rank evidence</summary>
          <div className={journey.advancedBody}>
            <p className={s.help}>
              Use this assessment when comparing measurements. Add source-backed
              conditions below; missing conditions remain unresolved.
            </p>
            {recordItems.length > 0 && (
              <div className={s.actions}>
                <button
                  className="button"
                  aria-pressed={view === "side"}
                  disabled={profiles.length > 2}
                  onClick={() => setView("side")}
                >
                  Side by side
                </button>
                <button
                  className="button"
                  aria-pressed={view === "matrix"}
                  onClick={() => setView("matrix")}
                >
                  Condition matrix
                </button>
              </div>
            )}
            <section className={s.notice} aria-live="polite">
              <h2>Measurement comparison: {human(data.status)}</h2>
              <div className={s.chips}>
                {Object.entries(data.suitability).map(([name, value]) => (
                  <span className={s.chip} key={name}>
                    {human(name)}: <strong>{human(value)}</strong>
                  </span>
                ))}
              </div>
              <p>
                Independent units:{" "}
                {data.independent_unit_count ?? "not established"}. A shared
                acronym, platform, or apparatus does not establish equivalent
                conditions.
                {result.loading
                  ? " Updating; the previous assessment remains visible."
                  : ""}
              </p>
            </section>
            {view === "side" && profiles.length === 2 && (
              <div className={s.twoColumns}>
                {profiles.map((item) => (
                  <section className={s.surface} key={item.run_id}>
                    <h2>{names.get(item.run_id) || item.run_id}</h2>
                    <p>
                      {recordItems
                        .find((value) => item.run_id === recordIdentity(value))
                        ?.record.raw_cells.filter(Boolean)
                        .slice(0, 5)
                        .join(" · ") ||
                        "Investigation-level source; select run-level evidence to resolve physical conditions."}
                    </p>
                    <Link
                      href={
                        "/app/investigations/" +
                        (recordItems.find(
                          (value) => recordIdentity(value) === item.run_id,
                        )?.accession ?? item.run_id) +
                        "?snapshot=" +
                        snapshotId
                      }
                    >
                      Inspect the parent investigation
                    </Link>
                    {recordItems.find(
                      (value) => recordIdentity(value) === item.run_id,
                    ) && (
                      <Link
                        href={runHref(
                          recordItems.find(
                            (value) => recordIdentity(value) === item.run_id,
                          )!,
                          snapshotId,
                        )}
                      >
                        Inspect this exact source record
                      </Link>
                    )}
                  </section>
                ))}
              </div>
            )}
            <div className={s.toolbar}>
              <h2>Condition difference matrix</h2>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={allFields}
                  onChange={(event) => setAllFields(event.target.checked)}
                />{" "}
                Show all attributes, including matches
              </label>
            </div>
            <div className={s.scroll}>
              <table className={s.table + " " + s.matrix}>
                <thead>
                  <tr>
                    <th scope="col">Attribute</th>
                    {ids.map((item) => (
                      <th scope="col" key={item}>
                        {names.get(item) || item}
                      </th>
                    ))}
                    <th scope="col">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.field}
                      data-state={
                        selectedField === row.field ? "selected" : row.status
                      }
                    >
                      <td>
                        <button
                          className="text-button"
                          onClick={() => setSelectedField(row.field)}
                        >
                          {human(row.field)}
                        </button>
                        <small>{human(row.status)}</small>
                      </td>
                      {ids.map((item) => (
                        <td key={item}>
                          {formatCondition(row.values_by_run[item])}
                          {row.values_by_run[item]?.source_locator && (
                            <small>
                              {row.values_by_run[item]?.source_locator}
                            </small>
                          )}
                        </td>
                      ))}
                      <td>
                        <p>{row.explanation}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedField && (
              <section className={s.surface}>
                <h2>{human(selectedField)}</h2>
                <p>{plotted?.explanation}</p>
                <label className={s.field}>
                  Personal note on this mismatch
                  <textarea
                    value={notes[selectedField] ?? ""}
                    onChange={(event) =>
                      setNotes((value) => ({
                        ...value,
                        [selectedField]: event.target.value,
                      }))
                    }
                  />
                </label>
                {plotAllowed ? (
                  <div>
                    <h3>Reported values in matched representations</h3>
                    <svg
                      viewBox="0 0 520 180"
                      role="img"
                      aria-label={
                        "Point plot of " +
                        human(selectedField) +
                        "; values are also in the condition matrix."
                      }
                      style={{ width: "100%", maxWidth: 680 }}
                    >
                      <line
                        x1="100"
                        x2="480"
                        y1="150"
                        y2="150"
                        stroke="currentColor"
                      />
                      {plottedValues.map((value, index) => {
                        const numbers = plottedValues.map((item) =>
                          Number(item?.value),
                        );
                        const minimum = Math.min(...numbers),
                          maximum = Math.max(...numbers);
                        const x =
                          100 +
                          (maximum === minimum
                            ? 0.5
                            : (Number(value?.value) - minimum) /
                              (maximum - minimum)) *
                            360;
                        return (
                          <g key={index}>
                            <text
                              x="2"
                              y={30 + index * 20}
                              fill="currentColor"
                              fontSize="11"
                            >
                              {ids[index]}
                            </text>
                            <circle
                              cx={x}
                              cy={26 + index * 20}
                              r="5"
                              fill="var(--action)"
                            />
                            <text
                              x={x + 8}
                              y={30 + index * 20}
                              fill="currentColor"
                              fontSize="11"
                            >
                              {value?.value} {value?.unit}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                    <p className={s.help}>
                      Only supplied scalar values are plotted. No curve, causal
                      effect or new uncertainty interval was inferred.
                    </p>
                  </div>
                ) : (
                  <Empty>
                    No matched numerical series is available for this row.
                    Inspect original data or enter the source-backed condition
                    before plotting compatible values.
                  </Empty>
                )}
              </section>
            )}
            <details className={s.surface}>
              <summary>
                Resolve a source-backed condition or independent-unit identity
              </summary>
              <div className={s.form}>
                <div className={s.fieldGrid}>
                  <label className={s.field}>
                    Selected source
                    <select
                      value={editItem}
                      onChange={(event) => setEditItem(event.target.value)}
                    >
                      <option value="">Choose a source item</option>
                      {ids.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className={s.field}>
                    Condition
                    <select
                      value={field}
                      onChange={(event) => setField(event.target.value)}
                    >
                      {data.conditions.map((item) => (
                        <option key={item.field}>{item.field}</option>
                      ))}
                    </select>
                  </label>
                  <label className={s.field}>
                    Reported meaning
                    <select
                      value={condition.status}
                      onChange={(event) =>
                        setCondition((value) => ({
                          ...value,
                          status: event.target.value,
                        }))
                      }
                    >
                      {[
                        "not_reported",
                        "unresolved",
                        "conflicting",
                        "measured",
                        "nominal",
                        "derived",
                        "not_applicable",
                      ].map((value) => (
                        <option key={value} value={value}>
                          {human(value)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={s.field}>
                    Original / reviewed value
                    <input
                      value={condition.value ?? ""}
                      onChange={(event) =>
                        setCondition((value) => ({
                          ...value,
                          value: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={numberValue}
                      onChange={(event) => setNumberValue(event.target.checked)}
                    />{" "}
                    This is a numerical quantity
                  </label>
                  <label className={s.field}>
                    Physical unit
                    <input
                      value={condition.unit ?? ""}
                      onChange={(event) =>
                        setCondition((value) => ({
                          ...value,
                          unit: event.target.value,
                        }))
                      }
                      placeholder="For example: Pa, m/s, or 1"
                    />
                  </label>
                  <label className={s.field}>
                    Basis and spatial/temporal reference
                    <input
                      value={condition.reference_basis ?? ""}
                      onChange={(event) =>
                        setCondition((value) => ({
                          ...value,
                          reference_basis: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label className={s.field}>
                    Exact source locator / calibration reference
                    <input
                      value={condition.source_locator ?? ""}
                      onChange={(event) =>
                        setCondition((value) => ({
                          ...value,
                          source_locator: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <button className="button" onClick={addCondition}>
                  Apply this condition to the draft
                </button>
                <p className={s.help}>
                  These are explicit researcher inputs, not an automatic source
                  verification. Non-applicability needs its own source and
                  endpoint-specific justification.
                </p>
                {profiles.map((item) => (
                  <div className={s.fieldGrid} key={item.run_id}>
                    <label className={s.field}>
                      {item.run_id} · Independent unit ID
                      <input
                        value={item.independent_unit_id ?? ""}
                        onChange={(event) =>
                          setProfiles((values) =>
                            values.map((profile) =>
                              profile.run_id === item.run_id
                                ? {
                                    ...profile,
                                    independent_unit_id:
                                      event.target.value || null,
                                  }
                                : profile,
                            ),
                          )
                        }
                        placeholder="Unknown until supported by protocol"
                      />
                    </label>
                    <label className={s.field}>
                      Dependency group ID
                      <input
                        value={item.dependency_group_id ?? ""}
                        onChange={(event) =>
                          setProfiles((values) =>
                            values.map((profile) =>
                              profile.run_id === item.run_id
                                ? {
                                    ...profile,
                                    dependency_group_id:
                                      event.target.value || null,
                                  }
                                : profile,
                            ),
                          )
                        }
                        placeholder="Campaign, specimen, or shared apparatus"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </details>
            <details className={journey.advanced}>
              <summary>
                Rank by relevance, applicability or evidence quality
              </summary>
              <p className={s.help}>
                Record your source-backed assessments, then apply a transparent
                ranking policy. These scores help organize research; they are
                not safety probabilities.
              </p>
              <div className={s.actions}>
                {[
                  "relevance",
                  "applicability",
                  "evidence support",
                  "modeling readiness",
                ].map((value) => (
                  <button
                    className="button"
                    key={value}
                    aria-pressed={rankingMode === value}
                    onClick={() => {
                      setRankingMode(value);
                      setWeights(
                        value === "applicability"
                          ? { ...applicability }
                          : { ...relevance },
                      );
                      setRankResult(null);
                    }}
                  >
                    {human(value)}
                  </button>
                ))}
              </div>
              {rankingMode === "evidence support" ? (
                <div className={s.stack}>
                  <p className={s.help}>
                    Source-specific evidence judgments, separate from relevance
                    scores. Entries remain personal assessments.
                  </p>
                  {[...ids]
                    .sort(
                      (a, b) =>
                        [
                          "supported",
                          "limited",
                          "conflicting",
                          "unknown",
                        ].indexOf(assessments[a]?.support ?? "unknown") -
                          [
                            "supported",
                            "limited",
                            "conflicting",
                            "unknown",
                          ].indexOf(assessments[b]?.support ?? "unknown") ||
                        a.localeCompare(b),
                    )
                    .map((item) => (
                      <div className={s.fieldGrid} key={item}>
                        <label className={s.field}>
                          {names.get(item) || item}
                          <select
                            value={assessments[item]?.support ?? "unknown"}
                            onChange={(event) =>
                              setAssessments((value) => ({
                                ...value,
                                [item]: {
                                  ...(value[item] ?? {
                                    components: {},
                                    evidence: {},
                                    support: "unknown",
                                    readiness: "unknown",
                                  }),
                                  support: event.target.value,
                                },
                              }))
                            }
                          >
                            {[
                              "unknown",
                              "supported",
                              "limited",
                              "conflicting",
                            ].map((value) => (
                              <option key={value} value={value}>
                                {human(value)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className={s.field}>
                          Source and limitation supporting this judgment
                          <input
                            value={assessments[item]?.supportReason ?? ""}
                            onChange={(event) =>
                              setAssessments((value) => ({
                                ...value,
                                [item]: {
                                  ...(value[item] ?? {
                                    components: {},
                                    evidence: {},
                                    support: "unknown",
                                    readiness: "unknown",
                                  }),
                                  supportReason: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                      </div>
                    ))}
                </div>
              ) : rankingMode === "modeling readiness" ? (
                <div>
                  <p className={s.help}>
                    Readiness is a source-specific assessment, separate from
                    relevance. Enter a reasoned personal assessment; this does
                    not activate a model.
                  </p>
                  {ids.map((item) => (
                    <label className={s.field} key={item}>
                      {item}
                      <select
                        value={assessments[item]?.readiness ?? "unknown"}
                        onChange={(event) =>
                          setAssessments((value) => ({
                            ...value,
                            [item]: {
                              ...(value[item] ?? {
                                components: {},
                                evidence: {},
                                support: "unknown",
                                readiness: "unknown",
                              }),
                              readiness: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value="unknown">Unknown</option>
                        <option value="blocked">
                          Blocked by missing support
                        </option>
                        <option value="ready">
                          Researcher-assessed ready; validation still required
                        </option>
                      </select>
                    </label>
                  ))}
                </div>
              ) : (
                <details>
                  <summary>
                    Inspect components, evidence, weights and sensitivity
                  </summary>
                  <p className={s.help}>
                    Policy:{" "}
                    {rankingMode === "applicability"
                      ? "scenario-applicability-v1"
                      : "question-relevance-v1"}
                    . Values are ranking heuristics between 0 and 1; unknowns
                    are not renormalized away.
                  </p>
                  {ids.map((item) => (
                    <fieldset className={s.form} key={item}>
                      <legend>{item}</legend>
                      {Object.keys(baseWeights).map((name) => (
                        <div className={s.fieldGrid} key={name}>
                          <label className={s.field}>
                            {human(name)}
                            <input
                              type="number"
                              min="0"
                              max="1"
                              step="0.05"
                              value={assessments[item]?.components[name] ?? ""}
                              onChange={(event) =>
                                assess(item, name, event.target.value)
                              }
                              placeholder="Unknown"
                            />
                          </label>
                          <label className={s.field}>
                            Why this component is supported
                            <input
                              value={assessments[item]?.evidence[name] ?? ""}
                              onChange={(event) =>
                                assess(item, name, event.target.value, true)
                              }
                              placeholder="Source and condition-specific explanation"
                            />
                          </label>
                        </div>
                      ))}
                    </fieldset>
                  ))}
                  <button className="button" onClick={() => void rank()}>
                    Evaluate the registered ranking policy
                  </button>
                  {rankResult && rankingSignature !== rankingInputs && (
                    <p className={s.notice}>
                      The retained ranking used earlier inputs or weights.
                      Evaluate the current policy before interpreting this
                      draft.
                    </p>
                  )}
                  {rankResult && rankingSignature === rankingInputs && (
                    <>
                      <div className={s.scroll}>
                        <table className={s.table}>
                          <thead>
                            <tr>
                              <th>Item</th>
                              <th>Heuristic score</th>
                              <th>Unknown components</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rankResult.items.map((item) => (
                              <tr key={item.item_id}>
                                <td>{item.item_id}</td>
                                <td>
                                  {item.score === null
                                    ? "Incomplete"
                                    : String(item.score)}
                                </td>
                                <td>
                                  {item.missing_components
                                    .map(human)
                                    .join(", ") || "None"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Limitations values={rankResult.limitations} />
                    </>
                  )}
                  <h3>Unsaved weight sensitivity preview</h3>
                  {Object.entries(weights).map(([name, value]) => (
                    <label className={s.weight} key={name}>
                      <span>{human(name)}</span>
                      <input
                        aria-label={human(name) + " ranking weight"}
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={value}
                        onChange={(event) =>
                          setWeights((current) => ({
                            ...current,
                            [name]: Number(event.target.value),
                          }))
                        }
                      />
                      <output>{value.toFixed(2)}</output>
                    </label>
                  ))}
                  <button
                    className="text-button"
                    onClick={() => setWeights({ ...baseWeights })}
                  >
                    Reset versioned weights
                  </button>
                  {Math.abs(weightTotal - 1) > 1e-9 ? (
                    <p className={s.limit}>
                      Weights currently total {weightTotal.toFixed(2)}. Adjust
                      them to total 1 before interpreting this sensitivity
                      preview.
                    </p>
                  ) : (
                    <ol>
                      {sensitivity.map((item) => (
                        <li key={item.itemId}>
                          {item.itemId}: {item.lower.toFixed(3)}
                          {!item.complete
                            ? "–" +
                              item.upper.toFixed(3) +
                              " because components remain unknown"
                            : ""}
                        </li>
                      ))}
                    </ol>
                  )}
                  <p className={s.help}>
                    This preview does not change the versioned server policy or
                    an already frozen comparison. Saving records it as a
                    separate personal sensitivity assessment.
                  </p>
                </details>
              )}
            </details>
            <Limitations values={data.limitations} />
            <CompiledQuery
              value={{ method: "comparison", parameters: { profiles } }}
            />
            <Link className="button" href="/app/lab/data">
              Open data and compatible chart tools <ArrowRight size={16} />
            </Link>
          </div>
        </details>
      )}
      <details className={journey.sourceDetails}>
        <summary>Comparison name and source version</summary>
        <label className={s.field}>
          Name
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <code>{snapshotId}</code>
      </details>
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </section>
  );
}

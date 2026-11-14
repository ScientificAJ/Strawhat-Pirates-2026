"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, Save, Search, X } from "lucide-react";
import { Investigation, ScientificField, useResource } from "../lib/api";
import { RecordHit } from "../lib/discovery-helpers";
import {
  listDocuments,
  readDocument,
  saveDocument,
  WorkspaceDocument,
} from "../lib/workspace-documents";
import { ErrorState, LoadingRows } from "./chrome";
import {
  Anchor,
  anchorLabel,
  CompiledQuery,
  Empty,
  errorMessage,
  EvidenceHit,
  human,
  InspectButton,
  Limitations,
  post,
  Scope,
  SourceInspector,
  useQuery,
} from "./workbench-common";
import s from "./workbench.module.css";

type Claim = {
  id: string;
  text: string;
  origin: string;
  anchors: Anchor[];
  endpoint?: string | null;
  unit?: string | null;
  numeric_value?: number | null;
  conditions: Record<string, string | null>;
  assumptions: string[];
  limitations: string[];
};
type Lineage = {
  nodes: { id: string; label: string; kind: string }[];
  relations: {
    source: string;
    target: string;
    relation: string;
    anchor: Anchor;
    limitation: string;
  }[];
  limitations: string[];
};
type Coverage = {
  items: {
    accession: string;
    metadata: string;
    manifest: string;
    acquired_assets: number;
    row_roles: Record<string, number>;
    calibration_status: string;
    model_readiness: string;
    rights: string;
  }[];
  scope: string;
};
type EarthEntry = {
  accession: string;
  title: string;
  source_text: string;
  anchor: Anchor;
  status: string;
  status_reason: string;
  transfer_constraints: Record<string, string>;
};
type JointCoverage = {
  axes: {
    quantity_kind: string;
    source_column?: string;
    canonical_unit?: string;
  }[];
  source_record_count: number;
  independent_run_count: null;
  cells: {
    coordinates: { value: unknown; state: string; reason?: string }[];
    source_record_count: number;
  }[];
  unobserved_combinations: {
    coordinates: { value: unknown; state: string }[];
    state: string;
  }[];
  limitations: string[];
  gap_listing_status: string;
};
type Assessment = {
  status?: string;
  explanation?: string;
  limitations?: string[];
  necessary_validation?: string[];
  validation_required?: string[];
  operational_suitability?: string;
  unknown_configuration?: string[];
  evidence_status?: string;
  information_gain_reason?: string;
  information_gain?: null;
  scientific_verification?: string;
  condition_matrix?: {
    dimension: string;
    left: unknown;
    right: unknown;
    status: string;
  }[];
  possible_explanations?: string[];
  execution_scope?: string;
  expected_information_gain_bits?: number;
  value?: number;
  method_id?: string;
  unit?: string;
};
const views = [
  ["sources", "Sources and relationships"],
  ["contradictions", "Contradictions"],
  ["gaps", "Coverage and gaps"],
  ["hypotheses", "Hypotheses"],
  ["controls", "Control research"],
  ["earth", "Earth applications"],
  ["learning", "Learning mode"],
  ["stewardship", "Source quality"],
];
const conditions = [
  "endpoint",
  "protocol",
  "material",
  "geometry",
  "oxygen_fraction",
  "composition_basis",
  "composition_location",
  "pressure",
  "pressure_reference",
  "temperature",
  "flow",
  "gravity",
  "apparatus",
  "measurement",
];
const formDefaults = {
  question: "",
  mechanism: "",
  prediction: "",
  falsifier: "",
  assumptions: "",
  variables: "",
  name: "",
  outcome: "",
  countereffects: "",
  interactions: "",
  limitations: "",
  validation: "",
  original: "",
  proposed: "",
  reason: "",
  left: "",
  right: "",
  endpoint: "",
  unit: "",
  leftNumber: "",
  rightNumber: "",
  shared: "",
};
type Form = typeof formDefaults;
const lines = (text: string) =>
  text
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
function display(value: unknown) {
  return value === null || value === undefined
    ? "Unknown"
    : Array.isArray(value)
      ? value.join("–")
      : String(value);
}
function TextField({
  label,
  value,
  onChange,
  multiline = false,
  placeholder = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={s.field}>
      {label}
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      ) : (
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
        />
      )}
    </label>
  );
}
export function EvidenceWorkbench({
  view: initialView = "sources",
  snapshotId,
}: {
  view?: string;
  snapshotId: string;
}) {
  const router = useRouter();
  const [view, setView] = useState(
    views.some(([id]) => id === initialView) ? initialView : "sources",
  );
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [accession, setAccession] = useState("");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [selected, setSelected] = useState<
    { hit: EvidenceHit; role: "support" | "contrary" }[]
  >([]);
  const [left, setLeft] = useState<EvidenceHit | null>(null);
  const [right, setRight] = useState<EvidenceHit | null>(null);
  const [form, setForm] = useState<Form>(formDefaults);
  const [configuration, setConfiguration] = useState<Record<string, string>>(
    {},
  );
  const [leftConditions, setLeftConditions] = useState<Record<string, string>>(
    {},
  );
  const [rightConditions, setRightConditions] = useState<
    Record<string, string>
  >({});
  const [category, setCategory] = useState("Prevention");
  const [evidenceStatus, setEvidenceStatus] = useState("research_hypothesis");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [assessmentSignature, setAssessmentSignature] = useState("");
  const [informationSignature, setInformationSignature] = useState("");
  const [information, setInformation] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState<WorkspaceDocument[]>([]);
  const [document, setDocument] = useState<WorkspaceDocument | null>(null);
  const [focus, setFocus] = useState("PSI-101");
  const [graph, setGraph] = useState(false);
  const [axis1, setAxis1] = useState("");
  const [axis2, setAxis2] = useState("");
  const [bins, setBins] = useState("");
  const [coverageRequest, setCoverageRequest] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [hypothesisNames, setHypothesisNames] = useState("");
  const [outcomeNames, setOutcomeNames] = useState("");
  const [priors, setPriors] = useState("");
  const [likelihoods, setLikelihoods] = useState("");
  const [probabilityJustification, setProbabilityJustification] = useState("");
  const assessmentInputs = JSON.stringify({
    form,
    selected,
    left,
    right,
    configuration,
    leftConditions,
    rightConditions,
    category,
    evidenceStatus,
    view,
    snapshotId,
  });
  const probabilityInputs = JSON.stringify({
    hypothesisNames,
    outcomeNames,
    priors,
    likelihoods,
    probabilityJustification,
    snapshotId,
  });
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested && views.some(([name]) => name === requested))
      setView(requested);
  }, []);
  function validateSnapshot() {
    const anchors = [
      ...selected.map((item) => item.hit.anchor),
      left?.anchor,
      right?.anchor,
    ].filter(Boolean);
    if (anchors.some((value) => value?.snapshot_id !== snapshotId))
      throw new Error(
        "These sources belong to another frozen snapshot. Reopen that snapshot or explicitly start a new evidence record before evaluating or saving.",
      );
    if (document && document.snapshot_id !== snapshotId)
      throw new Error(
        "This personal record belongs to another frozen snapshot. Open its original snapshot before saving a revision.",
      );
  }
  const catalog = useResource<{ items: Investigation[] }>(
    "/v1/investigations?limit=100&snapshot_id=" + snapshotId,
  );
  const search = useQuery<{
    items: EvidenceHit[];
    total: number;
    search_scope: string;
  }>(
    "/v1/evidence/search",
    {
      snapshot_id: snapshotId,
      text: submitted,
      accessions: accession ? [accession] : [],
      limit: 20,
    },
    Boolean(submitted),
  );
  const lineage = useResource<Lineage>(
    view === "sources"
      ? "/v1/evidence/lineage?snapshot_id=" + snapshotId
      : null,
  );
  const coverage = useResource<Coverage>(
    ["stewardship", "gaps"].includes(view)
      ? "/v1/evidence/coverage?snapshot_id=" +
          snapshotId +
          (accession ? "&accession=" + accession : "")
      : null,
  );
  const earth = useResource<{ items: EarthEntry[]; limitations: string[] }>(
    view === "earth"
      ? "/v1/evidence/earth-applications?snapshot_id=" + snapshotId
      : null,
  );
  const records = useQuery<{ items: RecordHit[] }>(
    "/v1/discovery/records",
    {
      snapshot_id: snapshotId,
      accessions: accession ? [accession] : [],
      limit: 100,
    },
    view === "gaps",
  );
  const joint = useQuery<JointCoverage>(
    "/v1/evidence/condition-coverage",
    coverageRequest,
    Boolean(coverageRequest) && view === "gaps",
  );
  const changes = useResource<{
    observed_changes: {
      accession: string;
      status: string;
      changed_fields?: string[];
    }[];
    released_changes: unknown;
    scientific_snapshot_promoted_by_refresh: boolean;
    limitations: string[];
  }>(
    view === "stewardship" ? "/v1/snapshots/" + snapshotId + "/changes" : null,
  );
  useEffect(() => {
    const load = () =>
      listDocuments()
        .then((value) =>
          setSaved(
            value.filter((item) =>
              ["hypothesis", "control", "earth_transfer", "note"].includes(
                item.kind,
              ),
            ),
          ),
        )
        .catch((reason) => setProblem(errorMessage(reason)));
    load();
    window.addEventListener("nova-ember-workspace-changed", load);
    return () =>
      window.removeEventListener("nova-ember-workspace-changed", load);
  }, []);
  function field<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setAssessment(null);
  }
  function navigate(value: string) {
    if (value !== view) setDocument(null);
    setView(value);
    setAssessment(null);
    setProblem("");
    const url = new URL(window.location.href);
    url.searchParams.set("view", value);
    window.history.replaceState(null, "", url);
  }
  function attach(hit: EvidenceHit, role: "support" | "contrary" = "support") {
    if (selected.length >= 30) {
      setProblem(
        "This research record supports thirty exact evidence selections. Save it before starting another bounded record.",
      );
      return;
    }
    if (
      !selected.some(
        (item) =>
          JSON.stringify(item.hit.anchor) === JSON.stringify(hit.anchor),
      )
    )
      setSelected((current) => [...current, { hit, role }]);
  }
  const quoted = (hit: EvidenceHit, index: number): Claim => ({
    id: "source-" + index,
    text: hit.text,
    origin: "source_reported",
    anchors: [hit.anchor],
    conditions: {},
    assumptions: [],
    limitations: [
      "Source text retains its stated scope; the quotation is not independent validation.",
    ],
  });
  async function evaluate() {
    setProblem("");
    setBusy(true);
    try {
      validateSnapshot();
      let endpoint = "",
        payload: unknown;
      const evidence = selected
        .filter((item) => item.role === "support")
        .map((item, index) => quoted(item.hit, index));
      if (view === "contradictions") {
        if (!form.left.trim() || !form.right.trim())
          throw new Error(
            "Enter both assertions and attach their precise supporting passages.",
          );
        function claim(side: "left" | "right", hit: EvidenceHit | null): Claim {
          const number = side === "left" ? form.leftNumber : form.rightNumber;
          if (number && (!form.unit || !Number.isFinite(Number(number))))
            throw new Error(
              "A numerical assertion needs a finite value and explicit unit.",
            );
          const scope = side === "left" ? leftConditions : rightConditions;
          return {
            id: side,
            text: form[side],
            origin:
              hit && form[side] === hit.text
                ? "source_reported"
                : "synthesized",
            anchors: hit ? [hit.anchor] : [],
            endpoint: form.endpoint || null,
            unit: form.unit || null,
            numeric_value: number ? Number(number) : null,
            conditions: Object.fromEntries(
              Object.entries(scope).map(([key, value]) => [key, value || null]),
            ),
            assumptions: [],
            limitations: [
              "A researcher-entered assertion with its source; interpretation remains separate from location.",
            ],
          };
        }
        endpoint = "/v1/evidence/contradictions/compare";
        payload = { left: claim("left", left), right: claim("right", right) };
      } else if (view === "hypotheses") {
        if (
          ![
            form.question,
            form.mechanism,
            form.prediction,
            form.falsifier,
            form.assumptions,
            form.variables,
          ].every((value) => value.trim())
        )
          throw new Error(
            "Complete the question, mechanism, predicted and falsifying observations, assumptions, and variables to characterize.",
          );
        endpoint = "/v1/research/hypotheses/assess";
        payload = {
          question: form.question,
          mechanism: form.mechanism,
          predicted_observation: form.prediction,
          falsifier: form.falsifier,
          assumptions: lines(form.assumptions),
          variables_to_characterize: lines(form.variables),
          supporting: evidence,
          contrary: selected
            .filter((item) => item.role === "contrary")
            .map((item, index) => quoted(item.hit, index + 30)),
        };
      } else if (view === "controls") {
        if (
          !evidence.length ||
          ![
            form.name,
            form.mechanism,
            form.outcome,
            form.limitations,
            form.validation,
          ].every((value) => value.trim())
        )
          throw new Error(
            "Add at least one source passage and complete the mechanism, intended outcome, limitations and necessary validation.",
          );
        endpoint = "/v1/research/controls/assess";
        payload = {
          name: form.name,
          mechanism: form.mechanism,
          intended_outcome: form.outcome,
          evidence,
          applicable_configuration: Object.fromEntries(
            Object.entries(configuration).map(([key, value]) => [
              key,
              value || null,
            ]),
          ),
          countereffects: lines(form.countereffects),
          interactions: lines(form.interactions),
          limitations: lines(form.limitations),
          necessary_validation: lines(form.validation),
          validation_status:
            evidenceStatus === "source_reported"
              ? "source_reported"
              : evidenceStatus === "unresolved"
                ? "unresolved"
                : "research_hypothesis",
        };
      } else if (view === "earth") {
        if (
          !evidence.length ||
          ![form.name, form.shared, form.limitations].every((value) =>
            value.trim(),
          ) ||
          !Object.keys(configuration).length
        )
          throw new Error(
            "Add source evidence, the shared mechanism, at least one transfer constraint, and limitations.",
          );
        endpoint = "/v1/research/earth-transfer/assess";
        payload = {
          title: form.name,
          status: evidenceStatus,
          evidence,
          shared_mechanism: form.shared,
          transfer_constraints: Object.fromEntries(
            Object.entries(configuration).map(([key, value]) => [
              key,
              value || null,
            ]),
          ),
          limitations: lines(form.limitations),
        };
      }
      const value = await post<Assessment>(endpoint, payload);
      setAssessment(value);
      setAssessmentSignature(assessmentInputs);
      setMessage(
        "Assessment completed on the explicit inputs. Save a personal revision to retain it.",
      );
    } catch (reason) {
      setProblem(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    try {
      validateSnapshot();
      if (
        view === "stewardship" &&
        (!form.original.trim() ||
          !form.proposed.trim() ||
          !form.reason.trim() ||
          !selected.length)
      )
        throw new Error(
          "An anchored correction needs the original assertion, proposed correction, reason, and source passage.",
        );
      const kind =
        view === "hypotheses"
          ? "hypothesis"
          : view === "controls"
            ? "control"
            : view === "earth"
              ? "earth_transfer"
              : "note";
      const saved = await saveDocument({
        id: document?.id,
        revision: document?.revision,
        kind,
        title:
          form.name ||
          form.question ||
          (view === "stewardship"
            ? "Personal source correction"
            : "Evidence interpretation"),
        snapshot_id: snapshotId,
        data: {
          view,
          form,
          selected,
          left,
          right,
          configuration,
          left_conditions: leftConditions,
          right_conditions: rightConditions,
          assessment,
          assessment_signature: assessmentSignature,
          information_gain: information,
          information_signature: informationSignature,
          probability_model: {
            hypothesisNames,
            outcomeNames,
            priors,
            likelihoods,
            probabilityJustification,
          },
          category,
          evidence_status: evidenceStatus,
          status:
            view === "stewardship"
              ? "personal_correction_proposal"
              : "personal_research_record",
        },
      });
      setDocument(saved);
      setMessage(
        "Personal revision " +
          saved.revision +
          " saved. The public source and canonical corpus were not changed.",
      );
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  async function restore(id: string) {
    try {
      const value = await readDocument(id);
      if (!value)
        throw new Error(
          "This local record is unavailable. Import its workspace backup.",
        );
      if (value.snapshot_id !== snapshotId)
        throw new Error(
          "Open this record's frozen snapshot before editing: " +
            value.snapshot_id?.slice(0, 12),
        );
      const data = value.data;
      setDocument(value);
      setForm({ ...formDefaults, ...(data.form as Partial<Form>) });
      setSelected((data.selected as typeof selected) ?? []);
      setConfiguration((data.configuration as Record<string, string>) ?? {});
      setLeft((data.left as EvidenceHit | null) ?? null);
      setRight((data.right as EvidenceHit | null) ?? null);
      setLeftConditions((data.left_conditions as Record<string, string>) ?? {});
      setRightConditions(
        (data.right_conditions as Record<string, string>) ?? {},
      );
      setAssessment((data.assessment as Assessment) ?? null);
      setAssessmentSignature(String(data.assessment_signature ?? ""));
      setInformation((data.information_gain as Assessment) ?? null);
      setInformationSignature(String(data.information_signature ?? ""));
      setCategory(String(data.category ?? "Prevention"));
      setEvidenceStatus(String(data.evidence_status ?? "research_hypothesis"));
      const model = data.probability_model as
        Record<string, string> | undefined;
      setHypothesisNames(model?.hypothesisNames ?? "");
      setOutcomeNames(model?.outcomeNames ?? "");
      setPriors(model?.priors ?? "");
      setLikelihoods(model?.likelihoods ?? "");
      setProbabilityJustification(model?.probabilityJustification ?? "");
      setView(String(data.view || "sources"));
      setMessage(
        "Opened revision " +
          value.revision +
          "; saving creates the next immutable local revision.",
      );
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  async function learningQuestion(
    question: string,
    investigations: string[] = [],
  ) {
    try {
      validateSnapshot();
      const intent = await saveDocument({
        kind: "studio_intent",
        title: question,
        snapshot_id: snapshotId,
        data: {
          question,
          snapshot_id: snapshotId,
          investigations,
          summary_depth: "learning",
          anchors: selected.map((item) => item.hit.anchor),
        },
      });
      router.push("/app/agent?intent=" + intent.id);
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  const contractFields = useMemo(() => {
    const values = new Map<string, ScientificField>();
    for (const row of records.data?.items ?? [])
      for (const field of row.record.fields)
        if (field.quantity_kind)
          values.set(
            JSON.stringify([
              field.quantity_kind,
              field.source_column,
              field.basis,
              field.location,
            ]),
            field,
          );
    return [...values.entries()];
  }, [records.data]);
  function calculateCoverage() {
    try {
      if (!axis1) throw new Error("Choose at least one exact field contract.");
      const axes = [axis1, axis2].filter(Boolean).map((key, index) => {
        const actual = contractFields.find(([value]) => value === key)?.[1];
        if (!actual)
          throw new Error(
            "Select a field available in this query's source records.",
          );
        const edges =
          index === 0 && bins.trim()
            ? bins.split(",").map((value) => Number(value.trim()))
            : [];
        if (
          edges.some((value) => !Number.isFinite(value)) ||
          edges.some(
            (value, index) => index > 0 && value <= edges[index - 1],
          ) ||
          (edges.length && edges.length < 2)
        )
          throw new Error(
            "Bin edges need at least two finite, increasing boundaries.",
          );
        return {
          quantity_kind: actual.quantity_kind,
          source_column: actual.source_column,
          ...(actual.basis ? { basis: actual.basis } : {}),
          ...(actual.location ? { location: actual.location } : {}),
          kind: actual.canonical_unit ? "numeric" : "categorical",
          ...(actual.canonical_unit
            ? { canonical_unit: actual.canonical_unit, bin_edges: edges }
            : {}),
        };
      });
      setCoverageRequest({
        query: {
          snapshot_id: snapshotId,
          accessions: accession ? [accession] : [],
        },
        axes,
      });
      setProblem("");
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  async function informationGain() {
    try {
      validateSnapshot();
      if (!probabilityJustification.trim())
        throw new Error(
          "State why this explicit probability model is defensible before calculating information gain.",
        );
      const names = lines(hypothesisNames),
        outcomes = lines(outcomeNames);
      const prior = priors.split(",").map((value) => Number(value.trim()));
      const likelihood = lines(likelihoods).map((row) =>
        row.split(",").map((value) => Number(value.trim())),
      );
      if (
        [...prior, ...likelihood.flat()].some(
          (value) => !Number.isFinite(value) || value < 0 || value > 1,
        )
      )
        throw new Error(
          "Probabilities must be finite values from 0 to 1. No values will be normalized silently.",
        );
      const value = await post<Assessment>("/v1/methods/calculate", {
        method: "information-gain",
        parameters: {
          hypotheses: names,
          outcomes,
          prior,
          outcome_likelihood_by_hypothesis: likelihood,
          probabilistic_model_justification: probabilityJustification,
          context: {
            input_origin: "analyst_input",
            source_snapshot: snapshotId,
            sources: [
              {
                source_id: document?.id ?? "personal-hypothesis",
                locator:
                  "Explicit probability-model assumptions; not measured confidence",
              },
            ],
          },
        },
      });
      setInformation(value);
      setInformationSignature(probabilityInputs);
      setProblem("");
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  const focusedEdges =
    lineage.data?.relations.filter(
      (edge) => edge.source === focus || edge.target === focus,
    ) ?? [];
  const nodeIds = [
    ...new Set([
      focus,
      ...focusedEdges.flatMap((edge) => [edge.source, edge.target]),
    ]),
  ].slice(0, 8);
  return (
    <section className={s.workbench}>
      <div className="page-heading">
        <div>
          <h1>
            {view === "learning"
              ? "Learning with the evidence"
              : view === "stewardship"
                ? "Source quality and personal corrections"
                : "Evidence and research planning"}
          </h1>
          <p>
            Keep source observations, interpretations, hypotheses and unresolved
            questions distinct.
          </p>
        </div>
      </div>
      <Scope snapshotId={snapshotId}>
        <span>
          {view === "learning"
            ? "Learning mode · Full sources stay available"
            : "Public evidence · Personal research records"}
        </span>
      </Scope>
      <nav className={s.tabs} aria-label="Evidence workspaces">
        {views.map(([value, label]) => (
          <button
            key={value}
            aria-current={view === value ? "page" : undefined}
            onClick={() => navigate(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {problem && (
        <p className={s.error} role="alert">
          {problem}
        </p>
      )}
      {message && (
        <p role="status" className={s.success}>
          {message}
        </p>
      )}
      {view === "learning" ? (
        <>
          <div className={s.twoColumns}>
            <section className={s.surface}>
              <h2>Guided investigation</h2>
              <ol>
                <li>
                  <Link
                    href={"/app/investigations/PSI-69?snapshot=" + snapshotId}
                  >
                    Open FLEX and identify the original test-end labels.
                  </Link>{" "}
                  Compare source rows with independent experimental units.
                </li>
                <li>
                  <Link
                    href={
                      "/app/compare?ids=PSI-101,PSI-47&snapshot=" + snapshotId
                    }
                  >
                    Compare SAME and DAFT.
                  </Link>{" "}
                  Inspect instrument relationships while keeping smoke and dust
                  conditions separate.
                </li>
                <li>
                  <Link
                    href={"/app/investigations/PSI-98?snapshot=" + snapshotId}
                  >
                    Inspect Saffire I source quality.
                  </Link>{" "}
                  Retain conflicting assertions instead of choosing a cleaner
                  value.
                </li>
                <li>
                  <Link href="/app/lab/scenarios">
                    Explore oxygen fraction and absolute pressure.
                  </Link>{" "}
                  Similar oxygen partial pressure does not establish equivalent
                  flammability.
                </li>
              </ol>
              <button
                className="button"
                onClick={() =>
                  void learningQuestion(
                    "Guide me through a source-grounded learning task on combustion in reduced gravity. Ask what I understand, preserve source access, and label every unsupported transfer.",
                  )
                }
              >
                Draft a guided question in Studio <ArrowRight size={16} />
              </button>
            </section>
            <section className={s.surface}>
              <h2>Glossary and method meanings</h2>
              {[
                [
                  "Source record",
                  "A physical row, session, sample, or summary in a retained source. It is not automatically an independent experimental replicate.",
                ],
                [
                  "Applicability",
                  "The conditions under which evidence can address the selected question. Relevance alone does not establish transfer.",
                ],
                [
                  "Oxygen partial pressure",
                  "For an explicitly specified ideal-gas mole/volume fraction x and absolute pressure P, pO₂ = x × P. Preserve the original fraction and pressure separately.",
                ],
                [
                  "Descriptive fit",
                  "A fitted slope describes a selected measured interval. A good within-run fit does not validate a prediction for another run.",
                ],
                [
                  "Uncertainty",
                  "Measurement uncertainty, run variability, residual scatter and prediction intervals have different meanings; unreported uncertainty remains unknown.",
                ],
                [
                  "Evidence gap",
                  "No matching evidence in the stated source scope. This can mean unreleased, unacquired, unusable or unstudied data; these are not interchangeable.",
                ],
              ].map(([term, meaning]) => (
                <details key={term}>
                  <summary>{term}</summary>
                  <p className={s.prose}>{meaning}</p>
                  <button
                    className="text-button"
                    onClick={() => {
                      setQuery(term);
                      setSubmitted(term);
                      setView("sources");
                    }}
                  >
                    Find source passages
                  </button>
                </details>
              ))}
            </section>
          </div>
          <p className={s.help}>
            These are explanation and method definitions, not new NASA
            measurements. Technical dossiers, original units and source
            qualifications remain available at every depth.
          </p>
        </>
      ) : (
        <>
          <section className={s.surface}>
            <div className={s.sectionHeading}>
              <div>
                <h2>Find and attach exact evidence</h2>
                <p>
                  Read the original passage before adopting an interpretation.
                </p>
              </div>
              <label className={s.field}>
                Investigation scope
                <select
                  value={accession}
                  onChange={(event) => {
                    setAccession(event.target.value);
                    setAxis1("");
                    setAxis2("");
                    setCoverageRequest(null);
                  }}
                >
                  <option value="">All retained investigations</option>
                  {catalog.data?.items.map((item) => (
                    <option key={item.accession} value={item.accession}>
                      {item.acronym || item.accession} · {item.accession}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <form
              className={s.search}
              onSubmit={(event) => {
                event.preventDefault();
                setSubmitted(query.trim());
              }}
            >
              <label className="visually-hidden" htmlFor="evidence-search">
                Literal source terms
              </label>
              <input
                id="evidence-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Exact source terms, apparatus, method, or qualification"
              />
              <button className="button">
                <Search size={16} /> Search sources
              </button>
            </form>
            {search.error ? (
              <ErrorState message={search.error} retry={search.reload} />
            ) : search.loading && submitted ? (
              <LoadingRows label="Reading retained source passages" />
            ) : (
              search.data && (
                <>
                  <p className={s.help}>
                    {search.data.total} literal matches ·{" "}
                    {search.data.search_scope}
                  </p>
                  <ul className={s.sourceList}>
                    {search.data.items.map((hit, index) => (
                      <li key={index}>
                        <span className={s.help}>
                          {anchorLabel(hit.anchor)} · {human(hit.field_role)}
                        </span>
                        <blockquote>{hit.text}</blockquote>
                        <div className={s.actions}>
                          <InspectButton
                            anchor={hit.anchor}
                            onInspect={setAnchor}
                          />
                          {view === "contradictions" ? (
                            <>
                              <button
                                className="button"
                                onClick={() => {
                                  setLeft(hit);
                                  field("left", hit.text);
                                }}
                              >
                                Use as left assertion
                              </button>
                              <button
                                className="button"
                                onClick={() => {
                                  setRight(hit);
                                  field("right", hit.text);
                                }}
                              >
                                Use as right assertion
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="button"
                                onClick={() => attach(hit)}
                              >
                                Attach as supporting source
                              </button>
                              {view === "hypotheses" && (
                                <button
                                  className="button"
                                  onClick={() => attach(hit, "contrary")}
                                >
                                  Attach as contrary source
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!search.data.items.length && (
                    <Empty>
                      No passages contain all literal terms in this scope. Try a
                      specific source term or open meaning search in
                      investigation discovery; missing results are not proof of
                      missing science.
                    </Empty>
                  )}
                </>
              )
            )}
            {selected.length > 0 && (
              <div className={s.chips} aria-label="Attached source evidence">
                {selected.map((item, index) => (
                  <span className={s.chip} key={index}>
                    {item.role}:{" "}
                    {item.hit.anchor.accession ?? item.hit.anchor.document_id}
                    <button
                      aria-label={"Remove attached evidence " + (index + 1)}
                      onClick={() =>
                        setSelected((value) =>
                          value.filter(
                            (_, selectedIndex) => selectedIndex !== index,
                          ),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </section>
          {view === "sources" && (
            <section className={s.surface}>
              <div className={s.toolbar}>
                <h2>Source-reported relationships</h2>
                <div className={s.actions}>
                  <button
                    className="button"
                    aria-pressed={!graph}
                    onClick={() => setGraph(false)}
                  >
                    Relationship list
                  </button>
                  <button
                    className="button"
                    aria-pressed={graph}
                    onClick={() => setGraph(true)}
                  >
                    Focused graph and list
                  </button>
                </div>
              </div>
              {lineage.error ? (
                <ErrorState message={lineage.error} retry={lineage.reload} />
              ) : !lineage.data ? (
                <LoadingRows label="Reading hardware and investigation relationships" />
              ) : (
                <>
                  <label className={s.field}>
                    Focus node
                    <select
                      value={focus}
                      onChange={(event) => setFocus(event.target.value)}
                    >
                      {lineage.data.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {graph && (
                    <>
                      <svg
                        viewBox="0 0 640 280"
                        style={{ width: "100%", maxHeight: 320 }}
                        role="img"
                        aria-label="Bounded source relationship graph; the complete focused relationship list follows."
                      >
                        {nodeIds.map((id, index) => {
                          const x = index === 0 ? 90 : 300 + (index % 2) * 210,
                            y =
                              index === 0
                                ? 140
                                : 30 + Math.floor((index - 1) / 2) * 66;
                          return (
                            <g key={id}>
                              <line
                                x1="90"
                                y1="140"
                                x2={x}
                                y2={y}
                                stroke="var(--boundary)"
                                strokeDasharray="4 4"
                              />
                              <circle
                                cx={x}
                                cy={y}
                                r={index === 0 ? 12 : 7}
                                fill={
                                  index === 0
                                    ? "var(--action)"
                                    : "var(--secondary)"
                                }
                              />
                              <text
                                x={x + 16}
                                y={y + 4}
                                fill="currentColor"
                                fontSize="11"
                              >
                                {id.length > 26 ? id.slice(0, 24) + "…" : id}
                              </text>
                            </g>
                          );
                        })}
                      </svg>
                      <p className={s.help}>
                        Graph shows up to eight neighboring identities. Edges
                        denote source-reported context, not causation. The list
                        below retains every focused relationship and its source.
                      </p>
                    </>
                  )}
                  <ul className={s.sourceList}>
                    {focusedEdges.map((edge, index) => (
                      <li key={index}>
                        <div className={s.relationship}>
                          <span>
                            {lineage.data?.nodes.find(
                              (node) => node.id === edge.source,
                            )?.label ?? edge.source}
                          </span>
                          <span>{human(edge.relation)}</span>
                          <span>
                            {lineage.data?.nodes.find(
                              (node) => node.id === edge.target,
                            )?.label ?? edge.target}
                          </span>
                        </div>
                        <p>{edge.limitation}</p>
                        <InspectButton
                          anchor={edge.anchor}
                          onInspect={setAnchor}
                        />
                      </li>
                    ))}
                  </ul>
                  {!focusedEdges.length && (
                    <Empty>
                      No source-reported relationship is retained for this
                      focus. This is not evidence that no relation exists.
                    </Empty>
                  )}
                  <Limitations values={lineage.data.limitations} />
                </>
              )}
            </section>
          )}
          {view === "contradictions" && (
            <section className={s.form}>
              <h2>Keep both assertions and their conditions</h2>
              <div className={s.twoColumns}>
                <div className={s.stack}>
                  <TextField
                    label="Left assertion"
                    value={form.left}
                    onChange={(value) => field("left", value)}
                    multiline
                  />
                  {left && (
                    <InspectButton anchor={left.anchor} onInspect={setAnchor} />
                  )}
                  <TextField
                    label="Optional reported numerical value"
                    value={form.leftNumber}
                    onChange={(value) => field("leftNumber", value)}
                  />
                </div>
                <div className={s.stack}>
                  <TextField
                    label="Right assertion"
                    value={form.right}
                    onChange={(value) => field("right", value)}
                    multiline
                  />
                  {right && (
                    <InspectButton
                      anchor={right.anchor}
                      onInspect={setAnchor}
                    />
                  )}
                  <TextField
                    label="Optional reported numerical value"
                    value={form.rightNumber}
                    onChange={(value) => field("rightNumber", value)}
                  />
                </div>
              </div>
              <div className={s.fieldGrid}>
                <TextField
                  label="Endpoint identity (leave unknown when unresolved)"
                  value={form.endpoint}
                  onChange={(value) => field("endpoint", value)}
                />
                <TextField
                  label="Common physical unit for numerical comparison"
                  value={form.unit}
                  onChange={(value) => field("unit", value)}
                />
              </div>
              <details>
                <summary>
                  Compare explicit conditions before claiming a contradiction
                </summary>
                <div className={s.scroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Condition</th>
                        <th>Left source</th>
                        <th>Right source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conditions.map((name) => (
                        <tr key={name}>
                          <th>{human(name)}</th>
                          <td>
                            <input
                              aria-label={"Left " + human(name)}
                              value={leftConditions[name] ?? ""}
                              onChange={(event) =>
                                setLeftConditions((value) => ({
                                  ...value,
                                  [name]: event.target.value,
                                }))
                              }
                              placeholder="Unknown"
                            />
                          </td>
                          <td>
                            <input
                              aria-label={"Right " + human(name)}
                              value={rightConditions[name] ?? ""}
                              onChange={(event) =>
                                setRightConditions((value) => ({
                                  ...value,
                                  [name]: event.target.value,
                                }))
                              }
                              placeholder="Unknown"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
              <TextField
                label="Personal resolution or missing evidence"
                value={form.reason}
                onChange={(value) => field("reason", value)}
                multiline
              />
              <p className={s.help}>
                A changed quotation becomes a personal synthesis. The newer
                source does not automatically win; unknown conditions remain
                unresolved.
              </p>
            </section>
          )}
          {view === "gaps" && (
            <section className={s.stack}>
              <h2>Joint condition coverage</h2>
              <p className={s.help}>
                Field choices come from up to 100 preview records. The coverage
                calculation uses the whole frozen query, not just that page.
                Exact column, basis and location resolve ambiguous repeated
                quantities.
              </p>
              {records.error ? (
                <ErrorState message={records.error} retry={records.reload} />
              ) : (
                <div className={s.fieldGrid}>
                  {[axis1, axis2].map((value, index) => (
                    <label className={s.field} key={index}>
                      Axis {index + 1}
                      {index === 1 ? " (optional)" : ""}
                      <select
                        value={value}
                        onChange={(event) =>
                          index === 0
                            ? setAxis1(event.target.value)
                            : setAxis2(event.target.value)
                        }
                      >
                        <option value="">Choose a source field</option>
                        {contractFields.map(([key, field]) => (
                          <option key={key} value={key}>
                            {field.source_column || field.quantity_kind} ·{" "}
                            {field.canonical_unit ?? "source labels"} ·{" "}
                            {field.basis || "basis unresolved"} ·{" "}
                            {field.location || "location unresolved"}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
              <TextField
                label="Optional numerical bin edges for axis 1 (comma-separated, in canonical units)"
                value={bins}
                onChange={setBins}
              />
              <button
                className="button"
                disabled={!axis1}
                onClick={calculateCoverage}
              >
                Calculate scoped coverage
              </button>
              {joint.error ? (
                <ErrorState message={joint.error} retry={joint.reload} />
              ) : joint.loading && coverageRequest ? (
                <LoadingRows label="Calculating joint source-record coverage" />
              ) : (
                joint.data && (
                  <>
                    <p>
                      {joint.data.source_record_count} source records ·
                      Independent runs not established ·{" "}
                      {human(joint.data.gap_listing_status)}
                    </p>
                    <div className={s.scroll}>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            {joint.data.axes.map((axis, index) => (
                              <th key={index}>
                                {axis.source_column || axis.quantity_kind}{" "}
                                {axis.canonical_unit}
                              </th>
                            ))}
                            <th>Source records</th>
                          </tr>
                        </thead>
                        <tbody>
                          {joint.data.cells.map((cell, index) => (
                            <tr key={index}>
                              {cell.coordinates.map((coordinate, axis) => (
                                <td key={axis}>
                                  {display(coordinate.value)}
                                  <small>
                                    {human(coordinate.state)}
                                    {coordinate.reason
                                      ? " · " + human(coordinate.reason)
                                      : ""}
                                  </small>
                                </td>
                              ))}
                              <td className={s.number}>
                                {cell.source_record_count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <h3>
                      Unobserved combinations within the selected axis levels
                    </h3>
                    {joint.data.unobserved_combinations.length ? (
                      <ul>
                        {joint.data.unobserved_combinations.map(
                          (gap, index) => (
                            <li key={index}>
                              {gap.coordinates
                                .map((value) => display(value.value))
                                .join(" / ")}{" "}
                              <button
                                className="text-button"
                                onClick={() => {
                                  field(
                                    "question",
                                    "Which observations could resolve the scoped gap at " +
                                      gap.coordinates
                                        .map((value) => display(value.value))
                                        .join(" / ") +
                                      "?",
                                  );
                                  setView("hypotheses");
                                }}
                              >
                                Draft a research question
                              </button>
                            </li>
                          ),
                        )}
                      </ul>
                    ) : (
                      <p className={s.help}>
                        No unobserved combination was enumerated within these
                        levels. This is not a claim of complete scientific
                        coverage.
                      </p>
                    )}
                    <Limitations values={joint.data.limitations} />
                    <CompiledQuery value={coverageRequest} />
                  </>
                )
              )}
            </section>
          )}
          {view === "hypotheses" && (
            <section className={s.form}>
              <h2>Hypothesis and next informative observations</h2>
              <TextField
                label="Research question"
                value={form.question}
                onChange={(value) => field("question", value)}
                multiline
              />
              <TextField
                label="Proposed physical mechanism"
                value={form.mechanism}
                onChange={(value) => field("mechanism", value)}
                multiline
              />
              <div className={s.fieldGrid}>
                <TextField
                  label="Predicted observation"
                  value={form.prediction}
                  onChange={(value) => field("prediction", value)}
                  multiline
                />
                <TextField
                  label="Observation that would falsify it"
                  value={form.falsifier}
                  onChange={(value) => field("falsifier", value)}
                  multiline
                />
                <TextField
                  label="Assumptions (one per line)"
                  value={form.assumptions}
                  onChange={(value) => field("assumptions", value)}
                  multiline
                />
                <TextField
                  label="Variables and conditions to characterize (one per line)"
                  value={form.variables}
                  onChange={(value) => field("variables", value)}
                  multiline
                />
              </div>
              <p className={s.help}>
                Attached sources retain supporting or contrary roles. This is a
                scientific planning record, not authorization or a ready-to-run
                physical experiment procedure.
              </p>
              <details>
                <summary>
                  Optional information gain from a justified probability model
                </summary>
                <div className={s.form}>
                  <TextField
                    label="Competing hypothesis identifiers (one per line)"
                    value={hypothesisNames}
                    onChange={setHypothesisNames}
                    multiline
                  />
                  <TextField
                    label="Possible observation outcomes (one per line)"
                    value={outcomeNames}
                    onChange={setOutcomeNames}
                    multiline
                  />
                  <TextField
                    label="Prior probabilities in that order (comma-separated)"
                    value={priors}
                    onChange={setPriors}
                  />
                  <TextField
                    label="Outcome probabilities per hypothesis (one comma-separated row per hypothesis)"
                    value={likelihoods}
                    onChange={setLikelihoods}
                    multiline
                  />
                  <TextField
                    label="Probability-model justification and source"
                    value={probabilityJustification}
                    onChange={setProbabilityJustification}
                    multiline
                  />
                  <button
                    className="button"
                    onClick={() => void informationGain()}
                  >
                    Calculate conditional expected information gain
                  </button>
                  {information?.expected_information_gain_bits !== undefined &&
                    informationSignature === probabilityInputs && (
                      <p role="status">
                        Expected information gain:{" "}
                        {information.expected_information_gain_bits} bits under
                        this explicitly supplied probability model.
                      </p>
                    )}
                  <p className={s.help}>
                    Priors and every likelihood row must sum to one. A supplied
                    probability model is not a confidence percentage for
                    scientific truth.
                  </p>
                </div>
              </details>
            </section>
          )}
          {view === "controls" && (
            <section className={s.form}>
              <h2>Controls research, with qualification needs</h2>
              <label className={s.field}>
                Research category
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  {["Prevention", "Detection", "Suppression", "Recovery"].map(
                    (value) => (
                      <option key={value}>{value}</option>
                    ),
                  )}
                </select>
              </label>
              <TextField
                label="Candidate control or technology"
                value={form.name}
                onChange={(value) => field("name", value)}
              />
              <TextField
                label="Mechanism supported or proposed"
                value={form.mechanism}
                onChange={(value) => field("mechanism", value)}
                multiline
              />
              <TextField
                label="Intended research outcome"
                value={form.outcome}
                onChange={(value) => field("outcome", value)}
              />
              <div className={s.fieldGrid}>
                <TextField
                  label="Countereffects (one per line)"
                  value={form.countereffects}
                  onChange={(value) => field("countereffects", value)}
                  multiline
                />
                <TextField
                  label="Interactions with other controls (one per line)"
                  value={form.interactions}
                  onChange={(value) => field("interactions", value)}
                  multiline
                />
              </div>
              <TextField
                label="Necessary validation (one requirement per line)"
                value={form.validation}
                onChange={(value) => field("validation", value)}
                multiline
              />
              <TextField
                label="Limits and unsupported uses (one per line)"
                value={form.limitations}
                onChange={(value) => field("limitations", value)}
                multiline
              />
              <label className={s.field}>
                Researcher-selected evidence status
                <select
                  value={evidenceStatus}
                  onChange={(event) => setEvidenceStatus(event.target.value)}
                >
                  <option value="research_hypothesis">
                    Research hypothesis
                  </option>
                  <option value="source_reported">
                    Source-reported mechanism; inspect original evidence
                  </option>
                  <option value="unresolved">Unresolved</option>
                </select>
              </label>
            </section>
          )}
          {view === "earth" && (
            <>
              <section>
                <h2>Source-backed Earth application connections</h2>
                {earth.error ? (
                  <ErrorState message={earth.error} retry={earth.reload} />
                ) : !earth.data ? (
                  <LoadingRows label="Reading source application connections" />
                ) : (
                  <>
                    <ul className={s.sourceList}>
                      {earth.data.items.map((item) => (
                        <li key={item.accession}>
                          <h3>{item.title}</h3>
                          <span className={s.chip}>{human(item.status)}</span>
                          <blockquote>{item.source_text}</blockquote>
                          <p>{item.status_reason}</p>
                          <div className={s.actions}>
                            <InspectButton
                              anchor={item.anchor}
                              onInspect={setAnchor}
                            />
                            <button
                              className="button"
                              onClick={() => {
                                attach({
                                  anchor: item.anchor,
                                  text: item.source_text,
                                });
                                field("name", item.title);
                                setConfiguration(
                                  Object.fromEntries(
                                    Object.keys(item.transfer_constraints).map(
                                      (key) => [key, ""],
                                    ),
                                  ),
                                );
                              }}
                            >
                              Use as evidence for a personal transfer assessment
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                    <Limitations values={earth.data.limitations} />
                  </>
                )}
              </section>
              <section className={s.form}>
                <h2>Interpret a transfer explicitly</h2>
                <TextField
                  label="Application or connection title"
                  value={form.name}
                  onChange={(value) => field("name", value)}
                />
                <TextField
                  label="Shared physical mechanism"
                  value={form.shared}
                  onChange={(value) => field("shared", value)}
                  multiline
                />
                <label className={s.field}>
                  Researcher-selected status
                  <select
                    value={evidenceStatus}
                    onChange={(event) => setEvidenceStatus(event.target.value)}
                  >
                    <option value="research_hypothesis">
                      Research hypothesis
                    </option>
                    <option value="supported_engineering_connection">
                      Supported engineering connection
                    </option>
                    <option value="documented_application">
                      Documented application; needs direct application evidence
                    </option>
                  </select>
                </label>
                <TextField
                  label="Limits on transfer (one per line)"
                  value={form.limitations}
                  onChange={(value) => field("limitations", value)}
                  multiline
                />
              </section>
            </>
          )}
          {["controls", "earth"].includes(view) && (
            <section className={s.form}>
              <h3>
                {view === "earth"
                  ? "Transfer constraints"
                  : "Applicable configuration"}
              </h3>
              <div className={s.fieldGrid}>
                {[
                  "material",
                  "atmosphere",
                  "pressure",
                  "flow",
                  "gravity",
                  "scale",
                  "apparatus",
                  "exposure",
                ].map((name) => (
                  <TextField
                    key={name}
                    label={human(name) + " (leave unknown when unresolved)"}
                    value={configuration[name] ?? ""}
                    onChange={(value) =>
                      setConfiguration((current) => ({
                        ...current,
                        [name]: value,
                      }))
                    }
                  />
                ))}
              </div>
            </section>
          )}
          {view === "stewardship" && (
            <>
              <section>
                <h2>Actual retained-source coverage</h2>
                {coverage.error ? (
                  <ErrorState
                    message={coverage.error}
                    retry={coverage.reload}
                  />
                ) : !coverage.data ? (
                  <LoadingRows label="Reading data quality and source coverage" />
                ) : (
                  <>
                    <p className={s.help}>{coverage.data.scope}</p>
                    <div className={s.scroll}>
                      <table className={s.table}>
                        <thead>
                          <tr>
                            <th>Investigation</th>
                            <th>Access and grain</th>
                            <th>Scientific support</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coverage.data.items.map((item) => (
                            <tr key={item.accession}>
                              <td>
                                <Link
                                  href={
                                    "/app/investigations/" +
                                    item.accession +
                                    "?snapshot=" +
                                    snapshotId
                                  }
                                >
                                  {item.accession}
                                </Link>
                              </td>
                              <td>
                                Metadata: {human(item.metadata)} · Manifest:{" "}
                                {human(item.manifest)}
                                <small>
                                  {item.acquired_assets} acquired assets ·{" "}
                                  {Object.entries(item.row_roles)
                                    .map(
                                      ([role, count]) =>
                                        human(role) + ": " + count,
                                    )
                                    .join(", ") || "No interpreted rows"}
                                </small>
                              </td>
                              <td>
                                {human(item.calibration_status)}
                                <small>
                                  {human(item.model_readiness)} · Rights:{" "}
                                  {item.rights}
                                </small>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
              <section className={s.surface}>
                <h2>Changes observed since this snapshot</h2>
                {changes.error ? (
                  <ErrorState message={changes.error} retry={changes.reload} />
                ) : changes.loading ? (
                  <LoadingRows label="Comparing source observations" />
                ) : (
                  <>
                    <ul>
                      {changes.data?.observed_changes.map((change, index) => (
                        <li key={index}>
                          {change.accession}: {human(change.status)}{" "}
                          {change.changed_fields?.join(", ")}
                        </li>
                      ))}
                    </ul>
                    {!changes.data?.observed_changes.length && (
                      <p>
                        No observed changes are listed here. Check
                        source-refresh availability before assuming the upstream
                        archive is unchanged.
                      </p>
                    )}
                    <Limitations values={changes.data?.limitations} />
                  </>
                )}
              </section>
              <section className={s.form}>
                <h2>Personal source correction</h2>
                <TextField
                  label="Original assertion or value"
                  value={form.original}
                  onChange={(value) => field("original", value)}
                  multiline
                />
                <TextField
                  label="Proposed correction"
                  value={form.proposed}
                  onChange={(value) => field("proposed", value)}
                  multiline
                />
                <TextField
                  label="Reason and uncertainty"
                  value={form.reason}
                  onChange={(value) => field("reason", value)}
                  multiline
                />
                <p className={s.help}>
                  Attach the exact source above. Saving records a personal
                  proposal against this version. It does not alter or hide the
                  public assertions.
                </p>
              </section>
            </>
          )}
          {[
            "contradictions",
            "hypotheses",
            "controls",
            "earth",
            "stewardship",
          ].includes(view) && (
            <div className={s.actions}>
              {view !== "stewardship" && (
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void evaluate()}
                >
                  {busy
                    ? "Assessing explicit evidence…"
                    : "Assess the stated evidence and limits"}
                </button>
              )}
              <button className="button" onClick={() => void save()}>
                <Save size={16} /> Save personal revision
              </button>
              {document && (
                <button
                  className="text-button"
                  onClick={() => {
                    setDocument(null);
                    setMessage(
                      "The next save creates a separate research record.",
                    );
                  }}
                >
                  Save as a separate record
                </button>
              )}
            </div>
          )}
          {assessment && assessmentSignature !== assessmentInputs && (
            <p className={s.notice}>
              The retained assessment refers to earlier inputs. Reassess this
              draft before using it; its original record remains in the saved
              revision.
            </p>
          )}
          {assessment && assessmentSignature === assessmentInputs && (
            <section className={s.surface} aria-live="polite">
              <h2>
                Assessment:{" "}
                {human(
                  assessment.status ??
                    assessment.evidence_status ??
                    assessment.method_id,
                )}
              </h2>
              {assessment.explanation && (
                <p className={s.prose}>{assessment.explanation}</p>
              )}
              {assessment.operational_suitability && (
                <p>
                  Operational suitability:{" "}
                  <strong>{human(assessment.operational_suitability)}</strong>
                </p>
              )}
              {assessment.information_gain_reason && (
                <p>{assessment.information_gain_reason}</p>
              )}
              {assessment.expected_information_gain_bits !== undefined && (
                <p className={s.number}>
                  Expected information gain:{" "}
                  {assessment.expected_information_gain_bits} bits under the
                  supplied probability model.
                </p>
              )}
              {assessment.condition_matrix && (
                <div className={s.scroll}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th>Condition</th>
                        <th>Left</th>
                        <th>Right</th>
                        <th>Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assessment.condition_matrix.map((row) => (
                        <tr key={row.dimension}>
                          <th>{human(row.dimension)}</th>
                          <td>{display(row.left)}</td>
                          <td>{display(row.right)}</td>
                          <td>{human(row.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {assessment.possible_explanations && (
                <ul>
                  {assessment.possible_explanations.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
              {assessment.validation_required && (
                <>
                  <h3>Validation still needed</h3>
                  <ul>
                    {assessment.validation_required.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                </>
              )}
              <Limitations values={assessment.limitations} />
              <p className={s.help}>
                {assessment.execution_scope ??
                  assessment.scientific_verification ??
                  "A structured assessment preserves the stated evidence and assumptions; it does not certify a conclusion."}
              </p>
            </section>
          )}
          {saved.length > 0 && (
            <details className={s.surface}>
              <summary>
                Personal research records in this browser ({saved.length})
              </summary>
              <ul className={s.sourceList}>
                {saved.map((item) => (
                  <li key={item.id}>
                    <div className={s.sectionHeading}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>
                          {human(item.kind)} · revision {item.revision} ·
                          snapshot{" "}
                          {item.snapshot_id?.slice(0, 12) ?? "not selected"}
                        </p>
                      </div>
                      {item.snapshot_id === snapshotId ? (
                        <button
                          className="button"
                          onClick={() => void restore(item.id)}
                        >
                          Open saved record
                        </button>
                      ) : (
                        <Link
                          className="button"
                          href={
                            "/app/lab/evidence?snapshot=" + item.snapshot_id
                          }
                        >
                          Open frozen source scope
                        </Link>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </section>
  );
}

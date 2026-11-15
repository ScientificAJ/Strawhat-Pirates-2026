"use client";
import { isInvestigationId } from "../lib/investigation-identifiers";

import {
  ArrowRight,
  Bookmark,
  Check,
  Filter,
  Grid2X2,
  List,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Investigation, useResource } from "../lib/api";
import {
  compileFilters,
  Filters,
  initialFilters,
  proposeLanguage,
  RecordHit,
  recordIdentity,
  rowRoles,
  runHref,
  SourcePredicate,
} from "../lib/discovery-helpers";
import {
  listDocuments,
  readDocument,
  saveDocument,
  WorkspaceDocument,
} from "../lib/workspace-documents";
import { useResearchContext } from "../lib/research-context";
import { activeWorkspaceId } from "../lib/local-workspaces";
import { ErrorState, LoadingRows } from "./chrome";
import {
  Anchor,
  CompiledQuery,
  Empty,
  errorMessage,
  human,
  InspectButton,
  post,
  SourceInspector,
  useQuery,
} from "./workbench-common";
import { sourceRole } from "./scientific-records";
import { ActualThumbnail } from "./run-workbench";
import s from "./workbench.module.css";
import journey from "./research-journey.module.css";
import { investigationAvailability } from "../lib/source-description";

type Page<T> = {
  snapshot_id: string;
  items: T[];
  total: number;
  next_cursor: string | null;
  limitations?: string[];
  catalog_facets?: CatalogFacet[];
  catalog_classifications?: Record<string, Record<string, CatalogAnnotation[]>>;
  catalog_annotation_version?: string;
};
type CatalogFacet = {
  name: string;
  label: string;
  entity_level: string;
  options: { value: string; label: string; count: number }[];
};
type CatalogAnnotation = {
  value: string;
  label: string;
  origin: string;
  quote: string | null;
  anchor: Anchor | null;
  scope: string;
};
type InvestigationHit = Investigation & {
  asset_count: number;
  coverage: string;
  match_explanation: string;
};
type SemanticHit = {
  accession: string | null;
  title: string;
  source_id: string;
  text: string;
  kind: string;
  anchors: Anchor[];
  fusion_score: number;
};
type SearchDefinition = {
  filters: Filters;
  mode: "exact" | "semantic";
  semanticQuestion: string;
};
type CollectionDefinition = {
  level: Filters["entity"];
  items: (InvestigationHit | RecordHit)[];
  query?: unknown;
  filters?: Filters;
};
function objectiveExcerpt(value: string) {
  return value.length <= 280
    ? value
    : value.slice(0, 280).replace(/\s+\S*$/, "") + "…";
}
function CatalogContext({
  accession,
  values,
  onInspect,
}: {
  accession: string;
  values?: Record<string, CatalogAnnotation[]>;
  onInspect: (anchor: Anchor) => void;
}) {
  if (!values) return null;
  return (
    <details>
      <summary>Topic sources · {accession}</summary>
      <p className={s.help}>
        These topics describe the research scope. Open a source to see the
        original wording.
      </p>
      <div className={s.annotationList}>
        {Object.entries(values).map(([name, annotations]) => (
          <section key={name}>
            <h4>{human(name)}</h4>
            {annotations.map((annotation) => (
              <div key={annotation.value}>
                <strong>{annotation.label}</strong>
                <small>{human(annotation.origin)}</small>
                {annotation.quote && (
                  <blockquote>{annotation.quote}</blockquote>
                )}
                {annotation.anchor && (
                  <InspectButton
                    anchor={annotation.anchor}
                    onInspect={onInspect}
                  />
                )}
              </div>
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}

export function DiscoveryWorkbench({
  snapshotId,
  initialQuery = "",
}: {
  snapshotId: string;
  initialQuery?: string;
}) {
  const router = useRouter();
  const { context, updateContext } = useResearchContext();
  const [draft, setDraft] = useState<Filters>(initialFilters);
  const [applied, setApplied] = useState<Filters>(initialFilters);
  const [mode, setMode] = useState<"exact" | "semantic">("exact");
  const [cards, setCards] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [closeFilterChoice, setCloseFilterChoice] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [selection, setSelection] = useState<
    Record<string, InvestigationHit | RecordHit>
  >({});
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [message, setMessage] = useState("");
  const [problem, setProblem] = useState("");
  const [language, setLanguage] = useState("");
  const [proposal, setProposal] = useState<ReturnType<
    typeof proposeLanguage
  > | null>(null);
  const [semantic, setSemantic] = useState<{
    results: SemanticHit[];
    semantic_status: string;
    limitations: string[];
  } | null>(null);
  const [meaningLoading, setMeaningLoading] = useState(false);
  const [saved, setSaved] = useState<WorkspaceDocument<SearchDefinition>[]>([]);
  const [collections, setCollections] = useState<
    WorkspaceDocument<CollectionDefinition>[]
  >([]);
  const [loadedCollection, setLoadedCollection] =
    useState<WorkspaceDocument<CollectionDefinition> | null>(null);
  const [undoSelection, setUndoSelection] = useState<typeof selection | null>(
    null,
  );
  const [saveTitle, setSaveTitle] = useState("");
  const [loadedSearch, setLoadedSearch] =
    useState<WorkspaceDocument<SearchDefinition> | null>(null);
  const [undo, setUndo] = useState<Filters | null>(null);
  const [ruleField, setRuleField] = useState("");
  const [ruleOperator, setRuleOperator] = useState("contains");
  const [ruleValue, setRuleValue] = useState("");
  const [facetSearches, setFacetSearches] = useState<Record<string, string>>(
    {},
  );
  const [hydratedSnapshot, setHydratedSnapshot] = useState("");
  useEffect(() => {
    let active = true;
    void (async () => {
      let filters = { ...initialFilters };
      let chosen: typeof selection = {};
      try {
        const stored = sessionStorage.getItem(
          "nova-discovery-view:" + activeWorkspaceId() + ":" + snapshotId,
        );
        if (stored) {
          const value = JSON.parse(stored);
          filters = { ...initialFilters, ...value.filters };
          chosen = value.selection ?? {};
          compileFilters(filters, snapshotId);
        }
      } catch {
        filters = { ...initialFilters };
        chosen = {};
      }
      const params = new URLSearchParams(window.location.search);
      if (params.get("entity") === "records") filters.entity = "records";
      if (params.has("accession"))
        filters.accession = params.get("accession") ?? "";
      if (initialQuery) filters.text = initialQuery;
      const focus = params.get("focus");
      const focusValues: Record<string, string> = {
        prevention: "Material flammability",
        detection: "Detection research",
        suppression: "Suppression research",
      };
      if (focus && focusValues[focus]) {
        filters = {
          ...initialFilters,
          catalogFacets: { purpose: [focusValues[focus]] },
        };
        chosen = {};
      }
      const savedId = params.get("saved");
      if (savedId) {
        try {
          const saved = await readDocument<
            SearchDefinition | CollectionDefinition
          >(savedId);
          if (!active) return;
          if (!saved)
            throw new Error(
              "This saved research is unavailable. Restore a research backup to reopen it.",
            );
          if (saved.snapshot_id !== snapshotId)
            throw new Error(
              "This research belongs to another source version. Open its saved link to restore that version.",
            );
          if (saved.kind === "collection") {
            setHydratedSnapshot(snapshotId);
            openCollection(saved as WorkspaceDocument<CollectionDefinition>);
            return;
          }
          if (!["saved_search", "search"].includes(saved.kind))
            throw new Error(
              "This saved item is not a search or source collection.",
            );
          const definition = saved.data as SearchDefinition;
          filters = { ...initialFilters, ...definition.filters };
          compileFilters(filters, snapshotId);
          chosen = {};
          setLoadedSearch(saved as WorkspaceDocument<SearchDefinition>);
          setSaveTitle(saved.title);
          setLanguage(
            typeof definition.semanticQuestion === "string"
              ? definition.semanticQuestion
              : "",
          );
          setMode(definition.mode === "semantic" ? "semantic" : "exact");
          setSemantic(null);
          setMessage(
            definition.mode === "semantic"
              ? "Your saved question is ready below. Choose Find related evidence to run it again."
              : `Opened ${saved.title}.`,
          );
        } catch (reason) {
          if (active) setProblem(errorMessage(reason));
        }
      }
      if (!active) return;
      setDraft(filters);
      setApplied(filters);
      setSelection(chosen);
      setCursor(null);
      setPrevious([]);
      setHydratedSnapshot(snapshotId);
    })();
    return () => {
      active = false;
    };
  }, [snapshotId, initialQuery]);
  useEffect(() => {
    if (hydratedSnapshot !== snapshotId) return;
    try {
      sessionStorage.setItem(
        "nova-discovery-view:" + activeWorkspaceId() + ":" + snapshotId,
        JSON.stringify({ filters: applied, selection }),
      );
    } catch {
      setMessage(
        "Your recent view could not be remembered. Save this search to return to it later.",
      );
    }
  }, [snapshotId, hydratedSnapshot, applied, selection]);
  const compiled = useMemo(
    () => compileFilters(applied, snapshotId, cursor),
    [applied, snapshotId, cursor],
  );
  const results = useQuery<Page<InvestigationHit | RecordHit>>(
    "/v1/discovery/" + applied.entity,
    compiled,
    hydratedSnapshot === snapshotId,
  );
  const catalog = useResource<{ items: Investigation[] }>(
    "/v1/investigations?limit=100&snapshot_id=" + snapshotId,
  );
  const sourceFields = useQuery<Page<RecordHit>>(
    "/v1/discovery/records",
    {
      snapshot_id: snapshotId,
      accessions: draft.accession ? [draft.accession] : [],
      catalog_facets: draft.catalogFacets ?? {},
      limit: 100,
    },
    draft.entity === "records",
  );
  const fieldChoices = useMemo(() => {
    const choices = new Map<string, RecordHit["record"]["fields"][number]>();
    for (const row of sourceFields.data?.items ?? [])
      for (const field of row.record.fields)
        if (field.quantity_kind || field.source_column)
          choices.set(
            JSON.stringify([
              field.quantity_kind,
              field.source_column,
              field.basis,
              field.location,
            ]),
            field,
          );
    return [...choices.entries()].sort((a, b) =>
      (a[1].source_column ?? "").localeCompare(b[1].source_column ?? ""),
    );
  }, [sourceFields.data]);
  function addRule() {
    try {
      const field = fieldChoices.find(([key]) => key === ruleField)?.[1];
      if (!field) throw new Error("Choose an available source field first.");
      if (
        !field.quantity_kind &&
        !["contains", "present"].includes(ruleOperator)
      )
        throw new Error(
          "An unclassified source column supports only original text or presence; its numerical meaning and units remain unresolved.",
        );
      const predicate: SourcePredicate = {
        quantity_kind: field.quantity_kind ?? null,
        source_column: field.source_column ?? undefined,
        operator: ruleOperator,
        ...(field.basis ? { basis: field.basis } : {}),
        ...(field.location ? { location: field.location } : {}),
      };
      if (ruleOperator === "contains") {
        if (!ruleValue.trim())
          throw new Error("Enter the original source text to match.");
        predicate.value = ruleValue;
      } else if (!["present", "missing"].includes(ruleOperator)) {
        if (
          !ruleValue.trim() ||
          !Number.isFinite(Number(ruleValue)) ||
          !field.canonical_unit
        )
          throw new Error(
            "This numeric rule needs a finite value and an available canonical unit. An unresolved source field can be matched by original text instead.",
          );
        predicate.value = Number(ruleValue);
        predicate.unit = field.canonical_unit;
      }
      if ((draft.additionalPredicates?.length ?? 0) >= 16)
        throw new Error(
          "This query holds up to sixteen additional rules; the numeric quick filter reserves up to two more.",
        );
      setDraft((value) => ({
        ...value,
        additionalPredicates: [
          ...(value.additionalPredicates ?? []),
          predicate,
        ],
      }));
      setRuleValue("");
      setProblem("");
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  const selectedCount = Object.keys(selection).length;
  useEffect(() => {
    const load = () =>
      Promise.all([
        listDocuments<SearchDefinition>("saved_search"),
        listDocuments<CollectionDefinition>("collection"),
      ])
        .then(([searches, values]) => {
          setSaved(searches);
          setCollections(values);
        })
        .catch((reason) => setProblem(errorMessage(reason)));
    load();
    window.addEventListener("nova-ember-workspace-changed", load);
    return () =>
      window.removeEventListener("nova-ember-workspace-changed", load);
  }, []);

  function change<K extends keyof Filters>(
    name: K,
    value: Filters[K],
    live = true,
  ) {
    if (name === "entity" && selectedCount) {
      setProblem(
        "Clear the current selection before changing entity level; saved collections remain available.",
      );
      return;
    }
    const next = { ...draft, [name]: value };
    setDraft(next);
    if (live && window.matchMedia("(min-width: 761px)").matches) {
      try {
        compileFilters(next, snapshotId);
      } catch (reason) {
        setProblem(errorMessage(reason));
        return;
      }
      setApplied(next);
      setCursor(null);
      setPrevious([]);
    }
  }
  function apply() {
    try {
      compileFilters(draft, snapshotId);
      setApplied(draft);
      setCursor(null);
      setPrevious([]);
      setProblem("");
      setFiltersOpen(false);
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  function toggle(item: InvestigationHit | RecordHit) {
    const key = "record" in item ? recordIdentity(item) : item.accession;
    if (!selection[key] && selectedCount >= 8) {
      setProblem(
        "This comparison tray holds eight items. Save this collection before starting another selection.",
      );
      return;
    }
    const next = { ...selection };
    if (next[key]) delete next[key];
    else next[key] = item;
    selectItems(next);
  }
  function selectItems(next: typeof selection, keepUndo = true) {
    if (keepUndo) setUndoSelection(selection);
    setSelection(next);
    const items = Object.values(next);
    const sources = new Map<
      string,
      {
        asset_sha256: string;
        accession: string;
        asset_id: string;
        source_rows: number[];
        columns: number[];
      }
    >();
    for (const selected of items)
      if ("record" in selected) {
        const identity = selected.asset.id;
        const source = sources.get(identity) ?? {
          asset_sha256: selected.asset.sha256,
          accession: selected.accession,
          asset_id: identity,
          source_rows: [],
          columns: [],
        };
        source.source_rows.push(selected.record.source_row);
        sources.set(identity, source);
      }
    updateContext({
      investigations: [...new Set(items.map((value) => value.accession))],
      selected_sources: [...sources.values()],
    });
  }
  useEffect(() => {
    if (hydratedSnapshot === snapshotId && context)
      selectItems(selection, false);
    // Rehydrate the exact selection once the shared research context is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, hydratedSnapshot, snapshotId, context?.snapshot_id]);
  function openCollection(
    document: WorkspaceDocument<CollectionDefinition>,
    definition = document.data,
  ) {
    try {
      if (document.snapshot_id !== snapshotId)
        throw new Error("Open the collection's frozen source snapshot first.");
      if (
        !["investigations", "records"].includes(definition.level) ||
        !Array.isArray(definition.items) ||
        definition.items.some(
          (item) => !item || !isInvestigationId(item.accession),
        )
      )
        throw new Error(
          "The collection has an invalid source selection; its original document was preserved.",
        );
      const chosen = Object.fromEntries(
        definition.items.map((item) => [
          "record" in item ? recordIdentity(item) : item.accession,
          item,
        ]),
      );
      selectItems(chosen);
      setLoadedCollection(document);
      setSaveTitle(document.title);
      const accessions = [
        ...new Set(definition.items.map((item) => item.accession)),
      ];
      const filters = {
        ...initialFilters,
        ...(definition.filters ?? {}),
        entity: definition.level,
        ...(!definition.filters && accessions.length === 1
          ? { accession: accessions[0] }
          : {}),
      };
      compileFilters(filters, snapshotId);
      setDraft(filters);
      setApplied(filters);
      setCursor(null);
      setPrevious([]);
      setMessage(
        `Opened ${document.title}. Your selected sources are ready to compare or explore.`,
      );
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  async function save(kind: string) {
    try {
      const data =
        kind === "saved_search"
          ? { filters: applied, mode, semanticQuestion: language }
          : {
              level: applied.entity,
              items: Object.values(selection),
              query: compiled,
              filters: applied,
            };
      const input = {
        kind,
        title:
          saveTitle.trim() ||
          (kind === "saved_search"
            ? applied.text || "Saved investigation query"
            : "Selected " + applied.entity),
        snapshot_id: snapshotId,
        data,
      };
      const document = await saveDocument({
        ...input,
        ...(kind === "saved_search" && loadedSearch
          ? { id: loadedSearch.id, revision: loadedSearch.revision }
          : kind === "collection" && loadedCollection
            ? { id: loadedCollection.id, revision: loadedCollection.revision }
            : {}),
      });
      setMessage("Saved. You can find this research in Saved research.");
      if (kind === "comparison")
        router.push("/app/compare/" + document.id + "?snapshot=" + snapshotId);
      if (kind === "saved_search")
        setLoadedSearch(document as WorkspaceDocument<SearchDefinition>);
      if (kind === "collection")
        setLoadedCollection(
          document as WorkspaceDocument<CollectionDefinition>,
        );
    } catch (reason) {
      setProblem(errorMessage(reason));
    }
  }
  async function searchMeaning() {
    if (!language.trim()) {
      setProblem(
        "Enter the scientific question you want to search by meaning.",
      );
      return;
    }
    setMeaningLoading(true);
    setProblem("");
    try {
      const hard = compileFilters(
        { ...draft, entity: "investigations", text: "" },
        snapshotId,
      );
      const eligible = await post<Page<InvestigationHit>>(
        "/v1/discovery/investigations",
        { ...hard, limit: 100 },
      );
      if (!eligible.items.length) {
        setSemantic({
          results: [],
          semantic_status: "no_matching_hard_filters",
          limitations: [
            "No investigations match the explicit filters in this snapshot.",
          ],
        });
        return;
      }
      const value = await post<NonNullable<typeof semantic>>(
        "/v1/search/semantic",
        {
          snapshot_id: snapshotId,
          query: language,
          accessions: eligible.items.map((item) => item.accession),
          limit: 12,
        },
      );
      setSemantic(value);
      setApplied({ ...draft, entity: "investigations" });
    } catch (reason) {
      setProblem(errorMessage(reason));
    } finally {
      setMeaningLoading(false);
    }
  }
  const chips = Object.entries(applied).filter(
    ([key, value]) =>
      value &&
      ![
        "entity",
        "quantity",
        "unit",
        "includeMissing",
        "requireQuantity",
        "minimumExclusive",
        "maximumExclusive",
        "additionalPredicates",
        "catalogFacets",
      ].includes(key),
  );
  return (
    <section className={s.workbench}>
      <div className="page-heading">
        <div>
          <h1>Explore investigations</h1>
          <p>
            Discover what NASA studied, why it matters, and the evidence you can
            work with.
          </p>
        </div>
      </div>
      <div className={journey.topics} aria-label="Explore a research topic">
        {[
          ["Flame spread", "spread"],
          ["Droplet combustion", "droplet"],
          ["Smoke and detection", "smoke"],
          ["Gas flames", "gas"],
        ].map(([label, term]) => (
          <button
            className="button button-small"
            key={term}
            onClick={() => {
              if (selectedCount && applied.entity === "records") {
                setProblem(
                  "Clear the selected records before exploring investigation topics.",
                );
                return;
              }
              const next = { ...initialFilters, text: term };
              setDraft(next);
              setApplied(next);
              setCursor(null);
              setPrevious([]);
              setMode("exact");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className={journey.topics} aria-label="Fire safety research focus">
        {[
          ["Prevention", "Material flammability"],
          ["Detection", "Detection research"],
          ["Suppression", "Suppression research"],
        ].map(([label, focus]) => (
          <button
            className="button button-small"
            type="button"
            key={focus}
            aria-pressed={
              applied.catalogFacets?.purpose?.includes(focus) ?? false
            }
            onClick={() => {
              if (selectedCount && applied.entity === "records") {
                setProblem(
                  "Clear the selected records before exploring investigation topics.",
                );
                return;
              }
              const next = {
                ...initialFilters,
                catalogFacets: { purpose: [focus] },
              };
              setDraft(next);
              setApplied(next);
              setCursor(null);
              setPrevious([]);
              setMode("exact");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={s.tabs}
        role="tablist"
        aria-label="Explore investigations or data"
      >
        {(["investigations", "records"] as const).map((level) => (
          <button
            key={level}
            role="tab"
            aria-selected={draft.entity === level}
            onClick={() => change("entity", level)}
          >
            {level === "records" ? "Search data records" : "Investigations"}
          </button>
        ))}
      </div>
      <div className={s.toolbar}>
        <form
          className={s.search}
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <label className="visually-hidden" htmlFor="discovery-text">
            Exact{" "}
            {draft.entity === "records" ? "source phrase" : "metadata terms"}
          </label>
          <input
            id="discovery-text"
            value={draft.text}
            onChange={(event) => change("text", event.target.value, false)}
            placeholder={
              draft.entity === "records"
                ? "Exact phrase in source cells"
                : "Investigation, material, or scientific purpose"
            }
          />
          <button className="button button-primary">
            <Search size={17} /> Search
          </button>
        </form>
        <button
          className={"button " + s.filterToggle + " " + journey.filterButton}
          onClick={() => {
            if (
              filtersOpen &&
              JSON.stringify(draft) !== JSON.stringify(applied)
            )
              setCloseFilterChoice(true);
            else setFiltersOpen((value) => !value);
          }}
          aria-expanded={filtersOpen}
          aria-controls="discovery-filter-panel"
        >
          <Filter size={16} /> Filters
        </button>
        <div className={s.actions} aria-label="Result layout">
          <button
            className="icon-button"
            aria-label="Table view"
            aria-pressed={!cards}
            onClick={() => setCards(false)}
          >
            <List size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Card view"
            aria-pressed={cards}
            onClick={() => setCards(true)}
          >
            <Grid2X2 size={18} />
          </button>
        </div>
      </div>
      {closeFilterChoice && (
        <div className={s.notice} role="status">
          <p>The filter drawer has unapplied changes.</p>
          <div className={s.actions}>
            <button
              className="button"
              onClick={() => {
                setFiltersOpen(false);
                setCloseFilterChoice(false);
              }}
            >
              Keep draft and close
            </button>
            <button
              className="button"
              onClick={() => {
                setDraft(applied);
                setFiltersOpen(false);
                setCloseFilterChoice(false);
              }}
            >
              Discard draft and close
            </button>
            <button
              className="text-button"
              onClick={() => setCloseFilterChoice(false)}
            >
              Continue editing
            </button>
          </div>
        </div>
      )}
      {problem && (
        <div className={s.error} role="alert">
          {problem}
          <button className="text-button" onClick={() => setProblem("")}>
            Dismiss
          </button>
        </div>
      )}
      {message && (
        <p role="status" className={s.success}>
          {message}
        </p>
      )}
      {loadedSearch?.data.mode === "semantic" && !semantic && (
        <section className={s.notice}>
          <h2>Your saved research question</h2>
          <p>{language}</p>
          <button
            className="button button-primary"
            disabled={meaningLoading || !language.trim()}
            onClick={() => {
              setMode("semantic");
              void searchMeaning();
            }}
          >
            {meaningLoading
              ? "Finding related evidence…"
              : "Find related evidence"}{" "}
            <Search size={16} />
          </button>
        </section>
      )}
      <div className={s.chips} aria-label="Active filters">
        {Object.entries(applied.catalogFacets ?? {}).flatMap(([name, values]) =>
          values.map((value) => (
            <span className={s.chip} key={name + value}>
              {human(name)}:{" "}
              {value === "__unknown__"
                ? "Not classified / not reported"
                : value}
              <button
                aria-label={
                  "Remove " + human(name) + " catalog filter " + value
                }
                onClick={() => {
                  const next = {
                    ...applied,
                    catalogFacets: {
                      ...applied.catalogFacets,
                      [name]: values.filter((item) => item !== value),
                    },
                  };
                  setDraft(next);
                  setApplied(next);
                  setCursor(null);
                  setPrevious([]);
                }}
              >
                <X size={13} />
              </button>
            </span>
          )),
        )}
        {undoSelection && (
          <button
            className="text-button"
            onClick={() => {
              selectItems(undoSelection, false);
              setUndoSelection(null);
            }}
          >
            Undo selection change
          </button>
        )}
        {(applied.additionalPredicates ?? []).map((rule, index) => (
          <span key={"condition-" + index} className={s.chip}>
            {rule.source_column || human(rule.quantity_kind)}:{" "}
            {human(rule.operator)} {rule.value ?? ""} {rule.unit ?? ""}
            <button
              aria-label={"Remove additional condition " + (index + 1)}
              onClick={() => {
                const next = {
                  ...applied,
                  additionalPredicates: applied.additionalPredicates.filter(
                    (_, position) => position !== index,
                  ),
                };
                setDraft(next);
                setApplied(next);
                setCursor(null);
                setPrevious([]);
              }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {chips.map(([key, value]) => (
          <span className={s.chip} key={key}>
            {human(key)}: {String(value)}
            <button
              aria-label={"Remove " + human(key) + " filter"}
              onClick={() => {
                const next = { ...applied, [key]: "" };
                setApplied(next);
                setDraft(next);
                setCursor(null);
                setPrevious([]);
              }}
            >
              <X size={13} />
            </button>
          </span>
        ))}
        {(chips.length > 0 ||
          applied.additionalPredicates?.length > 0 ||
          Object.values(applied.catalogFacets ?? {}).some(
            (values) => values.length,
          )) && (
          <button
            className="text-button"
            onClick={() => {
              setUndo(applied);
              setApplied({ ...initialFilters, entity: applied.entity });
              setDraft({ ...initialFilters, entity: applied.entity });
              setCursor(null);
              setPrevious([]);
            }}
          >
            Clear filters
          </button>
        )}
        {undo && (
          <button
            className="text-button"
            onClick={() => {
              setDraft(undo);
              setApplied(undo);
              setUndo(null);
            }}
          >
            Undo clear
          </button>
        )}
      </div>
      <div
        className={s.split + " " + journey.explorer}
        data-filters={filtersOpen}
      >
        <aside
          id="discovery-filter-panel"
          className={s.filters + " " + journey.filters}
          data-open={filtersOpen}
        >
          <h2>
            <SlidersHorizontal size={17} /> Refine results
          </h2>
          <fieldset>
            <legend>Source and availability</legend>
            <label>
              Investigation
              <select
                value={draft.accession}
                onChange={(event) => change("accession", event.target.value)}
              >
                <option value="">All investigations</option>
                {catalog.data?.items.map((item) => (
                  <option key={item.accession} value={item.accession}>
                    {item.acronym || item.accession} · {item.accession}
                  </option>
                ))}
              </select>
            </label>
            {draft.entity === "investigations" ? (
              <>
                <label>
                  Hardware or apparatus
                  <input
                    value={draft.hardware}
                    onChange={(event) =>
                      change("hardware", event.target.value, false)
                    }
                  />
                </label>
                <label>
                  Platform as reported
                  <input
                    value={draft.platform}
                    onChange={(event) =>
                      change("platform", event.target.value, false)
                    }
                  />
                </label>
                <label>
                  Availability
                  <select
                    value={draft.availability}
                    onChange={(event) =>
                      change("availability", event.target.value)
                    }
                  >
                    <option value="">All source states</option>
                    <option value="assets_available">
                      Retained source files
                    </option>
                    <option value="interpreted_table">
                      Experimental table available
                    </option>
                    <option value="catalog_only">Catalog only</option>
                  </select>
                </label>
              </>
            ) : (
              <label>
                Original record role
                <select
                  value={draft.rowKind}
                  onChange={(event) => change("rowKind", event.target.value)}
                >
                  <option value="">All source roles</option>
                  {rowRoles.map((role) => (
                    <option key={role} value={role}>
                      {sourceRole(role)}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>Research topics and conditions</legend>
            <p className={s.help}>
              Topics describe the investigation, not verified conditions for
              every test. Counts update when filters are applied.
            </p>
            {results.data?.catalog_facets?.map((facet) => (
              <details key={facet.name}>
                <summary>
                  {facet.label}
                  {(draft.catalogFacets?.[facet.name]?.length ?? 0) > 0
                    ? " · " +
                      draft.catalogFacets[facet.name].length +
                      " selected"
                    : ""}
                </summary>
                {facet.options.length > 8 && (
                  <label>
                    Find an option
                    <input
                      type="search"
                      aria-label={"Find " + facet.label + " option"}
                      value={facetSearches[facet.name] ?? ""}
                      onChange={(event) =>
                        setFacetSearches((value) => ({
                          ...value,
                          [facet.name]: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
                <div className={s.facetOptions}>
                  {facet.options
                    .filter(
                      (option) =>
                        !facetSearches[facet.name] ||
                        option.label
                          .toLocaleLowerCase()
                          .includes(
                            facetSearches[facet.name].toLocaleLowerCase(),
                          ) ||
                        draft.catalogFacets?.[facet.name]?.includes(
                          option.value,
                        ),
                    )
                    .map((option) => (
                      <label key={option.value} className={s.check}>
                        <input
                          type="checkbox"
                          aria-label={
                            facet.label +
                            ": " +
                            option.label +
                            " (" +
                            option.count +
                            ")"
                          }
                          checked={Boolean(
                            draft.catalogFacets?.[facet.name]?.includes(
                              option.value,
                            ),
                          )}
                          onChange={(event) => {
                            const current =
                              draft.catalogFacets?.[facet.name] ?? [];
                            if (event.target.checked && current.length >= 32) {
                              setProblem(
                                "Choose up to 32 options in one catalog facet, or save this query before starting another selection.",
                              );
                              return;
                            }
                            change("catalogFacets", {
                              ...(draft.catalogFacets ?? {}),
                              [facet.name]: event.target.checked
                                ? [...current, option.value]
                                : current.filter(
                                    (value) => value !== option.value,
                                  ),
                            });
                          }}
                        />
                        <span>
                          {option.label}{" "}
                          <span className={s.number}>({option.count})</span>
                        </span>
                      </label>
                    ))}
                </div>
              </details>
            ))}
            <p className={s.help}>
              Annotations are intentionally partial. “Not classified” records
              may still contain relevant source text. A publication listing is
              not a verified finding, and a catalog endpoint is not an observed
              event. OR within one group; AND across groups.
            </p>
          </fieldset>
          {draft.entity === "records" && (
            <fieldset>
              <legend>Measured quantities and conditions</legend>
              <label>
                Quantity
                <select
                  value={draft.quantity}
                  onChange={(event) => {
                    const units: Record<string, string> = {
                      oxygen_fraction: "1",
                      length: "m",
                      temperature: "K",
                      duration: "s",
                      speed: "m/s",
                      pressure: "Pa",
                    };
                    change("quantity", event.target.value, false);
                    setDraft((value) => ({
                      ...value,
                      quantity: event.target.value,
                      unit: units[event.target.value],
                    }));
                  }}
                >
                  <option value="oxygen_fraction">Oxygen fraction</option>
                  <option value="length">Length / specimen geometry</option>
                  <option value="temperature">Temperature</option>
                  <option value="duration">Duration</option>
                  <option value="speed">Flow speed</option>
                  <option value="pressure">
                    Pressure (requires resolved reference)
                  </option>
                </select>
              </label>
              <div className={s.fieldGrid}>
                <label>
                  Minimum ({draft.unit})
                  <input
                    inputMode="decimal"
                    value={draft.minimum}
                    onChange={(event) =>
                      change("minimum", event.target.value, false)
                    }
                  />
                </label>
                <label>
                  Maximum ({draft.unit})
                  <input
                    inputMode="decimal"
                    value={draft.maximum}
                    onChange={(event) =>
                      change("maximum", event.target.value, false)
                    }
                  />
                </label>
              </div>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={draft.requireQuantity}
                  onChange={(event) =>
                    change("requireQuantity", event.target.checked, false)
                  }
                />
                Require this canonical quantity even without a numeric bound
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={draft.minimumExclusive}
                  onChange={(event) =>
                    change("minimumExclusive", event.target.checked, false)
                  }
                />
                Exclude the minimum boundary (strictly greater than)
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={draft.maximumExclusive}
                  onChange={(event) =>
                    change("maximumExclusive", event.target.checked, false)
                  }
                />
                Exclude the maximum boundary (strictly less than)
              </label>
              <label>
                Composition basis
                <select
                  value={draft.basis}
                  onChange={(event) =>
                    change("basis", event.target.value, false)
                  }
                >
                  <option value="">Any explicitly resolved basis</option>
                  <option value="mole">Mole</option>
                  <option value="volume">Volume</option>
                  <option value="mass">Mass</option>
                </select>
              </label>
              <label>
                Measurement location
                <input
                  value={draft.location}
                  placeholder="For example: ambient or inlet"
                  onChange={(event) =>
                    change("location", event.target.value, false)
                  }
                />
              </label>
              <label>
                Source value kind
                <select
                  aria-label="Source value kind"
                  value={draft.valueKind}
                  onChange={(event) =>
                    change("valueKind", event.target.value, false)
                  }
                >
                  <option value="">Any reported kind</option>
                  <option value="measurement">Measurement</option>
                  <option value="condition">Reported condition</option>
                  <option value="derived">Derived quantity</option>
                  <option value="setting">Instrument setting</option>
                </select>
              </label>
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={draft.includeMissing}
                  onChange={(event) =>
                    change("includeMissing", event.target.checked, false)
                  }
                />{" "}
                Include unresolved values explicitly
              </label>
              <p className={s.help}>
                Predicates use reviewed canonical quantities. A setting is not a
                calibrated flow; absent measurements remain unknown.
              </p>
            </fieldset>
          )}
          {draft.entity === "records" && (
            <fieldset>
              <legend>Additional source conditions</legend>
              <p className={s.help}>
                Combine material, dimensions, atmosphere, flow, measurements or
                outcomes using their original field definitions. Choices come
                from the first 100 source records in this scope; the applied
                query checks all matching records.
              </p>
              <label>
                Original source field
                <select
                  aria-label="Additional source field"
                  value={ruleField}
                  onChange={(event) => setRuleField(event.target.value)}
                >
                  <option value="">Choose a reported field</option>
                  {fieldChoices.map(([key, field]) => (
                    <option key={key} value={key}>
                      {field.source_column || field.quantity_kind}
                      {field.canonical_unit
                        ? " · " + field.canonical_unit
                        : " · original text"}
                      {field.basis ? " · " + field.basis : ""}
                      {field.location ? " · " + field.location : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Match rule
                <select
                  value={ruleOperator}
                  onChange={(event) => setRuleOperator(event.target.value)}
                >
                  <option value="contains">Original text contains</option>
                  <option value="present">Original value present</option>
                  <option value="missing">Canonical value unresolved</option>
                  <option value="gte">Canonical value at least</option>
                  <option value="lte">Canonical value at most</option>
                  <option value="eq">Canonical value equals</option>
                </select>
              </label>
              {!["present", "missing"].includes(ruleOperator) && (
                <label>
                  Value in the displayed canonical unit, or original text
                  <input
                    value={ruleValue}
                    onChange={(event) => setRuleValue(event.target.value)}
                  />
                </label>
              )}
              <button className="button" onClick={addRule}>
                Add condition to draft
              </button>
              {draft.additionalPredicates?.map((rule, index) => (
                <div key={index} className={s.notice}>
                  <p>
                    {rule.source_column || human(rule.quantity_kind)}:{" "}
                    {human(rule.operator)} {rule.value ?? ""} {rule.unit ?? ""}
                  </p>
                  <button
                    className="text-button"
                    onClick={() =>
                      setDraft((value) => ({
                        ...value,
                        additionalPredicates: value.additionalPredicates.filter(
                          (_, position) => position !== index,
                        ),
                      }))
                    }
                  >
                    Remove condition
                  </button>
                </div>
              ))}
              {draft.additionalPredicates?.length > 0 && (
                <p className={s.help}>
                  These staged rules apply together when you choose Apply
                  filters.
                </p>
              )}
            </fieldset>
          )}
          <button className="button button-primary" onClick={apply}>
            Apply filters
          </button>
          <details className={journey.sourceDetails}>
            <summary>Save or return to a search</summary>
            <fieldset>
              <legend>Saved searches</legend>
              <label>
                Name this query
                <input
                  value={saveTitle}
                  onChange={(event) => setSaveTitle(event.target.value)}
                  placeholder="Research question or collection name"
                />
              </label>
              <button
                className="button"
                onClick={() => void save("saved_search")}
              >
                <Bookmark size={16} /> Save query
                {loadedSearch ? " revision" : ""}
              </button>
              {loadedSearch && (
                <button
                  className="text-button"
                  onClick={() => setLoadedSearch(null)}
                >
                  Save as a new query instead
                </button>
              )}
              {saved.map((document) => (
                <div key={document.id}>
                  {document.snapshot_id === snapshotId ? (
                    <button
                      className="text-button"
                      onClick={() => {
                        const filters = {
                          ...initialFilters,
                          ...document.data.filters,
                        };
                        setDraft(filters);
                        setApplied(filters);
                        setLanguage(document.data.semanticQuestion);
                        setMode(document.data.mode);
                        setSemantic(null);
                        setLoadedSearch(document);
                        setSaveTitle(document.title);
                        setCursor(null);
                        setPrevious([]);
                        setSelection({});
                        updateContext({
                          investigations: [],
                          selected_sources: [],
                        });
                      }}
                    >
                      {document.title} · revision {document.revision}
                    </button>
                  ) : (
                    <Link
                      href={
                        "/app/investigations?snapshot=" + document.snapshot_id
                      }
                    >
                      {document.title} · open its frozen snapshot
                    </Link>
                  )}
                </div>
              ))}
            </fieldset>
            <fieldset>
              <legend>Reusable collections</legend>
              {!collections.length && (
                <p className={s.help}>
                  Save a selected set to reopen the exact source identities
                  later.
                </p>
              )}
              {collections.map((document) => (
                <div key={document.id}>
                  {document.snapshot_id === snapshotId ? (
                    <button
                      className="text-button"
                      onClick={() => openCollection(document)}
                    >
                      Open {document.title} · revision {document.revision}
                    </button>
                  ) : (
                    <Link
                      href={
                        "/app/investigations?snapshot=" + document.snapshot_id
                      }
                    >
                      {document.title} · open frozen snapshot
                    </Link>
                  )}
                </div>
              ))}
              {loadedCollection && (
                <>
                  <label>
                    Restore a frozen selection
                    <select
                      aria-label="Restore collection selection revision"
                      value=""
                      onChange={(event) => {
                        const revision = loadedCollection.revisions.find(
                          (item) =>
                            item.revision === Number(event.target.value),
                        );
                        if (revision)
                          openCollection(loadedCollection, revision.data);
                      }}
                    >
                      <option value="">Choose an earlier selection</option>
                      {loadedCollection.revisions
                        .filter((item) => item.snapshot_id === snapshotId)
                        .map((item) => (
                          <option key={item.revision} value={item.revision}>
                            Revision {item.revision} ·{" "}
                            {item.data.items?.length ?? 0} items
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setLoadedCollection(null);
                      setSaveTitle("");
                    }}
                  >
                    Save the selection as a new collection
                  </button>
                </>
              )}
            </fieldset>
          </details>
        </aside>
        <div
          className={s.results}
          aria-busy={results.loading || meaningLoading}
        >
          {selectedCount > 0 && (
            <div className={s.selection + " " + journey.selectionTray}>
              <strong>
                <Check size={16} /> {selectedCount} selected{" "}
                {applied.entity === "records"
                  ? "source records"
                  : "research entries"}
              </strong>
              <details>
                <summary>Inspect selected identities across all pages</summary>
                <ul>
                  {Object.values(selection).map((item) => (
                    <li
                      key={
                        "record" in item ? recordIdentity(item) : item.accession
                      }
                    >
                      <Link
                        href={
                          "record" in item
                            ? runHref(item, snapshotId)
                            : "/app/investigations/" +
                              item.accession +
                              "?snapshot=" +
                              snapshotId
                        }
                      >
                        {item.accession}
                        {"record" in item
                          ? " · " +
                            item.asset.file_name +
                            " · physical line " +
                            item.record.source_row
                          : " · " + item.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
              <button
                className="button button-primary"
                disabled={selectedCount < 2}
                onClick={() => void save("comparison")}
              >
                Compare{selectedCount > 2 ? " in a matrix" : " side by side"}
              </button>
              <button
                className="button"
                onClick={() => void save("collection")}
              >
                Save collection{loadedCollection ? " revision" : ""}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  selectItems({});
                }}
              >
                Clear selection
              </button>
            </div>
          )}
          {semantic && mode === "semantic" && (
            <section className={s.surface}>
              <div className={s.sectionHeading}>
                <h2>Meaning-ranked evidence</h2>
                <button
                  className="text-button"
                  onClick={() => setMode("exact")}
                >
                  Return to exact results
                </button>
              </div>
              <p className={s.help}>
                {human(semantic.semantic_status)} · Retrieval rank is a
                discovery heuristic, not accuracy or a probability.
              </p>
              <ul className={s.sourceList}>
                {semantic.results.map((hit) => (
                  <li key={hit.source_id}>
                    <Link
                      href={
                        "/app/investigations/" +
                        hit.accession +
                        "?snapshot=" +
                        snapshotId
                      }
                    >
                      {hit.title}
                    </Link>
                    <blockquote>{hit.text}</blockquote>
                    <span className={s.help}>
                      {human(hit.kind)} · {hit.accession ?? "NTRS source"}
                    </span>
                    {hit.anchors.map((located, index) => (
                      <InspectButton
                        key={index}
                        anchor={located}
                        onInspect={setAnchor}
                      />
                    ))}
                  </li>
                ))}
              </ul>
              {!semantic.results.length && (
                <Empty>
                  No evidence matches this submitted scope. Inspect the explicit
                  filters before broadening the query.
                </Empty>
              )}
            </section>
          )}
          <div className={s.toolbar}>
            <p className={s.help} aria-live="polite">
              {results.data
                ? results.data.total +
                  (applied.entity === "records"
                    ? " source records"
                    : " research entries") +
                  " found"
                : "Finding investigations"}
              {results.loading && results.data
                ? " · Updating; prior results remain visible"
                : ""}
            </p>
            {applied.entity === "records" && (
              <span className={s.help}>
                Records retain their original source definitions.
              </span>
            )}
          </div>
          {results.error ? (
            <ErrorState message={results.error} retry={results.reload} />
          ) : !results.data ? (
            <LoadingRows label="Finding source evidence" />
          ) : !results.data.items.length ? (
            <Empty>
              No{" "}
              {applied.entity === "records"
                ? "source records"
                : "investigations"}{" "}
              match these filters. Try a broader term or clear a filter to see
              more research.
            </Empty>
          ) : cards ? (
            <div className={journey.catalog}>
              {results.data.items.map((item) => {
                const key =
                  "record" in item ? recordIdentity(item) : item.accession;
                return (
                  <article className={journey.investigation} key={key}>
                    {!("record" in item) && (
                      <ActualThumbnail
                        accession={item.accession}
                        snapshotId={snapshotId}
                      />
                    )}
                    <h2>
                      <Link
                        href={
                          "record" in item
                            ? runHref(item, snapshotId)
                            : "/app/investigations/" +
                              item.accession +
                              "?snapshot=" +
                              snapshotId
                        }
                      >
                        {"record" in item
                          ? item.accession + " · line " + item.record.source_row
                          : item.acronym || item.title}
                      </Link>
                    </h2>
                    {"record" in item ? (
                      <>
                        <p>{sourceRole(item.record.row_kind)}</p>
                        <p>
                          {item.record.raw_cells
                            .filter(Boolean)
                            .slice(0, 5)
                            .join(" · ")}
                        </p>
                        <InspectButton
                          anchor={{ ...item.anchor, asset_id: item.asset.id }}
                          onInspect={setAnchor}
                        />
                      </>
                    ) : (
                      <>
                        {item.acronym && (
                          <p className={journey.fullTitle}>{item.title}</p>
                        )}
                        <p className={journey.purpose}>
                          {objectiveExcerpt(
                            item.objective ||
                              item.description ||
                              "Objectives are not reported in this catalog entry.",
                          )}
                        </p>
                        <p>{investigationAvailability(item)}</p>
                        <CatalogContext
                          accession={item.accession}
                          values={
                            results.data?.catalog_classifications?.[
                              item.accession
                            ]
                          }
                          onInspect={setAnchor}
                        />
                      </>
                    )}
                    <div className={journey.cardActions}>
                      <label className={s.check}>
                        <input
                          type="checkbox"
                          checked={Boolean(selection[key])}
                          onChange={() => toggle(item)}
                        />{" "}
                        Select{" "}
                        {"record" in item
                          ? "source record"
                          : item.acronym || item.accession}
                      </label>
                      <Link
                        className="text-button"
                        href={
                          "record" in item
                            ? runHref(item, snapshotId)
                            : `/app/investigations/${item.accession}?snapshot=${snapshotId}`
                        }
                      >
                        {"record" in item
                          ? "Open record"
                          : item.record_type === "program"
                            ? "Explore research program"
                            : "Explore investigation"}{" "}
                        <ArrowRight size={15} />
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={s.scroll}>
              <table className={s.table}>
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="visually-hidden">Selection</span>
                    </th>
                    <th scope="col">
                      {applied.entity === "records"
                        ? "Source record"
                        : "Investigation"}
                    </th>
                    <th scope="col">
                      {applied.entity === "records"
                        ? "Original grain and quantities"
                        : "Scientific purpose"}
                    </th>
                    <th scope="col">Readiness and source</th>
                  </tr>
                </thead>
                <tbody>
                  {results.data.items.map((item) => {
                    const isRun = "record" in item;
                    const key = isRun ? recordIdentity(item) : item.accession;
                    return (
                      <tr key={key}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={
                              "Select " +
                              item.accession +
                              (isRun ? " line " + item.record.source_row : "")
                            }
                            checked={Boolean(selection[key])}
                            onChange={() => toggle(item)}
                          />
                        </td>
                        <td>
                          <Link
                            href={
                              isRun
                                ? runHref(item, snapshotId)
                                : "/app/investigations/" +
                                  item.accession +
                                  "?snapshot=" +
                                  snapshotId
                            }
                          >
                            {isRun
                              ? item.accession +
                                " · source line " +
                                item.record.source_row
                              : item.acronym || item.title}
                          </Link>
                          <small>
                            {isRun ? item.asset.file_name : item.title}
                          </small>
                        </td>
                        <td>
                          <CatalogContext
                            accession={item.accession}
                            values={
                              results.data?.catalog_classifications?.[
                                item.accession
                              ]
                            }
                            onInspect={setAnchor}
                          />
                          {isRun ? (
                            <>
                              <strong>
                                {sourceRole(item.record.row_kind)}
                              </strong>
                              <p>
                                {item.record.fields
                                  .filter(
                                    (field) =>
                                      field.raw_text && field.quantity_kind,
                                  )
                                  .slice(0, 3)
                                  .map(
                                    (field) =>
                                      (field.source_column ||
                                        human(field.quantity_kind)) +
                                      ": " +
                                      field.raw_text,
                                  )
                                  .join(" · ")}
                              </p>
                              <InspectButton
                                anchor={{
                                  ...item.anchor,
                                  asset_id: item.asset.id,
                                }}
                                onInspect={setAnchor}
                              />
                            </>
                          ) : (
                            <p>
                              {objectiveExcerpt(
                                item.objective ||
                                  item.description ||
                                  "Not reported",
                              )}
                            </p>
                          )}
                        </td>
                        <td>
                          {isRun ? (
                            <>
                              <span>Run independence not established</span>
                              <small>
                                Source v{item.asset.file_version} ·{" "}
                                {item.adapter_id}
                              </small>
                            </>
                          ) : (
                            <>
                              <span>{investigationAvailability(item)}</span>
                              <small>
                                {item.asset_count} retained files · source v
                                {item.version}
                              </small>
                              <small>
                                Model readiness not established by metadata
                              </small>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {results.data && (
            <div className={s.toolbar}>
              <button
                className="button"
                disabled={!previous.length || results.loading}
                onClick={() => {
                  setCursor(previous.at(-1) ?? null);
                  setPrevious((value) => value.slice(0, -1));
                }}
              >
                Previous page
              </button>
              <button
                className="button"
                disabled={!results.data.next_cursor || results.loading}
                onClick={() => {
                  setPrevious((value) => [...value, cursor]);
                  setCursor(results.data?.next_cursor ?? null);
                }}
              >
                Next page <ArrowRight size={15} />
              </button>
            </div>
          )}
          <details className={s.notice}>
            <summary>Search by a research question</summary>
            <div className={s.stack}>
              <label className={s.field}>
                Scientific request
                <textarea
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder={
                    "For example: records in PSI-25 with oxygen volume fraction at least 25%"
                  }
                />
              </label>
              <div className={s.actions}>
                <button
                  className="button"
                  onClick={() => {
                    try {
                      const next = proposeLanguage(language, draft);
                      compileFilters(next.filters, snapshotId);
                      setProposal(next);
                      setProblem("");
                    } catch (reason) {
                      setProblem(errorMessage(reason));
                    }
                  }}
                >
                  Preview explicit filters
                </button>
                <button
                  className="button"
                  onClick={() => {
                    setMode("semantic");
                    void searchMeaning();
                  }}
                  disabled={meaningLoading}
                >
                  {meaningLoading ? "Searching…" : "Find related evidence"}
                </button>
              </div>
              {proposal && (
                <div>
                  <h3>Proposed interpretation</h3>
                  <ul>
                    {proposal.explanations.map((text, index) => (
                      <li key={index}>{text}</li>
                    ))}
                  </ul>
                  <CompiledQuery
                    value={compileFilters(proposal.filters, snapshotId)}
                  />
                  <button
                    className="button"
                    onClick={() => {
                      if (
                        selectedCount &&
                        proposal.filters.entity !== applied.entity
                      ) {
                        setProblem(
                          "Clear the existing entity selection first.",
                        );
                        return;
                      }
                      setDraft(proposal.filters);
                      setApplied(proposal.filters);
                      setCursor(null);
                      setPrevious([]);
                      setMode("exact");
                    }}
                  >
                    Apply these editable filters
                  </button>
                </div>
              )}
              <p className={s.help}>
                Related evidence is ordered by text similarity. Check its
                experimental conditions before using it to answer your question.
              </p>
            </div>
          </details>
          <Link className="text-button" href="/app/lab/evidence">
            Search original source passages <ArrowRight size={16} />
          </Link>
          <details className={journey.sourceDetails}>
            <summary>Search method and source version</summary>
            <p>
              Exact search matches every entered term. Investigation results are
              ordered by title.
            </p>
            <code>{snapshotId}</code>
            <CompiledQuery value={compiled} />
          </details>
        </div>
      </div>
      <SourceInspector anchor={anchor} onClose={() => setAnchor(null)} />
    </section>
  );
}

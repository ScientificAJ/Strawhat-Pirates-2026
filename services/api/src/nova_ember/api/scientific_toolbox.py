"""Typed scientific operations shared by research roles; browser changes remain proposals."""

import json
from dataclasses import dataclass
from hashlib import sha256
from typing import Any
from uuid import UUID, uuid4

from nova_ember.analysis.visualization import DropletVisualizationRequest
from nova_ember.contracts.research import Contract, WorkspaceContext
from nova_ember.domain.identifiers import InvestigationId
from nova_ember.evidence.contracts import Claim, ControlCandidate, EarthTransfer, Hypothesis
from nova_ember.evidence.research import (
    assess_control,
    assess_transfer,
    compare_claims,
    plan_hypothesis,
)
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field, model_validator

from . import jobs
from .agent_capabilities import allowed_tool, require_tool
from .artifacts import (
    ChartSpec,
    DashboardSpec,
    QuerySpec,
    execute_query,
    validate_chart,
    validate_dashboard,
)
from .database import connect
from .discovery import (
    ClaimPair,
    CoverageRequest,
    Discovery,
    EvidenceAnchor,
    EvidenceSearch,
    RecordQuery,
)
from .exporting import CaseExport
from .methods import MethodCall, method_catalog, method_source_snapshot, run_method
from .model_registry import PredictionInputs, list_models, predict
from .records import CohortInputs, freeze_selection
from .repository import Corpus
from .semantic import SemanticQuery, semantic_search
from .visualization import (
    SourceDropletVisualizationRequest,
    prepare_droplet_visualization,
    prepare_source_droplet_visualization,
)


class Empty(Contract):
    pass


class ToolName(Contract):
    name: str = Field(min_length=1, max_length=64)


class ScientificToolCall(ToolName):
    parameters: dict


class SelectedRecord(Contract):
    asset_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")
    source_row: int = Field(ge=2, le=1000000)


class SourceVisualizationInput(Contract):
    accession: InvestigationId
    asset_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")


class BassFireIllustrationInput(Contract):
    snapshot_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    asset_sha256: str | None = Field(default=None, pattern=r"^[a-f0-9]{64}$")
    source_row: int | None = Field(default=None, ge=2, le=1000000)


class CohortComparison(Contract):
    left: CohortInputs
    right: CohortInputs
    question: str = Field(min_length=1, max_length=2000)


class ModelPrediction(PredictionInputs):
    model_id: str = Field(pattern=r"^[a-f0-9]{64}$")


class PersonalProposal(Contract):
    expected_case_revision: str | None = Field(default=None, max_length=128)
    title: str = Field(min_length=1, max_length=250)
    note: str = Field(max_length=8000)
    evidence: list[EvidenceAnchor] = Field(default_factory=list, max_length=30)


class CodeProposal(Contract):
    language: str = Field(pattern=r"^(python|shell)$")
    code: str = Field(min_length=1, max_length=20000)
    purpose: str = Field(min_length=1, max_length=1000)
    input_assets: list[str] = Field(default_factory=list, max_length=8)
    upload_ids: list[UUID] = Field(default_factory=list, max_length=8)
    source_job_ids: list[UUID] = Field(default_factory=list, max_length=8)

    @model_validator(mode="after")
    def distinct_inputs(self):
        duplicate = (
            len(set(self.input_assets)) != len(self.input_assets)
            or len(set(self.upload_ids)) != len(self.upload_ids)
            or len(set(self.source_job_ids)) != len(self.source_job_ids)
        )
        if (
            duplicate
            or len(self.input_assets) + len(self.upload_ids) + len(self.source_job_ids) > 10
        ):
            raise ValueError("Code proposals accept at most ten distinct selected input files.")
        return self


@dataclass(frozen=True)
class Definition:
    schema: type[BaseModel]
    description: str
    function: Any


class ScientificToolbox:
    def __init__(
        self,
        corpus: Corpus,
        context: WorkspaceContext,
        job: dict | None = None,
        *,
        capabilities: frozenset[str] | None = None,
    ):
        if job is not None and job.get("snapshot_id") != context.snapshot_id:
            raise ValueError("The research job belongs to a different frozen source snapshot.")
        self.corpus = corpus
        self.context = context
        self.discovery = Discovery(corpus)
        self.job = job
        self.capabilities = capabilities
        self.definitions = {
            "search_runs": Definition(
                RecordQuery,
                "Discover physical source records with explicit grain and conditions; "
                "records are not presumed independent runs.",
                self.search_records,
            ),
            "get_run": Definition(
                SelectedRecord,
                "Inspect an exact selected physical record, its source fields "
                "and run-identity limits.",
                self.get_record,
            ),
            "search_evidence": Definition(
                EvidenceSearch,
                "Search exact metadata, source tables, protocols "
                "and primary-source passages with anchors.",
                self.search_evidence,
            ),
            "search_semantic_evidence": Definition(
                SemanticQuery,
                "Search indexed metadata and exact source passages with semantic/lexical ranks; "
                "source filters precede fusion and scores are not scientific probabilities.",
                self.semantic_evidence,
            ),
            "get_source_span": Definition(
                EvidenceAnchor,
                "Read an exact resolved source anchor without arbitrary filesystem or URL access.",
                self.read_anchor,
            ),
            "query_dataset": Definition(
                QuerySpec,
                "Execute a bounded typed query with source/canonical representations "
                "and visible missingness.",
                self.query,
            ),
            "compare_runs": Definition(
                MethodCall,
                "Evaluate selected run condition profiles; method must be comparison "
                "and retains question-specific suitability.",
                self.compare_runs,
            ),
            "compare_cohort": Definition(
                CohortComparison,
                "Compare two frozen source-record selections with their distinct grain "
                "and independence limits.",
                self.compare_cohorts,
            ),
            "check_applicability": Definition(
                MethodCall,
                "Apply the registered comparison/applicability or ranking policies "
                "to explicit conditions.",
                self.applicability,
            ),
            "compute_metric": Definition(
                MethodCall,
                "Use a registered numerical method and preserve its assumptions, "
                "units and evidence.",
                self.calculate,
            ),
            "method_catalog": Definition(
                Empty,
                "Inspect registered method identifiers and their exact typed input contracts.",
                lambda _: method_catalog(),
            ),
            "prepare_simulation": Definition(
                DropletVisualizationRequest,
                "Calculate a bounded, optional D-squared droplet teaching visualization "
                "from explicit assumed diameter and coefficient, with equations, units and limits. "
                "A selected FLEX/FLEX2 association supplies context only. This does not launch "
                "a view, infer experimental parameters or predict extinction, temperature or soot.",
                self.prepare_simulation,
            ),
            "prepare_source_visualization": Definition(
                SourceVisualizationInput,
                "Prepare original retained imagery for an investigation. Defaults to a "
                "representative source image, then video, without requiring numerical inputs "
                "or treating the image as a physical simulation.",
                self.prepare_source_visualization,
            ),
            "prepare_bass_fire_illustration": Definition(
                BassFireIllustrationInput,
                "Prepare an animated illustrative BASS-II fire and attach the exact retained "
                "test record used as context. Its shape and motion are not measured physics.",
                self.prepare_bass_fire_illustration,
            ),
            "prepare_source_simulation": Definition(
                SourceDropletVisualizationRequest,
                "Inspect the exact retained FLEX-007 test sheet and prepare an optional "
                "D-squared visualization using its unit-bearing reported diameter and coefficient. "
                "Returns exact parameter anchors, obscuration and disruption limits; "
                "it is not a newly calibrated fit or a prediction of actual extinction.",
                self.prepare_source_simulation,
            ),
            "create_chart": Definition(
                ChartSpec,
                "Validate a source-bound scientific chart and return an interactive grammar "
                "and data.",
                self.chart,
            ),
            "propose_dashboard": Definition(
                DashboardSpec,
                "Validate a real dashboard specification; the browser applies "
                "an inspected revision.",
                self.dashboard,
            ),
            "list_models": Definition(
                Empty,
                "List descriptive methods and actual released regression versions; "
                "no model is invented.",
                lambda _: list_models(corpus.settings, context.snapshot_id),
            ),
            "predict": Definition(
                ModelPrediction,
                "Check a released model's joint domain before returning a prediction "
                "or a structured refusal.",
                self.prediction,
            ),
            "assess_evidence": Definition(
                Claim,
                "Resolve exact claim anchors and expose origin, assumptions and support limits.",
                self.assess_claim,
            ),
            "compare_claims": Definition(
                ClaimPair,
                "Compare source-linked claims, endpoint and condition differences "
                "without flattening contradictions.",
                self.contradictions,
            ),
            "identify_research_gaps": Definition(
                CoverageRequest,
                "Inspect released condition coverage and distinct "
                "missing/unavailable/unsupported states.",
                self.gaps,
            ),
            "propose_hypothesis": Definition(
                Hypothesis,
                "Inspect mechanisms, supporting/contrary evidence, predictions and falsifiers "
                "as a research proposal.",
                self.hypothesis,
            ),
            "assess_control": Definition(
                ControlCandidate,
                "Inspect control evidence, conditions, interactions and tradeoffs "
                "without certifying safety.",
                self.control,
            ),
            "assess_earth_transfer": Definition(
                EarthTransfer,
                "Distinguish documented application, engineering connection "
                "and research hypothesis.",
                self.transfer,
            ),
            "propose_case_update": Definition(
                PersonalProposal,
                "Prepare an exact-revision personal case update for inspection; "
                "no automatic mutation.",
                self.personal_proposal,
            ),
            "propose_metadata_correction": Definition(
                PersonalProposal,
                "Prepare a source-linked correction proposal; public research "
                "cannot alter the canonical corpus.",
                self.personal_proposal,
            ),
            "propose_python": Definition(
                CodeProposal,
                "Prepare inspectable Python or shell with frozen inputs "
                "for explicit local isolated execution.",
                self.code_proposal,
            ),
            "execute_python": Definition(
                CodeProposal,
                "Queue exact Python/shell and frozen inputs for the initiating user's "
                "confirmation; execution uses only local gVisor.",
                self.queue_execution,
            ),
            "fit_model": Definition(
                MethodCall,
                "Fit a registered descriptive trace or evaluate the one prespecified regression "
                "using the bounded scientific worker.",
                self.fit,
            ),
            "export_case": Definition(
                CaseExport,
                "Prepare a frozen case export for explicit confirmation, preserving "
                "selected artifacts, evidence and rights.",
                self.export,
            ),
        }

    def _snapshot(self, supplied: str | None) -> str:
        if supplied and supplied != self.context.snapshot_id:
            raise ValueError("The tool input belongs to a different frozen research context.")
        return self.context.snapshot_id

    def menu(self) -> dict:
        return {
            "tools": [
                {"name": name, "description": item.description}
                for name, item in self.definitions.items()
                if allowed_tool(name, self.capabilities, nested=True)
            ]
        }

    def schema(self, name: str) -> dict:
        require_tool(name, self.capabilities, nested=True)
        item = self.definitions.get(name)
        if item is None:
            raise ValueError("This scientific tool is not registered.")
        return {
            "name": name,
            "description": item.description,
            "inputs": item.schema.model_json_schema(),
        }

    def dispatch(self, call: ScientificToolCall) -> dict:
        require_tool(call.name, self.capabilities, nested=True)
        item = self.definitions.get(call.name)
        if item is None:
            raise ValueError("This scientific tool is not registered.")
        if len(json.dumps(call.parameters).encode()) > 1000000:
            raise ValueError("Selected tool parameters exceed the bounded input size.")
        return item.function(item.schema.model_validate(call.parameters))

    def search_records(self, query: RecordQuery) -> dict:
        return self.discovery.query_records(
            query.model_copy(update={"snapshot_id": self._snapshot(query.snapshot_id)})
        )

    def get_record(self, request: SelectedRecord) -> dict:
        from nova_ember.adapters.psi import parse_csv_bytes
        from nova_ember.adapters.records import interpret_table

        asset = self.corpus.asset(request.asset_sha256, self.context.snapshot_id)
        table = interpret_table(
            asset, parse_csv_bytes(self.corpus.asset_bytes(asset), asset["encoding"])
        )
        records = [
            row.model_dump(mode="json")
            for row in table.records
            if row.source_row == request.source_row
        ]
        if not records:
            raise ValueError("The selected physical record is absent.")
        return {
            "snapshot_id": self.context.snapshot_id,
            "asset": asset,
            "records": records,
            "independent_run_count": None,
            "limitations": table.limitations,
        }

    def search_evidence(self, query: EvidenceSearch) -> dict:
        return self.discovery.search_evidence(
            query.model_copy(update={"snapshot_id": self._snapshot(query.snapshot_id)})
        )

    def semantic_evidence(self, query: SemanticQuery) -> dict:
        self._snapshot(query.snapshot_id)
        result = semantic_search(self.corpus.settings, query)
        # Preserve the full coverage report at the public endpoint without filling model context.
        result["coverage"] = {
            key: value for key, value in result["coverage"].items() if key != "sources"
        }
        return result

    def read_anchor(self, anchor: EvidenceAnchor) -> dict:
        self._snapshot(anchor.snapshot_id)
        return self.discovery.read_anchor(anchor)

    def query(self, query: QuerySpec) -> dict:
        self._snapshot(query.snapshot_id)
        return execute_query(self.corpus, query)

    def compare_runs(self, request: MethodCall) -> dict:
        if request.method != "comparison":
            raise ValueError("Run comparison requires the registered comparison contract.")
        self._snapshot(method_source_snapshot(request))
        return run_method(request)

    def compare_cohorts(self, request: CohortComparison) -> dict:
        self._snapshot(request.left.snapshot_id)
        self._snapshot(request.right.snapshot_id)
        left, right = (
            freeze_selection(self.corpus, request.left),
            freeze_selection(self.corpus, request.right),
        )
        return {
            "question": request.question,
            "left": left,
            "right": right,
            "grain": "frozen_source_records",
            "independent_run_count": None,
            "suitability": {"side_by_side": "supported", "quantitative_pooling": "unresolved"},
            "limitations": [
                "A frozen row selection is not an independently validated experimental cohort. "
                "Resolve independent-unit, endpoint and condition profiles before pooling."
            ],
        }

    def applicability(self, request: MethodCall) -> dict:
        if request.method not in {"comparison", "ranking"}:
            raise ValueError("Applicability requires its registered condition/ranking policy.")
        self._snapshot(method_source_snapshot(request))
        return run_method(request)

    def calculate(self, request: MethodCall) -> dict:
        if request.method in {"trace-fit", "regression-evaluation"}:
            require_tool("fit_model", self.capabilities, nested=True)
        self._snapshot(method_source_snapshot(request))
        if request.method in {
            "trace-fit",
            "regression-evaluation",
            "monte-carlo",
            "image-roi",
            "pixel-trace",
        }:
            if self.job is not None:
                from .trusted_analysis import execute_analysis_job

                return execute_analysis_job(
                    self.corpus.settings, {**self.job, "inputs": request.model_dump(mode="json")}
                )
            return {
                "status": "registered_analysis_proposal",
                "request": request.model_dump(),
                "execution": "bounded_cpu_worker",
                "requires_run_action": True,
                "mutation": False,
            }
        return run_method(request)

    def fit(self, request: MethodCall) -> dict:
        if request.method not in {"trace-fit", "regression-evaluation"}:
            raise ValueError(
                "This tool supports only the registered descriptive fits and regression evaluation."
            )
        return self.calculate(request)

    def prepare_simulation(self, request: DropletVisualizationRequest) -> dict:
        return prepare_droplet_visualization(
            self.corpus,
            request,
            expected_snapshot=self.context.snapshot_id,
            selected_investigations=self.context.investigations,
        ).model_dump(mode="json")

    def prepare_bass_fire_illustration(self, request: BassFireIllustrationInput) -> dict:
        snapshot = self._snapshot(request.snapshot_id)
        asset_sha256, source_row = request.asset_sha256, request.source_row
        pinned = next(
            (
                source
                for source in self.context.selected_sources
                if source.accession == "PSI-25" and source.source_rows
            ),
            None,
        )
        if pinned is not None:
            if asset_sha256 is None:
                asset_sha256 = pinned.asset_sha256
            if source_row is None and asset_sha256 == pinned.asset_sha256:
                source_row = pinned.source_rows[0]
        matches, _, _ = self.discovery.matching_records(
            RecordQuery(
                snapshot_id=snapshot, accessions=("PSI-25",), row_kinds=("source_test_record",)
            )
        )
        selected = next(
            (
                item
                for item in matches
                if (asset_sha256 is None or item["asset"]["sha256"] == asset_sha256)
                and (source_row is None or item["record"].source_row == source_row)
            ),
            None,
        )
        if selected is None:
            raise ValueError(
                "No matching BASS-II source test record is available in this snapshot."
            )
        record, asset = selected["record"], selected["asset"]
        return {
            "artifact_type": "bass_fire_illustration",
            "status": "prepared",
            "title": "BASS-II fire illustration",
            "snapshot_id": snapshot,
            "accession": "PSI-25",
            "source_row": record.source_row,
            "asset_sha256": asset["sha256"],
            "asset_id": asset["id"],
            "anchor": selected["anchor"].model_dump(mode="json", exclude_none=True),
            "conditions": [
                {"label": field.source_column, "value": field.raw_text}
                for field in record.fields
                if field.source_column and field.raw_text
            ],
        }

    def prepare_source_visualization(self, request: SourceVisualizationInput) -> dict:
        investigation = self.corpus.investigation(request.accession, self.context.snapshot_id)
        assets = [
            asset
            for asset in investigation["assets"]
            if asset.get("media_type") in {"image/jpeg", "image/png", "video/mp4"}
            and (request.asset_sha256 is None or asset["sha256"] == request.asset_sha256)
        ]
        if not assets:
            raise ValueError("This investigation has no matching retained image or video.")
        asset = min(
            assets,
            key=lambda item: (
                item["media_type"] == "video/mp4",
                item.get("kind") != "representative_image",
                item["id"],
            ),
        )
        media = self.discovery.media(
            asset["sha256"],
            self.context.snapshot_id,
            accession=request.accession,
            asset_id=asset["id"],
        )
        result = {
            **media,
            "artifact_type": "source_media_visualization",
            "status": "prepared",
            "title": f"{investigation.get('acronym') or request.accession} · NASA source "
            + ("video" if asset["media_type"] == "video/mp4" else "image"),
            "limitations": ["Representative source image; no individual test is identified."]
            if media["example_role"] == "repository_representative_image"
            and not media["source_run_association"]
            else [],
        }
        if asset["media_type"].startswith("image/"):
            result["anchor"] = EvidenceAnchor(
                snapshot_id=self.context.snapshot_id,
                source_kind=asset.get("source_kind") or "psi",
                accession=request.accession,
                investigation_version=asset["investigation_version"],
                source_sha256=asset["sha256"],
                asset_id=asset["id"],
                kind="media_frame",
                frame=0,
            ).model_dump(mode="json", exclude_none=True)
        return result

    def prepare_source_simulation(self, request: SourceDropletVisualizationRequest) -> dict:
        return prepare_source_droplet_visualization(
            self.corpus,
            request,
            expected_snapshot=self.context.snapshot_id,
            selected_investigations=self.context.investigations,
        ).model_dump(mode="json")

    def chart(self, spec: ChartSpec) -> dict:
        self._snapshot(spec.query.snapshot_id)
        return {"kind": "chart", **validate_chart(self.corpus, spec), "requires_apply": True}

    def dashboard(self, spec: DashboardSpec) -> dict:
        self._snapshot(spec.corpus_snapshot_id)
        return {
            "kind": "dashboard",
            **validate_dashboard(self.corpus, spec),
            "requires_apply": True,
        }

    def prediction(self, inputs: ModelPrediction) -> dict:
        self._snapshot(inputs.context.source_snapshot)
        request = PredictionInputs.model_validate(inputs.model_dump(exclude={"model_id"}))
        return predict(
            self.corpus.settings,
            inputs.model_id,
            request,
            expected_snapshot_id=self.context.snapshot_id,
        )

    def assess_claim(self, claim: Claim) -> dict:
        resolved = [self.read_anchor(anchor) for anchor in claim.anchors]
        return {
            "claim": claim.model_dump(mode="json"),
            "resolved_evidence": resolved,
            "support_status": "source_anchors_resolved" if resolved else "no_source_anchor",
            "limitations": [
                "Resolving a locator does not independently establish the claim's causal "
                "meaning or experimental applicability."
            ],
        }

    def contradictions(self, pair: ClaimPair) -> dict:
        self.assess_claim(pair.left)
        self.assess_claim(pair.right)
        return compare_claims(pair.left, pair.right)

    def gaps(self, request: CoverageRequest) -> dict:
        self._snapshot(request.query.snapshot_id)
        return self.discovery.condition_coverage(
            request.model_copy(
                update={
                    "query": request.query.model_copy(
                        update={"snapshot_id": self.context.snapshot_id}
                    )
                }
            )
        )

    def hypothesis(self, hypothesis: Hypothesis) -> dict:
        for claim in (*hypothesis.supporting, *hypothesis.contrary):
            self.assess_claim(claim)
        return plan_hypothesis(hypothesis)

    def control(self, candidate: ControlCandidate) -> dict:
        for claim in candidate.evidence:
            self.assess_claim(claim)
        return assess_control(candidate)

    def transfer(self, transfer: EarthTransfer) -> dict:
        for claim in transfer.evidence:
            self.assess_claim(claim)
        return assess_transfer(transfer)

    def personal_proposal(self, proposal: PersonalProposal) -> dict:
        if proposal.expected_case_revision != self.context.case_revision:
            raise ValueError("The personal revision changed before this proposal.")
        for anchor in proposal.evidence:
            self.read_anchor(anchor)
        return {
            "status": "proposal",
            "requires_apply": True,
            "expected_context_version": self.context.context_version,
            "proposal": proposal.model_dump(mode="json"),
            "mutation": False,
        }

    def code_proposal(self, proposal: CodeProposal) -> dict:
        frozen = self._execution_inputs(proposal)
        return {
            "status": "requires_execution_confirmation",
            "proposal": proposal.model_dump(),
            "code_sha256": sha256(proposal.code.encode()).hexdigest(),
            "snapshot_id": self.context.snapshot_id,
            "execution": "project_gvisor",
            "mutation": False,
            "frozen_inputs": frozen,
            "execution_inputs_sha256": sha256(jobs.canonical_json(frozen)).hexdigest(),
        }

    def _execution_inputs(self, proposal: CodeProposal) -> list:
        assets = [
            self.corpus.asset(digest, self.context.snapshot_id) for digest in proposal.input_assets
        ]
        references = []
        if proposal.upload_ids or proposal.source_job_ids:
            from .private_context import resolve_private_input
            from .source_acquisition import acquired_execution_references
            from .uploads import private_upload_execution_references

            owner = self._owner_hash()
            selected_uploads = {
                item.upload_id: item
                for item in self.context.selected_private_inputs
                if item.upload_id is not None
            }
            selected_sources = {
                item.source_job_id: item
                for item in self.context.selected_private_inputs
                if item.source_job_id is not None
            }
            for identifiers, selected in [
                (proposal.upload_ids, selected_uploads),
                (proposal.source_job_ids, selected_sources),
            ]:
                for identifier in identifiers:
                    if identifier not in selected:
                        raise ValueError("Code may use only explicitly selected temporary inputs.")
                    resolve_private_input(
                        self.corpus.settings, self.context.snapshot_id, selected[identifier], owner
                    )
            references.extend(
                private_upload_execution_references(
                    self.corpus.settings,
                    self.context.snapshot_id,
                    [str(identifier) for identifier in proposal.upload_ids],
                    owner,
                )
            )
            references.extend(
                acquired_execution_references(
                    self.corpus.settings,
                    self.context.snapshot_id,
                    [str(identifier) for identifier in proposal.source_job_ids],
                    owner,
                )
            )
        if (
            sum(asset["byte_size"] for asset in assets)
            + sum(reference["byte_size"] for reference in references)
            > 8 * 1024 * 1024
        ):
            raise ValueError("Selected isolated-execution inputs exceed eight MiB.")
        return [*proposal.input_assets, *references]

    def _owner_hash(self) -> str:
        if self.job is None:
            raise ValueError(
                "A durable, browser-owned research request is required for this action."
            )
        with connect(self.corpus.settings.database_url) as connection:
            row = connection.execute(
                """SELECT receipt_sha256 FROM jobs WHERE id = %s AND attempt = %s
                   AND status = 'running' AND expires_at > now() AND lease_until > now()""",
                (self.job["id"], self.job["attempt"]),
            ).fetchone()
        if not row:
            raise jobs.JobConflict("The initiating research request is no longer active.")
        return row["receipt_sha256"]

    def queue_execution(self, proposal: CodeProposal) -> dict:
        details = self.code_proposal(proposal)
        owner = self._owner_hash()
        assert self.job is not None
        frozen_inputs = details["frozen_inputs"]
        from nova_ember.workers.execution import execution_capability

        capability = execution_capability()
        if not capability["available"]:
            return {**details, "status": "execution_unavailable", "capability": capability}
        with connect(self.corpus.settings.database_url) as connection:
            connection.execute("SELECT pg_advisory_xact_lock(701420)")
            session = connection.execute(
                """SELECT *, status='open' AND expires_at>now() AND deadline>now() AS active
                   FROM execution_sessions WHERE terminated_at IS NULL LIMIT 1 FOR UPDATE"""
            ).fetchone()
            if session:
                if (
                    session["receipt_sha256"] != owner
                    or not session["active"]
                    or jobs.canonical_json(session["input_assets"])
                    != jobs.canonical_json(frozen_inputs)
                    or session["snapshot_id"] != self.context.snapshot_id
                ):
                    return {**details, "status": "execution_capacity_busy"}
                session_id = str(session["id"])
            else:
                session_id = str(uuid4())
                connection.execute(
                    """INSERT INTO execution_sessions(id, receipt_sha256, snapshot_id, input_assets)
                    VALUES (%s, %s, %s, %s)""",
                    (session_id, owner, self.context.snapshot_id, Jsonb(frozen_inputs)),
                )
        request = {
            "session_id": session_id,
            "language": proposal.language,
            "code": proposal.code,
            "profile": "standard",
            "confirmed_extended_runtime": False,
            "seed": None,
        }
        operation_digest = sha256(
            jobs.canonical_json(
                {
                    "parent_job": str(self.job["id"]),
                    "language": proposal.language,
                    "code": proposal.code,
                    "frozen_inputs": frozen_inputs,
                }
            )
        ).hexdigest()
        operation = jobs.create_job_for_receipt_hash(
            self.corpus.settings.database_url,
            self.context.snapshot_id,
            owner,
            kind="execute_code",
            inputs=request,
            idempotency_key=f"research-code:{operation_digest}",
            approval_required=True,
        )
        return {
            **details,
            "operation": operation,
            "session_id": session_id,
            "status": "waiting_approval",
            "execution_started": False,
        }

    def export(self, selection: CaseExport) -> dict:
        self._snapshot(selection.snapshot_id)
        owner = self._owner_hash()
        digest = sha256(selection.model_dump_json().encode()).hexdigest()
        operation = jobs.create_job_for_receipt_hash(
            self.corpus.settings.database_url,
            self.context.snapshot_id,
            owner,
            kind="export_case",
            inputs=selection.model_dump(mode="json"),
            idempotency_key=f"research-export:{digest}",
            approval_required=True,
        )
        return {
            "status": "waiting_approval",
            "operation": operation,
            "selection": selection.model_dump(mode="json"),
            "mutation": False,
            "limitations": ["Only explicitly confirmed, selected private case data is exported."],
        }

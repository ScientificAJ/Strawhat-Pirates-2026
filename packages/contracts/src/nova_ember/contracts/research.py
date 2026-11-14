"""Explicit browser-selected context and source-bound research answers."""

import json
from typing import Annotated, Literal
from uuid import UUID

from nova_ember.evidence.contracts import EvidenceAnchor
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .custom_agents import CustomAgentProfile

Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
Accession = Annotated[str, Field(pattern=r"^PSI-[1-9][0-9]{0,5}$")]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SelectedSource(Contract):
    asset_sha256: Digest
    accession: Accession | None = None
    asset_id: str | None = Field(default=None, min_length=1, max_length=1024)
    source_rows: list[Annotated[int, Field(ge=1)]] = Field(default_factory=list, max_length=100)
    columns: list[Annotated[int, Field(ge=0, le=1000)]] = Field(default_factory=list, max_length=64)


class SelectedPrivateInput(Contract):
    upload_id: UUID | None = None
    source_job_id: UUID | None = None
    expected_sha256: Digest
    consent_to_model: bool = False
    text_encoding: Literal["utf-8", "utf-8-sig", "ascii", "cp1252"] | None = None

    @model_validator(mode="after")
    def one_temporary_source(self):
        if (self.upload_id is None) == (self.source_job_id is None):
            raise ValueError("Select exactly one private upload or acquired-source job.")
        return self


class FocusedView(Contract):
    kind: Literal["query", "chart"]
    spec: dict
    artifact_id: str | None = Field(default=None, min_length=1, max_length=128)

    @model_validator(mode="after")
    def bounded_configuration(self):
        if len(json.dumps(self.spec, allow_nan=False).encode()) > 32768:
            raise ValueError("Focused query/chart configuration exceeds its 32 KiB envelope.")
        return self


class SelectedArtifact(Contract):
    job_id: UUID
    artifact_id: UUID
    expected_sha256: Digest
    consent_to_model: bool = False


class WorkspaceContext(Contract):
    schema_version: Literal[1] = 1
    context_version: str = Field(min_length=1, max_length=128)
    snapshot_id: Digest
    investigations: list[Accession] = Field(default_factory=list, max_length=12)
    selected_sources: list[SelectedSource] = Field(default_factory=list, max_length=8)
    selected_private_inputs: list[SelectedPrivateInput] = Field(default_factory=list, max_length=8)
    scenario: dict = Field(default_factory=dict)
    active_artifact_id: str | None = Field(default=None, max_length=128)
    case_revision: str | None = Field(default=None, max_length=128)
    focused_view: FocusedView | None = None
    selected_evidence: list[EvidenceAnchor] = Field(default_factory=list, max_length=6)
    selected_artifacts: list[SelectedArtifact] = Field(default_factory=list, max_length=4)

    @model_validator(mode="after")
    def distinct_selections(self):
        if len(set(self.investigations)) != len(self.investigations):
            raise ValueError("Context investigation identifiers must be distinct.")
        identities = [
            (source.asset_sha256, source.accession, source.asset_id)
            for source in self.selected_sources
        ]
        if len(set(identities)) != len(identities):
            raise ValueError("Context source identifiers must be distinct.")
        if any(
            len(set(source.source_rows)) != len(source.source_rows)
            for source in self.selected_sources
        ):
            raise ValueError("Context source rows must be distinct.")
        private_ids = [
            (item.upload_id, item.source_job_id) for item in self.selected_private_inputs
        ]
        if len(set(private_ids)) != len(private_ids):
            raise ValueError("Selected temporary input identifiers must be distinct.")
        artifact_ids = [(item.job_id, item.artifact_id) for item in self.selected_artifacts]
        if len(set(artifact_ids)) != len(artifact_ids):
            raise ValueError("Selected private artifact references must be distinct.")
        return self


class SelectedImage(Contract):
    consent: Literal[True]
    purpose: str = Field(min_length=1, max_length=500)
    asset_sha256: Digest | None = None
    accession: Accession | None = None
    asset_id: str | None = Field(default=None, min_length=1, max_length=1024)
    image_base64: str | None = Field(default=None, max_length=1200000)
    media_type: Literal["image/png", "image/jpeg"]
    expected_sha256: Digest

    @model_validator(mode="after")
    def one_source(self):
        if (self.asset_sha256 is None) == (self.image_base64 is None):
            raise ValueError("Select one retained image or one explicitly supplied image.")
        if self.asset_sha256 is None and (self.accession is not None or self.asset_id is not None):
            raise ValueError("Source selectors require a retained source image.")
        return self


class ConversationTurn(Contract):
    role: Literal["user", "assistant"]
    text: str = Field(min_length=1, max_length=6000)


class ResearchRequest(Contract):
    agent_profile: CustomAgentProfile | None = None
    question: str = Field(min_length=1, max_length=6000)
    context: WorkspaceContext
    complexity: Literal["auto", "routine", "complex"] = "auto"
    role: Literal["coordinator", "evidence", "extraction", "analysis", "verification"] = (
        "coordinator"
    )
    expected_context_version: str = Field(min_length=1, max_length=128)
    images: list[SelectedImage] = Field(default_factory=list, max_length=1)
    history: list[ConversationTurn] = Field(default_factory=list, max_length=16)

    @model_validator(mode="after")
    def current_context(self):
        if self.context.context_version != self.expected_context_version:
            raise ValueError("The selected research context changed; review before submitting.")
        if sum(len(turn.text.encode()) for turn in self.history) > 24000:
            raise ValueError("Selected conversation history exceeds its 24 KiB text envelope.")
        return self


class EvidenceFact(Contract):
    id: str
    origin: Literal[
        "source_metadata",
        "source_measurement",
        "deterministic_calculation",
        "prediction",
        "source_text",
        "source_media",
        "tool_contract",
        "model_proposal",
        "user_supplied_input",
    ]
    label: str
    content: dict
    sources: list[dict]
    limitations: list[str]


class ProposedClaim(Contract):
    statement: str = Field(max_length=2500)
    origin: Literal[
        "source_summary",
        "calculated",
        "predicted",
        "model_interpretation",
        "research_hypothesis",
        "unknown",
        "user_input_summary",
    ]
    fact_ids: list[str]
    limitations: list[str]
    display_decimal_places: int | None = Field(default=None, ge=0, le=15)


class ResearchAnswer(Contract):
    title: str
    claims: list[ProposedClaim]
    contradictions: list[str]
    next_actions: list[str]
    limitations: list[str]


class ModelCapability(Contract):
    service: Literal["openai"] = "openai"
    configured: bool
    reasoning_models: list[str] = ["gpt-6.1-sol", "gpt-6.1-terra"]
    embedding_model: str = "text-embedding-3-large"
    embedding_dimensions: Literal[1536] = 1536
    voice_model: str = "gpt-live-1"
    connection_check: Literal["not_probed"] = "not_probed"

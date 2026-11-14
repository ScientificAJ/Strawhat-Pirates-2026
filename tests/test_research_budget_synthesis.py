"""A source-bound answer retains a real synthesis allowance after bounded tool work."""

import asyncio
import json
from copy import deepcopy
from decimal import Decimal
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from agents.exceptions import ModelBehaviorError
from agents.items import ModelResponse
from agents.usage import Usage
from nova_ember.api import research
from nova_ember.api.config import Settings
from nova_ember.api.repository import Corpus
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import InvestigationInput, ResearchTools, model_fact_payload
from nova_ember.contracts.research import ResearchAnswer, WorkspaceContext
from openai.types.responses import (
    ResponseFunctionToolCall,
    ResponseOutputMessage,
    ResponseOutputText,
)


@pytest.mark.parametrize("synthesis_failure", [False, True])
def test_expensive_next_tool_turn_yields_to_checked_synthesis_without_raising_cap(
    monkeypatch, tmp_path, synthesis_failure
):
    context = WorkspaceContext(context_version="bounded-synthesis", snapshot_id="a" * 64)
    corpus = SimpleNamespace(
        investigations=lambda *args: {
            "items": [{"accession": "PSI-25", "acronym": "BASS-II", "title": "Solid-fuel research"}]
        }
    )
    tools = ResearchTools(corpus, context)
    tools.resolve_context = lambda: {"snapshot_id": context.snapshot_id}
    tools.get_investigation = lambda _inputs: tools.fact(
        "Known source inspection",
        {"approach": "The investigation examines airflow and solid-fuel flame spread."},
        [{"accession": "PSI-25", "snapshot_id": context.snapshot_id}],
        origin="source_metadata",
    )
    monkeypatch.setattr(research, "ResearchTools", lambda *args, **kwargs: tools)
    monkeypatch.setattr(research, "Corpus", lambda _settings: corpus)
    reservations, settled, paid_calls, token_checks = [], [], [], []
    steps = []
    monkeypatch.setattr(research.jobs, "heartbeat", lambda *args: True)
    monkeypatch.setattr(research.jobs, "progress", lambda *args: None)
    monkeypatch.setattr(
        research.jobs, "begin_step", lambda _database, _job, _attempt, step: steps.append(step)
    )
    monkeypatch.setattr(research.jobs, "finish_step", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        research,
        "reserve_usage",
        lambda _settings, amount, _job: reservations.append(amount) or "reservation",
    )
    monkeypatch.setattr(
        research, "settle_usage", lambda _settings, _reservation, amount: settled.append(amount)
    )

    async def count(**kwargs):
        token_checks.append(bool(kwargs["tools"]))
        # A further collection turn cannot fit its half of the existing cap.
        tokens = 25000 if kwargs["tools"] and paid_calls else 1000 if kwargs["tools"] else 1500
        return SimpleNamespace(input_tokens=tokens)

    class Client:
        def __init__(self, **kwargs):
            self.responses = SimpleNamespace(input_tokens=SimpleNamespace(count=count))

        async def close(self):
            pass

    async def provider(
        self,
        system_instructions,
        input,
        model_settings,
        tools,
        output_schema,
        handoffs,
        tracing,
        **kwargs,
    ):
        paid_calls.append(
            {
                "tools": len(tools),
                "max_tokens": model_settings.max_tokens,
                "budget": self.budget_usd,
                "reasoning_effort": model_settings.reasoning.effort,
                "instructions": system_instructions,
            }
        )
        if tools:
            output = [
                ResponseFunctionToolCall(
                    type="function_call",
                    call_id="read-bass",
                    name="get_investigation",
                    arguments='{"accession":"PSI-25"}',
                )
            ]
            usage = Usage(input_tokens=1000, output_tokens=100)
        else:
            if synthesis_failure:
                raise ModelBehaviorError("Provider response.incomplete: max_output_tokens")
            prompt = json.loads(input[0]["content"][0]["text"])
            assert prompt["gathering_status"] == "bounded_evidence_collection_stopped"
            fact = prompt["retained_facts"][0]
            assert (
                fact["content"]["approach"]
                == "The investigation examines airflow and solid-fuel flame spread."
            )
            assert "catalog_navigation" not in prompt
            answer = {
                "title": "Airflow and flame spread",
                "claims": [
                    {
                        "statement": (
                            "The investigation examines airflow and solid-fuel flame spread."
                        ),
                        "origin": "source_summary",
                        "fact_ids": [fact["id"]],
                        "limitations": [
                            "This describes an experimental approach, not a measured outcome."
                        ],
                    }
                ],
                "contradictions": [],
                "next_actions": [],
                "limitations": [],
            }
            output = [
                ResponseOutputMessage(
                    id="final-answer",
                    type="message",
                    role="assistant",
                    status="completed",
                    content=[
                        ResponseOutputText(
                            type="output_text", annotations=[], text=json.dumps(answer)
                        )
                    ],
                )
            ]
            usage = Usage(input_tokens=1500, output_tokens=500)
        return ModelResponse(output=output, usage=usage, response_id=f"paid-{len(paid_calls)}")

    monkeypatch.setattr(research, "AsyncOpenAI", Client)
    monkeypatch.setattr("agents.OpenAIResponsesModel.get_response", provider)
    settings = Settings(
        "offline-database", tmp_path, tmp_path, openai_api_key="offline-placeholder"
    )
    request = research.ResearchRequest(
        question="Compare relevant experimental approaches.",
        context=context,
        expected_context_version=context.context_version,
    )
    result = asyncio.run(
        research.run_research(settings, request, {"id": "offline-job", "attempt": 1})
    )
    recorded_phases = result["reproducibility"]["phase_system_instructions"]
    assert recorded_phases == {
        "gathering": paid_calls[0]["instructions"],
        "synthesis": paid_calls[1]["instructions"],
    }
    assert recorded_phases["gathering"] != result["reproducibility"]["system_instructions"]
    assert recorded_phases["synthesis"] != result["reproducibility"]["system_instructions"]
    if synthesis_failure:
        assert result["status"] == "incomplete"
        assert result["answer"] is None
        assert "No automatic paid retry" in result["failure"]
        assert len(paid_calls) == 2
        assert len(result["provider_calls"]) == 1
        assert len(result["facts"]) == 1
        assert reservations == [Decimal("0.1")]
        assert settled == [None]
        assert steps == ["provider-call-1", "provider-call-2"]
        return
    assert result["status"] == "completed"
    assert (
        result["answer"]["claims"][0]["statement"]
        == "The investigation examines airflow and solid-fuel flame spread."
    )
    assert not result["answer"]["withheld_claims"]
    assert len(paid_calls) == 2
    assert token_checks == [True, True, False]
    assert paid_calls[0]["budget"] == Decimal("0.05")
    assert paid_calls[1]["budget"] == Decimal("0.1")
    assert [call["max_tokens"] for call in paid_calls] == [1200, 2500]
    assert paid_calls[1]["tools"] == 0
    assert paid_calls[1]["reasoning_effort"] == "low"
    assert reservations == [Decimal("0.1")]
    assert settled == [Decimal("0.011")]
    assert Decimal(result["cost_usd"]) == Decimal("0.011")
    assert len(result["provider_calls"]) == 2
    assert steps == ["provider-call-1", "provider-call-2"]


def test_dossier_model_view_keeps_approach_and_citations_without_repeating_full_metadata():
    anchor = {"field": "approach", "accession": "PSI-25", "snapshot_id": "a" * 64}
    fact = {
        "id": "known-dossier",
        "label": "Investigation dossier",
        "origin": "source_metadata",
        "content": {
            "accession": "PSI-25",
            "approach": "Original experimental approach.",
            "objective": "Original objective.",
            "assets": [{"file_name": "original.csv"}],
            "source_fields": {
                "approach": {"value": "Original experimental approach.", "anchor": anchor},
                "publications": {"value": "Detailed publication metadata " * 20000},
            },
        },
        "sources": [anchor],
        "limitations": ["An approach is not an outcome."],
    }
    view = json.loads(model_fact_payload(fact, 4000))
    assert view["id"] == fact["id"]
    assert view["content"]["approach"] == "Original experimental approach."
    assert view["content"]["objective"] == "Original objective."
    assert view["sources"] == [anchor]
    assert view["content"]["assets"][0]["file_name"] == "original.csv"
    assert view["content"]["retained_asset_count"] == 1
    assert view["model_view"]["status"] == "partial_preview"
    assert len(json.dumps(view).encode()) < 4000
    assert fact["content"]["assets"] == [{"file_name": "original.csv"}]
    assert len(fact["content"]["source_fields"]["publications"]["value"]) > 100000


def test_excess_tool_calls_do_not_execute_and_leave_collected_evidence_usable():
    context = WorkspaceContext(context_version="tool-cap", snapshot_id="a" * 64)
    tools = ResearchTools(SimpleNamespace(), context)
    executions = []

    def inspect(_inputs):
        executions.append("read")
        return tools.fact("Known inspection", {"status": "inspected"}, [])

    tools.get_investigation = inspect
    tool = next(tool for tool in tools.registry() if tool.name == "get_investigation")

    async def invoke():
        for _ in range(12):
            await tool.on_invoke_tool(None, '{"accession":"PSI-25"}')
        return json.loads(await tool.on_invoke_tool(None, '{"accession":"PSI-25"}'))

    result = asyncio.run(invoke())
    assert executions == ["read"] * 12
    assert result["status"] == "not_executed"
    assert len(tools.actions) == 12
    assert len(tools.facts) == 1


@pytest.fixture
def real_dossiers(tmp_path):
    root = Path(__file__).parent / "fixtures/nasa-psi"
    content = (root / "snapshot.json").read_bytes()
    manifest = json.loads(content)
    snapshot_id = sha256(content).hexdigest()

    class FixtureCorpus:
        settings = SimpleNamespace(fixture_directory=root, object_directory=tmp_path / "objects")

        def snapshot(self, selected=None):
            assert selected in (None, snapshot_id)
            return {"snapshot_id": snapshot_id, "manifest": manifest}

        def investigation(self, accession, selected=None):
            self.snapshot(selected)
            record = next(
                item for item in manifest["investigations"] if item["accession"] == accession
            )
            return {
                **record,
                "snapshot_id": snapshot_id,
                "assets": [item for item in manifest["assets"] if item["accession"] == accession],
            }

        def asset(self, digest, selected=None, *, accession=None, asset_id=None):
            self.snapshot(selected)
            return next(
                item
                for item in manifest["assets"]
                if item["sha256"] == digest
                and (accession is None or item["accession"] == accession)
                and (asset_id is None or item["id"] == asset_id)
            )

        def asset_bytes(self, asset):
            value = (root / asset["path"]).read_bytes()
            assert sha256(value).hexdigest() == asset["sha256"]
            return value

    tools = ResearchTools(
        cast(Corpus, FixtureCorpus()),
        WorkspaceContext(context_version="source-preview", snapshot_id=snapshot_id),
    )
    facts = [
        tools.get_investigation(InvestigationInput(accession=accession))
        for accession in ("PSI-26", "PSI-25", "PSI-98", "PSI-99", "PSI-100", "PSI-62")
    ]
    return tools, facts


@pytest.mark.parametrize("byte_limit", [4666, 2333, 2000])
def test_six_real_dossiers_keep_scientific_content_and_exact_anchors_at_synthesis_caps(
    real_dossiers, byte_limit
):
    tools, facts = real_dossiers
    originals = deepcopy(facts)
    for fact in facts:
        encoded = model_fact_payload(fact, byte_limit)
        view = json.loads(encoded)
        assert len(encoded.encode()) <= byte_limit
        assert view["id"] == fact["id"]
        assert view["content"]["accession"] == fact["content"]["accession"]
        assert view["content"]["title"] == fact["content"]["title"]
        assert view["content"]["source_url"] == fact["content"]["source_url"]
        assert view["content"]["source_url"].startswith("https://psi.nasa.gov/")
        for field in ("objective", "approach"):
            excerpt = view["content"][field]
            assert len(excerpt) >= 100
            assert fact["content"][field].startswith(excerpt)
            metadata = view["model_view"]["excerpts"][field]
            assert metadata["original_characters"] == len(fact["content"][field])
            assert metadata["retained_characters"] == len(excerpt)
            anchor = next(source for source in view["sources"] if source["field"] == field)
            assert anchor == {
                key: value
                for key, value in fact["content"]["source_fields"][field]["anchor"].items()
                if value is not None
            }
        assert view["model_view"]["status"] == "partial_preview"
    assert facts == originals
    assert [tools.facts[fact["id"]].model_dump(mode="json") for fact in facts] == originals


def test_six_dossier_synthesis_can_compare_methods_without_turning_them_into_results(real_dossiers):
    tools, facts = real_dossiers
    views = {
        fact["content"]["accession"]: json.loads(model_fact_payload(fact, 4666)) for fact in facts
    }
    bass = views["PSI-25"]
    saffire = views["PSI-98"]
    modeling = views["PSI-62"]
    # Independently known source terms required for this comparison remain visible.
    assert "microgravity combustion tests" in bass["content"]["approach"]
    assert "Cygnus" in saffire["content"]["approach"]
    assert "computational modeling" in modeling["content"]["approach"]
    answer = ResearchAnswer(
        title="Compare the experimental approaches",
        claims=[
            {
                "statement": (
                    "BASS-II uses microgravity combustion tests, while Saffire-I performs "
                    "its experiments aboard Cygnus. The modeling investigation combines "
                    "computational modeling with experimental data."
                ),
                "origin": "source_summary",
                "fact_ids": [bass["id"], saffire["id"], modeling["id"]],
                "limitations": [
                    "This compares approaches, not measured outcomes or matched "
                    "operating conditions."
                ],
            }
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    checked = verify_answer(answer, tools)
    assert len(checked["claims"]) == 1
    assert not checked["withheld_claims"]
    assert checked["claims"][0]["fact_ids"] == [bass["id"], saffire["id"], modeling["id"]]


def test_qualitative_comparison_survives_while_incidental_dossier_numbers_stay_withheld(
    real_dossiers,
):
    tools, facts = real_dossiers
    by_accession = {fact["content"]["accession"]: fact for fact in facts}
    bass = by_accession["PSI-25"]
    saffire = by_accession["PSI-98"]
    assert "microgravity combustion tests" in bass["content"]["approach"]
    assert "Cygnus" in saffire["content"]["approach"]
    answer = ResearchAnswer(
        title="Compare solid-fuel experiments",
        claims=[
            {
                "statement": "BASS-II uses microgravity combustion tests, while "
                "Saffire-I performs its experiments aboard Cygnus.",
                "origin": "source_summary",
                "fact_ids": [bass["id"], saffire["id"]],
                "limitations": ["This compares research approaches, not matched test conditions."],
            },
            {
                "statement": "BASS-II used airflow of 40 cm/s.",
                "origin": "source_summary",
                "fact_ids": [bass["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    checked = verify_answer(answer, tools)
    assert len(checked["claims"]) == 1
    assert checked["claims"][0]["statement"].startswith("BASS-II uses microgravity")
    assert checked["claims"][0]["fact_ids"] == [bass["id"], saffire["id"]]
    assert len(checked["withheld_claims"]) == 1
    assert "numerical statement lacks" in " ".join(checked["withheld_claims"][0]["reasons"])

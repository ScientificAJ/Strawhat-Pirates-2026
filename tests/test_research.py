"""Source support, deterministic routing and bounded model-call regressions."""

import asyncio
import json
from copy import deepcopy
from decimal import Decimal
from types import SimpleNamespace

import pytest
from agents import ModelSettings
from nova_ember.agent_tools.provider import (
    BudgetedResponsesModel,
    ModelBudgetExceeded,
    route_model,
    token_cost,
)
from nova_ember.api.config import Settings, backend_key
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import model_fact_payload
from nova_ember.contracts.research import EvidenceFact, ResearchAnswer, ResearchRequest
from openai import AsyncOpenAI
from pydantic import ValidationError


def test_complex_and_routine_routes_preserve_the_selected_models():
    assert route_model("Find the FLEX investigation") == "gpt-6.1-terra"
    assert route_model("Compare its mechanisms and uncertainty") == "gpt-6.1-sol"
    assert route_model("Inspect a source", role="verification") == "gpt-6.1-sol"
    assert route_model("Explain a mechanism", complexity="routine") == "gpt-6.1-terra"
    with pytest.raises(ValueError):
        route_model("Find a source", complexity="unregistered-model")
    assert token_cost("gpt-6.1-sol", 20000, 4000) == Decimal("0.16")
    assert token_cost("gpt-6.1-terra", 20000, 4000) == Decimal("0.08")


def test_key_is_backend_only_and_absent_from_configuration_representation(tmp_path, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    target = tmp_path / ".env.local"
    target.write_text("OPENAI_API_KEY=development-placeholder\n", encoding="utf-8")
    assert backend_key(tmp_path) == "development-placeholder"
    settings = Settings(
        "database-placeholder", tmp_path, tmp_path, openai_api_key=backend_key(tmp_path)
    )
    assert "development-placeholder" not in repr(settings)
    assert "OPENAI_API_KEY" not in __import__("os").environ
    target.unlink()
    target.symlink_to(tmp_path / "not-a-secret")
    assert backend_key(tmp_path) is None


def test_stale_context_is_rejected_before_a_provider_request():
    with pytest.raises(ValidationError, match="context changed"):
        ResearchRequest(
            question="Inspect this selection",
            context={"snapshot_id": "a" * 64, "context_version": "new"},
            expected_context_version="old",
        )


def answer(claims):
    return ResearchAnswer(
        title="Source interpretation",
        claims=claims,
        contradictions=[],
        next_actions=[],
        limitations=[],
    )


def claim(statement, identifiers, origin="source_summary"):
    return {"statement": statement, "origin": origin, "fact_ids": identifiers, "limitations": []}


def test_fabricated_citations_and_unsupported_numbers_are_withheld():
    fact = EvidenceFact(
        id="known",
        origin="deterministic_calculation",
        label="FLEX source event counts",
        content={
            "Extinction": 186,
            "Disruption": 61,
            "Completion": 27,
            "independent_run_count": None,
        },
        sources=[{"asset_sha256": "a" * 64, "source_rows": [2, 3]}],
        limitations=["Independent-run count is unknown."],
    )
    tools = SimpleNamespace(facts={"known": fact})
    checked = verify_answer(
        answer(
            [
                claim("The retained table contains 186 Extinction labels.", ["known"]),
                claim("The table has 999 independent trials.", ["known"]),
                claim("A publication reports the result.", ["invented"]),
                claim(
                    "The table does not establish a safe operating atmosphere.",
                    ["known"],
                    "model_interpretation",
                ),
                claim("The configuration is safe.", ["known"], "model_interpretation"),
            ]
        ),
        tools,
    )
    assert len(checked["claims"]) == 2
    assert len(checked["withheld_claims"]) == 3
    assert checked["claims"][1]["interpretation_status"] == "model_interpretation"
    assert checked["limitations"] == []
    reasons = [reason for item in checked["withheld_claims"] for reason in item["reasons"]]
    assert any("not produced by this research request" in reason for reason in reasons)
    assert any("numerical statement lacks" in reason for reason in reasons)


def test_mixing_a_real_metadata_fact_cannot_launder_proposed_measurements():
    metadata = EvidenceFact(
        id="source",
        origin="source_metadata",
        label="FLEX metadata",
        content={"title": "FLEX"},
        sources=[{"accession": "PSI-69", "snapshot_id": "a" * 64}],
        limitations=[],
    )
    proposed = EvidenceFact(
        id="proposal",
        origin="model_proposal",
        label="Unaccepted proposal",
        content={"note": "NASA measured a burning rate of 777 mm2/s"},
        sources=[],
        limitations=[],
    )
    checked = verify_answer(
        answer([claim("NASA measured a burning rate of 777 mm2/s", ["source", "proposal"])]),
        SimpleNamespace(facts={"source": metadata, "proposal": proposed}),
    )
    assert not checked["claims"]
    assert checked["withheld_claims"]


def test_scenario_calculation_is_not_a_measurement_and_valid_display_rounding_is_kept():
    from nova_ember.analysis.oxygen import oxygen_partial_pressure

    value = oxygen_partial_pressure(21.0, 14.7, "psia", "mole")
    fact = EvidenceFact(
        id="calculation",
        origin="deterministic_calculation",
        label="Scenario pO2",
        content=value,
        sources=[],
        limitations=value["limitations"],
    )
    tools = SimpleNamespace(facts={"calculation": fact})
    checked = verify_answer(
        answer(
            [
                claim(
                    f"NASA measured {value['value']} psia oxygen partial pressure.", ["calculation"]
                ),
                claim(
                    "For the specified assumptions, "
                    "calculated oxygen partial pressure is 3.087 psia.",
                    ["calculation"],
                    "calculated",
                ),
                claim(
                    "For the specified assumptions, "
                    "calculated oxygen partial pressure is 3.087 Pa.",
                    ["calculation"],
                    "calculated",
                ),
            ]
        ),
        tools,
    )
    assert len(checked["claims"]) == 1
    accepted = checked["claims"][0]
    assert accepted["origin"] == "calculated"
    assert accepted["numeric_support"][0]["stored_value"] == str(value["value"])
    assert accepted["numeric_support"][0]["display"] == "3.087"
    assert fact.content["value"] == value["value"]
    assert len(checked["withheld_claims"]) == 2


def test_original_and_canonical_source_units_cannot_be_exchanged_in_a_claim():
    fact = EvidenceFact(
        id="measurement",
        origin="source_measurement",
        label="Source thickness",
        content={
            "records": [
                {
                    "fields": [
                        {
                            "raw_text": "0.27 mm",
                            "original_unit": "mm",
                            "canonical_value": 0.00027,
                            "canonical_unit": "m",
                            "source_value_kind": "measurement",
                            "status": "normalized",
                        }
                    ]
                }
            ]
        },
        sources=[{"sha256": "a" * 64}],
        limitations=[],
    )
    checked = verify_answer(
        answer(
            [
                claim("The source measured 0.27 mm.", ["measurement"]),
                claim("The source measured 0.27 m.", ["measurement"]),
                claim("The source measured 0.00027 m.", ["measurement"]),
            ]
        ),
        SimpleNamespace(facts={"measurement": fact}),
    )
    assert len(checked["claims"]) == 2
    assert len(checked["withheld_claims"]) == 1


def test_budget_is_checked_before_network_or_step_execution(monkeypatch):
    calls = []

    async def paid(*args, **kwargs):
        calls.append("network")

    monkeypatch.setattr("agents.OpenAIResponsesModel.get_response", paid)
    client = AsyncOpenAI(api_key="development-placeholder")
    model = BudgetedResponsesModel(
        "gpt-6.1-sol", client, Decimal("0.000001"), exact_token_count=False
    )
    with pytest.raises(ModelBudgetExceeded):
        asyncio.run(
            model.get_response("Instructions", "Input", ModelSettings(max_tokens=1000), [], None)
        )
    assert not calls
    assert model.spent_usd == 0
    asyncio.run(client.close())


def test_confirmed_usage_replaces_conservative_reservation(monkeypatch):
    async def paid(*args, **kwargs):
        return SimpleNamespace(
            usage=SimpleNamespace(input_tokens=100, output_tokens=50),
            response_id="response-placeholder",
        )

    monkeypatch.setattr("agents.OpenAIResponsesModel.get_response", paid)
    client = AsyncOpenAI(api_key="development-placeholder")
    model = BudgetedResponsesModel("gpt-6.1-terra", client, Decimal("0.1"), exact_token_count=False)
    asyncio.run(
        model.get_response("Instructions", "Input", ModelSettings(max_tokens=1000), [], None)
    )
    assert model.spent_usd == Decimal("0.00070")
    assert model.calls[0]["response_id"] == "response-placeholder"
    asyncio.run(client.close())


def test_uncertain_provider_call_keeps_reservation_and_is_not_retried(monkeypatch):
    calls = []

    async def failed(*args, **kwargs):
        calls.append(1)
        raise TimeoutError("Simulated unknown provider completion")

    monkeypatch.setattr("agents.OpenAIResponsesModel.get_response", failed)
    client = AsyncOpenAI(api_key="development-placeholder")
    model = BudgetedResponsesModel("gpt-6.1-terra", client, Decimal("0.1"), exact_token_count=False)
    with pytest.raises(TimeoutError):
        asyncio.run(
            model.get_response("Instructions", "Input", ModelSettings(max_tokens=1000), [], None)
        )
    assert len(calls) == 1
    assert model.spent_usd > 0
    assert not model.calls
    asyncio.run(client.close())


def test_bounded_model_view_preserves_summaries_units_and_the_complete_original():
    fact = {
        "id": "a" * 64,
        "label": "Synthetic reference output",
        "origin": "deterministic_calculation",
        "content": {
            "counts": [
                {"label": name, "count": count}
                for name, count in [("a", 186), ("b", 61), ("c", 27)]
            ],
            "total_rows": 274,
            "independent_run_count": None,
            "value": 1.234567890123456,
            "unit": "mm2/s",
            "source_rows": [
                {"row": index, "text": "reference annotation " * 100} for index in range(274)
            ],
            "limitations": ["Source records are not independent experiments."],
        },
        "sources": [{"asset_id": "long-source-identity:" + "b" * 1000, "sha256": "c" * 64}],
        "limitations": ["Synthetic test data; not a NASA measurement."],
    }
    original = deepcopy(fact)
    encoded = model_fact_payload(fact)
    view = json.loads(encoded)
    assert len(encoded.encode()) <= 28000
    assert view["content"]["counts"] == original["content"]["counts"]
    for field in ("total_rows", "independent_run_count", "value", "unit", "limitations"):
        assert view["content"][field] == original["content"][field]
    assert view["sources"] == original["sources"]
    assert view["model_view"]["status"] == "partial_preview"
    assert any(
        item["path"] == '$["content"]["source_rows"]' and item["original_items"] == 274
        for item in view["model_view"]["omissions"]
    )
    assert fact == original

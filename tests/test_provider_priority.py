"""Exercise the actual SDK request boundary for both configured research models."""

import asyncio
import json
from decimal import Decimal

import httpx
import pytest
from agents import ModelSettings
from agents.models.interface import ModelTracing
from nova_ember.agent_tools.provider import BudgetedResponsesModel
from openai import AsyncOpenAI


@pytest.mark.parametrize("model_id", ["gpt-6.1-sol", "gpt-6.1-terra"])
@pytest.mark.parametrize("keyword_settings", [False, True])
def test_both_models_send_priority_without_mutating_caller_settings(model_id, keyword_settings):
    sent = []

    def handler(request):
        body = json.loads(request.content)
        sent.append(body)
        return httpx.Response(
            200,
            json={
                "id": "resp_priority_test",
                "object": "response",
                "created_at": 0,
                "status": "completed",
                "model": model_id,
                "service_tier": "priority",
                "output": [
                    {
                        "id": "msg_priority_test",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [{"type": "output_text", "text": "OK", "annotations": []}],
                    }
                ],
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 1,
                    "total_tokens": 11,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens_details": {"reasoning_tokens": 0},
                },
            },
        )

    async def check():
        async with AsyncOpenAI(
            api_key="offline-placeholder",
            http_client=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        ) as client:
            model = BudgetedResponsesModel(
                model_id, client, Decimal("0.1"), exact_token_count=False
            )
            settings = ModelSettings(
                max_tokens=16, store=False, extra_args={"service_tier": "default"}
            )
            if keyword_settings:
                await model.get_response(
                    system_instructions="Reply OK",
                    input="OK",
                    model_settings=settings,
                    tools=[],
                    output_schema=None,
                    handoffs=[],
                    tracing=ModelTracing.DISABLED,
                )
            else:
                await model.get_response(
                    "Reply OK",
                    "OK",
                    settings,
                    [],
                    None,
                    [],
                    ModelTracing.DISABLED,
                )
            assert settings.extra_args == {"service_tier": "default"}
            assert model.calls[0]["requested_service_tier"] == "priority"
            assert model.spent_usd == (
                Decimal("0.00006") if model_id.endswith("sol") else Decimal("0.00003")
            )

    asyncio.run(check())
    assert len(sent) == 1
    assert sent[0]["model"] == model_id
    assert sent[0]["service_tier"] == "priority"
    assert sent[0]["max_output_tokens"] == 16
    assert sent[0]["store"] is False

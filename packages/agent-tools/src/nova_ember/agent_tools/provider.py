"""Provider routing and per-run accounting without provider-owned scientific state."""

import json
from dataclasses import replace
from decimal import Decimal
from typing import Any

from agents import ModelSettings, OpenAIResponsesModel
from openai import AsyncOpenAI

REASONING_MODELS = {"routine": "gpt-6.1-terra", "complex": "gpt-6.1-sol"}
SERVICE_TIER = "priority"
# Fast/Priority prices per million tokens, checked 15 November 2026:
# https://developers.openai.com/api/docs/pricing
RATES = {
    "gpt-6.1-terra": (Decimal("2"), Decimal("10")),
    "gpt-6.1-sol": (Decimal("4"), Decimal("20")),
}
ROUTING_VERSION = "sol-terra-complexity-v1"


class ModelBudgetExceeded(RuntimeError):
    pass


def route_model(question: str, complexity: str = "auto", role: str = "coordinator") -> str:
    if complexity not in {"auto", "routine", "complex"}:
        raise ValueError("Unsupported model routing choice.")
    if complexity == "auto":
        terms = (
            "compare",
            "predict",
            "mechanism",
            "hypothes",
            "calibrat",
            "uncertainty",
            "contradict",
            "why",
            "fit",
            "suppression",
            "extinction",
        )
        complexity = (
            "complex"
            if role in {"analysis", "verification"}
            or any(term in question.casefold() for term in terms)
            else "routine"
        )
    return REASONING_MODELS[complexity]


def token_cost(model: str, input_tokens: int, output_tokens: int) -> Decimal:
    if input_tokens < 0 or output_tokens < 0:
        raise ValueError("Token counts cannot be negative.")
    incoming, outgoing = RATES[model]
    return (incoming * input_tokens + outgoing * output_tokens) / Decimal(1_000_000)


class BudgetedResponsesModel(OpenAIResponsesModel):
    """Fence each paid call before sending it; uncertain calls retain their reservation."""

    def __init__(
        self,
        model: str,
        client: AsyncOpenAI,
        budget_usd: Decimal,
        before_call=None,
        after_call=None,
        exact_token_count: bool = True,
    ):
        super().__init__(model, client)
        self.selected_model = model
        self.budget_usd = budget_usd
        self.spent_usd = Decimal(0)
        self.calls: list[dict] = []
        self.attempt_count = 0
        self.before_call = before_call
        self.after_call = after_call
        self.provider_client = client
        self.exact_token_count = exact_token_count

    async def get_response(self, *args: Any, **kwargs: Any):
        instructions = kwargs.get("system_instructions", args[0] if args else "")
        supplied_input = kwargs.get("input", args[1] if len(args) > 1 else "")
        settings = (
            kwargs.get("model_settings", args[2] if len(args) > 2 else None) or ModelSettings()
        )
        settings = replace(
            settings,
            extra_args={**(settings.extra_args or {}), "service_tier": SERVICE_TIER},
        )
        if len(args) > 2:
            args = (*args[:2], settings, *args[3:])
        else:
            kwargs["model_settings"] = settings
        tools = kwargs.get("tools", args[3] if len(args) > 3 else [])
        schema = kwargs.get("output_schema", args[4] if len(args) > 4 else None)
        # UTF-8 byte count bounds text tokens; include schemas and protocol overhead.
        serialized = json.dumps(
            [
                instructions,
                supplied_input,
                [getattr(tool, "params_json_schema", {}) for tool in tools],
                schema.json_schema() if schema else None,
            ],
            default=str,
        )
        upper_input = len(serialized.encode("utf-8")) + 2048
        max_output = settings.max_tokens if settings and settings.max_tokens else 2000
        if token_cost(self.selected_model, 0, max_output) + self.spent_usd > self.budget_usd:
            raise ModelBudgetExceeded("The remaining budget cannot cover the output allowance.")
        if self.exact_token_count:
            counted = await self.provider_client.responses.input_tokens.count(
                model=self.selected_model,
                instructions=instructions,
                input=supplied_input,
                tools=[
                    {
                        "type": "function",
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.params_json_schema,
                        "strict": tool.strict_json_schema,
                    }
                    for tool in tools
                    if hasattr(tool, "params_json_schema")
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": schema.name(),
                        "strict": schema.is_strict_json_schema(),
                        "schema": schema.json_schema(),
                    }
                }
                if schema
                else None,
            )
            upper_input = counted.input_tokens + 128
        reservation = token_cost(self.selected_model, upper_input, max_output)
        if self.spent_usd + reservation > self.budget_usd:
            raise ModelBudgetExceeded(
                "The remaining request budget cannot cover the next bounded call."
            )
        step = f"provider-call-{self.attempt_count + 1}"
        if self.before_call:
            self.before_call(step, reservation)
        self.attempt_count += 1
        self.spent_usd += reservation
        try:
            result = await super().get_response(*args, **kwargs)
        except BaseException:
            if self.after_call:
                self.after_call(step, None, True)
            raise
        usage = result.usage
        cost = token_cost(self.selected_model, usage.input_tokens, usage.output_tokens)
        self.spent_usd += cost - reservation
        record = {
            "model": self.selected_model,
            "requested_service_tier": SERVICE_TIER,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cost_usd": str(cost),
            "response_id": result.response_id,
        }
        self.calls.append(record)
        if self.after_call:
            self.after_call(step, record, False)
        return result

"""Offline bounded voice follow-up context, without a second conversation store."""

import asyncio
from contextlib import nullcontext
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from types import SimpleNamespace
from uuid import uuid4

import pytest
from nova_ember.api import voice
from nova_ember.api.config import Settings
from starlette.requests import Request


def retained(*entries):
    return {"transcript": [{"speaker": role, "text": text} for role, text in entries]}


def values(history):
    return [turn.model_dump() for turn in history]


def test_history_keeps_exact_prior_text_and_does_not_repeat_current_question():
    state = retained(
        ("user", "Compare these runs.\nKeep original units."),
        ("voice", "Checked source answer; missing calibration remains unknown."),
        ("user", "What about pressure?"),
        ("voice", "I will check the selected sources."),
    )
    original = [dict(event) for event in state["transcript"]]
    assert values(voice.research_history(state, "What about pressure?")) == [
        {"role": "user", "text": "Compare these runs.\nKeep original units."},
        {
            "role": "assistant",
            "text": "Checked source answer; missing calibration remains unknown.",
        },
    ]
    assert state["transcript"] == original


def test_history_selects_complete_suffix_with_utf8_and_turn_limits():
    state = retained(*[("user" if i % 2 == 0 else "voice", f"turn {i}") for i in range(20)])
    history = voice.research_history(state, "new question")
    assert len(history) == 16
    assert history[0].text == "turn 4"
    assert history[-1].text == "turn 19"
    unicode_text = "火" * 6000
    history = voice.research_history(
        retained(("user", unicode_text), ("voice", unicode_text)), "new question"
    )
    assert values(history) == [{"role": "assistant", "text": unicode_text}]
    assert sum(len(turn.text.encode("utf-8")) for turn in history) == 18000
    assert (
        voice.research_history(retained(("user", "earlier"), ("voice", "x" * 6001)), "new question")
        == []
    )


@pytest.fixture
def delegated(monkeypatch):
    receipt = "voice-history-" + uuid4().hex
    state = retained(
        ("user", "Original research question"),
        ("voice", "Earlier checked result with its limitations"),
        ("user", "What about pressure?"),
    )
    state.update(
        {"workspace": {"context_version": "voice-history-v1", "snapshot_id": "a" * 64}, "tasks": {}}
    )
    row = {
        "id": uuid4(),
        "context": state,
        "context_version": "voice-history-v1",
        "receipt_sha256": sha256(receipt.encode()).hexdigest(),
        "status": "active",
        "expires_at": datetime.now(UTC) + timedelta(minutes=5),
    }
    connection = SimpleNamespace(
        execute=lambda *args, **kwargs: SimpleNamespace(fetchone=lambda: row)
    )
    monkeypatch.setattr(voice, "connect", lambda url: nullcontext(connection))
    monkeypatch.setattr(voice, "Corpus", lambda settings: None)
    monkeypatch.setattr(
        voice,
        "ResearchTools",
        lambda *args, **kwargs: SimpleNamespace(resolve_context=lambda: None),
    )
    queued = []

    def create_job(database_url, snapshot_id, receipt_sha256, **kwargs):
        queued.append(kwargs["inputs"])
        assert receipt_sha256 == row["receipt_sha256"]
        return {"id": str(uuid4()), "status": "queued"}

    monkeypatch.setattr(voice.jobs, "create_job_for_receipt_hash", create_job)
    settings = Settings.from_environment()
    service = voice.VoiceService(
        settings,
        client_factory=lambda: pytest.fail("No provider call belongs in this offline check"),
    )
    return SimpleNamespace(
        settings=settings, service=service, row=row, state=state, receipt=receipt, queued=queued
    )


def test_monitor_delegation_carries_bounded_previous_turns_and_exact_latest_fragment(delegated):
    fixture = delegated
    result = fixture.service.queue_delegation(str(fixture.row["id"]), "provider-delegation")
    assert result["status"] == "queued"
    request = fixture.queued[0]
    assert request["question"] == "What about pressure?"
    assert request["history"] == [
        {"role": "user", "text": "Original research question"},
        {"role": "assistant", "text": "Earlier checked result with its limitations"},
    ]
    assert len(fixture.state["transcript"]) == 3


def test_explicit_voice_question_carries_history_without_changing_retention(delegated):
    fixture = delegated
    router = voice.create_voice_router(fixture.settings, fixture.service)
    endpoint = next(
        route.endpoint
        for route in router.routes
        if route.path == "/v1/voice/sessions/{session_id}/questions"
    )
    request = Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/v1/voice/sessions/unused/questions",
            "headers": [],
        }
    )
    inputs = voice.VoiceQuestion(
        operation_id=uuid4(),
        expected_context_version="voice-history-v1",
        question="And the apparatus?",
    )
    result = asyncio.run(
        endpoint(fixture.row["id"], inputs, request, nova_browser_receipt=fixture.receipt)
    )
    assert result["status"] == "queued"
    submitted = fixture.queued[0]
    assert submitted["question"] == "And the apparatus?"
    assert [turn["text"] for turn in submitted["history"]] == [
        "Original research question",
        "Earlier checked result with its limitations",
        "What about pressure?",
    ]
    assert len(fixture.state["transcript"]) == 4
    assert fixture.state["transcript"][-1]["text"] == "And the apparatus?"
    assert fixture.state["transcript"][-1]["origin"] == "typed_user_input"

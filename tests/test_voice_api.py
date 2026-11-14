"""Real PostgreSQL voice ownership/state checks with an explicit fake provider."""

import asyncio
import os
from dataclasses import replace
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.seed import seed
from nova_ember.api.voice import (
    VoiceService,
    create_voice_router,
    voice_lease_seconds,
)

pytestmark = pytest.mark.integration


class AsyncRecorder:
    def __init__(self):
        self.calls = []

    async def __call__(self, **values):
        self.calls.append(values)


class FakeChannel:
    def __init__(self):
        self.session = SimpleNamespace(
            thinking=SimpleNamespace(append=AsyncRecorder()),
            commentary=SimpleNamespace(append=AsyncRecorder()),
            instructions=SimpleNamespace(append=AsyncRecorder()),
            input_audio=SimpleNamespace(mute=AsyncRecorder(), unmute=AsyncRecorder()),
            close=AsyncRecorder(),
        )


class FakeProvider:
    def __init__(self):
        self.creations = []
        self.hangups = []
        self.live = SimpleNamespace(
            create=self.create, sessions=SimpleNamespace(hangup=self.hangup)
        )

    async def create(self, **values):
        self.creations.append(values)
        return SimpleNamespace(
            session=SimpleNamespace(id=f"live_fake_{uuid4().hex}"),
            transport=SimpleNamespace(sdp="v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n"),
        )

    async def hangup(self, session_id):
        self.hangups.append(session_id)

    async def close(self):
        return None


@pytest.fixture
def voice_fixture(tmp_path):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL required for separate PostgreSQL tests.")
    original = Settings.from_environment()
    if original.database_url == url:
        raise RuntimeError("Voice tests require the separate test database.")
    settings = replace(
        original,
        database_url=url,
        object_directory=tmp_path,
        openai_api_key="test-provider-placeholder",
        research_daily_budget_usd=10000.0,
    )
    snapshot = seed(settings)
    prefix = f"voice-test-{uuid4().hex}"
    provider = FakeProvider()
    service = VoiceService(settings, client_factory=lambda: provider)
    service.attach = lambda _identifier: None
    app = FastAPI()
    app.include_router(create_voice_router(settings, service))
    client = TestClient(app)

    def start_data(**updates):
        data = {
            "operation_id": str(uuid4()),
            "sdp": "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
            "context": {
                "context_version": f"{prefix}:1",
                "snapshot_id": snapshot,
                "investigations": ["PSI-69"],
            },
            "expected_context_version": f"{prefix}:1",
            "microphone_consent": True,
            "image_consent": False,
        }
        data.update(updates)
        return data

    def start(**updates):
        response = client.post("/v1/voice/sessions", json=start_data(**updates))
        assert response.status_code == 200, response.text
        identifier = response.json()["id"]
        asyncio.run(
            service.provider_event(
                identifier,
                {"type": "session.started", "event_id": f"started-{identifier}"},
                FakeChannel(),
            )
        )
        return identifier, response

    yield SimpleNamespace(
        settings=settings,
        service=service,
        provider=provider,
        client=client,
        start=start,
        start_data=start_data,
        prefix=prefix,
    )
    with connect(settings.database_url) as connection:
        rows = connection.execute(
            "SELECT id, context FROM voice_sessions WHERE context_version LIKE %s", (prefix + "%",)
        ).fetchall()
        reservations = [
            identifier for row in rows for identifier in row["context"].get("reservations", [])
        ]
        task_ids = [
            task["job_id"] for row in rows for task in row["context"].get("tasks", {}).values()
        ]
        for row in rows:
            connection.execute("DELETE FROM voice_sessions WHERE id = %s", (row["id"],))
        for identifier in task_ids:
            connection.execute("DELETE FROM jobs WHERE id = %s", (identifier,))
        for identifier in reservations:
            connection.execute("DELETE FROM model_usage_reservations WHERE id = %s", (identifier,))


def mutation(fixture, **updates):
    return {
        "operation_id": str(uuid4()),
        "expected_context_version": f"{fixture.prefix}:1",
        **updates,
    }


def test_secure_backend_broker_requires_mic_but_not_image_consent(voice_fixture):
    f = voice_fixture
    denied = f.client.post("/v1/voice/sessions", json=f.start_data(microphone_consent=False))
    assert denied.status_code == 422
    assert not f.provider.creations
    identifier, response = f.start()
    settings = f.provider.creations[0]["session"]
    assert settings["model"] == "gpt-live-1"
    assert settings["delegation"] == {"type": "client"}
    assert settings["client"]["data_channel"]["allowed_client_events"] == []
    assert settings["store"] is False
    assert "key" not in settings
    assert "test-provider-placeholder" not in response.text
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert "Max-Age=86400" in response.headers["set-cookie"]
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["microphone_consent"] is True
    assert state["image_consent"] is False
    assert state["context_version"] == f"{f.prefix}:1"
    assert "provider_session_id" not in state


def test_other_browser_missing_receipt_and_cross_origin_are_denied(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    stranger = TestClient(f.client.app)
    assert stranger.get(f"/v1/voice/sessions/{identifier}").status_code == 404
    stranger.cookies.set("nova_browser_receipt", "x" * 43)
    assert stranger.get(f"/v1/voice/sessions/{identifier}").status_code == 404
    response = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls",
        json=mutation(f, action="end"),
        headers={"Origin": "https://unrelated.example"},
    )
    assert response.status_code == 403


def test_provider_transcripts_are_deduplicated_and_cumulative_usage_is_not_summed(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    event = {
        "event_id": "input-1",
        "type": "session.input_transcript.delta",
        "delta": "Compare FLEX",
        "start_ms": 0,
        "end_ms": 200,
    }
    channel = FakeChannel()
    asyncio.run(f.service.provider_event(identifier, event, channel))
    asyncio.run(f.service.provider_event(identifier, event, channel))
    for index, seconds in enumerate((12, 15, 14)):
        asyncio.run(
            f.service.provider_event(
                identifier,
                {
                    "event_id": f"usage-{index}",
                    "type": "session.usage.updated",
                    "usage": {"seconds": seconds},
                },
                channel,
            )
        )
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert len(state["transcript"]) == 1
    assert state["transcript"][0]["text"] == "Compare FLEX"
    assert state["provider_usage_seconds"] == 15
    assert state["usage_is_cumulative"]
    assert not state["finalization_confirmed"]
    assert (
        f.client.get(f"/v1/voice/sessions/{identifier}?after_sequence=1").json()["transcript"] == []
    )


def test_client_delegation_queues_one_owner_scoped_scientific_job_from_saved_text(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    channel = FakeChannel()
    asyncio.run(
        f.service.provider_event(
            identifier,
            {
                "event_id": "input",
                "type": "session.input_transcript.delta",
                "delta": "What test-end labels does FLEX report?",
                "start_ms": 0,
                "end_ms": 500,
            },
            channel,
        )
    )
    event = {
        "event_id": "delegate",
        "type": "session.delegation.created",
        "delegation": {"id": "delegation-1", "target": "client"},
        "offset_ms": 500,
    }
    asyncio.run(f.service.provider_event(identifier, event, channel))
    asyncio.run(f.service.provider_event(identifier, event, channel))
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert len(state["tasks"]) == 1
    task = state["tasks"]["delegation-1"]
    job = f.client.get(f"/v1/voice/sessions/{identifier}/tasks/{task['job_id']}")
    assert job.status_code == 200
    assert job.json()["kind"] == "research"
    with connect(f.settings.database_url) as connection:
        stored = connection.execute(
            "SELECT inputs FROM jobs WHERE id = %s", (task["job_id"],)
        ).fetchone()
    assert "What test-end labels" in stored["inputs"]["question"]
    assert stored["inputs"]["context"]["snapshot_id"] == state["workspace"]["snapshot_id"]
    assert len(channel.session.thinking.append.calls) == 1
    assert "receipt" not in state["tasks"]["delegation-1"]


def test_context_changes_reject_stale_mutations_and_withhold_late_results(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    question = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Inspect the FLEX source labels."),
    )
    task = question.json()
    current = f.client.get(f"/v1/voice/sessions/{identifier}").json()["workspace"]
    current["context_version"] = f"{f.prefix}:2"
    update = f.client.post(
        f"/v1/voice/sessions/{identifier}/context", json=mutation(f, context=current)
    )
    assert update.status_code == 200
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET status = 'succeeded', result = '{}'::jsonb WHERE id = %s",
            (task["job_id"],),
        )
    channel = FakeChannel()
    asyncio.run(f.service.deliver_results(identifier, channel))
    assert not channel.session.commentary.append.calls
    assert (
        f.client.post(
            f"/v1/voice/sessions/{identifier}/questions",
            json=mutation(f, question="Stale selection"),
        ).status_code
        == 409
    )
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert next(iter(state["tasks"].values()))["status"] == "withheld_stale_context"


def test_stop_speech_generation_computation_and_end_are_separate_actions(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    channel = FakeChannel()
    f.service.connections[identifier] = channel
    task = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Find source evidence."),
    ).json()
    response = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action="stop_speaking")
    )
    assert response.status_code == 200
    assert response.json()["canceled_job_ids"] == []
    assert response.json()["local_actions"] == ["pause_audio_playback"]
    assert len(channel.session.instructions.append.calls) == 1
    assert (
        f.client.get(f"/v1/voice/sessions/{identifier}/tasks/{task['job_id']}").json()["status"]
        == "queued"
    )
    response = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action="stop_generation")
    )
    assert response.status_code == 200
    assert f.client.get(f"/v1/voice/sessions/{identifier}").json()["generation_suppressed"]
    response = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls",
        json=mutation(f, action="cancel_computation", job_ids=[task["job_id"]]),
    )
    assert response.json()["canceled_job_ids"] == [task["job_id"]]
    assert (
        f.client.get(f"/v1/voice/sessions/{identifier}/tasks/{task['job_id']}").json()["status"]
        == "canceled"
    )
    response = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action="end")
    )
    assert response.status_code == 200
    assert len(channel.session.close.calls) == 1
    assert not f.client.get(f"/v1/voice/sessions/{identifier}").json()["microphone_consent"]


def test_revoked_microphone_cannot_unmute_or_renew_but_saved_text_resumes(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    f.service.connections[identifier] = FakeChannel()
    assert (
        f.client.post(
            f"/v1/voice/sessions/{identifier}/controls",
            json=mutation(f, action="revoke_microphone"),
        ).status_code
        == 200
    )
    assert (
        f.client.post(
            f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action="unmute")
        ).status_code
        == 409
    )
    assert (
        f.client.post(
            f"/v1/voice/sessions/{identifier}/renew", json=mutation(f, microphone_consent=True)
        ).status_code
        == 409
    )
    result = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Continue the selected source question in text."),
    )
    assert result.status_code == 202
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["transcript"][-1]["origin"] == "typed_user_input"
    assert state["text_resume_available"]


def test_voice_renewal_is_explicit_budgeted_and_idempotent(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    inputs = mutation(f, microphone_consent=True)
    first = f.client.post(f"/v1/voice/sessions/{identifier}/renew", json=inputs)
    second = f.client.post(f"/v1/voice/sessions/{identifier}/renew", json=inputs)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()
    with connect(f.settings.database_url) as connection:
        row = connection.execute(
            "SELECT context FROM voice_sessions WHERE id = %s", (identifier,)
        ).fetchone()
    assert len(row["context"]["reservations"]) == 2
    assert voice_lease_seconds(f.settings) == 105


def test_final_usage_settles_voice_reservations_and_preserves_closed_transcript(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    asyncio.run(
        f.service.provider_event(
            identifier,
            {
                "event_id": "closed",
                "type": "session.closed",
                "reason": "close_requested",
                "usage": {"seconds": 30},
            },
            FakeChannel(),
        )
    )
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["status"] == "closed"
    assert state["finalization_confirmed"]
    assert state["final_usage_confirmed"]
    assert state["provider_usage_seconds"] == 30
    with connect(f.settings.database_url) as connection:
        row = connection.execute(
            "SELECT m.status, m.settled_usd FROM model_usage_reservations m JOIN "
            "voice_sessions v ON v.reservation_id = m.id WHERE v.id = %s",
            (identifier,),
        ).fetchone()
    assert row["status"] == "settled"
    assert row["settled_usd"] == Decimal("0.025000")


def test_unconfirmed_close_retains_budget_and_owner_scope(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    f.service.mark_uncertain(identifier, "test_transport_loss")
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["status"] == "uncertain"
    assert not state["finalization_confirmed"]
    with connect(f.settings.database_url) as connection:
        row = connection.execute(
            "SELECT m.status, m.settled_usd FROM model_usage_reservations m JOIN "
            "voice_sessions v ON v.reservation_id = m.id WHERE v.id = %s",
            (identifier,),
        ).fetchone()
    assert row["status"] == "uncertain"
    assert row["settled_usd"] is None


def test_expired_session_cannot_renew_and_start_retries_do_not_create_paid_sessions(voice_fixture):
    f = voice_fixture
    data = f.start_data()
    first = f.client.post("/v1/voice/sessions", json=data)
    assert first.status_code == 200
    assert f.client.post("/v1/voice/sessions", json=data).status_code == 409
    assert len(f.provider.creations) == 1
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE voice_sessions SET expires_at = now() - interval '1 second' WHERE id = %s",
            (first.json()["id"],),
        )
    assert (
        f.client.post(
            f"/v1/voice/sessions/{first.json()['id']}/renew",
            json=mutation(f, microphone_consent=True),
        ).status_code
        == 409
    )


def test_wrong_voice_task_cannot_be_read_or_canceled(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    random_job = str(uuid4())
    assert f.client.get(f"/v1/voice/sessions/{identifier}/tasks/{random_job}").status_code == 404
    assert (
        f.client.post(
            f"/v1/voice/sessions/{identifier}/controls",
            json=mutation(f, action="cancel_computation", job_ids=[random_job]),
        ).status_code
        == 404
    )


def test_explicit_image_consent_and_source_validation_precede_provider_creation(voice_fixture):
    import base64
    import hashlib
    import io

    from PIL import Image

    f = voice_fixture
    output = io.BytesIO()
    Image.new("RGB", (2, 2), "white").save(output, format="PNG")
    content = output.getvalue()
    selected = {
        "consent": True,
        "purpose": "Explain this explicitly selected synthetic figure",
        "image_base64": base64.b64encode(content).decode(),
        "media_type": "image/png",
        "expected_sha256": hashlib.sha256(content).hexdigest(),
    }
    denied = f.client.post(
        "/v1/voice/sessions", json=f.start_data(images=[selected], image_consent=False)
    )
    assert denied.status_code == 422
    assert not f.provider.creations
    identifier, _ = f.start(images=[selected], image_consent=True)
    assert "images" not in f.provider.creations[0]["session"]
    assert "image_base64" not in str(f.provider.creations[0]["session"])
    question = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Explain the selected figure with its limits."),
    ).json()
    with connect(f.settings.database_url) as connection:
        row = connection.execute(
            "SELECT inputs FROM jobs WHERE id = %s", (question["job_id"],)
        ).fetchone()
    assert row["inputs"]["images"][0]["expected_sha256"] == selected["expected_sha256"]
    automatic = f.service.queue_delegation(identifier, "image-delegation", "Inspect this figure.")
    with connect(f.settings.database_url) as connection:
        queued = connection.execute(
            "SELECT inputs FROM jobs WHERE id = %s", (automatic["job_id"],)
        ).fetchone()
        saved = connection.execute(
            "SELECT context FROM voice_sessions WHERE id = %s", (identifier,)
        ).fetchone()
    assert queued["inputs"]["images"][0]["expected_sha256"] == selected["expected_sha256"]
    assert saved["context"]["selected_images"][0]["image_base64"] is None
    retained = (
        f.settings.object_directory / "private-voice" / identifier / selected["expected_sha256"]
    )
    assert retained.read_bytes() == content
    assert retained.stat().st_mode & 0o777 == 0o600


def test_context_update_retry_is_idempotent_after_the_version_changes(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    workspace = f.client.get(f"/v1/voice/sessions/{identifier}").json()["workspace"]
    workspace["context_version"] = f"{f.prefix}:2"
    inputs = mutation(f, context=workspace)
    first = f.client.post(f"/v1/voice/sessions/{identifier}/context", json=inputs)
    second = f.client.post(f"/v1/voice/sessions/{identifier}/context", json=inputs)
    assert first.status_code == second.status_code == 200
    assert first.json() == second.json()


def test_checked_voice_context_and_provider_acceptance_are_distinct_from_playback(voice_fixture):
    from psycopg.types.json import Jsonb

    f = voice_fixture
    identifier, _ = f.start()
    task = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Describe the FLEX source labels."),
    ).json()
    checked = {
        "answer": {
            "claims": [
                {
                    "statement": "The source table contains 274 records.",
                    "limitations": ["Independent run count remains unknown."],
                }
            ],
            "limitations": ["Source labels are not a safety probability."],
        }
    }
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET status = 'succeeded', result = %s WHERE id = %s",
            (Jsonb(checked), task["job_id"]),
        )
    channel = FakeChannel()
    asyncio.run(f.service.deliver_results(identifier, channel))
    spoken_context = " ".join(call["content"] for call in channel.session.thinking.append.calls)
    assert "274 records" in spoken_context
    assert "Independent run count remains unknown" in spoken_context
    assert "safety probability" in spoken_context
    assert len(channel.session.commentary.append.calls) == 1
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    pending = next(iter(state["tasks"].values()))
    assert pending["delivery_status"] == "sending"
    assert pending["delivered"] is False
    asyncio.run(
        f.service.provider_event(
            identifier,
            {
                "type": "session.commentary.appended",
                "event_id": "accepted",
                "client_event_id": f"result_{task['job_id']}",
            },
            channel,
        )
    )
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    accepted = next(iter(state["tasks"].values()))
    assert accepted["delivery_status"] == "accepted_by_provider"
    assert accepted["delivered"] is False  # Playback requires the eventual browser audio check.
    asyncio.run(f.service.deliver_results(identifier, channel))
    assert len(channel.session.commentary.append.calls) == 1


def test_control_transport_failure_preserves_local_stop_and_reports_uncertainty(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    channel = FakeChannel()

    async def fail(**_values):
        raise TimeoutError("fake sideband timeout")

    channel.session.instructions.append = fail
    f.service.connections[identifier] = channel
    result = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action="stop_generation")
    )
    assert result.status_code == 200
    assert result.json()["provider_signal"] == "unconfirmed"
    assert result.json()["local_actions"] == ["pause_audio_playback"]
    assert f.client.get(f"/v1/voice/sessions/{identifier}").json()["generation_suppressed"]


def test_restart_reattaches_only_current_sessions_without_creating_new_paid_voice(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    attachments = []
    replacement = VoiceService(f.settings, client_factory=lambda: f.provider)
    replacement.attach = attachments.append
    asyncio.run(replacement.startup())
    assert identifier in attachments
    assert len(f.provider.creations) == 1


def test_expiry_watchdog_closes_provider_and_never_claims_final_usage_without_event(
    voice_fixture, monkeypatch
):
    from nova_ember.api import voice

    f = voice_fixture
    identifier, _ = f.start()
    calls = []

    class FakeSyncProvider:
        def __init__(self, **_values):
            self.live = SimpleNamespace(
                sessions=SimpleNamespace(hangup=lambda provider_id: calls.append(provider_id))
            )

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

    monkeypatch.setattr(voice, "OpenAI", FakeSyncProvider)
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE voice_sessions SET expires_at = now() - interval '1 second' WHERE id = %s",
            (identifier,),
        )
    assert voice.close_expired_voice_sessions(f.settings) >= 1
    assert calls
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["status"] == "uncertain"
    assert not state["finalization_confirmed"]
    assert not state["microphone_consent"]
    # A subsequent authoritative final event resolves the retained reservation.
    asyncio.run(
        f.service.provider_event(
            identifier,
            {
                "type": "session.closed",
                "event_id": "late-closed",
                "reason": "expired",
                "usage": {"seconds": 15},
            },
            FakeChannel(),
        )
    )
    state = f.client.get(f"/v1/voice/sessions/{identifier}").json()
    assert state["status"] == "closed"
    assert state["final_usage_confirmed"]


def test_bounded_transcript_window_marks_omissions_explicitly(voice_fixture):
    from nova_ember.api.voice import MAX_TRANSCRIPT_EVENTS, TranscriptFragment, append_fragment

    state = {"workspace": {"context_version": "fixture"}, "transcript": []}
    for index in range(MAX_TRANSCRIPT_EVENTS + 1):
        append_fragment(
            state,
            TranscriptFragment(
                event_id=f"e{index}",
                type="session.input_transcript.delta",
                delta="fragment",
                start_ms=index,
                end_ms=index + 1,
            ),
        )
    assert len(state["transcript"]) == MAX_TRANSCRIPT_EVENTS
    assert state["transcript_truncated"]
    assert state["transcript"][0]["sequence"] == 2


def test_provider_rejection_is_not_retried_and_does_not_publish_session_or_spend(voice_fixture):
    import httpx2
    from openai import RateLimitError

    f = voice_fixture
    attempts = []

    async def reject(**_values):
        attempts.append(True)
        response = httpx2.Response(
            429, request=httpx2.Request("POST", "https://api.openai.com/v1/live/sessions")
        )
        raise RateLimitError(
            "fake provider rejection", response=response, body={"code": "rate_limit_exceeded"}
        )

    f.provider.live.create = reject
    response = f.client.post("/v1/voice/sessions", json=f.start_data())
    assert response.status_code == 503
    assert len(attempts) == 1
    assert "fake provider rejection" not in response.text
    with connect(f.settings.database_url) as connection:
        row = connection.execute(
            "SELECT v.status, m.status AS reservation_status, m.settled_usd FROM "
            "voice_sessions v JOIN model_usage_reservations m ON m.id = v.reservation_id "
            "WHERE v.context_version = %s",
            (f"{f.prefix}:1",),
        ).fetchone()
    assert row["status"] == "closed"
    assert row["reservation_status"] == "settled"
    assert row["settled_usd"] == 0


def test_missing_provider_configuration_preserves_text_only_boundary(voice_fixture):
    f = voice_fixture
    f.service.settings = replace(f.settings, openai_api_key=None)
    result = f.client.post("/v1/voice/sessions", json=f.start_data())
    assert result.status_code == 503
    assert not f.provider.creations


def test_completed_computation_is_not_falsely_reported_canceled(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    task = f.client.post(
        f"/v1/voice/sessions/{identifier}/questions",
        json=mutation(f, question="Inspect an exact source."),
    ).json()
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET status = 'succeeded', result = '{}'::jsonb WHERE id = %s",
            (task["job_id"],),
        )
    result = f.client.post(
        f"/v1/voice/sessions/{identifier}/controls",
        json=mutation(f, action="cancel_computation", job_ids=[task["job_id"]]),
    )
    assert result.status_code == 200
    assert result.json()["canceled_job_ids"] == []
    assert result.json()["unchanged_job_ids"] == [task["job_id"]]


def test_expired_voice_cannot_reenable_microphone_or_generation(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    with connect(f.settings.database_url) as connection:
        connection.execute(
            "UPDATE voice_sessions SET expires_at = now() - interval '1 second' WHERE id = %s",
            (identifier,),
        )
    for action in ("unmute", "resume_generation"):
        assert (
            f.client.post(
                f"/v1/voice/sessions/{identifier}/controls", json=mutation(f, action=action)
            ).status_code
            == 409
        )
    assert f.client.get(f"/v1/voice/sessions/{identifier}").headers["cache-control"] == "no-store"


def test_explicit_replacement_restores_saved_text_without_repeating_tasks(voice_fixture):
    f = voice_fixture
    identifier, _ = f.start()
    asyncio.run(
        f.service.provider_event(
            identifier,
            {
                "type": "session.input_transcript.delta",
                "event_id": "resume-input",
                "delta": "Keep the FLEX source question.",
                "start_ms": 0,
                "end_ms": 100,
            },
            FakeChannel(),
        )
    )
    replacement = f.client.post(
        "/v1/voice/sessions", json=f.start_data(resume_session_id=identifier)
    )
    assert replacement.status_code == 200
    assert replacement.json()["id"] != identifier
    assert len(f.provider.creations) == 2
    resumed_text = f.provider.creations[1]["session"]["input"][0]["content"][0]["text"]
    assert resumed_text == "Keep the FLEX source question."
    listing = f.client.get("/v1/voice/sessions").json()["sessions"]
    assert {item["id"] for item in listing} == {identifier, replacement.json()["id"]}
    assert f.provider.hangups
    assert f.client.get(f"/v1/voice/sessions/{replacement.json()['id']}").json()["tasks"] == {}

"""Explicit private model context and approval-gated execution, without provider calls."""

import json
from contextlib import contextmanager
from dataclasses import replace
from hashlib import sha256

import pytest
from fastapi.testclient import TestClient
from nova_ember.api import jobs
from nova_ember.api.database import connect
from nova_ember.api.repository import Corpus
from nova_ember.api.research import create_research_router, verify_answer
from nova_ember.api.research_tools import PrivateEvidenceInput, ResearchTools
from nova_ember.api.scientific_toolbox import CodeProposal, ScientificToolbox
from nova_ember.api.source_acquisition import create_source_acquisition_router
from nova_ember.api.voice import resolve_voice_context
from nova_ember.contracts.research import ResearchAnswer, WorkspaceContext
from nova_ember.workers.__main__ import clean_sessions, run_once
from test_corpus_acquisition_api import selection
from test_corpus_uploads_api import ORIGINAL, finalize, prepare
from test_corpus_uploads_api import setup as setup

pytestmark = pytest.mark.integration


@pytest.fixture
def selected(setup):
    settings, snapshot, application = setup
    with TestClient(application) as client:
        item = prepare(client, snapshot).json()
        assert finalize(client, item).status_code == 200
        owner = sha256(client.cookies.get("nova_browser_receipt").encode()).hexdigest()
        context = WorkspaceContext.model_validate(
            {
                "context_version": "private-v1",
                "snapshot_id": snapshot,
                "selected_private_inputs": [
                    {
                        "upload_id": item["upload_id"],
                        "expected_sha256": item["sha256"],
                        "consent_to_model": True,
                    }
                ],
            }
        )
        yield settings, snapshot, application, client, item, owner, context
        client.delete(f"/v1/uploads/{item['upload_id']}")
        clean_sessions(settings)


@contextmanager
def active_parent(settings, snapshot, receipt):
    parent = jobs.create_job(
        settings.database_url,
        snapshot,
        kind="research",
        inputs={"offline_boundary_test": True},
        receipt=receipt,
    )
    with connect(settings.database_url) as connection:
        connection.execute(
            """UPDATE jobs SET status='running',attempt=1,lease_until=now()+interval '120 seconds'
               WHERE id=%s""",
            (parent["id"],),
        )
    try:
        yield {"id": parent["id"], "attempt": 1, "snapshot_id": snapshot}
    finally:
        jobs.delete_job(settings.database_url, parent["id"], receipt)


def test_private_original_inspection_and_summary_preserve_origin_and_exact_count(selected):
    settings, _snapshot, _app, _client, item, owner, context = selected
    tools = ResearchTools(Corpus(settings), context, receipt_sha256=owner)
    resolved = tools.resolve_context()
    assert resolved["selected_private_inputs"][0]["origin"] == "user_supplied_input"
    result = tools.inspect_private_input(PrivateEvidenceInput(upload_id=item["upload_id"]))
    assert result["origin"] == "user_supplied_input"
    assert result["content"]["rows"][0]["cells"] == ["A", "101.325"]
    assert result["content"]["total_source_records"] == 2
    assert result["content"]["independent_run_count"] is None
    assert result["content"]["units"] == "uninterpreted_source_labels"
    answer = ResearchAnswer.model_validate(
        {
            "title": "Selected input inspection",
            "contradictions": [],
            "next_actions": [],
            "limitations": [],
            "claims": [
                {
                    "statement": "The selected user file has 2 records.",
                    "origin": "user_input_summary",
                    "fact_ids": [result["id"]],
                    "limitations": [],
                },
                {
                    "statement": "NASA measured 101.325.",
                    "origin": "source_summary",
                    "fact_ids": [result["id"]],
                    "limitations": [],
                },
                {
                    "statement": "The uploaded file has 999 records.",
                    "origin": "user_input_summary",
                    "fact_ids": [result["id"]],
                    "limitations": [],
                },
            ],
        }
    )
    verified = verify_answer(answer, tools)
    assert len(verified["claims"]) == 1 and len(verified["withheld_claims"]) == 2
    assert verified["claims"][0]["interpretation_status"] == "user_supplied_original_summary"


def test_private_context_requires_owner_consent_expected_hash_and_selected_identifier(selected):
    settings, snapshot, _app, _client, item, owner, context = selected
    no_consent = context.model_copy(
        update={
            "selected_private_inputs": [
                context.selected_private_inputs[0].model_copy(update={"consent_to_model": False})
            ]
        }
    )
    with pytest.raises(ValueError, match="consent"):
        ResearchTools(Corpus(settings), no_consent, receipt_sha256=owner).resolve_context()
    with pytest.raises(jobs.JobNotFound):
        ResearchTools(Corpus(settings), context, receipt_sha256="f" * 64).resolve_context()
    with pytest.raises(ValueError, match="originating browser"):
        ResearchTools(Corpus(settings), context).resolve_context()
    wrong_hash = context.model_copy(
        update={
            "selected_private_inputs": [
                context.selected_private_inputs[0].model_copy(update={"expected_sha256": "e" * 64})
            ]
        }
    )
    with pytest.raises(ValueError, match="snapshot/hash"):
        ResearchTools(Corpus(settings), wrong_hash, receipt_sha256=owner).resolve_context()
    tools = ResearchTools(Corpus(settings), context, receipt_sha256=owner)
    with pytest.raises(ValueError, match="explicitly selected"):
        tools.inspect_private_input(
            PrivateEvidenceInput(upload_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        )
    assert context.snapshot_id == snapshot
    with connect(settings.database_url) as connection:
        connection.execute(
            "UPDATE private_uploads SET expires_at=now() WHERE id=%s", (item["upload_id"],)
        )
    with pytest.raises(jobs.JobNotFound):
        tools.resolve_context()


def test_research_preflight_carries_browser_scope_without_a_provider_call(selected, monkeypatch):
    settings, _snapshot, application, client, _item, _owner, context = selected
    application.include_router(create_research_router(replace(settings, openai_api_key="offline")))
    queued = []

    def queue(_database, snapshot, **kwargs):
        queued.append(kwargs)
        return {"id": "offline-operation", "snapshot_id": snapshot}

    monkeypatch.setattr(jobs, "create_job", queue)
    payload = {
        "question": "Inspect selected supplied records.",
        "context": context.model_dump(mode="json"),
        "expected_context_version": context.context_version,
    }
    response = client.post("/v1/research", json=payload)
    assert response.status_code == 202, response.json()
    assert len(queued) == 1
    with TestClient(application) as other:
        assert other.post("/v1/research", json=payload).status_code == 404
    assert len(queued) == 1


def test_voice_context_uses_same_private_owner_and_model_consent(selected):
    settings, _snapshot, _app, _client, _item, owner, context = selected
    resolve_voice_context(settings, context, [], receipt_sha256=owner)
    with pytest.raises(jobs.JobNotFound):
        resolve_voice_context(settings, context, [], receipt_sha256="f" * 64)
    with pytest.raises(ValueError, match="originating browser"):
        resolve_voice_context(settings, context, [])


def test_private_binary_document_uses_bounded_reader_and_keeps_user_supplied_origin(selected):
    settings, snapshot, _app, client, _item, owner, context = selected
    corpus = Corpus(settings)
    asset = next(
        item
        for item in corpus.snapshot(snapshot)["manifest"]["assets"]
        if item["file_name"].endswith("FLEX DoD.docx")
    )
    original = (settings.object_directory / asset["sha256"]).read_bytes()
    item = prepare(client, snapshot, original, file_name="selected-protocol.docx").json()
    assert finalize(client, item, original).status_code == 200
    try:
        context = WorkspaceContext.model_validate(
            {
                **context.model_dump(mode="json"),
                "selected_private_inputs": [
                    {
                        "upload_id": item["upload_id"],
                        "expected_sha256": item["sha256"],
                        "consent_to_model": True,
                    }
                ],
            }
        )
        result = ResearchTools(corpus, context, receipt_sha256=owner).inspect_private_input(
            PrivateEvidenceInput(upload_id=item["upload_id"], limit=1)
        )
        assert result["origin"] == "user_supplied_input"
        assert result["content"]["format"] == "docx_paragraph_text"
        assert result["content"]["paragraphs"][0]["paragraph"] == 1
        assert result["sources"][0]["sha256"] == asset["sha256"]
    finally:
        client.delete(f"/v1/uploads/{item['upload_id']}")


def test_research_code_freezes_private_inputs_and_waits_for_exact_approval(selected):
    settings, snapshot, _app, client, item, _owner, context = selected
    receipt = client.cookies.get("nova_browser_receipt")
    code = """import csv,json
from pathlib import Path
manifest=json.loads(Path('/inputs/input-manifest.json').read_text())
asset=next(item for item in manifest['assets'] if item.get('upload_id'))
with (Path('/inputs')/asset['input_name']).open(newline='') as stream:
    rows=list(csv.DictReader(stream))
print(json.dumps({'records':len(rows),'first':rows[0]['pressure_kPa']}))
"""
    proposal = CodeProposal(
        language="python",
        code=code,
        purpose="Inspect supplied records.",
        upload_ids=[item["upload_id"]],
    )
    with active_parent(settings, snapshot, receipt) as parent:
        toolbox = ScientificToolbox(Corpus(settings), context, parent)
        queued = toolbox.queue_execution(proposal)
        operation = queued["operation"]
        try:
            assert queued["status"] == "waiting_approval" and not queued["execution_started"]
            assert queued["frozen_inputs"][0]["sha256"] == sha256(ORIGINAL).hexdigest()
            assert toolbox.queue_execution(proposal)["operation"]["id"] == operation["id"]
            pending = jobs.read_job(settings.database_url, operation["id"], receipt)
            assert pending["status"] == "waiting_approval"
            jobs.approve_job(
                settings.database_url,
                operation["id"],
                receipt,
                pending["approval_revision"],
                pending["approval"]["inputs_sha256"],
            )
            assert run_once(settings, kinds=frozenset({"execute_code"}), maintenance=False)
            result = jobs.read_job(settings.database_url, operation["id"], receipt)
            assert result["status"] == "succeeded", result
            assert result["result"]["exit_code"] == 0, result["result"]
            assert json.loads(result["result"]["stdout"]) == {"records": 2, "first": "101.325"}
            with connect(settings.database_url) as connection:
                connection.execute("UPDATE jobs SET lease_until=now() WHERE id=%s", (parent["id"],))
            with pytest.raises(jobs.JobConflict, match="no longer active"):
                toolbox.queue_execution(proposal)
        finally:
            client.delete(f"/v1/execution/sessions/{queued['session_id']}")
            clean_sessions(settings)


def test_acquired_source_requires_explicit_context_and_preserves_original_byte_reference(selected):
    settings, snapshot, application, client, _item, owner, context = selected
    application.include_router(create_source_acquisition_router(settings))
    inputs = selection(Corpus(settings), snapshot, "PSI-69_Experimental table_FLEX.csv")
    created = client.post("/v1/source-acquisitions", json=inputs).json()
    assert run_once(settings, kinds=frozenset({"source_acquisition"}), maintenance=False)
    acquired = jobs.read_job(
        settings.database_url, created["id"], client.cookies.get("nova_browser_receipt")
    )
    assert acquired["status"] == "succeeded", acquired
    context = WorkspaceContext.model_validate(
        {
            **context.model_dump(mode="json"),
            "selected_private_inputs": [
                {
                    "source_job_id": created["id"],
                    "expected_sha256": acquired["result"]["sha256"],
                    "consent_to_model": True,
                    "text_encoding": "cp1252",
                }
            ],
        }
    )
    tools = ResearchTools(Corpus(settings), context, receipt_sha256=owner)
    result = tools.inspect_private_input(PrivateEvidenceInput(source_job_id=created["id"], limit=1))
    assert result["content"]["total_source_records"] == 274
    receipt = client.cookies.get("nova_browser_receipt")
    with active_parent(settings, snapshot, receipt) as parent:
        toolbox = ScientificToolbox(Corpus(settings), context, parent)
        proposal = CodeProposal(
            language="python",
            code="print('selected original')",
            purpose="Inspect exact source bytes.",
            source_job_ids=[created["id"]],
        )
        frozen = toolbox.code_proposal(proposal)["frozen_inputs"]
        assert frozen[0]["source_job_id"] == created["id"]
        assert frozen[0]["sha256"] == acquired["result"]["sha256"]
        with pytest.raises(ValueError, match="explicitly selected"):
            toolbox.code_proposal(
                proposal.model_copy(
                    update={"upload_ids": [context.selected_private_inputs[0].source_job_id]}
                )
            )

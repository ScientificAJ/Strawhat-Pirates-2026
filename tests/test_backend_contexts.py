"""Frozen scientific contexts and exact registration evidence, without provider calls."""

from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from nova_ember.api import jobs, model_registry, repository
from nova_ember.api.config import Settings
from nova_ember.api.methods import MethodCall, create_methods_router, method_source_snapshot
from nova_ember.api.model_registry import NonApplicabilityEvidence, resolve_registration_anchors
from nova_ember.api.research_tools import ResearchTools
from nova_ember.api.scientific_toolbox import ScientificToolbox, ScientificToolCall
from nova_ember.contracts.research import WorkspaceContext
from nova_ember.evidence.contracts import EvidenceAnchor
from nova_ember.modeling.regression import RegressionRequest
from test_backend_methods_api import trace_parameters
from test_model_regression import non_applicable_data

SNAPSHOT = "a" * 64
OTHER_SNAPSHOT = "b" * 64
SOURCE = "c" * 64


def context(snapshot):
    return {
        "input_origin": "synthetic_reference",
        "source_snapshot": snapshot,
        "sources": [{"source_id": "analytic-reference", "locator": "known-answer case"}],
    }


def anchor(snapshot=SNAPSHOT):
    return EvidenceAnchor(
        snapshot_id=snapshot,
        accession="PSI-25",
        investigation_version=1,
        source_sha256=SOURCE,
        kind="text_lines",
        source_row=2,
        line_end=2,
    )


def test_registered_job_uses_declared_older_snapshot_instead_of_latest(monkeypatch, tmp_path):
    selected = []

    class FrozenCorpus:
        def __init__(self, _settings):
            pass

        def snapshot(self, identifier=None):
            selected.append(identifier)
            return {"snapshot_id": identifier or OTHER_SNAPSHOT}

    def queue(_database, snapshot, **kwargs):
        assert kwargs["inputs"]["parameters"]["context"]["source_snapshot"] == SNAPSHOT
        return {"snapshot_id": snapshot, "status": "queued"}

    monkeypatch.setattr(repository, "Corpus", FrozenCorpus)
    monkeypatch.setattr(jobs, "create_job", queue)
    settings = Settings("not-a-database", tmp_path, tmp_path)
    app = FastAPI()
    app.include_router(create_methods_router(settings))
    parameters = trace_parameters(2.0)
    parameters["context"]["source_snapshot"] = SNAPSHOT
    response = TestClient(app).post(
        "/v1/methods/calculate", json={"method": "trace-fit", "parameters": parameters}
    )
    assert response.status_code == 202
    assert response.json()["snapshot_id"] == SNAPSHOT
    assert selected and all(value == SNAPSHOT for value in selected)


def comparison(first, second):
    return MethodCall(
        method="comparison",
        parameters={
            "profiles": [
                {"run_id": "first", "context": context(first)},
                {"run_id": "second", "context": context(second)},
            ]
        },
    )


def test_nested_comparison_profiles_cannot_mix_frozen_snapshots():
    with pytest.raises(ValueError, match="different frozen source snapshots"):
        method_source_snapshot(comparison(SNAPSHOT, OTHER_SNAPSHOT))
    assert method_source_snapshot(comparison(SNAPSHOT, SNAPSHOT)) == SNAPSHOT


@pytest.mark.parametrize(
    "name", ["compute_metric", "fit_model", "compare_runs", "check_applicability"]
)
def test_scientific_tool_rejects_inputs_from_another_workspace_snapshot(name):
    toolbox = ScientificToolbox(
        SimpleNamespace(), WorkspaceContext(context_version="test", snapshot_id=SNAPSHOT)
    )
    if name in {"compare_runs", "check_applicability"}:
        request = comparison(OTHER_SNAPSHOT, OTHER_SNAPSHOT)
    else:
        parameters = trace_parameters(2.0)
        parameters["context"]["source_snapshot"] = OTHER_SNAPSHOT
        request = MethodCall(method="trace-fit", parameters=parameters)
    with pytest.raises(ValueError, match="different frozen research context"):
        toolbox.dispatch(ScientificToolCall(name=name, parameters=request.model_dump(mode="json")))


def test_model_tool_rejects_a_registration_from_another_frozen_snapshot(monkeypatch):
    monkeypatch.setattr(
        model_registry, "model_card", lambda *_args: {"snapshot_id": OTHER_SNAPSHOT}
    )
    toolbox = ScientificToolbox(
        SimpleNamespace(settings=SimpleNamespace()),
        WorkspaceContext(context_version="test", snapshot_id=SNAPSHOT),
    )
    with pytest.raises(ValueError, match="different frozen source snapshot"):
        toolbox.dispatch(
            ScientificToolCall(
                name="predict",
                parameters={
                    "model_id": "d" * 64,
                    "predictor_value": 1.5,
                    "conditions": {},
                    "context": context(SNAPSHOT),
                },
            )
        )


def test_result_source_resolution_does_not_relabel_a_different_snapshot():
    tools = ResearchTools(
        SimpleNamespace(), WorkspaceContext(context_version="test", snapshot_id=SNAPSHOT)
    )
    with pytest.raises(ValueError, match="different frozen research context"):
        tools.retained_sources({"anchor": anchor(OTHER_SNAPSHOT).model_dump(mode="json")})
    with pytest.raises(ValueError, match="different frozen research context"):
        tools.retained_sources(
            {"sha256": SOURCE, "accession": "PSI-25", "snapshot_id": OTHER_SNAPSHOT}
        )
    with pytest.raises(ValueError, match="different frozen source snapshot"):
        ScientificToolbox(
            SimpleNamespace(),
            WorkspaceContext(context_version="test", snapshot_id=SNAPSHOT),
            {"snapshot_id": OTHER_SNAPSHOT},
        )


def registration_request():
    data = non_applicable_data()
    reference = {**data["context"]["sources"][0], "asset_sha256": SOURCE}
    data["context"] = {
        "input_origin": "measured",
        "source_snapshot": SNAPSHOT,
        "sources": [reference],
    }
    data["protocol"]["not_applicable_conditions"]["backing"]["source"] = reference
    return RegressionRequest.model_validate(data)


def test_registration_pins_the_actual_source_quote_and_labels_its_interpretation():
    request = registration_request()
    selected = anchor()
    discovery = SimpleNamespace(
        read_anchor=lambda _anchor: {"text": "The specimen has no backing."}
    )
    records = resolve_registration_anchors(
        request,
        [selected],
        discovery,
        {"backing": NonApplicabilityEvidence(anchor=selected, source_quote="no backing")},
    )
    recorded = records[0]["non_applicability"]["backing"]
    assert recorded["source_quote"] == "no backing"
    assert (
        recorded["justification"]
        == request.protocol.not_applicable_conditions["backing"].justification
    )
    assert recorded["interpretation_status"] == "maintainer_assertion"
    assert records[0]["source_sha256"] == SOURCE


@pytest.mark.parametrize("failure", ["missing", "wrong_quote", "wrong_anchor", "wrong_source"])
def test_registration_refuses_unresolved_non_applicability_evidence(failure):
    request = registration_request()
    selected = anchor()
    used_anchor = selected
    quote = "no backing"
    if failure == "wrong_quote":
        quote = "backing is irrelevant in Martian gravity"
    elif failure == "wrong_anchor":
        used_anchor = selected.model_copy(update={"source_row": 3, "line_end": 3})
    elif failure == "wrong_source":
        used_anchor = selected.model_copy(update={"source_sha256": "f" * 64})
    submitted = [used_anchor] if failure == "wrong_source" else [selected]
    evidence = (
        None
        if failure == "missing"
        else {"backing": NonApplicabilityEvidence(anchor=used_anchor, source_quote=quote)}
    )
    discovery = SimpleNamespace(
        read_anchor=lambda _anchor: {"text": "The specimen has no backing."}
    )
    with pytest.raises(ValueError, match="non-applicability|Non-applicability|non-applicable"):
        resolve_registration_anchors(request, submitted, discovery, evidence)

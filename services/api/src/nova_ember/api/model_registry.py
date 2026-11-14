"""Immutable model cards and maintainer-only registration of qualified source evidence."""

import json
from typing import Annotated

from fastapi import APIRouter
from nova_ember.contracts.research import Contract, Digest
from nova_ember.domain.scientific import MethodContext
from nova_ember.evidence.contracts import EvidenceAnchor
from nova_ember.modeling.regression import (
    RegressionCard,
    RegressionRequest,
    evaluate_regression,
    predict_regression,
)
from psycopg.types.json import Jsonb
from pydantic import Field

from .config import Settings
from .database import connect
from .discovery import Discovery
from .repository import Corpus, MissingSource


class PredictionInputs(Contract):
    predictor_value: Annotated[float, Field(strict=True, allow_inf_nan=False)]
    conditions: dict[str, str]
    context: MethodContext
    interval_level: Annotated[float, Field(gt=0, lt=1)] = 0.95


class NonApplicabilityEvidence(Contract):
    anchor: EvidenceAnchor
    source_quote: Annotated[str, Field(min_length=1, max_length=8000)]


def resolve_registration_anchors(
    request: RegressionRequest,
    anchors: list[EvidenceAnchor],
    discovery: Discovery,
    not_applicable_evidence: dict[str, NonApplicabilityEvidence] | None = None,
) -> list[dict]:
    """Bind an exemption to actual quoted source text, retaining its interpretation."""
    evidence = not_applicable_evidence or {}
    if set(evidence) != set(request.protocol.not_applicable_conditions):
        raise ValueError("Every non-applicable condition needs its exact quoted source anchor.")
    records = [anchor.model_dump(mode="json") for anchor in anchors]
    resolved = [discovery.read_anchor(anchor) for anchor in anchors]
    for field, exemption in request.protocol.not_applicable_conditions.items():
        selected = evidence[field]
        if selected.anchor not in anchors:
            raise ValueError("Non-applicability evidence must use a submitted registration anchor.")
        if selected.anchor.source_sha256 != exemption.source.asset_sha256:
            raise ValueError("Non-applicability evidence cites a different physical source.")
        index = anchors.index(selected.anchor)
        if (
            not selected.source_quote.strip()
            or selected.source_quote not in resolved[index]["text"]
        ):
            raise ValueError(
                "The non-applicability quote is absent from its resolved source anchor."
            )
        records[index].setdefault("non_applicability", {})[field] = {
            "source_quote": selected.source_quote,
            "justification": exemption.justification,
            "source_reference": exemption.source.model_dump(mode="json"),
            "interpretation_status": "maintainer_assertion",
            "limitation": (
                "The quote and locator were verified. Whether they justify exclusion for this "
                "endpoint and domain remains the maintainer's recorded scientific interpretation."
            ),
        }
    return records


def list_models(settings: Settings, snapshot_id: str | None = None) -> dict:
    snapshot = Corpus(settings).snapshot(snapshot_id)["snapshot_id"]
    with connect(settings.database_url) as connection:
        rows = connection.execute(
            (
                "SELECT id, method_id, status, created_at FROM model_registry"
                " WHERE snapshot_id = %s ORDER BY created_at, id"
            ),
            (snapshot,),
        ).fetchall()
    return {
        "snapshot_id": snapshot,
        "descriptive_methods": [
            {
                "id": "flame-front-speed",
                "method": "trace-fit",
                "target": "selected calibrated flame-front interval",
                "prediction": False,
            },
            {
                "id": "droplet-burning-rate",
                "method": "trace-fit",
                "target": "selected calibrated squared-diameter interval",
                "prediction": False,
            },
        ],
        "regressions": [{**row, "created_at": row["created_at"].isoformat()} for row in rows],
        "registration": "local_maintainer_only",
        "limitations": [
            "A descriptive within-run fit is not a validated run-level predictor.",
            (
                "No NASA predictive model is activated without independent "
                "held-out and source/domain evidence."
            ),
        ],
    }


def model_card(settings: Settings, identifier: str) -> dict:
    with connect(settings.database_url) as connection:
        row = connection.execute(
            "SELECT * FROM model_registry WHERE id = %s", (identifier,)
        ).fetchone()
    if not row:
        raise MissingSource("No released model matches this version identifier.")
    return {**row, "created_at": row["created_at"].isoformat()}


def predict(
    settings: Settings,
    identifier: str,
    inputs: PredictionInputs,
    *,
    expected_snapshot_id: str | None = None,
) -> dict:
    released = model_card(settings, identifier)
    if (expected_snapshot_id is not None and released["snapshot_id"] != expected_snapshot_id) or (
        inputs.context.source_snapshot is not None
        and inputs.context.source_snapshot != released["snapshot_id"]
    ):
        raise ValueError("The model or its inputs belong to a different frozen source snapshot.")
    card = RegressionCard.model_validate(released["card"])
    result = predict_regression(
        card,
        inputs.predictor_value,
        inputs.conditions,
        inputs.context,
        accepted_registration_id=identifier if released["status"] == "active" else None,
        interval_level=inputs.interval_level,
    )
    return {
        "model_id": identifier,
        "model_status": released["status"],
        "training_snapshot_id": released["snapshot_id"],
        **result.model_dump(mode="json"),
    }


def register_regression(
    settings: Settings,
    request: RegressionRequest,
    anchors: list[EvidenceAnchor],
    not_applicable_evidence: dict[str, NonApplicabilityEvidence] | None = None,
) -> str:
    """Local maintainer entry point; deliberately absent from public routes and model tools."""
    if request.context.input_origin != "measured" or not request.context.source_snapshot:
        raise ValueError(
            "Canonical registration requires measured source inputs in a frozen snapshot."
        )
    snapshot = Corpus(settings).snapshot(request.context.source_snapshot)["snapshot_id"]
    if not anchors or any(anchor.snapshot_id != snapshot for anchor in anchors):
        raise ValueError("Registration requires exact evidence anchors from its frozen snapshot.")
    discovery = Discovery(Corpus(settings))
    registration_anchors = resolve_registration_anchors(
        request, anchors, discovery, not_applicable_evidence
    )
    cited_hashes = {
        source.asset_sha256 for source in request.context.sources if source.asset_sha256
    }
    anchored_hashes = {anchor.source_sha256 for anchor in anchors}
    if not cited_hashes or not cited_hashes <= anchored_hashes:
        raise ValueError("Every source input must have a resolved physical evidence anchor.")
    result = evaluate_regression(request)
    if not isinstance(result, RegressionCard) or result.status != "eligible_for_registration":
        raise ValueError(
            "The candidate does not satisfy the independent evaluation and domain requirements."
        )
    identifier = result.card_sha256
    with connect(settings.database_url) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(701423)")
        active = connection.execute(
            "SELECT id FROM model_registry WHERE status = 'active' AND id <> %s", (identifier,)
        ).fetchone()
        if active:
            raise ValueError(
                "Only one predefined regression may be active; retire the"
                " existing version explicitly."
            )
        connection.execute(
            (
                "INSERT INTO model_registry (id, snapshot_id, method_id, "
                "model_kind, status, card, source_anchors) VALUES (%s, %s, "
                "%s, 'single_predictor_regression', 'active', %s, %s) ON "
                "CONFLICT(id) DO NOTHING"
            ),
            (
                identifier,
                snapshot,
                result.method_id,
                Jsonb(result.model_dump(mode="json")),
                Jsonb(registration_anchors),
            ),
        )
    return identifier


def create_model_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/v1/models", tags=["models"])

    @router.get("")
    def models(snapshot_id: Digest | None = None):
        return list_models(settings, snapshot_id)

    @router.get("/{identifier}")
    def card(identifier: Digest):
        return model_card(settings, identifier)

    @router.post("/{identifier}/predict")
    def prediction(identifier: Digest, inputs: PredictionInputs):
        return predict(settings, identifier, inputs)

    @router.post("/{identifier}/domain-check")
    def domain(identifier: Digest, inputs: PredictionInputs):
        result = predict(settings, identifier, inputs)
        return {key: value for key, value in result.items() if key not in {"value", "interval"}}

    return router


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Register a source-qualified local model card.")
    parser.add_argument("request", type=Path)
    parser.add_argument("anchors", type=Path)
    parser.add_argument(
        "--not-applicable-evidence",
        type=Path,
        help="JSON map from each excluded condition to its exact EvidenceAnchor and source_quote.",
    )
    arguments = parser.parse_args()
    print(
        register_regression(
            Settings.from_environment(),
            RegressionRequest.model_validate_json(arguments.request.read_text()),
            [
                EvidenceAnchor.model_validate(item)
                for item in json.loads(arguments.anchors.read_text())
            ],
            {
                name: NonApplicabilityEvidence.model_validate(item)
                for name, item in json.loads(arguments.not_applicable_evidence.read_text()).items()
            }
            if arguments.not_applicable_evidence is not None
            else None,
        )
    )

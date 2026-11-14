"""Registered scientific methods; no caller-selected Python, SQL or model registry."""

from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, Response
from nova_ember.analysis.applicability import (
    ComparisonRequest,
    RankingRequest,
    compare_profiles,
    rank_candidates,
    scenario_presets,
)
from nova_ember.analysis.derived import (
    DimensionlessRequest,
    OxygenConsumptionRequest,
    OxygenDensityRequest,
    dimensionless_number,
    oxygen_consumption_heat_release,
    oxygen_molar_density,
)
from nova_ember.analysis.events import (
    DetectorMetricsRequest,
    DetectorTimingRequest,
    EventTimingRequest,
    detector_metrics,
    detector_timing,
    event_timing,
)
from nova_ember.analysis.fits import TraceFitRequest, fit_trace
from nova_ember.analysis.media import PixelTraceRequest, calibrate_pixel_trace
from nova_ember.analysis.uncertainty import (
    InformationGainRequest,
    LinearUncertaintyRequest,
    MonteCarloRequest,
    expected_information_gain,
    propagate_linear,
    propagate_monte_carlo,
)
from nova_ember.contracts.research import Contract
from nova_ember.domain.scientific import MethodContext
from nova_ember.modeling.regression import RegressionRequest, evaluate_regression
from pydantic import BaseModel, Field

from .config import Settings
from .media_analysis import MediaImageInput, calculate_media_image


@dataclass(frozen=True)
class Method:
    title: str
    inputs: Any
    calculate: Any


METHODS = {
    "image-roi": Method(
        "Calibrated image region measurement", MediaImageInput, calculate_media_image
    ),
    "pixel-trace": Method("Calibrated pixel/frame trace", PixelTraceRequest, calibrate_pixel_trace),
    "trace-fit": Method(
        "Calibrated flame-front or squared-diameter fit", TraceFitRequest, fit_trace
    ),
    "oxygen-density": Method(
        "Ideal-gas oxygen molar density", OxygenDensityRequest, oxygen_molar_density
    ),
    "dimensionless": Method(
        "Defined dimensionless transport quantity", DimensionlessRequest, dimensionless_number
    ),
    "oxygen-consumption": Method(
        "Oxygen-consumption heat-release estimate",
        OxygenConsumptionRequest,
        oxygen_consumption_heat_release,
    ),
    "event-timing": Method(
        "Protocol-defined event and censoring timing", EventTimingRequest, event_timing
    ),
    "detector-timing": Method(
        "Aligned protocol-defined detector timing", DetectorTimingRequest, detector_timing
    ),
    "detector-metrics": Method(
        "Detector performance from labeled independent trials",
        DetectorMetricsRequest,
        detector_metrics,
    ),
    "linear-uncertainty": Method(
        "First-order covariance propagation", LinearUncertaintyRequest, propagate_linear
    ),
    "monte-carlo": Method(
        "Seeded uncertainty propagation", MonteCarloRequest, propagate_monte_carlo
    ),
    "information-gain": Method(
        "Expected information gain under a supplied probability model",
        InformationGainRequest,
        expected_information_gain,
    ),
    "comparison": Method(
        "Question-specific condition comparability", ComparisonRequest, compare_profiles
    ),
    "ranking": Method(
        "Separate relevance and applicability policies", RankingRequest, rank_candidates
    ),
    "regression-evaluation": Method(
        "Prespecified single-predictor grouped evaluation", RegressionRequest, evaluate_regression
    ),
}


class MethodCall(Contract):
    method: str = Field(max_length=64)
    parameters: dict


def method_catalog() -> dict:
    return {
        "methods": [
            {"id": name, "title": method.title, "schema": method.inputs.model_json_schema()}
            for name, method in METHODS.items()
        ],
        "prediction_registration": "maintainer_only",
        "limitations": [
            (
                "A valid calculation does not validate the supplied "
                "calibration, measurements or experimental assumptions."
            )
        ],
    }


def implementation_hash() -> str:
    root = Path(__file__).resolve().parents[5]
    digest = sha256()
    for wrapper in ("methods.py", "fit_child.py", "media_analysis.py"):
        digest.update(Path(__file__).with_name(wrapper).read_bytes())
    digest.update((root / "uv.lock").read_bytes())
    for package in ("analysis", "modeling", "domain"):
        directory = root / "packages" / package / "src"
        for source in sorted(directory.rglob("*.py")):
            digest.update(str(source.relative_to(root)).encode())
            digest.update(source.read_bytes())
    return digest.hexdigest()


def run_method(inputs: MethodCall) -> dict:
    method = METHODS.get(inputs.method)
    if method is None:
        raise ValueError("No registered scientific method matches this identifier.")
    request = method.inputs.model_validate(inputs.parameters)
    result = method.calculate(request)
    return result.model_dump(mode="json") if hasattr(result, "model_dump") else result


def method_source_snapshot(inputs: MethodCall) -> str | None:
    """Find only typed scientific contexts, including nested comparison profiles."""
    method = METHODS.get(inputs.method)
    if method is None:
        raise ValueError("No registered scientific method matches this identifier.")
    snapshots: set[str] = set()

    def collect(value):
        if isinstance(value, MethodContext):
            if value.source_snapshot is not None:
                snapshots.add(value.source_snapshot)
        elif isinstance(value, BaseModel):
            for name in type(value).model_fields:
                collect(getattr(value, name))
        elif isinstance(value, (list, tuple)):
            for child in value:
                collect(child)
        elif isinstance(value, dict):
            for child in value.values():
                collect(child)

    collect(method.inputs.model_validate(inputs.parameters))
    if len(snapshots) > 1:
        raise ValueError("Scientific inputs belong to different frozen source snapshots.")
    return next(iter(snapshots), None)


def execute_analysis_job(settings: Settings, job: dict) -> dict:
    from .trusted_analysis import execute_analysis_job as execute

    return execute(settings, job)


def create_methods_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["scientific methods"])

    @router.get("/methods")
    def methods():
        return method_catalog()

    @router.post("/methods/calculate")
    def calculate(inputs: MethodCall, request: Request, response: Response):
        from .repository import Corpus

        source_snapshot = method_source_snapshot(inputs)
        if source_snapshot is not None:
            Corpus(settings).snapshot(source_snapshot)
        if inputs.method in {
            "trace-fit",
            "regression-evaluation",
            "monte-carlo",
            "image-roi",
            "pixel-trace",
        }:
            import secrets

            from . import jobs

            receipt = request.cookies.get("nova_browser_receipt") or secrets.token_urlsafe(32)
            snapshot = Corpus(settings).snapshot(source_snapshot)["snapshot_id"]
            result = jobs.create_job(
                settings.database_url,
                snapshot,
                kind="registered_analysis",
                inputs=inputs.model_dump(mode="json"),
                receipt=receipt,
                idempotency_key=request.headers.get("Idempotency-Key"),
            )
            response.status_code = 202
            response.set_cookie(
                "nova_browser_receipt",
                receipt,
                httponly=True,
                secure=request.url.scheme == "https",
                samesite="strict",
                max_age=86400,
            )
            response.headers["Cache-Control"] = "no-store"
            return result
        return run_method(inputs)

    @router.get("/scenarios/presets")
    def presets():
        return {"presets": scenario_presets()}

    return router

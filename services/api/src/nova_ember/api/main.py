"""Versioned local research API; all computations use recorded scientific inputs."""

import json
from typing import Annotated, Literal
from uuid import UUID

import psycopg
from fastapi import FastAPI, Header, HTTPException, Query, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.analysis.oxygen import oxygen_partial_pressure
from nova_ember.domain.records import RowKind
from pydantic import BaseModel, ConfigDict, Field, field_validator

from . import jobs
from .artifacts import remove_artifact_files
from .config import Settings
from .database import connect
from .discovery import create_discovery_router
from .media_analysis import create_media_analysis_router
from .methods import create_methods_router
from .model_registry import create_model_router
from .model_usage import ProviderBudgetExceeded
from .public_mcp import create_mcp_router
from .records import CohortInputs, RecordPage, freeze_selection, record_page
from .repository import AmbiguousSource, Corpus, MissingSource
from .research import create_research_router
from .science import compare_investigations, flex_endpoints
from .semantic import create_semantic_router
from .source_acquisition import create_source_acquisition_router
from .source_files import bass_calibration, flex_trace, source_text, source_workbook
from .uploads import create_upload_router
from .voice import create_voice_router
from .workflows import create_workflow_router

FiniteNumber = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Accession = Annotated[str, Field(pattern=r"^PSI-[1-9][0-9]{0,5}$")]
Digest = Annotated[str, Field(pattern=r"^[0-9a-f]{64}$")]


class OxygenInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    oxygen_percent: Annotated[FiniteNumber, Field(ge=0, le=100)]
    absolute_pressure: Annotated[FiniteNumber, Field(gt=0)]
    pressure_unit: Literal["Pa", "kPa", "bar", "psia"]
    fraction_basis: Literal["mole", "volume"]


class ComparisonInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    investigation_ids: Annotated[list[Accession], Field(min_length=2, max_length=8)]

    @field_validator("investigation_ids")
    @classmethod
    def distinct_ids(cls, values: list[str]) -> list[str]:
        if len(set(values)) != len(values):
            raise ValueError("Select distinct investigation identifiers.")
        return values


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_environment()
    corpus = Corpus(settings)
    application = FastAPI(title="Nova Ember scientific API", version="0.1.0")
    application.include_router(create_discovery_router(corpus))
    application.include_router(create_methods_router(settings))
    application.include_router(create_media_analysis_router(settings))
    application.include_router(create_model_router(settings))
    application.include_router(create_research_router(settings))
    application.include_router(create_semantic_router(settings))
    application.include_router(create_source_acquisition_router(settings))
    application.include_router(create_upload_router(settings))
    application.include_router(create_workflow_router(settings))
    application.include_router(create_mcp_router(settings))
    application.include_router(create_voice_router(settings))

    @application.exception_handler(AmbiguousSource)
    async def ambiguous_source(_request, error):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @application.exception_handler(jobs.JobConflict)
    async def workflow_conflict(_request, error):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @application.exception_handler(ProviderBudgetExceeded)
    async def provider_budget_unavailable(_request, _error):
        return JSONResponse(
            status_code=429,
            content={
                "detail": (
                    "The configured model budget is unavailable. Direct "
                    "scientific tools remain available."
                )
            },
        )

    @application.exception_handler(MissingSource)
    @application.exception_handler(jobs.JobNotFound)
    async def missing_source(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @application.exception_handler(psycopg.Error)
    async def database_unavailable(_request, _error):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "The local scientific database is unavailable. "
                "Retained inputs are unchanged."
            },
        )

    @application.exception_handler(FileNotFoundError)
    async def source_unavailable(_request, _error):
        return JSONResponse(
            status_code=503,
            content={
                "detail": "A retained source file is unavailable; no replacement was inferred."
            },
        )

    @application.exception_handler(ValueError)
    async def failed_source_check(_request, _error):
        return JSONResponse(
            status_code=409,
            content={"detail": "Source integrity or scientific input checks failed."},
        )

    @application.exception_handler(RequestValidationError)
    async def invalid_input(_request, error):
        # Omit input bodies and exception context; they can contain private user content.
        issues = [
            {"location": list(item["loc"]), "message": item["msg"]} for item in error.errors()
        ]
        return JSONResponse(
            status_code=422, content={"detail": "Invalid request inputs.", "issues": issues}
        )

    @application.middleware("http")
    async def response_policy(request, call_next):
        origin = request.headers.get("origin")
        own_origin = str(request.base_url).rstrip("/")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin:
            if origin not in {settings.web_origin, own_origin}:
                return JSONResponse(status_code=403, content={"detail": "Origin is not permitted."})
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        if request.method != "GET" or request.url.path.startswith(
            (
                "/v1/jobs",
                "/v1/workflows",
                "/v1/execution",
                "/v1/research",
                "/v1/voice",
                "/v1/uploads",
                "/v1/source-acquisitions",
            )
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    @application.get("/v1/health")
    def health():
        from nova_ember.workers.execution import execution_capability

        with connect(settings.database_url) as connection:
            version_row = connection.execute("SHOW server_version_num").fetchone()
            assert version_row is not None
            version = version_row["server_version_num"]
            extensions = connection.execute(
                "SELECT extname FROM pg_extension WHERE extname = 'vector'"
            ).fetchall()
        return {
            "status": "ok",
            "database": "postgresql",
            "postgresql_version": version,
            "pgvector": bool(extensions),
            "openai": "configured" if settings.openai_api_key else "not_configured",
            "hosting": "local_only",
            "interactive_execution": execution_capability(),
        }

    @application.get("/v1/snapshots/current")
    def current_snapshot():
        return {key: value for key, value in corpus.snapshot().items() if key != "manifest"}

    @application.get("/v1/snapshots/{snapshot_id}")
    def frozen_snapshot(snapshot_id: Digest):
        return {
            key: value for key, value in corpus.snapshot(snapshot_id).items() if key != "manifest"
        }

    @application.get("/v1/investigations")
    def list_investigations(
        q: Annotated[str, Query(max_length=200)] = "",
        limit: Annotated[int, Query(ge=1, le=100)] = 50,
        offset: Annotated[int, Query(ge=0, le=10000)] = 0,
        snapshot_id: Digest | None = None,
    ):
        return corpus.investigations(q.strip(), limit, offset, snapshot_id)

    @application.get("/v1/investigations/{accession}")
    def get_investigation(accession: Accession, snapshot_id: Digest | None = None):
        return corpus.investigation(accession, snapshot_id)

    @application.get("/v1/assets/{digest}/table")
    def table(
        digest: Digest,
        limit: Annotated[int, Query(ge=1, le=250)] = 50,
        offset: Annotated[int, Query(ge=0, le=100000)] = 0,
        snapshot_id: Digest | None = None,
    ):
        asset = corpus.asset(digest, snapshot_id)
        if not asset["file_name"].lower().endswith(".csv") or not asset["encoding"]:
            raise HTTPException(415, "This retained asset has no reviewed CSV reader.")
        parsed = parse_csv_bytes(corpus.asset_bytes(asset), asset["encoding"])
        return {
            "asset": asset,
            "headers": parsed.headers,
            "rows": [
                {"row_number": row.row_number, "line_end": row.line_end, "cells": row.cells}
                for row in parsed.rows[offset : offset + limit]
            ],
            "total_rows": len(parsed.rows),
            "encoding": parsed.encoding,
            "caveats": [
                "Raw source cells are preserved. Rows are not necessarily independent trials.",
                "Original headers and unit ambiguities have not been silently normalized.",
            ],
            "limit": limit,
            "offset": offset,
        }

    @application.get(
        "/v1/assets/{digest}/raw",
        response_class=Response,
        responses={
            200: {
                "content": {
                    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
                }
            }
        },
    )
    def download_asset(
        digest: Digest,
        snapshot_id: Digest | None = None,
        accession: Accession | None = None,
        asset_id: Annotated[str | None, Query(max_length=768)] = None,
    ):
        asset = corpus.asset(digest, snapshot_id, accession=accession, asset_id=asset_id)
        if asset["license"] != "CC0-1.0":
            raise HTTPException(403, "Redistribution rights for the original bytes are unresolved.")
        return Response(
            content=corpus.asset_bytes(asset),
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{digest}.bin"'},
        )

    @application.get("/v1/assets/{digest}/records", response_model=RecordPage)
    def scientific_records(
        digest: Digest,
        snapshot_id: Digest | None = None,
        row_kind: RowKind | None = None,
        limit: Annotated[int, Query(ge=1, le=250)] = 30,
        offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    ):
        return record_page(corpus, digest, snapshot_id, row_kind, limit, offset)

    @application.post("/v1/cohorts/resolve")
    def resolve_cohort(inputs: CohortInputs):
        return freeze_selection(corpus, inputs)

    @application.get("/v1/assets/{digest}/workbook")
    def workbook(
        digest: Digest,
        snapshot_id: Digest | None = None,
        sheet: Annotated[str | None, Query(max_length=128)] = None,
        limit: Annotated[int, Query(ge=1, le=250)] = 50,
        offset: Annotated[int, Query(ge=0, le=200000)] = 0,
    ):
        return source_workbook(corpus, digest, snapshot_id, sheet, limit, offset)

    @application.get("/v1/assets/{digest}/text")
    def text_source(
        digest: Digest,
        snapshot_id: Digest | None = None,
        limit: Annotated[int, Query(ge=1, le=250)] = 100,
        offset: Annotated[int, Query(ge=0, le=200000)] = 0,
    ):
        return source_text(corpus, digest, snapshot_id, limit, offset)

    @application.get("/v1/analyses/bass-calibration")
    def bass_calibration_evidence(
        snapshot_id: Digest | None = None,
        investigator: Annotated[str | None, Query(max_length=128)] = None,
        test_number: Annotated[str | None, Query(max_length=64)] = None,
    ):
        if (investigator is None) != (test_number is None):
            raise HTTPException(422, "Select both the investigator and test number.")
        return bass_calibration(corpus, snapshot_id, investigator, test_number)

    @application.get("/v1/analyses/flex-007-source")
    def flex_trace_evidence(snapshot_id: Digest | None = None):
        return flex_trace(corpus, snapshot_id)

    @application.get("/v1/analyses/flex-endpoints")
    def flex_analysis(snapshot_id: Digest | None = None):
        return flex_endpoints(corpus, snapshot_id)

    @application.get("/v1/exports/flex-endpoints")
    def flex_export(snapshot_id: Digest | None = None):
        return JSONResponse(
            content=flex_endpoints(corpus, snapshot_id),
            headers={"Content-Disposition": 'attachment; filename="flex-test-end-labels.json"'},
        )

    @application.post("/v1/calculations/oxygen-partial-pressure")
    def partial_pressure(inputs: OxygenInputs):
        return oxygen_partial_pressure(**inputs.model_dump())

    @application.post("/v1/comparisons")
    def compare(inputs: ComparisonInputs):
        return compare_investigations(corpus, inputs.investigation_ids)

    @application.post("/v1/jobs", status_code=202)
    def create_export():
        return jobs.create_job(settings.database_url, corpus.snapshot()["snapshot_id"])

    @application.get("/v1/jobs/{job_id}")
    def get_job(job_id: UUID, x_job_receipt: Annotated[str | None, Header()] = None):
        return jobs.read_job(settings.database_url, job_id, x_job_receipt)

    @application.post("/v1/jobs/{job_id}/cancel")
    def cancel(job_id: UUID, x_job_receipt: Annotated[str | None, Header()] = None):
        return jobs.cancel_job(settings.database_url, job_id, x_job_receipt)

    @application.delete("/v1/jobs/{job_id}", status_code=204)
    def remove(job_id: UUID, x_job_receipt: Annotated[str | None, Header()] = None):
        jobs.delete_job(settings.database_url, job_id, x_job_receipt)
        remove_artifact_files(settings.object_directory, str(job_id))
        return Response(status_code=204)

    @application.get(
        "/v1/jobs/{job_id}/events",
        response_class=StreamingResponse,
        responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
    )
    def events(
        job_id: UUID,
        x_job_receipt: Annotated[str | None, Header()] = None,
        last_event_id: Annotated[int | None, Header(ge=0)] = None,
        after: Annotated[int, Query(ge=0)] = 0,
    ):
        cursor = after if last_event_id is None else last_event_id
        stored = jobs.read_events(settings.database_url, job_id, x_job_receipt, cursor)
        payload = "".join(
            f"id: {event['sequence']}\nevent: {event['event_type']}\ndata: {json.dumps(event)}\n\n"
            for event in stored
        )
        # The stream is a bounded replay. The client reconnects using Last-Event-ID.
        return StreamingResponse(
            iter([payload or ": no new events\n\n"]), media_type="text/event-stream"
        )

    return application


app = create_app()

"""Public scientific artifact validation and browser-owned temporary operations."""

from __future__ import annotations

import json
import secrets
from hashlib import sha256
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Header, HTTPException, Request, Response
from fastapi.responses import StreamingResponse
from psycopg.types.json import Jsonb
from pydantic import Field, model_validator

from . import jobs
from .artifacts import (
    AggregateQuery,
    ChartSpec,
    Contract,
    DashboardSelection,
    DashboardSpec,
    Digest,
    MethodChartSpec,
    QuerySpec,
    aggregate_query,
    apply_dashboard_selection,
    execute_query,
    read_artifact,
    remove_artifact_files,
    validate_chart,
    validate_dashboard,
)
from .config import Settings
from .database import connect
from .exporting import CaseExport
from .repository import Corpus

COOKIE = "nova_browser_receipt"


class ApprovalInputs(Contract):
    expected_revision: Annotated[int, Field(ge=0)]
    inputs_sha256: Digest


class DashboardValidation(Contract):
    dashboard: DashboardSpec
    expected_revision: Annotated[int | None, Field(ge=1)] = None


class ExportInputs(Contract):
    selection: CaseExport
    confirmed_selected_private_data: bool = False


class ExecutionSessionInputs(Contract):
    snapshot_id: Digest
    asset_sha256: list[Digest] = Field(default_factory=list, max_length=10)
    source_job_ids: list[UUID] = Field(default_factory=list, max_length=10)
    upload_ids: list[UUID] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def distinct_frozen_inputs(self):
        if (
            len(set(self.asset_sha256)) != len(self.asset_sha256)
            or len(set(self.source_job_ids)) != len(self.source_job_ids)
            or len(set(self.upload_ids)) != len(self.upload_ids)
        ):
            raise ValueError("Execution source selections must be distinct.")
        if len(self.asset_sha256) + len(self.source_job_ids) + len(self.upload_ids) > 10:
            raise ValueError("An execution session accepts at most ten selected source files.")
        return self


class ExecutionCommand(Contract):
    language: Literal["python", "shell"]
    code: Annotated[str, Field(min_length=1, max_length=32000)]
    profile: Literal["standard", "extended"] = "standard"
    confirmed_extended_runtime: bool = False
    seed: Annotated[int | None, Field(ge=0, le=2**32 - 1)] = None


def browser_receipt(request: Request, explicit: str | None = None) -> str | None:
    return explicit or request.cookies.get(COOKIE)


def require_same_origin(request: Request, settings: Settings) -> None:
    origin = request.headers.get("origin")
    if origin is not None and origin != settings.web_origin:
        raise HTTPException(403, "This private operation requires the application origin.")


def remember_receipt(request: Request, response: Response) -> str:
    receipt = request.cookies.get(COOKIE) or secrets.token_urlsafe(32)
    response.set_cookie(
        COOKIE,
        receipt,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        max_age=86400,
        path="/",
    )
    return receipt


def session_record(
    database_url: str, session_id: UUID | str, receipt: str | None, *, require_open: bool = True
) -> dict:
    with connect(database_url) as connection:
        row = connection.execute(
            """SELECT *, expires_at > now() AND deadline > now() AND status = 'open' AS active
               FROM execution_sessions WHERE id = %s AND receipt_sha256 = %s FOR UPDATE""",
            (str(session_id), sha256((receipt or "").encode()).hexdigest()),
        ).fetchone()
    if not row or (require_open and not row["active"]):
        raise jobs.JobNotFound("This execution session is absent, closed or expired.")
    return row


def create_workflow_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    corpus = Corpus(settings)

    @router.post("/v1/queries")
    def query_dataset(inputs: QuerySpec):
        return execute_query(corpus, inputs)

    @router.post("/v1/queries/aggregate")
    def aggregate_dataset(inputs: AggregateQuery):
        return aggregate_query(corpus, inputs)

    @router.post("/v1/charts/validate")
    def chart(inputs: ChartSpec):
        return validate_chart(corpus, inputs)

    @router.post("/v1/charts/method")
    def method_chart(inputs: MethodChartSpec, request: Request, response: Response):
        from .charting import resolve_method_chart

        response.headers["Cache-Control"] = "no-store"
        return resolve_method_chart(
            settings.database_url,
            inputs,
            sha256((browser_receipt(request) or "").encode()).hexdigest(),
        )

    def resolve_private_component(component, request):
        receipt = browser_receipt(request)
        if component.method_chart is not None:
            from .charting import resolve_method_chart

            return resolve_method_chart(
                settings.database_url,
                component.method_chart,
                sha256((receipt or "").encode()).hexdigest(),
            )
        if component.job_id is not None:
            item = jobs.read_job(settings.database_url, component.job_id, receipt)
            if item["status"] != "succeeded":
                return {
                    "snapshot_id": item["snapshot_id"],
                    "status": "incomplete"
                    if item.get("partial_result") is not None
                    else "unavailable",
                    "result": item.get("partial_result"),
                    "reason": component.empty_state,
                }
            return {
                "snapshot_id": item["snapshot_id"],
                "result": item["result"],
                "status": "complete",
                "origin": "temporary_job_result",
            }
        record, data = read_artifact(
            settings.database_url,
            settings.object_directory,
            str(component.artifact_job_id),
            str(component.artifact_id),
            receipt,
        )
        if record["media_type"] != "application/json":
            raise ValueError("A dashboard data component requires a typed JSON artifact.")
        return {
            "snapshot_id": record["provenance"].get("snapshot_id"),
            "result": json.loads(data),
            "provenance": record["provenance"],
            "status": "complete" if record["publication_status"] == "complete" else "incomplete",
        }

    @router.post("/v1/dashboards/validate")
    def dashboard(inputs: DashboardValidation, request: Request):
        return validate_dashboard(
            corpus,
            inputs.dashboard,
            inputs.expected_revision,
            lambda component: resolve_private_component(component, request),
        )

    @router.post("/v1/dashboards/select")
    def select_dashboard(inputs: DashboardSelection, request: Request):
        return apply_dashboard_selection(
            corpus, inputs, lambda component: resolve_private_component(component, request)
        )

    @router.post("/v1/exports", status_code=202)
    def export_case(
        inputs: ExportInputs,
        request: Request,
        response: Response,
        idempotency_key: Annotated[str | None, Header(max_length=128)] = None,
    ):
        require_same_origin(request, settings)
        corpus.snapshot(inputs.selection.snapshot_id)
        receipt = remember_receipt(request, response)
        return jobs.create_job(
            settings.database_url,
            inputs.selection.snapshot_id,
            kind="export_case",
            inputs=inputs.selection.model_dump(mode="json"),
            receipt=receipt,
            idempotency_key=idempotency_key,
            approval_required=not inputs.confirmed_selected_private_data,
        )

    @router.get("/v1/workflows/{job_id}")
    def read_workflow(
        job_id: UUID, request: Request, x_job_receipt: Annotated[str | None, Header()] = None
    ):
        return jobs.read_job(settings.database_url, job_id, browser_receipt(request, x_job_receipt))

    @router.get(
        "/v1/workflows/{job_id}/events",
        response_class=StreamingResponse,
        responses={200: {"content": {"text/event-stream": {"schema": {"type": "string"}}}}},
    )
    def workflow_events(
        job_id: UUID,
        request: Request,
        x_job_receipt: Annotated[str | None, Header()] = None,
        last_event_id: Annotated[int | None, Header(ge=0)] = None,
        after: int = 0,
    ):
        events = jobs.read_events(
            settings.database_url,
            job_id,
            browser_receipt(request, x_job_receipt),
            last_event_id if last_event_id is not None else max(0, after),
        )
        payload = "".join(
            f"id: {event['sequence']}\nevent: {event['event_type']}\ndata: {json.dumps(event)}\n\n"
            for event in events
        )
        return StreamingResponse(
            iter([payload or ": no new events\n\n"]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store"},
        )

    @router.post("/v1/workflows/{job_id}/approve")
    def approve(
        job_id: UUID,
        inputs: ApprovalInputs,
        request: Request,
        x_job_receipt: Annotated[str | None, Header()] = None,
    ):
        require_same_origin(request, settings)
        return jobs.approve_job(
            settings.database_url,
            job_id,
            browser_receipt(request, x_job_receipt),
            inputs.expected_revision,
            inputs.inputs_sha256,
        )

    @router.post("/v1/workflows/{job_id}/cancel")
    def cancel(
        job_id: UUID, request: Request, x_job_receipt: Annotated[str | None, Header()] = None
    ):
        require_same_origin(request, settings)
        return jobs.cancel_job(
            settings.database_url, job_id, browser_receipt(request, x_job_receipt)
        )

    @router.delete("/v1/workflows/{job_id}", status_code=204)
    def remove(
        job_id: UUID, request: Request, x_job_receipt: Annotated[str | None, Header()] = None
    ):
        require_same_origin(request, settings)
        jobs.delete_job(settings.database_url, job_id, browser_receipt(request, x_job_receipt))
        remove_artifact_files(settings.object_directory, str(job_id))
        return Response(status_code=204)

    @router.get(
        "/v1/workflows/{job_id}/artifacts/{artifact_id}",
        response_class=Response,
        responses={
            200: {
                "content": {
                    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
                }
            }
        },
    )
    def download(
        job_id: UUID,
        artifact_id: UUID,
        request: Request,
        x_job_receipt: Annotated[str | None, Header()] = None,
    ):
        record, data = read_artifact(
            settings.database_url,
            settings.object_directory,
            str(job_id),
            str(artifact_id),
            browser_receipt(request, x_job_receipt),
        )
        name = (
            record["file_name"]
            if record["publication_status"] == "complete"
            else "incomplete-" + record["file_name"]
        )
        return Response(
            data,
            media_type=record["media_type"],
            headers={
                "Content-Disposition": f'attachment; filename="{name}"',
                "X-Research-Result-Status": record["publication_status"],
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Security-Policy": "sandbox; default-src 'none'",
            },
        )

    @router.get("/v1/workflows/{job_id}/artifacts/{artifact_id}/metadata")
    def artifact_metadata(
        job_id: UUID,
        artifact_id: UUID,
        request: Request,
        x_job_receipt: Annotated[str | None, Header()] = None,
    ):
        record, _ = read_artifact(
            settings.database_url,
            settings.object_directory,
            str(job_id),
            str(artifact_id),
            browser_receipt(request, x_job_receipt),
        )
        return {key: value for key, value in record.items() if key != "created_at"}

    @router.get("/v1/execution/capability")
    def execution_status():
        from nova_ember.workers.execution import execution_capability

        return execution_capability()

    @router.post("/v1/execution/sessions", status_code=201)
    def new_execution(inputs: ExecutionSessionInputs, request: Request, response: Response):
        from nova_ember.workers.execution import execution_capability

        require_same_origin(request, settings)
        capability = execution_capability()
        if not capability["available"]:
            raise HTTPException(503, capability)
        corpus.snapshot(inputs.snapshot_id)
        assets = [corpus.asset(digest, inputs.snapshot_id) for digest in inputs.asset_sha256]
        receipt = remember_receipt(request, response)
        acquired = []
        if inputs.source_job_ids:
            from .source_acquisition import acquired_execution_references

            acquired = acquired_execution_references(
                settings,
                inputs.snapshot_id,
                [str(identifier) for identifier in inputs.source_job_ids],
                sha256(receipt.encode()).hexdigest(),
            )
        uploaded = []
        if inputs.upload_ids:
            from .uploads import private_upload_execution_references

            uploaded = private_upload_execution_references(
                settings,
                inputs.snapshot_id,
                [str(identifier) for identifier in inputs.upload_ids],
                sha256(receipt.encode()).hexdigest(),
            )
        if (
            sum(asset["byte_size"] for asset in assets)
            + sum(ref["byte_size"] for ref in [*acquired, *uploaded])
            > 8 * 1024 * 1024
        ):
            raise ValueError("Selected frozen execution inputs exceed eight MiB.")
        session_id = str(uuid4())
        with connect(settings.database_url) as connection:
            connection.execute("SELECT pg_advisory_xact_lock(701420)")
            existing = connection.execute(
                """SELECT id FROM execution_sessions WHERE terminated_at IS NULL LIMIT 1"""
            ).fetchone()
            if existing:
                raise HTTPException(
                    409, "The single analysis session is occupied; close it or wait for expiry."
                )
            row = connection.execute(
                """INSERT INTO execution_sessions (id, receipt_sha256, snapshot_id, input_assets)
                   VALUES (%s, %s, %s, %s) RETURNING expires_at, deadline""",
                (
                    session_id,
                    sha256(receipt.encode()).hexdigest(),
                    inputs.snapshot_id,
                    Jsonb([*inputs.asset_sha256, *acquired, *uploaded]),
                ),
            ).fetchone()
        assert row is not None
        return {
            "id": session_id,
            "snapshot_id": inputs.snapshot_id,
            "asset_sha256": inputs.asset_sha256,
            "source_job_ids": [str(identifier) for identifier in inputs.source_job_ids],
            "upload_ids": [str(identifier) for identifier in inputs.upload_ids],
            "expires_at": row["expires_at"].isoformat(),
            "deadline": row["deadline"].isoformat(),
            "capability": capability,
        }

    @router.post("/v1/execution/sessions/{session_id}/commands", status_code=202)
    def execute(
        session_id: UUID,
        inputs: ExecutionCommand,
        request: Request,
        idempotency_key: Annotated[str | None, Header(max_length=128)] = None,
    ):
        require_same_origin(request, settings)
        receipt = browser_receipt(request)
        session = session_record(settings.database_url, session_id, receipt)
        # Source selection is fixed by the browser's session creation, never an arbitrary mount.
        payload = {**inputs.model_dump(), "session_id": str(session_id)}
        return jobs.create_job(
            settings.database_url,
            session["snapshot_id"],
            kind="execute_code",
            inputs=payload,
            receipt=receipt,
            idempotency_key=idempotency_key,
            approval_required=inputs.profile == "extended"
            and not inputs.confirmed_extended_runtime,
        )

    @router.get("/v1/execution/sessions/{session_id}")
    def inspect_session(session_id: UUID, request: Request):
        row = session_record(
            settings.database_url, session_id, browser_receipt(request), require_open=False
        )
        return {
            "id": str(row["id"]),
            "status": row["status"],
            "active": row["active"],
            "expires_at": row["expires_at"].isoformat(),
            "deadline": row["deadline"].isoformat(),
            "cumulative_seconds": row["cumulative_seconds"],
            "cell_count": row["cell_count"],
            "terminated_at": row["terminated_at"].isoformat() if row["terminated_at"] else None,
            "termination_reason": row["termination_reason"],
            "snapshot_id": row["snapshot_id"],
            "input_assets": row["input_assets"],
        }

    @router.post("/v1/execution/sessions/{session_id}/renew")
    def renew(session_id: UUID, request: Request):
        require_same_origin(request, settings)
        session_record(settings.database_url, session_id, browser_receipt(request))
        with connect(settings.database_url) as connection:
            row = connection.execute(
                """UPDATE execution_sessions
                   SET expires_at = LEAST(now() + interval '5 minutes', deadline)
                   WHERE id = %s RETURNING expires_at, deadline""",
                (str(session_id),),
            ).fetchone()
        assert row is not None
        return {
            "expires_at": row["expires_at"].isoformat(),
            "deadline": row["deadline"].isoformat(),
        }

    @router.delete("/v1/execution/sessions/{session_id}", status_code=204)
    def close_session(session_id: UUID, request: Request):
        require_same_origin(request, settings)
        session_record(
            settings.database_url, session_id, browser_receipt(request), require_open=False
        )
        with connect(settings.database_url) as connection:
            connection.execute(
                "UPDATE execution_sessions SET status = 'closed' WHERE id = %s", (str(session_id),)
            )
            pending = connection.execute(
                """UPDATE jobs SET status = 'canceled', lease_until = NULL, updated_at = now()
                   WHERE kind = 'execute_code' AND inputs->>'session_id' = %s
                   AND status IN ('queued', 'running', 'waiting_approval') RETURNING id, attempt""",
                (str(session_id),),
            ).fetchall()
            for item in pending:
                jobs.append_event(connection, str(item["id"]), item["attempt"], "canceled")
        return Response(status_code=204)

    return router

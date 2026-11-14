"""Stateless read-only MCP over the same public scientific functions as the API."""

import json
from collections.abc import Callable
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .artifacts import Digest, QuerySpec, execute_query
from .config import Settings
from .discovery import Discovery, EvidenceAnchor, EvidenceSearch, InvestigationQuery, RecordQuery
from .methods import method_catalog
from .repository import Corpus, MissingSource
from .science import flex_endpoints

PROTOCOL_VERSION = "2025-11-25"


class SearchInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(default="", max_length=200)
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=10000)
    snapshot_id: Digest | None = None


class InvestigationInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    accession: Annotated[str, Field(pattern=r"^PSI-[1-9][0-9]{0,5}$")]
    snapshot_id: Digest | None = None


class SnapshotInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")
    snapshot_id: Digest | None = None


class EmptyInputs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RpcMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    jsonrpc: Literal["2.0"]
    id: int | str | None = None
    method: str = Field(max_length=128)
    params: dict = Field(default_factory=dict)


def create_mcp_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    corpus = Corpus(settings)
    discovery = Discovery(corpus)
    tools: dict[str, tuple[type[BaseModel], Callable[[dict], dict]]] = {
        "search_investigations": (SearchInputs, lambda value: corpus.investigations(**value)),
        "get_investigation": (InvestigationInputs, lambda value: corpus.investigation(**value)),
        "get_snapshot": (SnapshotInputs, lambda value: corpus.snapshot(**value)),
        "query_dataset": (
            QuerySpec,
            lambda value: execute_query(corpus, QuerySpec.model_validate(value)),
        ),
        "flex_endpoints": (SnapshotInputs, lambda value: flex_endpoints(corpus, **value)),
        "query_investigations": (
            InvestigationQuery,
            lambda value: discovery.query_investigations(InvestigationQuery.model_validate(value)),
        ),
        "query_records": (
            RecordQuery,
            lambda value: discovery.query_records(RecordQuery.model_validate(value)),
        ),
        "search_evidence": (
            EvidenceSearch,
            lambda value: discovery.search_evidence(EvidenceSearch.model_validate(value)),
        ),
        "read_evidence": (
            EvidenceAnchor,
            lambda value: discovery.read_anchor(EvidenceAnchor.model_validate(value)),
        ),
        "evidence_coverage": (SnapshotInputs, lambda value: discovery.coverage(**value)),
        "hardware_lineage": (SnapshotInputs, lambda value: discovery.lineage(**value)),
        "list_methods": (EmptyInputs, lambda _value: method_catalog()),
    }

    def origin_allowed(request: Request) -> bool:
        origin = request.headers.get("origin")
        return origin is None or origin == settings.web_origin

    @router.get("/mcp")
    def no_unsolicited_stream(request: Request):
        if not origin_allowed(request):
            return Response(status_code=403)
        return Response(status_code=405, headers={"Allow": "POST"})

    @router.post("/mcp")
    async def message(request: Request):
        if not origin_allowed(request):
            return Response(status_code=403)
        if "application/json" not in request.headers.get("content-type", ""):
            return Response(status_code=415)
        body = await request.body()
        if len(body) > 65536:
            return Response(status_code=413)
        try:
            incoming = RpcMessage.model_validate_json(body)
        except ValidationError:
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32600, "message": "Invalid bounded JSON-RPC request."},
                },
                status_code=400,
            )
        if incoming.id is None:
            return Response(status_code=202)
        response: dict[str, Any] = {"jsonrpc": "2.0", "id": incoming.id}
        method = incoming.method
        if method == "initialize":
            response["result"] = {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "nova-ember-research", "version": "0.1.0"},
                "instructions": (
                    "Public frozen research evidence only. No private jobs or write operations."
                ),
            }
        elif method == "ping":
            response["result"] = {}
        elif method == "tools/list":
            response["result"] = {
                "tools": [
                    {
                        "name": name,
                        "description": f"Read public scientific data: {name}.",
                        "inputSchema": contract.model_json_schema(),
                        "annotations": {
                            "readOnlyHint": True,
                            "destructiveHint": False,
                            "idempotentHint": True,
                            "openWorldHint": False,
                        },
                    }
                    for name, (contract, _) in tools.items()
                ]
            }
        elif method == "tools/call":
            name = incoming.params.get("name")
            arguments = incoming.params.get("arguments", {})
            if name not in tools:
                response["error"] = {
                    "code": -32602,
                    "message": "No read-only research tool has this name.",
                }
            else:
                contract, function = tools[name]
                try:
                    parsed = contract.model_validate(arguments)
                    result = jsonable_encoder(function(parsed.model_dump()))
                except (ValidationError, ValueError, MissingSource):
                    response["result"] = {
                        "content": [
                            {
                                "type": "text",
                                "text": "The public query or frozen source is unavailable.",
                            }
                        ],
                        "isError": True,
                    }
                else:
                    response["result"] = {
                        "content": [{"type": "text", "text": json.dumps(result)}],
                        "structuredContent": result,
                        "isError": False,
                    }
        else:
            response["error"] = {
                "code": -32601,
                "message": "Method not available on this read-only surface.",
            }
        return JSONResponse(response, headers={"Cache-Control": "no-store"})

    return router

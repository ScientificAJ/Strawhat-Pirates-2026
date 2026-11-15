"""Snapshot-bound semantic discovery using the existing PostgreSQL vector index."""

import json
import math
from decimal import Decimal
from hashlib import sha256
from typing import Literal

from fastapi import APIRouter, HTTPException
from nova_ember.contracts.research import Contract, Digest
from nova_ember.domain.identifiers import InvestigationId
from openai import APIError, OpenAI
from psycopg.types.json import Jsonb
from pydantic import Field

from .config import Settings
from .database import connect
from .model_usage import ProviderBudgetExceeded, reserve_usage, settle_usage
from .repository import Corpus
from .semantic_passages import (
    MAX_EMBEDDED_DOCUMENTS,
    PROFILE,
    build_projection,
    embedding_documents,
    projection_text,
)

EMBEDDING_MODEL = "text-embedding-3-large"
DIMENSIONS = 1536
EMBEDDING_RATE = Decimal("0.13") / 1_000_000


class SemanticQuery(Contract):
    query: str = Field(min_length=1, max_length=1000)
    snapshot_id: Digest
    accessions: list[InvestigationId] = Field(default_factory=list, max_length=24)
    source_sha256: list[Digest] = Field(default_factory=list, max_length=64)
    source_kinds: list[Literal["psi", "ntrs", "nasa"]] = Field(default_factory=list, max_length=3)
    document_kinds: list[Literal["investigation_metadata", "source_passage"]] = Field(
        default_factory=list, max_length=2
    )
    limit: int = Field(default=12, ge=1, le=24)


def vector_literal(values: list[float]) -> str:
    if len(values) != DIMENSIONS or not all(math.isfinite(value) for value in values):
        raise ValueError("The provider returned an invalid embedding vector.")
    if not any(value != 0 for value in values):
        raise ValueError("An empty embedding has no defined cosine similarity.")
    return json.dumps(values, separators=(",", ":"), allow_nan=False)


def embedding_text(record: dict) -> str:
    return projection_text(record)


def embed_texts(settings: Settings, texts: list[str]) -> tuple[list[list[float]], dict]:
    if not settings.openai_api_key:
        raise ValueError("OpenAI embeddings are not configured; exact search remains available.")
    if not texts or len(texts) > 24 or any(len(text) > 12000 for text in texts):
        raise ValueError("Embedding inputs exceed the bounded projection size.")
    upper = sum(len(text.encode()) + 128 for text in texts)
    reservation = reserve_usage(settings, Decimal(upper) * EMBEDDING_RATE)
    try:
        with OpenAI(api_key=settings.openai_api_key, max_retries=0, timeout=30) as client:
            result = client.embeddings.create(
                model=EMBEDDING_MODEL, dimensions=DIMENSIONS, input=texts, encoding_format="float"
            )
        vectors = [item.embedding for item in sorted(result.data, key=lambda item: item.index)]
        if len(vectors) != len(texts):
            raise ValueError("The embedding response is incomplete.")
        for vector in vectors:
            vector_literal(vector)
    except BaseException:
        settle_usage(settings, reservation, None)
        raise
    cost = Decimal(result.usage.total_tokens) * EMBEDDING_RATE
    settle_usage(settings, reservation, cost)
    return vectors, {
        "model": result.model,
        "dimensions": DIMENSIONS,
        "input_tokens": result.usage.total_tokens,
        "cost_usd": str(cost),
    }


def index_snapshot(settings: Settings, snapshot_id: str) -> dict:
    snapshot = Corpus(settings).snapshot(snapshot_id)
    documents, coverage = build_projection(Corpus(settings), snapshot)
    documents = [
        {**item, "content_sha256": sha256(item["search_text"].encode()).hexdigest()}
        for item in documents
    ]
    selected = embedding_documents(documents, MAX_EMBEDDED_DOCUMENTS)
    wanted = {(item["source_id"], item["content_sha256"]) for item in selected}
    with connect(settings.database_url) as connection:
        cached = connection.execute(
            """SELECT DISTINCT ON(source_id, content_sha256) source_id, content_sha256,
            embedding::text AS vector FROM semantic_documents WHERE model = %s
            AND source_id = ANY(%s) AND embedding IS NOT NULL
            ORDER BY source_id, content_sha256, created_at DESC""",
            (EMBEDDING_MODEL, [item["source_id"] for item in selected]),
        ).fetchall()
    vectors = {
        row["source_id"]: row["vector"]
        for row in cached
        if (row["source_id"], row["content_sha256"]) in wanted
    }
    reused = len(vectors)
    pending = [item for item in selected if item["source_id"] not in vectors]
    tokens, cost = 0, Decimal(0)
    for start in range(0, len(pending), 24):
        batch = pending[start : start + 24]
        embedded, usage = embed_texts(settings, [item["search_text"] for item in batch])
        tokens += usage["input_tokens"]
        cost += Decimal(usage["cost_usd"])
        for item, vector in zip(batch, embedded, strict=True):
            vectors[item["source_id"]] = vector_literal(vector)
    digest = sha256(
        json.dumps(documents, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    # Publish text, vectors and coverage atomically; a failed embedding preserves the old view.
    with connect(settings.database_url) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(701425)")
        connection.execute(
            """DELETE FROM semantic_documents WHERE snapshot_id = %s AND model = %s
            AND NOT(source_id = ANY(%s))""",
            (snapshot_id, EMBEDDING_MODEL, [item["source_id"] for item in documents]),
        )
        for item in documents:
            connection.execute(
                """INSERT INTO semantic_documents(snapshot_id, source_id, content_sha256,
                model, dimensions, embedding, projection)
                VALUES (%s, %s, %s, %s, %s, %s::vector, %s)
                ON CONFLICT(snapshot_id, source_id, model) DO UPDATE SET
                content_sha256 = EXCLUDED.content_sha256, embedding = EXCLUDED.embedding,
                projection = EXCLUDED.projection, created_at = now()""",
                (
                    snapshot_id,
                    item["source_id"],
                    item["content_sha256"],
                    EMBEDDING_MODEL,
                    DIMENSIONS,
                    vectors.get(item["source_id"]),
                    Jsonb(item),
                ),
            )
        connection.execute(
            """INSERT INTO semantic_projection_status(snapshot_id, model, projection_sha256,
            document_count, embedded_count, coverage) VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT(snapshot_id, model) DO UPDATE SET
            projection_sha256 = EXCLUDED.projection_sha256,
            document_count = EXCLUDED.document_count, embedded_count = EXCLUDED.embedded_count,
            coverage = EXCLUDED.coverage, completed_at = now()""",
            (snapshot_id, EMBEDDING_MODEL, digest, len(documents), len(vectors), Jsonb(coverage)),
        )
    return {
        "snapshot_id": snapshot_id,
        "indexed": len(documents),
        "embedded_documents": len(vectors),
        "lexical_only_documents": len(documents) - len(vectors),
        "new_embeddings": len(pending),
        "reused_embeddings": reused,
        "coverage": coverage,
        "usage": {"input_tokens": tokens, "cost_usd": str(cost)},
    }


def semantic_search(settings: Settings, query: SemanticQuery) -> dict:
    corpus = Corpus(settings)
    snapshot = corpus.snapshot(query.snapshot_id)
    valid_ids = {item["accession"] for item in snapshot["manifest"]["investigations"]}
    if not set(query.accessions) <= valid_ids:
        raise ValueError("A structured accession filter is outside this snapshot.")
    with connect(settings.database_url) as connection:
        status = connection.execute(
            """SELECT * FROM semantic_projection_status WHERE snapshot_id = %s AND model = %s""",
            (query.snapshot_id, EMBEDDING_MODEL),
        ).fetchone()
    if not status or status["coverage"].get("profile") != PROFILE:
        raise HTTPException(
            409,
            "This snapshot's semantic projection is not complete; exact search remains available.",
        )
    vector, semantic_status = None, "not_configured"
    usage = {"input_tokens": 0, "cost_usd": "0"}
    if settings.openai_api_key:
        try:
            vectors, usage = embed_texts(settings, [query.query])
            vector, semantic_status = vector_literal(vectors[0]), "available"
        except APIError:
            semantic_status = "provider_unavailable"
            usage = {
                "input_tokens": None,
                "cost_usd": None,
                "status": "uncertain_provider_completion",
            }
        except ProviderBudgetExceeded:
            semantic_status = "budget_exhausted"
    with connect(settings.database_url) as connection:
        rows = connection.execute(
            """WITH candidates AS (SELECT d.source_id, d.content_sha256, d.projection,
            COALESCE(d.projection->'accessions'->>0, 'NTRS:' || d.source_id) AS accession_order,
            CASE WHEN d.embedding IS NOT NULL THEN 1 - (d.embedding <=> %s::vector)
                END AS semantic_similarity,
            ts_rank_cd(d.lexical_document, websearch_to_tsquery('simple', %s)) AS lexical_rank
            FROM semantic_documents d WHERE d.snapshot_id = %s AND d.model = %s
            AND (%s OR (d.projection->'accessions') ?| %s::text[])
            AND (%s OR d.projection->>'source_sha256' = ANY(%s::text[]))
            AND (%s OR d.projection->>'source_kind' = ANY(%s::text[]))
            AND (%s OR d.projection->>'kind' = ANY(%s::text[]))),
            ranked AS (SELECT *,
                CASE WHEN semantic_similarity IS NOT NULL THEN row_number() OVER
                    (ORDER BY semantic_similarity DESC NULLS LAST, accession_order, source_id)
                    END AS semantic_rank,
                CASE WHEN lexical_rank > 0 THEN row_number() OVER
                    (ORDER BY lexical_rank DESC, accession_order, source_id) END AS lexical_position
                FROM candidates)
            SELECT *, COALESCE(1.0::float8 / (60 + semantic_rank), 0) +
                COALESCE(1.0::float8 / (60 + lexical_position), 0) AS fusion_score
            FROM ranked WHERE semantic_rank IS NOT NULL OR lexical_position IS NOT NULL
            ORDER BY fusion_score DESC, accession_order, source_id ASC LIMIT %s""",
            (
                vector,
                query.query,
                query.snapshot_id,
                EMBEDDING_MODEL,
                not query.accessions,
                query.accessions,
                not query.source_sha256,
                query.source_sha256,
                not query.source_kinds,
                query.source_kinds,
                not query.document_kinds,
                query.document_kinds,
                query.limit,
            ),
        ).fetchall()
    return {
        "snapshot_id": query.snapshot_id,
        "method": "hybrid-discovery-rrf-v1",
        "fusion": {"constant": 60, "tie_break": "accession_then_stable_source_id_ascending"},
        "model": EMBEDDING_MODEL,
        "dimensions": DIMENSIONS,
        "semantic_status": semantic_status,
        "usage": usage,
        "coverage": {
            **status["coverage"],
            "documents": status["document_count"],
            "embedded_documents": status["embedded_count"],
            "projection_sha256": status["projection_sha256"],
            "completed_at": status["completed_at"].isoformat(),
        },
        "results": [
            {
                "source_id": row["source_id"],
                "accession": (row["projection"]["accessions"] or [None])[0],
                "title": row["projection"]["title"],
                "kind": row["projection"]["kind"],
                "source_kind": row["projection"]["source_kind"],
                "source_origin": row["projection"].get("source_origin"),
                "data_status": row["projection"].get("data_status"),
                "research_status": row["projection"].get("research_status"),
                "origin": "source_metadata"
                if row["projection"]["kind"] == "investigation_metadata"
                else "source_text",
                "text": row["projection"]["text"][:1000],
                "anchors": row["projection"]["anchors"],
                "semantic_similarity": row["semantic_similarity"],
                "lexical_rank": row["lexical_rank"],
                "semantic_position": row["semantic_rank"],
                "lexical_position": row["lexical_position"],
                "fusion_score": row["fusion_score"],
                "projection_sha256": row["content_sha256"],
            }
            for row in rows
        ],
        "limitations": [
            (
                "Semantic similarity supports discovery; it is not "
                "applicability, evidence quality, measurement accuracy or a "
                "safety probability."
            ),
            "Exact structured filters are applied before result ordering.",
        ],
    }


def create_semantic_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["semantic discovery"])

    @router.post("/search/semantic")
    def search(query: SemanticQuery):
        try:
            return semantic_search(settings, query)
        except APIError:
            raise HTTPException(
                503, "Semantic inference is unavailable; exact source search remains available."
            ) from None

    return router


if __name__ == "__main__":
    settings = Settings.from_environment()
    print(json.dumps(index_snapshot(settings, Corpus(settings).snapshot()["snapshot_id"])))

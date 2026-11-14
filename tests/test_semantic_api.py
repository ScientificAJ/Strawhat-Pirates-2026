"""Real pgvector fusion and frozen passages; embeddings are explicit offline fixtures."""

import os
from dataclasses import replace
from hashlib import sha256
from types import SimpleNamespace

import httpx
import pytest
from nova_ember.api import semantic, semantic_passages
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.discovery import Discovery
from nova_ember.api.repository import Corpus
from nova_ember.api.seed import insert_snapshot, seed
from nova_ember.evidence.contracts import EvidenceAnchor
from openai import APIConnectionError


@pytest.fixture(scope="module")
def stored_sources(tmp_path_factory):
    database = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database:
        pytest.skip("A separate PostgreSQL test database is required.")
    original = Settings.from_environment()
    if database == original.database_url:
        raise RuntimeError("Semantic tests cannot write the application database.")
    settings = replace(
        original,
        database_url=database,
        object_directory=tmp_path_factory.mktemp("semantic-objects"),
        openai_api_key="offline-fixture-not-a-provider-key",
    )
    current = seed(settings)
    corpus = Corpus(settings)
    manifest = corpus.snapshot(current)["manifest"]
    identifiers = []
    with connect(database) as connection:
        for name in ("old-passages", "rrf-reference"):
            identifier = sha256((current + name).encode()).hexdigest()
            clone = {**manifest, "parent_snapshot_id": current, "synthetic_test_scope": name}
            insert_snapshot(connection, clone, identifier)
            identifiers.append(identifier)
    yield settings, identifiers
    with connect(database) as connection:
        for identifier in identifiers:
            connection.execute(
                "DELETE FROM semantic_projection_status WHERE snapshot_id=%s", (identifier,)
            )
            connection.execute("DELETE FROM semantic_documents WHERE snapshot_id=%s", (identifier,))


def offline_vectors(_settings, texts):
    explicit = {
        "lexical fixture needle": [0.0, 1.0],
        "semantic fixture other": [1.0, 0.0],
        "both fixture needle needle": [0.8, 0.6],
        "tie-one needle": [1.0, 0.0],
        "tie-two needle needle": [0.8, 0.6],
        "needle": [1.0, 0.0],
    }
    return [explicit.get(text, [1.0, 1.0]) + [0.0] * 1534 for text in texts], {
        "input_tokens": 0,
        "cost_usd": "0",
        "fixture": "synthetic uncharged embedding vectors",
    }


@pytest.mark.integration
def test_real_retained_passages_keep_readable_older_snapshot_anchors(stored_sources, monkeypatch):
    settings, (older, _rrf) = stored_sources
    monkeypatch.setattr(semantic, "embed_texts", offline_vectors)
    monkeypatch.setattr(semantic_passages, "MAX_PASSAGES_PER_SOURCE", 2)
    monkeypatch.setattr(semantic, "MAX_EMBEDDED_DOCUMENTS", 64)
    indexed = semantic.index_snapshot(settings, older)
    assert indexed["indexed"] > 24
    assert indexed["coverage"]["limits"]["passages_per_source"] == 2
    assert any(source["status"] == "bounded_passages" for source in indexed["coverage"]["sources"])
    with connect(settings.database_url) as connection:
        documents = connection.execute(
            "SELECT projection FROM semantic_documents WHERE snapshot_id=%s "
            "AND projection->>'kind'='source_passage'",
            (older,),
        ).fetchall()
    reader = Discovery(Corpus(settings))
    observed = set()
    for row in documents:
        projection = row["projection"]
        anchor = EvidenceAnchor.model_validate(projection["anchors"][0])
        if anchor.kind in observed:
            continue
        actual = reader.read_anchor(anchor)
        assert anchor.snapshot_id == older
        assert actual["text"] == projection["text"]
        assert anchor.source_sha256 == projection["source_sha256"]
        observed.add(anchor.kind)
    assert {
        "table_cell",
        "text_lines",
        "workbook_cell",
        "document_page",
        "document_paragraph",
    } <= observed


def reference_documents(snapshot):
    documents = []
    for identifier, accession, text, source in [
        ("lexical", "PSI-69", "lexical fixture needle", "1"),
        ("semantic", "PSI-25", "semantic fixture other", "2"),
        ("both", "PSI-69", "both fixture needle needle", "3"),
        ("tie-one", "PSI-69", "tie-one needle", "4"),
        ("tie-two", "PSI-25", "tie-two needle needle", "4"),
        ("fallback", "PSI-25", "unembedded fixture needle", "5"),
    ]:
        documents.append(
            {
                "source_id": "synthetic-rrf:" + identifier,
                "kind": "source_passage",
                "source_kind": "psi",
                "accessions": [accession],
                "title": "Synthetic ranking reference only",
                "text": text,
                "search_text": text,
                "source_sha256": source * 64,
                "anchors": [],
            }
        )
    return documents, {
        "profile": semantic_passages.PROFILE,
        "sources": [],
        "scope": "Synthetic RRF implementation reference, not NASA evidence.",
    }


@pytest.fixture
def ranked_projection(stored_sources, monkeypatch):
    settings, (_older, snapshot) = stored_sources
    monkeypatch.setattr(
        semantic, "build_projection", lambda _corpus, selected: reference_documents(selected)
    )
    monkeypatch.setattr(semantic, "embed_texts", offline_vectors)
    monkeypatch.setattr(semantic, "MAX_EMBEDDED_DOCUMENTS", 5)
    semantic.index_snapshot(settings, snapshot)
    return settings, snapshot


@pytest.mark.integration
def test_known_rrf_positions_and_reciprocals_use_both_rankings(ranked_projection):
    settings, snapshot = ranked_projection
    result = semantic.semantic_search(
        settings,
        semantic.SemanticQuery(
            snapshot_id=snapshot, query="needle", source_sha256=[digit * 64 for digit in "123"]
        ),
    )
    assert [hit["source_id"] for hit in result["results"]] == [
        "synthetic-rrf:both",
        "synthetic-rrf:lexical",
        "synthetic-rrf:semantic",
    ]
    both, lexical, only_semantic = result["results"]
    assert (both["semantic_position"], both["lexical_position"]) == (2, 1)
    assert both["fusion_score"] == pytest.approx(1 / 62 + 1 / 61)
    assert lexical["fusion_score"] == pytest.approx(1 / 63 + 1 / 62)
    assert only_semantic["fusion_score"] == pytest.approx(1 / 61)


@pytest.mark.integration
def test_filters_precede_fusion_and_equal_fusion_uses_accession_tie_break(ranked_projection):
    settings, snapshot = ranked_projection
    query = semantic.SemanticQuery(snapshot_id=snapshot, query="needle", source_sha256=["4" * 64])
    ties = semantic.semantic_search(settings, query)["results"]
    assert [hit["accession"] for hit in ties] == ["PSI-25", "PSI-69"]
    assert ties[0]["fusion_score"] == ties[1]["fusion_score"]
    selected = semantic.semantic_search(
        settings, query.model_copy(update={"accessions": ["PSI-69"]})
    )
    hit = selected["results"][0]
    assert len(selected["results"]) == 1
    assert (hit["semantic_position"], hit["lexical_position"]) == (1, 1)
    assert hit["fusion_score"] == pytest.approx(2 / 61)
    none = semantic.semantic_search(settings, query.model_copy(update={"source_kinds": ["ntrs"]}))
    assert not none["results"]


@pytest.mark.integration
def test_unembedded_passages_remain_lexical_and_no_key_makes_no_embedding_call(
    ranked_projection, monkeypatch
):
    settings, snapshot = ranked_projection
    query = semantic.SemanticQuery(snapshot_id=snapshot, query="needle", source_sha256=["5" * 64])
    result = semantic.semantic_search(settings, query)
    assert result["results"][0]["semantic_position"] is None
    assert result["results"][0]["lexical_position"] == 1
    assert result["coverage"]["embedded_documents"] == 5
    monkeypatch.setattr(
        semantic, "embed_texts", lambda *_args: pytest.fail("Provider must not be called")
    )
    result = semantic.semantic_search(replace(settings, openai_api_key=None), query)
    assert result["semantic_status"] == "not_configured"
    assert result["results"][0]["source_id"] == "synthetic-rrf:fallback"
    assert result["usage"]["cost_usd"] == "0"


@pytest.mark.integration
def test_unchanged_projection_reuses_vectors_and_failed_reindex_preserves_old_view(
    ranked_projection, monkeypatch
):
    settings, snapshot = ranked_projection
    monkeypatch.setattr(
        semantic, "embed_texts", lambda *_args: pytest.fail("Unchanged content must reuse vectors")
    )
    unchanged = semantic.index_snapshot(settings, snapshot)
    assert unchanged["new_embeddings"] == 0
    assert unchanged["reused_embeddings"] == 5
    with connect(settings.database_url) as connection:
        before = connection.execute(
            "SELECT projection_sha256 FROM semantic_projection_status WHERE snapshot_id=%s",
            (snapshot,),
        ).fetchone()
    documents, coverage = reference_documents(snapshot)
    documents[0]["search_text"] = "changed synthetic reference"
    monkeypatch.setattr(semantic, "build_projection", lambda *_args: (documents, coverage))
    with pytest.raises(pytest.fail.Exception, match="Unchanged content"):
        semantic.index_snapshot(settings, snapshot)
    with connect(settings.database_url) as connection:
        after = connection.execute(
            "SELECT projection_sha256 FROM semantic_projection_status WHERE snapshot_id=%s",
            (snapshot,),
        ).fetchone()
    assert before == after


@pytest.mark.integration
def test_provider_failure_preserves_lexical_results_and_does_not_claim_zero_cost(
    ranked_projection, monkeypatch
):
    settings, snapshot = ranked_projection

    def unavailable(*_args):
        raise APIConnectionError(request=httpx.Request("POST", "https://example.invalid"))

    monkeypatch.setattr(semantic, "embed_texts", unavailable)
    result = semantic.semantic_search(
        settings,
        semantic.SemanticQuery(snapshot_id=snapshot, query="needle", source_sha256=["5" * 64]),
    )
    assert result["results"][0]["source_id"] == "synthetic-rrf:fallback"
    assert result["semantic_status"] == "provider_unavailable"
    assert result["usage"]["cost_usd"] is None
    assert result["usage"]["status"] == "uncertain_provider_completion"


def test_ntrs_passages_retain_capture_page_offsets_and_associations(monkeypatch, tmp_path):
    snapshot = {"snapshot_id": "a" * 64}
    public = {
        "document_id": "20200000001",
        "capture_id": "b" * 64,
        "title": "Synthetic captured document",
        "associated_investigations": ["PSI-69"],
    }
    record = {**public, "pages": {"page_count": 1}, "pdf": {"sha256": "c" * 64}}
    discovery = SimpleNamespace(
        corpus=SimpleNamespace(settings=SimpleNamespace(object_directory=tmp_path / "objects")),
        source_snapshot_id=lambda _snapshot: "d" * 64,
        documents=lambda _snapshot: {"items": [public]},
    )
    monkeypatch.setattr(semantic_passages, "load_ntrs_document", lambda *_args: record)
    monkeypatch.setattr(
        semantic_passages,
        "read_document_pages",
        lambda *_args: [{"page": 1, "text": "Captured source paragraph."}],
    )
    selected, parts = next(semantic_passages.document_parts(discovery, snapshot))
    text, anchor, _description = next(parts)
    passage, located = next(semantic_passages.chunks(text, anchor))
    assert selected["associated_investigations"] == ["PSI-69"]
    assert (located.capture_id, located.document_id, located.page) == ("b" * 64, "20200000001", 1)
    assert (located.start, located.end) == (0, len(passage))
    assert located.source_sha256 == "c" * 64

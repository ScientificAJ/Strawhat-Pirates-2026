"""Offline SI provenance checks against the retained NASA research and publication tables."""

import json
from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from typing import cast

import pytest
from nova_ember.adapters.nasa_research import checked_file, load_collection
from nova_ember.api import semantic_passages
from nova_ember.api.config import Settings
from nova_ember.api.discovery import Discovery
from nova_ember.api.repository import Corpus, MissingSource, public_asset, public_investigation
from nova_ember.api.research import verify_answer
from nova_ember.api.research_tools import (
    DatasetInput,
    InvestigationInput,
    ResearchTools,
    SearchInput,
    model_fact_payload,
    publication_table_context,
)
from nova_ember.api.scientific_toolbox import ScientificToolCall
from nova_ember.contracts.research import ResearchAnswer, WorkspaceContext
from nova_ember.evidence.contracts import EvidenceAnchor
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = ROOT / "data/nasa-research"
SNAPSHOT = "a" * 64


class RetainedResearchCorpus:
    def __init__(self, directory: Path):
        self.collection = load_collection(COLLECTION)
        self.settings = Settings(
            "offline-only",
            ROOT / "tests/fixtures/nasa-psi",
            directory / "objects",
            nasa_research_directory=COLLECTION,
        )
        self.settings.object_directory.mkdir(parents=True)
        for record in self.collection["investigations"]:
            content = checked_file(
                COLLECTION,
                {
                    "path": record["metadata_path"],
                    "sha256": record["metadata_sha256"],
                },
            )
            (self.settings.object_directory / record["metadata_sha256"]).write_bytes(content)
        for asset in self.collection["assets"]:
            (self.settings.object_directory / asset["sha256"]).write_bytes(
                checked_file(COLLECTION, asset)
            )
        self.manifest = {
            "investigations": self.collection["investigations"],
            "assets": self.collection["assets"],
            "nasa_research_documents": self.collection["documents"],
        }

    def snapshot(self, identifier=None):
        if identifier not in (None, SNAPSHOT):
            raise MissingSource("The offline test does not contain that snapshot.")
        return {"snapshot_id": SNAPSHOT, "manifest": self.manifest}

    def investigations(self, query, limit, offset, snapshot_id=None):
        self.snapshot(snapshot_id)
        matches = [
            public_investigation(item)
            for item in self.manifest["investigations"]
            if query.casefold() in (item["accession"] + " " + item["title"]).casefold()
        ]
        return {"items": matches[offset : offset + limit], "total": len(matches)}

    def investigation(self, accession, snapshot_id=None):
        self.snapshot(snapshot_id)
        record = next(
            item for item in self.manifest["investigations"] if item["accession"] == accession
        )
        return {
            **public_investigation(record),
            "assets": [
                public_asset(asset)
                for asset in self.manifest["assets"]
                if asset["accession"] == accession
            ],
        }

    def asset(self, digest, snapshot_id=None, *, accession=None, asset_id=None):
        self.snapshot(snapshot_id)
        matches = [
            asset
            for asset in self.manifest["assets"]
            if asset["sha256"] == digest
            and (accession is None or asset["accession"] == accession)
            and (asset_id is None or asset["id"] == asset_id)
        ]
        if len(matches) != 1:
            raise MissingSource("Choose an exact retained test asset.")
        return public_asset(matches[0])

    def asset_bytes(self, asset):
        content = (self.settings.object_directory / asset["sha256"]).read_bytes()
        assert sha256(content).hexdigest() == asset["sha256"]
        return content


@pytest.fixture
def corpus(tmp_path):
    return cast(Corpus, RetainedResearchCorpus(tmp_path))


def tools_for(corpus):
    return ResearchTools(
        corpus, WorkspaceContext(snapshot_id=SNAPSHOT, context_version="nasa-evidence")
    )


def selected_table(corpus, accession, suffix):
    return next(
        asset
        for asset in corpus.snapshot(SNAPSHOT)["manifest"]["assets"]
        if asset["accession"] == accession and asset["file_name"].endswith(suffix)
    )


def checked_claims(tools, fact, statements):
    return verify_answer(
        ResearchAnswer(
            title="Published source interpretation",
            claims=[
                {
                    "statement": statement,
                    "origin": origin,
                    "fact_ids": [fact["id"]],
                    "limitations": [],
                }
                for statement, origin in statements
            ],
            contradictions=[],
            next_actions=[],
            limitations=[],
        ),
        tools,
    )


def test_research_discovery_and_dossier_preserve_non_psi_identity_and_status(corpus):
    tools = tools_for(corpus)
    discovery = tools.search_investigations(SearchInput(query="", limit=12))
    records = {item["accession"]: item for item in discovery["content"]["items"]}
    assert len(records) == 12
    assert records["NASA-SOFIE"]["record_type"] == "program"
    assert records["NASA-FM2"]["data_status"] == "reported_conditions"
    assert records["NASA-SAFFIRE-VI"]["source_kind"] == "nasa"
    with pytest.raises(ValidationError):
        InvestigationInput(accession="NASA ../SOFIE")
    fact = tools.get_investigation(InvestigationInput(accession="NASA-SOFIE"))
    assert fact["origin"] == "source_metadata"
    assert fact["content"]["findings"] is None
    assert len(fact["content"]["child_investigations"]) == 5
    anchors = [source for source in fact["sources"] if source.get("kind") == "metadata_field"]
    objective = next(anchor for anchor in anchors if anchor["field"] == "objective")
    assert objective["source_kind"] == "nasa"
    actual = Discovery(corpus).read_anchor(EvidenceAnchor.model_validate(objective))
    assert actual["text"] == fact["content"]["objective"]
    assert actual["source_origin"] == "curated_nasa_research_excerpt"
    preview = json.loads(model_fact_payload(fact, 4000))
    assert preview["content"]["record_type"] == "program"
    assert preview["content"]["source_kind"] == "nasa"


def test_planned_conditions_are_citable_and_numerically_grounded_without_becoming_measurements(
    corpus,
):
    tools = tools_for(corpus)
    asset = selected_table(corpus, "NASA-FM2", "planned-atmospheres.csv")
    fact = tools.inspect_dataset(DatasetInput(asset_sha256=asset["sha256"], source_rows=[2]))
    assert fact["origin"] == "source_metadata"
    assert fact["content"]["source_table_origin"] == "planned_conditions"
    fields = fact["content"]["records"][0]["fields"]
    assert fields[3]["raw_text"] == "37"
    assert fields[3]["source_value_kind"] == "condition"
    anchor = next(source for source in fact["sources"] if source.get("column") == 3)
    resolved = Discovery(corpus).read_anchor(EvidenceAnchor.model_validate(anchor))
    assert resolved["text"] == "37"
    assert resolved["source_origin"] == "planned_conditions"
    assert resolved["upstream_sources"]
    checked = checked_claims(
        tools,
        fact,
        [
            ("The planned chamber specification reports 37% oxygen.", "source_summary"),
            ("NASA measured 37% oxygen in a completed lunar experiment.", "source_summary"),
            ("The planned chamber specification reports 79% oxygen.", "source_summary"),
        ],
    )
    assert [claim["statement"] for claim in checked["claims"]] == [
        "The planned chamber specification reports 37% oxygen."
    ]
    assert len(checked["withheld_claims"]) == 2
    preview = json.loads(
        model_fact_payload(tools.get_investigation(InvestigationInput(accession="NASA-FM2")), 4000)
    )
    assert preview["content"]["data_status"] == "reported_conditions"


def test_luci_reported_fits_keep_derived_origin_and_do_not_qualify_as_measurement_or_prediction(
    corpus,
):
    tools = tools_for(corpus)
    asset = selected_table(corpus, "NASA-LUCI", "pmma-reported-fit.csv")
    fact = tools.inspect_dataset(DatasetInput(asset_sha256=asset["sha256"]))
    assert fact["origin"] == "source_text"
    fields = fact["content"]["records"][0]["fields"]
    assert fields[2]["source_value_kind"] == "derived"
    assert fields[2]["raw_text"] == ".15"
    assert fields[2]["canonical_value"] == pytest.approx(0.0015)
    assert fields[2]["canonical_unit"] == "m/s"
    checked = checked_claims(
        tools,
        fact,
        [
            ("The publication reports a fitted Flame Tip value of 0.15 cm/s.", "source_summary"),
            ("NASA measured a Flame Tip speed of 0.15 cm/s.", "source_summary"),
            ("The predicted Flame Tip speed is 0.15 cm/s.", "predicted"),
        ],
    )
    assert len(checked["claims"]) == 1
    assert checked["claims"][0]["numeric_support"][0]["origin"] == "derived"
    assert len(checked["withheld_claims"]) == 2


def test_advanced_record_tools_keep_published_and_planned_origins(corpus):
    tools = tools_for(corpus)
    for accession, suffix, origin in [
        ("NASA-FM2", "planned-atmospheres.csv", "source_metadata"),
        ("NASA-LUCI", "pmma-reported-fit.csv", "source_text"),
    ]:
        asset = selected_table(corpus, accession, suffix)
        fact = tools.run_scientific_tool(
            ScientificToolCall(
                name="get_run",
                parameters={"asset_sha256": asset["sha256"], "source_row": 2},
            )
        )
        assert fact["origin"] == origin
        assert fact["content"]["provenance"]["publication_tables"][0]["accession"] == accession
    planned = selected_table(corpus, "NASA-FM2", "planned-atmospheres.csv")
    _, origin = publication_table_context({"items": [{"asset": planned}, {"asset": planned}]})
    assert origin == "source_metadata"


def test_published_saffire_quantities_cannot_borrow_values_from_an_unrelated_unit(corpus):
    tools = tools_for(corpus)
    asset = selected_table(corpus, "NASA-SAFFIRE-VI", "saffire-iv-v-vi-results.csv")
    fact = tools.inspect_dataset(DatasetInput(asset_sha256=asset["sha256"], source_rows=[2]))
    checked = checked_claims(
        tools,
        fact,
        [
            ("The publication reports total heat release of 580 kJ.", "source_summary"),
            ("The publication reports a CO2 increase of 2800 ppm.", "source_summary"),
            ("The publication reports total heat release of 2800 kJ.", "source_summary"),
            ("The publication reports a CO2 increase of 580 ppm.", "source_summary"),
        ],
    )
    assert [claim["statement"] for claim in checked["claims"]] == [
        "The publication reports total heat release of 580 kJ.",
        "The publication reports a CO2 increase of 2800 ppm.",
    ]
    assert len(checked["withheld_claims"]) == 2


def test_gel_quantities_preserve_inverse_time_and_heat_flux_units(corpus):
    tools = tools_for(corpus)
    asset = selected_table(corpus, "NASA-SOFIE-GEL", "gel-20240007628-table-1.csv")
    fact = tools.inspect_dataset(DatasetInput(asset_sha256=asset["sha256"], source_rows=[2]))
    checked = checked_claims(
        tools,
        fact,
        [
            ("The publication reports flow strain rate 3.63 1/s.", "source_summary"),
            ("The publication reports conductive heat loss 0.36 W/cm².", "source_summary"),
            ("The publication reports conductive heat loss 3600 W/m².", "source_summary"),
            ("The publication reports conductive heat loss 0.36 W/m².", "source_summary"),
        ],
    )
    assert len(checked["claims"]) == 3
    assert len(checked["withheld_claims"]) == 1


def test_projection_includes_research_metadata_and_exact_published_table_cells(corpus):
    documents, coverage = semantic_passages.build_projection(corpus, corpus.snapshot(SNAPSHOT))
    metadata = [item for item in documents if item["kind"] == "investigation_metadata"]
    assert len(metadata) == 12
    assert {item["source_kind"] for item in metadata} == {"nasa"}
    planned = next(item for item in metadata if item["source_id"] == "NASA-FM2")
    assert planned["data_status"] == "reported_conditions"
    passages = [item for item in documents if item["kind"] == "source_passage"]
    expected = {asset["id"] for asset in corpus.snapshot(SNAPSHOT)["manifest"]["assets"]}
    assert {item["source_group"] for item in passages} == expected
    for group in expected:
        projected = next(item for item in passages if item["source_group"] == group)
        anchor = EvidenceAnchor.model_validate(projected["anchors"][0])
        assert anchor.source_kind == "nasa"
        assert Discovery(corpus).read_anchor(anchor)["text"] == projected["text"]
    assert coverage["metadata_documents"] == 12
    assert not any(item["status"] == "reader_unavailable" for item in coverage["sources"])


def test_bounded_projection_and_embedding_selection_do_not_starve_pinned_ntrs_reports(
    corpus, monkeypatch
):
    capture = "b" * 64
    pdf_hash = "d" * 64
    public = {
        "document_id": "20240002981",
        "capture_id": capture,
        "title": "Synthetic report fixture",
        "source_sha256": pdf_hash,
        "page_count": 1,
        "associated_investigations": ["NASA-SAFFIRE-VI"],
    }
    monkeypatch.setattr(Discovery, "documents", lambda *_args: {"items": [public]})
    loaded = []

    def load(_directory, identifier, snapshot_id, selected_capture):
        loaded.append((identifier, snapshot_id, selected_capture))
        return {
            "document_id": identifier,
            "capture_id": selected_capture,
            "pdf": {"sha256": pdf_hash},
            "pages": {"page_count": 1},
        }

    original = "Synthetic retained report passage. " * 100
    monkeypatch.setattr(semantic_passages, "load_ntrs_document", load)
    monkeypatch.setattr(
        semantic_passages, "read_document_pages", lambda *_args: [{"page": 1, "text": original}]
    )
    monkeypatch.setattr(semantic_passages, "MAX_PROJECTION_DOCUMENTS", 40)
    documents, coverage = semantic_passages.build_projection(corpus, corpus.snapshot(SNAPSHOT))
    assert len(documents) <= 40
    assert loaded == [("20240002981", SNAPSHOT, capture)]
    report = next(item for item in documents if item["source_kind"] == "ntrs")
    assert report["accessions"] == ["NASA-SAFFIRE-VI"]
    anchor = EvidenceAnchor.model_validate(report["anchors"][0])
    assert anchor.capture_id == capture
    assert anchor.source_sha256 == pdf_hash
    assert original[anchor.start : anchor.end] == report["text"]
    selected = semantic_passages.embedding_documents(documents, 28)
    assert len(selected) <= 28
    assert len({item["source_id"] for item in selected}) == len(selected)
    assert any(item["source_kind"] == "ntrs" for item in selected)
    assert len([item for item in selected if item["kind"] == "investigation_metadata"]) == 12
    assert coverage["embedding_selection"] == "metadata_then_source_round_robin_v1"


def test_unavailable_declared_report_cannot_index_a_different_latest_revision(corpus, monkeypatch):
    public = {
        "document_id": "20240002981",
        "capture_id": None,
        "source_sha256": None,
        "page_count": None,
        "status": "original_document_not_retained",
    }
    monkeypatch.setattr(Discovery, "documents", lambda *_args: {"items": [public]})

    def reject_latest_fallback(*_args):
        pytest.fail("An unavailable declared capture must not fall back to a latest revision.")

    monkeypatch.setattr(semantic_passages, "load_ntrs_document", reject_latest_fallback)
    documents, _ = semantic_passages.build_projection(corpus, corpus.snapshot(SNAPSHOT))
    assert not any(item["source_kind"] == "ntrs" for item in documents)


def test_bounded_publication_preview_preserves_later_columns_and_exact_row_scope(corpus):
    tools = tools_for(corpus)
    asset = selected_table(corpus, "NASA-SAFFIRE-VI", "vi-results.csv")
    fact = tools.inspect_dataset(DatasetInput(asset_sha256=asset["sha256"], source_rows=[2]))
    original = deepcopy(fact)
    encoded = model_fact_payload(fact, 7000)
    preview = json.loads(encoded)
    assert len(encoded.encode()) <= 7000
    row = preview["content"]["records"][0]
    assert row["source_row"] == 2 and row["raw_cells"][0] == "VI-2"
    fields = {field["column_index"]: field for field in row["fields"]}
    assert fields[3]["canonical_value"] == 3217
    assert fields[3]["original_unit"] == "W"
    assert "Peak Heat Release" in fields[3]["source_column"]
    assert fields[5]["raw_text"] == "3,650"
    assert fields[5]["canonical_value"] == 3650
    assert fields[5]["source_value_kind"] == "derived"
    assert "Average Heat Release" in fields[5]["source_column"]
    assert fields[11]["raw_text"] == "120" and fields[11]["original_unit"] == "ppm"
    assert preview["content"]["independent_run_count"] is None
    assert preview["model_view"]["retained_records"] == 1
    assert fact == original
    assert any(source.get("column") == 11 for source in fact["sources"])

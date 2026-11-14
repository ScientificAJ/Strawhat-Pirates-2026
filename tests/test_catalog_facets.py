"""Catalog facets preserve declared scope and count the actual selected entity grain."""

import json
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from nova_ember.api.catalog_facets import ANNOTATIONS, UNKNOWN, classifications
from nova_ember.api.discovery import (
    Discovery,
    InvestigationQuery,
    RecordQuery,
    create_discovery_router,
)
from nova_ember.api.repository import Corpus

ROOT = Path(__file__).parent / "fixtures/nasa-psi"


class FixtureCorpus:
    def __init__(self):
        content = (ROOT / "snapshot.json").read_bytes()
        self.manifest = json.loads(content)
        self.snapshot_id = sha256(content).hexdigest()
        self.settings = SimpleNamespace(fixture_directory=ROOT)

    def snapshot(self, snapshot_id=None):
        assert snapshot_id in (None, self.snapshot_id)
        return {"snapshot_id": self.snapshot_id, "manifest": self.manifest}

    def asset_bytes(self, asset):
        data = (ROOT / asset["path"]).read_bytes()
        assert sha256(data).hexdigest() == asset["sha256"]
        return data


@pytest.fixture
def service():
    return Discovery(cast(Corpus, FixtureCorpus()))


def option(response, name, value):
    facet = next(item for item in response["catalog_facets"] if item["name"] == name)
    return next(item for item in facet["options"] if item["value"] == value)


def test_exact_annotations_all_resolve_to_the_original_frozen_source(service):
    snapshot = service.corpus.snapshot()
    catalog = service.catalog_classifications(snapshot)
    checked = 0
    for record in snapshot["manifest"]["investigations"]:
        metadata = service._metadata(record)
        for facet in catalog[record["accession"]].values():
            for item in facet:
                if item["anchor"]:
                    source = metadata[item["anchor"]["field"]]
                    if isinstance(source, list):
                        assert any(
                            item["quote"] in str(publication.get(field, ""))
                            for publication in source
                            for field in ("title", "doi")
                        )
                    else:
                        assert item["quote"] in source
                    assert item["anchor"]["source_sha256"] == record["metadata_sha256"]
                    assert item["scope"] == "catalog_focus_not_run_condition"
                    checked += 1
        assert catalog[record["accession"]]["review_state"][0]["value"] == UNKNOWN
    assert checked > 100
    same_r = catalog["PSI-101"]["sensor"]
    assert [item["value"] for item in same_r] == ["M-pass"]
    assert "DustTrak" not in [item["value"] for item in same_r]
    assert "modified P-Trak" in next(
        item["quote"]
        for item in catalog["PSI-47"]["sensor"]
        if item["value"] == "Modified TSI P-Trak"
    )


def test_annotation_hash_change_does_not_reuse_old_material_or_phase_scope(service):
    record = next(
        item
        for item in service.corpus.snapshot()["manifest"]["investigations"]
        if item["accession"] == "PSI-69"
    )
    metadata = service._metadata(record)
    projected = classifications(
        {**record, "metadata_sha256": "a" * 64}, metadata, lambda field: {"field": field}, {}
    )
    assert projected["fuel_phase"][0]["value"] == UNKNOWN
    assert projected["sensor"][0]["value"] == UNKNOWN
    assert record["metadata_sha256"] == ANNOTATIONS["PSI-69"][0]


def test_multi_facets_use_or_within_and_across_and_disjunctive_counts(service):
    query = InvestigationQuery(
        catalog_facets={"material": ("Nomex", "Ultem"), "sensor": ("Thermocouples",)}, limit=1
    )
    result = service.query_investigations(query)
    assert [item["accession"] for item in result["items"]] == ["PSI-99"]
    assert result["total"] == 1
    # Material counts retain the sensor filter, but omit their own selection.
    assert option(result, "material", "Nomex")["count"] == 1
    assert option(result, "material", "SIBAL cotton / fiberglass composite")["count"] == 2
    assert option(result, "material", "Ultem")["count"] == 0
    # Sensor counts retain Nomex-or-Ultem: BASS and SAFFIRE-II.
    assert option(result, "sensor", UNKNOWN)["count"] == 1
    assert option(result, "sensor", "Thermocouples")["count"] == 1
    assert result["catalog_facets"][0]["entity_level"] == "investigations"
    assert (
        service.query_investigations(
            InvestigationQuery(catalog_facets={"review_state": (UNKNOWN,)})
        )["total"]
        == 24
    )


def test_record_counts_retain_row_roles_and_full_query_before_pagination(service):
    query = RecordQuery(
        accessions=("PSI-99",),
        row_kinds=("sample_record",),
        catalog_facets={"material": ("PMMA",)},
        limit=2,
    )
    result = service.query_records(query)
    assert result["total"] == 9
    assert len(result["items"]) == 2
    assert option(result, "material", "PMMA")["count"] == 9
    assert option(result, "sensor", "Thermocouples")["count"] == 9
    assert result["catalog_facets"][0]["entity_level"] == "source_records"
    assert result["independent_run_count"] is None
    assert all(item["record"].row_kind == "sample_record" for item in result["items"])
    # This is a catalog material focus, not evidence that every row is PMMA.
    assert result["items"][0]["record"].raw_cells[1] != "PMMA"
    changed = query.model_copy(update={"catalog_facets": {"material": ("Ultem",)}})
    assert service.query_records(changed)["total"] == 0


def test_http_contract_rejects_unsupported_facet_names_and_bounded_values(service):
    application = FastAPI()
    application.include_router(create_discovery_router(service.corpus))
    client = TestClient(application)
    assert (
        client.post(
            "/v1/discovery/investigations",
            json={"catalog_facets": {"scientific_confidence": ["100%"]}},
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/v1/discovery/investigations", json={"catalog_facets": {"material": ["x"] * 33}}
        ).status_code
        == 422
    )
    response = client.post(
        "/v1/discovery/investigations", json={"catalog_facets": {"material": ["PMMA"]}, "limit": 1}
    )
    assert response.status_code == 200
    assert response.json()["total"] == 1

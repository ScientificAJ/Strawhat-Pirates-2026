"""Actual frozen NASA source anchors, typed discovery and conservative coverage."""

import os
from dataclasses import replace

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.discovery import Discovery, create_discovery_router
from nova_ember.api.repository import Corpus, MissingSource
from nova_ember.api.seed import seed

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def discovery(tmp_path_factory):
    database_url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for real PostgreSQL checks.")
    defaults = Settings.from_environment()
    if database_url == defaults.database_url:
        raise RuntimeError("Discovery tests require the separate test database.")
    settings = replace(
        defaults,
        database_url=database_url,
        object_directory=tmp_path_factory.mktemp("discovery") / "objects",
    )
    seed(settings)
    corpus = Corpus(settings)
    application = FastAPI()
    application.include_router(create_discovery_router(corpus))

    @application.exception_handler(MissingSource)
    async def missing(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @application.exception_handler(ValueError)
    async def invalid(_request, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    return TestClient(application), Discovery(corpus)


def test_source_metadata_dossier_separates_objectives_from_findings(discovery):
    client, _ = discovery
    response = client.get("/v1/investigations/PSI-101/dossier")
    assert response.status_code == 200
    dossier = response.json()
    assert dossier["findings"] is None
    objective = dossier["source_fields"]["objective"]
    assert objective["scientific_role"] == "objective"
    resolved = client.post("/v1/evidence/read", json=objective["anchor"])
    assert resolved.status_code == 200
    assert resolved.json()["text"] == objective["value"]
    changed = {**objective["anchor"], "source_sha256": "a" * 64}
    assert client.post("/v1/evidence/read", json=changed).status_code == 404


def test_literal_evidence_query_returns_exact_character_spans(discovery):
    client, _ = discovery
    response = client.post(
        "/v1/evidence/search", json={"text": "contaminated", "accessions": ["PSI-101"]}
    )
    assert response.status_code == 200
    result = response.json()
    assert result["total"] >= 1
    for match in result["items"]:
        exact = client.post("/v1/evidence/read", json=match["anchor"]).json()
        assert exact["text"] == match["text"]
    assert "not a global" in result["search_scope"]
    assert (
        client.post(
            "/v1/evidence/search", json={"text": "smoke", "fields": ["invented_outcomes"]}
        ).status_code
        == 422
    )


def test_source_record_query_retains_mixed_grain_and_cursor_identity(discovery):
    client, _ = discovery
    query = {"accessions": ["PSI-99"], "row_kinds": ["sample_record"], "limit": 4}
    first = client.post("/v1/discovery/records", json=query).json()
    assert first["total"] == 9
    assert first["independent_run_count"] is None
    assert [row["record"]["source_row"] for row in first["items"]] == [2, 3, 4, 5]
    second = client.post(
        "/v1/discovery/records", json={**query, "cursor": first["next_cursor"]}
    ).json()
    assert [row["record"]["source_row"] for row in second["items"]] == [6, 7, 8, 9]
    assert first["query_id"] == second["query_id"]
    changed = {**query, "text": "paper", "cursor": first["next_cursor"]}
    assert client.post("/v1/discovery/records", json=changed).status_code == 422
    first_anchor = first["items"][0]["anchor"]
    assert client.post("/v1/evidence/read", json=first_anchor).json()["text"] == "2-1"


def test_canonical_numeric_filter_never_invents_calibration(discovery):
    client, _ = discovery
    query = {
        "accessions": ["PSI-99"],
        "row_kinds": ["sample_record"],
        "predicates": [
            {
                "quantity_kind": "length",
                "source_column": "Samle Thickness ",
                "operator": "gte",
                "value": 0.01,
                "unit": "m",
            }
        ],
    }
    result = client.post("/v1/discovery/records", json=query)
    assert result.status_code == 200
    assert [row["record"]["raw_cells"][0] for row in result.json()["items"]] == ["2-9"]
    bad = {**query, "predicates": [{"quantity_kind": "length", "operator": "gte", "value": 0.01}]}
    assert client.post("/v1/discovery/records", json=bad).status_code == 422
    bass = {
        "accessions": ["PSI-25"],
        "predicates": [{"quantity_kind": "speed", "operator": "gte", "value": 0, "unit": "m/s"}],
    }
    assert client.post("/v1/discovery/records", json=bass).json()["total"] == 0


def test_coverage_reports_repository_scope_not_independent_trials(discovery):
    client, _ = discovery
    coverage = client.get("/v1/evidence/coverage").json()
    assert len(coverage["items"]) == 24
    saffire = next(row for row in coverage["items"] if row["accession"] == "PSI-99")
    assert saffire["row_roles"] == {"sample_record": 9, "flow_visualization": 2, "note": 4}
    assert saffire["independent_run_count"] is None
    assert saffire["model_readiness"] == "not_established_by_coverage"
    psi10 = next(row for row in coverage["items"] if row["accession"] == "PSI-10")
    assert psi10["rights"] == "unresolved"
    assert client.get("/v1/evidence/coverage?accession=PSI-999").status_code == 404


def test_lineage_uses_exact_related_ids_and_preserves_instrument_difference(discovery):
    client, _ = discovery
    graph = client.get("/v1/evidence/lineage").json()
    daft = [
        row
        for row in graph["relations"]
        if row["source"] == "PSI-47" and row["relation"] == "related_investigation"
    ]
    assert [row["target"] for row in daft] == ["PSI-102"]
    for relation in daft:
        assert client.post("/v1/evidence/read", json=relation["anchor"]).json()["text"] == "PSI-102"
    cir = next(row for row in graph["nodes"] if row["label"] == "CIR")
    assert cir["configuration"] == "not_resolved_by_name"
    assert any("dust" in note for note in graph["limitations"])


def test_earth_collection_does_not_turn_expected_impacts_into_deployments(discovery):
    client, _ = discovery
    result = client.get("/v1/evidence/earth-applications").json()
    assert result["items"]
    assert all(row["status"] == "research_hypothesis" for row in result["items"])
    assert all(row["anchor"]["field"] == "researchImpacts" for row in result["items"])


def test_investigation_filters_and_manifest_previews_are_bounded(discovery):
    client, _ = discovery
    result = client.post("/v1/discovery/investigations", json={"hardware": "P-Trak"}).json()
    assert [row["accession"] for row in result["items"]] == ["PSI-47"]
    unknown = client.post("/v1/discovery/investigations", json={"license": "unknown"}).json()
    assert [row["accession"] for row in unknown["items"]] == ["PSI-10"]
    manifest = client.get("/v1/investigations/PSI-69/manifest?limit=3").json()
    assert manifest["total"] == 6555
    assert len(manifest["items"]) == 3
    assert all(
        row["acquisition_status"] == "not_acquired_by_manifest_read" for row in manifest["items"]
    )
    assert client.get("/v1/investigations/PSI-69/manifest?limit=101").status_code == 422


def test_casefold_expansions_preserve_original_character_positions():
    from nova_ember.api.discovery import _literal_span

    source = "ß" * 300 + "target"
    assert _literal_span(source, ["target"]) == (200, 306)
    assert _literal_span(source, ["absent"]) is None
    assert _literal_span(source, []) is None


def test_joint_condition_coverage_uses_all_filtered_records(discovery):
    client, _ = discovery
    request = {
        "query": {"accessions": ["PSI-99"], "row_kinds": ["sample_record"], "limit": 1},
        "axes": [
            {
                "quantity_kind": "length",
                "source_column": "Samle Thickness ",
                "kind": "numeric",
                "canonical_unit": "m",
                "bin_edges": [0, 0.001, 0.02],
            }
        ],
    }
    result = client.post("/v1/evidence/condition-coverage", json=request)
    assert result.status_code == 200
    coverage = result.json()
    assert coverage["source_record_count"] == 9
    assert coverage["independent_run_count"] is None
    assert sum(cell["source_record_count"] for cell in coverage["cells"]) == 9
    assert any(
        coordinate["state"] == "unknown"
        for cell in coverage["cells"]
        for coordinate in cell["coordinates"]
    )
    request["query"]["cursor"] = "arbitrary"
    assert client.post("/v1/evidence/condition-coverage", json=request).status_code == 422


def test_ntrs_page_evidence_keeps_identity_rights_and_exact_excerpt(discovery):
    import httpx
    from nova_ember.adapters.documents import NtrsClient, capture_ntrs_document
    from test_evidence_documents import metadata, pdf_source

    client, service = discovery
    snapshot = service.corpus.snapshot()
    base = service.source_snapshot_id(snapshot)
    directory = service.corpus.settings.object_directory.parent / "evidence-documents"

    def handler(request):
        if request.url.path.endswith("/test.pdf"):
            return httpx.Response(200, content=pdf_source())
        return httpx.Response(200, json=metadata())

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        record = capture_ntrs_document(
            NtrsClient(transport), "20210011385", base, ("PSI-25",), directory
        )
    listed = client.get("/v1/evidence/documents").json()["items"]
    assert any(row["capture_id"] == record["capture_id"] for row in listed)
    search = client.post(
        "/v1/evidence/search",
        json={"text": "3.5", "fields": ["ntrs_page_text"], "accessions": ["PSI-25"]},
    ).json()
    match = search["items"][0]
    assert match["anchor"]["source_kind"] == "ntrs"
    assert match["anchor"]["accession"] is None
    assert match["anchor"]["document_id"] == "20210011385"
    resolved = client.post("/v1/evidence/read", json=match["anchor"])
    assert resolved.status_code == 200
    exact = resolved.json()
    assert exact["text"] == match["text"] == "Known page text: 3.5 mm"
    assert exact["copyright"]["determinationType"] == "GOV_PERMITTED"
    assert exact["original_bytes_served"] is False
    assert "#page=1" in exact["source_url"]
    wrong = {**match["anchor"], "source_sha256": "a" * 64}
    assert client.post("/v1/evidence/read", json=wrong).status_code == 404


def test_actual_media_endpoint_preserves_source_origin_and_unresolved_calibration(discovery):
    client, service = discovery
    snapshot = service.corpus.snapshot()
    media = next(row for row in snapshot["manifest"]["assets"] if row.get("kind") == "source_video")
    result = client.get(f"/v1/assets/{media['sha256']}/media").json()
    assert result["media_origin"] == "original_source_bytes"
    assert result["measurement_ready"] is False
    assert result["metadata"]["spatial_calibration"] is None
    assert "FLEX-007" in result["source_run_association"]
    assert result["asset"]["sha256"] == media["sha256"]


def test_method_readers_and_identical_bytes_keep_both_scientific_source_identities(discovery):
    client, service = discovery
    snapshot = service.corpus.snapshot()
    copies = [
        row
        for row in snapshot["manifest"]["assets"]
        if row["sha256"] == "49c939337fa00a0473f7efa10367288f510afcbf69dd7f5405054a2617d3a66d"
    ]
    assert {row["accession"] for row in copies} == {"PSI-98", "PSI-100"}
    ambiguous = client.get(f"/v1/assets/{copies[0]['sha256']}/format")
    assert ambiguous.status_code == 422
    assert "multiple source records" in ambiguous.json()["detail"]
    for asset in copies:
        response = client.get(
            f"/v1/assets/{asset['sha256']}/format", params={"accession": asset["accession"]}
        )
        assert response.status_code == 200
        assert response.json()["asset"]["accession"] == asset["accession"]
        request = {
            "snapshot_id": snapshot["snapshot_id"],
            "accession": asset["accession"],
            "investigation_version": asset["investigation_version"],
            "source_sha256": asset["sha256"],
            "asset_id": asset["id"],
            "kind": "document_paragraph",
            "paragraph": 1,
        }
        resolved = client.post("/v1/evidence/read", json=request)
        assert resolved.status_code == 200
        assert resolved.json()["asset"]["accession"] == asset["accession"]
        assert resolved.json()["paragraph"]["paragraph"] == 1


def test_source_method_pages_figures_rtf_and_matlab_are_available_without_inferred_metrics(
    discovery,
):
    client, service = discovery
    snapshot = service.corpus.snapshot()
    assets = snapshot["manifest"]["assets"]
    pdf = next(row for row in assets if row["file_name"].endswith("FLEX_Test_Plan.pdf"))
    result = client.get(f"/v1/assets/{pdf['sha256']}/format").json()
    assert result["total_pages"] == 15
    assert result["scientific_normalization"] == "not_inferred_from_format_extraction"
    rtf = next(row for row in assets if row["file_name"].endswith("FLEX-243_TestSheet.rtf"))
    extracted = client.get(f"/v1/assets/{rtf['sha256']}/format").json()
    assert any("CIR Test Number:" in row["text"] for row in extracted["paragraphs"])
    mat = next(row for row in assets if row["file_name"] == "d300s_effective_wavelength.mat")
    assert client.get(f"/v1/assets/{mat['sha256']}/format").json()["variables"][0]["shape"] == [
        1,
        1201,
    ]
    docx = next(row for row in assets if row["file_name"].endswith("SAFFIRE-II Readme.docx"))
    view = client.get(f"/v1/assets/{docx['sha256']}/format").json()
    figure = next(
        row for row in view["embedded_figures"] if row["member"] == "word/media/image1.png"
    )
    image = client.get(
        f"/v1/assets/{docx['sha256']}/embedded-figure", params={"member": figure["member"]}
    )
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/png"
    assert image.headers["x-content-type-options"] == "nosniff"
    request = {
        "snapshot_id": snapshot["snapshot_id"],
        "accession": docx["accession"],
        "investigation_version": docx["investigation_version"],
        "source_sha256": docx["sha256"],
        "asset_id": docx["id"],
        "kind": "document_figure",
        "member": figure["member"],
        "member_sha256": figure["sha256"],
    }
    anchored = client.post("/v1/evidence/read", json=request).json()
    assert anchored["content_kind"] == "source_image"
    assert anchored["scientific_measurement_ready"] is False
    request["member_sha256"] = "a" * 64
    assert client.post("/v1/evidence/read", json=request).status_code == 404


def test_snapshot_changes_are_public_inspection_without_case_or_corpus_mutation(discovery):
    client, service = discovery
    base = service.source_snapshot_id(service.corpus.snapshot())
    response = client.get(f"/v1/snapshots/{base}/changes")
    assert response.status_code == 200
    result = response.json()
    assert result["pinned_snapshot_id"] == base
    assert result["scientific_snapshot_promoted_by_refresh"] is False
    assert result["case_mutation"] is False
    assert any(
        row["file_name"].endswith("FLEX_Test_Plan.pdf")
        for row in result["released_changes"]["added_assets"]
    )
    assert result["released_changes"]["dependency_ids_to_recheck"] == []
    assert client.get("/v1/source-refresh/status").status_code == 200

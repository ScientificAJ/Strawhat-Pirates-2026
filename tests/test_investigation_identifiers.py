"""Catalog expansion must not widen the PSI acquisition namespace."""

import pytest
from nova_ember.contracts.research import SelectedSource, WorkspaceContext
from nova_ember.domain.identifiers import Accession, InvestigationId
from nova_ember.evidence.contracts import EvidenceAnchor
from pydantic import TypeAdapter, ValidationError


@pytest.mark.parametrize("value", ["PSI-1", "PSI-999999", "NASA-SAFFIRE-IV", "NASA-SOFIE-MIST"])
def test_catalog_identifiers_accept_both_namespaces(value):
    assert TypeAdapter(InvestigationId).validate_python(value) == value


@pytest.mark.parametrize(
    "value", ["PSI-0", "PSI-01", "PSI-1000000", "NASA-A", "NASA-sofie", "NASA-A/BC", "PSI-1\n"]
)
def test_catalog_identifier_rejects_malformed_identities(value):
    with pytest.raises(ValidationError):
        TypeAdapter(InvestigationId).validate_python(value)


def test_psi_accession_stays_strict():
    with pytest.raises(ValidationError):
        TypeAdapter(Accession).validate_python("NASA-SAFFIRE-IV")


def anchor(**overrides):
    return {
        "snapshot_id": "a" * 64,
        "source_sha256": "b" * 64,
        "source_kind": "nasa",
        "accession": "NASA-SAFFIRE-IV",
        "investigation_version": 1,
        "kind": "metadata_field",
        "field": "approach",
        **overrides,
    }


def test_nasa_anchor_preserves_identity_and_locator():
    parsed = EvidenceAnchor.model_validate(anchor())
    assert parsed.accession == "NASA-SAFFIRE-IV"
    assert parsed.source_kind == "nasa"
    assert parsed.field == "approach"
    cell = EvidenceAnchor.model_validate(
        anchor(kind="table_cell", field=None, asset_id="published-table", source_row=2, column=0)
    )
    assert cell.column == 0


@pytest.mark.parametrize(
    "overrides",
    [
        {"source_kind": "psi"},
        {"accession": "PSI-62"},
        {"investigation_version": None},
        {"document_id": "20240000001"},
        {"capture_id": "c" * 64},
        {"field": None},
    ],
)
def test_nasa_anchor_rejects_mixed_or_incomplete_identity(overrides):
    with pytest.raises(ValidationError):
        EvidenceAnchor.model_validate(anchor(**overrides))


def test_ntrs_identity_remains_document_scoped():
    document = anchor(
        source_kind="ntrs",
        accession=None,
        investigation_version=None,
        document_id="20240000001",
        capture_id="c" * 64,
        kind="document_page",
        field=None,
        page=4,
    )
    assert EvidenceAnchor.model_validate(document).page == 4
    with pytest.raises(ValidationError):
        EvidenceAnchor.model_validate({**document, "accession": "NASA-SAFFIRE-IV"})


def test_research_context_accepts_nasa_sources_with_existing_consent_defaults():
    context = WorkspaceContext(
        context_version="v1",
        snapshot_id="a" * 64,
        investigations=["PSI-62", "NASA-SAFFIRE-IV"],
        selected_sources=[SelectedSource(asset_sha256="b" * 64, accession="NASA-SAFFIRE-IV")],
        selected_evidence=[EvidenceAnchor.model_validate(anchor())],
    )
    assert context.investigations == ["PSI-62", "NASA-SAFFIRE-IV"]
    assert context.selected_private_inputs == []

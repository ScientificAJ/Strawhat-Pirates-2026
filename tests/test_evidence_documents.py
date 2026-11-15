"""Known PDF text, bounded public acquisition and preserved restrictive rights."""

import json
from hashlib import sha256

import httpx
import pytest
from nova_ember.adapters.documents import (
    NtrsClient,
    capture_ntrs_document,
    extract_pdf_pages,
    extract_pdf_pages_bounded,
    load_ntrs_document,
    read_document_pages,
)
from nova_ember.adapters.psi import SourceUnavailable


def pdf_source(text="Known page text: 3.5 mm"):
    stream = f"BT /F1 12 Tf 10 50 Td ({text}) Tj ET".encode()
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    content = b"%PDF-1.4\n"
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(content))
        content += f"{index} 0 obj\n".encode() + obj + b"\nendobj\n"
    xref = len(content)
    content += f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode()
    for offset in offsets[1:]:
        content += f"{offset:010} 00000 n \n".encode()
    content += (
        f"trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return content


def metadata():
    return {
        "id": 20210011385,
        "distribution": "PUBLIC",
        "title": "Known fixture report",
        "abstract": "Fixture abstract, not experimental evidence.",
        "copyright": {"determinationType": "GOV_PERMITTED"},
        "downloads": [
            {
                "draft": False,
                "mimetype": "application/pdf",
                "links": {"pdf": "/api/citations/20210011385/downloads/test.pdf"},
            }
        ],
    }


def test_pdf_page_reader_retains_exact_text_geometry_and_hash():
    pages = extract_pdf_pages(pdf_source())
    assert len(pages) == 1
    assert pages[0].text == "Known page text: 3.5 mm"
    assert pages[0].width_points == 200
    assert pages[0].height_points == 100
    assert pages[0].text_sha256 == sha256(b"Known page text: 3.5 mm").hexdigest()
    assert extract_pdf_pages_bounded(pdf_source()) == pages
    with pytest.raises(ValueError, match="signature"):
        extract_pdf_pages(b"<html>not a PDF</html>")


def test_public_distribution_does_not_grant_redistribution_and_old_captures_remain(tmp_path):
    source = [pdf_source()]

    def handler(request):
        if request.url.path.endswith("/test.pdf"):
            return httpx.Response(200, content=source[0])
        return httpx.Response(200, json=metadata())

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        client = NtrsClient(transport)
        first = capture_ntrs_document(client, "20210011385", "a" * 64, ("PSI-25",), tmp_path)
        assert first["status"] == "page_text_available"
        assert first["redistribution"] == "not_authorized_by_public_distribution_alone"
        assert first["copyright"]["determinationType"] == "GOV_PERMITTED"
        assert read_document_pages(tmp_path, first)[0]["text"] == "Known page text: 3.5 mm"
        source[0] = pdf_source("Changed source, separately frozen")
        second = capture_ntrs_document(client, "20210011385", "a" * 64, ("PSI-25",), tmp_path)
        assert second["capture_id"] != first["capture_id"]
        old = load_ntrs_document(tmp_path, "20210011385", "a" * 64, first["capture_id"])
        assert old["pdf"]["sha256"] == first["pdf"]["sha256"]
        assert load_ntrs_document(tmp_path, "20210011385", "b" * 64) is None
        (tmp_path / first["pdf"]["path"]).write_bytes(b"corrupt")
        with pytest.raises(ValueError, match="original PDF"):
            read_document_pages(tmp_path, old)


def test_redirect_draft_private_or_external_pdf_cannot_be_acquired(tmp_path):
    def wrong_identity(_request):
        return httpx.Response(200, json={**metadata(), "id": 1})

    with httpx.Client(transport=httpx.MockTransport(wrong_identity)) as transport:
        with pytest.raises(SourceUnavailable, match="identity"):
            NtrsClient(transport).metadata("20210011385")
    bad = metadata()
    bad["downloads"][0]["links"]["pdf"] = "https://elsewhere.example/report.pdf"
    with httpx.Client(
        transport=httpx.MockTransport(lambda _request: httpx.Response(200, json=bad))
    ) as transport:
        with pytest.raises(SourceUnavailable, match="selected citation"):
            NtrsClient(transport).pdf("20210011385", bad)

    def redirected(_request):
        return httpx.Response(302, headers={"Location": "https://elsewhere.example"})

    with httpx.Client(transport=httpx.MockTransport(redirected)) as transport:
        with pytest.raises(SourceUnavailable):
            NtrsClient(transport).metadata("20210011385")


def test_failed_pdf_retains_citation_and_visible_acquisition_error(tmp_path):
    def handler(request):
        if request.url.path.endswith("/test.pdf"):
            return httpx.Response(503)
        return httpx.Response(200, json=metadata())

    with httpx.Client(transport=httpx.MockTransport(handler)) as transport:
        record = capture_ntrs_document(NtrsClient(transport), "20210011385", "a" * 64, (), tmp_path)
    assert record["status"] == "pdf_acquisition_unavailable"
    assert record["pdf"] is None
    assert record["acquisition_error"]
    assert load_ntrs_document(tmp_path, "20210011385", "a" * 64)["title"] == "Known fixture report"
    assert (
        json.loads((tmp_path / record["metadata"]["path"]).read_bytes())["distribution"] == "PUBLIC"
    )


def test_decoding_limit_preserves_other_pages_and_marks_missing_text(monkeypatch):
    from types import SimpleNamespace

    import nova_ember.adapters.documents as documents
    from pypdf.errors import LimitReachedError

    def large_figure_page(**_kwargs):
        raise LimitReachedError("Compressed figure exceeds the decoding bound")

    def page(extract):
        return SimpleNamespace(
            extract_text=extract,
            rotation=0,
            mediabox=SimpleNamespace(width=200, height=100),
        )

    reader = SimpleNamespace(
        is_encrypted=False,
        pages=[
            page(lambda **_kwargs: "First page remains traceable"),
            page(large_figure_page),
            page(lambda **_kwargs: "Third page retains its original page number"),
        ],
    )
    monkeypatch.setattr(documents, "PdfReader", lambda *_args, **_kwargs: reader)
    pages = extract_pdf_pages(pdf_source())
    assert [item.page for item in pages] == [1, 2, 3]
    assert pages[0].text == "First page remains traceable"
    assert pages[1].text == ""
    assert pages[1].extraction_status == "text_extraction_unavailable"
    assert "decoding limits" in pages[1].extraction_error
    assert pages[2].text == "Third page retains its original page number"

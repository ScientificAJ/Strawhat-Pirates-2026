"""Public NTRS metadata and PDF page extraction with retained rights and hashes."""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlsplit

import httpx
from pypdf import PdfReader
from pypdf.errors import LimitReachedError, PdfReadError

from .manifests import checked_json, write_immutable
from .psi import Capture, SourceUnavailable

NTRS_ORIGIN = "https://ntrs.nasa.gov"
MAX_DOCUMENT_BYTES = 64 * 1024 * 1024
MAX_DOCUMENT_PAGES = 500
MAX_EXTRACTED_CHARACTERS = 2_000_000


def citation_url(identifier: str) -> str:
    if not re.fullmatch(r"[0-9]{11}", identifier):
        raise ValueError("A numeric NTRS citation identifier is required.")
    return f"{NTRS_ORIGIN}/citations/{identifier}"


@dataclass(frozen=True)
class PdfPage:
    page: int
    text: str
    text_sha256: str
    rotation_degrees: int
    width_points: float
    height_points: float
    extraction_status: str = "page_text_available"
    extraction_error: str | None = None


def extract_pdf_pages(content: bytes) -> tuple[PdfPage, ...]:
    """Extract literal page text; no OCR, scientific table recovery or image inference.

    Call from the resource-limited trusted extraction worker for newly acquired
    files. Byte/page/output bounds supplement that process boundary.
    """
    if len(content) > MAX_DOCUMENT_BYTES or not content.lstrip().startswith(b"%PDF-"):
        raise ValueError("The document exceeds the limit or lacks the PDF signature.")
    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs require a separately authorized reader.")
        if len(reader.pages) > MAX_DOCUMENT_PAGES:
            raise ValueError("The PDF exceeds the page limit.")
        pages = []
        total = 0
        for number, page in enumerate(reader.pages, start=1):
            extraction_error = None
            try:
                text = page.extract_text(extraction_mode="plain") or ""
            except LimitReachedError:
                # Some reports embed large figure streams. Preserve the page number
                # and usable surrounding pages without relaxing the reader's limits.
                text = ""
                extraction_error = "This page exceeds the registered PDF decoding limits."
            total += len(text)
            if total > MAX_EXTRACTED_CHARACTERS or len(text) > 100_000:
                raise ValueError("Extracted PDF text exceeds the bounded document/page limit.")
            pages.append(
                PdfPage(
                    number,
                    text,
                    hashlib.sha256(text.encode()).hexdigest(),
                    page.rotation,
                    float(page.mediabox.width),
                    float(page.mediabox.height),
                    "text_extraction_unavailable" if extraction_error else "page_text_available",
                    extraction_error,
                )
            )
        return tuple(pages)
    except (PdfReadError, KeyError, TypeError, RecursionError, OverflowError):
        raise ValueError(
            "The PDF structure is unreadable by the registered page-text reader."
        ) from None


def extract_pdf_pages_bounded(content: bytes) -> tuple[PdfPage, ...]:
    """Run only this trusted reader in a fixed child with time/memory/output bounds."""
    if len(content) > MAX_DOCUMENT_BYTES:
        raise ValueError("The PDF exceeds the source-byte limit.")
    environment = {"PATH": os.defpath, "PYTHONPATH": os.environ.get("PYTHONPATH", "")}
    with tempfile.TemporaryDirectory(prefix="nova-pdf-") as scratch:
        try:
            result = subprocess.run(
                [sys.executable, "-m", "nova_ember.adapters.documents", "--extract"],
                input=content,
                capture_output=True,
                timeout=30,
                cwd=scratch,
                env=environment,
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise ValueError("PDF page extraction exceeded its 30-second limit.") from None
    if result.returncode != 0 or len(result.stdout) > 12 * 1024 * 1024:
        raise ValueError("PDF extraction failed or exceeded the fixed process/output limits.")
    try:
        rows = json.loads(result.stdout)
        return tuple(PdfPage(**row) for row in rows)
    except (ValueError, TypeError):
        raise ValueError("The PDF reader returned an invalid page record.") from None


class NtrsClient:
    """Observed official NTRS JSON interface and same-origin public PDF links."""

    def __init__(self, client: httpx.Client):
        self.client = client

    def _capture(self, url: str, limit: int) -> Capture:
        parsed = urlsplit(url)
        if parsed.scheme != "https" or parsed.netloc != "ntrs.nasa.gov" or parsed.fragment:
            raise SourceUnavailable("NTRS acquisition is restricted to the official HTTPS origin.")
        try:
            with self.client.stream("GET", url, timeout=30, follow_redirects=False) as response:
                response.raise_for_status()
                content = bytearray()
                for chunk in response.iter_bytes():
                    if len(content) + len(chunk) > limit:
                        raise SourceUnavailable(
                            "NTRS response exceeds the selected acquisition limit."
                        )
                    content.extend(chunk)
        except httpx.HTTPError:
            raise SourceUnavailable("The official NTRS source is unavailable.") from None
        return Capture(bytes(content), url, datetime.now(UTC).isoformat())

    def metadata(self, identifier: str) -> Capture:
        citation_url(identifier)
        capture = self._capture(f"{NTRS_ORIGIN}/api/citations/{identifier}", 2 * 1024 * 1024)
        try:
            record = json.loads(capture.content)
            if str(record["id"]) != identifier or record.get("distribution") != "PUBLIC":
                raise ValueError
            if not isinstance(record.get("title"), str):
                raise ValueError
        except (ValueError, KeyError, TypeError):
            raise SourceUnavailable(
                "NTRS metadata identity or public distribution is unresolved."
            ) from None
        return capture

    def pdf(self, identifier: str, metadata: dict[str, Any]) -> Capture | None:
        citation_url(identifier)
        candidates = [
            item
            for item in metadata.get("downloads", [])
            if item.get("mimetype") == "application/pdf" and item.get("draft") is False
        ]
        if not candidates:
            return None
        link = candidates[0].get("links", {}).get("pdf")
        prefix = f"/api/citations/{identifier}/downloads/"
        if not isinstance(link, str) or not link.startswith(prefix) or ".." in link:
            raise SourceUnavailable("NTRS download link is outside the selected citation.")
        url = urljoin(NTRS_ORIGIN, link)
        return self._capture(url, MAX_DOCUMENT_BYTES)


def capture_ntrs_document(
    client: NtrsClient,
    identifier: str,
    source_snapshot_id: str,
    associated_investigations: tuple[str, ...],
    directory: Path,
) -> dict[str, Any]:
    """Retain an NTRS citation and PDF locally; do not grant redistribution rights."""
    metadata_capture = client.metadata(identifier)
    metadata = json.loads(metadata_capture.content)
    record: dict[str, Any] = {
        "schema_version": 1,
        "source_id": f"NTRS:{identifier}",
        "document_id": identifier,
        "source_snapshot_id": source_snapshot_id,
        "associated_investigations": associated_investigations,
        "title": metadata["title"],
        "source_url": citation_url(identifier),
        "metadata": {
            "path": write_immutable(directory, metadata_capture.content),
            "sha256": metadata_capture.sha256,
            "byte_size": len(metadata_capture.content),
            "source_url": metadata_capture.source_url,
        },
        "fetched_at": metadata_capture.fetched_at,
        "distribution": metadata["distribution"],
        "copyright": metadata.get("copyright"),
        "redistribution": "not_authorized_by_public_distribution_alone",
        "abstract": metadata.get("abstract") or "",
        "status": "metadata_available",
        "pdf": None,
        "pages": None,
        "extraction_method": "pypdf-plain-page-text-v2",
        "reader_version": version("pypdf"),
        "extraction_limits": {
            "wall_seconds": 30,
            "address_space_bytes": 512 * 1024 * 1024,
            "source_bytes": MAX_DOCUMENT_BYTES,
        },
        "limitations": [
            "Public NTRS distribution does not settle unrestricted redistribution rights.",
            "Page text does not establish table semantics, image measurements or OCR.",
            "A citation association is not a new experimental run or independent replication.",
        ],
    }
    try:
        pdf = client.pdf(identifier, metadata)
    except SourceUnavailable as error:
        pdf = None
        record["status"] = "pdf_acquisition_unavailable"
        record["acquisition_error"] = str(error)
    if pdf is not None:
        record["pdf"] = {
            "path": write_immutable(directory, pdf.content),
            "sha256": pdf.sha256,
            "byte_size": len(pdf.content),
            "source_url": pdf.source_url,
        }
        try:
            pages = extract_pdf_pages_bounded(pdf.content)
            extracted = json.dumps(
                [asdict(page) for page in pages], ensure_ascii=False, sort_keys=True
            ).encode()
            record["pages"] = {
                "path": write_immutable(directory, extracted),
                "sha256": hashlib.sha256(extracted).hexdigest(),
                "byte_size": len(extracted),
                "page_count": len(pages),
            }
            unavailable = [page.page for page in pages if page.extraction_error]
            record["status"] = (
                "partial_page_text_available" if unavailable else "page_text_available"
            )
            if unavailable:
                record["unavailable_text_pages"] = unavailable
                record["limitations"].append(
                    "Some page text exceeded decoding limits; those pages remain available "
                    "in the original NASA document and are excluded from text retrieval."
                )
        except ValueError as error:
            record["status"] = "text_extraction_unavailable"
            record["extraction_error"] = str(error)
    encoded = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
    path = write_immutable(directory, encoded)
    reference = {
        "path": path,
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byte_size": len(encoded),
    }
    pointer = directory / f"{identifier}.json"
    with tempfile.NamedTemporaryFile(dir=directory, mode="w", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(reference, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        temporary.replace(pointer)
    finally:
        temporary.unlink(missing_ok=True)
    return {**record, "capture_id": reference["sha256"]}


def load_ntrs_document(
    directory: Path, identifier: str, source_snapshot_id: str, capture_id: str | None = None
) -> dict[str, Any] | None:
    citation_url(identifier)
    if capture_id is not None:
        if not re.fullmatch(r"[0-9a-f]{64}", capture_id):
            raise ValueError("Invalid NTRS capture identifier.")
        path = directory / "objects" / capture_id
        if not path.is_file():
            return None
        reference = {
            "path": f"objects/{capture_id}",
            "sha256": capture_id,
            "byte_size": path.stat().st_size,
        }
    else:
        pointer = directory / f"{identifier}.json"
        if not pointer.is_file():
            return None
        reference = json.loads(pointer.read_bytes())
    record = checked_json(directory, reference)
    if record["source_snapshot_id"] != source_snapshot_id or record["document_id"] != identifier:
        return None
    checked_json(directory, record["metadata"])
    return {**record, "capture_id": reference["sha256"]}


def read_document_pages(directory: Path, record: dict[str, Any]) -> list[dict[str, Any]]:
    reference = record.get("pages")
    if reference is None:
        raise ValueError("This source has no extracted page text.")
    root = directory.resolve()
    original = record.get("pdf")
    if original is None:
        raise ValueError("Extracted pages have no original PDF reference.")
    original_path = (root / original["path"]).resolve()
    if not original_path.is_relative_to(root):
        raise ValueError("Original PDF reference is outside the source collection.")
    original_bytes = original_path.read_bytes()
    if (
        len(original_bytes) != original["byte_size"]
        or hashlib.sha256(original_bytes).hexdigest() != original["sha256"]
    ):
        raise ValueError("The retained original PDF differs from its source hash.")
    path = (root / reference["path"]).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Page text reference is outside the source collection.")
    content = path.read_bytes()
    if (
        len(content) != reference["byte_size"]
        or hashlib.sha256(content).hexdigest() != reference["sha256"]
    ):
        raise ValueError("Extracted PDF pages fail their frozen checksum.")
    pages = json.loads(content)
    if not isinstance(pages, list) or len(pages) != reference["page_count"]:
        raise ValueError("The extracted page index is inconsistent.")
    for index, page in enumerate(pages, start=1):
        if (
            page["page"] != index
            or hashlib.sha256(page["text"].encode()).hexdigest() != page["text_sha256"]
        ):
            raise ValueError("An extracted PDF page differs from its source-text hash.")
    return pages


def main() -> None:
    if sys.argv[1:] != ["--extract"]:
        raise SystemExit("Use the fixed --extract mode through the bounded reader.")
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
    resource.setrlimit(resource.RLIMIT_FSIZE, (12 * 1024 * 1024, 12 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    content = sys.stdin.buffer.read(MAX_DOCUMENT_BYTES + 1)
    pages = extract_pdf_pages(content)
    sys.stdout.write(json.dumps([asdict(page) for page in pages], ensure_ascii=False))


if __name__ == "__main__":
    main()

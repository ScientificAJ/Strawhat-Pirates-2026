"""Bounded access to observed NASA PSI website services and frozen CSV inputs.

These endpoints are frontend interfaces, not a guaranteed supported public API.
Download URLs expire and are used in memory only. Stored identifiers point to
the resolver and file version, never the temporary S3 URL.
"""

import csv
import hashlib
import io
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import httpx
from nova_ember.domain.source import RawTable, SourceRow

PSI_BASE_URL = "https://psi.nasa.gov/geode-py/ws"
CATALOG_URL = f"{PSI_BASE_URL}/repo/search?source=psi&type=investigation&size=200"
DOWNLOAD_HOSTS = frozenset(
    {"psi.nasa.gov", "psi-repo-prod.s3.amazonaws.com", "psi-curation-prod.s3.amazonaws.com"}
)
MAX_METADATA_BYTES = 8 * 1024 * 1024
# SLICE's complete file metadata exceeds 8 MiB; this bound applies to manifests,
# never to automatic acquisition of the listed scientific assets.
MAX_MANIFEST_BYTES = 32 * 1024 * 1024
MAX_ASSET_BYTES = 5 * 1024 * 1024


class SourceUnavailable(ValueError):
    """Source access or structure failed; no substitute content was created."""


@dataclass(frozen=True)
class Capture:
    content: bytes
    source_url: str
    fetched_at: str

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.content).hexdigest()


def validate_accession(accession: str) -> str:
    if not isinstance(accession, str) or not re.fullmatch(r"PSI-[1-9][0-9]{0,5}", accession):
        raise ValueError("Invalid PSI accession")
    return accession


def metadata_url(accession: str) -> str:
    return f"{PSI_BASE_URL}/repo/investigations/{validate_accession(accession)}"


def resolver_url(accession: str, file_name: str, file_version: int) -> str:
    validate_accession(accession)
    if not file_name or len(file_name) > 512 or any(c in file_name for c in "\\/\x00\r\n"):
        raise ValueError("A file name, not a path, is required")
    if type(file_version) is not int or file_version < 1:
        raise ValueError("A positive file version is required")
    query = urlencode({"file": file_name, "version": file_version, "redirect": "false"})
    return f"{PSI_BASE_URL}/studies/{accession}/download?{query}"


def validate_download_url(url: str) -> None:
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in DOWNLOAD_HOSTS
        or parsed.port not in (None, 443)
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
    ):
        raise SourceUnavailable("Download destination is outside the observed public PSI hosts")


class PsiClient:
    """Use an injected HTTP client with bounded reads and validated redirects."""

    def __init__(self, client: httpx.Client):
        self.client = client

    def _capture(self, method: str, url: str, limit: int, payload: Any = None) -> Capture:
        try:
            with self.client.stream(
                method, url, json=payload, timeout=30, follow_redirects=False
            ) as response:
                response.raise_for_status()
                chunks = bytearray()
                for chunk in response.iter_bytes():
                    if len(chunks) + len(chunk) > limit:
                        raise SourceUnavailable("Source response exceeds the allowed size")
                    chunks.extend(chunk)
        except httpx.HTTPError:
            raise SourceUnavailable("NASA PSI source request failed") from None
        return Capture(bytes(chunks), url, datetime.now(UTC).isoformat())

    def fetch_catalog(self) -> Capture:
        capture = self._capture("GET", CATALOG_URL, MAX_METADATA_BYTES)
        catalog_records(capture.content)
        return capture

    def fetch_metadata(self, accession: str) -> Capture:
        capture = self._capture("GET", metadata_url(accession), MAX_METADATA_BYTES)
        try:
            metadata = json.loads(capture.content)
        except json.JSONDecodeError:
            raise SourceUnavailable("NASA PSI metadata is not JSON") from None
        if (
            not isinstance(metadata, dict)
            or metadata.get("accession") != accession
            or metadata.get("public") is not True
        ):
            raise SourceUnavailable("Metadata identity or public access does not match")
        if (
            type(metadata.get("version")) is not int
            or metadata["version"] < 1
            or not isinstance(metadata.get("title"), str)
        ):
            raise SourceUnavailable("Metadata version or title is invalid")
        return capture

    def fetch_manifest(self, accession: str, investigation_version: int) -> Capture:
        validate_accession(accession)
        if type(investigation_version) is not int or investigation_version < 1:
            raise ValueError("A positive investigation version is required")
        payload = {
            "folder": f"{accession}/",
            "fileType": "study",
            "studyId": accession,
            "version": investigation_version,
            "obfuscationcode": "",
        }
        capture = self._capture("POST", f"{PSI_BASE_URL}/files/v2", MAX_MANIFEST_BYTES, payload)
        manifest_files(capture.content)
        return capture

    def download(self, accession: str, file_name: str, file_version: int) -> Capture:
        stable_url = resolver_url(accession, file_name, file_version)
        resolved = self._capture("GET", stable_url, 16 * 1024)
        destination = resolved.content.decode("utf-8").strip()
        if not destination.startswith("https://"):
            raise SourceUnavailable("Download resolver did not return a public HTTPS URL")
        validate_download_url(destination)
        capture = self._capture("GET", destination, MAX_ASSET_BYTES)
        if capture.content.lstrip()[:100].lower().startswith((b"<!doctype html", b"<html")):
            raise SourceUnavailable("The download contains an HTML page instead of scientific data")
        return Capture(capture.content, stable_url, capture.fetched_at)


def catalog_records(content: bytes) -> list[dict[str, Any]]:
    try:
        data = json.loads(content)
        hits = data["hits"]["hits"]
        total = data["hits"]["total"]
        total_count = total["value"] if isinstance(total, dict) else total
        records = [item["_source"] for item in hits]
        if data.get("timed_out") or len(records) != total_count:
            raise SourceUnavailable("Catalog response is incomplete; pagination is required")
        for record in records:
            validate_accession(record["Accession"])
        if len({record["Accession"] for record in records}) != len(records):
            raise SourceUnavailable("Catalog contains duplicate investigation accessions")
        return records
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise SourceUnavailable("PSI catalog structure changed") from error


def manifest_files(content: bytes) -> list[dict[str, Any]]:
    try:
        data = json.loads(content)
        pending = list(data["files"])
        files: list[dict[str, Any]] = []
        while pending:
            item = pending.pop()
            if not isinstance(item, dict):
                raise SourceUnavailable("PSI manifest entry is not a record")
            children = item.get("files", [])
            if not isinstance(children, list):
                raise SourceUnavailable("PSI manifest children are not a list")
            if children:
                pending.extend(children)
            elif item.get("directory") is False:
                files.append(item)
        return sorted(files, key=lambda item: item["key"])
    except (KeyError, TypeError, json.JSONDecodeError) as error:
        raise SourceUnavailable("PSI manifest structure changed") from error


def parse_csv_bytes(content: bytes, encoding: str = "utf-8-sig") -> RawTable:
    """Decode explicitly; preserve blank cells and source lines, skipping empty records."""
    if encoding not in {"utf-8-sig", "utf-8", "cp1252"}:
        raise ValueError("Unreviewed CSV encoding")
    text = content.decode(encoding, errors="strict")
    reader = csv.reader(io.StringIO(text, newline=""), strict=True)
    try:
        headers = tuple(next(reader))
    except StopIteration:
        raise ValueError("CSV has no header") from None
    if not headers or not any(cell.strip() for cell in headers):
        raise ValueError("CSV has an empty header")
    rows: list[SourceRow] = []
    empty_count = 0
    previous_end = reader.line_num
    for cells in reader:
        first_line = previous_end + 1
        previous_end = reader.line_num
        if not any(cell.strip() for cell in cells):
            empty_count += 1
            continue
        rows.append(SourceRow(first_line, reader.line_num, tuple(cells)))
    return RawTable(headers, tuple(rows), encoding, reader.line_num, empty_count)


def load_snapshot(directory: Path) -> dict[str, Any]:
    """Read a frozen source index and verify every referenced local input hash."""
    root = directory.resolve()
    snapshot = json.loads((root / "snapshot.json").read_bytes())
    if snapshot.get("schema_version") != 1:
        raise ValueError("Unsupported PSI snapshot schema")
    entries = [snapshot["catalog_response"], *snapshot["assets"], *snapshot["manifests"]]
    entries.extend(
        {"path": record["metadata_path"], "sha256": record["metadata_sha256"]}
        for record in snapshot["investigations"]
    )
    for entry in entries:
        path = (root / entry["path"]).resolve()
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError("Snapshot path is not a local source file")
        if hashlib.sha256(path.read_bytes()).hexdigest() != entry["sha256"]:
            raise ValueError(f"Source checksum mismatch: {entry['path']}")
    return snapshot


def read_csv_asset(directory: Path, asset: dict[str, Any]) -> RawTable:
    root = directory.resolve()
    path = (root / asset["path"]).resolve()
    if not path.is_relative_to(root):
        raise ValueError("Source path is outside the snapshot")
    content = path.read_bytes()
    if hashlib.sha256(content).hexdigest() != asset["sha256"]:
        raise ValueError("CSV source checksum mismatch")
    return parse_csv_bytes(content, asset["encoding"])

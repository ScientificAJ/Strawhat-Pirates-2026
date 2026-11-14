"""Streaming manifest-bound source acquisition with resumable, bounded local caching."""

from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import shutil
import time
from collections.abc import Callable
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

from .psi import SourceUnavailable, resolver_url, validate_download_url
from .refresh import _atomic_json


class DownloadStopped(ValueError):
    """Cancellation, lease loss or shutdown stopped this transfer without publication."""


class DownloadLimit(ValueError):
    """The declared transfer, elapsed time or disk profile cannot support this request."""


@dataclass(frozen=True)
class DownloadProfile:
    max_transfer_bytes: int = 256 * 1024 * 1024
    max_cache_bytes: int = 2 * 1024 * 1024 * 1024
    disk_reserve_bytes: int = 128 * 1024 * 1024
    deadline_seconds: int = 600
    chunk_bytes: int = 128 * 1024

    def __post_init__(self) -> None:
        if any(type(value) is not int or value <= 0 for value in asdict(self).values()):
            raise ValueError("Source transfer profile limits must be positive integers.")
        if self.max_transfer_bytes > self.max_cache_bytes or self.chunk_bytes > 4 * 1024 * 1024:
            raise ValueError(
                "Transfer bytes must fit cache capacity and chunk size must be bounded."
            )

    @classmethod
    def from_environment(cls) -> DownloadProfile:
        return cls(
            max_transfer_bytes=int(os.environ.get("NOVA_SOURCE_TRANSFER_BYTES", 256 * 1024 * 1024)),
            max_cache_bytes=int(os.environ.get("NOVA_SOURCE_CACHE_BYTES", 2 * 1024 * 1024 * 1024)),
            disk_reserve_bytes=int(
                os.environ.get("NOVA_SOURCE_DISK_RESERVE_BYTES", 128 * 1024 * 1024)
            ),
            deadline_seconds=int(os.environ.get("NOVA_SOURCE_TRANSFER_SECONDS", 600)),
        )


@dataclass(frozen=True)
class SourceRequest:
    snapshot_id: str
    accession: str
    investigation_version: int
    file_name: str
    file_version: int
    manifest_key: str
    manifest_sha256: str
    declared_bytes: int
    license: str | None
    license_scope: str = "investigation_metadata"

    def __post_init__(self) -> None:
        resolver_url(self.accession, self.file_name, self.file_version)
        if type(self.investigation_version) is not int or self.investigation_version < 1:
            raise ValueError("A positive investigation version is required.")
        if type(self.declared_bytes) is not int or self.declared_bytes < 1:
            raise ValueError("A selected source requires its positive exact declared byte count.")
        for value in (self.snapshot_id, self.manifest_sha256):
            if len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
                raise ValueError("Source snapshot/manifest identifiers must be SHA-256 digests.")

    @property
    def cache_identity(self) -> dict:
        return {key: value for key, value in asdict(self).items() if key != "snapshot_id"}

    @property
    def key(self) -> str:
        return hashlib.sha256(
            json.dumps(self.cache_identity, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()


Progress = Callable[[str, int, int], None]


def _fingerprint(path: Path) -> dict:
    status = path.stat()
    return {
        "bytes": status.st_size,
        "mtime_ns": status.st_mtime_ns,
        "inode": status.st_ino,
        "device": status.st_dev,
    }


def _digest_file(path: Path, request: SourceRequest, progress: Progress) -> str:
    digest = hashlib.sha256()
    read = 0
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            read += len(chunk)
            progress("verifying", read, request.declared_bytes)
            digest.update(chunk)
    if read != request.declared_bytes:
        raise SourceUnavailable("Retained source length differs from its manifest.")
    return digest.hexdigest()


def _cache_root(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name in ["objects", "requests", "partial"]:
        (directory / name).mkdir(exist_ok=True)


def cached_source(
    directory: Path, key: str, *, verify: bool = True, progress: Progress | None = None
) -> tuple[dict, Path] | None:
    if len(key) != 64 or any(c not in "0123456789abcdef" for c in key):
        raise ValueError("Invalid source cache identity.")
    reference = directory / "requests" / f"{key}.json"
    if not reference.is_file():
        return None
    result = json.loads(reference.read_bytes())
    digest = result["sha256"]
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("Invalid retained source checksum.")
    path = directory / "objects" / digest
    if not path.is_file():
        return None
    if path.is_symlink() or path.stat().st_size != result["byte_size"]:
        raise SourceUnavailable("Cached source object differs from its recorded size.")
    if verify and result.get("verified_stat") != _fingerprint(path):
        request = SourceRequest(**result["source"])
        actual = _digest_file(path, request, progress or (lambda *_args: None))
        if actual != digest:
            raise SourceUnavailable("Cached source object fails its SHA-256 verification.")
        result["verified_stat"] = _fingerprint(path)
    result["last_accessed_at"] = datetime.now(UTC).isoformat()
    _atomic_json(reference, result)
    return result, path


def _cache_bytes(directory: Path) -> int:
    return sum(
        path.stat().st_size for path in (directory / "objects").iterdir() if path.is_file()
    ) + sum(
        path.stat().st_size for path in (directory / "partial").glob("*.part") if path.is_file()
    )


def _make_space(
    directory: Path, remaining: int, profile: DownloadProfile, pinned_keys: set[str], own_key: str
) -> None:
    if remaining < 0:
        raise SourceUnavailable("Partial source is longer than the manifest.")
    groups: dict[str, list[tuple[Path, dict]]] = {}
    for path in (directory / "requests").glob("*.json"):
        record = json.loads(path.read_bytes())
        groups.setdefault(record["sha256"], []).append((path, record))
    for digest, entries in sorted(
        groups.items(), key=lambda item: min(row[1].get("last_accessed_at", "") for row in item[1])
    ):
        if _cache_bytes(directory) + remaining <= profile.max_cache_bytes:
            break
        if any(path.stem in pinned_keys | {own_key} for path, _record in entries):
            continue
        for path, _record in entries:
            path.unlink(missing_ok=True)
        (directory / "objects" / digest).unlink(missing_ok=True)
    for part in sorted(
        (directory / "partial").glob("*.part"), key=lambda path: path.stat().st_mtime
    ):
        if _cache_bytes(directory) + remaining <= profile.max_cache_bytes:
            break
        if part.stem in pinned_keys | {own_key}:
            continue
        part.unlink(missing_ok=True)
        part.with_suffix(".json").unlink(missing_ok=True)
    if _cache_bytes(directory) + remaining > profile.max_cache_bytes:
        raise DownloadLimit(
            "The source cache is full of active/pinned inputs; delete or "
            "finish a temporary source job before retrying."
        )
    if shutil.disk_usage(directory).free < remaining + profile.disk_reserve_bytes:
        raise DownloadLimit(
            "The host lacks free disk beyond the configured source-transfer reserve."
        )


def _resolve(client: httpx.Client, request: SourceRequest) -> str:
    try:
        with client.stream(
            "GET",
            resolver_url(request.accession, request.file_name, request.file_version),
            timeout=30,
            follow_redirects=False,
        ) as response:
            response.raise_for_status()
            data = bytearray()
            for chunk in response.iter_bytes():
                if len(data) + len(chunk) > 16384:
                    raise SourceUnavailable(
                        "NASA source resolver exceeds its bounded response profile."
                    )
                data.extend(chunk)
    except httpx.HTTPError:
        raise SourceUnavailable(
            "NASA source resolution failed; no destination URL was retained."
        ) from None
    try:
        destination = bytes(data).decode("utf-8").strip()
    except UnicodeError:
        raise SourceUnavailable(
            "NASA source resolver did not return a readable HTTPS destination."
        ) from None
    validate_download_url(destination)
    return destination


def _format_check(path: Path, filename: str) -> dict:
    with path.open("rb") as stream:
        prefix = stream.read(4096)
    if prefix.lstrip().lower().startswith((b"<!doctype html", b"<html")):
        raise SourceUnavailable(
            "NASA download returned an HTML error page instead of the selected scientific asset."
        )
    suffix = filename.casefold()
    signatures = [
        ((".pdf",), lambda: prefix.lstrip().startswith(b"%PDF-"), "application/pdf"),
        ((".png",), lambda: prefix.startswith(b"\x89PNG\r\n\x1a\n"), "image/png"),
        ((".jpg", ".jpeg"), lambda: prefix.startswith(b"\xff\xd8\xff"), "image/jpeg"),
        ((".mp4",), lambda: len(prefix) > 12 and prefix[4:8] == b"ftyp", "video/mp4"),
        ((".zip", ".xlsx", ".docx"), lambda: prefix.startswith(b"PK\x03\x04"), "application/zip"),
        (
            (".xls",),
            lambda: prefix.startswith(bytes.fromhex("D0CF11E0A1B11AE1")),
            "application/vnd.ms-excel",
        ),
        ((".rtf",), lambda: prefix.startswith(b"{\\rtf"), "application/rtf"),
    ]
    for extensions, check, media_type in signatures:
        if suffix.endswith(extensions):
            return {
                "status": "signature_matches_source_suffix"
                if check()
                else "signature_mismatch_requires_review",
                "media_type": media_type if check() else "application/octet-stream",
                "scientific_normalization": "not_established",
            }
    return {
        "status": "raw_source_requires_registered_reader",
        "media_type": "application/octet-stream",
        "scientific_normalization": "not_established",
    }


def _publish_completed(
    directory: Path,
    request: SourceRequest,
    part: Path,
    response_etag: str | None,
    checkpoint: Callable[[str, int], None],
) -> dict:
    metadata_path = part.with_suffix(".json")
    checkpoint("validating_source", request.declared_bytes)
    format_status = _format_check(part, request.file_name)
    digest = _digest_file(part, request, lambda stage, amount, _total: checkpoint(stage, amount))
    destination = directory / "objects" / digest
    if destination.exists():
        if (
            _digest_file(
                destination,
                request,
                lambda stage, amount, _total: checkpoint(stage, amount),
            )
            != digest
        ):
            raise SourceUnavailable("An existing source cache object fails its content checksum.")
        part.unlink()
    else:
        part.chmod(0o444)
        os.replace(part, destination)
    result = {
        "cache_key": request.key,
        "sha256": digest,
        "byte_size": request.declared_bytes,
        "source": asdict(request),
        "source_url": resolver_url(request.accession, request.file_name, request.file_version),
        "fetched_at": datetime.now(UTC).isoformat(),
        "last_accessed_at": datetime.now(UTC).isoformat(),
        "observed_etag": response_etag,
        "checksum_origin": "locally_calculated_sha256_not_NASA_attestation",
        "format": format_status,
        "scientific_corpus_promoted": False,
        "cache_hit": False,
        "verified_stat": _fingerprint(destination),
    }
    _atomic_json(directory / "requests" / f"{request.key}.json", result)
    metadata_path.unlink(missing_ok=True)
    checkpoint("source_ready", request.declared_bytes)
    return result


def acquire_source(
    client: httpx.Client,
    directory: Path,
    request: SourceRequest,
    profile: DownloadProfile,
    *,
    progress: Progress = lambda *_args: None,
    pinned_keys: set[str] | None = None,
    local_source: tuple[Path, str] | None = None,
) -> dict:
    _cache_root(directory)
    started = time.monotonic()
    pinned_keys = pinned_keys or set()

    def checkpoint(stage: str, amount: int) -> None:
        if time.monotonic() - started > profile.deadline_seconds:
            raise DownloadLimit(
                "The source transfer exceeded its configured elapsed-time "
                "profile; the partial capture can resume."
            )
        progress(stage, amount, request.declared_bytes)

    with (directory / "transfer.lock").open("a+") as lock:
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                checkpoint("waiting_for_source_transfer", 0)
                time.sleep(0.2)
        try:
            hit = cached_source(
                directory,
                request.key,
                progress=lambda stage, amount, _total: checkpoint(stage, amount),
            )
            if hit is not None:
                result, _path = hit
                if SourceRequest(**result["source"]).cache_identity != request.cache_identity:
                    raise SourceUnavailable(
                        "The source cache identity differs from its frozen request."
                    )
                checkpoint("source_cached", request.declared_bytes)
                return {
                    **result,
                    "cache_hit": True,
                    "captured_in_snapshot_id": result["source"]["snapshot_id"],
                    "source": asdict(request),
                }
            part = directory / "partial" / f"{request.key}.part"
            metadata_path = part.with_suffix(".json")
            if local_source is not None:
                original, expected_sha256 = local_source
                part.unlink(missing_ok=True)
                _make_space(directory, request.declared_bytes, profile, pinned_keys, request.key)
                digest = hashlib.sha256()
                copied = 0
                with original.open("rb") as source, part.open("wb") as target:
                    while chunk := source.read(profile.chunk_bytes):
                        copied += len(chunk)
                        checkpoint("copying_retained_source", copied)
                        if copied > request.declared_bytes:
                            raise SourceUnavailable(
                                "Retained source exceeds its selected manifest size."
                            )
                        digest.update(chunk)
                        target.write(chunk)
                    target.flush()
                    os.fsync(target.fileno())
                if digest.hexdigest() != expected_sha256 or copied != request.declared_bytes:
                    raise SourceUnavailable(
                        "Retained corpus bytes differ from the frozen source identity."
                    )
                result = _publish_completed(directory, request, part, None, checkpoint)
                return {**result, "acquisition_origin": "retained_corpus_bytes", "network_bytes": 0}
            if request.declared_bytes > profile.max_transfer_bytes:
                raise DownloadLimit(
                    "The declared source exceeds the owner-configured transfer profile; "
                    "select a smaller asset or change the host profile explicitly."
                )
            retained = json.loads(metadata_path.read_bytes()) if metadata_path.is_file() else {}
            if (
                retained
                and SourceRequest(**retained["source"]).cache_identity != request.cache_identity
            ):
                raise SourceUnavailable(
                    "Partial bytes belong to a different frozen source request."
                )
            offset = part.stat().st_size if part.exists() else 0
            if offset and not retained:
                part.unlink()
                offset = 0
            etag = retained.get("etag")
            resumable = (
                offset > 0
                and isinstance(etag, str)
                and re.fullmatch(r'"[^"\r\n]*"', etag) is not None
            )
            complete_partial = offset == request.declared_bytes
            if offset and not resumable and not complete_partial:
                part.unlink()
                offset = 0
            _make_space(
                directory, request.declared_bytes - offset, profile, pinned_keys, request.key
            )
            if complete_partial:
                return _publish_completed(directory, request, part, etag, checkpoint)
            headers = {"Accept-Encoding": "identity"}
            if resumable:
                assert isinstance(etag, str)
                headers.update({"Range": f"bytes={offset}-", "If-Range": etag})
            checkpoint("resolving_source", offset)
            response_etag = None
            for resolution in range(2):
                destination = _resolve(client, request)
                try:
                    with client.stream(
                        "GET",
                        destination,
                        headers=headers,
                        timeout=httpx.Timeout(30, connect=10),
                        follow_redirects=False,
                    ) as response:
                        if response.status_code == 403 and resolution == 0:
                            continue
                        response.raise_for_status()
                        if response.headers.get("Content-Encoding", "identity").lower() not in (
                            "",
                            "identity",
                        ):
                            raise SourceUnavailable(
                                "Source transfer content encoding prevents exact byte-range "
                                "verification."
                            )
                        response_etag = response.headers.get("ETag")
                        append = False
                        if offset and response.status_code == 206:
                            match = re.fullmatch(
                                r"bytes ([0-9]+)-([0-9]+)/([0-9]+)",
                                response.headers.get("Content-Range", ""),
                            )
                            if (
                                match is None
                                or int(match[1]) != offset
                                or int(match[3]) != request.declared_bytes
                                or int(match[2]) != request.declared_bytes - 1
                                or (response_etag is not None and response_etag != etag)
                            ):
                                raise SourceUnavailable(
                                    "NASA resumed range/validator differs from the frozen "
                                    "partial source."
                                )
                            append = True
                        elif response.status_code == 200:
                            offset = 0
                        else:
                            raise SourceUnavailable(
                                "NASA source transfer returned an unsupported byte-range response."
                            )
                        length = response.headers.get("Content-Length")
                        if length is not None and (
                            not length.isdigit() or int(length) != request.declared_bytes - offset
                        ):
                            raise SourceUnavailable(
                                "NASA source response length differs from the selected "
                                "manifest/range."
                            )
                        _atomic_json(
                            metadata_path,
                            {
                                "source": asdict(request),
                                "etag": response_etag,
                                "started_at": datetime.now(UTC).isoformat(),
                            },
                        )
                        transferred = offset
                        with part.open("ab" if append else "wb", buffering=0) as stream:
                            for chunk in response.iter_bytes(chunk_size=profile.chunk_bytes):
                                checkpoint("transferring", transferred)
                                if transferred + len(chunk) > request.declared_bytes:
                                    raise SourceUnavailable(
                                        "NASA source exceeded the declared asset size."
                                    )
                                if (
                                    shutil.disk_usage(directory).free
                                    < len(chunk) + profile.disk_reserve_bytes
                                ):
                                    raise DownloadLimit(
                                        "Host free disk reached the source-transfer reserve."
                                    )
                                stream.write(chunk)
                                transferred += len(chunk)
                            stream.flush()
                            os.fsync(stream.fileno())
                        if transferred != request.declared_bytes:
                            raise SourceUnavailable(
                                "NASA transfer ended before the declared source size; the "
                                "partial capture can resume."
                            )
                        break
                except httpx.HTTPError:
                    raise SourceUnavailable(
                        "NASA source transfer was interrupted; its validated partial "
                        "capture can resume."
                    ) from None
            else:
                raise SourceUnavailable(
                    "NASA source destination remained unavailable after one re-resolution."
                )
            return _publish_completed(directory, request, part, response_etag, checkpoint)
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)

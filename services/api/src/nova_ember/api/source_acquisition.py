"""Receipt-scoped selective NASA source transfers without canonical scientific promotion."""

from __future__ import annotations

import csv
import io
import json
import math
import os
import subprocess
import sys
import tempfile
import time
from dataclasses import asdict
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
from threading import Event
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Header, Query, Request, Response
from fastapi.responses import FileResponse
from nova_ember.adapters.download import (
    DownloadLimit,
    DownloadProfile,
    DownloadStopped,
    SourceRequest,
    acquire_source,
    cached_source,
)
from nova_ember.adapters.manifests import checked_json, exact_byte_count
from nova_ember.adapters.psi import manifest_files
from nova_ember.evidence.contracts import Accession, Contract, Digest
from pydantic import Field, model_validator

from . import jobs
from .artifacts import publish_artifact
from .config import Settings
from .database import connect
from .discovery import Discovery
from .repository import Corpus, MissingSource


class MediaSelection(Contract):
    kind: Literal["frame", "clip"] = "frame"
    time_seconds: Annotated[float, Field(strict=True, ge=0)] = 0.0
    duration_seconds: Annotated[float | None, Field(strict=True, gt=0, le=10)] = None

    @model_validator(mode="after")
    def validate_duration(self) -> MediaSelection:
        if self.kind == "clip" and self.duration_seconds is None:
            raise ValueError("A clip requires its selected duration, at most ten seconds.")
        if self.kind == "frame" and self.duration_seconds is not None:
            raise ValueError("A selected frame has no clip duration.")
        return self


class AcquisitionInputs(Contract):
    snapshot_id: Digest
    accession: Accession
    investigation_version: Annotated[int, Field(strict=True, ge=1)]
    file_name: str = Field(min_length=1, max_length=512)
    file_version: Annotated[int, Field(strict=True, ge=1)]
    manifest_key: str = Field(min_length=1, max_length=2048)
    manifest_sha256: Digest
    declared_bytes: Annotated[int, Field(strict=True, ge=1)]
    preview: MediaSelection | None = None


class PreviewByteLimit(ValueError):
    pass


class LimitedSource(io.RawIOBase):
    def __init__(self, source, total_bytes: int, byte_limit: int):
        self.source = source
        self.remaining = min(total_bytes, byte_limit)
        self.limited = total_bytes > byte_limit

    def readable(self) -> bool:
        return True

    def readinto(self, buffer) -> int:
        if self.remaining == 0:
            if self.limited:
                raise PreviewByteLimit("Raw source preview reached its byte profile.")
            return 0
        count = self.source.readinto(memoryview(buffer)[: self.remaining])
        self.remaining -= count
        return count


def resolve_source_request(corpus: Corpus, selection: AcquisitionInputs) -> SourceRequest:
    snapshot = corpus.snapshot(selection.snapshot_id)
    record = next(
        (
            row
            for row in snapshot["manifest"]["investigations"]
            if row["accession"] == selection.accession
        ),
        None,
    )
    if record is None or record["version"] != selection.investigation_version:
        raise MissingSource(
            "Selected source investigation/version is absent from the frozen snapshot."
        )
    discovery = Discovery(corpus)
    collection = discovery.manifest_collection(snapshot)
    references = (
        collection["manifests"] if collection else snapshot["manifest"].get("manifests", [])
    )
    reference = next((row for row in references if row["accession"] == selection.accession), None)
    if reference is None or reference["sha256"] != selection.manifest_sha256:
        raise MissingSource(
            "Selected source manifest is absent or changed; refresh the explicit source selection."
        )
    directory = (
        corpus.settings.object_directory.parent / "catalog-manifests"
        if collection
        else corpus.settings.fixture_directory
    )
    document = checked_json(directory, reference)
    matches = [
        row
        for row in manifest_files(json.dumps(document).encode())
        if row["key"] == selection.manifest_key
        and row.get("version") == selection.file_version
        and row["key"].rsplit("/", 1)[-1] == selection.file_name
    ]
    identities = {
        tuple(
            row.get(key)
            for key in (
                "id",
                "key",
                "version",
                "bytes_size",
                "restricted",
                "restrictedAccess",
                "visible",
            )
        )
        for row in matches
    }
    if not matches or len(identities) != 1:
        raise MissingSource("Select one exact file key/name/version from the frozen manifest.")
    entry = matches[0]
    if (
        entry.get("restricted") is not False
        or entry.get("restrictedAccess")
        or entry.get("visible") is not True
    ):
        raise MissingSource(
            "The selected manifest does not establish public visible access to this file."
        )
    actual = exact_byte_count(entry.get("bytes_size"))
    if actual is None or actual < 1 or actual != selection.declared_bytes:
        raise ValueError("The selected exact byte size differs from the frozen manifest.")
    return SourceRequest(
        selection.snapshot_id,
        selection.accession,
        selection.investigation_version,
        selection.file_name,
        selection.file_version,
        selection.manifest_key,
        selection.manifest_sha256,
        selection.declared_bytes,
        record.get("license"),
    )


def _local_original(corpus: Corpus, source: SourceRequest) -> tuple[dict, Path] | None:
    assets = corpus.snapshot(source.snapshot_id)["manifest"]["assets"]
    matches = [
        row
        for row in assets
        if row["accession"] == source.accession
        and row["investigation_version"] == source.investigation_version
        and row["file_name"] == source.file_name
        and row["file_version"] == source.file_version
    ]
    if not matches:
        return None
    if len(matches) != 1 or matches[0]["byte_size"] != source.declared_bytes:
        raise ValueError(
            "Retained original source identity is ambiguous or differs from the selected manifest."
        )
    asset = matches[0]
    path = corpus.settings.object_directory / asset["sha256"]
    if not path.is_file():
        raise MissingSource("The retained source object is missing.")
    return asset, path


def _pinned_cache_keys(settings: Settings) -> set[str]:
    with connect(settings.database_url) as connection:
        rows = connection.execute("""SELECT inputs,result FROM jobs WHERE kind='source_acquisition'
            AND status IN ('queued','running','succeeded') AND expires_at>now()""").fetchall()
    keys = set()
    for row in rows:
        if row["inputs"].get("source"):
            keys.add(SourceRequest(**row["inputs"]["source"]).key)
        if row["result"] and row["result"].get("cache_key"):
            keys.add(row["result"]["cache_key"])
    return keys


def _acquired_result(settings: Settings, job: dict) -> tuple[dict, Path]:
    if job["kind"] != "source_acquisition" or job["status"] != "succeeded" or not job.get("result"):
        raise jobs.JobNotFound("No completed original source is available for this job.")
    result = job["result"]
    cached = cached_source(settings.object_directory.parent / "source-cache", result["cache_key"])
    if cached is None:
        raise jobs.JobNotFound(
            "The temporary source cache entry is unavailable; reacquire its frozen source version."
        )
    record, path = cached
    if (
        record["sha256"] != result["sha256"]
        or record["byte_size"] != result["byte_size"]
        or SourceRequest(**record["source"]).cache_identity
        != SourceRequest(**result["source"]).cache_identity
    ):
        raise ValueError("Acquired source differs from the completed job result.")
    return result, path


def acquired_source_for_receipt_hash(
    settings: Settings, source_job_id: str, receipt_sha256: str
) -> tuple[dict, Path]:
    """Trusted follow-on workers must preserve the requesting browser's original scope."""
    if len(receipt_sha256) != 64 or any(c not in "0123456789abcdef" for c in receipt_sha256):
        raise jobs.JobNotFound("No accessible source job matches this owner.")
    with connect(settings.database_url) as connection:
        row = connection.execute(
            """SELECT id,kind,status,result FROM jobs WHERE id=%s
            AND receipt_sha256=%s AND expires_at>now()""",
            (str(UUID(source_job_id)), receipt_sha256),
        ).fetchone()
    if row is None:
        raise jobs.JobNotFound("No accessible source job matches this owner.")
    return _acquired_result(settings, row)


def acquired_execution_references(
    settings: Settings, snapshot_id: str, source_job_ids: list[str], receipt_sha256: str
) -> list[dict]:
    if len(source_job_ids) > 10 or len(set(source_job_ids)) != len(source_job_ids):
        raise ValueError("Select at most ten distinct acquired-source jobs.")
    references = []
    for identifier in source_job_ids:
        result, _path = acquired_source_for_receipt_hash(settings, identifier, receipt_sha256)
        if result["snapshot_id"] != snapshot_id:
            raise ValueError("Execution inputs must retain the declared frozen source snapshot.")
        if result["byte_size"] > 8 * 1024 * 1024:
            raise ValueError(
                "Select a source fitting the explicit eight MiB execution-input profile."
            )
        references.append(
            {
                "source_job_id": str(UUID(identifier)),
                "sha256": result["sha256"],
                "byte_size": result["byte_size"],
                "snapshot_id": snapshot_id,
                "source": result["source"],
                "file_name": result["source"]["file_name"],
            }
        )
    return references


def read_acquired_execution_input(
    settings: Settings, reference: dict, receipt_sha256: str
) -> tuple[str, bytes, dict]:
    result, path = acquired_source_for_receipt_hash(
        settings, reference["source_job_id"], receipt_sha256
    )
    if any(
        result[key] != reference[key] for key in ("sha256", "byte_size", "snapshot_id", "source")
    ):
        raise ValueError("The acquired input differs from its frozen execution reference.")
    if result["byte_size"] > 8 * 1024 * 1024:
        raise ValueError("Acquired execution input exceeds its profile.")
    data = path.read_bytes()
    if len(data) != result["byte_size"] or sha256(data).hexdigest() != result["sha256"]:
        raise ValueError("The acquired execution input fails its size/checksum verification.")
    return (
        result["source"]["file_name"],
        data,
        {
            "scientific_origin": "original_source_bytes",
            "source_job_id": reference["source_job_id"],
            "source": result["source"],
            "sha256": result["sha256"],
            "snapshot_id": result["snapshot_id"],
        },
    )


def _preview_bytes(path: Path, selection: MediaSelection, progress) -> tuple[bytes, str, str, dict]:
    suffix = ".png" if selection.kind == "frame" else ".mp4"
    preview_duration = None
    with tempfile.TemporaryDirectory(prefix="nova-source-preview-") as scratch:
        target = Path(scratch) / ("preview" + suffix)
        command = [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-protocol_whitelist",
            "file,pipe",
            "-noautorotate",
            "-ss",
            str(selection.time_seconds),
            "-i",
            str(path),
            "-map",
            "0:v:0",
            "-threads",
            "1",
            "-map_metadata",
            "-1",
            "-vf",
            r"scale=w=min(1280\,iw):h=min(720\,ih):force_original_aspect_ratio=decrease",
            "-fflags",
            "+bitexact",
        ]
        if selection.kind == "frame":
            command += ["-frames:v", "1", "-an"]
        else:
            command += [
                "-t",
                str(selection.duration_seconds),
                "-map",
                "0:a:0?",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-tune",
                "zerolatency",
                "-crf",
                "20",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-b:a",
                "64k",
                "-movflags",
                "+faststart",
            ]
        command += ["-fs", str(8 * 1024 * 1024), str(target)]
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "nova_ember.api.source_acquisition",
                "--preview-child",
                *command[1:],
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            env={
                "PATH": os.defpath,
                "OMP_NUM_THREADS": "1",
                "PYTHONPATH": os.environ.get("PYTHONPATH", ""),
            },
        )
        started = time.monotonic()
        try:
            while process.poll() is None:
                progress("preparing_selected_media", 0, 0)
                if time.monotonic() - started > 30:
                    raise DownloadLimit(
                        "Selected media preview exceeded its thirty-second CPU-worker profile."
                    )
                time.sleep(0.1)
            if (
                process.returncode
                or not target.is_file()
                or target.stat().st_size == 0
                or target.stat().st_size > 8 * 1024 * 1024
            ):
                raise ValueError(
                    "The selected source interval/frame is unavailable in the "
                    "bounded media profile."
                )
            data = target.read_bytes()
            if selection.kind == "clip":
                assert selection.duration_seconds is not None
                probe = subprocess.run(
                    [
                        "ffprobe",
                        "-v",
                        "error",
                        "-show_entries",
                        "format=duration:stream=codec_type,avg_frame_rate,sample_rate",
                        "-of",
                        "json",
                        str(target),
                    ],
                    capture_output=True,
                    timeout=10,
                    env={"PATH": os.defpath},
                    check=False,
                )
                if probe.returncode or len(probe.stdout) > 65536:
                    raise ValueError("The selected media preview duration cannot be verified.")
                info = json.loads(probe.stdout)
                preview_duration = float(info["format"]["duration"])
                video = next(row for row in info["streams"] if row["codec_type"] == "video")
                rate = Fraction(video["avg_frame_rate"])
                if rate <= 0:
                    raise ValueError("Preview frame cadence is unresolved.")
                audio = next((row for row in info["streams"] if row["codec_type"] == "audio"), None)
                tolerance = 1 / float(rate) + (1024 / int(audio["sample_rate"]) if audio else 0)
                if (
                    not math.isfinite(preview_duration)
                    or preview_duration < selection.duration_seconds - tolerance
                ):
                    raise ValueError(
                        "The requested clip exceeds the source/output profile; "
                        "select a shorter interval."
                    )

        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
    metadata = {
        "method_id": "source-media-preview-v1",
        "selection": selection.model_dump(mode="json"),
        "transforms": ["encoded orientation retained", "scaled to fit1280x720", "preview encoding"],
        "camera_to_experiment_clock_alignment": None,
        "spatial_calibration": None,
        "scientific_measurement_ready": False,
        "preview_duration_seconds": preview_duration,
    }
    return (
        data,
        "image/png" if selection.kind == "frame" else "video/mp4",
        "source-preview" + suffix,
        metadata,
    )


def execute_source_acquisition_job(
    settings: Settings, job: dict, stop_event: Event | None = None
) -> dict:
    corpus = Corpus(settings)
    selection = AcquisitionInputs.model_validate(job["inputs"]["selection"])
    source = resolve_source_request(corpus, selection)
    if asdict(source) != job["inputs"]["source"]:
        raise ValueError("Source request changed after its explicit selection.")
    last_ping = 0.0
    last_stage = ""

    def progress(stage: str, transferred: int, total: int) -> None:
        nonlocal last_ping, last_stage
        if stop_event is not None and stop_event.is_set():
            raise DownloadStopped(
                "Source transfer stopped; its verified partial capture is retained."
            )
        now = time.monotonic()
        if now - last_ping >= 1 or stage != last_stage:
            if not jobs.heartbeat(settings.database_url, job["id"], job["attempt"]):
                raise DownloadStopped("Source job canceled, expired or lost its worker lease.")
            if not jobs.progress(
                settings.database_url,
                job["id"],
                job["attempt"],
                "source_progress",
                {"stage": stage, "transferred_bytes": transferred, "declared_bytes": total},
            ):
                raise DownloadStopped("Source job is no longer active.")
            last_ping = now
            last_stage = stage

    local = _local_original(corpus, source)
    with httpx.Client() as transport:
        result = acquire_source(
            transport,
            settings.object_directory.parent / "source-cache",
            source,
            DownloadProfile.from_environment(),
            progress=progress,
            pinned_keys=_pinned_cache_keys(settings),
            local_source=(local[1], local[0]["sha256"]) if local else None,
        )
    result = {
        **result,
        "snapshot_id": job["snapshot_id"],
        "temporary_access": (
            "Until job expiry/deletion; export selected original inputs before expiry."
        ),
        "scientific_origin": "original_source_bytes",
        "canonical_measurements_changed": False,
    }
    result.pop("verified_stat", None)
    if selection.preview is not None:
        cached = cached_source(settings.object_directory.parent / "source-cache", source.key)
        assert cached is not None
        try:
            data, media_type, name, provenance = _preview_bytes(
                cached[1], selection.preview, progress
            )
            artifact = publish_artifact(
                settings.database_url,
                settings.object_directory,
                job["id"],
                job["attempt"],
                operation_key="selected-source-preview",
                data=data,
                media_type=media_type,
                file_name=name,
                provenance={
                    **provenance,
                    "source_sha256": result["sha256"],
                    "snapshot_id": job["snapshot_id"],
                },
            )
            result["preview"] = {"status": "available", "artifact": artifact}
        except DownloadStopped:
            raise
        except (ValueError, OSError):
            result["preview"] = {
                "status": "unavailable",
                "reason": (
                    "The original source is retained, but this selected media "
                    "interval/profile could not produce a preview."
                ),
            }
    return result


def create_source_acquisition_router(settings: Settings) -> APIRouter:
    from .workflows import browser_receipt, remember_receipt, require_same_origin

    router = APIRouter(prefix="/v1", tags=["Selective source acquisition"])
    corpus = Corpus(settings)

    @router.get("/source-acquisitions/profile")
    def profile():
        return {
            **asdict(DownloadProfile.from_environment()),
            "services": (
                "Existing application worker and disk only; no execution/data provider account."
            ),
            "canonical_promotion": False,
            "retention": (
                "Original NASA cache may be reused; private job "
                "receipts/results expire after24hours."
            ),
        }

    @router.post("/source-acquisitions", status_code=202)
    def acquire(
        inputs: AcquisitionInputs,
        request: Request,
        response: Response,
        idempotency_key: Annotated[str | None, Header(max_length=128)] = None,
    ):
        require_same_origin(request, settings)
        source = resolve_source_request(corpus, inputs)
        policy = DownloadProfile.from_environment()
        retained = _local_original(corpus, source)
        hit = cached_source(settings.object_directory.parent / "source-cache", source.key)
        if source.declared_bytes > policy.max_transfer_bytes and retained is None and hit is None:
            raise DownloadLimit(
                "Selected source exceeds the visible owner transfer profile; "
                "no transfer was started."
            )
        receipt = remember_receipt(request, response)
        return jobs.create_job(
            settings.database_url,
            source.snapshot_id,
            kind="source_acquisition",
            inputs={
                "selection": inputs.model_dump(mode="json"),
                "source": asdict(source),
                "quoted_profile": asdict(policy),
            },
            receipt=receipt,
            idempotency_key=idempotency_key,
        )

    @router.get(
        "/source-acquisitions/{job_id}/content",
        response_class=FileResponse,
        responses={
            200: {"content": {"application/octet-stream": {}}},
            206: {"description": "Selected original byte range"},
        },
    )
    def content(
        job_id: UUID, request: Request, x_job_receipt: Annotated[str | None, Header()] = None
    ):
        job = jobs.read_job(settings.database_url, job_id, browser_receipt(request, x_job_receipt))
        result, path = _acquired_result(settings, job)
        media_type = result["format"]["media_type"]
        inline = (
            media_type in {"video/mp4", "image/png", "image/jpeg"}
            and result["format"]["status"] == "signature_matches_source_suffix"
        )
        return FileResponse(
            path,
            media_type=media_type,
            filename=result["source"]["file_name"],
            content_disposition_type="inline" if inline else "attachment",
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @router.get("/source-acquisitions/{job_id}/table-preview")
    def table(
        job_id: UUID,
        request: Request,
        encoding: Literal["utf-8-sig", "cp1252"] = "utf-8-sig",
        limit: Annotated[int, Query(ge=1, le=250)] = 50,
        x_job_receipt: Annotated[str | None, Header()] = None,
    ):
        job = jobs.read_job(settings.database_url, job_id, browser_receipt(request, x_job_receipt))
        result, path = _acquired_result(settings, job)
        if not result["source"]["file_name"].lower().endswith(".csv"):
            raise ValueError("Select a CSV source for its explicit raw-table preview.")
        rows: list[dict[str, Any]] = []
        preview_status = "row_limit_or_source_end"
        with path.open("rb") as stream:
            bounded = LimitedSource(stream, result["byte_size"], 1024 * 1024)
            with io.TextIOWrapper(
                io.BufferedReader(bounded), encoding=encoding, newline=""
            ) as text:
                reader = csv.reader(text, strict=True)
                try:
                    headers = next(reader, None)
                    if headers is None:
                        raise ValueError("The selected CSV has no source header.")
                    previous_end = reader.line_num
                    while len(rows) < limit:
                        values = next(reader, None)
                        if values is None:
                            break
                        rows.append(
                            {
                                "source_row": previous_end + 1,
                                "line_end": reader.line_num,
                                "raw_cells": values,
                            }
                        )
                        previous_end = reader.line_num
                except PreviewByteLimit:
                    if not rows:
                        raise ValueError(
                            "The first source record exceeds the raw preview profile; "
                            "original bytes remain available."
                        ) from None
                    preview_status = "byte_limit_reached_no_partial_record_returned"
                except (csv.Error, UnicodeError):
                    raise ValueError(
                        "The selected encoding/CSV structure exceeds this raw preview profile."
                    ) from None
        return {
            "source_sha256": result["sha256"],
            "snapshot_id": result["snapshot_id"],
            "headers": headers,
            "rows": rows,
            "encoding": encoding,
            "preview_only": True,
            "preview_status": preview_status,
            "total_source_records": None,
            "independent_run_count": None,
            "scientific_normalization": "requires_registered_source_mapping",
        }

    return router


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] != "--preview-child":
        raise SystemExit("Use the fixed preview-child profile through a source job.")
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
    resource.setrlimit(resource.RLIMIT_FSIZE, (8 * 1024 * 1024, 8 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    os.execvpe("ffmpeg", ["ffmpeg", *sys.argv[2:]], {"PATH": os.defpath, "OMP_NUM_THREADS": "1"})

"""Selected private inputs: resumable bytes, explicit submission and expiring browser scope."""

from __future__ import annotations

import asyncio
import codecs
import json
import os
import shutil
import time
from dataclasses import asdict, dataclass
from hashlib import sha256
from pathlib import Path, PurePosixPath
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from nova_ember.adapters.formats import source_zip
from nova_ember.evidence.contracts import Contract, Digest
from psycopg.types.json import Jsonb
from pydantic import Field, model_validator

from . import jobs
from .config import Settings
from .database import connect
from .repository import Corpus

TEXT_SUFFIXES = frozenset({".csv", ".tsv", ".txt", ".json", ".py", ".ipynb", ".md"})
ZIP_SUFFIXES = frozenset({".zip", ".docx", ".xlsx"})
SUPPORTED_SUFFIXES = (
    TEXT_SUFFIXES
    | ZIP_SUFFIXES
    | {".pdf", ".xls", ".mat", ".rtf", ".png", ".jpg", ".jpeg", ".mp4", ".parquet"}
)
EXECUTABLE_SUFFIXES = frozenset(
    {".exe", ".dll", ".com", ".msi", ".scr", ".so", ".dylib", ".bat", ".cmd", ".ps1"}
)
PROCESSING_LOCATION = "temporary_private_storage_on_the_application_host"


@dataclass(frozen=True)
class UploadProfile:
    max_file_bytes: int = 64 * 1024 * 1024
    max_browser_bytes: int = 256 * 1024 * 1024
    max_host_bytes: int = 1024 * 1024 * 1024
    chunk_bytes: int = 1024 * 1024
    disk_reserve_bytes: int = 128 * 1024 * 1024
    retention_hours: int = 24
    max_browser_files: int = 100
    max_host_files: int = 1000

    @classmethod
    def from_environment(cls) -> UploadProfile:
        values = cls(
            max_file_bytes=int(os.environ.get("NOVA_UPLOAD_FILE_BYTES", 64 * 1024 * 1024)),
            max_browser_bytes=int(os.environ.get("NOVA_UPLOAD_BROWSER_BYTES", 256 * 1024 * 1024)),
            max_host_bytes=int(os.environ.get("NOVA_UPLOAD_HOST_BYTES", 1024 * 1024 * 1024)),
        )
        if any(value <= 0 for value in asdict(values).values()) or not (
            values.max_file_bytes <= values.max_browser_bytes <= values.max_host_bytes
        ):
            raise ValueError(
                "Upload file, browser and host byte limits must be positive and ordered."
            )
        return values


class UploadInputs(Contract):
    snapshot_id: Digest
    file_name: str = Field(min_length=1, max_length=240)
    byte_size: Annotated[int, Field(strict=True, ge=1)]
    sha256: Digest
    intended_use: Literal["analysis", "evidence", "execution_input", "reproducibility"]
    license: str = Field(min_length=1, max_length=2000)
    rights_assertion: str = Field(min_length=1, max_length=2000)
    redistribution_allowed: bool = False
    text_encoding: Literal["utf-8", "utf-8-sig", "ascii", "cp1252"] = "utf-8-sig"
    confirmed_temporary_processing: bool = False

    @model_validator(mode="after")
    def safe_file_selection(self):
        if (
            PurePosixPath(self.file_name).name != self.file_name
            or "\\" in self.file_name
            or ":" in self.file_name
            or any(ord(character) < 32 or ord(character) == 127 for character in self.file_name)
        ):
            raise ValueError("Select a bounded file name without paths or control characters.")
        if Path(self.file_name).suffix.casefold() not in SUPPORTED_SUFFIXES:
            raise ValueError("This file suffix has no supported private-upload validation profile.")
        if not self.license.strip() or not self.rights_assertion.strip():
            raise ValueError("State the selected file's license and your processing rights.")
        if not self.confirmed_temporary_processing:
            raise ValueError("Confirm the stated temporary host processing before sending bytes.")
        return self


class SubmitUpload(Contract):
    sha256: Digest
    confirmed_submit: bool = False


def _directory(settings: Settings) -> Path:
    root = settings.object_directory / "private_uploads"
    if root.is_symlink():
        raise ValueError("Private upload storage must not be a symbolic link.")
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    return root


def _path(settings: Settings, identifier: UUID | str) -> Path:
    return _directory(settings) / str(UUID(str(identifier))) / "original"


def _owner(receipt: str | None) -> str:
    return sha256((receipt or "").encode()).hexdigest()


def _row(connection, upload_id, receipt_sha256):
    row = connection.execute(
        """SELECT * FROM private_uploads WHERE id=%s AND receipt_sha256=%s
           AND expires_at>now() FOR UPDATE""",
        (str(UUID(str(upload_id))), receipt_sha256),
    ).fetchone()
    if row is None:
        raise jobs.JobNotFound("This private upload is absent, removed or expired.")
    return row


def _public(row: dict) -> dict:
    return {
        "upload_id": str(row["id"]),
        "snapshot_id": row["snapshot_id"],
        "sha256": row["expected_sha256"],
        "byte_size": row["byte_size"],
        "received_bytes": row["received_bytes"],
        "status": row["status"],
        **row["metadata"],
        "expiry": row["expires_at"].isoformat(),
        "validation": row["validation"],
        "scientific_origin": "user_supplied_original_bytes",
        "scientific_measurement_ready": False,
        "canonical_promotion": False,
    }


def cleanup_expired_uploads(settings: Settings) -> int:
    """Delete expired private originals; existing worker maintenance owns scheduling."""
    with connect(settings.database_url) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(701423)")
        connection.execute(
            """UPDATE execution_sessions AS session SET status='closed',
               termination_reason='private_upload_expired' WHERE session.status='open'
               AND EXISTS (SELECT 1 FROM private_uploads AS upload
                   WHERE upload.expires_at<=now()
                   AND upload.receipt_sha256=session.receipt_sha256
                   AND session.input_assets @> jsonb_build_array(
                       jsonb_build_object('upload_id',upload.id::text)))"""
        )
        rows = connection.execute(
            "DELETE FROM private_uploads WHERE expires_at<=now() RETURNING id"
        ).fetchall()
        retained = {
            str(row["id"])
            for row in connection.execute("SELECT id FROM private_uploads").fetchall()
        }
        removed = 0
        for directory in _directory(settings).iterdir():
            # Recover a process interruption between row deletion and byte removal.
            try:
                identifier = str(UUID(directory.name))
            except ValueError:
                continue
            if identifier not in retained and directory.is_dir() and not directory.is_symlink():
                shutil.rmtree(directory)
                removed += 1
    return max(len(rows), removed)


def _checked_bytes(path: Path, row: dict) -> None:
    if path.is_symlink() or not path.is_file() or path.stat().st_size != row["byte_size"]:
        raise ValueError("Private original bytes do not match their declared length.")
    digest = sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    if digest.hexdigest() != row["expected_sha256"]:
        raise ValueError("Private original bytes fail their declared SHA-256 checksum.")


def _validate_archive(path: Path, suffix: str) -> dict:
    # Inventory plus bounded streaming CRC checks; no member reaches the host filesystem.
    started = time.monotonic()
    with source_zip(path.read_bytes()) as archive:
        names = archive.namelist()
        required = {".docx": "word/document.xml", ".xlsx": "xl/workbook.xml"}.get(suffix)
        if required and required not in names:
            raise ValueError("Office archive does not contain its declared document type.")
        for member in archive.infolist():
            lower_name = member.filename.casefold()
            if (
                PurePosixPath(lower_name).suffix in EXECUTABLE_SUFFIXES
                or "vbaproject" in lower_name
                or "/activex/" in lower_name
                or "/embeddings/" in lower_name
            ):
                raise ValueError(
                    "Executable, macro or embedded active archive members are unsupported."
                )
            with archive.open(member) as stream:
                previous = b""
                while chunk := stream.read(128 * 1024):
                    if time.monotonic() - started > 10:
                        raise ValueError("Archive validation exceeded its bounded time profile.")
                    inspected = (previous + chunk).upper()
                    if lower_name.endswith((".xml", ".rels")) and (
                        b"<!DOCTYPE" in inspected or b"<!ENTITY" in inspected
                    ):
                        raise ValueError("Archive XML entity declarations are unsupported.")
                    if lower_name.endswith(".rels") and any(
                        token in inspected
                        for token in (b"/OLEOBJECT", b"/ATTACHEDTEMPLATE", b"/EXTERNALLINK")
                    ):
                        raise ValueError("Active external Office relationships are unsupported.")
                    previous = chunk[-64:]
    return {"archive_members": len(names), "archive_extraction": "none"}


def _validate_format(path: Path, row: dict) -> dict:
    suffix = Path(row["metadata"]["file_name"]).suffix.casefold()
    with path.open("rb") as stream:
        header = stream.read(256)
    if header.startswith((b"MZ", b"\x7fELF")):
        raise ValueError("Executable content cannot be submitted as a scientific input file.")
    details = {}
    if suffix in ZIP_SUFFIXES:
        if not header.startswith(b"PK\x03\x04"):
            raise ValueError("Archive signature differs from its selected file suffix.")
        details = _validate_archive(path, suffix)
    elif suffix in TEXT_SUFFIXES:
        decoder = codecs.getincrementaldecoder(row["metadata"]["text_encoding"])(errors="strict")
        try:
            with path.open("rb") as stream:
                while chunk := stream.read(128 * 1024):
                    if "\x00" in decoder.decode(chunk):
                        raise ValueError("Text input contains unexpected NUL characters.")
                decoder.decode(b"", final=True)
        except UnicodeDecodeError:
            raise ValueError("Text bytes do not match the selected explicit encoding.") from None
        if header.lstrip().lower().startswith((b"<!doctype html", b"<html")):
            raise ValueError("HTML content is outside the scientific text input profile.")
        if suffix in {".json", ".ipynb"}:
            if row["byte_size"] > 8 * 1024 * 1024:
                raise ValueError("Structured JSON inputs have an explicit eight MiB parse profile.")
            try:
                json.loads(path.read_bytes().decode(row["metadata"]["text_encoding"]))
            except (ValueError, RecursionError):
                raise ValueError(
                    "Structured JSON input is invalid or excessively nested."
                ) from None
        details["text_encoding"] = row["metadata"]["text_encoding"]
    else:
        signatures = {
            ".pdf": header.startswith(b"%PDF-"),
            ".xls": header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
            ".mat": header.startswith(b"MATLAB 5.0 MAT-file"),
            ".rtf": header.lstrip().startswith(b"{\\rtf"),
            ".png": header.startswith(b"\x89PNG\r\n\x1a\n"),
            ".jpg": header.startswith(b"\xff\xd8\xff"),
            ".jpeg": header.startswith(b"\xff\xd8\xff"),
            ".mp4": header[4:8] == b"ftyp",
            ".parquet": header.startswith(b"PAR1"),
        }
        if not signatures.get(suffix):
            raise ValueError("File signature differs from its supported source format.")
    return {
        "status": "bounded_structure_checked"
        if suffix in ZIP_SUFFIXES
        else "signature_or_text_checked",
        **details,
        "sha256_checked": True,
        "original_bytes_transformed": False,
        "active_content_executed": False,
        "external_provider_submission": False,
        "limitations": [
            "Format validation checks byte identity; it does not establish scientific accuracy.",
            "Binary signatures do not qualify measurements, calibration or document content.",
            "Originals remain untrusted; any requested parsing uses its bounded registered reader.",
            "Licensing and processing rights are user assertions without independent verification.",
        ],
    }


def private_upload_for_receipt_hash(
    settings: Settings, upload_id: str, receipt_sha256: str
) -> tuple[dict, Path]:
    with connect(settings.database_url) as connection:
        row = _row(connection, upload_id, receipt_sha256)
        if row["status"] != "ready":
            raise jobs.JobNotFound(
                "The selected private upload has not been submitted successfully."
            )
        path = _path(settings, upload_id)
        _checked_bytes(path, row)
    return _public(row), path


def private_upload_execution_references(
    settings: Settings, snapshot_id: str, upload_ids: list[str], receipt_sha256: str
) -> list[dict]:
    if len(upload_ids) > 10 or len(set(upload_ids)) != len(upload_ids):
        raise ValueError("Select at most ten distinct private uploads.")
    references = []
    for identifier in upload_ids:
        metadata, _ = private_upload_for_receipt_hash(settings, identifier, receipt_sha256)
        if metadata["snapshot_id"] != snapshot_id:
            raise ValueError("Private inputs must preserve the session's frozen corpus snapshot.")
        if metadata["byte_size"] > 8 * 1024 * 1024:
            raise ValueError("A private execution input exceeds the explicit eight MiB profile.")
        references.append(
            {
                key: metadata[key]
                for key in (
                    "upload_id",
                    "snapshot_id",
                    "sha256",
                    "byte_size",
                    "file_name",
                    "intended_use",
                    "license",
                    "rights_assertion",
                    "redistribution_allowed",
                    "processing_location",
                    "expiry",
                )
            }
        )
    return references


def read_private_upload_execution_input(
    settings: Settings, reference: dict, receipt_sha256: str
) -> tuple[str, bytes, dict]:
    metadata, path = private_upload_for_receipt_hash(
        settings, reference["upload_id"], receipt_sha256
    )
    if any(metadata.get(key) != value for key, value in reference.items()):
        raise ValueError("Private input differs from its immutable selected execution reference.")
    if metadata["byte_size"] > 8 * 1024 * 1024:
        raise ValueError("Private execution input exceeds its eight MiB profile.")
    content = path.read_bytes()
    if len(content) != reference["byte_size"] or sha256(content).hexdigest() != reference["sha256"]:
        raise ValueError("Private execution input fails its byte-length/checksum verification.")
    return (
        metadata["file_name"],
        content,
        {
            **reference,
            "scientific_origin": "user_supplied_original_bytes",
            "rights_status": "user_asserted",
            "canonical_promotion": False,
        },
    )


def create_upload_router(settings: Settings) -> APIRouter:
    # Workflows imports these helpers for execution inputs; keep its cookie utilities local.
    from .workflows import browser_receipt, remember_receipt, require_same_origin

    router = APIRouter()
    corpus = Corpus(settings)

    @router.get("/v1/uploads/profile")
    def upload_profile():
        return {
            **asdict(UploadProfile.from_environment()),
            "supported_suffixes": sorted(SUPPORTED_SUFFIXES),
            "processing_location": PROCESSING_LOCATION,
            "external_provider_submission": False,
            "resume": "ordered_byte_offsets_same_browser_until_expiry",
            "submission": "explicit_finalize_after_exact_length_hash_and_format_checks",
            "license_status": "user_asserted",
            "binary_parse_policy": "untrusted_original_no_automatic_render_or_execution",
            "structured_json_parse_bytes": 8 * 1024 * 1024,
            "archive_expanded_bytes": 128 * 1024 * 1024,
            "archive_members": 2000,
        }

    @router.post("/v1/uploads", status_code=201)
    def prepare_upload(inputs: UploadInputs, request: Request, response: Response):
        require_same_origin(request, settings)
        corpus.snapshot(inputs.snapshot_id)
        profile = UploadProfile.from_environment()
        if inputs.byte_size > profile.max_file_bytes:
            raise ValueError("Selected file exceeds the published private-upload byte profile.")
        cleanup_expired_uploads(settings)
        receipt_hash = _owner(remember_receipt(request, response))
        identifier = uuid4()
        metadata = {
            "file_name": inputs.file_name,
            "intended_use": inputs.intended_use,
            "license": inputs.license,
            "rights_assertion": inputs.rights_assertion,
            "rights_status": "user_asserted",
            "redistribution_allowed": inputs.redistribution_allowed,
            "text_encoding": inputs.text_encoding,
            "processing_location": PROCESSING_LOCATION,
            "external_provider_submission": False,
        }
        with connect(settings.database_url) as connection:
            connection.execute("SELECT pg_advisory_xact_lock(701423)")
            usage = connection.execute(
                """SELECT coalesce(sum(byte_size),0) AS host,
                   coalesce(sum(byte_size) FILTER (WHERE receipt_sha256=%s),0) AS browser,
                   count(*) AS host_files,
                   count(*) FILTER (WHERE receipt_sha256=%s) AS browser_files
                   FROM private_uploads WHERE expires_at>now()""",
                (receipt_hash, receipt_hash),
            ).fetchone()
            assert usage is not None
            if (
                usage["host"] + inputs.byte_size > profile.max_host_bytes
                or (usage["browser"] + inputs.byte_size > profile.max_browser_bytes)
                or usage["browser_files"] >= profile.max_browser_files
                or (usage["host_files"] >= profile.max_host_files)
            ):
                raise ValueError(
                    "Private upload storage is reserved; remove files or wait for expiry."
                )
            root = _directory(settings)
            if shutil.disk_usage(root).free < profile.disk_reserve_bytes + inputs.byte_size:
                raise ValueError("Available host disk cannot support this selected private upload.")
            row = connection.execute(
                """INSERT INTO private_uploads
                (id,receipt_sha256,snapshot_id,expected_sha256,byte_size,metadata)
                VALUES (%s,%s,%s,%s,%s,%s) RETURNING *""",
                (
                    str(identifier),
                    receipt_hash,
                    inputs.snapshot_id,
                    inputs.sha256,
                    inputs.byte_size,
                    Jsonb(metadata),
                ),
            ).fetchone()
        assert row is not None
        return _public(row)

    @router.get("/v1/uploads")
    def list_uploads(request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        with connect(settings.database_url) as connection:
            rows = connection.execute(
                """SELECT * FROM private_uploads WHERE receipt_sha256=%s AND expires_at>now()
                   ORDER BY created_at,id""",
                (_owner(browser_receipt(request)),),
            ).fetchall()
        return {"uploads": [_public(row) for row in rows]}

    @router.get("/v1/uploads/{upload_id}")
    def read_upload(upload_id: UUID, request: Request, response: Response):
        response.headers["Cache-Control"] = "no-store"
        with connect(settings.database_url) as connection:
            return _public(_row(connection, upload_id, _owner(browser_receipt(request))))

    @router.put(
        "/v1/uploads/{upload_id}/chunks",
        openapi_extra={
            "requestBody": {
                "required": True,
                "content": {
                    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
                },
            }
        },
    )
    async def upload_chunk(upload_id: UUID, request: Request, offset: Annotated[int, Query(ge=0)]):
        require_same_origin(request, settings)
        profile = UploadProfile.from_environment()
        receipt_hash = _owner(browser_receipt(request))
        with connect(settings.database_url) as connection:
            current = _row(connection, upload_id, receipt_hash)
            if current["status"] != "receiving" or offset != current["received_bytes"]:
                raise HTTPException(409, "Resume from the upload's recorded received_bytes offset.")
        content = bytearray()
        try:
            async with asyncio.timeout(10):
                async for chunk in request.stream():
                    if len(content) + len(chunk) > profile.chunk_bytes:
                        raise HTTPException(413, "A chunk exceeds the published upload profile.")
                    content.extend(chunk)
        except TimeoutError:
            raise HTTPException(
                408, "This upload chunk exceeded its time profile; resume it."
            ) from None
        if not content:
            raise ValueError("An upload chunk must contain original file bytes.")
        with connect(settings.database_url) as connection:
            row = _row(connection, upload_id, receipt_hash)
            if row["status"] != "receiving" or offset != row["received_bytes"]:
                raise HTTPException(409, "The upload changed; resume its recorded byte offset.")
            if offset + len(content) > row["byte_size"]:
                raise ValueError("Chunk bytes would exceed the exact declared source length.")
            path = _path(settings, upload_id)
            path.parent.mkdir(mode=0o700, exist_ok=True)
            if path.is_symlink() or (path.exists() and path.stat().st_size < offset):
                raise ValueError("Partial upload storage differs from its confirmed byte offset.")
            with path.open("r+b" if path.exists() else "w+b") as target:
                path.chmod(0o600)
                # A process interruption may leave bytes beyond the committed database offset.
                target.truncate(offset)
                target.seek(offset)
                target.write(content)
                target.flush()
                os.fsync(target.fileno())
            row = connection.execute(
                "UPDATE private_uploads SET received_bytes=%s WHERE id=%s RETURNING *",
                (offset + len(content), str(upload_id)),
            ).fetchone()
        assert row is not None
        return _public(row)

    @router.post("/v1/uploads/{upload_id}/finalize")
    def finalize_upload(upload_id: UUID, inputs: SubmitUpload, request: Request):
        require_same_origin(request, settings)
        if not inputs.confirmed_submit:
            raise ValueError("Confirm this selected private file's submission explicitly.")
        error = None
        with connect(settings.database_url) as connection:
            row = _row(connection, upload_id, _owner(browser_receipt(request)))
            if row["status"] == "rejected" or inputs.sha256 != row["expected_sha256"]:
                raise ValueError("The submission does not match the prepared upload's checksum.")
            if row["status"] == "ready":
                return _public(row)
            if row["received_bytes"] != row["byte_size"]:
                raise ValueError("Resume all declared bytes before final submission.")
            try:
                path = _path(settings, upload_id)
                _checked_bytes(path, row)
                validation = _validate_format(path, row)
                status = "ready"
            except (ValueError, OSError) as failure:
                error = (
                    str(failure) if isinstance(failure, ValueError) else "Upload validation failed."
                )
                validation, status = {"status": "rejected", "reason": error}, "rejected"
            row = connection.execute(
                "UPDATE private_uploads SET status=%s,validation=%s WHERE id=%s RETURNING *",
                (status, Jsonb(validation), str(upload_id)),
            ).fetchone()
        if error:
            raise ValueError(error)
        assert row is not None
        return _public(row)

    @router.get(
        "/v1/uploads/{upload_id}/content",
        response_class=FileResponse,
        responses={
            200: {"content": {"application/octet-stream": {}}},
            206: {"description": "Selected original byte range"},
        },
    )
    def download_upload(upload_id: UUID, request: Request):
        metadata, path = private_upload_for_receipt_hash(
            settings, str(upload_id), _owner(browser_receipt(request))
        )
        return FileResponse(
            path,
            media_type="application/octet-stream",
            filename=metadata["file_name"],
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )

    @router.delete("/v1/uploads/{upload_id}", status_code=204)
    def remove_upload(upload_id: UUID, request: Request):
        require_same_origin(request, settings)
        with connect(settings.database_url) as connection:
            owner = _owner(browser_receipt(request))
            _row(connection, upload_id, owner)
            connection.execute(
                """UPDATE execution_sessions SET status='closed',
                   termination_reason='private_upload_removed' WHERE receipt_sha256=%s
                   AND status='open' AND input_assets @> %s""",
                (owner, Jsonb([{"upload_id": str(upload_id)}])),
            )
            connection.execute("DELETE FROM private_uploads WHERE id=%s", (str(upload_id),))
        shutil.rmtree(_path(settings, upload_id).parent, ignore_errors=True)
        return Response(status_code=204)

    return router

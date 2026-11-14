"""Checkpointed daily public PSI observations without automatic scientific promotion."""

from __future__ import annotations

import fcntl
import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from threading import Event
from typing import Any

import httpx

from .manifests import checked_json, write_immutable
from .psi import Capture, PsiClient, SourceUnavailable, catalog_records, manifest_files


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, mode="w", delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, sort_keys=True)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _capture_reference(directory: Path, capture: Capture) -> dict:
    return {
        "path": write_immutable(directory, capture.content),
        "sha256": capture.sha256,
        "byte_size": len(capture.content),
        "source_url": capture.source_url,
        "fetched_at": capture.fetched_at,
    }


def refresh_status(directory: Path) -> dict:
    status_path = directory / "status.json"
    status = (
        json.loads(status_path.read_bytes()) if status_path.is_file() else {"status": "not_started"}
    )
    current = directory / "current.json"
    if current.is_file():
        reference = json.loads(current.read_bytes())
        complete = checked_json(directory, reference)
        status = {
            **status,
            "last_complete_observation_id": reference["sha256"],
            "last_complete_at": complete["completed_at"],
            "last_complete_day": complete["day"],
        }
    return status


def latest_observation(directory: Path) -> dict | None:
    pointer = directory / "current.json"
    if not pointer.is_file():
        return None
    reference = json.loads(pointer.read_bytes())
    result = checked_json(directory, reference)
    if result.get("schema_version") != 1 or result.get("status") != "complete":
        raise ValueError("Published source observations require a complete supported capture.")
    return {**result, "observation_id": reference["sha256"]}


def refresh_sources(
    directory: Path,
    client: PsiClient,
    *,
    force: bool = False,
    now: datetime | None = None,
    stop_event: Event | None = None,
) -> dict:
    """Observe public metadata/manifests once a UTC day, resuming any partial attempt.

    The caller schedules this fixed trusted task. Captures are original bytes;
    newly changed tables, labels, calibrations and model domains are not promoted
    or interpreted by this function. All scientific assets stay untouched.
    """
    if now is not None and now.tzinfo is None:
        raise ValueError("A refresh override time must include its timezone.")
    current_time = (now or datetime.now(UTC)).astimezone(UTC)
    day = current_time.date().isoformat()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "refresh.lock").open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {**refresh_status(directory), "status": "already_running"}
        try:
            state = refresh_status(directory)
            if (
                not force
                and state.get("day") == day
                and state.get("status") == "complete"
                and state.get("last_complete_day") == day
            ):
                return {
                    **state,
                    "status": "already_refreshed",
                    "scientific_snapshot_promoted": False,
                }
            if force or state.get("day") != day or "entries" not in state:
                state = {
                    "schema_version": 1,
                    "day": day,
                    "started_at": current_time.isoformat(),
                    "status": "running",
                    "catalog": None,
                    "entries": {},
                    "errors": [],
                    "scientific_snapshot_promoted": False,
                    "scientific_asset_bytes_acquired": 0,
                }
            state["status"] = "running"
            state["errors"] = []
            _atomic_json(directory / "status.json", state)

            def interrupted() -> bool:
                if stop_event is None or not stop_event.is_set():
                    return False
                state["status"] = "interrupted"
                _atomic_json(directory / "status.json", state)
                return True

            if interrupted():
                return state
            try:
                if state["catalog"] is None:
                    state["catalog"] = _capture_reference(directory, client.fetch_catalog())
                    _atomic_json(directory / "status.json", state)
                catalog = checked_json(directory, state["catalog"])
                records = catalog_records(json.dumps(catalog).encode())
            except (SourceUnavailable, ValueError) as error:
                state.update(status="partial", errors=[{"stage": "catalog", "error": str(error)}])
                _atomic_json(directory / "status.json", state)
                return state
            combustion = sorted(
                (row for row in records if row.get("Research Area") == "Combustion Science"),
                key=lambda row: row["Accession"],
            )
            if len(combustion) > 64:
                state.update(
                    status="partial",
                    errors=[
                        {
                            "stage": "catalog",
                            "error": (
                                "Combustion inventory exceeds the 64-investigation daily "
                                "metadata profile."
                            ),
                        }
                    ],
                )
                _atomic_json(directory / "status.json", state)
                return state
            state["total_catalog_records"] = len(records)
            state["investigation_count"] = len(combustion)
            for catalog_record in combustion:
                if interrupted():
                    return state
                accession = catalog_record["Accession"]
                entry = state["entries"].setdefault(
                    accession, {"accession": accession, "metadata": None, "manifest": None}
                )
                if entry["metadata"] is not None:
                    metadata = checked_json(directory, entry["metadata"])
                else:
                    try:
                        capture = client.fetch_metadata(accession)
                        metadata = json.loads(capture.content)
                        entry["metadata"] = _capture_reference(directory, capture)
                        entry.update(
                            investigation_version=metadata["version"],
                            license=metadata.get("licenseIdentifier") or None,
                            doi=metadata.get("doi"),
                            title=metadata["title"],
                        )
                        _atomic_json(directory / "status.json", state)
                    except (SourceUnavailable, ValueError) as error:
                        state["errors"].append(
                            {"accession": accession, "stage": "metadata", "error": str(error)}
                        )
                        _atomic_json(directory / "status.json", state)
                        continue
                if entry["manifest"] is not None:
                    checked_json(directory, entry["manifest"])
                    continue
                if interrupted():
                    return state
                try:
                    capture = client.fetch_manifest(accession, metadata["version"])
                    entry["manifest"] = {
                        **_capture_reference(directory, capture),
                        "file_count": len(manifest_files(capture.content)),
                        "investigation_version": metadata["version"],
                    }
                    _atomic_json(directory / "status.json", state)
                except (SourceUnavailable, ValueError) as error:
                    state["errors"].append(
                        {"accession": accession, "stage": "manifest", "error": str(error)}
                    )
                    _atomic_json(directory / "status.json", state)
            incomplete = bool(state["errors"]) or any(
                not state["entries"][row["Accession"]].get("manifest") for row in combustion
            )
            state["status"] = "partial" if incomplete else "complete"
            if interrupted():
                return state
            state["completed_at"] = (now or datetime.now(UTC)).astimezone(UTC).isoformat()
            state["limitations"] = [
                (
                    "NASA responses are observations at their individual fetch "
                    "times, not an atomic NASA repository transaction."
                ),
                (
                    "New/changed metadata and file listings do not establish "
                    "scientific row interpretation, calibration or model "
                    "readiness."
                ),
                (
                    "No canonical scientific snapshot, source table, model or "
                    "saved personal case is changed automatically."
                ),
            ]
            _atomic_json(directory / "status.json", state)
            if not incomplete:
                encoded = json.dumps(state, sort_keys=True, separators=(",", ":")).encode()
                from hashlib import sha256

                reference = {
                    "path": write_immutable(directory, encoded),
                    "sha256": sha256(encoded).hexdigest(),
                    "byte_size": len(encoded),
                }
                _atomic_json(directory / "current.json", reference)
                return {**state, "observation_id": reference["sha256"]}
            return state
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def refresh_public_sources(
    settings: Any, force: bool = False, stop_event: Event | None = None
) -> dict:
    with httpx.Client() as transport:
        return refresh_sources(
            settings.object_directory.parent / "source-refresh",
            PsiClient(transport),
            force=force,
            stop_event=stop_event,
        )

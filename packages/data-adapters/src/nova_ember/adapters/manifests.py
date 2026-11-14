"""Bounded, immutable PSI manifest collections without acquiring scientific archives."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from .psi import PsiClient, SourceUnavailable, manifest_files, validate_accession


def exact_byte_count(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or int(value) != value:
        return None
    return int(value)


def checked_json(directory: Path, reference: dict[str, Any]) -> dict[str, Any]:
    root = directory.resolve()
    path = (root / reference["path"]).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise ValueError("Manifest reference must remain inside the collection.")
    content = path.read_bytes()
    if (
        len(content) != reference["byte_size"]
        or hashlib.sha256(content).hexdigest() != reference["sha256"]
    ):
        raise ValueError("Manifest bytes differ from the frozen reference.")
    result = json.loads(content)
    if not isinstance(result, dict):
        raise ValueError("Manifest document must be an object.")
    return result


def write_immutable(directory: Path, content: bytes) -> str:
    digest = hashlib.sha256(content).hexdigest()
    destination = directory / "objects" / digest
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        if destination.read_bytes() != content:
            raise ValueError("An immutable object differs from its content hash.")
        return str(destination.relative_to(directory))
    with tempfile.NamedTemporaryFile(dir=destination.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return str(destination.relative_to(directory))


def acquire_manifests(
    client: PsiClient,
    source_snapshot: dict[str, Any],
    source_snapshot_id: str,
    directory: Path,
    *,
    resume: bool = True,
) -> dict[str, Any]:
    """Capture each catalog investigation's manifest; retain failures beside successes.

    Calls are sequential and bounded by PsiClient's time/response limits. An error
    cannot silently replace the previous current complete collection. Publication
    of a scientific corpus is a separate operation from acquisition.
    """
    directory.mkdir(parents=True, exist_ok=True)
    previous: dict[str, dict] = {}
    attempt = directory / "last-attempt.json"
    if resume and attempt.is_file():
        retained = checked_json(directory, json.loads(attempt.read_bytes()))
        if retained.get("source_snapshot_id") == source_snapshot_id:
            for reference in retained["manifests"]:
                if reference.get("status") == "manifest_available":
                    checked_json(directory, reference)
                    previous[reference["accession"]] = reference
    rows = []
    for investigation in sorted(
        source_snapshot["investigations"], key=lambda item: item["accession"]
    ):
        accession = validate_accession(investigation["accession"])
        row: dict[str, Any] = {
            "accession": accession,
            "investigation_version": investigation["version"],
            "metadata_sha256": investigation["metadata_sha256"],
            "doi": investigation["doi"],
            "license": investigation.get("license"),
            "license_scope": "investigation_metadata",
        }
        previous_row = previous.get(accession)
        if (
            previous_row is not None
            and previous_row["investigation_version"] == investigation["version"]
            and previous_row["metadata_sha256"] == investigation["metadata_sha256"]
        ):
            rows.append(previous_row)
            continue
        try:
            capture = client.fetch_manifest(accession, investigation["version"])
            files = manifest_files(capture.content)
            row.update(
                status="manifest_available",
                sha256=capture.sha256,
                path=write_immutable(directory, capture.content),
                byte_size=len(capture.content),
                file_count=len(files),
                source_url=capture.source_url,
                fetched_at=capture.fetched_at,
                request_body={
                    "folder": f"{accession}/",
                    "fileType": "study",
                    "studyId": accession,
                    "version": investigation["version"],
                    "obfuscationcode": "",
                },
            )
        except (SourceUnavailable, ValueError) as error:
            row.update(status="unavailable", error=str(error), file_count=None)
        rows.append(row)
    collection = {
        "schema_version": 1,
        "source_snapshot_id": source_snapshot_id,
        "captured_at": datetime.now(UTC).isoformat(),
        "complete": all(row["status"] == "manifest_available" for row in rows),
        "investigation_count": len(rows),
        "manifests": rows,
        "scientific_asset_bytes_acquired": 0,
        "limitations": [
            (
                "File listings establish repository coverage, not scientific interpretation "
                "or independent trials."
            ),
            "Record-level rights do not settle asset-specific third-party rights.",
            "No scientific asset or declared archive is downloaded by this operation.",
        ],
    }
    encoded = json.dumps(collection, sort_keys=True, separators=(",", ":")).encode()
    collection_path = write_immutable(directory, encoded)
    reference = {
        "path": collection_path,
        "sha256": hashlib.sha256(encoded).hexdigest(),
        "byte_size": len(encoded),
    }
    pointer = directory / ("current.json" if collection["complete"] else "last-attempt.json")
    with tempfile.NamedTemporaryFile(dir=directory, delete=False, mode="w") as stream:
        temporary = Path(stream.name)
        json.dump(reference, stream)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, pointer)
    finally:
        temporary.unlink(missing_ok=True)
    if collection["complete"]:
        attempt.unlink(missing_ok=True)
    return {**collection, "collection_id": reference["sha256"]}


def load_collection(directory: Path, source_snapshot_id: str) -> dict[str, Any] | None:
    pointer = directory / "current.json"
    if not pointer.exists():
        return None
    reference = json.loads(pointer.read_bytes())
    collection = checked_json(directory, reference)
    if collection.get("schema_version") != 1 or not collection.get("complete"):
        raise ValueError("Current manifest collection is not a completed supported collection.")
    if collection.get("source_snapshot_id") != source_snapshot_id:
        return None
    for row in collection["manifests"]:
        checked_json(directory, row)
    return {**collection, "collection_id": reference["sha256"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument(
        "--fresh", action="store_true", help="Refresh rather than resume a failed capture."
    )
    arguments = parser.parse_args()
    content = arguments.source.read_bytes()
    source = json.loads(content)
    with httpx.Client() as transport:
        result = acquire_manifests(
            PsiClient(transport),
            source,
            hashlib.sha256(content).hexdigest(),
            arguments.destination,
            resume=not arguments.fresh,
        )
    print(
        json.dumps(
            {
                "complete": result["complete"],
                "collection_id": result["collection_id"],
                "investigations": result["investigation_count"],
                "available": sum(
                    row["status"] == "manifest_available" for row in result["manifests"]
                ),
                "failures": [
                    {"accession": row["accession"], "error": row["error"]}
                    for row in result["manifests"]
                    if row["status"] == "unavailable"
                ],
            }
        )
    )


if __name__ == "__main__":
    main()

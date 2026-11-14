"""Verify and import the committed public NASA snapshot into local PostgreSQL."""

import json
import os
import tempfile
from hashlib import sha256
from pathlib import Path

from psycopg.types.json import Jsonb

from .config import Settings
from .database import connect, migrate


def checked_fixture(directory: Path, relative_path: str, expected_hash: str) -> bytes:
    path = (directory / relative_path).resolve()
    if not path.is_relative_to(directory.resolve()):
        raise ValueError("Fixture path leaves the source directory.")
    if path.stat().st_size > 30 * 1024 * 1024:
        raise ValueError("Fixture exceeds the local import size limit.")
    data = path.read_bytes()
    if sha256(data).hexdigest() != expected_hash:
        raise ValueError(f"Fixture checksum mismatch: {relative_path}")
    return data


def write_object(directory: Path, digest: str, data: bytes) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / digest
    if target.exists():
        if sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError("An existing immutable object has changed.")
        return
    descriptor, temporary_name = tempfile.mkstemp(prefix=".ingest-", dir=directory)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary_name, target)
    finally:
        Path(temporary_name).unlink(missing_ok=True)


def insert_snapshot(connection, manifest: dict, snapshot_id: str) -> None:
    """Insert immutable public records inside the caller's publication transaction."""
    connection.execute(
        """INSERT INTO snapshots (id, fetched_at, manifest) VALUES (%s, %s, %s)
           ON CONFLICT (id) DO NOTHING""",
        (snapshot_id, manifest["fetched_at"], Jsonb(manifest)),
    )
    for record in manifest["investigations"]:
        connection.execute(
            """INSERT INTO investigations
               (snapshot_id, accession, version, title, description, record)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (snapshot_id, accession) DO NOTHING""",
            (
                snapshot_id,
                record["accession"],
                record["version"],
                record["title"],
                record.get("description") or "",
                Jsonb(record),
            ),
        )
    for asset in manifest["assets"]:
        connection.execute(
            """INSERT INTO source_assets
               (snapshot_id, accession, sha256, file_name, file_version, byte_size, record)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (snapshot_id, accession, file_name, file_version) DO NOTHING""",
            (
                snapshot_id,
                asset["accession"],
                asset["sha256"],
                asset["file_name"],
                asset["file_version"],
                asset["byte_size"],
                Jsonb(asset),
            ),
        )


def seed(settings: Settings | None = None) -> str:
    settings = settings or Settings.from_environment()
    source = (settings.fixture_directory / "snapshot.json").read_bytes()
    manifest = json.loads(source)
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported fixture snapshot schema.")
    base_id = sha256(source).hexdigest()
    for reference in [manifest["catalog_response"], *manifest.get("manifests", [])]:
        checked_fixture(settings.fixture_directory, reference["path"], reference["sha256"])
    for investigation in manifest["investigations"]:
        checked_fixture(
            settings.fixture_directory,
            investigation["metadata_path"],
            investigation["metadata_sha256"],
        )
    for asset in manifest["assets"]:
        data = checked_fixture(settings.fixture_directory, asset["path"], asset["sha256"])
        if len(data) != asset["byte_size"]:
            raise ValueError("An asset byte count differs from its manifest.")
        write_object(settings.object_directory, asset["sha256"], data)
    effective, snapshot_id = manifest, base_id
    releases = [(base_id, manifest)]
    if settings.supporting_directory is not None:
        effective = enrich_snapshot(settings, manifest, base_id)
        canonical = json.dumps(effective, sort_keys=True, separators=(",", ":")).encode()
        snapshot_id = sha256(canonical).hexdigest()
        releases.append((snapshot_id, effective))
    if settings.media_directory is not None:
        effective = enrich_snapshot(
            settings,
            effective,
            snapshot_id,
            directory=settings.media_directory,
            source_base_id=base_id,
            collection_key="media_collections",
        )
        effective = {**effective, "source_snapshot_id": base_id}
        canonical = json.dumps(effective, sort_keys=True, separators=(",", ":")).encode()
        snapshot_id = sha256(canonical).hexdigest()
        releases.append((snapshot_id, effective))
    if settings.methods_directory is not None:
        effective = enrich_snapshot(
            settings,
            effective,
            snapshot_id,
            directory=settings.methods_directory,
            source_base_id=base_id,
            collection_key="methods_collections",
        )
        effective = {**effective, "source_snapshot_id": base_id}
        canonical = json.dumps(effective, sort_keys=True, separators=(",", ":")).encode()
        snapshot_id = sha256(canonical).hexdigest()
        releases.append((snapshot_id, effective))
    migrate(settings.database_url)
    with connect(settings.database_url) as connection:
        for release_id, release in releases:
            insert_snapshot(connection, release, release_id)
        connection.execute(
            """INSERT INTO corpus_state (singleton, snapshot_id) VALUES (true, %s)
               ON CONFLICT (singleton) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id""",
            (snapshot_id,),
        )
    return snapshot_id


def enrich_snapshot(
    settings: Settings,
    base: dict,
    base_id: str,
    *,
    directory: Path | None = None,
    source_base_id: str | None = None,
    collection_key: str = "supporting_collections",
) -> dict:
    """Publish supporting evidence as a successor, preserving the base release."""
    from nova_ember.adapters.supporting import load_supporting_snapshot

    directory = directory or settings.supporting_directory
    assert directory is not None
    source = (directory / "snapshot.json").read_bytes()
    supplement = load_supporting_snapshot(directory)
    source_base_id = source_base_id or base_id
    if supplement["source_snapshot_sha256"] != source_base_id:
        raise ValueError("Supporting evidence is bound to a different source snapshot.")
    supplement_id = sha256(source).hexdigest()
    investigations = {record["accession"]: record for record in base["investigations"]}
    manifests = {entry["accession"]: entry for entry in base["manifests"]}
    added_manifests = []
    identities = {
        (asset["accession"], asset["file_name"], asset["file_version"]) for asset in base["assets"]
    }
    additions = []
    for original in supplement["assets"]:
        record = investigations.get(original["accession"])
        identity = (original["accession"], original["file_name"], original["file_version"])
        if not record or record["version"] != original["investigation_version"]:
            raise ValueError("Supporting evidence has no matching investigation version.")
        manifest = manifests.get(original["accession"])
        if manifest is None:
            reference = next(
                (
                    item
                    for item in supplement.get("evidence_files", [])
                    if item["path"] == f"manifests/{original['accession']}.json"
                    and item["sha256"] == original["manifest_sha256"]
                ),
                None,
            )
            if reference is not None:
                manifest_bytes = checked_fixture(directory, reference["path"], reference["sha256"])
                write_object(settings.object_directory, reference["sha256"], manifest_bytes)
                manifest = {
                    **reference,
                    "accession": original["accession"],
                    "source_collection": supplement_id,
                }
                manifests[original["accession"]] = manifest
                added_manifests.append(manifest)
        if (
            record["metadata_sha256"] != original["metadata_sha256"]
            or record["doi"] != original["doi"]
            or record["license"] != original["license"]
            or not manifest
            or manifest["sha256"] != original["manifest_sha256"]
        ):
            raise ValueError("Supporting provenance differs from its frozen investigation source.")
        if identity in identities:
            raise ValueError("Supporting evidence duplicates an existing source identity.")
        identities.add(identity)
        asset = {
            **original,
            "id": f"{identity[0]}:v{identity[2]}:{identity[1]}",
            "kind": original.get("kind")
            or (
                "supporting_workbook"
                if original["file_name"].endswith(".xlsx")
                else "supporting_text"
            ),
            "source_collection": supplement_id,
        }
        data = checked_fixture(directory, asset["path"], asset["sha256"])
        write_object(settings.object_directory, asset["sha256"], data)
        additions.append(asset)
    return {
        **base,
        "parent_snapshot_id": base_id,
        "fetched_at": max(base["fetched_at"], supplement["captured_at"]),
        "assets": [*base["assets"], *additions],
        "manifests": [*base["manifests"], *added_manifests],
        collection_key: [
            *base.get(collection_key, []),
            {
                "sha256": supplement_id,
                "source_snapshot_sha256": source_base_id,
                "captured_at": supplement["captured_at"],
                "asset_count": len(additions),
            },
        ],
    }


if __name__ == "__main__":
    snapshot = seed()
    print(f"Imported verified public snapshot {snapshot}.")

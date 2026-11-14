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


def seed(settings: Settings | None = None) -> str:
    settings = settings or Settings.from_environment()
    source = (settings.fixture_directory / "snapshot.json").read_bytes()
    manifest = json.loads(source)
    if manifest.get("schema_version") != 1:
        raise ValueError("Unsupported fixture snapshot schema.")
    snapshot_id = sha256(source).hexdigest()
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
    migrate(settings.database_url)
    with connect(settings.database_url) as connection:
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
        connection.execute(
            """INSERT INTO corpus_state (singleton, snapshot_id) VALUES (true, %s)
               ON CONFLICT (singleton) DO UPDATE SET snapshot_id = EXCLUDED.snapshot_id""",
            (snapshot_id,),
        )
    return snapshot_id


if __name__ == "__main__":
    snapshot = seed()
    print(f"Imported verified public snapshot {snapshot}.")

"""Bounded public corpus queries; the original bytes stay in immutable objects."""

from hashlib import sha256

from .config import Settings
from .database import connect

INVESTIGATION_FIELDS = (
    "accession",
    "title",
    "acronym",
    "doi",
    "version",
    "description",
    "objective",
    "approach",
    "research_area",
    "sub_research_area",
    "license",
    "source_url",
    "declared_bytes",
    "hardware",
    "platform",
    "quality_notes",
    "status",
)
ASSET_FIELDS = (
    "id",
    "accession",
    "investigation_version",
    "file_name",
    "file_version",
    "sha256",
    "byte_size",
    "media_type",
    "encoding",
    "source_url",
    "doi",
    "license",
    "kind",
)


class MissingSource(LookupError):
    """A requested source or snapshot is absent from this frozen corpus."""


def public_investigation(record: dict) -> dict:
    return {key: record.get(key) for key in INVESTIGATION_FIELDS}


def public_asset(record: dict) -> dict:
    return {key: record.get(key) for key in ASSET_FIELDS}


class Corpus:
    def __init__(self, settings: Settings):
        self.settings = settings

    def snapshot(self, snapshot_id: str | None = None) -> dict:
        with connect(self.settings.database_url) as connection:
            row = connection.execute(
                """SELECT id, fetched_at, manifest FROM snapshots
                   WHERE id = COALESCE(%s, (SELECT snapshot_id FROM corpus_state))""",
                (snapshot_id,),
            ).fetchone()
        if not row:
            raise MissingSource("No verified corpus snapshot has been imported.")
        return {
            "snapshot_id": row["id"],
            "fetched_at": row["fetched_at"].isoformat(),
            "investigation_count": len(row["manifest"]["investigations"]),
            "asset_count": len(row["manifest"]["assets"]),
            "manifest": row["manifest"],
        }

    def investigations(
        self, query: str, limit: int, offset: int, snapshot_id: str | None = None
    ) -> dict:
        snapshot_id = self.snapshot(snapshot_id)["snapshot_id"]
        with connect(self.settings.database_url) as connection:
            # Search terms remain parameters even when they contain SQL or wildcard syntax.
            parameters = (snapshot_id, query, query, query)
            where = """snapshot_id = %s AND (%s = '' OR
                search_document @@ websearch_to_tsquery('simple', %s) OR accession ILIKE %s)"""
            search_parameters = (*parameters[:3], f"%{query}%")
            aggregate = connection.execute(
                "SELECT count(*) AS total FROM investigations WHERE " + where,
                search_parameters,
            ).fetchone()
            assert aggregate is not None
            total = aggregate["total"]
            rows = connection.execute(
                "SELECT record FROM investigations WHERE "
                + where
                + " ORDER BY title, accession LIMIT %s OFFSET %s",
                (*search_parameters, limit, offset),
            ).fetchall()
        return {
            "snapshot_id": snapshot_id,
            "items": [public_investigation(row["record"]) for row in rows],
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def investigation(self, accession: str, snapshot_id: str | None = None) -> dict:
        snapshot_id = snapshot_id or self.snapshot()["snapshot_id"]
        with connect(self.settings.database_url) as connection:
            row = connection.execute(
                "SELECT record FROM investigations WHERE snapshot_id = %s AND accession = %s",
                (snapshot_id, accession),
            ).fetchone()
            if not row:
                raise MissingSource("Investigation is not in the requested snapshot.")
            assets = connection.execute(
                """SELECT record FROM source_assets WHERE snapshot_id = %s AND accession = %s
                   ORDER BY file_name, file_version""",
                (snapshot_id, accession),
            ).fetchall()
        return {
            **public_investigation(row["record"]),
            "snapshot_id": snapshot_id,
            "assets": [public_asset(asset["record"]) for asset in assets],
        }

    def asset(self, digest: str, snapshot_id: str | None = None) -> dict:
        snapshot_id = snapshot_id or self.snapshot()["snapshot_id"]
        with connect(self.settings.database_url) as connection:
            row = connection.execute(
                """SELECT record FROM source_assets WHERE snapshot_id = %s AND sha256 = %s
                   ORDER BY accession, file_name LIMIT 1""",
                (snapshot_id, digest),
            ).fetchone()
        if not row:
            raise MissingSource("Asset is not in the requested public snapshot.")
        return public_asset(row["record"])

    def asset_bytes(self, asset: dict) -> bytes:
        digest = asset["sha256"]
        if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
            raise ValueError("Invalid content identifier.")
        data = (self.settings.object_directory / digest).read_bytes()
        if len(data) != asset["byte_size"] or sha256(data).hexdigest() != digest:
            raise ValueError("Retained source bytes fail the stored checksum or size check.")
        return data

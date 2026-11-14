"""PostgreSQL connections and transactional, checksum-checked schema revisions."""

from collections.abc import Iterator
from contextlib import contextmanager
from hashlib import sha256
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

DatabaseConnection = psycopg.Connection[dict[str, Any]]


@contextmanager
def connect(database_url: str) -> Iterator[DatabaseConnection]:
    with psycopg.connect(
        database_url,
        row_factory=dict_row,
        connect_timeout=5,
        options="-c statement_timeout=10000 -c idle_in_transaction_session_timeout=15000",
    ) as connection:
        yield connection


def migrate(database_url: str) -> None:
    migration_directory = Path(__file__).with_name("migrations")
    with connect(database_url) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(701419)")
        connection.execute(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                revision text PRIMARY KEY,
                sha256 char(64) NOT NULL,
                applied_at timestamptz NOT NULL DEFAULT now()
            )"""
        )
        for migration in sorted(migration_directory.glob("*.sql")):
            contents = migration.read_bytes()
            digest = sha256(contents).hexdigest()
            row = connection.execute(
                "SELECT sha256 FROM schema_migrations WHERE revision = %s",
                (migration.stem,),
            ).fetchone()
            if row:
                if row["sha256"] != digest:
                    raise RuntimeError(f"Applied migration changed: {migration.stem}")
                continue
            connection.execute(contents.decode("utf-8"))
            connection.execute(
                "INSERT INTO schema_migrations (revision, sha256) VALUES (%s, %s)",
                (migration.stem, digest),
            )

"""Receipt-scoped jobs with database leases and fenced result publication."""

import secrets
from hashlib import sha256
from hmac import compare_digest
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from .database import DatabaseConnection, connect


class JobNotFound(LookupError):
    pass


def append_event(
    connection: DatabaseConnection, job_id: str, attempt: int, event_type: str
) -> None:
    """Caller holds the job row lock, serializing sequence allocation."""
    connection.execute(
        """INSERT INTO job_events (job_id, sequence, attempt, event_type)
           SELECT %s, COALESCE(max(sequence), 0) + 1, %s, %s
           FROM job_events WHERE job_id = %s""",
        (job_id, attempt, event_type, job_id),
    )


def create_job(database_url: str, snapshot_id: str) -> dict:
    job_id, receipt = str(uuid4()), secrets.token_urlsafe(32)
    with connect(database_url) as connection:
        connection.execute(
            """INSERT INTO jobs (id, kind, snapshot_id, receipt_sha256)
               VALUES (%s, 'export_flex', %s, %s)""",
            (job_id, snapshot_id, sha256(receipt.encode()).hexdigest()),
        )
        append_event(connection, job_id, 0, "queued")
    return {"id": job_id, "receipt": receipt, "status": "queued"}


def authorized_job(connection: DatabaseConnection, job_id: UUID | str, receipt: str | None) -> dict:
    row = connection.execute(
        "SELECT * FROM jobs WHERE id = %s AND expires_at > now() FOR UPDATE",
        (str(job_id),),
    ).fetchone()
    supplied = sha256((receipt or "").encode()).hexdigest()
    if not row or not compare_digest(row["receipt_sha256"], supplied):
        raise JobNotFound("No accessible job matches this receipt.")
    return row


def read_job(database_url: str, job_id: UUID | str, receipt: str | None) -> dict:
    with connect(database_url) as connection:
        job = authorized_job(connection, job_id, receipt)
    return {
        "id": str(job["id"]),
        "kind": job["kind"],
        "snapshot_id": job["snapshot_id"],
        "status": job["status"],
        "attempt": job["attempt"],
        "created_at": job["created_at"].isoformat(),
        "expires_at": job["expires_at"].isoformat(),
        "error_code": job["error_code"],
        "result": job["result"] if job["status"] == "succeeded" else None,
    }


def read_events(database_url: str, job_id: UUID | str, receipt: str | None, after: int) -> list:
    with connect(database_url) as connection:
        authorized_job(connection, job_id, receipt)
        rows = connection.execute(
            """SELECT sequence, attempt, event_type, created_at FROM job_events
               WHERE job_id = %s AND sequence > %s ORDER BY sequence LIMIT 100""",
            (str(job_id), after),
        ).fetchall()
    return [{**row, "created_at": row["created_at"].isoformat()} for row in rows]


def cancel_job(database_url: str, job_id: UUID | str, receipt: str | None) -> dict:
    with connect(database_url) as connection:
        job = authorized_job(connection, job_id, receipt)
        if job["status"] in ("queued", "running"):
            connection.execute(
                """UPDATE jobs SET status = 'canceled', lease_until = NULL, updated_at = now()
                   WHERE id = %s""",
                (str(job_id),),
            )
            append_event(connection, str(job_id), job["attempt"], "canceled")
    return read_job(database_url, job_id, receipt)


def delete_job(database_url: str, job_id: UUID | str, receipt: str | None) -> None:
    with connect(database_url) as connection:
        authorized_job(connection, job_id, receipt)
        connection.execute("DELETE FROM jobs WHERE id = %s", (str(job_id),))


def claim_job(database_url: str) -> dict | None:
    with connect(database_url) as connection:
        job = connection.execute(
            """SELECT id FROM jobs WHERE expires_at > now() AND
               (status = 'queued' OR (status = 'running' AND lease_until < now()))
               ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1"""
        ).fetchone()
        if not job:
            return None
        claimed = connection.execute(
            """UPDATE jobs SET status = 'running', attempt = attempt + 1,
               lease_until = now() + interval '60 seconds', updated_at = now()
               WHERE id = %s RETURNING id, kind, snapshot_id, attempt""",
            (job["id"],),
        ).fetchone()
        assert claimed is not None
        append_event(connection, str(claimed["id"]), claimed["attempt"], "running")
    return {**claimed, "id": str(claimed["id"])}


def finish_job(database_url: str, job_id: str, attempt: int, result: dict | None) -> bool:
    with connect(database_url) as connection:
        job = connection.execute(
            """SELECT status, attempt FROM jobs WHERE id = %s
               AND expires_at > now() AND lease_until > now() FOR UPDATE""",
            (job_id,),
        ).fetchone()
        if not job or job["status"] != "running" or job["attempt"] != attempt:
            return False
        status = "succeeded" if result is not None else "failed"
        connection.execute(
            """UPDATE jobs SET status = %s, result = %s, error_code = %s,
               lease_until = NULL, updated_at = now() WHERE id = %s""",
            (
                status,
                Jsonb(result) if result is not None else None,
                None if result is not None else "source_analysis_failed",
                job_id,
            ),
        )
        append_event(connection, job_id, attempt, status)
    return True

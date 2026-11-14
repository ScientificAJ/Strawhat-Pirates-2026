"""Receipt-scoped durable jobs, resumable steps, approvals and fenced publication."""

import json
import secrets
from hashlib import sha256
from hmac import compare_digest
from typing import Any
from uuid import UUID, uuid4

from psycopg.types.json import Jsonb

from .database import DatabaseConnection, connect

JOB_KINDS = frozenset(
    {
        "export_flex",
        "export_case",
        "execute_code",
        "research",
        "registered_analysis",
        "source_acquisition",
    }
)
MAX_INPUT_BYTES = 2 * 1024 * 1024


class JobNotFound(LookupError):
    pass


class JobConflict(ValueError):
    pass


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def append_event(
    connection: DatabaseConnection,
    job_id: str,
    attempt: int,
    event_type: str,
    payload: dict | None = None,
) -> None:
    """Caller holds the job row lock, serializing sequence allocation and publication."""
    connection.execute(
        """INSERT INTO job_events (job_id, sequence, attempt, event_type, payload)
           SELECT %s, COALESCE(max(sequence), 0) + 1, %s, %s, %s
           FROM job_events WHERE job_id = %s""",
        (job_id, attempt, event_type, Jsonb(payload or {}), job_id),
    )


def create_job(
    database_url: str,
    snapshot_id: str,
    *,
    kind: str = "export_flex",
    inputs: dict | None = None,
    receipt: str | None = None,
    idempotency_key: str | None = None,
    approval_required: bool = False,
) -> dict:
    if receipt is not None and not 32 <= len(receipt) <= 256:
        raise ValueError("The browser receipt must contain between 32 and 256 characters.")
    if idempotency_key and receipt is None:
        raise ValueError("Idempotency requires an existing browser receipt.")
    receipt = receipt or secrets.token_urlsafe(32)
    result = _insert_job(
        database_url,
        snapshot_id,
        sha256(receipt.encode()).hexdigest(),
        kind=kind,
        inputs=inputs,
        idempotency_key=idempotency_key,
        approval_required=approval_required,
    )
    return {**result, "receipt": receipt}


def create_job_for_receipt_hash(
    database_url: str,
    snapshot_id: str,
    receipt_sha256: str,
    *,
    kind: str = "research",
    inputs: dict | None = None,
    idempotency_key: str | None = None,
    approval_required: bool = False,
) -> dict:
    """Internal continuation for a previously authorized owner; never expose as a public input."""
    if len(receipt_sha256) != 64 or any(c not in "0123456789abcdef" for c in receipt_sha256):
        raise ValueError("A stored receipt identifier must be a SHA-256 hexadecimal digest.")
    return _insert_job(
        database_url,
        snapshot_id,
        receipt_sha256,
        kind=kind,
        inputs=inputs,
        idempotency_key=idempotency_key,
        approval_required=approval_required,
    )


def _insert_job(
    database_url: str,
    snapshot_id: str,
    receipt_hash: str,
    *,
    kind: str,
    inputs: dict | None,
    idempotency_key: str | None,
    approval_required: bool,
) -> dict:
    if kind not in JOB_KINDS:
        raise ValueError("Unsupported workflow kind.")
    if idempotency_key is not None and not 1 <= len(idempotency_key) <= 128:
        raise ValueError("An idempotency key must contain between one and 128 characters.")
    inputs = inputs or {}
    encoded = canonical_json(inputs)
    if len(encoded) > MAX_INPUT_BYTES:
        raise ValueError("Selected workflow inputs exceed the two MiB limit.")
    job_id = str(uuid4())
    inputs_hash = sha256(encoded).hexdigest()
    status = "waiting_approval" if approval_required else "queued"
    with connect(database_url) as connection:
        if idempotency_key:
            # Serialize requests for this scope before looking up a prior operation.
            connection.execute(
                "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                (receipt_hash + idempotency_key,),
            )
            previous = connection.execute(
                """SELECT id, kind, inputs_sha256, snapshot_id, status, expires_at > now() AS live
                   FROM jobs WHERE receipt_sha256 = %s AND idempotency_key = %s""",
                (receipt_hash, idempotency_key),
            ).fetchone()
            if previous:
                if (
                    not previous["live"]
                    or previous["kind"] != kind
                    or previous["inputs_sha256"] != inputs_hash
                    or previous["snapshot_id"] != snapshot_id
                ):
                    raise JobConflict("This operation key belongs to different or expired inputs.")
                return {
                    "id": str(previous["id"]),
                    "status": previous["status"],
                    "reused": True,
                }
        connection.execute(
            """INSERT INTO jobs
               (id, kind, snapshot_id, receipt_sha256, status, inputs, inputs_sha256,
                idempotency_key, approval)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                job_id,
                kind,
                snapshot_id,
                receipt_hash,
                status,
                Jsonb(inputs),
                inputs_hash,
                idempotency_key,
                Jsonb({"scope": kind, "inputs_sha256": inputs_hash}) if approval_required else None,
            ),
        )
        append_event(connection, job_id, 0, status)
    return {"id": job_id, "status": status, "reused": False}


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
        steps = connection.execute(
            """SELECT step_key, attempt, status, provider_request_id, updated_at
               FROM job_steps WHERE job_id = %s ORDER BY created_at, step_key""",
            (str(job_id),),
        ).fetchall()
    return {
        "id": str(job["id"]),
        "kind": job["kind"],
        "snapshot_id": job["snapshot_id"],
        "status": job["status"],
        "attempt": job["attempt"],
        "created_at": job["created_at"].isoformat(),
        "expires_at": job["expires_at"].isoformat(),
        "error_code": job["error_code"],
        "approval": job["approval"],
        "approval_revision": job["approval_revision"],
        "steps": [{**row, "updated_at": row["updated_at"].isoformat()} for row in steps],
        "result": job["result"] if job["status"] == "succeeded" else None,
        "partial_result": job["result"] if job["status"] != "succeeded" else None,
    }


def read_events(database_url: str, job_id: UUID | str, receipt: str | None, after: int) -> list:
    with connect(database_url) as connection:
        authorized_job(connection, job_id, receipt)
        rows = connection.execute(
            """SELECT sequence, attempt, event_type, payload, created_at FROM job_events
               WHERE job_id = %s AND sequence > %s ORDER BY sequence LIMIT 100""",
            (str(job_id), after),
        ).fetchall()
    return [{**row, "created_at": row["created_at"].isoformat()} for row in rows]


def cancel_job(database_url: str, job_id: UUID | str, receipt: str | None) -> dict:
    with connect(database_url) as connection:
        job = authorized_job(connection, job_id, receipt)
        if job["status"] in ("queued", "running", "waiting_approval"):
            connection.execute(
                """UPDATE jobs SET status = 'canceled', lease_until = NULL, updated_at = now()
                   WHERE id = %s""",
                (str(job_id),),
            )
            append_event(connection, str(job_id), job["attempt"], "canceled")
    return read_job(database_url, job_id, receipt)


def approve_job(
    database_url: str,
    job_id: UUID | str,
    receipt: str | None,
    expected_revision: int,
    inputs_sha256: str,
) -> dict:
    with connect(database_url) as connection:
        job = authorized_job(connection, job_id, receipt)
        if (
            job["status"] != "waiting_approval"
            or job["approval_revision"] != expected_revision
            or job["inputs_sha256"] != inputs_sha256
        ):
            raise JobConflict("Approval no longer matches the pending operation and inputs.")
        connection.execute(
            """UPDATE jobs SET status = 'queued', approval_revision = approval_revision + 1,
               approval = approval || '{"approved": true}'::jsonb, updated_at = now()
               WHERE id = %s""",
            (str(job_id),),
        )
        append_event(connection, str(job_id), job["attempt"], "approved")
    return read_job(database_url, job_id, receipt)


def delete_job(database_url: str, job_id: UUID | str, receipt: str | None) -> None:
    with connect(database_url) as connection:
        authorized_job(connection, job_id, receipt)
        connection.execute("DELETE FROM jobs WHERE id = %s", (str(job_id),))


def claim_job(
    database_url: str,
    *,
    kinds: frozenset[str] | None = None,
    exclude_kinds: frozenset[str] | None = None,
) -> dict | None:
    if (kinds is not None and not kinds.issubset(JOB_KINDS)) or (
        exclude_kinds is not None and not exclude_kinds.issubset(JOB_KINDS)
    ):
        raise ValueError("A worker filter contains an unsupported job kind.")
    selected = None if kinds is None else sorted(kinds)
    excluded = None if exclude_kinds is None else sorted(exclude_kinds)
    with connect(database_url) as connection:
        # Exhausted abandoned attempts become terminal rather than looping forever.
        exhausted = connection.execute(
            """UPDATE jobs SET status = 'failed', error_code = 'attempt_limit',
               lease_until = NULL, updated_at = now()
               WHERE status = 'running' AND lease_until < now() AND attempt >= max_attempts
               RETURNING id, attempt"""
        ).fetchall()
        for item in exhausted:
            append_event(
                connection, str(item["id"]), item["attempt"], "failed", {"reason": "attempt_limit"}
            )
        job = connection.execute(
            """SELECT id FROM jobs WHERE expires_at > now() AND attempt < max_attempts AND
               (status = 'queued' OR (status = 'running' AND lease_until < now()))
               AND (%s::text[] IS NULL OR kind = ANY(%s::text[]))
               AND (%s::text[] IS NULL OR NOT kind = ANY(%s::text[]))
               ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1""",
            (selected, selected, excluded, excluded),
        ).fetchone()
        if not job:
            return None
        claimed = connection.execute(
            """UPDATE jobs SET status = 'running', attempt = attempt + 1,
               lease_until = now() + interval '60 seconds', updated_at = now()
               WHERE id = %s RETURNING id, kind, snapshot_id, inputs, attempt, receipt_sha256""",
            (job["id"],),
        ).fetchone()
        assert claimed is not None
        append_event(connection, str(claimed["id"]), claimed["attempt"], "running")
    return {**claimed, "id": str(claimed["id"])}


def running_job(connection: DatabaseConnection, job_id: str, attempt: int) -> dict | None:
    job = connection.execute(
        """SELECT * FROM jobs WHERE id = %s AND expires_at > now()
           AND lease_until > now() FOR UPDATE""",
        (job_id,),
    ).fetchone()
    if not job or job["status"] != "running" or job["attempt"] != attempt:
        return None
    return job


def heartbeat(database_url: str, job_id: str, attempt: int) -> bool:
    with connect(database_url) as connection:
        if not running_job(connection, job_id, attempt):
            return False
        connection.execute(
            "UPDATE jobs SET lease_until = now() + interval '60 seconds' WHERE id = %s",
            (job_id,),
        )
    return True


def progress(database_url: str, job_id: str, attempt: int, stage: str, detail: dict) -> bool:
    if len(canonical_json(detail)) > 16384:
        raise ValueError("Progress detail exceeds the event limit.")
    with connect(database_url) as connection:
        if not running_job(connection, job_id, attempt):
            return False
        append_event(connection, job_id, attempt, stage, detail)
    return True


def begin_step(database_url: str, job_id: str, attempt: int, key: str) -> dict | None:
    """Reuse completed deterministic steps; never automatically replay uncertain paid steps."""
    if not key or len(key) > 128:
        raise ValueError("Invalid step key.")
    with connect(database_url) as connection:
        if not running_job(connection, job_id, attempt):
            raise JobConflict("This worker attempt is no longer active.")
        previous = connection.execute(
            "SELECT * FROM job_steps WHERE job_id = %s AND step_key = %s FOR UPDATE",
            (job_id, key),
        ).fetchone()
        if previous and previous["status"] == "succeeded":
            return previous["result"]
        if previous and previous["status"] in ("running", "uncertain"):
            raise JobConflict("A previous step has uncertain completion; inspect before retrying.")
        connection.execute(
            """INSERT INTO job_steps (job_id, step_key, attempt, status)
               VALUES (%s, %s, %s, 'running') ON CONFLICT (job_id, step_key)
               DO UPDATE SET attempt = EXCLUDED.attempt, status = 'running', updated_at = now()""",
            (job_id, key, attempt),
        )
        append_event(connection, job_id, attempt, "step_started", {"step_key": key})
    return None


def finish_step(
    database_url: str,
    job_id: str,
    attempt: int,
    key: str,
    result: dict | None,
    *,
    provider_request_id: str | None = None,
    uncertain: bool = False,
) -> bool:
    with connect(database_url) as connection:
        if not running_job(connection, job_id, attempt):
            return False
        row = connection.execute(
            """UPDATE job_steps SET status = %s, result = %s, provider_request_id = %s,
               updated_at = now() WHERE job_id = %s AND step_key = %s
               AND attempt = %s AND status = 'running' RETURNING step_key""",
            (
                "uncertain" if uncertain else "succeeded" if result is not None else "failed",
                Jsonb(result) if result is not None else None,
                provider_request_id,
                job_id,
                key,
                attempt,
            ),
        ).fetchone()
        if not row:
            return False
        append_event(connection, job_id, attempt, "step_finished", {"step_key": key})
    return True


def finish_job(
    database_url: str,
    job_id: str,
    attempt: int,
    result: dict | None,
    *,
    error_code: str = "source_analysis_failed",
) -> bool:
    if result is not None and len(canonical_json(result)) > MAX_INPUT_BYTES:
        raise ValueError("A workflow result exceeds its two MiB structured-result limit.")
    with connect(database_url) as connection:
        if not running_job(connection, job_id, attempt):
            return False
        status = "succeeded" if result is not None else "failed"
        connection.execute(
            """UPDATE jobs SET status = %s, result = COALESCE(%s, result), error_code = %s,
               lease_until = NULL, updated_at = now() WHERE id = %s""",
            (
                status,
                Jsonb(result) if result is not None else None,
                None if result is not None else error_code,
                job_id,
            ),
        )
        append_event(connection, job_id, attempt, status)
    return True


def record_partial(database_url: str, job_id: str, attempt: int, partial: dict) -> bool:
    """Retain incomplete work after interruption without activating a final result."""
    if len(canonical_json(partial)) > MAX_INPUT_BYTES:
        raise ValueError("Partial work exceeds the structured-result limit.")
    with connect(database_url) as connection:
        row = connection.execute(
            """SELECT status, attempt FROM jobs WHERE id = %s AND expires_at > now() FOR UPDATE""",
            (job_id,),
        ).fetchone()
        if not row or row["attempt"] != attempt or row["status"] == "succeeded":
            return False
        value = {**partial, "incomplete": True, "attempt": attempt}
        connection.execute("UPDATE jobs SET result = %s WHERE id = %s", (Jsonb(value), job_id))
        append_event(connection, job_id, attempt, "partial_result", {"incomplete": True})
    return True


def purge_expired(database_url: str) -> list[str]:
    with connect(database_url) as connection:
        rows = connection.execute(
            "DELETE FROM jobs WHERE expires_at <= now() RETURNING id"
        ).fetchall()
    return [str(row["id"]) for row in rows]

"""Consume typed durable research jobs; submitted code runs only through gVisor."""

import logging
import mimetypes
import signal
import subprocess
import time
from hashlib import sha256
from importlib.util import find_spec
from pathlib import PurePosixPath
from threading import Event, Thread

from nova_ember.api import jobs
from nova_ember.api.artifacts import publish_artifact, remove_artifact_files
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.exporting import CaseExport, build_export
from nova_ember.api.repository import Corpus
from nova_ember.api.science import flex_endpoints
from nova_ember.api.workflows import ExecutionCommand

from .execution import (
    SESSIONS,
    DirectSession,
    ExecutionStopped,
    ExecutionUnavailable,
    RuntimeProfile,
    close_all,
    reports_missing_container,
)

STOPPING = Event()
_LAST_VOICE_CHECK = 0.0


class SourceRefresh:
    """Keep one observable metadata-refresh thread beside the interactive worker queue."""

    def __init__(self, settings: Settings, stop_event: Event):
        self.settings = settings
        self.stop_event = stop_event
        self.thread: Thread | None = None
        self.next_check = 0.0

    def start_if_due(self) -> bool:
        if self.stop_event.is_set() or (self.thread is not None and self.thread.is_alive()):
            return False
        if time.monotonic() < self.next_check:
            return False
        self.next_check = time.monotonic() + 60

        def refresh() -> None:
            from nova_ember.api.discovery import refresh_public_sources

            try:
                refresh_public_sources(self.settings, stop_event=self.stop_event)
            except Exception as error:
                # The source adapter owns checkpoint diagnostics; do not log signed resolver URLs.
                logging.error(
                    "Public source refresh failed (%s); the last complete snapshot remains active.",
                    type(error).__name__,
                )

        self.thread = Thread(target=refresh, name="public-source-refresh", daemon=True)
        self.thread.start()
        return True

    def stop(self) -> None:
        self.stop_event.set()
        if self.thread is not None:
            self.thread.join(timeout=5)
            if self.thread.is_alive():
                logging.info(
                    "Source refresh is stopping during a bounded request; checkpoint retained."
                )


def clean_sessions(settings: Settings) -> None:
    global _LAST_VOICE_CHECK
    now = time.monotonic()
    if now - _LAST_VOICE_CHECK > 5 and find_spec("nova_ember.api.voice") is not None:
        from nova_ember.api.voice import close_expired_voice_sessions

        close_expired_voice_sessions(settings)
        _LAST_VOICE_CHECK = now
    for session_id, session in list(SESSIONS.items()):
        with connect(settings.database_url) as connection:
            row = connection.execute(
                """SELECT status = 'open' AND expires_at > now() AND deadline > now() AS active
                   FROM execution_sessions WHERE id = %s""",
                (session_id,),
            ).fetchone()
        if not row or not row["active"]:
            if session.close():
                SESSIONS.pop(session_id, None)
                record_termination(settings, session_id, "closed_or_expired")
    reconcile_sessions(settings)
    from nova_ember.api.uploads import cleanup_expired_uploads

    cleanup_expired_uploads(settings)
    for job_id in jobs.purge_expired(settings.database_url):
        remove_artifact_files(settings.object_directory, job_id)


def record_termination(settings: Settings, session_id: str, reason: str) -> None:
    with connect(settings.database_url) as connection:
        connection.execute(
            """UPDATE execution_sessions SET status = CASE WHEN status = 'open' THEN 'closed'
               ELSE status END, terminated_at = COALESCE(terminated_at, now()),
               termination_reason = %s WHERE id = %s""",
            (reason, session_id),
        )


def reconcile_sessions(settings: Settings) -> None:
    """Remove guests abandoned by a worker restart, then record observed teardown."""
    with connect(settings.database_url) as connection:
        rows = connection.execute(
            """SELECT id, cell_count, status,
               status = 'open' AND expires_at > now() AND deadline > now() AS active
               FROM execution_sessions WHERE terminated_at IS NULL ORDER BY created_at LIMIT 100"""
        ).fetchall()
    for row in rows:
        session_id = str(row["id"])
        if session_id in SESSIONS:
            continue
        name = "nova-analysis-" + session_id
        inspected = subprocess.run(
            ["docker", "inspect", "--format", "{{.State.Running}}", name],
            capture_output=True,
            timeout=5,
            check=False,
        )
        missing = inspected.returncode and reports_missing_container(inspected.stderr)
        if inspected.returncode and not missing:
            continue  # A daemon observation failure is not proof that a guest stopped.
        if row["active"] and row["cell_count"] == 0 and missing:
            continue
        if not missing:
            removed = subprocess.run(
                ["docker", "rm", "--force", name], capture_output=True, timeout=10, check=False
            )
            if removed.returncode:
                continue
        with connect(settings.database_url) as connection:
            connection.execute(
                "UPDATE execution_sessions SET status = 'interrupted' "
                "WHERE id = %s AND status = 'open'",
                (session_id,),
            )
        record_termination(
            settings, session_id, "worker_restart" if row["active"] else "closed_or_expired"
        )


def execute_code_job(settings: Settings, job: dict) -> dict:
    inputs = dict(job["inputs"])
    session_id = inputs.pop("session_id")
    command = ExecutionCommand.model_validate(inputs)
    with connect(settings.database_url) as connection:
        session = connection.execute(
            """SELECT session.* FROM execution_sessions session JOIN jobs job
               ON session.receipt_sha256 = job.receipt_sha256
               AND session.snapshot_id = job.snapshot_id
               WHERE session.id = %s AND job.id = %s AND session.status = 'open'
               AND session.expires_at > now() AND session.deadline > now() FOR UPDATE OF session""",
            (session_id, job["id"]),
        ).fetchone()
    if not session:
        raise ExecutionStopped("The originating execution session is closed or expired.")
    if session["cumulative_seconds"] >= 300 or session["cell_count"] >= 100:
        raise ExecutionStopped("The session's cumulative runtime or command limit was reached.")
    if session_id not in SESSIONS:
        if session["cell_count"]:
            raise ExecutionStopped(
                "The worker restarted; the interrupted guest state cannot be reconstructed."
            )
        corpus = Corpus(settings)
        frozen = {}
        manifest = []
        for reference in session["input_assets"]:
            if isinstance(reference, dict):
                if "upload_id" in reference:
                    from nova_ember.api.uploads import read_private_upload_execution_input

                    name, content, asset = read_private_upload_execution_input(
                        settings, reference, session["receipt_sha256"]
                    )
                else:
                    from nova_ember.api.source_acquisition import read_acquired_execution_input

                    name, content, asset = read_acquired_execution_input(
                        settings, reference, session["receipt_sha256"]
                    )
                suffix = PurePosixPath(name).suffix
                name = reference["sha256"] + suffix
                frozen[name] = content
                manifest.append({**asset, "input_name": name})
                continue
            digest = reference
            asset = corpus.asset(digest, job["snapshot_id"])
            suffix = (
                "." + asset["file_name"].rsplit(".", 1)[-1] if "." in asset["file_name"] else ".bin"
            )
            frozen[digest + suffix] = corpus.asset_bytes(asset)
            manifest.append({**asset, "input_name": digest + suffix})
        frozen["input-manifest.json"] = jobs.canonical_json(
            {"snapshot_id": job["snapshot_id"], "assets": manifest}
        )
        SESSIONS[session_id] = DirectSession(RuntimeProfile.from_project(), session_id, frozen)
    guest = SESSIONS[session_id]
    output_buffers = {"stdout": "", "stderr": ""}
    last_output_flush = 0.0

    def flush_output(force: bool = False) -> None:
        nonlocal last_output_flush
        now = time.monotonic()
        if not force and now - last_output_flush < 0.25:
            return
        for stream in output_buffers:
            while output_buffers[stream]:
                text, output_buffers[stream] = (
                    output_buffers[stream][:1024],
                    output_buffers[stream][1024:],
                )
                jobs.progress(
                    settings.database_url,
                    job["id"],
                    job["attempt"],
                    "execution_output",
                    {"stream": stream, "text": text, "incomplete": True},
                )
        last_output_flush = now

    def output(stream: str, text: str) -> None:
        output_buffers[stream] += text
        flush_output(force=len(output_buffers[stream]) >= 1024)

    def active() -> bool:
        if STOPPING.is_set():
            return False
        flush_output()
        if not jobs.heartbeat(settings.database_url, job["id"], job["attempt"]):
            return False
        with connect(settings.database_url) as connection:
            row = connection.execute(
                """SELECT status = 'open' AND expires_at > now() AND deadline > now() AS active
                   FROM execution_sessions WHERE id = %s""",
                (session_id,),
            ).fetchone()
        return bool(row and row["active"])

    code = command.code
    if command.seed is not None and command.language == "python":
        code = (
            f"import random, numpy as np\nrandom.seed({command.seed})\n"
            f"np.random.seed({command.seed})\n" + code
        )
    seconds = min(90 if command.profile == "extended" else 60, 300 - session["cumulative_seconds"])
    jobs.progress(
        settings.database_url,
        job["id"],
        job["attempt"],
        "execution_started",
        {"session_id": session_id, "language": command.language, "seconds_limit": seconds},
    )
    try:
        result = guest.execute(command.language, code, seconds, active, on_output=output)
        flush_output(force=True)
        result["source_code_sha256"] = sha256(command.code.encode()).hexdigest()
        result["seed"] = command.seed
        result["input_assets"] = session["input_assets"]
        result["snapshot_id"] = job["snapshot_id"]
        result["runtime_lock_sha256"] = guest.profile.lock_sha256
        result["artifacts"] = []
        for name, content in guest.outputs():
            artifact = publish_artifact(
                settings.database_url,
                settings.object_directory,
                job["id"],
                job["attempt"],
                operation_key="execution:" + name,
                data=content,
                media_type=mimetypes.guess_type(name)[0] or "application/octet-stream",
                file_name=name,
                provenance={
                    "snapshot_id": job["snapshot_id"],
                    "code_sha256": result["source_code_sha256"],
                    "input_assets": session["input_assets"],
                    "scientific_origin": "exploratory_execution",
                    "runtime_version": result["runtime_version"],
                    "image_digest": result["image_digest"],
                    "output_name": guest.output_metadata[name],
                },
            )
            if artifact is not None:
                result["artifacts"].append(artifact)
        record = publish_artifact(
            settings.database_url,
            settings.object_directory,
            job["id"],
            job["attempt"],
            operation_key="execution-record",
            data=jobs.canonical_json(
                {
                    **result,
                    "language": command.language,
                    "source_code": command.code,
                    "executed_code": code,
                    "profile": command.profile,
                }
            ),
            media_type="application/json",
            file_name="execution-record.json",
            provenance={
                "snapshot_id": job["snapshot_id"],
                "scientific_origin": "exploratory_execution",
                "code_sha256": result["source_code_sha256"],
                "runtime_version": result["runtime_version"],
                "image_digest": result["image_digest"],
            },
        )
        if record is not None:
            result["artifacts"].append(record)
        with connect(settings.database_url) as connection:
            connection.execute(
                """UPDATE execution_sessions SET cell_count = cell_count + 1,
                   cumulative_seconds = cumulative_seconds + %s WHERE id = %s""",
                (result["elapsed_seconds"], session_id),
            )
        return result
    except (ExecutionStopped, ExecutionUnavailable, ValueError, OSError) as error:
        flush_output(force=True)
        partial = getattr(error, "partial", None)
        if partial is None and "result" in locals():
            partial = result
        if partial is not None:
            jobs.record_partial(
                settings.database_url,
                job["id"],
                job["attempt"],
                {
                    **partial,
                    "source_code": command.code,
                    "seed": command.seed,
                    "snapshot_id": job["snapshot_id"],
                    "input_assets": session["input_assets"],
                    "scientific_origin": "exploratory_execution",
                },
            )
        terminated = guest.close()
        SESSIONS.pop(session_id, None)
        with connect(settings.database_url) as connection:
            connection.execute(
                "UPDATE execution_sessions SET status = 'interrupted' WHERE id = %s", (session_id,)
            )
        if terminated:
            record_termination(settings, session_id, "execution_stopped")
        raise


def run_once(
    settings: Settings,
    *,
    kinds: frozenset[str] | None = None,
    exclude_kinds: frozenset[str] | None = None,
    maintenance: bool = True,
) -> bool:
    if maintenance:
        clean_sessions(settings)
    job = jobs.claim_job(settings.database_url, kinds=kinds, exclude_kinds=exclude_kinds)
    if not job:
        return False
    try:
        if job["kind"] == "export_flex":
            result = flex_endpoints(Corpus(settings), job["snapshot_id"])
        elif job["kind"] == "export_case":
            spec = CaseExport.model_validate(job["inputs"])
            data, media_type, file_name, provenance = build_export(
                Corpus(settings), spec, receipt_sha256=job["receipt_sha256"]
            )
            artifact = publish_artifact(
                settings.database_url,
                settings.object_directory,
                job["id"],
                job["attempt"],
                operation_key="frozen-case",
                data=data,
                media_type=media_type,
                file_name=file_name,
                provenance=provenance,
            )
            result = {
                "artifact": artifact,
                "snapshot_id": job["snapshot_id"],
                "scientific_status": "exported_frozen_revision",
            }
        elif job["kind"] == "execute_code":
            result = execute_code_job(settings, job)
        elif job["kind"] == "research":
            from nova_ember.api.research import execute_research_job

            result = execute_research_job(settings, job)
        elif job["kind"] == "registered_analysis":
            from nova_ember.api.methods import execute_analysis_job

            result = execute_analysis_job(settings, job)
        elif job["kind"] == "source_acquisition":
            from nova_ember.api.source_acquisition import execute_source_acquisition_job

            result = execute_source_acquisition_job(settings, job, stop_event=STOPPING)
        else:
            raise ValueError("Unsupported trusted workflow kind")
    except (ValueError, LookupError, OSError, ExecutionStopped, ExecutionUnavailable):
        jobs.finish_job(
            settings.database_url, job["id"], job["attempt"], None, error_code="workflow_failed"
        )
        logging.error("A bounded workflow failed; no final scientific result was published.")
    else:
        jobs.finish_job(settings.database_url, job["id"], job["attempt"], result)
    return True


def main() -> None:
    settings = Settings.from_environment()
    stopping = STOPPING
    refresh = SourceRefresh(settings, stopping)

    def transfers() -> None:
        while not stopping.is_set():
            try:
                handled = run_once(
                    settings, kinds=frozenset({"source_acquisition"}), maintenance=False
                )
            except Exception as error:
                logging.error(
                    "Source transfer failed (%s); its lease and checkpoint remain recoverable.",
                    type(error).__name__,
                )
                stopping.wait(5)
                continue
            if not handled:
                stopping.wait(1)

    transfer_thread = Thread(target=transfers, name="source-transfer", daemon=True)
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda _signum, _frame: stopping.set())
    transfer_thread.start()
    try:
        while not stopping.is_set():
            refresh.start_if_due()
            if not run_once(settings, exclude_kinds=frozenset({"source_acquisition"})):
                stopping.wait(1)
    finally:
        refresh.stop()
        transfer_thread.join(timeout=5)
        if transfer_thread.is_alive():
            logging.info(
                "Source transfer is stopping during a bounded request; its checkpoint is retained."
            )
        close_all()


if __name__ == "__main__":
    main()

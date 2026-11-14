"""One fixed-method fitting child, separate from interactive user code."""

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from hashlib import sha256

from . import jobs
from .config import Settings
from .database import connect


def execute_analysis_job(settings: Settings, job: dict) -> dict:
    with connect(settings.database_url) as connection:
        connection.autocommit = True
        lock = connection.execute("SELECT pg_try_advisory_lock(701421) AS acquired").fetchone()
        if not lock or not lock["acquired"]:
            return {
                "status": "resource_busy",
                "value": None,
                "reason": (
                    "The single registered-calculation slot is occupied; "
                    "retained inputs can be retried."
                ),
            }
        try:
            return _execute_analysis_job(settings, job)
        finally:
            connection.execute("SELECT pg_advisory_unlock(701421)")


def _execute_analysis_job(settings: Settings, job: dict) -> dict:
    from .methods import METHODS, MethodCall, implementation_hash

    request = MethodCall.model_validate(job["inputs"])
    method = METHODS.get(request.method)
    if method is None:
        raise ValueError("This scientific method is not registered.")
    method.inputs.model_validate(request.parameters)
    code_hash = implementation_hash()
    step_key = "calculation:" + sha256((code_hash + request.model_dump_json()).encode()).hexdigest()
    with connect(settings.database_url) as connection:
        if not jobs.running_job(connection, job["id"], job["attempt"]):
            raise jobs.JobConflict("The registered analysis attempt is no longer active.")
        # A fixed pure calculation has no paid or external side effect to replay.
        connection.execute(
            """UPDATE job_steps SET status = 'failed', updated_at = now()
               WHERE job_id = %s AND step_key = %s AND attempt < %s AND status = 'running'""",
            (job["id"], step_key, job["attempt"]),
        )
    existing = jobs.begin_step(settings.database_url, job["id"], job["attempt"], step_key)
    if existing is not None:
        return existing
    started = time.monotonic()
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "PYTHONPATH": os.pathsep.join(sys.path),
        "LANG": "C.UTF-8",
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "NUMEXPR_NUM_THREADS": "1",
    }
    with (
        tempfile.TemporaryFile() as source,
        tempfile.TemporaryFile() as output,
        tempfile.TemporaryFile() as errors,
    ):
        source.write(request.model_dump_json().encode())
        source.seek(0)
        process = subprocess.Popen(
            [sys.executable, "-m", "nova_ember.api.fit_child"],
            stdin=source,
            stdout=output,
            stderr=errors,
            env=env,
            start_new_session=True,
        )
        failure = None
        try:
            while process.poll() is None:
                if time.monotonic() - started > 30:
                    failure = (
                        "The fixed 30-second calculation limit was reached. "
                        "Select a smaller frozen interval or cohort."
                    )
                    break
                if not jobs.heartbeat(settings.database_url, job["id"], job["attempt"]):
                    failure = "The calculation was canceled, expired or superseded."
                    break
                try:
                    process.wait(timeout=0.25)
                except subprocess.TimeoutExpired:
                    continue
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        output.seek(0)
        content = output.read(4 * 1024 * 1024 + 1)
        if failure or process.returncode != 0 or len(content) > 4 * 1024 * 1024:
            result = {
                "status": "resource_or_calculation_failure",
                "value": None,
                "method": request.method,
                "reason": failure
                or (
                    "The registered child could not complete within its "
                    "checked input, memory and output constraints."
                ),
                "input_preserved": True,
            }
        else:
            result = json.loads(content)
            result["resources"]["wall_seconds"] = time.monotonic() - started
    jobs.finish_step(settings.database_url, job["id"], job["attempt"], step_key, result)
    return result

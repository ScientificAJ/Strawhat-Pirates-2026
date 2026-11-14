"""Direct gVisor qualification, persistent language state and enforced resource boundaries."""

import json
import os
import subprocess
from dataclasses import replace
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus
from nova_ember.api.seed import seed
from nova_ember.workers.__main__ import clean_sessions, run_once
from nova_ember.workers.execution import (
    DirectSession,
    ExecutionStopped,
    RuntimeProfile,
    close_all,
    oci_spec,
    validate_svg,
)


@pytest.mark.parametrize(
    "content",
    [
        b"<svg><script>alert(1)</script></svg>",
        b'<svg><image href="https://example.test/a"/></svg>',
        b"<!DOCTYPE svg><svg/>",
        b'<svg onload="x()"/>',
    ],
)
def test_output_svg_does_not_admit_active_or_external_content(content):
    with pytest.raises(ValueError):
        validate_svg(content)


def test_runtime_profile_does_not_mount_credentials_or_host_namespace():
    spec = oci_spec()
    assert spec["root"]["readonly"]
    assert spec["process"]["user"]["uid"] == 65534
    assert not spec["process"]["capabilities"]["permitted"]
    assert not any("OPENAI" in item or "DATABASE" in item for item in spec["process"]["env"])
    assert {item["destination"] for item in spec["mounts"]} == {
        "/proc",
        "/work",
        "/tmp",
        "/inputs",
        "/outputs",
    }
    assert "network" in {item["type"] for item in spec["linux"]["namespaces"]}


requires_runtime = pytest.mark.skipif(
    os.environ.get("NOVA_TEST_EXECUTION") != "1",
    reason="Set NOVA_TEST_EXECUTION=1 for the actual local gVisor tests.",
)


@requires_runtime
def test_real_gvisor_python_shell_state_denial_and_output_broker():
    profile = RuntimeProfile.from_project()
    session = DirectSession(profile, str(uuid4()), {"fixture.csv": b"time,value\n0,0\n1,2\n2,4\n"})
    try:
        code = (
            "import numpy as np; from scipy.stats import linregress\n"
            "import os, pathlib, socket, csv\n"
            "assert 'OPENAI_API_KEY' not in os.environ\n"
            "assert not pathlib.Path('/var/run/docker.sock').exists()\n"
            "assert not pathlib.Path('/home/rahul').exists()\n"
            "rows=list(csv.DictReader(open('/inputs/fixture.csv')))\n"
            "xs=[float(r['time']) for r in rows]\n"
            "ys=[float(r['value']) for r in rows]\nslope=linregress(xs,ys).slope\n"
            "assert slope == 2\n"
            "try:\n socket.create_connection(('8.8.8.8',53),timeout=.2)\n"
            "except OSError:\n pass\nelse:\n raise AssertionError('External network reached')\n"
            "pathlib.Path('/outputs/result.csv').write_text('slope\\n2\\n')\n"
            "answer=42\nprint(answer)"
        )
        first = session.execute("python", code, 60, lambda: True)
        assert first["exit_code"] == 0 and first["stdout"].strip() == "42"
        assert (
            session.execute("python", "print(answer)", 60, lambda: True)["stdout"].strip() == "42"
        )
        assert (
            session.execute("shell", "value=42; printf '%s' \"$value\"", 60, lambda: True)[
                "stdout"
            ].strip()
            == "42"
        )
        assert (
            session.execute("shell", "printf '%s' \"$value\"", 60, lambda: True)["stdout"].strip()
            == "42"
        )
        files = session.outputs()
        assert files == [("result.csv", b"slope\n2\n")]
        configured = subprocess.check_output(
            ["docker", "inspect", session.container_name, "--format", "{{json .HostConfig}}"],
            text=True,
        )
        limits = json.loads(configured)
        assert limits["Memory"] == profile.memory_bytes and limits["NanoCpus"] == 1_000_000_000
        assert limits["PidsLimit"] == 128 and limits["NetworkMode"] == "none"
        assert limits["ReadonlyRootfs"] and not limits["Privileged"]
    finally:
        session.close()
    assert (
        subprocess.run(
            ["docker", "inspect", session.container_name], capture_output=True
        ).returncode
        != 0
    )


@requires_runtime
def test_actual_timeout_cancel_and_process_file_limits():
    profile = RuntimeProfile.from_project()
    session = DirectSession(profile, str(uuid4()), {})
    try:
        result = session.execute(
            "python",
            "import os, resource\n"
            "assert resource.getrlimit(resource.RLIMIT_NPROC)[0] == 64\n"
            "try:\n f=open('/outputs/too-large.txt','wb')\n"
            " f.write(b'x'*(20*1024*1024)); f.close()\n"
            "except OSError:\n print('file_limit_enforced')\n"
            "else:\n raise AssertionError('File limit not enforced')",
            60,
            lambda: True,
        )
        assert result["exit_code"] == 0 and "file_limit_enforced" in result["stdout"]
        with pytest.raises(ExecutionStopped, match="time limit"):
            session.execute("python", "while True: pass", 1, lambda: True)
        assert session.closed
    finally:
        session.close()
    second = DirectSession(profile, str(uuid4()), {})
    try:
        with pytest.raises(ExecutionStopped, match="canceled"):
            second.execute("shell", "sleep 20", 60, lambda: False)
    finally:
        second.close()


@requires_runtime
@pytest.mark.integration
def test_browser_owned_session_commands_artifacts_and_close(tmp_path):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("A separate test database is required.")
    original = Settings.from_environment()
    if url == original.database_url:
        raise RuntimeError("Use a separate test database.")
    settings = replace(original, database_url=url, object_directory=tmp_path / "objects")
    seed(settings)
    corpus = Corpus(settings)
    snapshot = corpus.snapshot()
    asset = next(
        asset
        for asset in snapshot["manifest"]["assets"]
        if asset["file_name"] == "PSI-69_Experimental table_FLEX.csv"
    )
    client, other = TestClient(create_app(settings)), TestClient(create_app(settings))
    created = client.post(
        "/v1/execution/sessions",
        json={"snapshot_id": snapshot["snapshot_id"], "asset_sha256": [asset["sha256"]]},
    )
    assert created.status_code == 201, created.text
    session_id = created.json()["id"]
    try:
        command_url = f"/v1/execution/sessions/{session_id}/commands"
        assert (
            other.post(command_url, json={"language": "python", "code": "print(42)"}).status_code
            == 404
        )
        code = (
            "import csv, pathlib\n"
            f"data=list(csv.reader(open('/inputs/{asset['sha256']}.csv',encoding='cp1252')))\n"
            "assert len(data)-1 == 274\nprint(len(data)-1)\n"
            "pathlib.Path('/outputs/count.txt').write_text(str(len(data)-1))"
        )
        submitted = client.post(command_url, json={"language": "python", "code": code}).json()
        assert run_once(settings)
        completed = client.get(f"/v1/workflows/{submitted['id']}").json()
        assert completed["status"] == "succeeded", completed
        assert completed["result"]["stdout"].strip() == "274"
        artifact = completed["result"]["artifacts"][0]
        assert (
            client.get(f"/v1/workflows/{submitted['id']}/artifacts/{artifact['id']}").content
            == b"274"
        )
        assert client.delete(f"/v1/execution/sessions/{session_id}").status_code == 204
        clean_sessions(settings)
        assert (
            client.post(command_url, json={"language": "shell", "code": "echo 42"}).status_code
            == 404
        )
    finally:
        close_all()
        receipt = client.cookies.get("nova_browser_receipt")
        from hashlib import sha256

        with connect(settings.database_url) as connection:
            connection.execute(
                "DELETE FROM jobs WHERE receipt_sha256 = %s",
                (sha256(receipt.encode()).hexdigest(),),
            )
            connection.execute("DELETE FROM execution_sessions WHERE id = %s", (session_id,))


@requires_runtime
def test_actual_memory_limit_and_read_only_inputs():
    from nova_ember.workers.execution import ExecutionUnavailable

    session = DirectSession(
        RuntimeProfile.from_project(), str(uuid4()), {"frozen.txt": b"original"}
    )
    try:
        checked = session.execute(
            "python",
            "from pathlib import Path\n"
            "for name in ['/inputs/frozen.txt','/etc/changed']:\n"
            " try:\n  Path(name).write_text('changed')\n"
            " except OSError:\n  pass\n"
            " else:\n  raise AssertionError('Read-only boundary failed')\n"
            "print('readonly_enforced')",
            60,
            lambda: True,
        )
        assert checked["exit_code"] == 0 and checked["stdout"].strip() == "readonly_enforced"
        memory_limit = subprocess.check_output(
            ["docker", "exec", session.container_name, "/bin/cat", "/sys/fs/cgroup/memory.max"],
            text=True,
        )
        assert memory_limit.strip() == str(1024**3)
        try:
            allocated = session.execute(
                "python", "value=bytearray(2*1024**3)\nprint('unexpected')", 15, lambda: True
            )
        except ExecutionUnavailable:
            pass
        else:
            assert allocated["exit_code"] != 0 and "MemoryError" in allocated["stderr"]
    finally:
        assert session.close()


@pytest.mark.integration
@requires_runtime
def test_worker_reconciles_abandoned_guest_and_reports_observed_teardown(tmp_path):
    from hashlib import sha256

    from nova_ember.workers.execution import SESSIONS

    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("A separate test database is required.")
    original = Settings.from_environment()
    assert url != original.database_url
    settings = replace(original, database_url=url, object_directory=tmp_path / "objects")
    seed(settings)
    snapshot_id = Corpus(settings).snapshot()["snapshot_id"]
    client = TestClient(create_app(settings))
    created = client.post("/v1/execution/sessions", json={"snapshot_id": snapshot_id}).json()
    session_id = created["id"]
    guest = None
    try:
        client.post(
            f"/v1/execution/sessions/{session_id}/commands",
            json={"language": "python", "code": "x=42"},
        )
        assert run_once(settings)
        guest = SESSIONS.pop(session_id)
        clean_sessions(settings)
        state = client.get(f"/v1/execution/sessions/{session_id}").json()
        assert state["status"] == "interrupted" and state["terminated_at"] is not None
        assert state["termination_reason"] == "worker_restart"
        assert (
            subprocess.run(
                ["docker", "inspect", guest.container_name], capture_output=True
            ).returncode
            != 0
        )
    finally:
        if guest is not None:
            guest.close()
        close_all()
        with connect(settings.database_url) as connection:
            connection.execute(
                "DELETE FROM jobs WHERE receipt_sha256 = %s",
                (sha256(client.cookies.get("nova_browser_receipt").encode()).hexdigest(),),
            )
            connection.execute("DELETE FROM execution_sessions WHERE id = %s", (session_id,))


@requires_runtime
def test_native_process_streams_and_interrupted_python_output_are_preserved():
    session = DirectSession(RuntimeProfile.from_project(), str(uuid4()), {})
    try:
        result = session.execute(
            "python",
            "import subprocess\n"
            "subprocess.run(['/bin/sh','-c','printf native; printf warning >&2'],check=True)",
            60,
            lambda: True,
        )
        assert result["stdout"] == "native" and result["stderr"] == "warning"
        shell = session.execute(
            "shell", "status=private-value; printf out; printf err >&2; false", 60, lambda: True
        )
        assert shell["stdout"] == "out" and shell["stderr"] == "err" and shell["exit_code"] == 1
        later = session.execute("shell", 'printf \'%s %s\' "$?" "$status"', 60, lambda: True)
        assert later["stdout"] == "1 private-value"
        chunks = []
        with pytest.raises(ExecutionStopped) as interrupted:
            session.execute(
                "python",
                "print('before-interruption')\nwhile True: pass",
                1,
                lambda: True,
                on_output=lambda stream, text: chunks.append((stream, text)),
            )
        assert "before-interruption" in interrupted.value.partial["stdout"]
        assert any("before-interruption" in text for _, text in chunks)
    finally:
        session.close()


@requires_runtime
@pytest.mark.integration
def test_worker_cancellation_keeps_printed_output_private_and_incomplete(tmp_path):
    import time
    from hashlib import sha256
    from threading import Thread

    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("A separate test database is required.")
    original = Settings.from_environment()
    assert url != original.database_url
    settings = replace(original, database_url=url, object_directory=tmp_path / "objects")
    seed(settings)
    client, other = TestClient(create_app(settings)), TestClient(create_app(settings))
    created = client.post(
        "/v1/execution/sessions", json={"snapshot_id": Corpus(settings).snapshot()["snapshot_id"]}
    ).json()
    session_id = created["id"]
    job = client.post(
        f"/v1/execution/sessions/{session_id}/commands",
        json={"language": "python", "code": "print('before-stop')\nwhile True: pass"},
    ).json()
    worker = Thread(target=run_once, args=(settings,))
    worker.start()
    try:
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if "before-stop" in client.get(f"/v1/workflows/{job['id']}/events").text:
                break
            time.sleep(0.05)
        else:
            pytest.fail("The command did not publish its bounded output progress.")
        assert client.post(f"/v1/workflows/{job['id']}/cancel").status_code == 200
        worker.join(timeout=10)
        assert not worker.is_alive()
        response = client.get(f"/v1/workflows/{job['id']}").json()
        assert response["status"] == "canceled" and response["result"] is None
        assert response["partial_result"]["incomplete"] is True
        assert "before-stop" in response["partial_result"]["stdout"]
        assert other.get(f"/v1/workflows/{job['id']}").status_code == 404
    finally:
        close_all()
        worker.join(timeout=5)
        with connect(settings.database_url) as connection:
            connection.execute(
                "DELETE FROM jobs WHERE receipt_sha256 = %s",
                (sha256(client.cookies.get("nova_browser_receipt").encode()).hexdigest(),),
            )
            connection.execute("DELETE FROM execution_sessions WHERE id = %s", (session_id,))


def test_missing_container_evidence_handles_cli_case_without_accepting_daemon_failure():
    from nova_ember.workers.execution import reports_missing_container

    assert reports_missing_container(b"error: no such object: nova-analysis-123")
    assert reports_missing_container(b"Error: No such container: nova-analysis-123")
    assert not reports_missing_container(b"Cannot connect to the Docker daemon")
    assert not reports_missing_container(b"permission denied while connecting to socket")

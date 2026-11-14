"""Build the locked local scientific image and qualify direct gVisor execution."""

from __future__ import annotations

import copy
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path, PurePosixPath
from uuid import uuid4

PROJECT = Path(__file__).resolve().parents[2]
RELEASE = "20261109.0"
RELEASE_SHA512 = (
    "1a6b8f74c37b4931ef473f67ec1f601690855bedc52ac709f2fac965c69677aa0426e"
    "f44598d8eee1aed72cfdb9df87a2a5f352cb3348880fc61a7732bc10f2a"
)


def prepare() -> None:
    from nova_ember.api.jobs import canonical_json
    from nova_ember.workers.execution import DirectSession, RuntimeProfile, oci_spec

    active = subprocess.check_output(
        ["docker", "ps", "--filter", "label=nova-ember.analysis=true", "--format", "{{.ID}}"],
        text=True,
    ).strip()
    if active:
        raise RuntimeError(
            "Close active analysis sessions before replacing their scientific environment."
        )

    tools = PROJECT / ".data/tools/gvisor"
    tools.mkdir(parents=True, exist_ok=True)
    if not (tools / "runsc").is_file():
        archive = tools / "gvisor.tar.bz2"
        url = f"https://storage.googleapis.com/gvisor/releases/release/{RELEASE}/x86_64/gvisor.tar.bz2"
        with urllib.request.urlopen(url, timeout=60) as response:
            archive.write_bytes(response.read(96 * 1024 * 1024 + 1))
        if hashlib.sha512(archive.read_bytes()).hexdigest() != RELEASE_SHA512:
            raise ValueError("Downloaded gVisor release differs from the reviewed checksum.")
        with tarfile.open(archive) as source:
            source.extractall(tools, filter="data")
    version = subprocess.check_output([str(tools / "runsc"), "--version"], text=True).splitlines()[
        0
    ]
    if version != f"runsc version release-{RELEASE}":
        raise ValueError("Installed gVisor release differs from the selected release.")
    fingerprint = hashlib.sha256()
    for name in [
        "uv.lock",
        "pyproject.toml",
        "sandboxes/python-analysis/Dockerfile",
        "sandboxes/python-analysis/runner.py",
    ]:
        fingerprint.update(name.encode())
        fingerprint.update((PROJECT / name).read_bytes())
    image = f"nova-ember-science:{fingerprint.hexdigest()[:16]}"
    subprocess.run(
        [
            "docker",
            "build",
            "--tag",
            image,
            "--file",
            str(PROJECT / "sandboxes/python-analysis/Dockerfile"),
            str(PROJECT),
        ],
        check=True,
        env={**os.environ, "BUILDX_CONFIG": str(PROJECT / ".data/buildx")},
    )
    digest = subprocess.check_output(
        ["docker", "image", "inspect", image, "--format", "{{.Id}}"], text=True
    ).strip()
    state = PROJECT / ".data/execution"
    state.mkdir(parents=True, exist_ok=True)
    (state / "environment.json").write_text('{"qualified": false}\n')
    rootfs = state / "rootfs"
    if rootfs.exists():
        shutil.rmtree(rootfs)
    rootfs.mkdir()
    container = subprocess.check_output(["docker", "create", digest], text=True).strip()
    archive = state / "rootfs.tar"
    try:
        with archive.open("wb") as output:
            subprocess.run(["docker", "export", container], stdout=output, check=True)
    finally:
        subprocess.run(["docker", "rm", container], stdout=subprocess.DEVNULL, check=True)
    with tarfile.open(archive) as source:
        for original in source:
            entry = copy.copy(original)
            if entry.issym() and entry.linkname.startswith("/"):
                entry.linkname = os.path.relpath(
                    entry.linkname.lstrip("/"), str(PurePosixPath(entry.name).parent)
                )
            source.extract(entry, rootfs, filter="data")
    profile = RuntimeProfile(rootfs, tools, state, digest, version)
    session = DirectSession(
        profile, str(uuid4()), {"known-input.csv": b"time,value\n0,0\n1,2\n2,4\n"}
    )
    canary = state / ("private-canary-" + uuid4().hex)
    canary.write_text("host-only qualification input\n")
    try:
        python = session.execute(
            "python",
            "import numpy as np; from scipy.stats import linregress\n"
            "import pint, pyarrow, os, pathlib, socket\n"
            "assert linregress([0,1,2],[0,2,4]).slope == 2\n"
            "assert 'OPENAI_API_KEY' not in os.environ\n"
            "assert not pathlib.Path('/var/run/docker.sock').exists()\n"
            f"assert not pathlib.Path({str(canary)!r}).exists()\n"
            "try:\n s=socket.create_connection(('8.8.8.8',53),timeout=.3)\n"
            "except OSError:\n pass\nelse:\n raise AssertionError('Network is available')\n"
            "answer=42\nprint(answer)",
            60,
            lambda: True,
        )
        assert python["exit_code"] == 0 and python["stdout"].strip() == "42", python
        continuity = session.execute("python", "print(answer)", 60, lambda: True)
        assert continuity["stdout"].strip() == "42"
        shell = session.execute("shell", "value=42; printf '%s' \"$value\"", 60, lambda: True)
        assert shell["stdout"].strip() == "42", shell
        continuity = session.execute("shell", "printf '%s' \"$value\"", 60, lambda: True)
        assert continuity["stdout"].strip() == "42", continuity
        plotting = session.execute(
            "python",
            "import polars as pl, duckdb\nfrom matplotlib.figure import Figure\n"
            "assert pl.DataFrame({'x':[1,2]}).select(pl.col('x').sum()).item() == 3\n"
            "connection=duckdb.connect(config={'threads':1})\n"
            "assert connection.execute('SELECT 6*7').fetchone()[0] == 42\n"
            "figure=Figure(); figure.subplots().plot([0,1],[0,2])\n"
            "figure.savefig('/outputs/known.svg')\n"
            "pathlib.Path('/outputs/known.csv').write_text('x,y\\n0,0\\n1,2\\n')\n",
            60,
            lambda: True,
        )
        assert plotting["exit_code"] == 0, plotting
        outputs = dict(session.outputs())
        assert outputs["known.csv"] == b"x,y\n0,0\n1,2\n" and b"<svg" in outputs["known.svg"]
    finally:
        canary.unlink(missing_ok=True)
        if not session.close():
            raise RuntimeError("The qualification guest's teardown could not be confirmed.")
    with archive.open("rb") as retained_archive:
        archive_hash = hashlib.file_digest(retained_archive, "sha256").hexdigest()
    manifest = {
        "schema_version": 1,
        "qualified": True,
        "image_digest": digest,
        "runtime_version": version,
        "runsc_sha256": hashlib.sha256((tools / "runsc").read_bytes()).hexdigest(),
        "rootfs_archive_sha256": archive_hash,
        "uv_lock_sha256": hashlib.sha256((PROJECT / "uv.lock").read_bytes()).hexdigest(),
        "runtime_profile_sha256": hashlib.sha256(canonical_json(oci_spec())).hexdigest(),
        "runner_sha256": hashlib.sha256(
            (PROJECT / "sandboxes/python-analysis/runner.py").read_bytes()
        ).hexdigest(),
        "recipe_sha256": hashlib.sha256(
            (PROJECT / "sandboxes/python-analysis/Dockerfile").read_bytes()
        ).hexdigest(),
        "qualification": [
            "numpy_scipy_known_slope",
            "python_globals",
            "shell_variables",
            "network_denied",
            "host_files_absent",
            "credentials_absent",
            "polars_duckdb_known_answers",
            "matplotlib_vector_and_numerical_artifacts",
            "teardown",
        ],
        "memory_bytes": profile.memory_bytes,
        "cpu_count": profile.cpu_count,
        "process_limit": profile.process_limit,
    }
    (state / "environment.json").write_text(json.dumps(manifest, sort_keys=True, indent=2) + "\n")
    print(
        json.dumps(
            {
                "qualified": True,
                "image_digest": digest,
                "runtime_version": version,
                "languages": ["python", "shell"],
            }
        )
    )


if __name__ == "__main__":
    prepare()

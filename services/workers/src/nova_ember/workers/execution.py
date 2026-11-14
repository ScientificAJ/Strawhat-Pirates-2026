"""Direct gVisor execution on existing CPU capacity; no host-code fallback."""

from __future__ import annotations

import json
import os
import re
import selectors
import subprocess
import tarfile
import tempfile
import time
from collections.abc import Callable
from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path, PurePosixPath
from uuid import UUID, uuid4

from nova_ember.api.jobs import canonical_json

MAX_OUTPUT = 16 * 1024 * 1024
MAX_STREAM = 131072
OUTER_IMAGE = (
    "python:3.13.18-slim@sha256:e48f59cdba69a3cbd9ed2cf0f348d90d45a8d350d98134cf1070bc106ee9ed90"
)


def reports_missing_container(stderr: bytes) -> bool:
    message = stderr.lower()
    return b"no such container" in message or b"no such object" in message


class ExecutionFailure(RuntimeError):
    def __init__(self, message: str, partial: dict | None = None):
        super().__init__(message)
        self.partial = partial


class ExecutionUnavailable(ExecutionFailure):
    pass


class ExecutionStopped(ExecutionFailure):
    pass


@dataclass(frozen=True)
class RuntimeProfile:
    rootfs: Path
    tools: Path
    state: Path
    image_digest: str
    runtime_version: str
    lock_sha256: str = ""
    memory_bytes: int = 1024 * 1024 * 1024
    cpu_count: int = 1
    process_limit: int = 128

    @classmethod
    def from_project(cls) -> RuntimeProfile:
        project = Path(__file__).resolve().parents[5]
        state = Path(
            os.environ.get("NOVA_EXECUTION_DIRECTORY", project / ".data/execution")
        ).resolve()
        manifest_path = state / "environment.json"
        if not manifest_path.is_file():
            raise ExecutionUnavailable(
                "The project scientific image has not been prepared and qualified."
            )
        manifest = json.loads(manifest_path.read_bytes())
        if manifest.get("qualified") is not True:
            raise ExecutionUnavailable("The scientific environment has not passed qualification.")
        for name, field in [("runner.py", "runner_sha256"), ("Dockerfile", "recipe_sha256")]:
            if sha256(
                (project / "sandboxes/python-analysis" / name).read_bytes()
            ).hexdigest() != manifest.get(field):
                raise ExecutionUnavailable(
                    "The scientific guest program or image recipe needs rebuilding."
                )
        if manifest.get("runtime_profile_sha256") != sha256(canonical_json(oci_spec())).hexdigest():
            raise ExecutionUnavailable(
                "The runtime profile needs qualification after its configuration changed."
            )
        if sha256((project / "uv.lock").read_bytes()).hexdigest() != manifest["uv_lock_sha256"]:
            raise ExecutionUnavailable(
                "The scientific image needs rebuilding for the current lockfile."
            )
        tools = project / ".data/tools/gvisor"
        if not (tools / "runsc").is_file():
            raise ExecutionUnavailable("The project gVisor runtime is not installed.")
        if sha256((tools / "runsc").read_bytes()).hexdigest() != manifest["runsc_sha256"]:
            raise ExecutionUnavailable(
                "The configured runtime differs from its recorded environment."
            )
        return cls(
            state / "rootfs",
            tools,
            state,
            manifest["image_digest"],
            manifest["runtime_version"],
            lock_sha256=manifest["uv_lock_sha256"],
        )


def execution_capability() -> dict:
    try:
        profile = RuntimeProfile.from_project()
    except (ExecutionUnavailable, OSError, ValueError, KeyError):
        return {
            "available": False,
            "reason": "The local gVisor scientific environment needs preparation or qualification.",
            "paid_fallback": False,
            "languages": ["python", "shell"],
        }
    return {
        "available": True,
        "runtime": profile.runtime_version,
        "image_digest": profile.image_digest,
        "cpu_count": profile.cpu_count,
        "memory_bytes": profile.memory_bytes,
        "process_limit": profile.process_limit,
        "command_seconds": 60,
        "session_lease_seconds": 300,
        "session_deadline_seconds": 900,
        "network": "disabled",
        "paid_fallback": False,
        "languages": ["python", "shell"],
    }


def oci_spec() -> dict:
    return {
        "ociVersion": "1.2.0",
        "root": {"path": "rootfs", "readonly": True},
        "process": {
            "terminal": False,
            "user": {"uid": 65534, "gid": 65534},
            "args": ["/opt/environment/.venv/bin/python", "-I", "-u", "/opt/runner.py"],
            "env": [
                "PATH=/opt/environment/.venv/bin:/usr/local/bin:/usr/bin:/bin",
                "HOME=/work",
                "PYTHONNOUSERSITE=1",
                "MPLBACKEND=Agg",
                "OPENBLAS_NUM_THREADS=1",
                "OMP_NUM_THREADS=1",
                "POLARS_MAX_THREADS=1",
                "MPLCONFIGDIR=/work/.matplotlib",
                "TZ=UTC",
            ],
            "cwd": "/work",
            "noNewPrivileges": True,
            "capabilities": {
                "bounding": [],
                "effective": [],
                "inheritable": [],
                "permitted": [],
                "ambient": [],
            },
            "rlimits": [
                {"type": "RLIMIT_NOFILE", "hard": 128, "soft": 128},
                {"type": "RLIMIT_NPROC", "hard": 64, "soft": 64},
                {"type": "RLIMIT_FSIZE", "hard": MAX_OUTPUT, "soft": MAX_OUTPUT},
            ],
        },
        "hostname": "nova-analysis",
        "mounts": [
            {"destination": "/proc", "type": "proc", "source": "proc"},
            {
                "destination": "/work",
                "type": "tmpfs",
                "source": "tmpfs",
                "options": ["nosuid", "nodev", "mode=1777", "size=67108864"],
            },
            {
                "destination": "/tmp",
                "type": "tmpfs",
                "source": "tmpfs",
                "options": ["nosuid", "nodev", "mode=1777", "size=67108864"],
            },
            {
                "destination": "/inputs",
                "type": "bind",
                "source": "/inputs",
                "options": ["rbind", "ro", "nosuid", "nodev", "noexec"],
            },
            {
                "destination": "/outputs",
                "type": "tmpfs",
                "source": "tmpfs",
                "options": ["nosuid", "nodev", "noexec", "mode=1777", "size=16777216"],
            },
        ],
        "linux": {
            "namespaces": [{"type": kind} for kind in ["pid", "network", "ipc", "uts", "mount"]]
        },
    }


class DirectSession:
    """One persistent guest with separate Python globals and a persistent shell."""

    def __init__(self, profile: RuntimeProfile, session_id: str, inputs: dict[str, bytes]):
        self.profile = profile
        self.session_id = str(UUID(session_id))
        self.container_name = "nova-analysis-" + self.session_id
        self.started_at = time.monotonic()
        self.temporary = tempfile.TemporaryDirectory(prefix="session-", dir=profile.state)
        bundle = Path(self.temporary.name)
        self.bundle = bundle
        folder = bundle / "inputs"
        folder.mkdir()
        if sum(len(data) for data in inputs.values()) > 8 * 1024 * 1024:
            self.temporary.cleanup()
            raise ValueError("Frozen execution inputs exceed eight MiB.")
        for name, data in inputs.items():
            if PurePosixPath(name).name != name or name in {"", ".", ".."}:
                self.temporary.cleanup()
                raise ValueError("Input names must be generated plain basenames.")
            (folder / name).write_bytes(data)
        (bundle / "config.json").write_bytes(canonical_json(oci_spec()))
        command = [
            "docker",
            "run",
            "--rm",
            "--interactive",
            "--name",
            self.container_name,
            "--label",
            "nova-ember.analysis=true",
            "--network=none",
            "--read-only",
            f"--memory={profile.memory_bytes}",
            f"--memory-swap={profile.memory_bytes}",
            f"--cpus={profile.cpu_count}",
            f"--pids-limit={profile.process_limit}",
            "--cap-add=SYS_ADMIN",
            "--security-opt=seccomp=unconfined",
            "--security-opt=apparmor=unconfined",
            "--mount",
            f"type=bind,src={profile.tools},dst=/runtime,readonly",
            "--mount",
            f"type=bind,src={profile.rootfs},dst=/bundle/rootfs,readonly",
            "--mount",
            f"type=bind,src={bundle / 'config.json'},dst=/bundle/config.json,readonly",
            "--mount",
            f"type=bind,src={folder},dst=/inputs,readonly",
            "--tmpfs",
            "/state:rw,nosuid,nodev,size=64m",
            "--entrypoint",
            "/runtime/runsc",
            OUTER_IMAGE,
            "--root=/state",
            "--network=none",
            "--platform=systrap",
            "--host-settings=ignore",
            "--ignore-cgroups",
            "run",
            "--bundle=/bundle",
            "analysis",
        ]
        self.command = command
        # Only the fixed runtime command executes on the host; code goes to guest stdin.
        self.process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        assert self.process.stdout is not None and self.process.stderr is not None
        self.selector = selectors.DefaultSelector()
        self.selector.register(self.process.stdout, selectors.EVENT_READ, "stdout")
        self.selector.register(self.process.stderr, selectors.EVENT_READ, "stderr")
        self.pending = bytearray()
        self.runtime_errors = bytearray()
        self.closed = False
        self.output_metadata: dict[str, dict] = {}

    def execute(
        self,
        language: str,
        code: str,
        seconds: int,
        active: Callable[[], bool],
        on_output: Callable[[str, str], None] | None = None,
    ) -> dict:
        if self.closed or self.process.poll() is not None:
            raise ExecutionStopped("The guest session ended; start a new session.")
        command_id = uuid4().hex
        request = (
            canonical_json({"command_id": command_id, "language": language, "code": code}) + b"\n"
        )
        assert self.process.stdin is not None
        os.set_blocking(self.process.stdin.fileno(), False)
        remaining_request = memoryview(request)
        self.selector.register(self.process.stdin, selectors.EVENT_WRITE, "stdin")
        started, last_check = time.monotonic(), 0.0
        captured: dict[str, list[str]] = {"stdout": [], "stderr": []}
        captured_lengths = {"stdout": 0, "stderr": 0}
        try:
            while True:
                now = time.monotonic()
                if now - started > seconds or now - self.started_at > 900:
                    raise ExecutionStopped(
                        "The command or cumulative session time limit was reached."
                    )
                if now - last_check > 0.5:
                    if not active():
                        raise ExecutionStopped(
                            "The command was canceled or its session lease expired."
                        )
                    last_check = now
                if b"\n" in self.pending:
                    line, _, remainder = self.pending.partition(b"\n")
                    self.pending = bytearray(remainder)
                    result = json.loads(line)
                    if not isinstance(result, dict):
                        raise ExecutionStopped("The guest returned an invalid control frame.")
                    if result.get("command_id") != command_id:
                        raise ExecutionStopped("The guest protocol returned an unexpected command.")
                    if result.get("event") == "output":
                        stream, output = result.get("stream"), result.get("text")
                        if (
                            not isinstance(stream, str)
                            or stream not in captured
                            or not isinstance(output, str)
                        ):
                            raise ExecutionStopped("The guest returned an invalid output frame.")
                        retained = output[: max(0, 65536 - captured_lengths[stream])]
                        captured[stream].append(retained)
                        captured_lengths[stream] += len(retained)
                        if retained and on_output is not None:
                            on_output(stream, retained)
                        continue
                    if not isinstance(result.get("exit_code"), int):
                        raise ExecutionStopped("The guest omitted its command exit state.")
                    result.update(
                        {
                            "stdout": "".join(captured["stdout"]),
                            "stderr": "".join(captured["stderr"]),
                            "elapsed_seconds": now - started,
                            "code_sha256": sha256(code.encode()).hexdigest(),
                            "runtime_version": self.profile.runtime_version,
                            "image_digest": self.profile.image_digest,
                            "scientific_origin": "exploratory_execution",
                            "network": "disabled",
                            "session_id": self.session_id,
                        }
                    )
                    return result
                for key, _ in self.selector.select(timeout=0.1):
                    if key.data == "stdin":
                        try:
                            sent = os.write(key.fd, remaining_request)
                        except BlockingIOError:
                            continue
                        remaining_request = remaining_request[sent:]
                        if not remaining_request:
                            self.selector.unregister(key.fileobj)
                        continue
                    chunk = os.read(key.fd, 8192)
                    if not chunk:
                        self.selector.unregister(key.fileobj)
                        continue
                    destination = self.pending if key.data == "stdout" else self.runtime_errors
                    destination.extend(chunk)
                    if len(destination) > MAX_STREAM:
                        raise ExecutionStopped("Guest output exceeded the bounded protocol limit.")
                if not self.selector.get_map() or self.process.poll() is not None:
                    raise ExecutionUnavailable(
                        "The isolated runtime stopped before completing the command."
                    )
        except (ValueError, OSError, ExecutionStopped, ExecutionUnavailable) as error:
            partial = {
                "stdout": "".join(captured["stdout"]),
                "stderr": "".join(captured["stderr"]),
                "elapsed_seconds": time.monotonic() - started,
                "incomplete": True,
                "code_sha256": sha256(code.encode()).hexdigest(),
                "session_id": self.session_id,
                "runtime_version": self.profile.runtime_version,
                "image_digest": self.profile.image_digest,
            }
            self.close()
            if isinstance(error, ExecutionFailure):
                error.partial = partial
                raise
            raise ExecutionStopped("The isolated command protocol failed.", partial) from error

    def outputs(self) -> list[tuple[str, bytes]]:
        self.output_metadata = {}
        command = [
            "docker",
            "exec",
            self.container_name,
            "/runtime/runsc",
            "--root=/state",
            "--network=none",
            "--platform=systrap",
            "--ignore-cgroups",
            "exec",
            "analysis",
            "/usr/bin/tar",
            "--directory=/outputs",
            "--create",
            "--file=-",
            ".",
        ]
        result = subprocess.run(command, capture_output=True, timeout=5, check=False)
        if result.returncode:
            raise ExecutionStopped("The guest output collection failed.")
        if len(result.stdout) > MAX_OUTPUT + 1024 * 1024:
            raise ValueError("Output archive exceeded its broker limit.")
        import io

        results: list[tuple[str, bytes]] = []
        with tarfile.open(fileobj=io.BytesIO(result.stdout)) as archive:
            for entry in archive:
                if entry.isdir():
                    continue
                name = PurePosixPath(entry.name)
                if (
                    entry.issym()
                    or entry.islnk()
                    or not entry.isfile()
                    or ".." in name.parts
                    or name.is_absolute()
                ):
                    raise ValueError(
                        "Guest outputs must be regular files without links or traversal."
                    )
                if len(results) >= 32 or entry.size > 2 * 1024 * 1024:
                    raise ValueError("Guest output count or per-file limit exceeded.")
                stream = archive.extractfile(entry)
                assert stream is not None
                content = stream.read()
                if name.suffix.lower() not in {
                    ".csv",
                    ".json",
                    ".txt",
                    ".py",
                    ".sh",
                    ".ipynb",
                    ".png",
                    ".svg",
                }:
                    raise ValueError("Guest output type is not supported by the scientific broker.")
                if name.suffix == ".svg":
                    validate_svg(content)
                if name.suffix == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("Guest PNG output has an invalid signature.")
                if name.suffix == ".png":
                    from PIL import Image

                    with Image.open(io.BytesIO(content)) as image:
                        if image.width * image.height > 16_000_000:
                            raise ValueError("Guest figure exceeds the pixel limit.")
                        image.verify()
                published_name = (
                    re.sub(r"[^a-zA-Z0-9_.-]", "_", name.stem)[:70] + name.suffix.lower()
                )
                if published_name in self.output_metadata:
                    published_name = (
                        sha256(str(name).encode()).hexdigest()[:8] + "-" + published_name
                    )
                self.output_metadata[published_name] = {
                    "original_relative_path": str(name),
                    "sha256": sha256(content).hexdigest(),
                }
                results.append((published_name, content))
        return results

    def close(self) -> bool:
        if self.closed:
            return True
        removed = subprocess.run(
            ["docker", "rm", "--force", self.container_name],
            capture_output=True,
            timeout=10,
            check=False,
        )
        if removed.returncode and not reports_missing_container(removed.stderr):
            return False
        if self.process.poll() is None:
            self.process.kill()
        self.process.communicate(timeout=10)
        self.selector.close()
        self.temporary.cleanup()
        self.closed = True
        return True


def validate_svg(content: bytes) -> None:
    from xml.etree import ElementTree

    if b"<!ENTITY" in content.upper():
        raise ValueError("SVG declarations are not accepted.")
    if b"<!DOCTYPE" in content.upper():
        standard = rb'<!DOCTYPE\s+svg\s+PUBLIC\s+[\'"]-//W3C//DTD SVG 1.1//EN[\'"]\s+'
        standard += rb'[\'"]http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd[\'"]\s*>'
        content, count = re.subn(standard, b"", content)
        if count != 1 or b"<!DOCTYPE" in content.upper():
            raise ValueError("Only the standard passive SVG declaration is supported.")
    try:
        root = ElementTree.fromstring(content)
    except ElementTree.ParseError as error:
        raise ValueError("SVG output is malformed.") from error
    if root.tag.split("}")[-1] != "svg":
        raise ValueError("SVG output requires its declared root element.")
    allowed = {
        "svg",
        "g",
        "path",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "rect",
        "text",
        "tspan",
        "defs",
        "clipPath",
        "use",
        "style",
        "title",
        "desc",
        "metadata",
    }
    metadata_namespaces = (
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        "http://purl.org/dc/elements/1.1/",
        "http://creativecommons.org/ns#",
    )
    for node in root.iter():
        metadata = any(
            node.tag.startswith("{" + namespace + "}") for namespace in metadata_namespaces
        )
        if node.tag.split("}")[-1] not in allowed and not metadata:
            raise ValueError("SVG output contains an unsupported element.")
        if node.tag.split("}")[-1] == "style" and node.text:
            if "\\" in node.text or any(
                word in node.text.lower()
                for word in ["@import", "url(", "expression(", "javascript:"]
            ):
                raise ValueError("SVG styles cannot load active or external content.")
        for attribute, value in node.attrib.items():
            name = attribute.split("}")[-1].lower()
            urls = re.findall(r"url\(\s*['\"]?([^)'\"]+)", value, flags=re.IGNORECASE)
            if (
                "\\" in value
                or name.startswith("on")
                or (name == "href" and not value.startswith("#"))
                or any(not target.startswith("#") for target in urls)
                or any(word in value.lower() for word in ["javascript:", "expression(", "@import"])
            ):
                raise ValueError("SVG output cannot reference active or external content.")


SESSIONS: dict[str, DirectSession] = {}


def close_all() -> None:
    for session in list(SESSIONS.values()):
        session.close()
    SESSIONS.clear()

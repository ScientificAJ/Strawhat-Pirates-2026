"""Run the locked Python environment using installed or project-local uv."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATHS = [
    "services/api/src",
    "services/workers/src",
    "packages/domain/src",
    "packages/analysis/src",
    "packages/data-adapters/src",
]


def tool_environment() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(str(ROOT / path) for path in SOURCE_PATHS)
    env.setdefault("UV_CACHE_DIR", str(ROOT / ".data/cache/uv"))
    env.setdefault("UV_PYTHON_INSTALL_DIR", str(ROOT / ".data/python"))
    env.setdefault("UV_PYTHON_BIN_DIR", str(ROOT / ".data/bin"))
    env.setdefault("UV_LINK_MODE", "copy")
    env.setdefault("NEXT_TELEMETRY_DISABLED", "1")
    return env


def uv_executable() -> str:
    installed = shutil.which("uv")
    local = ROOT / ".data/tools/bin/uv"
    if installed:
        return installed
    if local.is_file():
        return str(local)
    raise SystemExit("uv is unavailable. Run pnpm run setup to install local tools.")


if __name__ == "__main__":
    raise SystemExit(
        subprocess.call(
            [uv_executable(), "run", "--frozen", "python", *sys.argv[1:]],
            cwd=ROOT,
            env=tool_environment(),
        )
    )

"""Install locked local dependencies without changing the system Python."""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from python import ROOT, tool_environment, uv_executable


def main() -> None:
    if not shutil.which("uv") and not (ROOT / ".data/tools/bin/uv").is_file():
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--no-cache-dir",
                "--target",
                str(ROOT / ".data/tools"),
                "uv==0.13.8",
            ],
            cwd=ROOT,
            check=True,
        )
    env = tool_environment()
    subprocess.run([uv_executable(), "sync", "--frozen"], cwd=ROOT, env=env, check=True)
    subprocess.run(
        [
            "pnpm",
            "install",
            "--frozen-lockfile",
            "--store-dir",
            str(Path(tempfile.gettempdir()) / "nova-ember-pnpm-store"),
        ],
        cwd=ROOT,
        env=env,
        check=True,
    )


if __name__ == "__main__":
    main()

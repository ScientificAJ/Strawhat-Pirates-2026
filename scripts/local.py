"""Start and supervise the project's local web, API and trusted worker processes."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time

from python import ROOT, tool_environment


def environment() -> dict[str, str]:
    env = tool_environment()
    env.setdefault("NOVA_DATABASE_URL", "postgresql://nova:nova-local@127.0.0.1:55432/nova_ember")
    env.setdefault("NEXT_TELEMETRY_DISABLED", "1")
    env.setdefault("NOVA_OBJECT_DIRECTORY", str(ROOT / ".data/objects"))
    return env


def main() -> int:
    env = environment()
    compose = ["docker", "compose", "-f", str(ROOT / "infra/compose.yaml")]
    subprocess.run(
        [*compose, "up", "--detach", "--wait", "--wait-timeout", "60"],
        cwd=ROOT,
        env=env,
        check=True,
    )
    subprocess.run([sys.executable, "-m", "nova_ember.api.seed"], cwd=ROOT, env=env, check=True)
    commands = [
        [
            sys.executable,
            "-m",
            "uvicorn",
            "nova_ember.api.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8100",
        ],
        [sys.executable, "-m", "nova_ember.workers"],
        ["pnpm", "--dir", "apps/web", "dev"],
    ]
    children: list[subprocess.Popen[bytes]] = []

    def stop(_signal: int, _frame: object) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, stop)
    try:
        for command in commands:
            children.append(subprocess.Popen(command, cwd=ROOT, env=env, start_new_session=True))
        print("Nova Ember: http://127.0.0.1:3100", flush=True)
        while True:
            for child in children:
                code = child.poll()
                if code is not None:
                    print(
                        f"Local service exited with status {code}; stopping the stack.",
                        file=sys.stderr,
                    )
                    return code or 1
            time.sleep(0.3)
    except KeyboardInterrupt:
        return 0
    finally:
        for child in children:
            if child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        for child in children:
            try:
                child.wait(timeout=8)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()


if __name__ == "__main__":
    raise SystemExit(main())

"""Exercise the deployment decision logic without changing a running stack."""

import json
import os
import pathlib
import shutil
import subprocess
import tempfile


def main():
    production = pathlib.Path(__file__).resolve().parent
    script = (production / "auto-deploy.sh").read_text()
    with tempfile.TemporaryDirectory() as tmp:
        base = pathlib.Path(tmp)
        origin = base / "origin.git"
        root = base / "checkout"
        subprocess.run(["git", "init", "--bare", "-q", str(origin)], check=True)
        subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)

        def git(*args):
            return subprocess.run(
                ["git", *args], cwd=root, text=True, capture_output=True, check=True
            ).stdout.strip()

        git("config", "user.name", "Tester")
        git("config", "user.email", "test@example.com")
        git("remote", "add", "origin", str(origin))

        def commit(path, value):
            file = root / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(value)
            git("add", path)
            git("commit", "-qm", f"Update {path}")
            git("push", "-q", "origin", "main")
            return git("rev-parse", "HEAD")

        commit("infra/production/compose.yaml", (production / "compose.yaml").read_text())
        original = commit("infra/production/Caddyfile", (production / "Caddyfile").read_text())
        (root / ".env.production").write_text(
            "NOVA_DOMAIN=example.test\nNOVA_POSTGRES_PASSWORD=placeholder\n"
        )
        state = root / ".data/auto-deploy"
        state.mkdir(parents=True)
        (state / "deployed-revision").write_text(original + "\n")
        binary = base / "bin"
        binary.mkdir()
        log = base / "docker.log"
        docker = binary / "docker"
        docker.write_text(
            """#!/usr/bin/env bash
echo "$*" >> "$TEST_LOG"
if [[ -f "$TEST_BUILD_FAIL" && " $* " == *" build "* ]]; then exit 1; fi
if [[ -f "$TEST_UP_FAIL" && " $* " == *" up "* && " $* " == *" --no-build "* ]]; then
  exit 1
fi
exit 0
"""
        )
        docker.chmod(0o755)
        executable = base / "deploy.sh"
        executable.write_text(
            script.replace("root=/opt/nova-ember", f"root={root}").replace(
                "repository=https://github.com/ScientificAJ/Strawhat-Pirates-2026.git",
                f"repository={origin}",
            )
        )
        env = os.environ | {
            "PATH": str(binary) + ":" + os.environ["PATH"],
            "TEST_LOG": str(log),
            "TEST_BUILD_FAIL": str(base / "build_fail"),
            "TEST_UP_FAIL": str(base / "up_fail"),
        }

        def run(expected=0):
            result = subprocess.run(
                ["bash", str(executable)], env=env, text=True, capture_output=True
            )
            assert result.returncode == expected, (result.returncode, result.stdout, result.stderr)
            return result.stdout + result.stderr

        commit("docs/changes.md", "docs only")
        assert "documentation-only" in run() and not log.exists()
        code = commit("services/main.py", "change one")
        assert (
            "Deployed revision" in run()
            and state.joinpath("deployed-revision").read_text().strip() == code
        )
        lines = log.read_text()
        assert " build" in lines and " up " in lines and " exec " in lines
        assert "--project-directory" not in lines
        before = log.read_text()
        assert "Already checked" in run() and log.read_text() == before
        commit("services/main.py", "change two")
        (base / "build_fail").touch()
        assert "Build failed" in run(1)
        assert state.joinpath("deployed-revision").read_text().strip() == code
        assert "previously failed" in run(1)
        (base / "build_fail").unlink()
        commit("services/main.py", "change three")
        (base / "up_fail").touch()
        assert "attempting to restore" in run(1)
        assert state.joinpath("deployed-revision").read_text().strip() == code
        assert " --build " in log.read_text()
        commit("services/api/src/nova_ember/api/migrations/099_test.sql", "select 1;")
        assert "automatic code rollback is unsafe" in run(1)
        assert state.joinpath("deployed-revision").read_text().strip() == code
        # Use the real Compose parser to check relative paths and persistent volume names.
        real_docker = shutil.which("docker")
        if real_docker:
            release = state / "releases" / code
            result = subprocess.run(
                [
                    real_docker,
                    "compose",
                    "--project-name",
                    "nova-ember",
                    "--env-file",
                    str(root / ".env.production"),
                    "-f",
                    str(release / "infra/production/compose.yaml"),
                    "config",
                    "--format",
                    "json",
                ],
                text=True,
                capture_output=True,
                check=True,
            )
            configuration = json.loads(result.stdout)
            assert configuration["services"]["api"]["build"]["context"] == str(release)
            assert configuration["services"]["web"]["build"]["context"] == str(release)
            mounts = configuration["services"]["proxy"]["volumes"]
            caddy = next(mount for mount in mounts if mount["type"] == "bind")
            assert caddy["source"] == str(release / "infra/production/Caddyfile")
            assert {item["name"] for item in configuration["volumes"].values()} == {
                "nova-ember_application-data",
                "nova-ember_postgres-data",
                "nova-ember_caddy-data",
                "nova-ember_caddy-config",
            }
            print("PASS: Compose paths and named volumes")
        else:
            print("SKIP: Compose paths (Docker CLI unavailable)")
        print(
            "PASS: docs-only, deployment, idempotence, build failure, "
            "failed revision guard, rollback, migration safety"
        )


if __name__ == "__main__":
    main()

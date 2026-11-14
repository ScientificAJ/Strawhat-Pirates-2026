"""Explicit local configuration; no model or hosting credentials are consumed."""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    database_url: str
    fixture_directory: Path
    object_directory: Path
    web_origin: str = "http://127.0.0.1:3100"

    @classmethod
    def from_environment(cls) -> "Settings":
        root = Path(__file__).resolve().parents[5]
        return cls(
            database_url=os.environ.get(
                "NOVA_DATABASE_URL",
                "postgresql://nova:nova-local@127.0.0.1:55432/nova_ember",
            ),
            fixture_directory=Path(
                os.environ.get("NOVA_FIXTURE_DIRECTORY", root / "tests/fixtures/nasa-psi")
            ).resolve(),
            object_directory=Path(
                os.environ.get("NOVA_OBJECT_DIRECTORY", root / ".data/objects")
            ).resolve(),
            web_origin=os.environ.get("NOVA_WEB_ORIGIN", "http://127.0.0.1:3100"),
        )

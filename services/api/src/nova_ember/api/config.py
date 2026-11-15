"""Explicit backend configuration; provider credentials never enter browser settings."""

import os
from dataclasses import dataclass, field
from math import isfinite
from pathlib import Path


def backend_key(root: Path) -> str | None:
    """Read the confirmed backend-only secret without exporting it to child processes."""
    if value := os.environ.get("OPENAI_API_KEY"):
        return value
    target = root / ".env.local"
    if not target.is_file() or target.is_symlink():
        return None
    for line in target.read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "OPENAI_API_KEY":
            return value.strip().strip("\"'") or None
    return None


@dataclass(frozen=True)
class Settings:
    database_url: str = field(repr=False)
    fixture_directory: Path
    object_directory: Path
    web_origin: str = "http://127.0.0.1:3100"
    supporting_directory: Path | None = None
    media_directory: Path | None = None
    methods_directory: Path | None = None
    openai_api_key: str | None = field(default=None, repr=False)
    research_daily_budget_usd: float = 5.0
    research_request_budget_usd: float = 0.10
    nasa_research_directory: Path | None = None

    def __post_init__(self) -> None:
        if any(
            not isfinite(value) or value < 0
            for value in (
                self.research_daily_budget_usd,
                self.research_request_budget_usd,
            )
        ):
            raise ValueError("Model budgets must be finite, nonnegative dollar amounts.")

    @classmethod
    def from_environment(cls) -> "Settings":
        root = Path(__file__).resolve().parents[5]
        supporting = Path(
            os.environ.get("NOVA_SUPPORTING_DIRECTORY", root / "tests/fixtures/nasa-psi-supporting")
        ).resolve()
        media = Path(
            os.environ.get("NOVA_MEDIA_DIRECTORY", root / "tests/fixtures/nasa-psi-media")
        ).resolve()
        methods = Path(
            os.environ.get("NOVA_METHODS_DIRECTORY", root / "tests/fixtures/nasa-psi-methods")
        ).resolve()
        nasa_research = Path(
            os.environ.get("NOVA_NASA_RESEARCH_DIRECTORY", root / "data/nasa-research")
        ).resolve()
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
            supporting_directory=supporting if (supporting / "snapshot.json").is_file() else None,
            media_directory=media if (media / "snapshot.json").is_file() else None,
            methods_directory=methods if (methods / "snapshot.json").is_file() else None,
            nasa_research_directory=nasa_research
            if (nasa_research / "collection.json").is_file()
            else None,
            openai_api_key=backend_key(root),
            research_daily_budget_usd=float(os.environ.get("NOVA_DAILY_MODEL_BUDGET_USD", "5")),
            research_request_budget_usd=float(
                os.environ.get("NOVA_REQUEST_MODEL_BUDGET_USD", "0.10")
            ),
        )

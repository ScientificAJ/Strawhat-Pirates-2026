"""Small shared spend reservations for anonymous, bounded provider requests."""

from decimal import ROUND_UP, Decimal
from uuid import uuid4

from .config import Settings
from .database import connect


class ProviderBudgetExceeded(RuntimeError):
    pass


def reserve_usage(settings: Settings, amount: Decimal, job_id: str | None = None) -> str:
    amount = amount.quantize(Decimal("0.000001"), rounding=ROUND_UP)
    if amount <= 0 or amount > Decimal(str(settings.research_request_budget_usd)):
        raise ProviderBudgetExceeded("The request exceeds the configured model budget.")
    identifier = str(uuid4())
    with connect(settings.database_url) as connection:
        connection.execute("SELECT pg_advisory_xact_lock(701420)")
        row = connection.execute(
            """SELECT COALESCE(sum(CASE WHEN status = 'settled' THEN settled_usd
                 ELSE amount_usd END), 0) AS amount FROM model_usage_reservations
                 WHERE created_at >=
                 date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"""
        ).fetchone()
        assert row is not None
        if row["amount"] + amount > Decimal(str(settings.research_daily_budget_usd)):
            raise ProviderBudgetExceeded("The configured daily model budget is exhausted.")
        connection.execute(
            "INSERT INTO model_usage_reservations (id, job_id, amount_usd) VALUES (%s, %s, %s)",
            (identifier, job_id, amount),
        )
    return identifier


def settle_usage(settings: Settings, identifier: str, amount: Decimal | None) -> None:
    with connect(settings.database_url) as connection:
        connection.execute(
            """UPDATE model_usage_reservations SET status = %s, settled_usd = %s
               WHERE id = %s AND status = 'reserved'""",
            ("uncertain" if amount is None else "settled", amount, identifier),
        )


def usage_summary(settings: Settings) -> dict:
    with connect(settings.database_url) as connection:
        row = connection.execute(
            """SELECT COALESCE(sum(CASE WHEN status = 'settled' THEN settled_usd
                 ELSE amount_usd END), 0) AS amount,
                 count(*) FILTER (WHERE status = 'uncertain') AS uncertain
                 FROM model_usage_reservations
                 WHERE created_at >=
                 date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'"""
        ).fetchone()
    assert row is not None
    return {
        "date_basis": "UTC",
        "committed_or_reserved_usd": str(row["amount"]),
        "uncertain_requests": row["uncertain"],
        "daily_limit_usd": settings.research_daily_budget_usd,
        "request_limit_usd": settings.research_request_budget_usd,
    }

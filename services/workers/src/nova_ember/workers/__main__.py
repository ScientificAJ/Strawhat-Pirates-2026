"""Consume fixed public-science export jobs from PostgreSQL."""

import logging
import signal
from threading import Event

from nova_ember.api.config import Settings
from nova_ember.api.jobs import claim_job, finish_job
from nova_ember.api.repository import Corpus
from nova_ember.api.science import flex_endpoints


def run_once(settings: Settings) -> bool:
    job = claim_job(settings.database_url)
    if not job:
        return False
    try:
        if job["kind"] != "export_flex":
            raise ValueError("Unsupported trusted job kind")
        result = flex_endpoints(Corpus(settings), job["snapshot_id"])
    except (ValueError, LookupError, OSError):
        finish_job(settings.database_url, job["id"], job["attempt"], None)
        logging.error("A source-bound export failed; job result remains unavailable.")
    else:
        finish_job(settings.database_url, job["id"], job["attempt"], result)
    return True


def main() -> None:
    settings = Settings.from_environment()
    stopping = Event()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda _signum, _frame: stopping.set())
    while not stopping.is_set():
        if not run_once(settings):
            stopping.wait(1)


if __name__ == "__main__":
    main()

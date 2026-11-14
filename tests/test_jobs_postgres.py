"""Lease recovery, replay and denied access on an actual local PostgreSQL database."""

import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from nova_ember.api import jobs
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.repository import Corpus
from nova_ember.api.seed import seed
from nova_ember.workers.__main__ import run_once

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def job_settings(tmp_path_factory):
    database_url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required for real PostgreSQL tests.")
    settings = Settings.from_environment()
    if database_url == settings.database_url:
        raise RuntimeError("Integration tests require a separate database.")
    settings = replace(
        settings,
        database_url=database_url,
        object_directory=tmp_path_factory.mktemp("job-objects"),
    )
    seed(settings)
    return settings


@pytest.fixture
def private_job(job_settings):
    snapshot_id = Corpus(job_settings).snapshot()["snapshot_id"]
    job = jobs.create_job(job_settings.database_url, snapshot_id)
    yield job
    with connect(job_settings.database_url) as connection:
        connection.execute("DELETE FROM jobs WHERE id = %s", (job["id"],))


def test_receipt_is_required_and_other_browser_is_denied(job_settings, private_job):
    client = TestClient(create_app(job_settings))
    url = f"/v1/jobs/{private_job['id']}"
    assert client.get(url).status_code == 404
    assert client.get(url, headers={"X-Job-Receipt": "wrong-browser-receipt"}).status_code == 404
    response = client.get(url, headers={"X-Job-Receipt": private_job["receipt"]})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "receipt" not in response.json()
    assert "receipt_sha256" not in response.json()


def test_fixed_worker_completes_source_bound_export_and_replays_events(job_settings, private_job):
    assert run_once(job_settings)
    result = jobs.read_job(job_settings.database_url, private_job["id"], private_job["receipt"])
    assert result["status"] == "succeeded"
    assert result["result"]["total_rows"] == 274
    events = jobs.read_events(
        job_settings.database_url, private_job["id"], private_job["receipt"], 1
    )
    assert [event["event_type"] for event in events] == ["running", "succeeded"]
    assert [event["sequence"] for event in events] == [2, 3]
    client = TestClient(create_app(job_settings))
    replay = client.get(
        f"/v1/jobs/{private_job['id']}/events",
        headers={"X-Job-Receipt": private_job["receipt"], "Last-Event-ID": "2"},
    )
    assert "event: succeeded" in replay.text
    assert "event: running" not in replay.text


def test_canceled_job_rejects_late_publication(job_settings, private_job):
    claimed = jobs.claim_job(job_settings.database_url)
    assert claimed["id"] == private_job["id"]
    jobs.cancel_job(job_settings.database_url, private_job["id"], private_job["receipt"])
    assert not jobs.finish_job(
        job_settings.database_url, private_job["id"], claimed["attempt"], {"late": True}
    )
    assert (
        jobs.read_job(job_settings.database_url, private_job["id"], private_job["receipt"])[
            "status"
        ]
        == "canceled"
    )


def test_expired_lease_reclaims_and_fences_abandoned_attempt(job_settings, private_job):
    first = jobs.claim_job(job_settings.database_url)
    with connect(job_settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET lease_until = now() - interval '1 second' WHERE id = %s",
            (private_job["id"],),
        )
    second = jobs.claim_job(job_settings.database_url)
    assert second["id"] == first["id"]
    assert second["attempt"] == first["attempt"] + 1
    assert not jobs.finish_job(
        job_settings.database_url, first["id"], first["attempt"], {"abandoned": True}
    )
    assert jobs.finish_job(
        job_settings.database_url, second["id"], second["attempt"], {"complete": True}
    )
    assert not jobs.finish_job(
        job_settings.database_url, second["id"], second["attempt"], {"duplicate": True}
    )


def test_expired_or_deleted_receipt_has_no_access(job_settings, private_job):
    with connect(job_settings.database_url) as connection:
        connection.execute(
            "UPDATE jobs SET expires_at = now() - interval '1 second' WHERE id = %s",
            (private_job["id"],),
        )
    with pytest.raises(jobs.JobNotFound):
        jobs.read_job(job_settings.database_url, private_job["id"], private_job["receipt"])
    with pytest.raises(jobs.JobNotFound):
        jobs.read_events(job_settings.database_url, private_job["id"], private_job["receipt"], 0)


def test_delete_revokes_access_and_prevents_worker_publish(job_settings, private_job):
    claimed = jobs.claim_job(job_settings.database_url)
    jobs.delete_job(job_settings.database_url, private_job["id"], private_job["receipt"])
    with pytest.raises(jobs.JobNotFound):
        jobs.read_job(job_settings.database_url, private_job["id"], private_job["receipt"])
    assert not jobs.finish_job(
        job_settings.database_url, claimed["id"], claimed["attempt"], {"late": True}
    )

"""Daily source observation checkpoints, cancellation and last-good retention."""

import fcntl
import json
from datetime import UTC, datetime, timedelta
from threading import Event

import httpx
import pytest
from nova_ember.adapters.psi import PsiClient
from nova_ember.adapters.refresh import latest_observation, refresh_sources
from nova_ember.evidence.changes import manifest_changes, snapshot_changes

TODAY = datetime(2026, 11, 14, 12, tzinfo=UTC)


class Responses:
    def __init__(self):
        self.calls = []
        self.failures = set()
        self.event = None

    def __call__(self, request):
        path = request.url.path
        if path.endswith("/search"):
            identity = "catalog"
            response = {
                "hits": {
                    "total": 2,
                    "hits": [
                        {
                            "_source": {
                                "Accession": f"PSI-{number}",
                                "Research Area": "Combustion Science",
                            }
                        }
                        for number in (1, 2)
                    ],
                }
            }
        elif path.endswith("/files/v2"):
            accession = json.loads(request.content)["studyId"]
            identity = accession + ":manifest"
            response = {
                "files": [{"key": accession + "/data.csv", "directory": False, "version": 1}]
            }
        else:
            accession = path.rsplit("/", 1)[-1]
            identity = accession + ":metadata"
            response = {
                "accession": accession,
                "public": True,
                "version": 1,
                "title": accession,
                "licenseIdentifier": "CC0-1.0",
            }
        self.calls.append(identity)
        if self.event is not None and identity == "PSI-1:metadata":
            self.event.set()
        return (
            httpx.Response(503) if identity in self.failures else httpx.Response(200, json=response)
        )


def test_refresh_once_utc_day_and_new_day_is_a_fresh_capture(tmp_path):
    responses = Responses()
    with httpx.Client(transport=httpx.MockTransport(responses)) as transport:
        client = PsiClient(transport)
        first = refresh_sources(tmp_path, client, now=TODAY)
        assert first["status"] == "complete" and len(responses.calls) == 5
        assert first["scientific_snapshot_promoted"] is False
        assert first["scientific_asset_bytes_acquired"] == 0
        again = refresh_sources(tmp_path, client, now=TODAY + timedelta(hours=1))
        assert again["status"] == "already_refreshed" and len(responses.calls) == 5
        next_day = refresh_sources(tmp_path, client, now=TODAY + timedelta(days=1))
        assert next_day["status"] == "complete" and len(responses.calls) == 10
        assert latest_observation(tmp_path)["observation_id"] == next_day["observation_id"]
        assert next_day["observation_id"] != first["observation_id"]


def test_partial_refresh_resumes_only_failed_source_and_keeps_last_good(tmp_path):
    responses = Responses()
    responses.failures.add("PSI-2:metadata")
    with httpx.Client(transport=httpx.MockTransport(responses)) as transport:
        client = PsiClient(transport)
        partial = refresh_sources(tmp_path, client, now=TODAY)
        assert partial["status"] == "partial"
        assert latest_observation(tmp_path) is None
        responses.failures.clear()
        before = len(responses.calls)
        complete = refresh_sources(tmp_path, client, now=TODAY)
        assert complete["status"] == "complete"
        assert responses.calls[before:] == ["PSI-2:metadata", "PSI-2:manifest"]
        responses.failures.add("catalog")
        failed = refresh_sources(tmp_path, client, now=TODAY, force=True)
        assert failed["status"] == "partial"
        assert latest_observation(tmp_path)["observation_id"] == complete["observation_id"]


def test_cancel_between_source_calls_checkpoints_and_can_resume(tmp_path):
    responses = Responses()
    stop = Event()
    responses.event = stop
    with httpx.Client(transport=httpx.MockTransport(responses)) as transport:
        client = PsiClient(transport)
        interrupted = refresh_sources(tmp_path, client, now=TODAY, stop_event=stop)
        assert interrupted["status"] == "interrupted"
        assert responses.calls == ["catalog", "PSI-1:metadata"]
        assert interrupted["entries"]["PSI-1"]["metadata"] is not None
        assert latest_observation(tmp_path) is None
        stop.clear()
        responses.event = None
        completed = refresh_sources(tmp_path, client, now=TODAY, stop_event=stop)
        assert completed["status"] == "complete"
        assert responses.calls == [
            "catalog",
            "PSI-1:metadata",
            "PSI-1:manifest",
            "PSI-2:metadata",
            "PSI-2:manifest",
        ]


def test_lock_prevents_duplicate_acquisition_and_publication_gap_is_recovered(tmp_path):
    responses = Responses()
    tmp_path.mkdir(exist_ok=True)
    with httpx.Client(transport=httpx.MockTransport(responses)) as transport:
        client = PsiClient(transport)
        with (tmp_path / "refresh.lock").open("a+") as lock:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert refresh_sources(tmp_path, client, now=TODAY)["status"] == "already_running"
            assert not responses.calls
        first = refresh_sources(tmp_path, client, now=TODAY)
        (tmp_path / "current.json").unlink()
        count = len(responses.calls)
        recovered = refresh_sources(tmp_path, client, now=TODAY)
        assert recovered["status"] == "complete"
        assert len(responses.calls) == count
        assert latest_observation(tmp_path)["observation_id"] == first["observation_id"]
        with pytest.raises(ValueError, match="timezone"):
            refresh_sources(tmp_path, client, now=datetime(2026, 11, 14))


def test_snapshot_diff_and_file_access_changes_do_not_mutate_cases():
    record = {"accession": "PSI-1", "version": 1, "metadata_sha256": "a" * 64, "license": "CC0-1.0"}
    asset = {
        "accession": "PSI-1",
        "file_name": "data.csv",
        "file_version": 1,
        "sha256": "b" * 64,
        "license": "CC0-1.0",
    }
    before = {"investigations": [record], "assets": [asset]}
    after = {
        "investigations": [{**record, "version": 2, "metadata_sha256": "c" * 64}],
        "assets": [{**asset, "sha256": "d" * 64}],
    }
    result = snapshot_changes(before, after)
    assert result["dependency_ids_to_recheck"] == ["a" * 64, "b" * 64]
    assert result["changed_assets"][0]["before_sha256"] == "b" * 64
    assert result["automatic_case_mutation"] is False
    old = [
        {"key": "A", "version": 1, "restricted": False, "visible": True},
        {"key": "B", "version": 1},
    ]
    new = [
        {"key": "A", "version": 2, "restricted": True, "visible": True},
        {"key": "C", "version": 1},
    ]
    difference = manifest_changes(old, new)
    assert (difference["added_keys"], difference["not_in_observed_manifest_keys"]) == (["C"], ["B"])
    assert difference["changed"][0]["now_restricted_or_hidden"] is True
    assert manifest_changes(old + old, new)["status"] == "unresolved_duplicate_file_keys"

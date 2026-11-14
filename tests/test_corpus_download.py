"""Streaming source transfers preserve byte identity through interruption and reuse."""

from dataclasses import replace
from hashlib import sha256
from pathlib import Path

import httpx
import pytest
from nova_ember.adapters.download import (
    DownloadLimit,
    DownloadProfile,
    DownloadStopped,
    SourceRequest,
    acquire_source,
    cached_source,
)
from nova_ember.adapters.psi import SourceUnavailable


def source(data=b"0123456789abcdef", name="source.txt"):
    return SourceRequest(
        "a" * 64,
        "PSI-69",
        5,
        name,
        1,
        "psi-data/PSI-69/Raw Data/" + name,
        "b" * 64,
        len(data),
        "CC0-1.0",
    )


def profile(capacity=1024):
    return DownloadProfile(
        max_transfer_bytes=capacity,
        max_cache_bytes=capacity,
        disk_reserve_bytes=1,
        deadline_seconds=30,
        chunk_bytes=4,
    )


class Server:
    def __init__(self, data=b"0123456789abcdef"):
        self.data = data
        self.calls = []
        self.etag = '"version-1"'
        self.bad_range = False

    def __call__(self, request):
        self.calls.append(
            (request.url.host, request.headers.get("Range"), request.headers.get("If-Range"))
        )
        if request.url.host == "psi.nasa.gov":
            return httpx.Response(
                200,
                text="https://psi-repo-prod.s3.amazonaws.com/source?X-Amz-Signature=test-placeholder",
            )
        if request.headers.get("Range"):
            start = int(request.headers["Range"].split("=")[1].split("-")[0])
            reported = start + 1 if self.bad_range else start
            return httpx.Response(
                206,
                content=self.data[start:],
                headers={
                    "ETag": self.etag,
                    "Content-Range": f"bytes {reported}-{len(self.data) - 1}/{len(self.data)}",
                },
            )
        return httpx.Response(200, content=self.data, headers={"ETag": self.etag})


def test_download_hash_cache_hit_and_context_change_do_not_repeat_network(tmp_path):
    server = Server()
    request = source()
    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        result = acquire_source(client, tmp_path, request, profile())
        assert result["sha256"] == sha256(server.data).hexdigest()
        assert result["byte_size"] == 16
        assert result["scientific_corpus_promoted"] is False
        assert result["checksum_origin"] == "locally_calculated_sha256_not_NASA_attestation"
        assert len(server.calls) == 2
        hit = acquire_source(client, tmp_path, replace(request, snapshot_id="c" * 64), profile())
        assert hit["cache_hit"] is True and len(server.calls) == 2
        assert hit["source"]["snapshot_id"] == "c" * 64
        assert hit["captured_in_snapshot_id"] == "a" * 64
        retained = (tmp_path / "requests" / f"{request.key}.json").read_text()
        assert "Signature" not in retained
        assert cached_source(tmp_path, request.key)[1].read_bytes() == server.data


def test_interruption_resumes_only_remaining_bytes_with_etag_and_range(tmp_path):
    server = Server()
    request = source()

    def stop(stage, transferred, total):
        if stage == "transferring" and transferred >= 8:
            raise DownloadStopped("selected Stop")

    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        with pytest.raises(DownloadStopped):
            acquire_source(client, tmp_path, request, profile(), progress=stop)
        assert (tmp_path / "partial" / f"{request.key}.part").read_bytes() == server.data[:8]
        assert cached_source(tmp_path, request.key) is None
        completed = acquire_source(client, tmp_path, request, profile())
    assert server.calls[-1][1:] == ("bytes=8-", '"version-1"')
    assert completed["sha256"] == sha256(server.data).hexdigest()
    assert cached_source(tmp_path, request.key)[1].read_bytes() == server.data


def test_wrong_range_cannot_splice_source_and_full_partial_can_resume_validation(tmp_path):
    server = Server()
    request = source()

    def stop(stage, transferred, total):
        if stage == "transferring" and transferred >= 8:
            raise DownloadStopped("stop")

    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        with pytest.raises(DownloadStopped):
            acquire_source(client, tmp_path, request, profile(), progress=stop)
        server.bad_range = True
        with pytest.raises(SourceUnavailable, match="range/validator"):
            acquire_source(client, tmp_path, request, profile())
        assert cached_source(tmp_path, request.key) is None
        server.bad_range = False

        def stop_validation(stage, transferred, total):
            if stage == "validating_source":
                raise DownloadStopped("stop before validation")

        with pytest.raises(DownloadStopped):
            acquire_source(client, tmp_path, request, profile(), progress=stop_validation)
        assert (tmp_path / "partial" / f"{request.key}.part").stat().st_size == 16
        count = len(server.calls)
        result = acquire_source(client, tmp_path, request, profile())
        assert len(server.calls) == count
        assert result["sha256"] == sha256(server.data).hexdigest()


def test_cache_quota_keeps_active_inputs_and_evicts_only_unpinned_sources(tmp_path):
    server = Server()
    first = source()
    second = source(b"abcdefgh", "other.txt")
    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        acquire_source(client, tmp_path, first, profile(16))
        server.data = b"abcdefgh"
        with pytest.raises(DownloadLimit, match="active/pinned"):
            acquire_source(client, tmp_path, second, profile(16), pinned_keys={first.key})
        assert cached_source(tmp_path, first.key) is not None
        acquire_source(client, tmp_path, second, profile(16))
        assert cached_source(tmp_path, first.key) is None
        assert cached_source(tmp_path, second.key)[1].read_bytes() == b"abcdefgh"


def test_retained_nasa_fixture_reuses_original_bytes_with_no_external_request(tmp_path):
    path = (
        Path(__file__).parent
        / "fixtures"
        / "nasa-psi"
        / "assets"
        / "PSI-69_Experimental table_FLEX.csv"
    )
    data = path.read_bytes()
    request = source(data, path.name)

    def no_network(_request):
        raise AssertionError("Retained original bytes must not be downloaded again.")

    with httpx.Client(transport=httpx.MockTransport(no_network)) as client:
        result = acquire_source(
            client,
            tmp_path,
            request,
            DownloadProfile(max_transfer_bytes=1, max_cache_bytes=65536, disk_reserve_bytes=1),
            local_source=(path, "37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"),
        )
    assert result["network_bytes"] == 0
    assert result["acquisition_origin"] == "retained_corpus_bytes"
    assert cached_source(tmp_path, request.key)[1].read_bytes() == data


def test_streaming_profile_can_acquire_more_than_the_starter_five_mib_limit(tmp_path):
    data = b"known synthetic byte stream\n" * 210000
    assert len(data) > 5 * 1024 * 1024
    server = Server(data)
    request = source(data)
    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        result = acquire_source(
            client,
            tmp_path,
            request,
            DownloadProfile(
                max_transfer_bytes=8 * 1024 * 1024,
                max_cache_bytes=16 * 1024 * 1024,
                disk_reserve_bytes=1,
            ),
        )
    assert result["byte_size"] == len(data)
    assert result["sha256"] == sha256(data).hexdigest()


def test_mismatched_size_and_html_error_are_not_published_as_scientific_files(tmp_path):
    server = Server(b"<html>source unavailable</html>")
    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        with pytest.raises(SourceUnavailable, match="length"):
            acquire_source(client, tmp_path, source(), profile())
        request = source(server.data, "data.csv")
        with pytest.raises(SourceUnavailable, match="HTML error"):
            acquire_source(client, tmp_path, request, profile())
    assert cached_source(tmp_path, request.key) is None


def test_cached_corruption_is_detected_before_serving_source_bytes(tmp_path):
    server = Server()
    request = source()
    with httpx.Client(transport=httpx.MockTransport(server)) as client:
        acquire_source(client, tmp_path, request, profile())
    record, path = cached_source(tmp_path, request.key)
    path.chmod(0o600)
    path.write_bytes(b"X" * record["byte_size"])
    with pytest.raises(SourceUnavailable, match="SHA-256"):
        cached_source(tmp_path, request.key)

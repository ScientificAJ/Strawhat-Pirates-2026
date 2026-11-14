"""Frozen NASA media and registered-calculation boundaries, with no provider calls."""

import base64
import io
import os
from dataclasses import replace
from hashlib import sha256
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from nova_ember.api import jobs
from nova_ember.api.config import Settings
from nova_ember.api.database import connect
from nova_ember.api.main import create_app
from nova_ember.api.media_analysis import (
    MediaImageInput,
    calculate_media_image,
    licensed_source,
    run_frame_child,
)
from nova_ember.api.seed import seed
from nova_ember.api.trusted_analysis import execute_analysis_job
from PIL import Image

DROPLET_SHA = "141c84f5e91ea8c1d580f2465abde70651991e400fd2b39e55414423423e595c"
BASS_SHA = "aa0bf2369cf77833e95e353519e634ab5cbb5b2918db08849e9bde82267aade3"
FRAME30_PNG_SHA = "48a7756ca4f92d20ed3f32edbb15548524b106a7568942a1049f11041e0862d1"
pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def media_api(tmp_path_factory):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL required for a separate local PostgreSQL database.")
    original = Settings.from_environment()
    if url == original.database_url:
        raise RuntimeError("Media tests require the separate test database.")
    settings = replace(
        original,
        database_url=url,
        openai_api_key=None,
        object_directory=tmp_path_factory.mktemp("media-api-objects"),
    )
    snapshot = seed(settings)
    client = TestClient(create_app(settings))
    task_ids = []
    yield SimpleNamespace(settings=settings, snapshot=snapshot, client=client, tasks=task_ids)
    with connect(url) as connection:
        for identifier in task_ids:
            connection.execute("DELETE FROM jobs WHERE id = %s", (identifier,))


def measurement(snapshot, original_hash, expected_hash=None, **updates):
    request = {
        "expected_sha256": expected_hash or original_hash,
        "roi": {"left": 0, "top": 0, "right": 100, "bottom": 100},
        "observable": "luminous_edge",
        "intensity_channel": "luminance_bt601",
        "threshold": 128,
        "foreground": "at_or_above",
        "context": {
            "input_origin": "analyst_input",
            "source_snapshot": snapshot,
            "sources": [
                {
                    "source_id": "selected original source",
                    "asset_sha256": original_hash,
                    "locator": "explicit image ROI",
                }
            ],
        },
    }
    request.update(updates)
    return request


def complete_owned_calculation(fixture, task):
    """Exercise the fixed child for this test's job without claiming unrelated queued work."""
    fixture.tasks.append(task["id"])
    with connect(fixture.settings.database_url) as connection:
        claimed = connection.execute(
            """UPDATE jobs SET status = 'running', attempt = attempt + 1,
               lease_until = now() + interval '60 seconds' WHERE id = %s
               RETURNING id, kind, snapshot_id, inputs, attempt""",
            (task["id"],),
        ).fetchone()
    claimed["id"] = str(claimed["id"])
    result = execute_analysis_job(fixture.settings, claimed)
    assert jobs.finish_job(fixture.settings.database_url, claimed["id"], claimed["attempt"], result)
    return result


def test_original_jpeg_and_video_are_inline_verified_and_support_byte_ranges(media_api):
    f = media_api
    image = f.client.get(f"/v1/assets/{BASS_SHA}/media/preview", params={"snapshot_id": f.snapshot})
    assert image.status_code == 200
    assert image.headers["content-type"] == "image/jpeg"
    assert image.headers["content-disposition"].startswith("inline;")
    assert image.headers["etag"] == f'"{BASS_SHA}"'
    assert sha256(image.content).hexdigest() == BASS_SHA
    video = f.client.get(f"/v1/assets/{DROPLET_SHA}/media/preview", headers={"Range": "bytes=0-15"})
    assert video.status_code == 206
    assert video.headers["content-type"] == "video/mp4"
    assert video.headers["content-range"].startswith("bytes 0-15/")
    assert len(video.content) == 16
    assert video.content[4:8] == b"ftyp"


def test_nasa_decoded_frame_preserves_original_pts_instead_of_nominal_fps(media_api):
    f = media_api
    response = f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30")
    assert response.status_code == 200, response.text
    frame = response.json()
    assert frame["source_sha256"] == DROPLET_SHA
    assert frame["original_pts"] == 60060
    assert frame["time_base"] == "1/60000"
    assert frame["timestamp_seconds_exact"] == {"numerator": 1001, "denominator": 1000}
    assert frame["timestamp_seconds"] == 1.001
    assert (frame["width"], frame["height"]) == (720, 480)
    assert frame["decoded_frame_count"] == 964
    assert frame["source_stream"]["nb_frames"] == "1928"
    assert frame["source_stream"]["avg_frame_rate"] == "60000/1001"
    assert frame["source_stream"]["field_order"] == "bb"
    assert frame["source_stream"]["sample_aspect_ratio"] == "10:11"
    assert frame["original_frame_metadata"]["interlaced_frame"] == 1
    assert frame["spatial_calibration"] is None
    assert frame["experimental_time_origin"] is None
    assert not frame["measurement_ready"]
    assert frame["resources"]["peak_group_rss_kib"] < 512 * 1024
    assert frame["resources"]["wall_seconds"] < 30
    if frame["ffmpeg_version"].startswith("ffmpeg version 6.1.1-3ubuntu5"):
        assert frame["png_sha256"] == FRAME30_PNG_SHA
    png = f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30/image")
    assert png.status_code == 200
    assert sha256(png.content).hexdigest() == frame["png_sha256"]
    with Image.open(io.BytesIO(png.content)) as image:
        assert image.size == (720, 480)
        assert image.mode == "RGB"
    again = f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").json()
    assert again["cache_status"] == "retained"
    assert again["manifest_sha256"] == frame["manifest_sha256"]


def test_cached_frame_stays_available_during_a_busy_calculation_slot(media_api):
    f = media_api
    assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").status_code == 200
    with connect(f.settings.database_url) as connection:
        connection.autocommit = True
        connection.execute("SELECT pg_advisory_lock(701421)")
        try:
            assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").status_code == 200
            assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/31").status_code == 429
        finally:
            connection.execute("SELECT pg_advisory_unlock(701421)")


def test_out_of_range_frame_and_still_image_frame_requests_do_not_invent_data(media_api):
    f = media_api
    assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/10000").status_code == 422
    assert f.client.get(f"/v1/assets/{BASS_SHA}/frames/0").status_code == 422
    assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/-1").status_code == 422


def test_unknown_redistribution_license_is_denied_before_source_bytes_are_read():
    corpus = SimpleNamespace(
        snapshot=lambda _snapshot: {"snapshot_id": "a" * 64},
        asset=lambda *_args, **_kwargs: {"license": None},
        asset_bytes=lambda _asset: pytest.fail("Unlicensed bytes must not be read or served."),
    )
    with pytest.raises(HTTPException) as error:
        licensed_source(corpus, "b" * 64, None, None, None)
    assert error.value.status_code == 403


def test_corrupt_media_and_real_parent_timeout_are_explicit_bounded_failures(monkeypatch):
    from nova_ember.api import media_analysis

    with pytest.raises(HTTPException) as malformed:
        run_frame_child(b"\x00\x00\x00\x20ftyp" + b"invalid" * 4, 0)
    assert malformed.value.status_code == 422
    monkeypatch.setattr(media_analysis, "FRAME_TIMEOUT_SECONDS", 0.001)
    with pytest.raises(HTTPException, match="30-second") as timed:
        run_frame_child(b"\x00\x00\x00\x20ftyp" + b"invalid" * 4, 0)
    assert timed.value.status_code == 422


def test_measurement_checks_frozen_byte_hash_source_anchor_and_snapshot(media_api):
    f = media_api
    payload = {
        "source_sha256": BASS_SHA,
        "snapshot_id": f.snapshot,
        "measurement": measurement(f.snapshot, BASS_SHA, expected_hash="0" * 64),
    }
    assert f.client.post("/v1/media/measure", json=payload).status_code == 409
    payload["measurement"] = measurement("0" * 64, BASS_SHA)
    assert f.client.post("/v1/media/measure", json=payload).status_code == 422
    payload["measurement"] = measurement(f.snapshot, BASS_SHA)
    payload["measurement"]["context"]["sources"][0]["asset_sha256"] = "0" * 64
    assert f.client.post("/v1/media/measure", json=payload).status_code == 422


def test_real_nasa_image_measurement_runs_in_fixed_child_and_remains_uncalibrated(media_api):
    f = media_api
    response = f.client.post(
        "/v1/media/measure",
        json={
            "source_sha256": BASS_SHA,
            "snapshot_id": f.snapshot,
            "measurement": measurement(f.snapshot, BASS_SHA),
        },
    )
    assert response.status_code == 202, response.text
    task = response.json()
    result = complete_owned_calculation(f, task)
    assert result["resources"]["memory_limit_mib"] == 512
    assert result["resources"]["elapsed_limit_seconds"] == 30
    measured = result["result"]["measurement"]
    assert measured["status"] in {"measurement_proposal", "needs_data"}
    if measured["status"] == "measurement_proposal":
        assert measured["value_metres"] is None
        assert "spatial calibration" in measured["missing_requirements"]
    else:
        assert measured["value"] is None
    assert result["result"]["provenance"]["asset"]["sha256"] == BASS_SHA
    assert result["result"]["provenance"]["snapshot_id"] == f.snapshot
    assert TestClient(f.client.app).get(f"/v1/jobs/{task['id']}").status_code == 404


def test_nonsquare_video_does_not_acquire_metric_scale_from_metadata(media_api):
    f = media_api
    frame = f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").json()
    calibration = {
        "metres_per_pixel": 0.001,
        "calibration_reference": "hypothetical example",
        "calibrated_image_width": 720,
        "calibrated_image_height": 480,
        "viewing_geometry": "planar_orthographic",
        "geometry_reference": "hypothetical geometry",
        "square_pixel_justification": "analyst assumption, contradicts source aspect metadata",
    }
    response = f.client.post(
        "/v1/media/measure",
        json={
            "source_sha256": DROPLET_SHA,
            "snapshot_id": f.snapshot,
            "frame_index": 30,
            "measurement": measurement(
                f.snapshot, DROPLET_SHA, frame["png_sha256"], calibration=calibration
            ),
        },
    )
    assert response.status_code == 422
    assert "nonsquare" in response.json()["detail"]


def test_synthetic_registered_image_method_has_known_physical_area_without_nasa_claim():
    array = np.zeros((10, 20), dtype=np.uint8)
    array[2:8, 3:7] = 255
    stream = io.BytesIO()
    Image.fromarray(array).save(stream, format="PNG")
    content = stream.getvalue()
    parameters = measurement(
        "a" * 64,
        sha256(content).hexdigest(),
        roi={"left": 0, "top": 0, "right": 20, "bottom": 10},
        intensity_channel="grayscale",
        calibration={
            "metres_per_pixel_x": 0.002,
            "metres_per_pixel_y": 0.001,
            "x_calibration_reference": "analytical x scale",
            "y_calibration_reference": "analytical y scale",
            "calibration_reference": "synthetic reference",
            "calibrated_image_width": 20,
            "calibrated_image_height": 10,
            "viewing_geometry": "planar_orthographic",
            "geometry_reference": "synthetic plane",
        },
        segmentation_validation_reference="analytical rectangle mask",
        observable_definition_reference="synthetic reference, not experimental evidence",
    )
    parameters["context"]["input_origin"] = "synthetic_reference"
    result = calculate_media_image(
        MediaImageInput(
            image_base64=base64.b64encode(content).decode(),
            measurement=parameters,
            provenance={"kind": "synthetic_analytical_fixture"},
        )
    )
    assert result["measurement"]["value_metres"] == pytest.approx(0.012)
    assert result["measurement"]["foreground_area_square_metres"] == pytest.approx(48e-6)
    assert result["measurement"]["context"]["input_origin"] == "synthetic_reference"
    assert result["provenance"]["kind"] == "synthetic_analytical_fixture"


def test_pixel_trace_api_uses_fixed_child_and_keeps_unknown_validation_visible(media_api):
    f = media_api
    request = {
        "points": [
            {
                "source_locator": f"manual annotation:{index}",
                "source_sha256": BASS_SHA,
                "pixel_value": float(10 + index),
                "time_seconds": float(index),
            }
            for index in range(3)
        ],
        "calibration": {
            "metres_per_pixel": 0.001,
            "calibration_reference": "analyst sensitivity only",
            "calibrated_image_width": 1200,
            "calibrated_image_height": 797,
            "viewing_geometry": "unresolved",
            "geometry_reference": "unknown",
            "square_pixel_justification": "analyst assumption",
        },
        "observable": "luminous_edge",
        "coordinate_definition": "analyst manual pixels",
        "time_origin_definition": "hypothetical annotation timeline, not an experiment clock",
        "context": {
            "input_origin": "analyst_input",
            "source_snapshot": f.snapshot,
            "sources": [
                {
                    "source_id": "selected source image",
                    "asset_sha256": BASS_SHA,
                    "locator": "manual annotations",
                }
            ],
        },
    }
    response = f.client.post("/v1/media/pixel-trace", json={"request": request})
    assert response.status_code == 202, response.text
    result = complete_owned_calculation(f, response.json())
    assert result["result"]["status"] == "measurement_proposal"
    assert result["result"]["independent_run_count"] is None
    assert "source clock/frame timebase calibration" in result["result"]["missing_requirements"]


def test_changed_cached_png_is_rejected_without_silently_replacing_the_frozen_artifact(media_api):
    f = media_api
    frame = f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").json()
    path = f.settings.object_directory / "media-derived" / frame["png_sha256"]
    original = path.read_bytes()
    try:
        path.write_bytes(b"altered cached frame")
        assert f.client.get(f"/v1/assets/{DROPLET_SHA}/frames/30").status_code == 409
    finally:
        path.write_bytes(original)

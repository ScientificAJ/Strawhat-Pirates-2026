"""Original NASA example bytes and their non-calibrated container metadata."""

import json
import shutil
from hashlib import sha256
from pathlib import Path

import pytest
from nova_ember.adapters.media import inspect_media, media_signature

MEDIA = Path(__file__).parent / "fixtures" / "nasa-psi-media"
EXPECTED = {
    "PSI-25_Representative Image(s)_BASS-II_flame testing.jpg": (
        "aa0bf2369cf77833e95e353519e634ab5cbb5b2918db08849e9bde82267aade3",
        37525,
    ),
    "PSI-69_Raw Data_Droplet View Movie.mp4": (
        "141c84f5e91ea8c1d580f2465abde70651991e400fd2b39e55414423423e595c",
        2786355,
    ),
    "PSI-69_Raw Data_Flame View Movie.mp4": (
        "2f48e79ed61ef42d0b8caeda59964e2f265f548d2372f331d9d5c4400de7a004",
        2402393,
    ),
}


def test_original_media_hashes_record_licenses_and_roles_are_preserved():
    snapshot = json.loads((MEDIA / "snapshot.json").read_bytes())
    assert sum(row["byte_size"] for row in snapshot["assets"]) == 5226273
    for asset in snapshot["assets"]:
        content = (MEDIA / asset["path"]).read_bytes()
        digest, size = EXPECTED[asset["file_name"]]
        assert len(content) == asset["byte_size"] == size
        assert sha256(content).hexdigest() == asset["sha256"] == digest
        assert media_signature(content, asset["file_name"]) == asset["media_type"]
        assert asset["license"] == "CC0-1.0"
        assert asset["license_scope"] == "investigation_metadata"
        assert asset["media"]["spatial_calibration"] is None
        assert asset["media"]["measurement_ready"] is False
        if asset["media_type"].startswith("image/"):
            assert "duration" not in asset["media"]["format"]
            assert all(
                "time_base" not in stream and "r_frame_rate" not in stream
                for stream in asset["media"]["streams"]
            )


def test_actual_video_probe_keeps_timebase_without_inventing_alignment():
    if not shutil.which("ffprobe"):
        pytest.skip("Local ffprobe is required for actual media inspection.")
    name = "PSI-69_Raw Data_Droplet View Movie.mp4"
    result = inspect_media((MEDIA / "assets" / name).read_bytes(), name)
    video = next(row for row in result["streams"] if row["codec_type"] == "video")
    assert (video["width"], video["height"]) == (720, 480)
    assert video["time_base"] == "1/60000"
    assert video["avg_frame_rate"] == "60000/1001"
    assert result["time_origin"] is None
    assert result["measurement_ready"] is False
    with pytest.raises(ValueError, match="signature"):
        inspect_media(b"<html>error</html>", name)

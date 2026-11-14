"""Authentic media metadata without treating pixels or camera color as measurements."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from hashlib import sha256
from pathlib import Path


def media_signature(content: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.casefold()
    if suffix == ".jpg" and content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if suffix == ".png" and content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if suffix == ".mp4" and len(content) > 12 and content[4:8] == b"ftyp":
        return "video/mp4"
    raise ValueError("Media signature does not match an approved JPEG, PNG or MP4 source.")


def inspect_media(content: bytes, filename: str) -> dict:
    if not content or len(content) > 10 * 1024 * 1024:
        raise ValueError("Select a nonempty source of at most 10 MiB for this media profile.")
    media_type = media_signature(content, filename)
    executable = shutil.which("ffprobe")
    if executable is None:
        return {
            "status": "metadata_unavailable",
            "media_type": media_type,
            "reason": "The local ffprobe utility is unavailable.",
            "sha256": sha256(content).hexdigest(),
        }
    with tempfile.TemporaryDirectory(prefix="nova-media-") as scratch:
        source = Path(scratch) / ("source" + Path(filename).suffix.casefold())
        source.write_bytes(content)
        try:
            result = subprocess.run(
                [
                    executable,
                    "-v",
                    "error",
                    "-max_alloc",
                    "268435456",
                    "-protocol_whitelist",
                    "file,pipe",
                    "-show_entries",
                    "format=duration,format_name:stream=index,codec_name,codec_type,width,height,time_base,r_frame_rate,avg_frame_rate,duration,nb_frames",
                    "-of",
                    "json",
                    str(source),
                ],
                capture_output=True,
                timeout=15,
                env={"PATH": os.defpath},
                check=False,
            )
        except subprocess.TimeoutExpired:
            raise ValueError("Media metadata inspection exceeded its 15-second limit.") from None
    if result.returncode != 0 or len(result.stdout) > 1024 * 1024:
        raise ValueError("The source cannot be inspected by the bounded media profile.")
    try:
        metadata = json.loads(result.stdout)
    except ValueError:
        raise ValueError("The media reader returned invalid metadata.") from None
    if media_type.startswith("image/"):
        # image2 reports a synthetic 25 fps/one-frame duration, not camera timing.
        metadata["streams"] = [
            {
                key: stream[key]
                for key in ("index", "codec_name", "width", "height")
                if key in stream
            }
            | {"media_kind": "still_image"}
            for stream in metadata.get("streams", [])
        ]
        metadata["format"] = {"format_name": metadata.get("format", {}).get("format_name")}
    return {
        "status": "source_metadata_available",
        "sha256": sha256(content).hexdigest(),
        "media_type": media_type,
        "streams": metadata.get("streams", []),
        "format": metadata.get("format", {}),
        "spatial_calibration": None,
        "time_origin": None,
        "measurement_ready": False,
        "reader_id": "ffprobe-container-v1",
        "limitations": [
            "Codec timestamps/timebase do not establish camera/experiment-clock synchronization.",
            "Pixels alone do not establish scale, temperature, extinction or derived metrics.",
            "Frame counts and file names are not independent experimental-run counts.",
        ]
        + (
            ["No camera exposure or frame cadence is established by this still-image profile."]
            if media_type.startswith("image/")
            else []
        ),
    }

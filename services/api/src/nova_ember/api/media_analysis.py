"""Licensed source previews, frozen video frames and calibrated media analysis."""

from __future__ import annotations

import base64
import io
import json
import os
import resource
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time
from fractions import Fraction
from hashlib import sha256
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from nova_ember.adapters.media import media_signature
from nova_ember.analysis.media import (
    ImageMeasurementRequest,
    PixelTraceRequest,
    SpatialCalibration,
    measure_image,
)
from nova_ember.contracts.research import Contract
from PIL import Image
from pydantic import Field

from . import jobs
from .config import Settings
from .database import connect
from .repository import Corpus
from .seed import write_object

Digest = Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]
FRAME_METHOD = "original-indexed-frame-rgb24-v2"
MAX_SOURCE_BYTES = 10 * 1024 * 1024
MAX_CHILD_OUTPUT = 4 * 1024 * 1024
MAX_FRAME_PIXELS = 4 * 1024 * 1024
MAX_FRAME_CACHE_BYTES = 512 * 1024 * 1024
FRAME_TIMEOUT_SECONDS = 30
TRUSTED_CHILD_SETUP = (
    "import os,resource,runpy;"
    "resource.setrlimit(resource.RLIMIT_AS,(536870912,536870912));"
    "resource.setrlimit(resource.RLIMIT_CPU,(30,30));"
    "resource.setrlimit(resource.RLIMIT_FSIZE,(4194304,4194304));"
    "os.sched_setaffinity(0,{min(os.sched_getaffinity(0))});"
    "runpy.run_module('nova_ember.api.media_analysis',run_name='__main__')"
)


class MediaImageInput(Contract):
    image_base64: str = Field(min_length=1, max_length=1800000)
    measurement: ImageMeasurementRequest
    provenance: dict


def calculate_media_image(inputs: MediaImageInput) -> dict:
    """Fixed registered method; stdin carries selected frozen bytes, never paths or code."""
    try:
        content = base64.b64decode(inputs.image_base64, validate=True)
    except ValueError:
        raise ValueError("Selected image bytes have invalid base64 encoding.") from None
    result = measure_image(inputs.measurement, content)
    return {
        "measurement": result.model_dump(mode="json"),
        "provenance": inputs.provenance,
        "provenance_contract": (
            "Submitted lineage is retained. The source-bound /media/measure route checks the "
            "original snapshot and byte identity; generic method inputs alone do not "
            "verify NASA origin."
        ),
    }


def require_source_axis_calibration(calibration: SpatialCalibration | None, frame: dict) -> None:
    aspect = frame["source_stream"].get("sample_aspect_ratio")
    if (
        aspect not in (None, "N/A", "0:1", "1:1")
        and calibration is not None
        and calibration.metres_per_pixel is not None
    ):
        raise HTTPException(
            422,
            "This source reports nonsquare pixels. Supply independently evidenced x/y "
            "calibrations; no metric scale is inferred from display aspect ratio.",
        )


class MediaMeasurement(Contract):
    source_sha256: Digest
    snapshot_id: Digest
    accession: str | None = Field(default=None, max_length=32)
    asset_id: str | None = Field(default=None, max_length=1024)
    frame_index: int | None = Field(default=None, strict=True, ge=0, le=10000)
    measurement: ImageMeasurementRequest


class PixelTraceCall(Contract):
    request: PixelTraceRequest


def licensed_source(
    corpus: Corpus,
    digest: str,
    snapshot_id: str | None,
    accession: str | None,
    asset_id: str | None,
) -> tuple[dict, bytes, str]:
    snapshot = corpus.snapshot(snapshot_id)["snapshot_id"]
    asset = corpus.asset(digest, snapshot, accession=accession, asset_id=asset_id)
    if asset.get("license") != "CC0-1.0":
        raise HTTPException(
            403,
            "This media source has no confirmed redistribution license in the selected snapshot.",
        )
    if asset["byte_size"] > MAX_SOURCE_BYTES:
        raise HTTPException(422, "Select a frozen source within the 10 MiB media profile.")
    content = corpus.asset_bytes(asset)
    actual = media_signature(content, asset["file_name"])
    if actual != asset["media_type"]:
        raise ValueError("Selected media signature differs from its retained source type.")
    return asset, content, snapshot


def _file_response(path: Path, media_type: str, digest: str, filename: str) -> FileResponse:
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="inline",
        headers={
            "ETag": f'"{digest}"',
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )


def process_group_rss_kib(group: int) -> int:
    """Linux RSS sum for this fixed process group, including local media descendants."""
    total = 0
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            # comm may include whitespace and parentheses; split after its final closing bracket.
            fields = (entry / "stat").read_text().rsplit(")", 1)[1].split()
            if int(fields[2]) == group:
                total += int(fields[21]) * os.sysconf("SC_PAGE_SIZE") // 1024
        except (FileNotFoundError, PermissionError, ProcessLookupError, IndexError, ValueError):
            continue
    return total


def run_frame_child(content: bytes, frame_index: int) -> dict:
    """A fixed CPU-bound program with an independent wall-time and process-group RSS guard."""
    environment = {
        "PATH": os.defpath,
        "PYTHONPATH": os.pathsep.join(sys.path),
        "LANG": "C.UTF-8",
        "OPENBLAS_NUM_THREADS": "1",
        "OMP_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "NUMEXPR_NUM_THREADS": "1",
    }
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="nova-frame-") as directory:
        source = Path(directory) / "source.mp4"
        source.write_bytes(content)
        request = {"frame_index": frame_index, "source_sha256": sha256(content).hexdigest()}
        with (
            tempfile.TemporaryFile() as stdin,
            tempfile.TemporaryFile() as output,
            tempfile.TemporaryFile() as errors,
        ):
            stdin.write(jobs.canonical_json(request))
            stdin.seek(0)
            child = subprocess.Popen(
                [sys.executable, "-c", TRUSTED_CHILD_SETUP],
                cwd=directory,
                env=environment,
                stdin=stdin,
                stdout=output,
                stderr=errors,
                start_new_session=True,
            )
            failure, peak = None, 0
            try:
                while child.poll() is None:
                    peak = max(peak, process_group_rss_kib(child.pid))
                    if peak > 512 * 1024:
                        failure = (
                            "The fixed media process group exceeded its 512 MiB memory budget."
                        )
                        break
                    if time.monotonic() - started > FRAME_TIMEOUT_SECONDS:
                        failure = "The selected frame exceeded the fixed 30-second media limit."
                        break
                    try:
                        child.wait(timeout=0.05)
                    except subprocess.TimeoutExpired:
                        pass
            finally:
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            output.seek(0)
            encoded = output.read(MAX_CHILD_OUTPUT + 1)
            if failure:
                raise HTTPException(422, failure)
            if child.returncode != 0 or len(encoded) > MAX_CHILD_OUTPUT:
                raise HTTPException(
                    422,
                    "The fixed frame extractor could not complete within its "
                    "format/resource bounds.",
                )
    result = json.loads(encoded)
    if result.get("status") != "extracted":
        raise HTTPException(422, result.get("reason", "Selected source frame is unavailable."))
    result["resources"] = {
        "peak_group_rss_kib": peak,
        "wall_seconds": time.monotonic() - started,
        "memory_limit_mib": 512,
        "elapsed_limit_seconds": 30,
        "cpu_count": 1,
    }
    return result


def _fixed_tool(arguments: list[str], *, timeout: float, maximum: int) -> bytes:
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        result = subprocess.run(
            arguments,
            stdout=output,
            stderr=errors,
            timeout=timeout,
            check=False,
            env={"PATH": os.defpath, "LANG": "C.UTF-8"},
        )
        output.seek(0)
        content = output.read(maximum + 1)
    if result.returncode != 0 or len(content) > maximum:
        raise ValueError("The fixed media tool rejected this source or exceeded its output bound.")
    return content


def _extract_frame(frame_index: int, expected_hash: str) -> dict:
    """Child-only implementation. The input path is fixed by the parent-controlled directory."""
    source = Path("source.mp4")
    content = source.read_bytes()
    if len(content) > MAX_SOURCE_BYTES or sha256(content).hexdigest() != expected_hash:
        raise ValueError("Frozen media bytes differ from their selected source hash.")
    media_signature(content, "source.mp4")
    ffprobe = shutil.which("ffprobe", path=os.defpath)
    ffmpeg = shutil.which("ffmpeg", path=os.defpath)
    if not ffprobe or not ffmpeg:
        raise ValueError("The existing local ffprobe/ffmpeg utilities are unavailable.")
    metadata = json.loads(
        _fixed_tool(
            [
                ffprobe,
                "-v",
                "error",
                "-threads",
                "1",
                "-max_alloc",
                "134217728",
                "-protocol_whitelist",
                "file,pipe",
                "-f",
                "mov",
                "-enable_drefs",
                "0",
                "-use_absolute_path",
                "0",
                "-select_streams",
                "v:0",
                "-show_frames",
                "-show_entries",
                "frame=pts,pts_time,best_effort_timestamp,best_effort_timestamp_time,"
                "pkt_duration,pkt_duration_time,width,height,interlaced_frame,top_field_first,repeat_pict:"
                "stream=index,codec_name,width,height,time_base,pix_fmt,sample_aspect_ratio,"
                "color_space,color_transfer,color_primaries,field_order,r_frame_rate,avg_frame_rate,"
                "nb_frames,duration",
                "-of",
                "json",
                str(source),
            ],
            timeout=12,
            maximum=MAX_CHILD_OUTPUT,
        )
    )
    streams, frames = metadata.get("streams", []), metadata.get("frames", [])
    if len(streams) != 1 or frame_index >= len(frames):
        raise ValueError("The selected original frame index is outside the decoded video stream.")
    stream, frame = streams[0], frames[frame_index]
    width, height = int(frame["width"]), int(frame["height"])
    if width <= 0 or height <= 0 or width * height > MAX_FRAME_PIXELS:
        raise ValueError(
            "The original frame exceeds the bounded pixel profile; no automatic rescale "
            "was applied."
        )
    time_base = Fraction(stream["time_base"])
    if time_base <= 0:
        raise ValueError("The original stream time base is invalid.")
    pts = frame.get("pts")
    if pts is None:
        raise ValueError(
            "This frame has no reported original PTS; no frame-rate timestamp was inferred."
        )
    exact_time = int(pts) * time_base
    output = Path("frame.png")
    _fixed_tool(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-threads",
            "1",
            "-filter_threads",
            "1",
            "-max_alloc",
            "134217728",
            "-protocol_whitelist",
            "file,pipe",
            "-noautorotate",
            "-f",
            "mov",
            "-enable_drefs",
            "0",
            "-use_absolute_path",
            "0",
            "-i",
            str(source),
            "-map",
            "0:v:0",
            "-an",
            "-sn",
            "-dn",
            "-vf",
            f"select=eq(n\\,{frame_index})",
            "-frames:v",
            "1",
            "-fps_mode",
            "passthrough",
            "-threads",
            "1",
            "-c:v",
            "png",
            "-pix_fmt",
            "rgb24",
            str(output),
        ],
        timeout=15,
        maximum=65536,
    )
    if not output.is_file() or output.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("The decoded frame exceeds the frozen PNG output profile.")
    png = output.read_bytes()
    with Image.open(io.BytesIO(png)) as image:
        if image.size != (width, height) or image.mode != "RGB":
            raise ValueError(
                "Decoded frame dimensions/pixel representation differ from the selected "
                "source frame."
            )
        image.verify()
    version = _fixed_tool([ffmpeg, "-version"], timeout=2, maximum=65536).decode().splitlines()[0]
    return {
        "status": "extracted",
        "method_id": FRAME_METHOD,
        "source_sha256": expected_hash,
        "stream_index": stream["index"],
        "frame_index": frame_index,
        "frame_count": len(frames),
        "decoded_frame_count": len(frames),
        "original_frame_metadata": frame,
        "original_pts": int(pts),
        "time_base": str(time_base),
        "timestamp_seconds": float(exact_time),
        "timestamp_seconds_exact": {
            "numerator": exact_time.numerator,
            "denominator": exact_time.denominator,
        },
        "reported_pts_time": frame.get("pts_time"),
        "source_stream": stream,
        "width": width,
        "height": height,
        "png_sha256": sha256(png).hexdigest(),
        "png_base64": base64.b64encode(png).decode(),
        "ffmpeg_version": version,
        "transformations": [
            "Decode the explicitly selected original display-order frame.",
            "Convert decoded pixels to 8-bit RGB PNG without resizing, frame-rate "
            "resampling or autorotation.",
        ],
        "spatial_calibration": None,
        "experimental_time_origin": None,
        "measurement_ready": False,
        "limitations": [
            "Container PTS is not experiment-clock or cross-camera synchronization.",
            "Coded-picture counts or nominal FPS may differ from decoded full-frame "
            "timing; original PTS is retained.",
            "No deinterlacing or field-time correction was applied to interlaced source frames.",
            "Decoded color conversion is recorded; image color is not temperature or an "
            "extinction endpoint.",
            "Spatial scale, viewing geometry, pixel aspect and physical front definition "
            "require source-specific evidence.",
        ],
    }


def _child_main():
    try:
        payload = json.loads(sys.stdin.buffer.read(4097))
        if set(payload) != {"frame_index", "source_sha256"}:
            raise ValueError("Unsupported trusted media request.")
        index = payload["frame_index"]
        if isinstance(index, bool) or not isinstance(index, int) or not 0 <= index <= 10000:
            raise ValueError("Invalid original frame index.")
        result = _extract_frame(index, payload["source_sha256"])
    except (ValueError, KeyError, OSError, subprocess.TimeoutExpired) as error:
        result = {"status": "unavailable", "reason": str(error)}
    usage = resource.getrusage(resource.RUSAGE_SELF)
    result["child_peak_rss_kib"] = usage.ru_maxrss
    print(json.dumps(result, allow_nan=False))


class MediaAnalysis:
    def __init__(self, settings: Settings):
        self.settings, self.corpus = settings, Corpus(settings)

    def frame(
        self,
        digest: str,
        index: int,
        snapshot_id: str | None,
        accession: str | None = None,
        asset_id: str | None = None,
    ) -> tuple[dict, Path]:
        asset, content, snapshot = licensed_source(
            self.corpus, digest, snapshot_id, accession, asset_id
        )
        if asset["media_type"] != "video/mp4":
            raise HTTPException(
                422, "Original indexed frame extraction requires a selected MP4 video."
            )
        identity = {
            "method_id": FRAME_METHOD,
            "source_sha256": digest,
            "frame_index": index,
            "snapshot_id": snapshot,
            "asset_id": asset["id"],
        }
        key = sha256(jobs.canonical_json(identity)).hexdigest()
        directory = self.settings.object_directory / "media-derived"
        index_path = directory / (key + ".json")

        def retained_frame():
            if not index_path.is_file():
                return None
            pointer = json.loads(index_path.read_bytes())
            encoded = (directory / pointer["manifest_sha256"]).read_bytes()
            if sha256(encoded).hexdigest() != pointer["manifest_sha256"]:
                raise ValueError("Frozen frame manifest checksum changed.")
            manifest = json.loads(encoded)
            png_path = directory / manifest["png_sha256"]
            if (
                manifest["selection"] != identity
                or sha256(png_path.read_bytes()).hexdigest() != manifest["png_sha256"]
            ):
                raise ValueError("Frozen frame bytes or source selection changed.")
            return {
                **manifest,
                "manifest_sha256": pointer["manifest_sha256"],
                "cache_status": "retained",
            }, png_path

        retained = retained_frame()
        if retained:
            return retained
        with connect(self.settings.database_url) as connection:
            connection.autocommit = True
            lock = connection.execute("SELECT pg_try_advisory_lock(701421) AS acquired").fetchone()
            if not lock or not lock["acquired"]:
                raise HTTPException(
                    429,
                    "The single scientific media/calculation slot is busy; retry this "
                    "frozen selection.",
                )
            try:
                retained = retained_frame()
                if retained:
                    return retained
                directory.mkdir(parents=True, exist_ok=True)
                if (
                    sum(path.stat().st_size for path in directory.iterdir() if path.is_file())
                    >= MAX_FRAME_CACHE_BYTES
                ):
                    raise HTTPException(
                        422,
                        "The bounded frozen-frame cache is full; original source media "
                        "remains available.",
                    )
                extracted = run_frame_child(content, index)
                png = base64.b64decode(extracted.pop("png_base64"), validate=True)
                if sha256(png).hexdigest() != extracted["png_sha256"]:
                    raise ValueError("The trusted frame output checksum differs from its manifest.")
                manifest = {
                    **extracted,
                    "selection": identity,
                    "asset": asset,
                    "snapshot_id": snapshot,
                    "license": asset["license"],
                }
                encoded = jobs.canonical_json(manifest)
                manifest_hash = sha256(encoded).hexdigest()
                used = sum(path.stat().st_size for path in directory.iterdir() if path.is_file())
                if used + len(encoded) + len(png) + 128 > MAX_FRAME_CACHE_BYTES:
                    raise HTTPException(
                        422,
                        "The frozen-frame cache cannot retain this output within its byte budget.",
                    )
                write_object(directory, extracted["png_sha256"], png)
                write_object(directory, manifest_hash, encoded)
                pointer = jobs.canonical_json({"manifest_sha256": manifest_hash})
                descriptor, name = tempfile.mkstemp(prefix=".frame-index-", dir=directory)
                try:
                    with os.fdopen(descriptor, "wb") as target:
                        target.write(pointer)
                        target.flush()
                        os.fsync(target.fileno())
                    os.replace(name, index_path)
                finally:
                    Path(name).unlink(missing_ok=True)
                return {
                    **manifest,
                    "manifest_sha256": manifest_hash,
                    "cache_status": "created",
                }, directory / extracted["png_sha256"]
            finally:
                connection.execute("SELECT pg_advisory_unlock(701421)")


def create_media_analysis_router(settings: Settings) -> APIRouter:
    router = APIRouter(prefix="/v1", tags=["media analysis"])
    service = MediaAnalysis(settings)

    @router.get(
        "/assets/{digest}/media/preview",
        response_class=FileResponse,
        responses={200: {"content": {"application/octet-stream": {}}}},
    )
    def preview(
        digest: Digest,
        snapshot_id: Digest | None = None,
        accession: str | None = None,
        asset_id: str | None = None,
    ):
        asset, _content, _snapshot = licensed_source(
            service.corpus, digest, snapshot_id, accession, asset_id
        )
        return _file_response(
            settings.object_directory / digest, asset["media_type"], digest, asset["file_name"]
        )

    @router.get("/assets/{digest}/frames/{frame_index}")
    def frame(
        digest: Digest,
        frame_index: Annotated[int, Field(ge=0, le=10000)],
        snapshot_id: Digest | None = None,
        accession: str | None = None,
        asset_id: str | None = None,
    ):
        result, _path = service.frame(digest, frame_index, snapshot_id, accession, asset_id)
        return result

    @router.get(
        "/assets/{digest}/frames/{frame_index}/image",
        response_class=FileResponse,
        responses={200: {"content": {"image/png": {}}}},
    )
    def frame_image(
        digest: Digest,
        frame_index: Annotated[int, Field(ge=0, le=10000)],
        snapshot_id: Digest | None = None,
        accession: str | None = None,
        asset_id: str | None = None,
    ):
        result, path = service.frame(digest, frame_index, snapshot_id, accession, asset_id)
        return _file_response(
            path, "image/png", result["png_sha256"], f"{digest}-frame-{frame_index}.png"
        )

    def submit(method: str, parameters: dict, snapshot: str, request: Request, response: Response):
        from .methods import METHODS, MethodCall

        if method not in METHODS:
            raise HTTPException(503, "The calibrated media method is not registered in this build.")
        METHODS[method].inputs.model_validate(parameters)
        receipt = request.cookies.get("nova_browser_receipt") or secrets.token_urlsafe(32)
        call = MethodCall(method=method, parameters=parameters)
        result = jobs.create_job(
            settings.database_url,
            snapshot,
            kind="registered_analysis",
            inputs=call.model_dump(mode="json"),
            receipt=receipt,
            idempotency_key=request.headers.get("Idempotency-Key"),
        )
        response.set_cookie(
            "nova_browser_receipt",
            receipt,
            httponly=True,
            secure=request.url.scheme == "https",
            samesite="strict",
            max_age=86400,
        )
        response.headers["Cache-Control"] = "no-store"
        return result

    @router.post("/media/measure", status_code=202)
    def measure(inputs: MediaMeasurement, request: Request, response: Response):
        asset, content, snapshot = licensed_source(
            service.corpus,
            inputs.source_sha256,
            inputs.snapshot_id,
            inputs.accession,
            inputs.asset_id,
        )
        if inputs.measurement.context.source_snapshot != snapshot or not any(
            reference.asset_sha256 == inputs.source_sha256
            for reference in inputs.measurement.context.sources
        ):
            raise HTTPException(
                422, "Measurement context must anchor the selected original source and snapshot."
            )
        provenance = {
            "asset": asset,
            "snapshot_id": snapshot,
            "source_sha256": inputs.source_sha256,
        }
        if asset["media_type"] == "video/mp4":
            if inputs.frame_index is None:
                raise HTTPException(422, "Select one original video frame explicitly.")
            frame, path = service.frame(
                inputs.source_sha256,
                inputs.frame_index,
                snapshot,
                inputs.accession,
                inputs.asset_id,
            )
            require_source_axis_calibration(inputs.measurement.calibration, frame)
            content = path.read_bytes()
            provenance["frame"] = frame
        elif inputs.frame_index is not None:
            raise HTTPException(422, "A still image does not have a video-frame index.")
        expected = sha256(content).hexdigest()
        if inputs.measurement.expected_sha256 != expected:
            raise HTTPException(
                409, "Measurement parameters belong to different frozen image/frame bytes."
            )
        encoded = base64.b64encode(content).decode()
        parameters = MediaImageInput(
            image_base64=encoded, measurement=inputs.measurement, provenance=provenance
        ).model_dump(mode="json")
        return submit("image-roi", parameters, snapshot, request, response)

    @router.post("/media/pixel-trace", status_code=202)
    def pixel_trace(inputs: PixelTraceCall, request: Request, response: Response):
        snapshot = inputs.request.context.source_snapshot
        if snapshot is None:
            raise HTTPException(
                422, "A frozen source snapshot is required for this calibrated trace."
            )
        service.corpus.snapshot(snapshot)
        source_hashes = {point.source_sha256 for point in inputs.request.points}
        if len(source_hashes) > 256:
            raise HTTPException(422, "The selected trace exceeds the bounded source count.")
        anchored_hashes = {reference.asset_sha256 for reference in inputs.request.context.sources}
        if not source_hashes <= anchored_hashes:
            raise HTTPException(
                422, "Every selected trace source must be anchored in the supplied frozen context."
            )
        for digest in source_hashes:
            # Resolve a public source identity rather than accepting a raw filesystem ID.
            asset, _content, _snapshot = licensed_source(
                service.corpus, digest, snapshot, None, None
            )
            if (
                asset["media_type"] == "video/mp4"
                and inputs.request.calibration.metres_per_pixel is not None
            ):
                frame, _path = service.frame(digest, 0, snapshot)
                require_source_axis_calibration(inputs.request.calibration, frame)
        return submit(
            "pixel-trace", inputs.request.model_dump(mode="json"), snapshot, request, response
        )

    return router


if __name__ == "__main__":
    _child_main()

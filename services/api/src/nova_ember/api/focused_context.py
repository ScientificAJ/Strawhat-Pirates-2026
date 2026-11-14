"""Resolve explicitly focused views and private artifacts from authoritative stored bytes."""

import json
from hashlib import sha256

from nova_ember.contracts.research import FocusedView, SelectedArtifact

from . import jobs
from .artifacts import ChartSpec, QuerySpec, execute_query, private_directory, validate_chart
from .config import Settings
from .database import connect
from .repository import Corpus


def resolve_focused_view(corpus: Corpus, snapshot_id: str, selected: FocusedView) -> dict:
    if selected.kind == "query":
        query = QuerySpec.model_validate(selected.spec)
        if query.snapshot_id != snapshot_id:
            raise ValueError("Focused query belongs to another frozen context snapshot.")
        data = execute_query(corpus, query)
        configuration = query.model_dump(mode="json")
        content = {"data": {key: value for key, value in data.items() if key != "query"}}
    else:
        chart = ChartSpec.model_validate(selected.spec)
        if chart.query.snapshot_id != snapshot_id:
            raise ValueError("Focused chart belongs to another frozen context snapshot.")
        result = validate_chart(corpus, chart)
        data, plot = result["data"], result["plot"]
        configuration = chart.model_dump(mode="json")
        # Browser labels/configuration remain context, not additional scientific values.
        content = {
            "data": {key: value for key, value in data.items() if key != "query"},
            "plotted_values": plot["rows"],
            "inputs": {"display_transformations": plot["transformations"]},
            "uncertainty_interpretation": result["uncertainty_interpretation"],
            "uncertainty_details": {
                key: value
                for key, value in (result["uncertainty_details"] or {}).items()
                if key != "input_query"
            },
        }
    return {
        "configuration": configuration,
        "content": content,
        "source": {**data["asset"], "snapshot_id": snapshot_id},
        "limitations": data.get("limitations", []),
        "status": "complete" if data["values"] else "unavailable",
    }


def resolve_selected_artifact(
    settings: Settings, snapshot_id: str, selected: SelectedArtifact, receipt_sha256: str
) -> dict:
    if not selected.consent_to_model:
        raise ValueError("Selected private artifacts require explicit model-sharing consent.")
    with connect(settings.database_url) as connection:
        row = connection.execute(
            """SELECT artifact.*,job.snapshot_id AS job_snapshot,job.status AS job_status
               FROM private_artifacts AS artifact JOIN jobs AS job ON job.id=artifact.job_id
               WHERE artifact.id=%s AND job.id=%s AND job.receipt_sha256=%s
               AND job.expires_at>now()
               AND job.status IN ('running','succeeded','failed','canceled')""",
            (str(selected.artifact_id), str(selected.job_id), receipt_sha256),
        ).fetchone()
    if row is None:
        raise jobs.JobNotFound("The selected private artifact is absent, unowned or expired.")
    if row["job_snapshot"] != snapshot_id or row["provenance"].get("snapshot_id") != snapshot_id:
        raise ValueError("Selected private artifact belongs to another frozen context snapshot.")
    if row["sha256"] != selected.expected_sha256:
        raise ValueError("Selected private artifact checksum differs from its frozen reference.")
    path = private_directory(settings.object_directory, str(selected.job_id)) / row["sha256"]
    if path.is_symlink() or not path.is_file() or path.stat().st_size != row["byte_size"]:
        raise ValueError("Private artifact bytes differ from their recorded length.")
    content = path.read_bytes()
    if sha256(content).hexdigest() != row["sha256"]:
        raise ValueError("Private artifact bytes fail their recorded checksum.")
    if row["media_type"] == "application/json":
        if len(content) > 1024 * 1024:
            raise ValueError("Select an artifact within the one MiB structured-context profile.")
        try:
            payload = json.loads(content)
        except (ValueError, RecursionError):
            raise ValueError("Private artifact JSON is invalid or excessively nested.") from None
    elif row["media_type"].startswith("text/"):
        if len(content) > 24000:
            raise ValueError("Select a smaller text artifact for model context.")
        payload = {"original_text": content.decode("utf-8")}
    else:
        payload = {
            "status": "binary_metadata_only",
            "reason": "Use separately consented image context or the source's typed view.",
        }
    return {
        "artifact_id": str(selected.artifact_id),
        "job_id": str(selected.job_id),
        "sha256": row["sha256"],
        "byte_size": row["byte_size"],
        "snapshot_id": snapshot_id,
        "media_type": row["media_type"],
        "file_name": row["file_name"],
        "provenance": row["provenance"],
        "publication_status": "complete" if row["job_status"] == "succeeded" else "incomplete",
        "payload": payload,
        "origin": "private_analysis_artifact",
    }

"""An investigation visualization prepares the retained original, without model inputs."""

import asyncio
import json
from hashlib import sha256
from pathlib import Path
from types import SimpleNamespace
from typing import cast

import pytest
from nova_ember.api.discovery import Discovery
from nova_ember.api.repository import Corpus, MissingSource, public_asset, public_investigation
from nova_ember.api.research import retained_evidence_answer, verify_answer
from nova_ember.api.research_tools import ResearchTools
from nova_ember.api.scientific_toolbox import ScientificToolbox, ScientificToolCall
from nova_ember.contracts.research import ResearchAnswer, WorkspaceContext
from nova_ember.evidence.contracts import EvidenceAnchor

FIXTURES = Path(__file__).parent / "fixtures"
BASS_IMAGE = "aa0bf2369cf77833e95e353519e634ab5cbb5b2918db08849e9bde82267aade3"


@pytest.fixture
def source_tools(tmp_path):
    manifest = json.loads((FIXTURES / "nasa-psi/snapshot.json").read_bytes())
    media = json.loads((FIXTURES / "nasa-psi-media/snapshot.json").read_bytes())
    files = {asset["id"]: FIXTURES / "nasa-psi" / asset["path"] for asset in manifest["assets"]}
    files.update(
        {asset["id"]: FIXTURES / "nasa-psi-media" / asset["path"] for asset in media["assets"]}
    )
    manifest["assets"].extend(media["assets"])
    snapshot_id = sha256(json.dumps(manifest, sort_keys=True).encode()).hexdigest()

    class RetainedCorpus:
        settings = SimpleNamespace(object_directory=tmp_path / "objects")

        def snapshot(self, selected=None):
            if selected not in (None, snapshot_id):
                raise MissingSource("Different frozen test snapshot.")
            return {"snapshot_id": snapshot_id, "manifest": manifest}

        def investigation(self, accession, selected=None):
            self.snapshot(selected)
            record = next(
                item for item in manifest["investigations"] if item["accession"] == accession
            )
            return {
                **public_investigation(record),
                "assets": [
                    public_asset(a) for a in manifest["assets"] if a["accession"] == accession
                ],
            }

        def asset(self, digest, selected=None, *, accession=None, asset_id=None):
            self.snapshot(selected)
            matches = [
                asset
                for asset in manifest["assets"]
                if asset["sha256"] == digest
                and (accession is None or asset["accession"] == accession)
                and (asset_id is None or asset["id"] == asset_id)
            ]
            if len(matches) != 1:
                raise MissingSource("Choose an exact retained test asset.")
            return public_asset(matches[0])

        def asset_bytes(self, asset):
            content = files[asset["id"]].read_bytes()
            assert sha256(content).hexdigest() == asset["sha256"]
            return content

    return ResearchTools(
        cast(Corpus, RetainedCorpus()),
        WorkspaceContext(snapshot_id=snapshot_id, context_version="source-visualization"),
    )


def test_bass_fire_visualization_needs_only_investigation_and_preserves_exact_original(
    source_tools,
):
    tool = next(t for t in source_tools.registry() if t.name == "prepare_source_visualization")
    fact = json.loads(asyncio.run(tool.on_invoke_tool(None, '{"accession":"PSI-25"}')))
    assert source_tools.calls == 1
    assert [action["tool"] for action in source_tools.actions] == ["prepare_source_visualization"]
    assert fact["origin"] == "source_media"
    content = fact["content"]
    assert content["artifact_type"] == "source_media_visualization"
    assert content["status"] == "prepared"
    assert content["title"] == "BASS-II · NASA source image"
    assert content["asset"]["sha256"] == BASS_IMAGE
    assert content["asset"]["byte_size"] == 37525
    assert content["asset"]["media_type"] == "image/jpeg"
    assert content["metadata"]["streams"][0]["width"] == 1200
    assert content["metadata"]["streams"][0]["height"] == 797
    assert content["media_origin"] == "original_source_bytes"
    assert content["source_run_association"] is None
    assert content["limitations"] == [
        "Representative source image; no individual test is identified."
    ]
    anchor = EvidenceAnchor.model_validate(content["anchor"])
    resolved = Discovery(source_tools.corpus).read_anchor(anchor)
    assert resolved["asset"]["sha256"] == BASS_IMAGE
    assert resolved["content_kind"] == "source_image"
    assert "image_base64" not in json.dumps(fact)
    fallback = retained_evidence_answer(source_tools, "Create a visualization of BASS-II fire.")
    assert fallback["claims"][0]["statement"] == "Prepared BASS-II · NASA source image below."
    assert fallback["claims"][0]["fact_ids"] == [fact["id"]]


def test_visualization_cannot_substitute_another_investigations_image_or_gain_capabilities(
    source_tools,
):
    tool = next(t for t in source_tools.registry() if t.name == "prepare_source_visualization")
    failure = json.loads(
        asyncio.run(
            tool.on_invoke_tool(
                None, json.dumps({"accession": "PSI-26", "asset_sha256": BASS_IMAGE})
            )
        )
    )
    assert failure["status"] == "unsupported"
    assert not source_tools.facts
    source_tools.capabilities = frozenset({"sources"})
    assert "prepare_source_visualization" not in {tool.name for tool in source_tools.registry()}
    toolbox = ScientificToolbox(
        source_tools.corpus, source_tools.context, capabilities=source_tools.capabilities
    )
    with pytest.raises(ValueError, match="does not permit"):
        toolbox.dispatch(
            ScientificToolCall(
                name="prepare_source_visualization", parameters={"accession": "PSI-25"}
            )
        )


def test_media_display_statement_needs_no_boilerplate_but_cannot_claim_a_measurement(source_tools):
    tool = next(t for t in source_tools.registry() if t.name == "prepare_source_visualization")
    fact = json.loads(asyncio.run(tool.on_invoke_tool(None, '{"accession":"PSI-25"}')))
    answer = ResearchAnswer(
        title="BASS-II fire visualization",
        claims=[
            {
                "statement": "The retained NASA flame image is ready below.",
                "origin": "model_interpretation",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
            {
                "statement": "The image measured flame temperature of 1200 K.",
                "origin": "source_summary",
                "fact_ids": [fact["id"]],
                "limitations": [],
            },
        ],
        contradictions=[],
        next_actions=[],
        limitations=[],
    )
    checked = verify_answer(answer, source_tools)
    assert len(checked["claims"]) == 1
    assert checked["claims"][0]["limitations"] == []
    assert checked["limitations"] == []
    assert len(checked["withheld_claims"]) == 1

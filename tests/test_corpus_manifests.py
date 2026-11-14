"""A bounded capture resumes failures and never publishes partial collection state."""

import json
from hashlib import sha256

import httpx
import pytest
from nova_ember.adapters.manifests import acquire_manifests, checked_json, load_collection
from nova_ember.adapters.psi import PsiClient


def source():
    return {
        "investigations": [
            {
                "accession": f"PSI-{number}",
                "version": 1,
                "metadata_sha256": str(number) * 64,
                "doi": f"10.0000/{number}",
                "license": "CC0-1.0",
            }
            for number in (1, 2)
        ]
    }


def test_failed_manifest_keeps_previous_complete_current_and_resumes(tmp_path):
    failures = {"PSI-2"}
    calls = []

    def handler(request):
        accession = json.loads(request.content)["studyId"]
        calls.append(accession)
        if accession in failures:
            return httpx.Response(503)
        return httpx.Response(
            200, json={"files": [{"key": accession + "/source.csv", "directory": False}]}
        )

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = PsiClient(http)
        failed = acquire_manifests(client, source(), "a" * 64, tmp_path)
        assert not failed["complete"]
        assert not (tmp_path / "current.json").exists()
        assert load_collection(tmp_path, "a" * 64) is None
        assert calls == ["PSI-1", "PSI-2"]
        failures.clear()
        completed = acquire_manifests(client, source(), "a" * 64, tmp_path)
        assert completed["complete"]
        assert calls == ["PSI-1", "PSI-2", "PSI-2"]
        retained = load_collection(tmp_path, "a" * 64)
        assert retained["collection_id"] == completed["collection_id"]
        assert retained["scientific_asset_bytes_acquired"] == 0
        failures.add("PSI-1")
        another = acquire_manifests(client, source(), "a" * 64, tmp_path, resume=False)
        assert not another["complete"]
        assert load_collection(tmp_path, "a" * 64)["collection_id"] == retained["collection_id"]
        assert load_collection(tmp_path, "b" * 64) is None


def test_retained_manifest_checksum_and_path_escape_are_rejected(tmp_path):
    content = b'{"files":[]}'
    path = tmp_path / "source.json"
    path.write_bytes(content)
    reference = {
        "path": "source.json",
        "sha256": sha256(content).hexdigest(),
        "byte_size": len(content),
    }
    assert checked_json(tmp_path, reference) == {"files": []}
    path.write_bytes(b'{"files":[{}]}')
    with pytest.raises(ValueError, match="frozen reference"):
        checked_json(tmp_path, reference)
    with pytest.raises(ValueError, match="inside"):
        checked_json(tmp_path, {**reference, "path": "../outside.json"})

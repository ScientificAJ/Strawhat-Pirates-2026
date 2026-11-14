import hashlib
import json
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from nova_ember.adapters.flex import FLEX_HEADERS, summarize_flex
from nova_ember.adapters.psi import (
    PsiClient,
    SourceUnavailable,
    catalog_records,
    load_snapshot,
    manifest_files,
    parse_csv_bytes,
    read_csv_asset,
    resolver_url,
    validate_download_url,
)

FIXTURES = Path(__file__).parent / "fixtures" / "nasa-psi"
AUDITED_TABLE_HASHES = {
    "PSI-20_Experimental table_ACME BRE.csv": (
        "4aa5d3f98708ceacced5c620d46858b9965f8d4d941b203229f46467d53e5ab7"
    ),
    "PSI-25_Experimental table_BASS-II.csv": (
        "71e792bf6b5fb5ea620c5dd70fbbac05515992e12aefcf5dff47312caa48c042"
    ),
    "PSI-39_Experimental table_CFI.csv": (
        "fb898e28762353aa132c16b886dbd207a024b1dd3c9bed5928d70d8036d2ec7e"
    ),
    "PSI-47_Experimental table_DAFT.csv": (
        "d9d1a436c6e7bbc410b433e04575fe7dedaff763b5237d688089929b7393b5c0"
    ),
    "PSI-68_Experimental table_Flex2.csv": (
        "cc57ad1bd9977aa13e7ac6c3aa618303012686e232b36c052c6a9f1a74e5f528"
    ),
    "PSI-69_Experimental table_FLEX.csv": (
        "37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"
    ),
    "PSI-99_Experimental table_SAFFIRE-2.csv": (
        "3c24390b9ef86f3d1ebaab911a1a3cc95a8759aebf42062371370e6d4b31b8ac"
    ),
    "PSI-101_Experimental table_SAME-R.csv": (
        "87164b7dc9168a4273c159f7a9f23699afbd06ad97b77974377e79b9bf8a3bef"
    ),
    "PSI-159_Experimental table_CFI-G_Normal Flames.csv": (
        "d95a621c3fbd27d204dd32ed29fa17d68f2b779d6a523cde8479ed7ebaa5251a"
    ),
    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": (
        "d4d44f8b9896936728748e34d1b6ad0812032a92fa5289599b708c138e3a9b39"
    ),
}


def test_csv_preserves_values_and_physical_lines():
    table = parse_csv_bytes(b'name,value\r\n"first\r\ncontinued",0\r\n,\r\nlast,\r\n')
    assert table.headers == ("name", "value")
    assert table.rows[0].cells == ("first\r\ncontinued", "0")
    assert table.rows[0].row_number == 2
    assert table.rows[0].line_end == 3
    assert table.rows[1].row_number == 5
    assert table.rows[1].cells == ("last", "")
    assert table.empty_record_count == 1
    assert table.physical_line_count == 5


def test_encoding_is_explicit_and_not_repaired():
    content = b"quantity,value\r\n\xb5m,0\r\n"
    with pytest.raises(UnicodeDecodeError):
        parse_csv_bytes(content)
    assert parse_csv_bytes(content, "cp1252").rows[0].cells == ("µm", "0")
    with pytest.raises(ValueError, match="encoding"):
        parse_csv_bytes(content, "latin-1")


def test_unknown_flex_label_and_blank_value_survive():
    header = ",".join(FLEX_HEADERS)
    cells = ["7", "source-7", *("" for _ in range(12)), "Undocumented stop"]
    table = parse_csv_bytes((header + "\n" + ",".join(cells) + "\n").encode())
    summary = summarize_flex(table)
    assert summary["counts"] == [{"label": "Undocumented stop", "count": 1}]
    assert summary["unrecognized_labels"] == ["Undocumented stop"]
    assert summary["independent_run_count"] is None
    assert table.rows[0].cells[12] == ""
    with pytest.raises(ValueError, match="mapping requires review"):
        summarize_flex(replace(table, headers=("changed", *table.headers[1:])))


def test_catalog_does_not_accept_partial_or_wrong_shape():
    complete = {
        "timed_out": False,
        "hits": {"total": 1, "hits": [{"_source": {"Accession": "PSI-69"}}]},
    }
    assert catalog_records(json.dumps(complete).encode()) == [{"Accession": "PSI-69"}]
    complete["hits"]["total"] = 2
    with pytest.raises(SourceUnavailable, match="incomplete"):
        catalog_records(json.dumps(complete).encode())
    with pytest.raises(SourceUnavailable, match="structure changed"):
        catalog_records(b"{}")


@pytest.mark.parametrize(
    "destination",
    [
        "http://psi.nasa.gov/file",
        "https://127.0.0.1/file",
        "https://psi.nasa.gov.attacker.test/file",
        "https://user@psi.nasa.gov/file",
        "https://psi.nasa.gov:8443/file",
        "https://another-bucket.s3.amazonaws.com/file",
    ],
)
def test_download_destination_must_match_observed_hosts(destination):
    with pytest.raises(SourceUnavailable, match="destination"):
        validate_download_url(destination)


def test_resolver_quotes_name_and_rejects_paths():
    url = resolver_url("PSI-69", "name with space.csv", 1)
    assert "file=name+with+space.csv" in url
    for name in ["../file", "file\x00.csv", "folder\\file"]:
        with pytest.raises(ValueError):
            resolver_url("PSI-69", name, 1)


def test_download_keeps_stable_resolver_not_temporary_destination():
    observed = []

    def respond(request):
        observed.append(request.url.host)
        if request.url.host == "psi.nasa.gov":
            return httpx.Response(200, text="https://psi-repo-prod.s3.amazonaws.com/reviewed.csv")
        return httpx.Response(200, content=b"column\nvalue\n")

    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        capture = PsiClient(http).download("PSI-69", "reviewed.csv", 1)
    assert observed == ["psi.nasa.gov", "psi-repo-prod.s3.amazonaws.com"]
    assert capture.content == b"column\nvalue\n"
    assert capture.source_url == resolver_url("PSI-69", "reviewed.csv", 1)


def test_download_rejects_host_redirect_and_oversized_or_html_data(monkeypatch):
    def respond(request):
        if request.url.host == "psi.nasa.gov":
            return httpx.Response(200, text="https://psi-repo-prod.s3.amazonaws.com/reviewed.csv")
        return httpx.Response(302, headers={"Location": "https://127.0.0.1/private"})

    with httpx.Client(transport=httpx.MockTransport(respond)) as http:
        with pytest.raises(SourceUnavailable, match="request failed"):
            PsiClient(http).download("PSI-69", "reviewed.csv", 1)

    def large_response(request):
        if request.url.host == "psi.nasa.gov":
            return httpx.Response(200, text="https://psi-repo-prod.s3.amazonaws.com/reviewed.csv")
        return httpx.Response(200, content=b"too large")

    monkeypatch.setattr("nova_ember.adapters.psi.MAX_ASSET_BYTES", 4)
    with httpx.Client(transport=httpx.MockTransport(large_response)) as http:
        with pytest.raises(SourceUnavailable, match="allowed size"):
            PsiClient(http).download("PSI-69", "reviewed.csv", 1)


def test_frozen_sources_reproduce_audited_flex_counts_and_hash():
    snapshot = load_snapshot(FIXTURES)
    assert snapshot["total_catalog_records"] == 133
    assert len(snapshot["investigations"]) == 24
    assert snapshot["declared_total_bytes"] == 13_496_771_103_733
    asset = next(item for item in snapshot["assets"] if item["accession"] == "PSI-69")
    assert asset["sha256"] == "37c88ce8ae9391b7544ff630a45ce87543d04d317cdbfbed104fe7d5c27e1b96"
    summary = summarize_flex(read_csv_asset(FIXTURES, asset))
    assert summary["total_rows"] == 274
    assert summary["counts"] == [
        {"label": "Completion", "count": 27},
        {"label": "Disruption", "count": 61},
        {"label": "Extinction", "count": 186},
    ]
    assert summary["source_rows"][0] == {
        "row_number": 2,
        "label": "Disruption",
        "test_number": "1",
        "identifier": "20CAL08",
    }
    assert summary["independent_run_count"] is None
    assert summary["unrecognized_labels"] == []


def test_raw_tables_and_manifests_remain_separate_from_interpretation():
    snapshot = load_snapshot(FIXTURES)
    assets = {asset["file_name"]: asset for asset in snapshot["assets"]}
    inverse = read_csv_asset(
        FIXTURES, assets["PSI-159_Experimental table_CFI-G_Inverse Flames.csv"]
    )
    assert len(inverse.rows) == 154
    assert inverse.empty_record_count == 861
    bass = read_csv_asset(FIXTURES, assets["PSI-25_Experimental table_BASS-II.csv"])
    assert len(bass.rows) == 129
    assert len(bass.headers) == 17
    manifest = next(item for item in snapshot["manifests"] if item["accession"] == "PSI-69")
    assert len(manifest_files((FIXTURES / manifest["path"]).read_bytes())) == 6555


@pytest.mark.parametrize("file_name,expected_hash", AUDITED_TABLE_HASHES.items())
def test_each_downloaded_table_matches_the_independent_audit(file_name, expected_hash):
    content = (FIXTURES / "assets" / file_name).read_bytes()
    assert hashlib.sha256(content).hexdigest() == expected_hash


def test_changed_manifest_structure_and_duplicate_catalog_are_refused():
    with pytest.raises(SourceUnavailable, match="manifest entry"):
        manifest_files(b'{"files":["not a record"]}')
    with pytest.raises(SourceUnavailable, match="children"):
        manifest_files(b'{"files":[{"files":{}}]}')
    duplicate = {
        "hits": {
            "total": 2,
            "hits": [{"_source": {"Accession": "PSI-69"}}] * 2,
        },
    }
    with pytest.raises(SourceUnavailable, match="duplicate"):
        catalog_records(json.dumps(duplicate).encode())


def test_changed_local_input_is_rejected(tmp_path):
    content = b"changed"
    (tmp_path / "file.json").write_bytes(content)
    index = {
        "schema_version": 1,
        "catalog_response": {
            "path": "file.json",
            "sha256": hashlib.sha256(b"original").hexdigest(),
        },
        "investigations": [],
        "assets": [],
        "manifests": [],
    }
    (tmp_path / "snapshot.json").write_text(json.dumps(index))
    with pytest.raises(ValueError, match="checksum mismatch"):
        load_snapshot(tmp_path)

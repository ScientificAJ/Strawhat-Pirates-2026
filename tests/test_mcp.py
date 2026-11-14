"""Real public MCP requests cannot reach private operations or arbitrary query inputs."""

import os
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.config import Settings
from nova_ember.api.main import create_app
from nova_ember.api.seed import seed

pytestmark = pytest.mark.integration


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    url = os.environ.get("NOVA_TEST_DATABASE_URL")
    if not url:
        pytest.skip("NOVA_TEST_DATABASE_URL is required.")
    original = Settings.from_environment()
    if url == original.database_url:
        raise RuntimeError("Use a separate test database.")
    settings = replace(
        original, database_url=url, object_directory=tmp_path_factory.mktemp("mcp-objects")
    )
    seed(settings)
    return TestClient(create_app(settings))


def rpc(client, method, params=None, **kwargs):
    return client.post(
        "/mcp", json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}, **kwargs
    )


def test_mcp_negotiation_discovery_and_real_source_lookup(client):
    initial = rpc(
        client,
        "initialize",
        {
            "protocolVersion": "2025-11-25",
            "capabilities": {},
            "clientInfo": {"name": "research-test", "version": "1"},
        },
    )
    assert initial.status_code == 200
    assert initial.json()["result"]["protocolVersion"] == "2025-11-25"
    tools = rpc(client, "tools/list").json()["result"]["tools"]
    assert all(tool["annotations"]["readOnlyHint"] for tool in tools)
    assert "search_investigations" in {tool["name"] for tool in tools}
    found = rpc(
        client, "tools/call", {"name": "get_investigation", "arguments": {"accession": "PSI-69"}}
    )
    result = found.json()["result"]
    assert result["isError"] is False
    assert result["structuredContent"]["accession"] == "PSI-69"
    assert result["structuredContent"]["doi"] == "10.60555/mbq8-0451"
    assert client.get("/mcp").status_code == 405
    notification = client.post(
        "/mcp", json={"jsonrpc": "2.0", "method": "notifications/initialized"}
    )
    assert notification.status_code == 202 and notification.content == b""


def test_mcp_rejects_write_methods_private_parameters_and_foreign_browser_origin(client):
    assert (
        rpc(client, "tools/call", {"name": "cancel_job", "arguments": {}}).json()["error"]["code"]
        == -32602
    )
    invalid = rpc(
        client, "tools/call", {"name": "get_snapshot", "arguments": {"job_receipt": "private"}}
    )
    assert invalid.json()["result"]["isError"] is True
    assert (
        rpc(client, "tools/list", headers={"Origin": "https://unrelated.example"}).status_code
        == 403
    )
    assert (
        client.post("/mcp", content=b"[]", headers={"Content-Type": "application/json"}).status_code
        == 400
    )
    assert (
        client.post(
            "/mcp", content=b"x" * 65537, headers={"Content-Type": "application/json"}
        ).status_code
        == 413
    )


def test_mcp_evidence_uses_the_same_frozen_spans_as_the_scientific_api(client):
    query = {"text": "contaminated", "accessions": ["PSI-101"]}
    ordinary = client.post("/v1/evidence/search", json=query).json()
    called = rpc(client, "tools/call", {"name": "search_evidence", "arguments": query}).json()[
        "result"
    ]
    assert called["isError"] is False
    assert called["structuredContent"] == ordinary
    assert ordinary["items"]
    match = ordinary["items"][0]
    read = rpc(
        client, "tools/call", {"name": "read_evidence", "arguments": match["anchor"]}
    ).json()["result"]
    assert read["isError"] is False
    assert read["structuredContent"]["text"] == match["text"]
    denied = rpc(
        client,
        "tools/call",
        {"name": "read_evidence", "arguments": {**match["anchor"], "receipt": "unrelated"}},
    ).json()["result"]
    assert denied["isError"] is True

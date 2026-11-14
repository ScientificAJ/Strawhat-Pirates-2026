"""HTTP boundary checks that never require a database or paid integration."""

import pytest
from fastapi.testclient import TestClient
from nova_ember.api.main import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def valid_input():
    return {
        "oxygen_percent": 30,
        "absolute_pressure": 10.2,
        "pressure_unit": "psia",
        "fraction_basis": "mole",
    }


def test_worked_example_over_http(client):
    response = client.post("/v1/calculations/oxygen-partial-pressure", json=valid_input())
    assert response.status_code == 200
    assert response.json()["value"] == pytest.approx(3.06, rel=1e-14)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("oxygen_percent", 300),
        ("oxygen_percent", True),
        ("absolute_pressure", 0),
        ("pressure_unit", "psig"),
        ("fraction_basis", "mass"),
        ("oxygen_percent", "30"),
    ],
)
def test_invalid_or_ambiguous_inputs_are_rejected(client, field, value):
    inputs = {**valid_input(), field: value}
    response = client.post("/v1/calculations/oxygen-partial-pressure", json=inputs)
    assert response.status_code == 422
    assert "value" not in response.json()


def test_missing_fraction_basis_is_rejected(client):
    inputs = valid_input()
    inputs.pop("fraction_basis")
    assert client.post("/v1/calculations/oxygen-partial-pressure", json=inputs).status_code == 422


def test_validation_does_not_echo_private_input(client):
    response = client.post(
        "/v1/calculations/oxygen-partial-pressure",
        json={**valid_input(), "unrelated_private_note": "private-text-must-not-be-echoed"},
    )
    assert response.status_code == 422
    assert "private-text-must-not-be-echoed" not in response.text


def test_browser_cannot_submit_paid_or_compute_work_from_another_origin(client):
    response = client.post("/v1/jobs", headers={"Origin": "https://unrelated.example"})
    assert response.status_code == 403


def test_identical_investigations_are_not_a_comparison(client):
    response = client.post("/v1/comparisons", json={"investigation_ids": ["PSI-69", "PSI-69"]})
    assert response.status_code == 422


def test_source_identifier_cannot_be_a_path(client):
    assert client.get("/v1/assets/not-a-hash/table").status_code == 422


@pytest.mark.parametrize("payload", ['{"oxygen_percent": NaN}', '{"oxygen_percent": Infinity}'])
def test_nonfinite_json_is_rejected_without_serializing_nan_in_error(client, payload):
    response = client.post(
        "/v1/calculations/oxygen-partial-pressure",
        content=payload,
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422

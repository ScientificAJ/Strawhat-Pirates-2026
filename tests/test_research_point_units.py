"""Registered analytical point channels retain their authoritative units."""

from copy import deepcopy
from types import SimpleNamespace

from nova_ember.analysis.visualization import (
    DropletVisualizationRequest,
    calculate_droplet_visualization,
)
from nova_ember.api.research import verify_answer
from nova_ember.contracts.research import EvidenceFact, ResearchAnswer


def result():
    return calculate_droplet_visualization(
        DropletVisualizationRequest(
            initial_diameter_mm=2.0,
            burning_constant_mm2_s=0.5,
            sample_count=3,
            context={
                "input_origin": "analyst_input",
                "sources": [
                    {
                        "source_id": "Known-answer fixture",
                        "locator": "D0=2 mm, K=0.5 mm^2/s",
                    }
                ],
            },
        )
    ).model_dump(mode="json")


def check(content, statements, *, origin="calculated"):
    fact = EvidenceFact(
        id="registered-trajectory",
        origin="deterministic_calculation",
        label="Known-answer model",
        content=content,
        sources=[],
        limitations=["An assumed analytical case, not measurements."],
    )
    return verify_answer(
        ResearchAnswer(
            title="Known-answer trajectory",
            claims=[
                {"statement": statement, "origin": origin, "fact_ids": [fact.id], "limitations": []}
                for statement in statements
            ],
            contradictions=[],
            next_actions=[],
            limitations=[],
        ),
        SimpleNamespace(facts={fact.id: fact}),
    )


def test_known_initial_midpoint_and_zero_endpoint_values_have_exact_channel_units():
    checked = check(
        result(),
        [
            "At model time 0 s, the calculated diameter is 2 mm.",
            "At model time 4 s, the calculated diameter is 1.41421356237 mm "
            "and its square is 2 mm².",
            "At model time 8 s, the calculated diameter is 0 mm.",
            "At model time 4 s, the calculated diameter is 1.41421356237 s.",
        ],
    )
    assert len(checked["claims"]) == 3
    assert len(checked["withheld_claims"]) == 1
    assert checked["claims"][2]["numeric_support"][-1]["stored_value"] == "0.0"
    assert checked["claims"][1]["numeric_support"][1]["rule"] == "nearest_half_even"


def test_supplied_unit_map_cannot_relabel_registered_point_channels():
    content = deepcopy(result())
    content["units"]["diameter_mm"] = "K"
    checked = check(
        content,
        [
            "At model time 4 s, the calculated diameter is 1.41421356237 mm.",
            "At model time 4 s, the calculated diameter is 1.41421356237 K.",
        ],
    )
    assert len(checked["claims"]) == 1
    assert len(checked["withheld_claims"]) == 1


def test_point_channel_projection_does_not_qualify_observations_or_unregistered_models():
    statement = "At model time 4 s, the midpoint diameter is 1.41421356237 mm."
    assert not check(result(), [statement], origin="source_summary")["claims"]
    content = result()
    content["model_id"] = "unregistered-source-like-configuration"
    assert not check(content, [statement])["claims"]

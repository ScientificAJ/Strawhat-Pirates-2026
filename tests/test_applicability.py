import pytest
from nova_ember.analysis.applicability import (
    CORE_COMPARISON_FIELDS,
    ComparisonRequest,
    RunProfile,
    compare_profiles,
    scenario_presets,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "profiles"}],
}


def profile(identifier, **updates):
    data = {
        "run_id": identifier,
        "independent_unit_id": identifier,
        "dependency_group_id": f"group-{identifier}",
        "conditions": {
            name: {
                "value": f"same-{name}",
                "status": "nominal",
                "source_locator": f"{identifier}:{name}",
            }
            for name in CORE_COMPARISON_FIELDS
        },
        "context": CONTEXT,
    }
    data.update(updates)
    return RunProfile.model_validate(data)


def test_complete_matched_profiles_need_a_pooling_protocol_and_known_units():
    first, second = profile("run1"), profile("run2")
    result = compare_profiles(ComparisonRequest(profiles=(first, second)))
    assert result.status == "matched"
    assert result.independent_unit_count == 2
    assert result.suitability["side_by_side"].startswith("supported")
    assert result.suitability["quantitative_pooling"] == "not_established"
    result = compare_profiles(
        ComparisonRequest(
            profiles=(first, second),
            pooling_protocol_reference="declared compatible-endpoint pooled analysis",
        )
    )
    assert result.suitability["quantitative_pooling"] == "eligible_for_declared_protocol"


def test_critical_endpoint_mismatch_blocks_pooling_even_with_shared_titles():
    data = profile("run2").model_dump()
    data["conditions"]["endpoint"]["value"] = "different physical endpoint"
    result = compare_profiles(
        ComparisonRequest(
            profiles=(profile("run1"), RunProfile.model_validate(data)),
            pooling_protocol_reference="protocol",
        )
    )
    assert result.status == "incompatible"
    assert result.suitability["quantitative_pooling"] == "not_established"
    assert result.suitability["side_by_side"].startswith("supported")
    assert (
        next(item for item in result.conditions if item.field == "endpoint").status
        == "incompatible"
    )


def test_absent_condition_is_unknown_not_a_match_or_automatic_exclusion():
    data = profile("run2").model_dump()
    del data["conditions"]["atmosphere"]
    result = compare_profiles(
        ComparisonRequest(profiles=(profile("run1"), RunProfile.model_validate(data)))
    )
    assert result.status == "unknown"
    assert (
        next(item for item in result.conditions if item.field == "atmosphere").values_by_run["run2"]
        is None
    )


def test_broad_atmosphere_match_cannot_hide_an_unknown_pressure_reference():
    first, second = profile("run1"), profile("run2").model_dump()
    second["conditions"].pop("pressure_reference")
    result = compare_profiles(
        ComparisonRequest(
            profiles=(first, RunProfile.model_validate(second)),
            pooling_protocol_reference="protocol",
        )
    )
    assert result.suitability["quantitative_pooling"] == "not_established"
    assert result.suitability["common_calculation"] == "not_established"
    assert (
        next(item for item in result.conditions if item.field == "pressure_reference").status
        == "unknown"
    )


def test_not_applicable_requires_a_source_and_question_specific_justification():
    data = profile("run1").model_dump()
    data["conditions"]["backing"] = {"status": "not_applicable"}
    with pytest.raises(ValidationError, match="domain justification"):
        RunProfile.model_validate(data)


def test_nominal_fan_setting_is_not_a_measured_flow():
    data = profile("run2").model_dump()
    data["conditions"]["flow"]["status"] = "measured"
    result = compare_profiles(
        ComparisonRequest(profiles=(profile("run1"), RunProfile.model_validate(data)))
    )
    assert result.status == "unresolved"
    assert next(item for item in result.conditions if item.field == "flow").status == "unresolved"


def test_same_numeric_concentration_with_different_reference_locations_is_unresolved():
    first = profile("run1").model_dump()
    second = profile("run2").model_dump()
    for data, location in [(first, "burner inlet"), (second, "chamber")]:
        data["conditions"]["atmosphere"] = {
            "value": 0.3,
            "unit": "1",
            "status": "measured",
            "source_locator": "gas sensor",
            "reference_basis": location,
        }
    result = compare_profiles(
        ComparisonRequest(
            profiles=(RunProfile.model_validate(first), RunProfile.model_validate(second))
        )
    )
    assert result.status == "unresolved"


def test_dependent_or_unknown_units_do_not_establish_independent_run_count():
    first = profile("run1")
    second = profile("run2", independent_unit_id="run1")
    result = compare_profiles(
        ComparisonRequest(profiles=(first, second), pooling_protocol_reference="protocol")
    )
    assert result.independent_unit_count is None
    assert result.suitability["quantitative_pooling"] == "not_established"


def test_shared_dependency_group_needs_an_explicit_correction_protocol():
    first = profile("run1", dependency_group_id="same-campaign")
    second = profile("run2", dependency_group_id="same-campaign")
    result = compare_profiles(
        ComparisonRequest(profiles=(first, second), pooling_protocol_reference="protocol")
    )
    assert result.suitability["quantitative_pooling"] == "not_established"


def test_omitting_core_scientific_fields_cannot_qualify_pooling():
    result = compare_profiles(
        ComparisonRequest(
            profiles=(profile("run1"), profile("run2")),
            rules=({"field": "endpoint"},),
            pooling_protocol_reference="protocol",
        )
    )
    assert result.status == "matched"
    assert result.suitability["quantitative_pooling"] == "not_established"


def test_nonzero_comparison_tolerance_needs_scientific_justification():
    with pytest.raises(ValidationError, match="justification"):
        ComparisonRequest(
            profiles=(profile("run1"), profile("run2")),
            rules=({"field": "flow", "absolute_tolerance": 0.01},),
        )


def test_presets_keep_unknown_atmospheres_unknown_and_example_hypothetical():
    presets = scenario_presets()
    assert len(presets) == 7
    assert all(
        preset.oxygen_percent is None for preset in presets if preset.status == "research_context"
    )
    illustrative = next(
        preset for preset in presets if preset.status == "hypothetical_research_example"
    )
    assert illustrative.oxygen_percent == 30.0
    assert illustrative.absolute_pressure == 10.2
    assert all(preset.gravity_m_per_s2 is None for preset in presets)


def test_marking_core_fields_noncritical_does_not_bypass_pooling_contract():
    second = profile("run2").model_dump()
    second["conditions"]["endpoint"]["value"] = "incompatible endpoint"
    rules = tuple({"field": name, "critical": False} for name in CORE_COMPARISON_FIELDS)
    result = compare_profiles(
        ComparisonRequest(
            profiles=(profile("run1"), RunProfile.model_validate(second)),
            rules=rules,
            pooling_protocol_reference="protocol",
        )
    )
    assert result.suitability["quantitative_pooling"] == "not_established"
    assert result.suitability["common_calculation"] == "not_established"

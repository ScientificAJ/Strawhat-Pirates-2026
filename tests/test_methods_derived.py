import math

import pytest
from nova_ember.analysis.derived import (
    DimensionlessRequest,
    OxygenConsumptionRequest,
    OxygenDensityRequest,
    dimensionless_number,
    oxygen_consumption_heat_release,
    oxygen_molar_density,
)
from pydantic import ValidationError

CONTEXT = {
    "input_origin": "synthetic_reference",
    "sources": [{"source_id": "reference", "locator": "equation"}],
}


def dimensionless(kind, **updates):
    data = {
        "kind": kind,
        "characteristic_length_m": 0.1,
        "velocity_m_per_s": 2.0,
        "density_kg_per_m3": 1.2,
        "dynamic_viscosity_pa_s": 1.8e-5,
        "diffusivity_m2_per_s": 2e-5,
        "chemical_timescale_s": 0.01,
        "gravity_m_per_s2": 9.81,
        "thermal_expansion_per_kelvin": 0.003,
        "temperature_difference_kelvin": 10.0,
        "property_temperature_kelvin": 300.0,
        "characteristic_scale_definition": "Reference length is the selected channel width",
        "property_reference": "known-answer synthetic properties",
        "approximation_justification": "Constant properties and Boussinesq buoyancy for this "
        "example",
        "context": CONTEXT,
    }
    data.update(updates)
    return DimensionlessRequest.model_validate(data)


@pytest.mark.parametrize(
    "kind,expected",
    [
        ("reynolds", 13333.333333333334),
        ("thermal_peclet", 10000.0),
        ("mass_peclet", 10000.0),
        ("damkohler", 5.0),
        ("grashof", 1308000.0),
        ("richardson", 0.0073575),
    ],
)
def test_registered_dimensionless_known_answers(kind, expected):
    result = dimensionless_number(dimensionless(kind))
    assert result.status == "calculated"
    assert result.value == pytest.approx(expected, rel=1e-12)
    assert result.unit == "1"
    assert result.context.input_origin == "synthetic_reference"


def test_missing_property_is_not_zero_and_not_estimated():
    result = dimensionless_number(dimensionless("reynolds", dynamic_viscosity_pa_s=None))
    assert result.status == "needs_data"
    assert result.required_inputs == ("dynamic_viscosity_pa_s",)
    assert result.value is None


def test_zero_gravity_is_valid_but_zero_advective_denominator_is_not():
    assert dimensionless_number(dimensionless("grashof", gravity_m_per_s2=0.0)).value == 0.0
    assert dimensionless_number(dimensionless("reynolds", velocity_m_per_s=0.0)).value == 0.0
    result = dimensionless_number(dimensionless("damkohler", velocity_m_per_s=0.0))
    assert result.status == "unsupported"
    assert result.value is None


@pytest.mark.parametrize("value", [-1.0, math.nan, math.inf, True])
def test_bad_length_or_properties_rejected(value):
    with pytest.raises(ValidationError):
        dimensionless("reynolds", characteristic_length_m=value)


def test_ideal_gas_density_known_answer_and_explicit_assumptions():
    result = oxygen_molar_density(
        OxygenDensityRequest(
            oxygen_mole_fraction=0.21,
            absolute_pressure_pa=101325.0,
            temperature_kelvin=300.0,
            reference_location="selected chamber",
            ideal_gas_justification="Low-density ideal-gas example",
            context=CONTEXT,
        )
    )
    assert result.value == pytest.approx(8.530617462292952, rel=1e-12)
    assert result.unit == "mol/m^3"
    assert result.inputs["absolute_pressure_pa"] == 101325.0


def heat_request(**updates):
    data = dict(
        inlet_oxygen_mass_flow_kg_per_s=0.01,
        outlet_oxygen_mass_flow_kg_per_s=0.008,
        heat_yield_j_per_kg_oxygen=13e6,
        mass_balance_reference="source-specific balance",
        flow_calibration_reference="flow calibration",
        oxygen_sensor_calibration_reference="O2 calibration",
        transient_correction_reference="steady reference; no dynamic correction",
        heat_yield_reference="selected material coefficient",
        context=CONTEXT,
    )
    data.update(updates)
    return OxygenConsumptionRequest.model_validate(data)


def test_heat_release_uses_calibrated_oxygen_mass_consumption_and_specific_coefficient():
    result = oxygen_consumption_heat_release(heat_request())
    assert result.value == pytest.approx(26000.0)
    assert result.unit == "W"


def test_missing_calibration_does_not_convert_concentration_difference_to_heat():
    result = oxygen_consumption_heat_release(heat_request(flow_calibration_reference=None))
    assert result.status == "needs_data"
    assert "flow_calibration_reference" in result.required_inputs


def test_negative_net_consumption_preserved_as_unsupported():
    result = oxygen_consumption_heat_release(heat_request(outlet_oxygen_mass_flow_kg_per_s=0.02))
    assert result.status == "unsupported"
    assert result.value is None


def test_dimensionless_overflow_and_underflowed_denominator_are_explicit_errors():
    with pytest.raises(ValueError, match="finite numerical range"):
        dimensionless_number(dimensionless("grashof", characteristic_length_m=1e200))
    with pytest.raises(ValueError, match="finite numerical range"):
        dimensionless_number(dimensionless("grashof", dynamic_viscosity_pa_s=1e-300))

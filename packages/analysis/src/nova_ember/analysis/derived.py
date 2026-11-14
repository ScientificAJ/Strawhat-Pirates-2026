"""Registered SI calculations with explicit property, calibration and domain inputs."""

from __future__ import annotations

from math import isfinite
from typing import Literal

from nova_ember.domain.scientific import (
    Fraction,
    Identifier,
    MethodContext,
    Nonnegative,
    Positive,
    Refusal,
    ScalarResult,
    ScientificInput,
)

GAS_CONSTANT_J_PER_MOL_K = 8.31446261815324


class OxygenDensityRequest(ScientificInput):
    oxygen_mole_fraction: Fraction
    absolute_pressure_pa: Positive
    temperature_kelvin: Positive
    reference_location: Identifier
    ideal_gas_justification: Identifier
    context: MethodContext


def oxygen_molar_density(request: OxygenDensityRequest) -> ScalarResult:
    value = (
        request.oxygen_mole_fraction
        * request.absolute_pressure_pa
        / (GAS_CONSTANT_J_PER_MOL_K * request.temperature_kelvin)
    )
    if not isfinite(value) or (value == 0 and request.oxygen_mole_fraction != 0):
        raise ValueError("Oxygen molar density exceeds finite numeric range.")
    return ScalarResult(
        method_id="ideal-gas-oxygen-molar-density-v1",
        value=value,
        unit="mol/m^3",
        definition="c_O2 = x_O2 P_absolute / (R T)",
        context=request.context,
        inputs=request.model_dump(exclude={"context"}),
        assumptions=(request.ideal_gas_justification,),
        limitations=("Equal molar density does not establish equal flammability or fire risk.",),
    )


class DimensionlessRequest(ScientificInput):
    kind: Literal["reynolds", "thermal_peclet", "mass_peclet", "damkohler", "grashof", "richardson"]
    characteristic_length_m: Positive | None = None
    velocity_m_per_s: Nonnegative | None = None
    density_kg_per_m3: Positive | None = None
    dynamic_viscosity_pa_s: Positive | None = None
    diffusivity_m2_per_s: Positive | None = None
    chemical_timescale_s: Positive | None = None
    gravity_m_per_s2: Nonnegative | None = None
    thermal_expansion_per_kelvin: Positive | None = None
    temperature_difference_kelvin: Nonnegative | None = None
    property_temperature_kelvin: Positive | None = None
    characteristic_scale_definition: Identifier
    property_reference: Identifier
    approximation_justification: Identifier
    context: MethodContext


DIMENSIONLESS_REQUIREMENTS = {
    "reynolds": (
        "characteristic_length_m",
        "velocity_m_per_s",
        "density_kg_per_m3",
        "dynamic_viscosity_pa_s",
    ),
    "thermal_peclet": ("characteristic_length_m", "velocity_m_per_s", "diffusivity_m2_per_s"),
    "mass_peclet": ("characteristic_length_m", "velocity_m_per_s", "diffusivity_m2_per_s"),
    "damkohler": ("characteristic_length_m", "velocity_m_per_s", "chemical_timescale_s"),
    "grashof": (
        "characteristic_length_m",
        "density_kg_per_m3",
        "dynamic_viscosity_pa_s",
        "gravity_m_per_s2",
        "thermal_expansion_per_kelvin",
        "temperature_difference_kelvin",
    ),
    "richardson": (
        "characteristic_length_m",
        "velocity_m_per_s",
        "gravity_m_per_s2",
        "thermal_expansion_per_kelvin",
        "temperature_difference_kelvin",
    ),
}


def dimensionless_number(request: DimensionlessRequest) -> ScalarResult | Refusal:
    required = (*DIMENSIONLESS_REQUIREMENTS[request.kind], "property_temperature_kelvin")
    missing = tuple(name for name in required if getattr(request, name) is None)
    method_id = f"{request.kind}-specified-scale-v1"
    if missing:
        return Refusal(
            status="needs_data",
            method_id=method_id,
            reasons=("Required source-specific properties or scales are unreported.",),
            required_inputs=missing,
            context=request.context,
        )
    values = {name: float(getattr(request, name)) for name in required}
    length = values["characteristic_length_m"]
    velocity = values.get("velocity_m_per_s", 0)
    if request.kind in ("damkohler", "richardson") and velocity == 0:
        return Refusal(
            status="unsupported",
            method_id=method_id,
            reasons=("The registered advective definition has a zero velocity denominator.",),
            context=request.context,
        )
    try:
        if request.kind == "reynolds":
            value = (
                values["density_kg_per_m3"] * velocity * length / values["dynamic_viscosity_pa_s"]
            )
            definition = "Re = rho U L / mu"
        elif request.kind in ("thermal_peclet", "mass_peclet"):
            value = velocity * length / values["diffusivity_m2_per_s"]
            definition = (
                "Pe_thermal = U L / alpha"
                if request.kind == "thermal_peclet"
                else "Pe_mass = U L / D"
            )
        elif request.kind == "damkohler":
            value = length / velocity / values["chemical_timescale_s"]
            definition = "Da_advective = (L / U) / tau_chemical"
        else:
            buoyancy = (
                values["gravity_m_per_s2"]
                * values["thermal_expansion_per_kelvin"]
                * values["temperature_difference_kelvin"]
            )
            if request.kind == "grashof":
                viscosity = values["dynamic_viscosity_pa_s"] / values["density_kg_per_m3"]
                value = buoyancy * length**3 / viscosity**2
                definition = "Gr_magnitude = g beta |delta_T| L^3 / nu^2; nu = mu / rho"
            else:
                value = buoyancy * length / velocity**2
                definition = "Ri_bulk_magnitude = g beta |delta_T| L / U^2"
    except (OverflowError, ZeroDivisionError):
        raise ValueError("Dimensionless calculation exceeds finite numerical range.") from None
    exact_zero = (
        velocity == 0
        if request.kind in ("reynolds", "thermal_peclet", "mass_peclet")
        else request.kind in ("grashof", "richardson")
        and (values["gravity_m_per_s2"] == 0 or values["temperature_difference_kelvin"] == 0)
    )
    if not isfinite(value) or (value == 0 and not exact_zero):
        raise ValueError("The dimensionless result exceeds finite numeric range.")
    return ScalarResult(
        method_id=method_id,
        value=value,
        unit="1",
        definition=definition,
        context=request.context,
        inputs=request.model_dump(exclude={"context"}),
        assumptions=(
            request.characteristic_scale_definition,
            request.approximation_justification,
            "Properties are evaluated at the supplied temperature and selected source conditions.",
        ),
        limitations=(
            "This registered convention does not establish experiment similarity on its own.",
            "Gravity and electric-field-driven flow are not interchangeable.",
        ),
    )


class OxygenConsumptionRequest(ScientificInput):
    inlet_oxygen_mass_flow_kg_per_s: Nonnegative
    outlet_oxygen_mass_flow_kg_per_s: Nonnegative
    heat_yield_j_per_kg_oxygen: Positive
    mass_balance_reference: Identifier | None = None
    flow_calibration_reference: Identifier | None = None
    oxygen_sensor_calibration_reference: Identifier | None = None
    transient_correction_reference: Identifier | None = None
    heat_yield_reference: Identifier | None = None
    context: MethodContext


def oxygen_consumption_heat_release(request: OxygenConsumptionRequest) -> ScalarResult | Refusal:
    names = (
        "mass_balance_reference",
        "flow_calibration_reference",
        "oxygen_sensor_calibration_reference",
        "transient_correction_reference",
        "heat_yield_reference",
    )
    missing = tuple(name for name in names if getattr(request, name) is None)
    method_id = "source-specific-oxygen-consumption-heat-release-v1"
    if missing:
        return Refusal(
            status="needs_data",
            method_id=method_id,
            reasons=(
                "A calibrated source-specific mass balance and correction basis is required.",
            ),
            required_inputs=missing,
            context=request.context,
        )
    consumption = request.inlet_oxygen_mass_flow_kg_per_s - request.outlet_oxygen_mass_flow_kg_per_s
    if consumption < 0:
        return Refusal(
            status="unsupported",
            method_id=method_id,
            reasons=("Supplied mass flows indicate net oxygen production, not consumption.",),
            context=request.context,
        )
    value = consumption * request.heat_yield_j_per_kg_oxygen
    if not isfinite(value) or (value == 0 and consumption != 0):
        raise ValueError("Heat release exceeds finite numeric range.")
    return ScalarResult(
        method_id=method_id,
        value=value,
        unit="W",
        definition="Q_dot = heat_yield_per_mass_oxygen × (m_dot_O2_in - m_dot_O2_out)",
        context=request.context,
        inputs=request.model_dump(exclude={"context"}),
        assumptions=(
            "Input oxygen mass flows already include the documented balance and transient "
            "corrections.",
            "The supplied source-specific heat yield applies to the selected combustion system.",
        ),
        limitations=(
            "An uncalibrated before/after oxygen concentration difference is not an oxygen "
            "mass flow.",
            "No universal heat-release coefficient or safety inference is supplied by this method.",
        ),
    )

"""Oxygen partial pressure from explicit scenario assumptions, not a risk score."""

from math import isfinite
from typing import Literal

PRESSURE_UNITS = frozenset({"Pa", "kPa", "bar", "psia"})
METHOD_ID = "oxygen-partial-pressure-v1"


def oxygen_partial_pressure(
    oxygen_percent: float,
    absolute_pressure: float,
    pressure_unit: str,
    fraction_basis: Literal["mole", "volume"],
) -> dict:
    """Return xO₂ × Pabs in the input pressure unit, without display rounding.

    A volume fraction uses the ideal-gas interpretation. Gauge pressure and mass
    fraction are intentionally outside this method's input contract.
    """
    if isinstance(oxygen_percent, bool) or not isfinite(oxygen_percent):
        raise ValueError("Oxygen percentage must be a finite number.")
    if isinstance(absolute_pressure, bool) or not isfinite(absolute_pressure):
        raise ValueError("Absolute pressure must be a finite number.")
    if not 0 <= oxygen_percent <= 100:
        raise ValueError("Oxygen percentage must be between 0 and 100.")
    if absolute_pressure <= 0:
        raise ValueError("Absolute pressure must be greater than zero.")
    if pressure_unit not in PRESSURE_UNITS:
        raise ValueError("An explicit supported absolute pressure unit is required.")
    if fraction_basis not in ("mole", "volume"):
        raise ValueError("Oxygen mass fraction is not interchangeable with mole fraction.")
    value = oxygen_percent / 100 * absolute_pressure
    if not isfinite(value) or (value == 0 and oxygen_percent != 0):
        raise ValueError("The derived partial pressure is outside the finite numeric range.")
    return {
        "method_id": METHOD_ID,
        "value": value,
        "unit": pressure_unit,
        "origin": "derived_from_assumptions",
        "inputs": {
            "oxygen_percent": oxygen_percent,
            "absolute_pressure": absolute_pressure,
            "pressure_unit": pressure_unit,
            "fraction_basis": fraction_basis,
            "pressure_reference": "absolute",
        },
        "equation": "pO₂ = (oxygen_percent / 100) × absolute_pressure",
        "assumptions": [
            "Inputs describe the same selected atmosphere and reference location.",
            "Volume fraction is interpreted as mole fraction for an ideal-gas mixture.",
            "Input uncertainty is unreported; no uncertainty interval is inferred.",
        ],
        "limitations": [
            "Equal oxygen partial pressures do not establish equal flammability.",
            "This calculation is not a fire probability or a validated safety assessment.",
        ],
        "references": ["https://ntrs.nasa.gov/citations/20160001047"],
    }

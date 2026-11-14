"""Independent worked examples and scientific input boundaries."""

import math

import pytest
from nova_ember.analysis.oxygen import oxygen_partial_pressure


@pytest.mark.parametrize(
    ("oxygen", "pressure", "unit", "expected"),
    [(21, 14.7, "psia", 3.087), (30, 10.2, "psia", 3.06), (21, 100, "kPa", 21)],
)
def test_known_partial_pressures(oxygen, pressure, unit, expected):
    result = oxygen_partial_pressure(oxygen, pressure, unit, "mole")
    assert math.isclose(result["value"], expected, rel_tol=1e-14)
    assert result["unit"] == unit
    assert result["inputs"]["oxygen_percent"] == oxygen
    assert result["origin"] == "derived_from_assumptions"
    assert any("do not establish equal flammability" in text for text in result["limitations"])


@pytest.mark.parametrize("oxygen", [-1, 101, math.nan, math.inf, True])
def test_invalid_oxygen_cannot_become_a_result(oxygen):
    with pytest.raises(ValueError):
        oxygen_partial_pressure(oxygen, 100, "kPa", "mole")


@pytest.mark.parametrize("pressure", [-1, 0, math.nan, math.inf, True])
def test_invalid_absolute_pressure_cannot_become_a_result(pressure):
    with pytest.raises(ValueError):
        oxygen_partial_pressure(21, pressure, "kPa", "mole")


@pytest.mark.parametrize(("unit", "basis"), [("psig", "mole"), ("kPa", "mass")])
def test_non_equivalent_physical_inputs_are_refused(unit, basis):
    with pytest.raises(ValueError):
        oxygen_partial_pressure(21, 100, unit, basis)


def test_zero_oxygen_and_pure_oxygen_are_valid_boundaries():
    assert oxygen_partial_pressure(0, 50, "Pa", "mole")["value"] == 0
    assert oxygen_partial_pressure(100, 50, "Pa", "mole")["value"] == 50


def test_volume_basis_is_preserved_with_explicit_ideal_gas_assumption():
    result = oxygen_partial_pressure(21, 100, "kPa", "volume")
    assert result["inputs"]["fraction_basis"] == "volume"
    assert any("ideal-gas" in text for text in result["assumptions"])
    assert "uncertainty" not in result

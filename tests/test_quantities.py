import pytest
from nova_ember.domain.quantities import conversion_formula, convert_source_scalar


@pytest.mark.parametrize(
    ("raw", "unit", "expected", "canonical"),
    [
        ("8.1", "cm/s", 0.081, "m/s"),
        ("0.27", "mm", 0.00027, "m"),
        ("29", "cm", 0.29, "m"),
        ("22.2", "%", 0.222, "1"),
        ("1.5", "mg/s", 0.0000015, "kg/s"),
        ("27.1", "degC", 300.25, "K"),
        ("0", "s", 0, "s"),
        ("1.38", "1", 1.38, "1"),
        ("1e-3", "m", 0.001, "m"),
    ],
)
def test_known_unit_conversions_keep_units_and_numerical_meaning(raw, unit, expected, canonical):
    value, output_unit = convert_source_scalar(raw, unit)
    assert value == pytest.approx(expected, rel=1e-12, abs=1e-15)
    assert output_unit == canonical


@pytest.mark.parametrize(
    ("raw", "unit"),
    [
        ("037", "mm"),
        ("~21.5", "%"),
        ("0.5 - 1.0", "m"),
        ("21; 34", "%"),
        ("3400", "%"),
        ("-1", "%"),
        ("#DIV/0!", "K"),
        ("NaN", "s"),
        ("Infinity", "s"),
        ("1e9999", "s"),
        ("1e-5000", "s"),
        ("1e-1000000", "mm"),
        ("-274", "degC"),
        ("1", "mmHg"),
        ("9.2 s", "s"),
    ],
)
def test_unresolved_values_are_not_silently_converted(raw, unit):
    with pytest.raises(ValueError):
        convert_source_scalar(raw, unit)


def test_transformation_formula_retains_scale_and_offset():
    assert conversion_formula("cm/s") == "canonical_value = source_numeric_value × 0.01 + 0 (m/s)"
    assert conversion_formula("degC") == "canonical_value = source_numeric_value × 1 + 273.15 (K)"


def test_real_zero_from_temperature_offset_is_not_numeric_underflow():
    assert convert_source_scalar("-273.15", "degC") == (0.0, "K")

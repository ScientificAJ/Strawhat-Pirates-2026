"""Exact scale/offset conversion of explicitly unit-defined source numerals.

This small vocabulary converts presentation units only. It cannot resolve species,
calibration, pressure reference, approximate values or experiment comparability.
"""

import re
from dataclasses import dataclass
from decimal import Decimal, DecimalException, Underflow, localcontext
from math import isfinite

SCALAR_PATTERN = re.compile(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?")


@dataclass(frozen=True)
class UnitConversion:
    canonical_unit: str
    factor: Decimal
    offset: Decimal = Decimal(0)


UNIT_CONVERSIONS = {
    "mm": UnitConversion("m", Decimal("0.001")),
    "cm": UnitConversion("m", Decimal("0.01")),
    "m": UnitConversion("m", Decimal(1)),
    "mm/s": UnitConversion("m/s", Decimal("0.001")),
    "cm/s": UnitConversion("m/s", Decimal("0.01")),
    "m/s": UnitConversion("m/s", Decimal(1)),
    "mg/s": UnitConversion("kg/s", Decimal("0.000001")),
    "s": UnitConversion("s", Decimal(1)),
    "W": UnitConversion("W", Decimal(1)),
    "K": UnitConversion("K", Decimal(1)),
    "degC": UnitConversion("K", Decimal(1), Decimal("273.15")),
    "%": UnitConversion("1", Decimal("0.01")),
    "1": UnitConversion("1", Decimal(1)),
}


def convert_source_scalar(raw_number: str, original_unit: str) -> tuple[float, str]:
    """Convert one complete finite numeral, retaining precision until serialization."""
    text = raw_number.strip()
    if not SCALAR_PATTERN.fullmatch(text):
        raise ValueError("A single explicit scalar numeral is required")
    if re.fullmatch(r"[+-]?0\d+", text):
        raise ValueError("Leading-zero integer text requires source clarification")
    if original_unit not in UNIT_CONVERSIONS:
        raise ValueError("This source unit is outside the reviewed conversion vocabulary")
    number = Decimal(text)
    conversion = UNIT_CONVERSIONS[original_unit]
    try:
        with localcontext() as context:
            context.traps[Underflow] = True
            # Retain the supplied significant digits through offset cancellation,
            # especially on either side of the Celsius absolute-zero boundary.
            context.prec = max(
                context.prec,
                len(number.as_tuple().digits)
                + len(conversion.factor.as_tuple().digits)
                + len(conversion.offset.as_tuple().digits),
            )
            canonical = number * conversion.factor + conversion.offset
        value = float(canonical)
    except DecimalException:
        raise ValueError("Source numeral exceeds the supported decimal range") from None
    if not isfinite(value):
        raise ValueError("The converted source value is outside the finite numeric range")
    if not canonical.is_zero() and value == 0:
        raise ValueError("The converted source value is too small for the numeric representation")
    if original_unit == "%" and not Decimal(0) <= number <= Decimal(100):
        raise ValueError("Source percentage is outside 0–100; it has not been repaired")
    if conversion.canonical_unit == "K" and canonical < 0:
        raise ValueError("Source temperature is below absolute zero")
    return value, conversion.canonical_unit


def conversion_formula(original_unit: str) -> str:
    conversion = UNIT_CONVERSIONS[original_unit]
    return (
        f"canonical_value = source_numeric_value × {conversion.factor} "
        f"+ {conversion.offset} ({conversion.canonical_unit})"
    )

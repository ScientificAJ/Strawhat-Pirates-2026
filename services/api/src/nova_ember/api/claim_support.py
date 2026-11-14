"""Mechanical numeric support preserves origin and separates display precision."""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation, localcontext

from nova_ember.adapters.records import source_scalar_text
from nova_ember.contracts.research import EvidenceFact

NUMBER = re.compile(r"(?<![A-Za-z0-9_])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?")
WEAK_ORIGINS = {"tool_contract", "model_proposal", "source_media"}
INPUT_KEYS = {"input", "inputs", "request", "parameters", "context", "provenance"}
REFERENCE_KEYS = {
    "sources",
    "asset",
    "anchor",
    "anchors",
    "source_rows",
    "raw_cells",
    "source_locator",
    "source_snapshot",
    "source_sha256",
    "sha256",
    "id",
    "source_url",
}
UNIT_NAMES = {
    "metres": "m",
    "meters": "m",
    "millimetres": "mm",
    "millimeters": "mm",
    "seconds": "s",
    "second": "s",
    "sec": "s",
    "percent": "%",
    "°C": "degC",
    "mm²/s": "mm2/s",
    "m²/s": "m2/s",
    "mm²": "mm2",
    "m²": "m2",
}
for _unit in (
    "mm2/s",
    "m2/s",
    "mm/s",
    "cm/s",
    "m/s",
    "psia",
    "kPa",
    "Pa",
    "bar",
    "atm",
    "mmHg",
    "degC",
    "K",
    "mm2",
    "m2",
    "mm",
    "cm",
    "m",
    "ms",
    "s",
    "W",
    "J",
    "%",
    "1",
):
    UNIT_NAMES[_unit] = _unit
UNIT_PATTERN = re.compile(
    r"\s*("
    + "|".join(re.escape(name) for name in sorted(UNIT_NAMES, key=len, reverse=True))
    + r")(?=$|[^A-Za-z0-9_])"
)


@dataclass(frozen=True)
class NumericEvidence:
    value: Decimal
    origin: str
    exact_integer: bool
    unit: str | None = None


def statement_numbers(statement: str) -> list[str]:
    # Source identifiers are locators, not signed scientific measurements.
    text = re.sub(r"\bPSI-[0-9]+\b", "", statement)
    return NUMBER.findall(text)


def numeric_mentions(statement: str) -> list[tuple[str, str | None]]:
    text = re.sub(r"\bPSI-[0-9]+\b", "", statement)
    result = []
    for match in NUMBER.finditer(text):
        unit = UNIT_PATTERN.match(text, match.end())
        result.append((match.group(), UNIT_NAMES[unit.group(1)] if unit else None))
    return result


def source_backed(fact: EvidenceFact) -> bool:
    retained = any(
        any(
            isinstance(source.get(name), str) and len(source[name]) == 64
            for name in ("sha256", "source_sha256", "asset_sha256")
        )
        or (source.get("accession") and source.get("snapshot_id"))
        for source in fact.sources
    )
    if fact.origin in {"source_metadata", "source_measurement", "source_text"}:
        return retained
    return (
        fact.origin == "deterministic_calculation"
        and retained
        and fact.content.get("origin") != "derived_from_assumptions"
    )


def numeric_evidence(
    fact: EvidenceFact,
    *,
    source_only: bool,
    measured_only: bool,
    include_inputs: bool = False,
    hypothesis: bool = False,
) -> list[NumericEvidence]:
    if fact.origin in WEAK_ORIGINS:
        if fact.origin != "model_proposal" or not hypothesis or measured_only:
            return []
    if source_only and not source_backed(fact):
        return []
    if measured_only and fact.origin != "source_measurement":
        return []
    values: list[NumericEvidence] = []

    def append(value, origin: str, unit: str | None = None) -> None:
        if isinstance(value, bool) or value is None:
            return
        if isinstance(value, (int, float, Decimal)):
            candidate = Decimal(str(value))
            if candidate.is_finite():
                values.append(NumericEvidence(candidate, origin, isinstance(value, int), unit))
        elif isinstance(value, str):
            for token in NUMBER.findall(value):
                try:
                    candidate = Decimal(token)
                except InvalidOperation:
                    continue
                if candidate.is_finite():
                    values.append(
                        NumericEvidence(
                            candidate, origin, "." not in token and "e" not in token.lower(), unit
                        )
                    )

    def walk(value, key: str = "", unit: str | None = None) -> None:
        if isinstance(value, dict):
            if "canonical_value" in value and "source_value_kind" in value:
                kind = value["source_value_kind"]
                if value.get("status") != "normalized" or (measured_only and kind != "measurement"):
                    return
                append(value.get("canonical_value"), kind, value.get("canonical_unit"))
                # The raw scalar remains in its original unit; qualifiers never disappear.
                unit = value.get("original_unit")
                numeral = source_scalar_text(value.get("raw_text", "").strip(), unit)
                if numeral is not None:
                    append(numeral, kind, unit)
                return
            if measured_only:
                # Only a reviewed field explicitly marked measurement can support this origin.
                for nested in value.values():
                    if isinstance(nested, (dict, list, tuple)):
                        walk(nested)
                return
            for name, nested in value.items():
                if name in REFERENCE_KEYS or (name in INPUT_KEYS and not include_inputs):
                    continue
                field_unit = value.get("unit") if name in {"value", "lower", "upper"} else unit
                if name.endswith("_percent"):
                    field_unit = "%"
                if name in {"absolute_pressure", "pressure"}:
                    field_unit = value.get("pressure_unit")
                walk(nested, name, field_unit)
        elif isinstance(value, (list, tuple)):
            for nested in value:
                walk(nested, key, unit)
        else:
            append(value, fact.origin, unit)

    walk(fact.content)
    return values


def display_match(
    token: str,
    evidence: NumericEvidence,
    decimals: int | None = None,
    claimed_unit: str | None = None,
) -> dict | None:
    if (
        claimed_unit is not None
        and UNIT_NAMES.get(evidence.unit or "", evidence.unit) != claimed_unit
    ):
        return None
    displayed = Decimal(token)
    actual = evidence.value
    if displayed == actual:
        return {
            "display": token,
            "stored_value": str(actual),
            "rule": "exact",
            "origin": evidence.origin,
        }
    if evidence.exact_integer or displayed == 0 or actual == 0:
        return None
    # Default narration uses at most twelve significant digits. Explicit decimal
    # precision changes only the display, never the stored scientific value.
    exponent = -decimals if decimals is not None else actual.adjusted() - 11
    with localcontext() as context:
        context.prec = max(50, len(actual.as_tuple().digits) + abs(exponent) + 5)
        rounded = actual.quantize(Decimal(1).scaleb(exponent), rounding=ROUND_HALF_EVEN)
    if rounded != displayed:
        return None
    return {
        "display": token,
        "stored_value": str(actual),
        "rule": "nearest_half_even",
        "decimal_places": decimals,
        "significant_digits": 12 if decimals is None else None,
        "origin": evidence.origin,
    }

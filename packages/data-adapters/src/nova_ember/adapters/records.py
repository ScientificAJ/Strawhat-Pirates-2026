"""Reviewed source-table grains and conservative field interpretations.

Mappings identify source records and unit conversions. They do not establish
experimental independence, calibration, outcome validity or comparability.
"""

import re
from collections import Counter
from dataclasses import dataclass, replace
from typing import Any

from nova_ember.adapters.flex import FLEX_HEADERS, FLEX_LIMITATIONS
from nova_ember.domain.quantities import SCALAR_PATTERN, conversion_formula, convert_source_scalar
from nova_ember.domain.records import (
    InterpretedTable,
    RowKind,
    SourceField,
    SourceRecord,
    SourceValueKind,
)
from nova_ember.domain.source import RawTable, SourceRow


@dataclass(frozen=True)
class ColumnRule:
    quantity_kind: str
    unit: str | None = None
    normalize: bool = False
    basis: str | None = None
    location: str | None = None
    blocker: str | None = None
    qualifier: str | None = None
    approximate: bool = False
    notes: tuple[str, ...] = ()
    source_value_kind: SourceValueKind = "source_reported"
    cell_units: tuple[str, ...] = ()


@dataclass(frozen=True)
class TableDefinition:
    accession: str
    headers: tuple[str, ...]
    row_kind: RowKind
    columns: dict[int, ColumnRule]
    limitations: tuple[str, ...]
    file_version: int = 1


UNKNOWN_REFERENCE = "Absolute versus gauge pressure reference is not resolved by this table."
UNKNOWN_COMPOSITION = (
    "Composition basis and spatial location require a source-specific protocol anchor. "
    "This field cannot populate an assumed cabin atmosphere."
)
UNCALIBRATED_CONTROL = (
    "An instrument/display setting is not calibrated physical airflow or irradiance."
)
SOURCE_CODES = "Retain the source code; no physical endpoint or censoring class is inferred."
COMMON_LIMITATIONS = (
    "Source records are not a verified count of independent experimental replicates.",
    "Unit conversion preserves the source assertion; "
    "it does not verify its measurement or calibration.",
    "Source measurement uncertainty is unreported here; no interval or confidence is inferred.",
)


def scalar(kind: str, unit: str, **kwargs: Any) -> ColumnRule:
    return ColumnRule(kind, unit, normalize=True, **kwargs)


DEFINITIONS = {
    "PSI-69_Experimental table_FLEX.csv": TableDefinition(
        "PSI-69",
        FLEX_HEADERS,
        "source_test_record",
        {
            5: ColumnRule(
                "pressure", "mmHg", blocker=UNKNOWN_REFERENCE, source_value_kind="condition"
            ),
            6: ColumnRule(
                "composition_fraction",
                "1",
                basis="mole",
                location="ambient",
                blocker="The O species header requires protocol confirmation.",
            ),
            7: ColumnRule(
                "composition_fraction",
                "1",
                basis="mole",
                location="ambient",
                blocker="The N species header requires protocol confirmation.",
            ),
            8: ColumnRule(
                "composition_fraction",
                "1",
                basis="mole",
                location="ambient",
                blocker="The CO species header requires protocol confirmation.",
            ),
            9: scalar("helium_fraction", "1", basis="mole", location="ambient"),
            10: scalar("length", "mm"),
            11: scalar("length", "mm", notes=("The endpoint is visible-flame extinction only.",)),
            12: ColumnRule(
                "burning_rate", "mm", blocker="The reported mm unit is dimensionally unresolved."
            ),
            13: scalar("duration", "s"),
            14: ColumnRule(
                "source_event_label",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
        },
        FLEX_LIMITATIONS,
    ),
    "PSI-25_Experimental table_BASS-II.csv": TableDefinition(
        "PSI-25",
        (
            "PI",
            "Test #",
            "Date",
            "GMT",
            "Sample #",
            "Fuel Sample Material",
            "Flow restrictor",
            "Fan display",
            "Air display",
            "Radiometer gain   (1000   250   50   10)",
            "Total Frames Shot",
            "Calibrated  initial O2 % by vol ",
            "Calibrated final O2 % by vol",
            "Initial CO2 % by vol",
            "Final CO2 % by vol",
            "Initial CO (ppm)",
            "Final CO (ppm)",
        ),
        "source_test_record",
        {
            6: ColumnRule(
                "instrument_setting", blocker=UNCALIBRATED_CONTROL, source_value_kind="setting"
            ),
            7: ColumnRule(
                "instrument_setting", blocker=UNCALIBRATED_CONTROL, source_value_kind="setting"
            ),
            8: ColumnRule(
                "instrument_setting", blocker=UNCALIBRATED_CONTROL, source_value_kind="setting"
            ),
            9: ColumnRule(
                "instrument_setting", blocker=UNCALIBRATED_CONTROL, source_value_kind="setting"
            ),
            10: ColumnRule(
                "source_frame_count",
                blocker="Frame descriptions do not establish independent trials.",
            ),
            11: scalar(
                "oxygen_fraction",
                "%",
                basis="volume",
                location="not_reported",
                source_value_kind="measurement",
            ),
            12: scalar(
                "oxygen_fraction",
                "%",
                basis="volume",
                location="not_reported",
                source_value_kind="measurement",
            ),
            13: scalar(
                "carbon_dioxide_fraction",
                "%",
                basis="volume",
                location="not_reported",
                source_value_kind="measurement",
            ),
            14: scalar(
                "carbon_dioxide_fraction",
                "%",
                basis="volume",
                location="not_reported",
                source_value_kind="measurement",
            ),
            15: ColumnRule(
                "carbon_monoxide_concentration",
                "ppm",
                basis="not_reported",
                blocker="The ppm concentration basis and instrument codes require protocol review.",
            ),
            16: ColumnRule(
                "carbon_monoxide_concentration",
                "ppm",
                basis="not_reported",
                blocker="The ppm concentration basis and instrument codes require protocol review.",
            ),
        },
        (
            "Fan/air display values require the relevant calibration "
            "before physical-flow analysis.",
            "The table has no explicit extinction outcome column.",
            "Source sample descriptions and preparation remain text; "
            "no geometry is guessed from them.",
        ),
    ),
    "PSI-101_Experimental table_SAME-R.csv": TableDefinition(
        "PSI-101",
        (
            "Sample Type",
            "SAME Test #",
            "Description",
            "Date",
            "Inlet velocity (cm/s)",
            "Rt/R0",
            "Duration (sec)",
            "Primary aging time (sec)",
            "Primary mixing time (sec)",
            "Net aging time (sec)",
        ),
        "condition_record",
        {
            4: scalar("speed", "cm/s", location="inlet", source_value_kind="condition"),
            5: scalar("resistance_ratio", "1"),
            6: scalar("duration", "s"),
            7: scalar("duration", "s"),
            8: scalar("duration", "s"),
            9: scalar("duration", "s"),
        },
        (
            "Condition and heating records are not detector-alarm events "
            "or labeled positives/negatives.",
            "No sensitivity, specificity, false-positive rate or detector certification "
            "follows from these rows.",
            "Source dates omit a year; no complete date or timezone is supplied by this mapping.",
        ),
    ),
    "PSI-159_Experimental table_CFI-G_Normal Flames.csv": TableDefinition(
        "PSI-159",
        (
            "Flame Type",
            "Day",
            "Fuel",
            "Test",
            "Cool flame?",
            " XO2 before test",
            "XO2  after test",
            "approx p (bar)",
            "Xf",
            "mHC (mg/s)",
            "TFP",
            "Tad (K)",
            "Zst",
            "Hot ignition",
            "burn time (sec)",
            "Self-ext or flow term",
            "Peak burner T (C )",
            "Comments",
        ),
        "source_test_record",
        {
            4: ColumnRule(
                "source_event_label",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
            5: ColumnRule(
                "oxygen_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            6: ColumnRule(
                "oxygen_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            7: ColumnRule(
                "pressure",
                "bar",
                approximate=True,
                blocker=UNKNOWN_REFERENCE,
                source_value_kind="condition",
            ),
            8: ColumnRule(
                "fuel_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            9: scalar("mass_flow_rate", "mg/s"),
            10: ColumnRule(
                "source_code",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
            11: scalar(
                "temperature",
                "K",
                notes=(
                    "Tad is a source-derived thermodynamic quantity, not a sensor measurement.",
                ),
                source_value_kind="derived",
            ),
            12: ColumnRule(
                "source_symbol", blocker="Zst interpretation requires the source protocol."
            ),
            13: ColumnRule(
                "source_event_label",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
            14: scalar("duration", "s"),
            15: ColumnRule(
                "source_event_code",
                blocker=SOURCE_CODES,
                qualifier="source_code",
                source_value_kind="code",
            ),
            16: scalar("temperature", "degC", location="burner", source_value_kind="measurement"),
        },
        (
            "Normal and inverse flame configurations remain distinct.",
            "XO2 and Xf columns do not become one interchangeable atmosphere or habitat condition.",
            "SE, FT and dash are retained without inferring "
            "a cool-flame or terminal-combustion endpoint.",
        ),
    ),
    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": TableDefinition(
        "PSI-159",
        (
            "Flame Type",
            "Day",
            "Fuel",
            "Test",
            "Xf  before test",
            "Xf  after test",
            "approx p (bar)",
            "XO2",
            "HC burnrate (mg/s)",
            "O2 flow rate (mg/s)",
            "TFP",
            "Tad (K)",
            "Zst",
            "Hot ignition",
            "burn time (sec)",
            "Self -ext or flow term",
            "Peak burner Temp (C)",
            "Peak burner temp (K)",
            "Color",
            "Comments",
        ),
        "source_test_record",
        {
            4: ColumnRule(
                "fuel_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            5: ColumnRule(
                "fuel_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            6: ColumnRule(
                "pressure",
                "bar",
                approximate=True,
                blocker=UNKNOWN_REFERENCE,
                source_value_kind="condition",
            ),
            7: ColumnRule(
                "oxygen_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            8: scalar("source_mass_rate", "mg/s"),
            9: scalar("mass_flow_rate", "mg/s"),
            10: ColumnRule(
                "source_code",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
            11: scalar(
                "temperature",
                "K",
                notes=(
                    "Tad is a source-derived thermodynamic quantity, not a sensor measurement.",
                ),
                source_value_kind="derived",
            ),
            12: ColumnRule(
                "source_symbol", blocker="Zst interpretation requires the source protocol."
            ),
            13: ColumnRule(
                "source_event_label",
                qualifier="source_code",
                notes=(SOURCE_CODES,),
                source_value_kind="code",
            ),
            14: scalar("duration", "s"),
            15: ColumnRule(
                "source_event_code",
                blocker=SOURCE_CODES,
                qualifier="source_code",
                source_value_kind="code",
            ),
            16: scalar("temperature", "degC", location="burner", source_value_kind="measurement"),
            17: scalar("temperature", "K", location="burner", source_value_kind="measurement"),
        },
        (
            "Empty comma rows are excluded from source-record counts and are not trials.",
            "Fuel-stream and oxidizer-stream quantities and normal/inverse configurations "
            "must not be pooled.",
            "Hot ignition, a zero burn time, source termination codes "
            "and cool-flame cessation are distinct observations.",
        ),
    ),
    "PSI-99_Experimental table_SAFFIRE-2.csv": TableDefinition(
        "PSI-99",
        (
            "Sample Number",
            "Material",
            "Samle Thickness ",
            "Sample Length ",
            "Sample Width (cm)",
            "Air Flow (cm/s)",
            "Percent O2 (Note 1)",
            "Ignition Power (W)",
            "Ignition Time (s)",
            "Burn Time (s)",
            "Flow Direction",
            "?-g Burn Length",
            "?-g Spread Length",
            "1-g Burn Length",
            "1-g Spread Rate",
            "Camera 1",
            "Camera 2",
        ),
        "sample_record",
        {
            2: ColumnRule("length", normalize=True, cell_units=("mm", "cm")),
            3: scalar("length", "cm"),
            4: scalar("length", "cm"),
            5: scalar("speed", "cm/s"),
            6: ColumnRule(
                "oxygen_fraction",
                "%",
                basis="not_reported",
                location="not_reported",
                blocker="Note 1 defines a CO2-derived value; "
                "approximation and basis remain explicit.",
                source_value_kind="derived",
            ),
            7: scalar("power", "W"),
            8: scalar("duration", "s"),
            9: scalar("duration", "s"),
            11: ColumnRule(
                "source_length",
                blocker="The ?-g header is damaged; no gravity label is repaired.",
                qualifier="damaged_header",
            ),
            12: ColumnRule(
                "source_spread",
                blocker="The ?-g header is damaged and its measurement definition is unresolved.",
                qualifier="damaged_header",
            ),
            13: scalar("length", "cm"),
            14: scalar("speed", "mm/s"),
        },
        (
            "The 15 source rows contain nine samples, "
            "two flow-visualization records and four notes.",
            "Blank material cells are not filled down from a preceding sample "
            "without a source-backed join.",
            "Note 1 describes oxygen derived from CO2 production "
            "and an initial ISS reference, not a new O2 sensor reading.",
            "Qualifiers, damaged ?-g headers, composite samples "
            "and suspicious 037 mm text remain unresolved.",
        ),
    ),
    "PSI-20_Experimental table_ACME BRE.csv": TableDefinition(
        "PSI-20",
        (
            "Year",
            "Month",
            "Date",
            "Burner Size (mm)",
            "Fuel Bottle",
            "Oxygen Conc (percent)",
            "Flames Ignited",
            "Notes",
        ),
        "daily_summary",
        {
            3: scalar("length", "mm"),
            5: ColumnRule(
                "oxygen_fraction",
                "%",
                basis="volume",
                location="not_reported",
                blocker="Listed approximate concentrations are not mapped "
                "to individual flames or pressures.",
            ),
            6: ColumnRule(
                "source_daily_count",
                blocker="A daily count is not a list of independent run conditions.",
            ),
        },
        (
            "Rows summarize days; lists of oxygen settings and flame counts "
            "do not define their Cartesian product.",
            "The first source note says chamber pressure varied "
            "but is not identified in this summary.",
            "The first source note identifies oxygen dilution on a volume basis; "
            "individual test matching remains unknown.",
            "Source strings 3400% and 2100% are retained, not silently repaired into 34% or 21%.",
        ),
    ),
    "PSI-68_Experimental table_Flex2.csv": TableDefinition(
        "PSI-68",
        (
            "Sample (Fuel Type)",
            "Initial Droplet Diameter (mm)",
            "Ambient Gas Mixture ",
            "Oxygen Mole Fraction",
            "Ambient Pressure (atm)",
            " Ambient Temperature (C)",
            "Flow Velocity (cm/s)",
        ),
        "range_summary",
        {
            1: scalar("length", "mm"),
            3: ColumnRule(
                "oxygen_fraction",
                "1",
                basis="mole",
                location="ambient",
                blocker="Listed fractions are summary settings, not paired individual tests.",
            ),
            4: ColumnRule(
                "pressure", "atm", blocker=UNKNOWN_REFERENCE, source_value_kind="condition"
            ),
            5: scalar("temperature", "degC", location="ambient", source_value_kind="condition"),
            6: scalar("speed", "cm/s"),
        },
        (
            "Eight rows summarize fuel/condition ranges, not eight independent burns.",
            "Ranges and multiple settings remain source text; "
            "no cross-product of tests is constructed.",
        ),
    ),
    "PSI-39_Experimental table_CFI.csv": TableDefinition(
        "PSI-39",
        (
            "Flex Number",
            "Test Date",
            "Local Time",
            "CIR ",
            "Pressure",
            "Oxygen",
            "Nitrogen",
            "Helium",
            "Fiber",
            "Fuel ",
        ),
        "condition_record",
        {
            4: ColumnRule(
                "pressure", "atm", blocker=UNKNOWN_REFERENCE, source_value_kind="condition"
            ),
            5: ColumnRule(
                "oxygen_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            6: ColumnRule(
                "nitrogen_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
            7: ColumnRule(
                "helium_fraction",
                basis="not_reported",
                location="not_reported",
                blocker=UNKNOWN_COMPOSITION,
                source_value_kind="condition",
            ),
        },
        (
            "The 87 condition records contain no explicit outcome column.",
            "Fuel-mixture strings, support state and source-local times remain as reported.",
        ),
    ),
    "PSI-47_Experimental table_DAFT.csv": TableDefinition(
        "PSI-47",
        (
            "Session Name",
            "Actual Day",
            "Hardware Description",
            "Sample Material",
            "Sampled Location",
        ),
        "session_record",
        {},
        (
            "D1 and D2 are hardware/dust sessions, not smoke-detector alarm examples.",
            "Arizona Road Dust does not become combustion smoke or a detector-performance label.",
        ),
        file_version=2,
    ),
}

UNIT_ALIASES = {
    "mm": ("mm",),
    "cm": ("cm",),
    "m": ("m",),
    "mm/s": ("mm/s",),
    "cm/s": ("cm/s",),
    "m/s": ("m/s",),
    "mg/s": ("mg/s",),
    "s": ("s", "sec"),
    "W": ("W",),
    "K": ("K",),
    "degC": ("C", "degC"),
    "%": ("%",),
    "1": (),
    "atm": ("atm",),
    "bar": ("bar",),
    "mmHg": ("mmHg",),
}


def source_scalar_text(text: str, unit: str | None) -> str | None:
    """Return a complete source numeral with only a reviewed unit suffix removed."""
    if SCALAR_PATTERN.fullmatch(text):
        return text
    for suffix in UNIT_ALIASES.get(unit or "", ()):
        if text.endswith(suffix):
            numeral = text[: -len(suffix)].strip()
            if SCALAR_PATTERN.fullmatch(numeral):
                return numeral
    return None


def _field(column: int, header: str | None, raw: str, rule: ColumnRule | None) -> SourceField:
    if rule and rule.cell_units:
        # This source column has no header unit; each cell supplies its own unit.
        explicit_unit = next((unit for unit in rule.cell_units if raw.strip().endswith(unit)), None)
        rule = replace(
            rule,
            unit=explicit_unit,
            blocker=rule.blocker
            if explicit_unit
            else "This source cell does not report a supported explicit unit.",
        )
    field = SourceField(
        column_index=column,
        source_column=header,
        raw_text=raw,
        quantity_kind=rule.quantity_kind if rule else None,
        original_unit=rule.unit if rule else None,
        location=rule.location if rule else None,
        basis=rule.basis if rule else None,
        notes=list(rule.notes) if rule else [],
        qualifier="approximate"
        if rule and rule.approximate
        else (rule.qualifier if rule else None),
        source_value_kind=rule.source_value_kind if rule else "source_reported",
    )
    text = raw.strip()
    if not text:
        return field.model_copy(update={"status": "missing", "missing_reason": "not_reported"})
    if text.casefold() in {"n/a", "not applicable"}:
        return field.model_copy(update={"status": "missing", "missing_reason": "not_applicable"})
    if text in {"#DIV/0!", "#VALUE!", "#N/A", "#NUM!"}:
        return field.model_copy(
            update={
                "status": "unresolved",
                "missing_reason": "invalid",
                "qualifier": field.qualifier or "source_error",
                "notes": [
                    *field.notes,
                    "Source spreadsheet error is preserved; it is not a numerical value.",
                ],
            }
        )
    if text.casefold() in {"-", "none"}:
        return field.model_copy(
            update={
                "status": "unresolved",
                "missing_reason": "ambiguous",
                "qualifier": field.qualifier or "source_code",
                "notes": [*field.notes, "Source code is not silently converted to zero or false."],
            }
        )
    if not rule:
        return field
    if rule.unit == "%" and (numeral := source_scalar_text(text, "%")) is not None:
        try:
            convert_source_scalar(numeral, "%")
        except ValueError as error:
            return field.model_copy(
                update={
                    "status": "unresolved",
                    "missing_reason": "invalid",
                    "qualifier": field.qualifier or "invalid_numeric",
                    "notes": [*field.notes, str(error)],
                }
            )
    updates: dict[str, Any] = {"status": "unresolved"}
    notes = list(field.notes)
    if rule.blocker:
        notes.append(rule.blocker)
    updates["notes"] = notes
    if rule.approximate or text.startswith(("~", "≈", "approx")):
        updates["qualifier"] = "approximate"
    elif ";" in text or " and " in text or " or " in text:
        updates["qualifier"] = "multiple_values"
    elif re.search(r"\d\s*(?:-|–|\bto\b)\s*[+\-]?\d", text):
        updates["qualifier"] = "range"
    elif rule.blocker:
        updates["qualifier"] = rule.qualifier or "unresolved_semantics"
    elif rule.normalize:
        numeral = source_scalar_text(text, rule.unit)
        if numeral is None:
            updates["qualifier"] = "source_text"
            notes.append("This source field is not one unqualified scalar in the declared unit.")
        else:
            try:
                value, unit = convert_source_scalar(numeral, rule.unit or "")
            except ValueError as error:
                updates.update(qualifier="invalid_numeric", missing_reason="ambiguous")
                notes.append(str(error))
            else:
                if rule.quantity_kind.endswith("_fraction") and not 0 <= value <= 1:
                    updates.update(qualifier="invalid_numeric", missing_reason="invalid")
                    notes.append(
                        "Source composition fraction is outside 0–1; it has not been repaired."
                    )
                    return field.model_copy(update=updates)
                updates.update(
                    status="normalized",
                    canonical_value=value,
                    canonical_unit=unit,
                    transformation_id="source-unit-conversion-v1",
                    transformation_formula=conversion_formula(rule.unit or ""),
                )
                notes.append(
                    "Unit conversion only; raw text and source uncertainty remain unchanged."
                )
    else:
        updates.update(status="text", qualifier=rule.qualifier)
    return field.model_copy(update=updates)


def _row_kind(definition: TableDefinition, row: SourceRow) -> RowKind:
    if definition.accession != "PSI-99":
        return definition.row_kind
    identifier = row.cells[0]
    if re.fullmatch(r"2-[1-9]", identifier):
        return "sample_record"
    if identifier in {"F1C1/F1C2", "F2C1/F2C2"}:
        return "flow_visualization"
    if re.match(r"Note [1-4]\b", identifier):
        return "note"
    return "unclassified_record"


def interpret_table(asset: dict[str, Any], table: RawTable) -> InterpretedTable:
    """Return reviewed mappings or raw-readable structured refusal without guesses."""
    definition = DEFINITIONS.get(asset["file_name"])
    refusals = []
    if definition is None:
        refusals.append("No reviewed source-specific table adapter is registered for this file.")
    elif (
        asset["accession"] != definition.accession
        or asset["file_version"] != definition.file_version
    ):
        refusals.append("Source identity or file version differs from the reviewed table contract.")
    elif table.headers != definition.headers:
        refusals.append(
            "Source headers changed; scientific interpretation requires mapping review."
        )
    elif any(len(row.cells) != len(table.headers) for row in table.rows):
        refusals.append(
            "Source row widths differ from the reviewed header; no cells were discarded."
        )
    reviewed = definition if not refusals else None
    records = []
    for row in table.rows:
        kind = _row_kind(reviewed, row) if reviewed else "unclassified_record"
        rules = (
            reviewed.columns
            if reviewed and kind not in {"note", "flow_visualization", "unclassified_record"}
            else {}
        )
        if kind == "unclassified_record" and reviewed:
            refusals.append(f"Source line {row.row_number} has no reviewed row role.")
        fields = [
            _field(
                index,
                table.headers[index] if index < len(table.headers) else None,
                raw,
                rules.get(index),
            )
            for index, raw in enumerate(row.cells)
        ]
        records.append(
            SourceRecord(
                source_row=row.row_number,
                line_end=row.line_end,
                row_kind=kind,
                raw_cells=list(row.cells),
                fields=fields,
            )
        )
    counts: Counter[RowKind] = Counter(record.row_kind for record in records)
    return InterpretedTable(
        adapter_id=f"{asset['accession'].lower()}-source-records-v1"
        if reviewed
        else "raw-table-v1",
        status="schema_unrecognized" if refusals else "interpreted",
        accession=asset["accession"],
        asset_id=asset["id"],
        file_name=asset["file_name"],
        file_version=asset["file_version"],
        source_sha256=asset["sha256"],
        source_url=asset["source_url"],
        headers=list(table.headers),
        records=records,
        row_kind_counts=dict(counts),
        source_record_count=len(table.rows),
        empty_record_count=table.empty_record_count,
        limitations=[*COMMON_LIMITATIONS, *(reviewed.limitations if reviewed else ())],
        refusals=refusals,
    )

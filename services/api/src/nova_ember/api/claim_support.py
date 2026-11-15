"""Mechanical numeric support preserves origin and separates display precision."""

import re
from dataclasses import dataclass
from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation, localcontext

from nova_ember.adapters.records import source_scalar_text
from nova_ember.analysis.visualization import MODEL_ID, MODEL_UNITS, DropletVisualizationPoint
from nova_ember.contracts.research import EvidenceFact
from nova_ember.evidence.contracts import EvidenceAnchor
from pydantic import ValidationError

NUMBER = re.compile(
    r"(?<![A-Za-z0-9_])[-+]?"
    r"(?:\d{1,3}(?:,\d{3})+(?:\.\d*)?|\d+(?:\.\d*)?|\.\d+)"
    r"(?:[eE][-+]?\d+)?"
)
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
    "mm^2/s": "mm2/s",
    "m^2/s": "m2/s",
    "mm^2": "mm2",
    "m^2": "m2",
    "m³": "m3",
    "m^3": "m3",
    "W/cm²": "W/cm2",
    "W/cm^2": "W/cm2",
    "W/m²": "W/m2",
    "W/m^2": "W/m2",
}
for _unit in (
    "mm2/s",
    "m2/s",
    "mm/s",
    "cm/s",
    "m/s",
    "1/s",
    "psia",
    "psi",
    "kPa",
    "Pa",
    "bar",
    "atm",
    "mmHg",
    "degC",
    "K",
    "mm2",
    "m2",
    "m3",
    "mm",
    "cm",
    "m",
    "ms",
    "s",
    "W",
    "W/cm2",
    "W/m2",
    "J",
    "kJ",
    "ppm",
    "%",
    "1",
):
    UNIT_NAMES[_unit] = _unit
UNIT_PATTERN = re.compile(
    r"\s*("
    + "|".join(re.escape(name) for name in sorted(UNIT_NAMES, key=len, reverse=True))
    + r")(?=$|[^A-Za-z0-9_])"
)
LINE_POSITION = r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?"
LINE_RANGE = rf"{LINE_POSITION}(?:\s*(?:[-–—]|to|through)\s*{LINE_POSITION})?"
LINE_LOCATOR = re.compile(
    rf"\b(?:source\s+)?lines?\s*(?P<ranges>{LINE_RANGE}"
    rf"(?:\s*(?:,\s*(?:and\s+)?|and\s+){LINE_RANGE})*)(?!\w)",
    re.I,
)
LINE_RANGE_PART = re.compile(
    rf"(?P<first>{LINE_POSITION})(?:\s*(?:[-–—]|to|through)\s*(?P<last>{LINE_POSITION}))?",
    re.I,
)
PUBLICATION_POSITION = re.compile(rf"\b(?P<kind>table|page)\s*(?P<position>{LINE_POSITION})", re.I)
PUBLICATION_ROW = re.compile(
    r"\b(?P<kind>row|sample|case)s?\s*[\"'“]?(?P<label>[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*)",
    re.I,
)
PUBLICATION_REVERSED_ROW = re.compile(
    r"(?<![A-Za-z0-9_.+-])(?P<opening_quote>[\"'“]?)"
    r"(?P<label>[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*)"
    r"(?P<closing_quote>[\"'”]?)\s+(?P<kind>row|sample|case)s?\b",
    re.I,
)
ATTACHED_POSITION_PREFIX = re.compile(
    r"\b(?:tables?|pages?|rows?|samples?|cases?|lines?)(?=[-+]?\d)", re.I
)
MEASURED_ASSERTION = re.compile(r"\bmeasured\b", re.I)
MEASUREMENT_QUALIFICATION = re.compile(
    r"\b(?:not|no|never|without)\b(?:\s+(?:a|an|the|actual|directly|experimentally|"
    r"independently|newly|source|reported|validated|yet|itself|contain|contains|"
    r"establish|establishes|constitute|constitutes|represent|represents)){0,4}\s*$",
    re.I,
)


@dataclass(frozen=True)
class NumericEvidence:
    value: Decimal
    origin: str
    exact_integer: bool
    unit: str | None = None


def asserts_measurement(statement: str) -> bool:
    """Recognize explicit measured wording without turning local negation into an assertion.

    This is a lexical provenance check, not a scientific interpretation of prose.
    Each occurrence is checked so one negated clause cannot mask a later assertion.
    """
    return any(
        not MEASUREMENT_QUALIFICATION.search(statement[: match.start()])
        for match in MEASURED_ASSERTION.finditer(statement)
    )


def statement_numbers(statement: str) -> list[str]:
    # Source identifiers are locators, not signed scientific measurements.
    text = re.sub(r"\bPSI-[0-9]+\b", "", statement)
    return [token.replace(",", "") for token in NUMBER.findall(text)]


def numeric_mentions(
    statement: str, *, locator_spans: list[tuple[int, int]] | None = None
) -> list[tuple[str, str | None]]:
    # Preserve offsets so independently checked source locators can be excluded
    # without changing the positions of physical quantities elsewhere.
    text = re.sub(r"\bPSI-[0-9]+\b", lambda match: " " * len(match.group()), statement)
    # 'page6mm' still contains a physical scalar. Mask only the label prefix;
    # a number is excluded only when a locator checker supplies its exact span.
    text = ATTACHED_POSITION_PREFIX.sub(lambda match: " " * len(match.group()), text)
    result = []
    unit_spans: list[tuple[int, int]] = []
    for match in NUMBER.finditer(text):
        if any(
            start <= match.start()
            and (match.end() <= end or (match.end() == end + 1 and text[end : match.end()] == "."))
            for start, end in locator_spans or []
        ):
            continue
        if any(
            start <= match.start()
            and (match.end() <= end or (match.end() == end + 1 and text[end : match.end()] == "."))
            for start, end in unit_spans
        ):
            # A recognized caret exponent is part of its scalar's unit. NUMBER
            # may also absorb the sentence period; fractional exponents remain checked.
            continue
        unit = UNIT_PATTERN.match(text, match.end())
        if unit is not None:
            unit_spans.append(unit.span())
        result.append((match.group().replace(",", ""), UNIT_NAMES[unit.group(1)] if unit else None))
    return result


def _covering_line_anchors(
    anchors: list[tuple[str, EvidenceAnchor]], first: int, last: int
) -> list[dict] | None:
    cursor = first
    used = []
    for fact_id, anchor in sorted(anchors, key=lambda item: item[1].source_row or 0):
        start, end = anchor.source_row, anchor.line_end
        if start is None or end is None or end < cursor:
            continue
        if start > cursor:
            return None
        used.append({"fact_id": fact_id, "anchor": anchor.model_dump(mode="json")})
        cursor = max(cursor, end + 1)
        if cursor > last:
            return used
    return None


def check_source_line_locators(
    statement: str, facts: list[EvidenceFact]
) -> tuple[list[tuple[int, int]], list[dict], list[str]]:
    """Qualify source-line positions separately from scientific quantities.

    Every position in a cited range/list must have coverage in one retained
    source identity. Anchor positions never become physical numeric evidence.
    """
    groups: dict[tuple[object, ...], list[tuple[str, EvidenceAnchor]]] = {}
    for fact in facts:
        if fact.origin in WEAK_ORIGINS or fact.origin == "user_supplied_input":
            continue
        for source in fact.sources:
            if source.get("kind") != "text_lines":
                continue
            try:
                anchor = EvidenceAnchor.model_validate(source)
            except ValidationError:
                continue
            identity = (
                anchor.snapshot_id,
                anchor.source_kind,
                anchor.source_sha256,
                anchor.accession,
                anchor.investigation_version,
                anchor.asset_id,
            )
            groups.setdefault(identity, []).append((fact.id, anchor))

    spans, support, errors = [], [], []
    for match in LINE_LOCATOR.finditer(statement):
        # A physical quantity such as 'line 18 mm' remains a quantity even if a
        # retained source happens to have an eighteenth line.
        if UNIT_PATTERN.match(statement, match.end()):
            continue
        ranges = []
        for part in LINE_RANGE_PART.finditer(match.group("ranges")):
            first_text, last_text = part.group("first"), part.group("last") or part.group("first")
            if not first_text.isdigit() or not last_text.isdigit():
                break
            first, last = int(first_text), int(last_text)
            if first < 1 or last < first:
                break
            ranges.append((first, last))
        else:
            for anchors in groups.values():
                covered = [_covering_line_anchors(anchors, first, last) for first, last in ranges]
                if ranges and all(item is not None for item in covered):
                    spans.append(match.span())
                    support.append(
                        {
                            "locator": match.group(),
                            "kind": "text_lines",
                            "ranges": [{"first": first, "last": last} for first, last in ranges],
                            "supporting_anchors": [
                                entry for item in covered if item for entry in item
                            ],
                        }
                    )
                    break
            else:
                errors.append(
                    "A source-line locator lacks coverage in the cited same-source anchors."
                )
            continue
        errors.append(
            "A source-line locator requires positive integer positions in ascending order."
        )
    return spans, support, errors


def _publication_scopes(facts: list[EvidenceFact]) -> list[dict]:
    """Collect only publication identities backed by inspected, anchored fields."""
    scopes = []
    for fact in facts:
        if fact.origin not in {"source_text", "source_measurement", "source_metadata"}:
            continue
        content = fact.content
        asset = content.get("asset")
        if (
            not isinstance(asset, dict)
            or asset.get("kind") != "publication_table"
            or asset.get("origin") not in {"published_table_transcription", "planned_conditions"}
            or content.get("asset_id") != asset.get("id")
            or content.get("source_sha256") != asset.get("sha256")
            or not re.fullmatch(r"[a-f0-9]{64}", asset.get("sha256", ""))
        ):
            continue
        anchors = {}
        for source in fact.sources:
            if source.get("kind") != "table_cell":
                continue
            try:
                anchor = EvidenceAnchor.model_validate(source)
            except ValidationError:
                continue
            if (
                anchor.snapshot_id == content.get("snapshot_id")
                and anchor.source_kind == asset.get("source_kind")
                and anchor.accession == asset.get("accession")
                and anchor.investigation_version == asset.get("investigation_version")
                and anchor.asset_id == asset.get("id")
                and anchor.source_sha256 == asset.get("sha256")
            ):
                anchors[(anchor.source_row, anchor.column)] = anchor
        labels: dict[str, set[str]] = {"row": set(), "sample": set(), "case": set()}
        used = []
        headers = content.get("headers", [])
        for row in content.get("records", []):
            cells = row.get("raw_cells", [])
            for field in row.get("fields", []):
                column = field.get("column_index")
                field_anchor = anchors.get((row.get("source_row"), column))
                if (
                    field_anchor is None
                    or not isinstance(column, int)
                    or not 0 <= column < min(len(cells), len(headers))
                    or field.get("raw_text") != cells[column]
                    or field.get("source_column") != headers[column]
                ):
                    continue
                used.append({"fact_id": fact.id, "anchor": field_anchor.model_dump(mode="json")})
                if field.get("source_value_kind") != "code" or not cells[column].strip():
                    continue
                label = cells[column].strip().casefold()
                labels["row"].add(label)
                for kind in ("sample", "case"):
                    if kind in headers[column].casefold():
                        labels[kind].add(label)
        if not used:
            continue
        for reference in asset.get("source_provenance", []):
            document_id, page = reference.get("document_id"), reference.get("page")
            if (
                not isinstance(document_id, str)
                or not re.fullmatch(r"[0-9]{11}", document_id)
                or type(page) is not int
                or page < 1
                or reference.get("source_url") != f"https://ntrs.nasa.gov/citations/{document_id}"
                or not re.fullmatch(r"[a-f0-9]{64}", reference.get("sha256", ""))
            ):
                continue
            scopes.append(
                {
                    "fact_id": fact.id,
                    "document_id": document_id,
                    "source_sha256": reference["sha256"],
                    "page": str(page),
                    "table": str(reference.get("table", "")).casefold(),
                    "labels": labels,
                    "supporting_anchors": used,
                }
            )
    return scopes


def check_publication_locators(
    statement: str, facts: list[EvidenceFact]
) -> tuple[list[tuple[int, int]], list[dict], list[str]]:
    """Check table/page/sample positions against one inspected publication identity.

    Locator numerals never become scientific evidence. A table from one fact and
    a page or sample from another cannot jointly establish a publication locator.
    """
    requested = []
    for match in PUBLICATION_POSITION.finditer(statement):
        if UNIT_PATTERN.match(statement, match.end()):
            continue
        position = match.group("position")
        trailing = statement[match.end() : match.end() + 1]
        if (
            not position.isdigit()
            or int(position) < 1
            or (trailing and trailing.isalnum())
            or re.match(r",\d", statement[match.end() :])
        ):
            return [], [], ["A publication locator requires an exact positive integer position."]
        kind = match.group("kind").lower()
        value = f"table {int(position)}" if kind == "table" else str(int(position))
        requested.append((match.span(), match.group(), kind, value))
    row_matches = [
        *PUBLICATION_ROW.finditer(statement),
        *PUBLICATION_REVERSED_ROW.finditer(statement),
    ]
    for match in row_matches:
        label = match.group("label")
        if not any(character.isdigit() for character in label):
            continue
        if (
            match.re is PUBLICATION_REVERSED_ROW
            and NUMBER.fullmatch(label)
            and not (match.group("opening_quote") and match.group("closing_quote"))
        ):
            # '2 samples' is a count, not a sample identifier. Numeric-only
            # reverse labels require quotation marks before anchor matching.
            continue
        numeral = NUMBER.match(label)
        if UNIT_PATTERN.match(statement, match.end()) or (
            numeral is not None and UNIT_PATTERN.match(label, numeral.end())
        ):
            continue
        if re.match(r"[.,]\d", statement[match.end() :]):
            return [], [], ["A publication sample locator must match the full reported identifier."]
        requested.append(
            (match.span(), match.group(), match.group("kind").lower(), label.casefold())
        )
    if not requested:
        return [], [], []
    for scope in _publication_scopes(facts):
        if all(
            (scope[kind] == value if kind in {"table", "page"} else value in scope["labels"][kind])
            for _, _, kind, value in requested
        ):
            return (
                [span for span, _, _, _ in requested],
                [
                    {
                        "locator": text,
                        "kind": "publication_table",
                        "locator_kind": kind,
                        "document_id": scope["document_id"],
                        "source_sha256": scope["source_sha256"],
                        "page": int(scope["page"]),
                        "table": scope["table"],
                        "supporting_anchors": scope["supporting_anchors"],
                    }
                    for _, text, kind, _ in requested
                ],
                [],
            )
    return (
        [],
        [],
        ["A publication locator lacks coverage in the cited same-publication field anchors."],
    )


def source_backed(fact: EvidenceFact) -> bool:
    if (
        fact.content.get("artifact_type") == "educational_simulation"
        or fact.content.get("parameter_origin") == "analyst_assumptions"
    ):
        return False
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
    registered_droplet_points = (
        fact.origin == "deterministic_calculation"
        and fact.content.get("artifact_type") == "educational_simulation"
        and fact.content.get("model_id") == MODEL_ID
        and fact.content.get("method_id") == MODEL_ID
    )

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
                    candidate = Decimal(token.replace(",", ""))
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
                raw = value.get("raw_text", "").strip()
                if NUMBER.fullmatch(raw):
                    raw = raw.replace(",", "")
                numeral = source_scalar_text(raw, unit)
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
                if name == "points" and value is fact.content and registered_droplet_points:
                    if isinstance(nested, (list, tuple)):
                        for point in nested:
                            if not isinstance(point, dict):
                                continue
                            for channel in DropletVisualizationPoint.model_fields:
                                scalar = point.get(channel)
                                if isinstance(scalar, (int, float, Decimal)):
                                    append(scalar, fact.origin, MODEL_UNITS[channel])
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
    if NUMBER.fullmatch(token) is None:
        return None
    displayed = Decimal(token.replace(",", ""))
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

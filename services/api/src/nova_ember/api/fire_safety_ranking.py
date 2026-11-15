"""Rank retained research by stated fire-safety focus and available material."""

import re
from collections import defaultdict
from typing import Literal

FireSafetyArea = Literal["prevention", "detection", "suppression"]

DIRECT_PATTERNS = {
    "prevention": re.compile(
        r"flammab|flame (?:growth and )?spread|fire spread|solid fuel|solid material", re.I
    ),
    "detection": re.compile(r"smoke|aerosol|particulate|detector", re.I),
    "suppression": re.compile(r"suppressants?|extinguishing agent", re.I),
}
RELATED_PATTERNS = {
    "prevention": re.compile(r"flame growth|fire growth|ignition|solid fuel", re.I),
    "detection": re.compile(r"smoke|aerosol|soot|fire detection", re.I),
    "suppression": re.compile(r"suppression|extinction|extinguishment|quenching|blowoff", re.I),
}
DATA_ORDER = {"source_table": 0, "conditions_table": 1, "other_assets": 2, "catalog_only": 3}


def _focus(area: FireSafetyArea, metadata: dict, classified: dict, anchor):
    """Find a literal source statement; contextual applications remain related."""
    objective = metadata.get("objective") or ""
    if isinstance(objective, str):
        match = DIRECT_PATTERNS[area].search(objective)
        if area == "detection" and (
            not re.search(r"aerosol|particulate|particle.{0,30}siz|detector", objective, re.I)
            or re.search(r"numerical simulation|computational", objective, re.I)
        ):
            match = None
        if match:
            return "direct", {
                "field": "objective",
                "quote": objective[max(0, match.start() - 60) : match.end() + 100],
                "anchor": anchor("objective"),
            }
    if area == "prevention":
        for item in classified["purpose"]:
            if item["value"].casefold() == "material flammability" and item["anchor"]:
                return "direct", {
                    "field": item["anchor"]["field"],
                    "quote": item["quote"],
                    "anchor": item["anchor"],
                }
    if isinstance(objective, str):
        if match := RELATED_PATTERNS[area].search(objective):
            return "related", {
                "field": "objective",
                "quote": objective[max(0, match.start() - 60) : match.end() + 100],
                "anchor": anchor("objective"),
            }
    if area == "prevention":
        for item in classified["purpose"]:
            if item["value"].casefold() == "solid fuels" and item["anchor"]:
                return "related", {
                    "field": item["anchor"]["field"],
                    "quote": item["quote"],
                    "anchor": item["anchor"],
                }
    purpose = {
        "prevention": "Material flammability",
        "detection": "Detection research",
        "suppression": "Suppression research",
    }[area]
    for item in classified["purpose"]:
        if item["value"] == purpose and item["anchor"]:
            return "related", {
                "field": item["anchor"]["field"],
                "quote": item["quote"],
                "anchor": item["anchor"],
            }
    if area == "suppression":
        for item in classified["outcome"]:
            if "extinction" in item["value"].casefold() and item["anchor"]:
                return "related", {
                    "field": item["anchor"]["field"],
                    "quote": item["quote"],
                    "anchor": item["anchor"],
                }
    return None


def rank_fire_safety(service, area: FireSafetyArea, snapshot_id: str | None) -> dict:
    snapshot = service.corpus.snapshot(snapshot_id)
    assets = defaultdict(list)
    for asset in snapshot["manifest"]["assets"]:
        assets[asset["accession"]].append(asset)
    catalog = service.catalog_classifications(snapshot)
    items = []
    for record in snapshot["manifest"]["investigations"]:
        if record.get("record_type") == "program":
            continue
        metadata = service._metadata(record)

        def anchor(field, record=record):
            return service.metadata_anchor(snapshot["snapshot_id"], record, field).model_dump(
                mode="json"
            )

        classified = catalog[record["accession"]]
        focused = _focus(area, metadata, classified, anchor)
        if not focused:
            continue
        relevance, evidence = focused
        available = assets[record["accession"]]
        has_table = any(
            asset.get("kind") in {"experimental_table", "publication_table"} for asset in available
        )
        if has_table and record.get("data_status") == "reported_conditions":
            data_availability = "conditions_table"
        elif has_table:
            data_availability = "source_table"
        elif available:
            data_availability = "other_assets"
        else:
            data_availability = "catalog_only"
        items.append(
            {
                "investigation": {
                    key: record.get(key) for key in ("accession", "acronym", "title")
                },
                "relevance": relevance,
                "evidence": evidence,
                "data_availability": data_availability,
                "asset_count": len(available),
                "data_status": record.get("data_status"),
            }
        )

    def group(item):
        return (0 if item["relevance"] == "direct" else 1, DATA_ORDER[item["data_availability"]])

    items.sort(key=lambda item: (*group(item), item["investigation"]["accession"]))
    previous = None
    rank = 0
    for position, item in enumerate(items, 1):
        current = group(item)
        if current != previous:
            rank, previous = position, current
        item["rank"] = rank
    return {
        "snapshot_id": snapshot["snapshot_id"],
        "area": area,
        "method": "fire-safety-evidence-v1",
        "criteria": [
            "Direct topic terms in source objectives precede related research mentions.",
            "Within each focus group, retained source tables precede condition-only tables, "
            "other assets and catalog-only studies.",
            "Equal groups share a rank and are ordered by accession.",
        ],
        "items": items,
    }

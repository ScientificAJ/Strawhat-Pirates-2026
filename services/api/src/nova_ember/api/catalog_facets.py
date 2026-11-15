"""Source-pinned catalog classifications, distinct from measured run conditions."""

from __future__ import annotations

from collections import Counter
from collections.abc import Callable
from typing import Literal

FacetName = Literal[
    "purpose",
    "fuel_phase",
    "material",
    "facility",
    "sensor",
    "outcome",
    "publication",
    "review_state",
]
UNKNOWN = "__unknown__"
FACET_LABELS: dict[str, str] = {
    "purpose": "Declared scientific purpose / focus",
    "fuel_phase": "Fuel phase in catalog scope",
    "material": "Material / fuel named in catalog",
    "facility": "Declared facility / apparatus",
    "sensor": "Instrument named in catalog",
    "outcome": "Declared endpoint / research target",
    "publication": "Listed publication",
    "review_state": "Scientific review state",
}
ANNOTATION_VERSION = "catalog-focus-annotations-v1"
# Each annotation was selected from the exact retained objective/approach capture.
# Hash pinning prevents a later statement with different context inheriting this classification.
ANNOTATIONS: dict[str, tuple[str, tuple[tuple[str, str, str, str], ...]]] = {
    "PSI-10": (
        "a20756e7acf67f0046a21a3bce9bfca7f142cd5350350c0dad29997cf8fe28db",
        (
            ("sensor", "Cameras", "approach", "cameras"),
            ("sensor", "Radiometers", "approach", "radiometers"),
            ("sensor", "Thermocouples", "approach", "thermocouples"),
            ("outcome", "Soot inception", "objective", "soot-inception limits"),
            ("outcome", "Extinction limits", "objective", "extinction limits"),
        ),
    ),
    "PSI-20": (
        "ea118e19d02785f54d246406aacea93878053ff95ddd5bdca44bd29c09a753d1",
        (
            (
                "purpose",
                "Material flammability",
                "objective",
                "burning conditions in a quiescent microgravity ambient "
                "in terms of material properties",
            ),
        ),
    ),
    "PSI-21": (
        "99a5e58119a9c01ec1b57dfe03d696fb8d05b494a3658338b0f2abb077a72ac5",
        (
            ("material", "Methane", "objective", "methane"),
            ("material", "Ethylene", "objective", "ethylene"),
            ("sensor", "Thin-filament pyrometry", "approach", "thin-filament pyrometry"),
            ("outcome", "Extinction limits", "objective", "extinction limits"),
        ),
    ),
    "PSI-22": (
        "a491519f60b91c9eb2272e651846103f34006867fb74535911e8c18448e48a09",
        (
            ("fuel_phase", "Gaseous fuel focus", "approach", "gas-fueled flames"),
            ("material", "Methane", "approach", "Methane"),
            ("material", "Ethylene", "approach", "ethylene"),
            ("sensor", "Thermopile detectors", "approach", "thermopile detectors"),
            ("outcome", "Ion current", "objective", "chemi-ion current"),
        ),
    ),
    "PSI-23": (
        "a89bd634a661e724b9bc766a8f217bc0c76c816f0db973991847bce6b53802d7",
        (
            ("material", "Hydrogen", "approach", "hydrogen"),
            ("material", "Methane", "approach", "methane"),
            ("material", "Ethylene", "approach", "ethylene"),
            ("outcome", "Extinction limits", "objective", "extinction limits"),
        ),
    ),
    "PSI-25": (
        "b9234754db5da651ad27d888af082b889d07210b018e543369662f065b4ec2da",
        (
            (
                "purpose",
                "Detection research",
                "objective",
                "fire detection and suppression systems",
            ),
            (
                "purpose",
                "Suppression research",
                "objective",
                "fire detection and suppression systems",
            ),
            (
                "purpose",
                "Material flammability",
                "objective",
                "actual material flammability in microgravity",
            ),
            ("fuel_phase", "Solid fuel focus", "objective", "solid fuels"),
            ("outcome", "Flame spread", "objective", "flame spread"),
            ("outcome", "Extinction limits", "objective", "extinction limits"),
        ),
    ),
    "PSI-26": (
        "9dee45d44bb736178db270a07c9ee8f98ac02ee810189ab518271fd4720c0533",
        (
            ("purpose", "Suppression research", "objective", "gaseous extinguishing agent"),
            (
                "purpose",
                "Material flammability",
                "objective",
                "actual material flammability in microgravity",
            ),
            ("material", "Cotton / fiberglass fabric", "approach", "75% cotton and 25% fiberglass"),
            ("material", "Nomex", "approach", "Nomex"),
            ("material", "Ultem", "approach", "Ultem"),
            ("outcome", "Flame spread", "approach", "flame spread"),
        ),
    ),
    "PSI-39": (
        "ab2501bbe6200dabd012e7bf199e79426f8d19eb484c2af421183bb61b558d35",
        (
            ("material", "n-Dodecane", "objective", "n-dodecane"),
            ("material", "Farnesane", "approach", "farnesane"),
            ("sensor", "UV camera", "approach", "UV camera"),
            ("sensor", "Radiometers", "approach", "radiometers"),
            ("outcome", "Flame extinction", "objective", "flame extinction"),
        ),
    ),
    "PSI-47": (
        "60ff7a7d0ef34c3043dda4133f277045ba72addb1fb2fc2e9f02e0550d0eb389",
        (
            (
                "purpose",
                "Detection research",
                "researchImpacts",
                "development of novel fire and smoke detection systems",
            ),
            (
                "purpose",
                "Aerosol instrument characterization",
                "objective",
                "quantify smoke aerosols",
            ),
            ("material", "Arizona Red Dust aerosol standard", "approach", "Arizona Red Dust (ARD)"),
            ("sensor", "Modified TSI P-Trak", "objective", "modified P-Trak particulate counter"),
            ("sensor", "DustTrak control", "objective", "DustTrak control"),
            ("outcome", "Aerosol counting", "approach", "counting aerosol particles"),
        ),
    ),
    "PSI-68": (
        "de041dc1dc8b093e8f168b36d3b06cab257b4d75ffb24ff21754b8af4256ebcf",
        (
            ("fuel_phase", "Liquid fuel focus", "objective", "liquid-phase mixing"),
            ("sensor", "Color camera", "approach", "color camera video"),
            ("outcome", "Flame extinction", "objective", "flame extinction mechanisms"),
            ("outcome", "Soot formation", "objective", "soot formation process"),
        ),
    ),
    "PSI-69": (
        "a2d8ec5d0e9ad1060f6ecc7a850598634cc5519c373ae70462bf76c31fc8731c",
        (
            (
                "purpose",
                "Suppression research",
                "objective",
                "effectiveness of various gaseous fire suppressants",
            ),
            ("fuel_phase", "Liquid fuel focus", "objective", "liquid fuels"),
            ("outcome", "Limiting Oxygen Index", "approach", "Limiting Oxygen Index (LOI)"),
            ("outcome", "Flame extinction", "objective", "flame extinction behavior"),
        ),
    ),
    "PSI-98": (
        "501b5f625733e29c0c6ff0c12b3de1a3e960a159a8c8f8a21ba5c5803afe0570",
        (
            (
                "purpose",
                "Material flammability",
                "objective",
                "material flammability screening test",
            ),
            (
                "material",
                "SIBAL cotton / fiberglass composite",
                "approach",
                "composite fabric called Sibal",
            ),
            ("sensor", "Cameras", "approach", "two cameras"),
            ("sensor", "Thermocouples", "approach", "thermocouples"),
            ("sensor", "Radiometers", "approach", "radiometers"),
            ("outcome", "Fire growth", "objective", "how rapidly a large scale fire grows"),
        ),
    ),
    "PSI-99": (
        "2c042a6bd82fa6b437cae61490d54ea91f890a52282bc5949b4a0119bcbf6633",
        (
            (
                "purpose",
                "Material flammability",
                "objective",
                "material flammability screening test",
            ),
            ("material", "SIBAL cotton / fiberglass composite", "approach", "SIBAL"),
            ("material", "Silicone", "approach", "silicone"),
            ("material", "PMMA", "approach", "structure PMMA, flat PMMA, and PMMA with Nomex"),
            ("material", "Nomex", "approach", "Nomex"),
            ("sensor", "Cameras", "approach", "two cameras"),
            ("sensor", "Thermocouples", "approach", "thermocouples"),
            ("sensor", "Radiometers", "approach", "radiometers"),
            ("outcome", "Fire growth", "objective", "how rapidly a large scale fire grows"),
        ),
    ),
    "PSI-100": (
        "9c836955a28ff129b2f239f9499e06f4ca52ba58f7a03d384a7bd0528c8bbe10",
        (
            (
                "purpose",
                "Material flammability",
                "objective",
                "material flammability screening test",
            ),
            ("outcome", "Fire growth", "objective", "how rapidly a large scale fire grows"),
        ),
    ),
    "PSI-101": (
        "e0aa75d015705a5943b51dbb4a8ba52751a35e4cafc2307d9201d77ebed711a5",
        (
            (
                "purpose",
                "Detection research",
                "researchImpacts",
                "technology for an advanced fire detector",
            ),
            (
                "purpose",
                "Smoke characterization",
                "objective",
                "smoke generation and smoke transport conditions",
            ),
            ("material", "Pyrell foam", "approach", "Pyrell®"),
            ("sensor", "M-pass", "approach", "a new instrument, M-pass"),
            (
                "outcome",
                "Smoke particle size",
                "objective",
                "quantify the sizes that the liquid smoke particulate achieves",
            ),
        ),
    ),
    "PSI-102": (
        "fe221f1380ad3317f70b559a3213c4e00ef3676b40838a49cb5b3cba89dea5ba",
        (
            (
                "purpose",
                "Smoke characterization",
                "objective",
                "smoke generation and smoke transport conditions",
            ),
            ("purpose", "Detection research", "approach", "response of the detectors"),
            ("sensor", "Smoke detectors", "approach", "two smoke detectors"),
            (
                "sensor",
                "Transmission electron microscope",
                "approach",
                "Transmission Electron microscope (TEM)",
            ),
            (
                "outcome",
                "Smoke particle size",
                "objective",
                "quantify the sizes that the liquid smoke particulate achieves",
            ),
        ),
    ),
    "PSI-106": (
        "f705b2e04bd00d05f3c74ae55391c340b5a08d60efa8193e66b7c4e2518d9d5d",
        (
            ("material", "Methane", "approach", "methane"),
            ("material", "Ethylene", "approach", "ethylene"),
            ("sensor", "Camera", "approach", "high resolution camera"),
            ("outcome", "Flame stability", "objective", "stability of laminar diffusion flames"),
        ),
    ),
    "PSI-107": (
        "f31081deb2b079373a0cbc98ad8483d87856aeca1aa6946ce31acff6cefcfbf2",
        (
            ("material", "Methane", "approach", "methane"),
            ("material", "Ethylene", "approach", "ethylene"),
            ("material", "Propane", "approach", "propane"),
            ("material", "Propylene", "approach", "propylene"),
            ("sensor", "Cameras", "approach", "cameras"),
            ("outcome", "Smoke point", "objective", "smoke-point properties"),
        ),
    ),
    "PSI-115": (
        "9c5b463fbe8fe8ed034229cbabd6c498f48ca9bb636196084ed2046eb2e41484",
        (
            ("purpose", "Computational smoke research", "objective", "numerical simulation"),
            ("material", "Dibutyl phthalate (simulated)", "approach", "dibutyl-phthalate (DBP)"),
            (
                "outcome",
                "Particle size distributions (simulated)",
                "approach",
                "particle size distributions",
            ),
        ),
    ),
    "PSI-117": (
        "13e50b67d851dcf8bfc09103055995a17d89174589080d7103fa54ef1e02a794",
        (
            ("purpose", "Computational cool-flame research", "approach", "3-D CFD model"),
            (
                "outcome",
                "Extinction diameters (model observables)",
                "approach",
                "extinction diameters",
            ),
        ),
    ),
    "PSI-142": (
        "c55ab5d3140025e16ef25ac37a99158d510c2e3c170c04dabc8993bd548a3506",
        (
            ("material", "n-Heptane / air mixture", "approach", "n-heptane/air mixture"),
            ("material", "Dimethyl ether / air mixture", "approach", "dimethyl ether (DME)"),
            ("outcome", "Extinction limits", "objective", "extinction limits"),
        ),
    ),
    "PSI-159": (
        "e01abe2caa309753a9bee1b0c3c79dec194a2a7300d0d13541e0dcf25e3b0ea5",
        (
            ("material", "Propane", "objective", "propane"),
            ("material", "n-Butane", "objective", "n-butane"),
            ("material", "n-Pentane", "objective", "n-pentane"),
            ("sensor", "Cameras", "approach", "cameras"),
            ("sensor", "Radiometers", "approach", "radiometers"),
            ("sensor", "Thermocouples", "approach", "thermocouples"),
            (
                "outcome",
                "Cool diffusion flame occurrence",
                "objective",
                "conditions for which cool diffusion flames occur",
            ),
        ),
    ),
}


def classifications(
    record: dict,
    metadata: dict,
    anchor: Callable[[str], dict],
    facility_aliases: dict[str, str],
) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = {name: [] for name in FACET_LABELS}

    def add(facet: str, value: str, field: str, quote: str, origin: str) -> None:
        if any(item["value"] == value for item in result[facet]):
            return
        result[facet].append(
            {
                "value": value,
                "label": value,
                "origin": origin,
                "quote": quote,
                "anchor": anchor(field),
                "scope": "catalog_focus_not_run_condition",
            }
        )

    focus = metadata.get("subResearchArea") or metadata.get("researchArea")
    if isinstance(focus, str) and focus.strip():
        field = "subResearchArea" if metadata.get("subResearchArea") else "researchArea"
        add("purpose", focus.strip(), field, focus, "source_declared_metadata")
        if focus.casefold().strip() in {
            "flames of gaseous fuels",
            "flames of gaseous fuel",
            "gaseous",
        }:
            add(
                "fuel_phase",
                "Gaseous fuel focus",
                field,
                focus,
                "source_declared_research_category",
            )
    hardware = metadata.get("experimentHardware")
    if isinstance(hardware, str):
        for name in hardware.split(","):
            name = name.strip()
            if name:
                add(
                    "facility",
                    facility_aliases.get(name, name),
                    "experimentHardware",
                    name,
                    "source_declared_apparatus_name",
                )
    publications = metadata.get("publications")
    if isinstance(publications, list):
        for publication in publications:
            if not isinstance(publication, dict):
                continue
            title, doi = publication.get("title"), publication.get("doi")
            if isinstance(title, str) and title.strip():
                add(
                    "publication",
                    title.strip(),
                    "publications",
                    title,
                    "source_listed_publication_not_verified_finding",
                )
            if isinstance(doi, str) and doi.strip():
                add(
                    "publication",
                    "DOI " + doi.strip(),
                    "publications",
                    doi,
                    "source_listed_publication_not_verified_finding",
                )
    curated = ANNOTATIONS.get(record["accession"])
    if curated and curated[0] == record["metadata_sha256"]:
        for facet, value, field, quote in curated[1]:
            if isinstance(metadata.get(field), str) and quote in metadata[field]:
                add(facet, value, field, quote, "source_pinned_catalog_annotation")
    for name, values in result.items():
        if not values:
            values.append(
                {
                    "value": UNKNOWN,
                    "label": "Not classified; no formal scientific review recorded"
                    if name == "review_state"
                    else "Not classified / not reported",
                    "origin": "not_formally_reviewed" if name == "review_state" else "not_curated",
                    "quote": None,
                    "anchor": None,
                    "scope": "catalog_focus_not_run_condition",
                }
            )
    return result


def matches_facets(values: dict[str, list[dict]], selected: dict, omit: str | None = None) -> bool:
    return all(
        name == omit or bool({item["value"] for item in values[name]}.intersection(options))
        for name, options in selected.items()
        if options
    )


def facet_counts(
    catalog: dict[str, dict[str, list[dict]]],
    accessions: list[str],
    selected: dict,
    entity_level: str,
) -> list[dict]:
    facets = []
    for name, label in FACET_LABELS.items():
        labels = {
            item["value"]: item["label"] for values in catalog.values() for item in values[name]
        }
        labels.setdefault(UNKNOWN, "Not classified / not reported")
        counts: Counter[str] = Counter()
        for accession in accessions:
            values = catalog[accession]
            if matches_facets(values, selected, omit=name):
                counts.update({item["value"] for item in values[name]})
        facets.append(
            {
                "name": name,
                "label": label,
                "entity_level": entity_level,
                "count_policy": "other_filters_applied_own_facet_excluded",
                "options": [
                    {"value": value, "label": labels[value], "count": counts[value]}
                    for value in sorted(
                        labels, key=lambda value: (value == UNKNOWN, labels[value].casefold())
                    )
                ],
            }
        )
    return facets

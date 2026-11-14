"""Joint condition coverage over explicit source records, not synthetic replicates."""

from __future__ import annotations

import json
from collections import Counter
from itertools import product
from typing import Literal

from nova_ember.domain.records import SourceRecord
from pydantic import Field, model_validator

from .contracts import Contract


class CoverageAxis(Contract):
    quantity_kind: str = Field(min_length=1, max_length=128)
    source_column: str | None = Field(default=None, max_length=256)
    location: str | None = Field(default=None, max_length=128)
    basis: str | None = Field(default=None, max_length=128)
    kind: Literal["numeric", "categorical"]
    canonical_unit: str | None = Field(default=None, max_length=64)
    bin_edges: tuple[float, ...] = Field(default=(), max_length=51)

    @model_validator(mode="after")
    def validate_numeric_bins(self) -> CoverageAxis:
        if self.kind == "numeric" and self.canonical_unit is None:
            raise ValueError("A numeric coverage axis requires its canonical unit.")
        if self.kind == "categorical" and (self.bin_edges or self.canonical_unit):
            raise ValueError("Categorical coverage preserves source labels without numeric bins.")
        if self.bin_edges and (
            len(self.bin_edges) < 2
            or any(a >= b for a, b in zip(self.bin_edges, self.bin_edges[1:], strict=False))
        ):
            raise ValueError("Coverage bin edges must be finite and strictly increasing.")
        return self


def axis_value(record: SourceRecord, axis: CoverageAxis) -> dict:
    candidates = [
        field
        for field in record.fields
        if field.quantity_kind == axis.quantity_kind
        and (axis.source_column is None or field.source_column == axis.source_column)
        and (axis.location is None or field.location == axis.location)
        and (axis.basis is None or field.basis == axis.basis)
    ]
    if len(candidates) != 1:
        return {
            "state": "unknown",
            "reason": "field_absent" if not candidates else "ambiguous_field_selection",
            "value": None,
        }
    field = candidates[0]
    if axis.kind == "categorical":
        if not field.raw_text.strip() or field.missing_reason:
            return {
                "state": "unknown",
                "reason": field.missing_reason or "not_reported",
                "value": None,
            }
        return {
            "state": "reported_label",
            "value": field.raw_text,
            "source_column": field.source_column,
        }
    if field.canonical_value is None or field.canonical_unit != axis.canonical_unit:
        return {
            "state": "unknown",
            "reason": field.missing_reason or "unresolved_quantity_or_unit",
            "value": None,
        }
    value = field.canonical_value
    if not axis.bin_edges:
        return {"state": "normalized_value", "value": value, "unit": axis.canonical_unit}
    for index, (lower, upper) in enumerate(zip(axis.bin_edges, axis.bin_edges[1:], strict=False)):
        last = index == len(axis.bin_edges) - 2
        if lower <= value and (value < upper or (last and value == upper)):
            return {
                "state": "selected_bin",
                "value": [lower, upper],
                "unit": axis.canonical_unit,
                "closure": "both" if last else "left",
            }
    return {"state": "outside_selected_bins", "value": value, "unit": axis.canonical_unit}


def joint_coverage(records: list[SourceRecord], axes: tuple[CoverageAxis, ...]) -> dict:
    if not 1 <= len(axes) <= 3 or len(records) > 5000:
        raise ValueError("Select one to three axes and at most 5,000 source records.")
    counts: Counter[tuple[str, ...]] = Counter()
    levels: list[set[str]] = [set() for _ in axes]
    values: dict[str, dict] = {}
    for record in records:
        key = []
        for index, axis in enumerate(axes):
            value = axis_value(record, axis)
            encoded = json.dumps(value, sort_keys=True, separators=(",", ":"))
            values[encoded] = value
            levels[index].add(encoded)
            key.append(encoded)
        counts[tuple(key)] += 1
    cells = [
        {
            "coordinates": [values[value] for value in key],
            "source_record_count": count,
            "independent_run_count": None,
        }
        for key, count in sorted(counts.items())
    ]
    combination_count = 1
    for level in levels:
        combination_count *= len(level)
    gaps = []
    if combination_count <= 1000:
        for combination in product(*(sorted(level) for level in levels)):
            if combination not in counts:
                gaps.append(
                    {
                        "coordinates": [values[value] for value in combination],
                        "state": "no_matching_source_record_in_snapshot",
                    }
                )
    return {
        "axes": axes,
        "cells": cells,
        "source_record_count": len(records),
        "independent_run_count": None,
        "unobserved_combinations": gaps,
        "unobserved_combination_count": combination_count - len(cells),
        "gap_listing_status": "complete_within_observed_axis_levels"
        if combination_count <= 1000
        else "too_many_combinations_to_list",
        "bin_policy": (
            "Left-closed/right-open; the final bin includes its upper "
            "edge. Outside-bin values remain visible."
        ),
        "limitations": [
            (
                "Counts describe selected source records, not independent "
                "replications or probabilities."
            ),
            (
                "Only combinations of observed source-axis levels are "
                "enumerated; unknown values stay explicit."
            ),
            (
                "An unobserved combination is a scoped corpus gap, not proof "
                "that the science is unstudied."
            ),
        ],
    }

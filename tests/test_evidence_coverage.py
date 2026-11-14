"""Known joint combinations preserve missingness and do not invent replicates."""

import pytest
from nova_ember.domain.records import SourceField, SourceRecord
from nova_ember.evidence.coverage import CoverageAxis, joint_coverage
from pydantic import ValidationError


def sample(line, label, value):
    fields = [
        SourceField(
            column_index=0, source_column="Material", raw_text=label, quantity_kind="material"
        )
    ]
    if value is not None:
        fields.append(
            SourceField(
                column_index=1,
                source_column="Speed",
                raw_text=str(value),
                quantity_kind="speed",
                status="normalized",
                canonical_value=value,
                canonical_unit="m/s",
                transformation_id="known-identity-v1",
                transformation_formula="canonical = raw",
            )
        )
    else:
        fields.append(
            SourceField(
                column_index=1,
                source_column="Speed",
                raw_text="",
                quantity_kind="speed",
                status="missing",
                missing_reason="not_reported",
            )
        )
    return SourceRecord(
        source_row=line,
        line_end=line,
        row_kind="condition_record",
        raw_cells=[label, str(value)],
        fields=fields,
    )


def test_joint_coverage_uses_actual_combinations_and_keeps_unknowns():
    axes = (
        CoverageAxis(quantity_kind="material", kind="categorical"),
        CoverageAxis(
            quantity_kind="speed", kind="numeric", canonical_unit="m/s", bin_edges=(0, 1, 2)
        ),
    )
    result = joint_coverage([sample(2, "A", 0.5), sample(3, "B", 1.5), sample(4, "B", None)], axes)
    assert result["source_record_count"] == 3
    assert len(result["cells"]) == 3
    assert result["independent_run_count"] is None
    assert result["unobserved_combination_count"] == 3
    assert all(
        gap["state"] == "no_matching_source_record_in_snapshot"
        for gap in result["unobserved_combinations"]
    )
    assert any(
        coordinate["state"] == "unknown"
        for cell in result["cells"]
        for coordinate in cell["coordinates"]
    )


def test_bin_boundaries_and_outside_values_remain_visible():
    axis = CoverageAxis(
        quantity_kind="speed", kind="numeric", canonical_unit="m/s", bin_edges=(0, 1, 2)
    )
    result = joint_coverage([sample(2, "A", 1), sample(3, "A", 2), sample(4, "A", 3)], (axis,))
    grouped = next(
        cell for cell in result["cells"] if cell["coordinates"][0]["state"] == "selected_bin"
    )
    assert grouped["coordinates"][0]["value"] == [1, 2]
    assert grouped["source_record_count"] == 2
    assert grouped["coordinates"][0]["closure"] == "both"
    assert any(
        cell["coordinates"][0]["state"] == "outside_selected_bins" for cell in result["cells"]
    )
    with pytest.raises(ValidationError):
        CoverageAxis(
            quantity_kind="speed", kind="numeric", canonical_unit="m/s", bin_edges=(0, 1, 1)
        )

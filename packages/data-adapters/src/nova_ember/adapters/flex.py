"""Source-preserving interpretation of the FLEX experimental table stop labels."""

from collections import Counter
from typing import Any

from nova_ember.domain.source import RawTable

FLEX_HEADERS = (
    "FLEX Test #",
    "FLEX Identifier",
    "Test Date",
    "Test GMT",
    "Fuel",
    "Ambient pressure; mmHg",
    "O initial ambient composition; mole fraction",
    "N initial ambient composition; mole fraction",
    "CO initial ambient composition; mole fraction",
    "He initial ambient composition; mole fraction",
    "Droplet initial diameter; mm",
    "Visible flame extinction diameter; mm",
    "Burning rate; mm",
    "Burn time; s",
    "Test end",
)

FLEX_LIMITATIONS = (
    "Counts describe source table records, not independently validated experimental replicates.",
    "Extinction, Disruption and Completion remain distinct source labels. "
    "Disruption is not evidence of no extinction.",
    "Visible flame disappearance does not by itself establish cessation of cool-flame combustion.",
    "The O, N and CO species headers require protocol confirmation before chemical interpretation.",
    "The source burning-rate header says mm; no conversion to mm²/s is authorized "
    "without protocol resolution.",
    "These observations do not prescribe whole-cabin suppression "
    "or establish a fire-risk probability.",
)


def summarize_flex(table: RawTable) -> dict[str, Any]:
    """Count exact labels; keep unknown labels and source line anchors visible."""
    if table.headers != FLEX_HEADERS:
        raise ValueError("FLEX source headers changed; the table mapping requires review")
    label_index = table.headers.index("Test end")
    counts: Counter[str] = Counter()
    source_rows = []
    for row in table.rows:
        if len(row.cells) != len(table.headers):
            raise ValueError(f"FLEX source line {row.row_number} has an unexpected column count")
        label = row.cells[label_index]
        counts[label] += 1
        source_rows.append(
            {
                "row_number": row.row_number,
                "label": label,
                "test_number": row.cells[0],
                "identifier": row.cells[1],
            }
        )
    return {
        "method_id": "flex-stop-label-counts-v1",
        "counts": [{"label": label, "count": counts[label]} for label in sorted(counts)],
        "total_rows": len(table.rows),
        "source_columns": list(table.headers),
        "source_rows": source_rows,
        "unrecognized_labels": sorted(set(counts) - {"Extinction", "Disruption", "Completion"}),
        "limitations": list(FLEX_LIMITATIONS),
        "claim_type": "derived_from_source_records",
        "independent_run_count": None,
    }

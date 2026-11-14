"""Source-bound analysis responses shared by the API and trusted worker."""

from nova_ember.adapters.psi import parse_csv_bytes

from .repository import Corpus, MissingSource


def flex_endpoints(corpus: Corpus, snapshot_id: str | None = None) -> dict:
    from nova_ember.adapters.flex import summarize_flex

    investigation = corpus.investigation("PSI-69", snapshot_id)
    candidates = [
        asset
        for asset in investigation["assets"]
        if asset["file_name"] == "PSI-69_Experimental table_FLEX.csv"
    ]
    if len(candidates) != 1:
        raise MissingSource("The source-verified FLEX experimental table is unavailable.")
    asset = candidates[0]
    table = parse_csv_bytes(corpus.asset_bytes(asset), asset["encoding"])
    summary = summarize_flex(table)
    return {
        "id": "flex-test-end-labels-v1",
        "title": "FLEX reported test-end labels",
        "snapshot_id": investigation["snapshot_id"],
        "origin": "derived_from_source_table",
        "asset": asset,
        **summary,
        "independent_run_count": None,
        "method": {
            "id": "flex-test-end-labels",
            "version": "1",
            "description": "Count source-reported test-end labels in nonempty table records.",
        },
    }


def compare_investigations(corpus: Corpus, accessions: list[str]) -> dict:
    snapshot_id = corpus.snapshot()["snapshot_id"]
    records = [corpus.investigation(accession, snapshot_id) for accession in accessions]
    return {
        "snapshot_id": snapshot_id,
        "investigations": records,
        "suitability": {
            "side_by_side": "supported",
            "quantitative_pooling": "unsupported",
            "scenario_transfer": "unresolved",
        },
        "conditions": [
            {"field": name, "status": "unknown", "reason": reason}
            for name, reason in (
                ("material", "No common, source-verified specimen mapping has been selected."),
                ("atmosphere", "Run-level composition, pressure and locations are not matched."),
                ("gravity", "A platform label is not a matched acceleration history."),
                ("flow", "Nominal controls are not interchangeable with calibrated local flow."),
                ("endpoint", "An investigation does not have one universal outcome definition."),
            )
        ],
        "limitations": [
            "This view compares investigation records, not an independently matched run cohort.",
            "Shared apparatus or similar names do not establish numerical comparability.",
            "Select verified runs and matching endpoint/protocol definitions before pooling.",
        ],
    }

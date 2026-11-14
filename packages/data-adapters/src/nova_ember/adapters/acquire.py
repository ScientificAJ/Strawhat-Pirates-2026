"""Capture the small, reviewed PSI starter collection without mirroring archives."""

import argparse
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from nova_ember.adapters.psi import (
    Capture,
    PsiClient,
    SourceUnavailable,
    catalog_records,
    manifest_files,
)

TABLES = {
    "PSI-20_Experimental table_ACME BRE.csv": "PSI-20",
    "PSI-25_Experimental table_BASS-II.csv": "PSI-25",
    "PSI-39_Experimental table_CFI.csv": "PSI-39",
    "PSI-47_Experimental table_DAFT.csv": "PSI-47",
    "PSI-68_Experimental table_Flex2.csv": "PSI-68",
    "PSI-69_Experimental table_FLEX.csv": "PSI-69",
    "PSI-99_Experimental table_SAFFIRE-2.csv": "PSI-99",
    "PSI-101_Experimental table_SAME-R.csv": "PSI-101",
    "PSI-159_Experimental table_CFI-G_Normal Flames.csv": "PSI-159",
    "PSI-159_Experimental table_CFI-G_Inverse Flames.csv": "PSI-159",
}

QUALITY_NOTES = {
    "PSI-10": [
        "Record license is unreported; redistribution requires source-specific rights review."
    ],
    "PSI-20": [
        "Rows summarize days and ranges; they are not independent test runs. "
        "Pressure is not identified for each flame."
    ],
    "PSI-25": [
        "Fan display settings are not calibrated flow velocity. "
        "This table supplies no explicit extinction label."
    ],
    "PSI-39": ["The experimental table contains conditions without an explicit outcome column."],
    "PSI-47": [
        "Rows describe dust sessions and hardware, not validated smoke-detector performance."
    ],
    "PSI-68": ["Eight summary rows describe condition ranges, not eight independent tests."],
    "PSI-69": [
        "Chemical species headers and the burning-rate unit require protocol resolution. "
        "Test-end labels remain distinct source categories."
    ],
    "PSI-98": [
        "Catalog platform/date claims conflict with the Cygnus experiment narrative; "
        "both source assertions remain preserved."
    ],
    "PSI-99": [
        "The table mixes sample rows, flow-visualization rows and footnotes; "
        "row counts do not equal test counts."
    ],
    "PSI-101": [
        "Condition metadata does not establish detector alarms or false-positive performance."
    ],
    "PSI-159": [
        "Normal and inverse configurations and chamber versus burner concentrations "
        "remain distinct. "
        "Empty rows are not trials."
    ],
}


def write_capture(root: Path, path: str, capture: Capture) -> dict[str, Any]:
    destination = root / path
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(capture.content)
    return {
        "path": path,
        "sha256": capture.sha256,
        "byte_size": len(capture.content),
        "source_url": capture.source_url,
        "fetched_at": capture.fetched_at,
    }


def normalize_metadata(metadata: dict[str, Any], capture: dict[str, Any]) -> dict[str, Any]:
    accession = metadata["accession"]
    return {
        "accession": accession,
        "title": metadata["title"],
        "acronym": metadata.get("investigationAcronym", ""),
        "doi": metadata.get("doi", ""),
        "version": metadata["version"],
        "description": metadata.get("description", ""),
        "objective": metadata.get("objective", ""),
        "approach": metadata.get("approach", ""),
        "research_area": metadata["researchArea"],
        "sub_research_area": metadata.get("subResearchArea", ""),
        "license": metadata.get("licenseIdentifier") or None,
        "license_scope": "investigation_metadata",
        "source_url": f"https://psi.nasa.gov/physci/repo/data/investigations/{accession}",
        "metadata_path": capture["path"],
        "metadata_sha256": capture["sha256"],
        "metadata_url": capture["source_url"],
        "fetched_at": capture["fetched_at"],
        "declared_bytes": int(metadata["totalFileSize"]),
        "hardware": metadata.get("experimentHardware", ""),
        "platform": metadata.get("flightProgram", ""),
        "quality_notes": QUALITY_NOTES.get(accession, []),
        "status": "metadata_available",
    }


def normalize_catalog(record: dict[str, Any], capture: dict[str, Any]) -> dict[str, Any]:
    accession = record["Accession"]
    return {
        "accession": accession,
        "title": record["Title"],
        "acronym": record.get("Acronym", ""),
        "doi": None,
        "version": None,
        "description": "",
        "objective": record.get("Objectives", ""),
        "approach": record.get("Approach", ""),
        "research_area": record["Research Area"],
        "sub_research_area": record.get("SubResearch Area", ""),
        "license": None,
        "source_url": f"https://psi.nasa.gov/physci/repo/data/investigations/{accession}",
        "metadata_path": capture["path"],
        "metadata_sha256": capture["sha256"],
        "metadata_url": capture["source_url"],
        "source_locator": {"Accession": accession},
        "fetched_at": capture["fetched_at"],
        "declared_bytes": None,
        "hardware": record.get("Experiment Hardware", ""),
        "platform": record.get("Flight Platform", ""),
        "quality_notes": QUALITY_NOTES.get(accession, []),
        "status": "catalog_only",
    }


def write_snapshot(root: Path, snapshot: dict[str, Any]) -> None:
    temporary = root / "snapshot.json.tmp"
    temporary.write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(root / "snapshot.json")


def acquire_snapshot(destination: Path, client: PsiClient) -> dict[str, Any]:
    """Write one new capture directory; retain original metadata and file bytes."""
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("Choose a new empty directory; existing source snapshots are immutable")
    destination.mkdir(parents=True, exist_ok=True)
    catalog = client.fetch_catalog()
    records = catalog_records(catalog.content)
    snapshot: dict[str, Any] = {
        "schema_version": 1,
        "fetched_at": datetime.now(UTC).isoformat(),
        "catalog_response": write_capture(destination, "raw/catalog.json", catalog),
        "total_catalog_records": len(records),
        "source_contract": "Observed public PSI website interfaces; not a guaranteed supported API",
        "investigations": [],
        "assets": [],
        "manifests": [],
        "errors": [],
        "capture_complete": False,
    }
    combustion = sorted(
        (record for record in records if record.get("Research Area") == "Combustion Science"),
        key=lambda record: int(record["Accession"].split("-")[1]),
    )
    snapshot["investigations"] = [
        normalize_catalog(record, snapshot["catalog_response"]) for record in combustion
    ]
    write_snapshot(destination, snapshot)

    def store_metadata(accession: str, metadata_capture: Capture) -> dict[str, Any]:
        metadata = json.loads(metadata_capture.content)
        stored = write_capture(destination, f"metadata/{accession}.json", metadata_capture)
        normalized = normalize_metadata(metadata, stored)
        index = next(
            i for i, item in enumerate(snapshot["investigations"]) if item["accession"] == accession
        )
        snapshot["investigations"][index] = normalized
        write_snapshot(destination, snapshot)
        return metadata

    def store_assets(accession: str, metadata: dict[str, Any]) -> None:
        for table in metadata.get("experimentalTable", []):
            file_name = table["file_name"]
            if TABLES.get(file_name) != accession:
                continue
            if table.get("restricted") or table.get("visible") is not True:
                continue
            file_version = table["version"]
            downloaded = client.download(accession, file_name, file_version)
            asset = write_capture(destination, f"assets/{file_name}", downloaded)
            asset.update(
                {
                    "id": f"{accession}:v{file_version}:{file_name}",
                    "accession": accession,
                    "investigation_version": metadata["version"],
                    "file_name": file_name,
                    "file_version": file_version,
                    "media_type": "text/csv",
                    "encoding": "cp1252" if accession == "PSI-69" else "utf-8-sig",
                    "doi": metadata.get("doi", ""),
                    "license": metadata.get("licenseIdentifier") or None,
                    "license_scope": "investigation_metadata",
                    "kind": "experimental_table",
                }
            )
            snapshot["assets"].append(asset)
            write_snapshot(destination, snapshot)
        if accession in {"PSI-25", "PSI-69", "PSI-101"}:
            manifest = client.fetch_manifest(accession, metadata["version"])
            stored_manifest = write_capture(destination, f"manifests/{accession}.json", manifest)
            stored_manifest.update(
                {
                    "accession": accession,
                    "investigation_version": metadata["version"],
                    "file_count": len(manifest_files(manifest.content)),
                    "method": "POST",
                    "request_body": {
                        "folder": f"{accession}/",
                        "fileType": "study",
                        "studyId": accession,
                        "version": metadata["version"],
                        "obfuscationcode": "",
                    },
                }
            )
            snapshot["manifests"].append(stored_manifest)
            write_snapshot(destination, snapshot)

    first = client.fetch_metadata("PSI-69")
    first_metadata = store_metadata("PSI-69", first)
    store_assets("PSI-69", first_metadata)

    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = {
            pool.submit(client.fetch_metadata, record["Accession"]): record["Accession"]
            for record in combustion
            if record["Accession"] != "PSI-69"
        }
        for future in as_completed(pending):
            accession = pending[future]
            try:
                metadata = store_metadata(accession, future.result())
                store_assets(accession, metadata)
            except (SourceUnavailable, ValueError) as error:
                snapshot["errors"].append({"accession": accession, "message": str(error)})
                write_snapshot(destination, snapshot)
    missing_tables = set(TABLES) - {asset["file_name"] for asset in snapshot["assets"]}
    if missing_tables:
        snapshot["errors"].append({"missing_reviewed_tables": sorted(missing_tables)})
    complete_metadata = all(
        record["declared_bytes"] is not None for record in snapshot["investigations"]
    )
    snapshot["declared_total_bytes"] = (
        sum(record["declared_bytes"] for record in snapshot["investigations"])
        if complete_metadata
        else None
    )
    snapshot["capture_complete"] = not snapshot["errors"]
    write_snapshot(destination, snapshot)
    return snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="new empty directory for the capture")
    args = parser.parse_args()
    with httpx.Client(transport=httpx.HTTPTransport(retries=1)) as http:
        snapshot = acquire_snapshot(args.destination, PsiClient(http))
    print(
        f"Captured {len(snapshot['investigations'])} combustion records, "
        f"{len(snapshot['assets'])} selected tables and {len(snapshot['manifests'])} manifests."
    )


if __name__ == "__main__":
    main()

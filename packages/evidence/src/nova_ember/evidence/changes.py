"""Snapshot changes preserve original source identities and scientific publication state."""

from __future__ import annotations


def snapshot_changes(before: dict, after: dict) -> dict:
    old = {row["accession"]: row for row in before["investigations"]}
    new = {row["accession"]: row for row in after["investigations"]}
    metadata = []
    dependency_ids = set()
    for accession in sorted(old.keys() & new.keys()):
        left, right = old[accession], new[accession]
        fields = [
            field
            for field in [
                "version",
                "metadata_sha256",
                "license",
                "doi",
                "title",
                "objective",
                "approach",
                "hardware",
                "platform",
            ]
            if left.get(field) != right.get(field)
        ]
        if fields:
            metadata.append(
                {
                    "accession": accession,
                    "changed_fields": fields,
                    "before": {field: left.get(field) for field in fields},
                    "after": {field: right.get(field) for field in fields},
                }
            )
            dependency_ids.add(left["metadata_sha256"])
    old_assets = {
        (row["accession"], row["file_name"], row["file_version"]): row for row in before["assets"]
    }
    new_assets = {
        (row["accession"], row["file_name"], row["file_version"]): row for row in after["assets"]
    }
    changed = []
    for identity in sorted(old_assets.keys() & new_assets.keys()):
        left, right = old_assets[identity], new_assets[identity]
        if left["sha256"] != right["sha256"] or left.get("license") != right.get("license"):
            changed.append(
                {
                    "accession": identity[0],
                    "file_name": identity[1],
                    "file_version": identity[2],
                    "before_sha256": left["sha256"],
                    "after_sha256": right["sha256"],
                    "before_license": left.get("license"),
                    "after_license": right.get("license"),
                }
            )
            dependency_ids.add(left["sha256"])

    def public_identity(row):
        return {
            key: row.get(key)
            for key in ["accession", "file_name", "file_version", "sha256", "license"]
        }

    added = [
        public_identity(new_assets[key]) for key in sorted(new_assets.keys() - old_assets.keys())
    ]
    absent = [
        public_identity(old_assets[key]) for key in sorted(old_assets.keys() - new_assets.keys())
    ]
    dependency_ids.update(row["sha256"] for row in absent)
    return {
        "added_investigations": sorted(new.keys() - old.keys()),
        "not_in_later_snapshot": sorted(old.keys() - new.keys()),
        "metadata_changes": metadata,
        "added_assets": added,
        "not_in_later_snapshot_assets": absent,
        "changed_assets": changed,
        "dependency_ids_to_recheck": sorted(dependency_ids),
        "automatic_case_mutation": False,
        "limitations": [
            "An absent released asset is not proof that the experiment never occurred.",
            (
                "A changed source does not silently rewrite a saved "
                "calculation or personal case; inspect its frozen version."
            ),
        ],
    }


def manifest_changes(before: list[dict], after: list[dict], limit: int = 100) -> dict:
    old = {row["key"]: row for row in before}
    new = {row["key"]: row for row in after}
    if len(old) != len(before) or len(new) != len(after):
        return {
            "status": "unresolved_duplicate_file_keys",
            "before_entries": len(before),
            "after_entries": len(after),
            "limitations": ["Duplicate manifest paths require source-specific identity review."],
        }
    fields = ("version", "bytes_size", "restricted", "restrictedAccess", "visible")
    changed = []
    for key in sorted(old.keys() & new.keys()):
        differences = [field for field in fields if old[key].get(field) != new[key].get(field)]
        if differences:
            changed.append(
                {
                    "key": key,
                    "changed_fields": differences,
                    "before": {field: old[key].get(field) for field in differences},
                    "after": {field: new[key].get(field) for field in differences},
                    "now_restricted_or_hidden": bool(
                        new[key].get("restricted")
                        or new[key].get("restrictedAccess")
                        or new[key].get("visible") is False
                    ),
                }
            )
    added = sorted(new.keys() - old.keys())
    absent = sorted(old.keys() - new.keys())
    return {
        "status": "compared_file_listings",
        "added_count": len(added),
        "not_in_observed_manifest_count": len(absent),
        "changed_count": len(changed),
        "added_keys": added[:limit],
        "not_in_observed_manifest_keys": absent[:limit],
        "changed": changed[:limit],
        "list_limit": limit,
        "truncated": any(len(rows) > limit for rows in (added, absent, changed)),
        "limitations": [
            (
                "Listed file size/version/access changes are repository "
                "observations; byte changes require selective acquisition "
                "and local hashes."
            ),
            "An absent listing is not proof that the experiment did not occur.",
        ],
    }

"""Capture only the reviewed expansion's NASA reports, preserving original source identities."""

from __future__ import annotations

import argparse
import json
from hashlib import sha256
from pathlib import Path

import httpx
from nova_ember.adapters.documents import NtrsClient, capture_ntrs_document, load_ntrs_document
from nova_ember.adapters.psi import Capture

ROOT = Path(__file__).resolve().parents[1]


class VerifiedDocument(NtrsClient):
    """Serve already checked original bytes to the ordinary immutable capture writer."""

    def __init__(self, http: httpx.Client, identifier: str, metadata: Capture, pdf: Capture):
        super().__init__(http)
        self.identifier = identifier
        self.metadata_capture = metadata
        self.pdf_capture = pdf

    def metadata(self, identifier: str) -> Capture:
        if identifier != self.identifier:
            raise ValueError("Document identity changed during capture.")
        return self.metadata_capture

    def pdf(self, identifier: str, _metadata: dict) -> Capture:
        if identifier != self.identifier:
            raise ValueError("Document identity changed during capture.")
        return self.pdf_capture


def capture_documents(collection_path: Path, directory: Path, base_snapshot: Path) -> list[dict]:
    collection = json.loads(collection_path.read_bytes())
    source_id = sha256(base_snapshot.read_bytes()).hexdigest()
    outcomes = []
    with httpx.Client() as http:
        client = NtrsClient(http)
        for reference in collection["documents"]:
            identifier = reference["document_id"]
            retained = load_ntrs_document(directory, identifier, source_id)
            if (
                retained
                and (retained.get("pdf") or {}).get("sha256") == reference["sha256"]
                and retained.get("pages")
            ):
                outcomes.append({"document_id": identifier, "status": "retained_original_reused"})
                continue
            metadata = client.metadata(identifier)
            pdf = client.pdf(identifier, json.loads(metadata.content))
            if (
                pdf is None
                or pdf.sha256 != reference["sha256"]
                or len(pdf.content) != reference["byte_size"]
            ):
                raise ValueError(
                    f"NTRS {identifier} differs from the reviewed original; "
                    "existing captures are preserved."
                )

            captured = capture_ntrs_document(
                VerifiedDocument(http, identifier, metadata, pdf),
                identifier,
                source_id,
                tuple(reference["associated_investigations"]),
                directory,
            )
            outcomes.append(
                {
                    "document_id": identifier,
                    "status": captured["status"],
                    "page_count": (captured.get("pages") or {}).get("page_count"),
                }
            )
    return outcomes


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--collection", type=Path, default=ROOT / "data/nasa-research/collection.json"
    )
    parser.add_argument("--directory", type=Path, default=ROOT / ".data/evidence-documents")
    parser.add_argument(
        "--base-snapshot", type=Path, default=ROOT / "tests/fixtures/nasa-psi/snapshot.json"
    )
    args = parser.parse_args()
    print(
        json.dumps(capture_documents(args.collection, args.directory, args.base_snapshot), indent=2)
    )

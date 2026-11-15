"""Build the reviewed NASA research collection from retained sources and curation.

The reviewed table cells are factual publication transcriptions, not a PDF parser's
unreviewed output. Original PDFs stay in the separate evidence-document cache.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
from hashlib import sha256
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DIRECTORY = ROOT / "data/nasa-research"
MAX_SOURCE_BYTES = 4 * 1024 * 1024


class MainTextParser(HTMLParser):
    """Keep NASA's main page content while excluding scripts and style rules."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_main = False
        self.hidden_depth = 0
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "main":
            self.in_main = True
        if self.in_main and tag in {"script", "style", "noscript"}:
            self.hidden_depth += 1
        if (
            self.in_main
            and not self.hidden_depth
            and tag in {"p", "li", "div", "section", "h1", "h2", "h3", "h4", "br", "tr"}
        ):
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag == "main":
            self.in_main = False
        if self.hidden_depth and tag in {"script", "style", "noscript"}:
            self.hidden_depth -= 1
        if (
            self.in_main
            and not self.hidden_depth
            and tag in {"p", "li", "div", "section", "h1", "h2", "h3", "h4", "tr"}
        ):
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.in_main and not self.hidden_depth:
            self.parts.append(data)


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def file_reference(path: str, content: bytes) -> dict:
    return {"path": path, "sha256": sha256(content).hexdigest(), "byte_size": len(content)}


def checked_source(directory: Path, source: dict) -> bytes:
    target = (directory / source["path"]).resolve()
    if not target.is_relative_to(directory.resolve()) or target.stat().st_size > MAX_SOURCE_BYTES:
        raise ValueError("A retained NASA source leaves the collection or exceeds its size bound.")
    content = target.read_bytes()
    if file_reference(source["path"], content) != {
        key: source[key] for key in ("path", "sha256", "byte_size")
    }:
        raise ValueError(f"Retained source checksum changed: {source['path']}")
    return content


def extracted_text(source: dict, content: bytes) -> str:
    if source["media_type"] == "text/html":
        parser = MainTextParser()
        parser.feed(content.decode("utf-8"))
        lines = [re.sub(r"\s+", " ", line).strip() for line in "".join(parser.parts).splitlines()]
        text = "\n".join(line for line in lines if line)
        if not text:
            raise ValueError(f"No main content found in {source['path']}")
        return text + "\n"
    metadata = json.loads(content)
    fields = [metadata["title"]]
    if metadata.get("abstract") and metadata["abstract"] != "No abstract available":
        fields.append(metadata["abstract"].strip())
    return "\n\n".join(fields) + "\n"


def source_reference(source: dict) -> dict:
    return {
        "title": source["title"],
        "source_url": source["source_url"],
        "sha256": source["sha256"],
        "rights": source.get("rights"),
    }


def build_records(curation: list[dict], sources: dict, texts: dict) -> tuple[list, dict]:
    records = []
    outputs = {}
    for item in curation:
        metadata = dict(item["metadata"])
        metadata["field_provenance"] = {}
        for field, references in item["field_provenance"].items():
            verified = []
            for reference in references:
                source = sources[reference["source_id"]]
                if not reference["quote"] or reference["quote"] not in texts[source["id"]]:
                    raise ValueError(
                        f"Unretained source quotation: {metadata['accession']} / {field}"
                    )
                verified.append(
                    {
                        **reference,
                        "label": source["title"],
                        "source_url": source["source_url"],
                        "source_sha256": source["sha256"],
                    }
                )
            metadata["field_provenance"][field] = verified
        path = f"metadata/{metadata['accession']}.json"
        content = json_bytes(metadata)
        outputs[path] = content
        record = {
            **item["record"],
            "accession": metadata["accession"],
            "version": metadata["version"],
            "title": metadata["title"],
            "acronym": metadata["investigationAcronym"],
            "description": metadata["description"],
            "objective": metadata["objective"],
            "approach": metadata["approach"],
            "hardware": metadata["experimentHardware"],
            "platform": metadata["flightProgram"],
            "research_area": metadata["researchArea"],
            "sub_research_area": metadata["subResearchArea"],
            "doi": None,
            "license": None,
            "license_scope": "curated_research_metadata",
            "source_kind": "nasa",
            "origin": "curated_nasa_research",
            "metadata_path": path,
            "metadata_sha256": sha256(content).hexdigest(),
            "source_provenance": [source_reference(sources[key]) for key in item["source_ids"]],
        }
        records.append(record)
    return records, outputs


def build_assets(tables: list[dict], documents: dict) -> tuple[list, dict]:
    assets = []
    outputs = {}
    for table in tables:
        accessions = sorted({row["accession"] for row in table["rows"]})
        for accession in accessions:
            rows = [row for row in table["rows"] if row["accession"] == accession]
            name = f"{accession}_{table['id']}.csv"
            path = f"tables/{name}"
            stream = io.StringIO(newline="")
            writer = csv.writer(stream, lineterminator="\n")
            writer.writerow(table["headers"])
            writer.writerows(row["raw_cells"] for row in rows)
            content = stream.getvalue().encode("utf-8")
            outputs[path] = content
            digest = sha256(content).hexdigest()
            document = documents[table["document_id"]]
            proof = [
                {key: value for key, value in row.items() if key != "accession"} for row in rows
            ]
            assets.append(
                {
                    **file_reference(path, content),
                    "id": f"{accession}:v1:{name}",
                    "accession": accession,
                    "investigation_version": 1,
                    "file_name": name,
                    "file_version": 1,
                    "media_type": "text/csv",
                    "encoding": "utf-8",
                    "source_kind": "nasa",
                    "kind": "publication_table",
                    "origin": table["origin"],
                    "source_url": document["source_url"],
                    "fetched_at": table["captured_at"],
                    "doi": None,
                    "license": None,
                    "license_scope": "factual_publication_transcription",
                    "redistribution": "factual_transcription_only",
                    "source_provenance": [
                        {
                            "title": document["title"],
                            "source_url": document["source_url"],
                            "document_id": document["document_id"],
                            "sha256": document["sha256"],
                            "rights": document["rights"],
                            "page": table["page"],
                            "table": table["table"],
                        }
                    ],
                    "table_definition": {
                        "source_sha256": digest,
                        "headers": table["headers"],
                        "columns": table["columns"],
                        "rows": proof,
                        "row_kind": table["row_kind"],
                        "limitations": table["limitations"],
                    },
                }
            )
    return assets, outputs


def build(directory: Path) -> dict[str, bytes]:
    config = json.loads((directory / "curation/collection.json").read_bytes())
    source_list = config["sources"]
    sources = {source["id"]: source for source in source_list}
    texts = {}
    outputs = {}
    retained_sources = []
    for source in source_list:
        text = extracted_text(source, checked_source(directory, source))
        path = f"text/{source['id']}.txt"
        text_bytes = text.encode("utf-8")
        texts[source["id"]] = text
        outputs[path] = text_bytes
        retained_sources.append({**source, "text": file_reference(path, text_bytes)})
    records, record_outputs = build_records(config["investigations"], sources, texts)
    documents = {document["document_id"]: document for document in config["documents"]}
    tables = json.loads((directory / "curation/tables.json").read_bytes())
    assets, asset_outputs = build_assets(tables, documents)
    outputs.update(record_outputs)
    outputs.update(asset_outputs)
    outputs["collection.json"] = json_bytes(
        {
            "schema_version": 1,
            "captured_at": config["captured_at"],
            "sources": retained_sources,
            "investigations": records,
            "assets": assets,
            "documents": config["documents"],
        }
    )
    return outputs


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY)
    parser.add_argument(
        "--check", action="store_true", help="Verify the deterministic build without writing."
    )
    parser.add_argument(
        "--document-cache", type=Path, help="Also verify cached original PDF bytes by SHA-256."
    )
    args = parser.parse_args()
    outputs = build(args.directory)
    if args.check:
        for relative, expected in outputs.items():
            path = args.directory / relative
            if not path.is_file() or path.read_bytes() != expected:
                raise ValueError(f"Research collection needs rebuilding: {relative}")
    else:
        for relative, content in outputs.items():
            target = (args.directory / relative).resolve()
            if not target.is_relative_to(args.directory.resolve()):
                raise ValueError("A research output path leaves the collection directory.")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
    if args.document_cache:
        collection = json.loads(outputs["collection.json"])
        for document in collection["documents"]:
            cached = args.document_cache / document["sha256"]
            if (
                not cached.is_file()
                or cached.stat().st_size != document["byte_size"]
                or sha256(cached.read_bytes()).hexdigest() != document["sha256"]
            ):
                raise ValueError(f"Original PDF missing or changed: {document['document_id']}")
    print(f"Verified {len(outputs)} reproducible NASA research outputs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

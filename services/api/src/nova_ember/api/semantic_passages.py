"""Bounded search projections of actual retained source text and exact locators."""

import json
from hashlib import sha256

from nova_ember.adapters.documents import (
    extract_pdf_pages_bounded,
    load_ntrs_document,
    read_document_pages,
)
from nova_ember.adapters.formats import docx_paragraphs, rtf_text, xls_cells
from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.supporting import workbook_cells, workbook_sheet_index
from nova_ember.evidence.contracts import EvidenceAnchor

from .discovery import Discovery

PROFILE = "retained-source-passages-v1"
MAX_PASSAGE_CHARACTERS = 1000
MAX_PASSAGES_PER_SOURCE = 128
MAX_PROJECTION_DOCUMENTS = 4096
MAX_EMBEDDED_DOCUMENTS = 1024


def projection_text(record: dict) -> str:
    fields = {
        key: record.get(key)
        for key in (
            "accession",
            "title",
            "acronym",
            "description",
            "objective",
            "approach",
            "hardware",
            "platform",
        )
    }
    return json.dumps(fields, sort_keys=True, ensure_ascii=False)[:12000]


def chunks(text: str, anchor: EvidenceAnchor):
    """Offsets refer to the unchanged reader output, with no normalization or overlap."""
    for start in range(0, len(text), MAX_PASSAGE_CHARACTERS):
        end = min(start + MAX_PASSAGE_CHARACTERS, len(text))
        if text[start:end].strip():
            yield text[start:end], anchor.model_copy(update={"start": start, "end": end})


def asset_parts(corpus, snapshot: str, asset: dict):
    content = corpus.asset_bytes(asset)
    name = asset["file_name"]
    base = {
        "snapshot_id": snapshot,
        "accession": asset["accession"],
        "investigation_version": asset["investigation_version"],
        "source_sha256": asset["sha256"],
        "asset_id": asset["id"],
    }
    suffix = name.rsplit(".", 1)[-1].lower()
    if suffix == "csv" and asset.get("encoding"):
        table = parse_csv_bytes(content, asset["encoding"])
        for row in table.rows:
            for column, value in enumerate(row.cells):
                header = table.headers[column] if column < len(table.headers) else "unheaded cell"
                yield (
                    value,
                    EvidenceAnchor(
                        **base, kind="table_cell", source_row=row.row_number, column=column
                    ),
                    header,
                )
    elif suffix == "txt" and asset.get("encoding") == "utf-8":
        for line, value in enumerate(content.decode("utf-8", errors="strict").splitlines(), 1):
            yield (
                value,
                EvidenceAnchor(**base, kind="text_lines", source_row=line, line_end=line),
                name,
            )
    elif suffix == "xlsx":
        for selected in workbook_sheet_index(content):
            for sheet in workbook_cells(content, {selected.name}):
                for cell in sheet.cells:
                    value = cell.text if cell.text is not None else cell.raw_value or ""
                    yield (
                        value,
                        EvidenceAnchor(
                            **base, kind="workbook_cell", sheet=sheet.name, cell=cell.coordinate
                        ),
                        f"{sheet.name}!{cell.coordinate}; cached source cell, not evaluated",
                    )
    elif suffix == "xls":
        index = xls_cells(content, limit=1)
        for selected in index["sheet_names"]:
            for offset in range(0, 200000, 250):
                page = xls_cells(content, selected, limit=250, offset=offset)
                for cell in page["cells"]:
                    column, letters = cell["column"], ""
                    while column:
                        column, remainder = divmod(column - 1, 26)
                        letters = chr(65 + remainder) + letters
                    yield (
                        str(cell["raw_value"]),
                        EvidenceAnchor(
                            **base,
                            kind="workbook_cell",
                            sheet=page["selected_sheet"],
                            cell=f"{letters}{cell['row']}",
                        ),
                        "Retained legacy workbook cell; date and formula semantics unresolved",
                    )
                if offset + 250 >= page["total_cells"]:
                    break
    elif suffix == "pdf":
        for pdf_page in extract_pdf_pages_bounded(content):
            yield (
                pdf_page.text,
                EvidenceAnchor(**base, kind="document_page", page=pdf_page.page),
                name,
            )
    elif suffix == "docx":
        for paragraph in docx_paragraphs(content):
            yield (
                paragraph.text,
                EvidenceAnchor(**base, kind="document_paragraph", paragraph=paragraph.paragraph),
                name,
            )
    elif suffix == "rtf":
        for number, text in enumerate(rtf_text(content)["text"].splitlines(), 1):
            yield text, EvidenceAnchor(**base, kind="document_paragraph", paragraph=number), name
    else:
        raise ValueError("No textual passage reader; use the retained format/media source view.")


def document_parts(discovery: Discovery, snapshot: dict):
    directory = discovery.corpus.settings.object_directory.parent / "evidence-documents"
    base_id = discovery.source_snapshot_id(snapshot)
    for public in discovery.documents(snapshot["snapshot_id"])["items"]:
        record = load_ntrs_document(directory, public["document_id"], base_id, public["capture_id"])
        if record is None or record.get("pages") is None or record.get("pdf") is None:
            continue
        parts = (
            (
                page["text"],
                EvidenceAnchor(
                    snapshot_id=snapshot["snapshot_id"],
                    source_kind="ntrs",
                    document_id=record["document_id"],
                    capture_id=record["capture_id"],
                    source_sha256=record["pdf"]["sha256"],
                    kind="document_page",
                    page=page["page"],
                ),
                public["title"],
            )
            for page in read_document_pages(directory, record)
        )
        yield public, parts


def build_projection(corpus, snapshot: dict) -> tuple[list[dict], dict]:
    discovery = Discovery(corpus)
    identifier = snapshot["snapshot_id"]
    documents, coverage = [], []
    for record in snapshot["manifest"]["investigations"]:
        raw = discovery._metadata(record)
        anchors = []
        for field in ("title", "description", "objective", "approach", "experimentHardware"):
            value = raw.get(field)
            if not value:
                continue
            text = (
                value
                if isinstance(value, str)
                else json.dumps(value, ensure_ascii=False, sort_keys=True)
            )
            anchors.append(
                discovery.metadata_anchor(identifier, record, field)
                .model_copy(update={"start": 0, "end": min(len(text), MAX_PASSAGE_CHARACTERS)})
                .model_dump(mode="json")
            )
        text = projection_text(record)
        documents.append(
            {
                "source_id": record["accession"],
                "kind": "investigation_metadata",
                "source_kind": "psi",
                "accessions": [record["accession"]],
                "title": record["title"],
                "text": text,
                "search_text": text,
                "source_sha256": record["metadata_sha256"],
                "anchors": anchors,
            }
        )

    def retain(parts, title, accessions, source_hash, source_id):
        added, limited = 0, False
        try:
            for original, anchor, description in parts:
                for text, located in chunks(original, anchor):
                    if (
                        added >= MAX_PASSAGES_PER_SOURCE
                        or len(documents) >= MAX_PROJECTION_DOCUMENTS
                    ):
                        limited = True
                        break
                    identity = located.model_dump(
                        mode="json", exclude={"snapshot_id"}, exclude_none=True
                    )
                    digest = sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
                    documents.append(
                        {
                            "source_id": "passage:" + digest,
                            "kind": "source_passage",
                            "source_kind": located.source_kind,
                            "accessions": sorted(accessions),
                            "title": title,
                            "text": text,
                            "search_text": f"{description[:MAX_PASSAGE_CHARACTERS]}\n{text}",
                            "source_sha256": source_hash,
                            "anchors": [located.model_dump(mode="json")],
                        }
                    )
                    added += 1
                if limited:
                    break
            status, reason = (
                ("bounded_passages", "The passage profile limit was reached.")
                if limited
                else ("read", None)
            )
        except (ValueError, LookupError, OSError) as error:
            status, reason = "reader_unavailable", str(error)[:400]
        coverage.append(
            {
                "source_id": source_id,
                "source_sha256": source_hash,
                "passages": added,
                "status": status,
                "reason": reason,
            }
        )

    for asset in sorted(
        snapshot["manifest"]["assets"], key=lambda item: (item["accession"], item["id"])
    ):
        retain(
            asset_parts(corpus, identifier, asset),
            asset["file_name"],
            [asset["accession"]],
            asset["sha256"],
            asset["id"],
        )
    for public, parts in document_parts(discovery, snapshot):
        retain(
            parts,
            public["title"],
            public["associated_investigations"],
            public["source_sha256"],
            "NTRS:" + public["document_id"],
        )
    return documents, {
        "profile": PROFILE,
        "sources": coverage,
        "metadata_documents": len(snapshot["manifest"]["investigations"]),
        "limits": {
            "passage_characters": MAX_PASSAGE_CHARACTERS,
            "passages_per_source": MAX_PASSAGES_PER_SOURCE,
            "projection_documents": MAX_PROJECTION_DOCUMENTS,
            "embedded_documents": MAX_EMBEDDED_DOCUMENTS,
        },
        "scope": (
            "Retained metadata and bounded extracted passages, not the unacquired raw archive."
        ),
        "fallback": (
            "Non-embedded projected passages remain lexical candidates; "
            "inspect other retained sources through their exact readers."
        ),
    }

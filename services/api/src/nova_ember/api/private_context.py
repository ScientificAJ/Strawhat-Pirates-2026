"""Bounded inspection of explicitly selected temporary bytes without canonical attribution."""

import json
import os
import subprocess
import sys
from dataclasses import asdict
from hashlib import sha256
from pathlib import Path

from nova_ember.adapters.documents import extract_pdf_pages_bounded
from nova_ember.adapters.formats import (
    archive_index,
    docx_paragraphs,
    inspect_matlab,
    rtf_text,
    xls_cells,
)
from nova_ember.adapters.psi import parse_csv_bytes
from nova_ember.adapters.supporting import workbook_cells
from nova_ember.contracts.research import SelectedPrivateInput

from .config import Settings
from .source_acquisition import acquired_source_for_receipt_hash
from .uploads import private_upload_for_receipt_hash

MAX_INSPECTION_BYTES = 8 * 1024 * 1024


def resolve_private_input(
    settings: Settings, snapshot_id: str, selected: SelectedPrivateInput, receipt_sha256: str
) -> tuple[dict, Path]:
    if not selected.consent_to_model:
        raise ValueError(
            "Selected temporary inputs require separate explicit model-sharing consent."
        )
    if selected.upload_id is not None:
        metadata, path = private_upload_for_receipt_hash(
            settings, str(selected.upload_id), receipt_sha256
        )
        metadata = {**metadata, "input_kind": "private_upload"}
    else:
        metadata, path = acquired_source_for_receipt_hash(
            settings, str(selected.source_job_id), receipt_sha256
        )
        metadata = {
            **metadata,
            "source_job_id": str(selected.source_job_id),
            "file_name": metadata["source"]["file_name"],
            "input_kind": "selected_acquired_source",
        }
    if metadata["snapshot_id"] != snapshot_id or metadata["sha256"] != selected.expected_sha256:
        raise ValueError("Selected temporary input differs from its frozen source snapshot/hash.")
    if selected.text_encoding is not None:
        metadata = {
            **metadata,
            "text_encoding": selected.text_encoding,
            "encoding_origin": "explicit_context_selection",
        }
    return metadata, path


def inspect_private_bytes(metadata: dict, path: Path, *, offset=0, limit=20, sheet=None) -> dict:
    """Use a fixed bounded child for binary document/array readers on untrusted inputs."""
    if Path(metadata["file_name"]).suffix.casefold() not in {".docx", ".xlsx", ".xls", ".mat"}:
        return _inspect_bytes(metadata, path, offset=offset, limit=limit, sheet=sheet)
    environment = {
        name: os.environ[name]
        for name in ("PATH", "PYTHONPATH", "VIRTUAL_ENV")
        if name in os.environ
    }
    environment.update({"OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"})
    try:
        result = subprocess.run(
            [sys.executable, "-m", "nova_ember.api.private_context", "--inspect-child", str(path)],
            input=json.dumps(
                {"metadata": metadata, "offset": offset, "limit": limit, "sheet": sheet}
            ).encode(),
            capture_output=True,
            env=environment,
            timeout=30,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise ValueError(
            "Private format inspection exceeded its 30-second reader profile."
        ) from None
    if result.returncode or len(result.stdout) > 28000:
        raise ValueError("Private format inspection failed or exceeded its bounded reader profile.")
    document = json.loads(result.stdout)
    if "error" in document:
        raise ValueError(document["error"])
    return document


def _inspect_bytes(metadata: dict, path: Path, *, offset=0, limit=20, sheet=None) -> dict:
    """Return original text/cells with local locators; never infer NASA units or measurements."""
    if metadata["byte_size"] > MAX_INSPECTION_BYTES:
        raise ValueError(
            "Model inspection accepts at most eight MiB per selected file; "
            "use the bounded execution workflow or select a smaller original input."
        )
    content = path.read_bytes()
    if len(content) != metadata["byte_size"] or sha256(content).hexdigest() != metadata["sha256"]:
        raise ValueError("Selected temporary input length/checksum changed during inspection.")
    suffix = Path(metadata["file_name"]).suffix.casefold()
    encoding = metadata.get("text_encoding") or "utf-8-sig"
    if suffix in {".csv", ".tsv"}:
        # Existing CSV reader keeps physical source rows and original text; no NASA adapter is used.
        if suffix == ".csv":
            table = parse_csv_bytes(content, encoding=encoding)
            rows = [
                {
                    "source_row": row.row_number,
                    "source_line_end": row.line_end,
                    "cells": list(row.cells),
                }
                for row in table.rows[offset : offset + limit]
            ]
            headers = list(table.headers)
        else:
            import csv
            import io

            reader = csv.reader(io.StringIO(content.decode(encoding), newline=""), delimiter="\t")
            headers, rows = next(reader, []), []
            for index, values in enumerate(reader):
                if offset <= index < offset + limit:
                    rows.append({"source_line_end": reader.line_num, "cells": values})
                if index >= offset + limit:
                    break
        return {
            "format": "original_table_text",
            "headers": headers,
            "rows": rows,
            "total_source_records": len(table.rows) if suffix == ".csv" else None,
            "returned_source_records": len(rows),
            "independent_run_count": None,
            "units": "uninterpreted_source_labels",
            "offset": offset,
        }
    if suffix == ".pdf":
        pages = extract_pdf_pages_bounded(content)
        return {
            "format": "pdf_page_text",
            "pages": [asdict(page) for page in pages[offset : offset + min(limit, 3)]],
        }
    if suffix == ".docx":
        paragraphs = docx_paragraphs(content)
        return {
            "format": "docx_paragraph_text",
            "paragraphs": [asdict(item) for item in paragraphs[offset : offset + limit]],
        }
    if suffix == ".xlsx":
        worksheets = workbook_cells(content, {sheet} if sheet else None)
        return {
            "format": "original_workbook_cells",
            "sheets": [
                {
                    "name": item.name,
                    "cells": [asdict(cell) for cell in item.cells[offset : offset + limit]],
                }
                for item in worksheets[:3]
            ],
            "formula_policy": "expressions_and_cached_values_without_evaluation",
        }
    if suffix == ".xls":
        return xls_cells(content, selected_sheet=sheet, limit=limit, offset=offset)
    if suffix == ".mat":
        return inspect_matlab(content)
    if suffix == ".zip":
        result = archive_index(content, metadata["file_name"])
        result["members"] = result["members"][offset : offset + limit]
        return result
    if suffix == ".rtf":
        extracted = rtf_text(content)
        lines = extracted["text"].splitlines()
    elif suffix in {".txt", ".md", ".json", ".ipynb", ".py"}:
        lines = content.decode(encoding).splitlines()
    else:
        return {
            "format": "unparsed_original",
            "byte_size": len(content),
            "reason": "No text/cell profile; use explicitly selected image or code tools.",
        }
    return {
        "format": "original_text_lines",
        "lines": [
            {"line": index + 1, "text": line}
            for index, line in enumerate(lines)
            if offset <= index < offset + limit
        ],
    }


def _inspection_child() -> None:
    import resource

    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (25, 25))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    parameters = json.loads(sys.stdin.buffer.read(16000))
    try:
        document = _inspect_bytes(
            parameters["metadata"],
            Path(sys.argv[2]),
            offset=parameters["offset"],
            limit=parameters["limit"],
            sheet=parameters["sheet"],
        )
        serialized = json.dumps(document, default=str)
        if len(serialized.encode()) > 24000:
            raise ValueError("Private excerpt exceeds the model profile; select fewer entries.")
    except (ValueError, OSError, MemoryError):
        serialized = json.dumps(
            {"error": "Private input is unsupported or exceeds its reader profile."}
        )
    print(serialized)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "--inspect-child":
        raise SystemExit("Use the private context inspection interface.")
    _inspection_child()

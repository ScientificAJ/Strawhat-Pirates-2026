"""Bounded source-format readers; extracted values keep their original semantics."""

from __future__ import annotations

import codecs
import io
import math
import re
import stat
import tarfile
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from hashlib import sha256
from importlib.metadata import version
from pathlib import PurePosixPath
from zipfile import BadZipFile, ZipFile

MAX_SOURCE_BYTES = 64 * 1024 * 1024
MAX_EXPANDED_BYTES = 128 * 1024 * 1024
MAX_MEMBER_BYTES = 16 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 2000
WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = "{" + WORD_NS + "}"


def _member_name(name: str) -> None:
    path = PurePosixPath(name)
    if (
        not name
        or len(name) > 2048
        or path.is_absolute()
        or ".." in path.parts
        or "\\" in name
        or ":" in name
        or "\x00" in name
    ):
        raise ValueError("Archive member names must be bounded relative paths.")


@contextmanager
def source_zip(content: bytes) -> Iterator[ZipFile]:
    if len(content) > MAX_SOURCE_BYTES:
        raise ValueError("Archive source exceeds its byte limit.")
    try:
        with ZipFile(io.BytesIO(content)) as archive:
            members = archive.infolist()
            if len(members) > MAX_ARCHIVE_MEMBERS or len(
                {member.filename for member in members}
            ) != len(members):
                raise ValueError(
                    "Archive member count or duplicate names exceed the reader contract."
                )
            total = 0
            for member in members:
                _member_name(member.filename)
                total += member.file_size
                if member.flag_bits & 1 or stat.S_ISLNK(member.external_attr >> 16):
                    raise ValueError("Encrypted or symbolic-link archive members are unsupported.")
                if member.file_size > MAX_MEMBER_BYTES or total > MAX_EXPANDED_BYTES:
                    raise ValueError("Expanded archive bytes exceed the selected reader profile.")
                if member.file_size and member.file_size / max(1, member.compress_size) > 1000:
                    raise ValueError(
                        "Archive compression ratio exceeds the selected reader profile."
                    )
            yield archive
    except (BadZipFile, RuntimeError):
        raise ValueError("The source ZIP is corrupt or unsupported.") from None


def archive_index(content: bytes, filename: str) -> dict:
    if filename.casefold().endswith(".zip"):
        with source_zip(content) as archive:
            members = [
                {
                    "name": item.filename,
                    "byte_size": item.file_size,
                    "compressed_size": item.compress_size,
                    "crc32": f"{item.CRC:08x}",
                    "directory": item.is_dir(),
                }
                for item in archive.infolist()
            ]
    elif filename.casefold().endswith((".tar", ".tar.gz", ".tgz")):
        if len(content) > MAX_SOURCE_BYTES:
            raise ValueError("Archive source exceeds its byte limit.")
        members = []
        total = 0
        try:
            with tarfile.open(fileobj=io.BytesIO(content), mode="r:*") as archive:
                for member in archive:
                    _member_name(member.name)
                    total += member.size
                    if (
                        len(members) >= MAX_ARCHIVE_MEMBERS
                        or member.size > MAX_MEMBER_BYTES
                        or total > MAX_EXPANDED_BYTES
                    ):
                        raise ValueError("Expanded archive profile exceeds member/byte limits.")
                    if not (member.isdir() or member.isfile()):
                        raise ValueError(
                            "Archive links, devices and special members are unsupported."
                        )
                    members.append(
                        {"name": member.name, "byte_size": member.size, "directory": member.isdir()}
                    )
        except tarfile.TarError:
            raise ValueError("The source tar archive is corrupt or unsupported.") from None
    else:
        raise ValueError("No reviewed archive profile is registered for this suffix.")
    return {
        "sha256": sha256(content).hexdigest(),
        "members": members,
        "total_members": len(members),
        "extraction": "index_only_no_files_written",
        "limitations": [
            (
                "Archive entries are source inventory, not independent "
                "experiments or analysis-ready data."
            ),
            "CRC and reported sizes are not a NASA-attested scientific checksum.",
        ],
    }


def _xml(archive: ZipFile, member: str) -> ET.Element:
    try:
        content = archive.read(member)
    except KeyError:
        raise ValueError("A required document XML member is absent.") from None
    if b"<!DOCTYPE" in content.upper() or b"<!ENTITY" in content.upper():
        raise ValueError("Document XML entity declarations are unsupported.")
    try:
        return ET.fromstring(content)
    except ET.ParseError:
        raise ValueError("Document XML is malformed.") from None


def docx_figures(content: bytes) -> list[dict]:
    with source_zip(content) as archive:
        figures = []
        for member in archive.infolist():
            if not member.filename.startswith("word/media/") or member.is_dir():
                continue
            raw = archive.read(member)
            media_type = (
                "image/png"
                if raw.startswith(b"\x89PNG\r\n\x1a\n")
                else "image/jpeg"
                if raw.startswith(b"\xff\xd8\xff")
                else "not_registered_for_inline_view"
            )
            figures.append(
                {
                    "member": member.filename,
                    "sha256": sha256(raw).hexdigest(),
                    "byte_size": len(raw),
                    "media_type": media_type,
                    "scientific_measurement_ready": False,
                }
            )
        return figures


def docx_figure_bytes(content: bytes, member: str) -> tuple[bytes, str]:
    _member_name(member)
    match = next((row for row in docx_figures(content) if row["member"] == member), None)
    if match is None or match["media_type"] == "not_registered_for_inline_view":
        raise ValueError("Select an existing PNG/JPEG source figure from the document index.")
    with source_zip(content) as archive:
        raw = archive.read(member)
    return raw, match["media_type"]


@dataclass(frozen=True)
class DocumentParagraph:
    paragraph: int
    text: str
    text_sha256: str
    table: int | None
    row: int | None
    column: int | None
    merged_grid_span: str | None
    vertical_merge: str | None
    deleted_text: tuple[str, ...]
    has_tracked_changes: bool


def docx_paragraphs(content: bytes) -> tuple[DocumentParagraph, ...]:
    with source_zip(content) as archive:
        root = _xml(archive, "word/document.xml")
        locations = {}
        for table_index, table in enumerate(root.iter(W + "tbl"), start=1):
            for row_index, row in enumerate(table.findall(W + "tr"), start=1):
                for column_index, cell in enumerate(row.findall(W + "tc"), start=1):
                    span = cell.find(W + "tcPr/" + W + "gridSpan")
                    merge = cell.find(W + "tcPr/" + W + "vMerge")
                    for paragraph in cell.iter(W + "p"):
                        locations[id(paragraph)] = (
                            table_index,
                            row_index,
                            column_index,
                            span.get(W + "val") if span is not None else None,
                            merge.get(W + "val", "continue") if merge is not None else None,
                        )
        parents = {id(child): parent for parent in root.iter() for child in parent}
        result = []
        total = 0
        for index, paragraph in enumerate(root.iter(W + "p"), start=1):
            if index > 100000:
                raise ValueError("Document paragraph count exceeds its reader limit.")
            parts = []
            deleted = []
            tracked = False
            for node in paragraph.iter():
                ancestor = parents.get(id(node))
                nested_paragraph = False
                while ancestor is not None and ancestor is not paragraph:
                    if ancestor.tag == W + "p":
                        nested_paragraph = True
                        break
                    ancestor = parents.get(id(ancestor))
                if nested_paragraph:
                    continue
                if node.tag in {W + "ins", W + "del", W + "moveFrom", W + "moveTo"}:
                    tracked = True
                if node.tag == W + "delText":
                    deleted.append(node.text or "")
                if node.tag in {W + "t", W + "tab", W + "br", W + "cr"}:
                    ancestor = parents.get(id(node))
                    removed = False
                    while ancestor is not None and ancestor is not paragraph:
                        if ancestor.tag in {W + "del", W + "moveFrom"}:
                            removed = True
                        ancestor = parents.get(id(ancestor))
                    if removed:
                        continue
                    parts.append(
                        node.text or ""
                        if node.tag == W + "t"
                        else "\t"
                        if node.tag == W + "tab"
                        else "\n"
                    )
            text = "".join(parts)
            total += len(text)
            if total > 2_000_000:
                raise ValueError("Extracted document text exceeds its reader limit.")
            location = locations.get(id(paragraph), (None, None, None, None, None))
            result.append(
                DocumentParagraph(
                    paragraph=index,
                    text=text,
                    text_sha256=sha256(text.encode()).hexdigest(),
                    table=location[0],
                    row=location[1],
                    column=location[2],
                    merged_grid_span=location[3],
                    vertical_merge=location[4],
                    deleted_text=tuple(deleted),
                    has_tracked_changes=tracked,
                )
            )
        return tuple(result)


RTF_DESTINATIONS = {
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "header",
    "footer",
    "headerl",
    "headerr",
    "footerl",
    "footerr",
    "fldinst",
    "annotation",
    "datastore",
    "themedata",
    "colorschememapping",
    "listtable",
    "listoverridetable",
    "xmlnstbl",
    "generator",
}
RTF_SYMBOLS = {
    "par": "\n",
    "line": "\n",
    "tab": "\t",
    "emdash": "—",
    "endash": "–",
    "bullet": "•",
    "lquote": "‘",
    "rquote": "’",
    "ldblquote": "“",
    "rdblquote": "”",
}


def rtf_text(content: bytes) -> dict:
    if len(content) > MAX_MEMBER_BYTES or not content.startswith(b"{\\rtf"):
        raise ValueError("The source exceeds the RTF byte limit or lacks its signature.")
    source = content.decode("latin-1")
    stack: list[tuple[bool, int, str, int]] = []
    skip = False
    unicode_skip = 1
    fallback = 0
    encoding = "cp1252"
    output = []
    index = 0
    unsupported = set()
    while index < len(source):
        character = source[index]
        if character == "{":
            if len(stack) >= 200:
                raise ValueError("RTF nesting exceeds its reader limit.")
            stack.append((skip, unicode_skip, encoding, fallback))
            index += 1
            continue
        if character == "}":
            if not stack:
                raise ValueError("RTF groups are unbalanced.")
            skip, unicode_skip, encoding, fallback = stack.pop()
            index += 1
            continue
        if character in "\r\n":
            index += 1
            continue
        if character != "\\":
            if fallback:
                fallback -= 1
            elif not skip:
                output.append(character.encode("latin-1").decode(encoding, errors="strict"))
            index += 1
            continue
        index += 1
        if index >= len(source):
            raise ValueError("RTF ends within a control sequence.")
        control = source[index]
        if control in "{}\\":
            if fallback:
                fallback -= 1
            elif not skip:
                output.append(control)
            index += 1
            continue
        if control == "*":
            skip = True
            index += 1
            continue
        if control == "'":
            hexadecimal = source[index + 1 : index + 3]
            if not re.fullmatch(r"[0-9a-fA-F]{2}", hexadecimal):
                raise ValueError("RTF hex escape is invalid.")
            if fallback:
                fallback -= 1
            elif not skip:
                output.append(bytes.fromhex(hexadecimal).decode(encoding, errors="strict"))
            index += 3
            continue
        if not (control.isascii() and control.isalpha()):
            if fallback:
                fallback -= 1
            elif not skip:
                output.append({"~": "\u00a0", "_": "‑", "-": "", ":": ":"}.get(control, ""))
            index += 1
            continue
        match = re.match(r"([a-zA-Z]+)(-?\d+)? ?", source[index:])
        assert match
        word = match[1]
        number = int(match[2]) if match[2] is not None else None
        index += len(match[0])
        if word in RTF_DESTINATIONS:
            skip = True
        elif word in {"ansi", "mac", "pc", "pca"}:
            encoding = {"ansi": "cp1252", "mac": "mac_roman", "pc": "cp437", "pca": "cp850"}[word]
        elif word == "bin":
            if number is None or number < 0 or index + number > len(source):
                raise ValueError("RTF binary span is invalid.")
            index += number
        elif word == "ansicpg":
            if number is None:
                raise ValueError("RTF code page is absent.")
            try:
                encoding = codecs.lookup("cp" + str(number)).name
            except LookupError:
                raise ValueError("RTF code page is unsupported.") from None
        elif word == "uc":
            if number is None or not 0 <= number <= 16:
                raise ValueError("RTF Unicode fallback count is invalid.")
            unicode_skip = number
        elif word == "u":
            if number is None or not -32768 <= number <= 65535:
                raise ValueError("RTF Unicode code unit is invalid.")
            if not skip:
                output.append(chr(number if number >= 0 else number + 65536))
            fallback = unicode_skip
        elif word in RTF_SYMBOLS:
            if not skip:
                output.append(RTF_SYMBOLS[word])
        elif word in {"fcharset", "cpg"} and number not in (None, 0, 1, 77, 1252):
            unsupported.add(f"{word}{number}")
        if len(output) > 2_000_000:
            raise ValueError("RTF text exceeds its output limit.")
    if stack:
        raise ValueError("RTF groups are unbalanced.")
    try:
        text = (
            "".join(output)
            .encode("utf-16-le", errors="surrogatepass")
            .decode("utf-16-le", errors="strict")
        )
    except UnicodeError:
        raise ValueError("RTF contains an unresolved Unicode surrogate.") from None
    return {
        "text": text,
        "text_sha256": sha256(text.encode()).hexdigest(),
        "encoding_policy": (
            "RTF platform header/ansicpg and Unicode escapes; "
            "CP1252 only for an unspecified ANSI default."
        ),
        "status": "requires_font_mapping_review" if unsupported else "text_extracted",
        "unsupported_font_mappings": sorted(unsupported),
        "limitations": [
            (
                "RTF text is an extraction, not a reviewed scientific "
                "interpretation; tables/layout and font-specific glyph "
                "meanings require inspection."
            ),
            (
                "Embedded objects, pictures, field instructions and "
                "executable content are not evaluated."
            ),
        ],
    }


def xls_cells(
    content: bytes,
    selected_sheet: str | None = None,
    limit: int = 100,
    offset: int = 0,
    coordinate: str | None = None,
) -> dict:
    if len(content) > MAX_MEMBER_BYTES or not content.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        raise ValueError("The source exceeds the XLS limit or lacks the OLE workbook signature.")
    if not 1 <= limit <= 250 or not 0 <= offset <= 200000:
        raise ValueError("The requested XLS page is outside its bounds.")
    # xlrd exposes no type hints; runtime cells are validated before publication.
    import xlrd  # type: ignore[import-untyped]

    try:
        book = xlrd.open_workbook(
            file_contents=content,
            on_demand=True,
            ragged_rows=True,
            formatting_info=True,
            logfile=io.StringIO(),
        )
        try:
            names = book.sheet_names()
            if not names:
                raise ValueError("XLS workbook has no source worksheets.")
            name = selected_sheet or names[0]
            if name not in names:
                raise ValueError("The selected XLS sheet is absent.")
            sheet = book.sheet_by_name(name)
            if sheet.nrows * sheet.ncols > 200000:
                raise ValueError("The selected XLS sheet exceeds the cell profile.")
            cells = []
            for row in range(sheet.nrows):
                for column in range(sheet.row_len(row)):
                    cell = sheet.cell(row, column)
                    if cell.ctype == xlrd.XL_CELL_EMPTY:
                        continue
                    value = cell.value
                    if isinstance(value, float) and not math.isfinite(value):
                        value = None
                    cells.append(
                        {
                            "row": row + 1,
                            "column": column + 1,
                            "cell_type": cell.ctype,
                            "raw_value": value,
                            "style_index": sheet.cell_xf_index(row, column),
                        }
                    )
            selected_cell = None
            if coordinate is not None:
                match = re.fullmatch(r"([A-Z]{1,3})([1-9][0-9]{0,6})", coordinate)
                if match is None:
                    raise ValueError("Invalid XLS cell coordinate.")
                column_index = 0
                for letter in match[1]:
                    column_index = column_index * 26 + ord(letter) - ord("A") + 1
                selected_cell = next(
                    (
                        cell
                        for cell in cells
                        if cell["row"] == int(match[2]) and cell["column"] == column_index
                    ),
                    None,
                )
                if selected_cell is None:
                    raise ValueError("The selected XLS source cell is absent or empty.")
            return {
                "selected_cell": selected_cell,
                "sheet_names": names,
                "selected_sheet": name,
                "cells": cells[offset : offset + limit],
                "total_cells": len(cells),
                "date_mode": book.datemode,
                "reader_version": version("xlrd"),
                "merged_ranges": sheet.merged_cells,
                "limitations": [
                    (
                        "XLS reader exposes stored/cached cell values; it does not "
                        "expose or recalculate formula expressions."
                    ),
                    (
                        "Date cells retain serial values and workbook date mode; no "
                        "timezone is invented."
                    ),
                    (
                        "Macros, charts and embedded objects are not executed or "
                        "promoted to measurements."
                    ),
                ],
            }
        finally:
            book.release_resources()
    except xlrd.XLRDError:
        raise ValueError("The XLS workbook is unsupported or corrupt.") from None


def inspect_matlab(content: bytes) -> dict:
    if len(content) > MAX_MEMBER_BYTES:
        raise ValueError("MATLAB source exceeds the metadata profile.")
    # SciPy's metadata reader is untyped; outputs retain only bounded source metadata.
    from scipy.io import whosmat  # type: ignore[import-untyped]

    try:
        variables = whosmat(io.BytesIO(content))
    except (ValueError, TypeError, NotImplementedError):
        raise ValueError(
            "MATLAB data require a compatible v4/v5 reader; HDF5/v7.3 need a reviewed HDF5 adapter."
        ) from None
    return {
        "variables": [
            {"name": name, "shape": shape, "matlab_class": kind} for name, shape, kind in variables
        ],
        "reader": "scipy-whosmat",
        "limitations": [
            (
                "Variable shapes and classes do not establish physical "
                "units, run identity, calibration or independent samples."
            ),
            "This metadata inspection does not execute MATLAB code or load arbitrary objects.",
        ],
    }

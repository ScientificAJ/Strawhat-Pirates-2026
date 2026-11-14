"""Source-level data contracts; a table record is not an independent trial."""

from dataclasses import dataclass


@dataclass(frozen=True)
class SourceRow:
    """Unchanged CSV cells anchored to one-based physical source line numbers."""

    row_number: int
    line_end: int
    cells: tuple[str, ...]


@dataclass(frozen=True)
class RawTable:
    headers: tuple[str, ...]
    rows: tuple[SourceRow, ...]
    encoding: str
    physical_line_count: int
    empty_record_count: int

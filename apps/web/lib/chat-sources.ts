import type { Anchor } from "../components/workbench-common";

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const digest = (value: unknown) => /^[a-f0-9]{64}$/.test(text(value));
const integer = (value: unknown, minimum: number) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum;

export type ChatCitation = {
  id: string;
  number: number;
  label: string;
  origin: string;
  calculated: boolean;
  available: boolean;
  anchors: Anchor[];
  scopeNote?: string;
};

/** Accept recorded locators only; the source service verifies their bytes and scope. */
export function recordedAnchor(value: unknown): Anchor | null {
  const input = record(value);
  if (!digest(input.snapshot_id) || !digest(input.source_sha256)) return null;
  const ntrs = input.source_kind === "ntrs";
  if (ntrs) {
    if (
      !/^\d{11}$/.test(text(input.document_id)) ||
      !digest(input.capture_id) ||
      input.kind !== "document_page" ||
      input.accession != null ||
      input.investigation_version != null ||
      input.asset_id != null
    )
      return null;
  } else if (
    (input.source_kind != null && input.source_kind !== "psi") ||
    !text(input.accession) ||
    !integer(input.investigation_version, 1) ||
    input.document_id != null ||
    input.capture_id != null
  )
    return null;
  const validLocation = {
    metadata_field: Boolean(text(input.field)),
    table_cell: integer(input.source_row, 1) && integer(input.column, 0),
    text_lines:
      integer(input.source_row, 1) &&
      integer(input.line_end, 1) &&
      Number(input.line_end) >= Number(input.source_row),
    workbook_cell:
      Boolean(text(input.sheet)) &&
      /^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(text(input.cell)),
    document_page: integer(input.page, 1),
    document_paragraph: integer(input.paragraph, 1),
    document_figure: Boolean(text(input.member)) && digest(input.member_sha256),
    media_frame: integer(input.frame, 0),
  };
  const kind = text(input.kind);
  if (
    !Object.hasOwn(validLocation, kind) ||
    !validLocation[kind as keyof typeof validLocation]
  )
    return null;
  if (
    (input.start != null || input.end != null) &&
    (!integer(input.start, 0) ||
      !integer(input.end, 1) ||
      Number(input.end) <= Number(input.start))
  )
    return null;
  const fields = [
    "snapshot_id",
    "source_sha256",
    "kind",
    "accession",
    "investigation_version",
    "source_kind",
    "document_id",
    "capture_id",
    "asset_id",
    "field",
    "source_row",
    "column",
    "line_end",
    "sheet",
    "cell",
    "page",
    "paragraph",
    "start",
    "end",
    "member",
    "member_sha256",
    "frame",
  ];
  return Object.fromEntries(
    fields.filter((key) => input[key] != null).map((key) => [key, input[key]]),
  ) as Anchor;
}

function factAnchors(fact: RecordValue): {
  anchors: Anchor[];
  scopeNote?: string;
} {
  const content = record(fact.content);
  const candidates = [
    content.anchor,
    ...list(fact.sources),
    ...list(content.anchors),
  ];
  for (const key of ["hits", "matches", "results"]) {
    candidates.push(...list(content[key]).map((item) => record(item).anchor));
  }
  for (const key of [
    "parameter_sources",
    "condition_sources",
    "source_fields",
  ]) {
    candidates.push(
      ...Object.values(record(content[key])).map((item) => record(item).anchor),
    );
  }
  let tablePreview = false;
  if (
    fact.origin === "source_measurement" &&
    text(content.asset_id) &&
    digest(content.source_sha256)
  ) {
    for (const source of list(fact.sources).map(record)) {
      if (
        source.id !== content.asset_id ||
        source.sha256 !== content.source_sha256 ||
        source.accession !== content.accession
      )
        continue;
      const retainedRows = new Set(list(source.source_rows));
      for (const row of list(content.records).map(record)) {
        if (!integer(row.source_row, 1) || !retainedRows.has(row.source_row))
          continue;
        for (const field of list(row.fields).map(record)) {
          if (
            !integer(field.column_index, 0) ||
            typeof field.raw_text !== "string" ||
            list(row.raw_cells)[Number(field.column_index)] !== field.raw_text
          )
            continue;
          const anchor = recordedAnchor({
            snapshot_id: source.snapshot_id,
            source_sha256: source.sha256,
            source_kind: "psi",
            accession: source.accession,
            investigation_version: source.investigation_version,
            asset_id: source.id,
            kind: "table_cell",
            source_row: row.source_row,
            column: field.column_index,
          });
          if (anchor) {
            candidates.push(anchor);
            tablePreview = true;
          }
        }
      }
    }
  }
  // The line reader records physical line numbers and the exact retained asset.
  // This preserves its returned excerpt, without guessing a narrower claim span.
  const lines = list(content.lines).map(record);
  const asset = record(content.asset);
  if (
    fact.origin === "source_text" &&
    lines.length > 0 &&
    lines.every(
      (line, index) =>
        typeof line.text === "string" &&
        integer(line.line_number, 1) &&
        line.line_number === Number(lines[0].line_number) + index,
    )
  ) {
    candidates.push({
      snapshot_id: content.snapshot_id,
      source_sha256: asset.sha256,
      source_kind: "psi",
      accession: asset.accession,
      investigation_version: asset.investigation_version,
      asset_id: asset.id,
      kind: "text_lines",
      source_row: lines[0].line_number,
      line_end: lines.at(-1)?.line_number,
    });
  }
  const anchors = candidates
    .map(recordedAnchor)
    .filter((anchor): anchor is Anchor => anchor !== null);
  return {
    anchors: [
      ...new Map(
        anchors.map((anchor) => [JSON.stringify(anchor), anchor]),
      ).values(),
    ],
    ...(tablePreview
      ? {
          scopeNote:
            "Recorded cells cover the returned table preview; a claim-specific cell was not recorded.",
        }
      : {}),
  };
}

/** One stable number per fact, in first-citation order, across the displayed reply. */
export function chatCitations(claims: unknown, facts: unknown): ChatCitation[] {
  const byId = new Map(
    list(facts).map((fact) => [text(record(fact).id), record(fact)]),
  );
  const ids = [
    ...new Set(
      list(claims)
        .flatMap((claim) => list(record(claim).fact_ids))
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  return ids.map((id, index) => {
    const fact = byId.get(id);
    const origin = text(fact?.origin);
    return {
      id,
      number: index + 1,
      label:
        text(fact?.label) ||
        (fact ? "Evidence record" : "Unavailable evidence record"),
      origin:
        origin === "source_measurement"
          ? "source records (measurement status varies by field)"
          : origin.replaceAll("_", " ") || "Origin not recorded",
      calculated: origin === "deterministic_calculation",
      available: Boolean(fact),
      ...(fact ? factAnchors(fact) : { anchors: [] }),
    };
  });
}

import type { ScientificField, ScientificRecord } from "./api";

export type SourceFieldComparison = {
  left: ScientificField | null;
  right: ScientificField | null;
  status: "same" | "different" | "not_comparable";
};

function sameContext(left: ScientificField, right: ScientificField): boolean {
  return (
    left.quantity_kind === right.quantity_kind &&
    left.location === right.location &&
    left.basis === right.basis &&
    left.qualifier === right.qualifier
  );
}

function matchingQuantity(
  left: ScientificField,
  right: ScientificField,
): boolean {
  return Boolean(
    left.quantity_kind &&
    sameContext(left, right) &&
    left.canonical_unit &&
    left.canonical_unit === right.canonical_unit,
  );
}

function compareFields(
  left: ScientificField | null,
  right: ScientificField | null,
): SourceFieldComparison["status"] {
  if (!left || !right || !sameContext(left, right)) return "not_comparable";
  if (
    left.status === "normalized" &&
    right.status === "normalized" &&
    matchingQuantity(left, right) &&
    left.canonical_value !== null &&
    right.canonical_value !== null &&
    Number.isFinite(left.canonical_value) &&
    Number.isFinite(right.canonical_value)
  ) {
    return left.canonical_value === right.canonical_value
      ? "same"
      : "different";
  }
  if (
    left.status === "text" &&
    right.status === "text" &&
    Boolean(left.source_column) &&
    left.source_column === right.source_column &&
    left.original_unit === right.original_unit &&
    left.raw_text.trim() &&
    right.raw_text.trim()
  ) {
    return left.raw_text === right.raw_text ? "same" : "different";
  }
  return "not_comparable";
}

/** Compare source values, not whether the underlying experiments are equivalent. */
export function compareSourceRecords(
  left: ScientificRecord,
  right: ScientificRecord,
): SourceFieldComparison[] {
  const remaining = new Set(right.fields);
  const comparisons: SourceFieldComparison[] = left.fields.map((field) => {
    const sameColumn = [...remaining].filter(
      (candidate) =>
        field.source_column && candidate.source_column === field.source_column,
    );
    const sameQuantity = [...remaining].filter((candidate) =>
      matchingQuantity(field, candidate),
    );
    const leftColumnCount = left.fields.filter(
      (candidate) =>
        field.source_column && candidate.source_column === field.source_column,
    ).length;
    const leftQuantityCount = left.fields.filter((candidate) =>
      matchingQuantity(field, candidate),
    ).length;
    const match =
      sameColumn.length === 1 && leftColumnCount === 1
        ? sameColumn[0]
        : sameQuantity.length === 1 && leftQuantityCount === 1
          ? sameQuantity[0]
          : null;
    if (match) remaining.delete(match);
    return { left: field, right: match, status: compareFields(field, match) };
  });
  for (const field of remaining) {
    comparisons.push({ left: null, right: field, status: "not_comparable" });
  }
  return comparisons;
}

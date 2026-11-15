import assert from "node:assert/strict";
import test from "node:test";
import { compareSourceRecords } from "../apps/web/lib/source-record-comparison.ts";

function field(overrides = {}) {
  return {
    column_index: 0,
    source_column: "Oxygen",
    raw_text: "21",
    quantity_kind: "oxygen_fraction",
    original_unit: "%",
    canonical_value: 0.21,
    canonical_unit: "fraction",
    location: null,
    basis: "mole fraction",
    qualifier: null,
    status: "normalized",
    ...overrides,
  };
}

const record = (...fields) => ({ fields });

test("compares normalized source values while preserving each column and unit", () => {
  const [row] = compareSourceRecords(
    record(field()),
    record(
      field({
        source_column: "O2 fraction",
        raw_text: "0.21",
        original_unit: "fraction",
      }),
    ),
  );
  assert.equal(row.status, "same");
  assert.equal(row.left.source_column, "Oxygen");
  assert.equal(row.right.original_unit, "fraction");
  assert.equal(
    compareSourceRecords(
      record(field()),
      record(field({ canonical_value: 0.3 })),
    )[0].status,
    "different",
  );
});

test("does not compare missing, incompatible or ambiguous fields", () => {
  assert.equal(
    compareSourceRecords(
      record(field()),
      record(field({ status: "missing", canonical_value: null })),
    )[0].status,
    "not_comparable",
  );
  assert.equal(
    compareSourceRecords(
      record(field()),
      record(field({ canonical_unit: "kPa" })),
    )[0].status,
    "not_comparable",
  );
  const rows = compareSourceRecords(
    record(field({ source_column: "a" }), field({ source_column: "b" })),
    record(field({ source_column: "c" })),
  );
  assert.ok(rows.every((row) => row.status === "not_comparable"));
});

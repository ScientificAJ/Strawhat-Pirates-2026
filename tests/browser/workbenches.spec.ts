import { expect, test } from "@playwright/test";
import {
  compileFilters,
  initialFilters,
  parseRunIdentity,
  proposeLanguage,
  sensitivityScore,
} from "../../apps/web/lib/discovery-helpers";

test("explicit filter compiler keeps units, original value kind, and threshold boundaries", () => {
  const proposed = proposeLanguage(
    "records in PSI-25 with oxygen volume fraction above 25%",
    initialFilters,
  );
  expect(proposed.filters.minimum).toBe("0.25");
  const compiled = compileFilters(
    { ...proposed.filters, valueKind: "measurement" },
    "f".repeat(64),
  );
  expect("predicates" in compiled && compiled.predicates).toEqual([
    {
      quantity_kind: "oxygen_fraction",
      operator: "gt",
      value: 0.25,
      unit: "1",
      basis: "volume",
      source_value_kind: "measurement",
      include_missing: false,
    },
  ]);
  expect(
    compileFilters(
      { ...initialFilters, entity: "records", requireQuantity: true },
      "f".repeat(64),
    ),
  ).toMatchObject({
    predicates: [
      {
        operator: "present",
        quantity_kind: "oxygen_fraction",
        unit: "1",
        include_missing: false,
      },
    ],
  });
  expect(() =>
    compileFilters(
      { ...initialFilters, entity: "records", minimum: "Infinity" },
      "f".repeat(64),
    ),
  ).toThrow("finite");
  expect(proposeLanguage("high oxygen", initialFilters).filters.minimum).toBe(
    "",
  );
});

test("frozen row identities and weight sensitivity preserve unknowns", () => {
  const identity = ["PSI-99", "asset-original", "a".repeat(64), 2];
  expect(
    parseRunIdentity(encodeURIComponent(JSON.stringify(identity))),
  ).toEqual(identity);
  expect(() =>
    parseRunIdentity(JSON.stringify(["PSI-99", "asset", "bad", 2])),
  ).toThrow();
  expect(sensitivityScore({ a: 1, b: null }, { a: 0.5, b: 0.5 })).toEqual({
    lower: 0.5,
    upper: 1,
    complete: false,
  });
  expect(sensitivityScore({ a: 1, b: 0 }, { a: 0.5, b: 0.5 })).toEqual({
    lower: 0.5,
    upper: 0.5,
    complete: true,
  });
});

test("discovery applies explicit conditions, returns to pinned selection, and reveals exact source", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/investigations?entity=records&accession=PSI-25");
  await expect(
    page.getByRole("tab", { name: "Search data records", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByLabel("Source value kind", { exact: true })
    .selectOption("measurement");
  await page
    .getByRole("combobox", { name: "Additional source field", exact: true })
    .selectOption({ label: "Test # · original text" });
  await page
    .getByLabel("Value in the displayed canonical unit, or original text", {
      exact: true,
    })
    .fill("B1");
  await page
    .getByRole("button", { name: "Add condition to draft", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply filters", exact: true })
    .click();
  await expect(page.getByText(/source records found/)).toBeVisible();
  const first = page.locator("article").first();
  await first.getByRole("checkbox").check();
  await first.getByRole("link").first().click();
  await expect(
    page.getByRole("heading", { name: /PSI-25 · source record/ }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.locator("article").first().getByRole("checkbox"),
  ).toBeChecked();
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: /Inspect/ })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Exact source inspector" }),
  ).toContainText("PSI-25");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("complementary", { name: "Exact source inspector" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("retained protocols render exact paragraphs and keep personal planning state", async ({
  page,
}) => {
  await page.goto("/app/investigations/PSI-99?section=sources");
  await page
    .locator(".asset-row")
    .filter({ hasText: "SAFFIRE-II Readme.docx" })
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await expect(
    page.getByText("The objectives of the SAFFIRE", { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect exact source", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Exact source inspector" }),
  ).toContainText("objectives of the SAFFIRE");
  await page.goto("/app/lab/evidence?view=controls");
  await expect(
    page.getByRole("heading", {
      name: "Research for fire safety",
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("personal control assessment reopens with its category, exact evidence and stale-input warning", async ({
  page,
}) => {
  await page.goto("/app/lab/evidence?view=controls");
  await page
    .getByText("Create your own source-backed control assessment", {
      exact: true,
    })
    .click();
  await page
    .getByRole("textbox", { name: "Source search terms", exact: true })
    .fill("oxygen");
  await page
    .getByRole("button", { name: "Search sources", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Attach as supporting source", exact: true })
    .first()
    .click();
  await page
    .getByRole("combobox", { name: "Research category", exact: true })
    .selectOption("Detection");
  await page
    .getByLabel("Candidate control or technology", { exact: true })
    .fill("Source-scoped detector research");
  await page
    .getByLabel("Mechanism supported or proposed", { exact: true })
    .fill(
      "Research hypothesis: characterize sensor response in the source conditions.",
    );
  await page
    .getByLabel("Intended research outcome", { exact: true })
    .fill("Understand which observations discriminate response limitations.");
  await page
    .getByLabel("Necessary validation (one requirement per line)", {
      exact: true,
    })
    .fill(
      "Validate sensor calibration and representative transport conditions.",
    );
  await page
    .getByLabel("Limits and unsupported uses (one per line)", { exact: true })
    .fill("No detector performance or operational suitability is established.");
  await page
    .getByRole("button", {
      name: "Assess the stated evidence and limits",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("Assessment completed on the explicit inputs.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    page.getByText("Personal revision 1 saved.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByText(/Saved assessments/).click();
  await page
    .getByRole("button", { name: "Open saved record", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("combobox", { name: "Research category", exact: true }),
  ).toHaveValue("Detection");
  await expect(
    page.getByLabel("Candidate control or technology", { exact: true }),
  ).toHaveValue("Source-scoped detector research");
  await page
    .getByRole("combobox", {
      name: "Researcher-selected evidence status",
      exact: true,
    })
    .selectOption("unresolved");
  await expect(
    page.getByText(/The retained assessment refers to earlier inputs/),
  ).toBeVisible();
});

test("a deleted comparison cannot be silently recreated by a stale editor", async ({
  page,
}) => {
  await page.goto("/app/compare?ids=PSI-25,PSI-69");
  await page
    .getByText("Comparison name and source version", { exact: true })
    .click();
  await page
    .getByLabel("Name", { exact: true })
    .fill("Deletion conflict regression");
  await page
    .getByText("Check experimental comparability and rank evidence", {
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Condition difference matrix",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save comparison", exact: true })
    .click();
  await expect(
    page.getByText("Frozen comparison revision 1 saved in this browser.", {
      exact: true,
    }),
  ).toBeVisible();
  const stored = await page.evaluate(
    async () =>
      new Promise<{ id: string; snapshot: string }>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onerror = () => reject(new Error("Fixture store unavailable"));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("documents");
          const found = tx.objectStore("documents").getAll();
          tx.oncomplete = () => {
            db.close();
            const document = found.result.find(
              (value) => value.title === "Deletion conflict regression",
            );
            resolve({ id: document.id, snapshot: document.snapshot_id });
          };
        };
      }),
  );
  const stale = await page.context().newPage();
  try {
    await stale.goto(`/app/compare/${stored.id}?snapshot=${stored.snapshot}`);
    await stale
      .getByText("Comparison name and source version", { exact: true })
      .click();
    await expect(stale.getByLabel("Name", { exact: true })).toHaveValue(
      "Deletion conflict regression",
    );
    await stale
      .getByLabel("What would you like to compare?", { exact: true })
      .fill("An unsaved question in the older editor.");
    await page.evaluate(
      async (id) =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open("nova-ember-workspace", 2);
          opening.onerror = () =>
            reject(new Error("Fixture store unavailable"));
          opening.onsuccess = () => {
            const db = opening.result;
            const tx = db.transaction("documents", "readwrite");
            tx.objectStore("documents").delete(id);
            tx.oncomplete = () => {
              db.close();
              resolve();
            };
            tx.onerror = () => reject(new Error("Fixture removal failed"));
          };
        }),
      stored.id,
    );
    await stale
      .getByRole("button", { name: "Save comparison", exact: true })
      .click();
    await expect(
      stale
        .getByRole("alert")
        .filter({ hasText: "This item changed in another tab" }),
    ).toBeVisible();
    await expect(
      stale.getByLabel("What would you like to compare?", { exact: true }),
    ).toHaveValue("An unsaved question in the older editor.");
    expect(
      await page.evaluate(
        async (id) =>
          new Promise<boolean>((resolve, reject) => {
            const opening = indexedDB.open("nova-ember-workspace", 2);
            opening.onerror = () =>
              reject(new Error("Fixture store unavailable"));
            opening.onsuccess = () => {
              const db = opening.result;
              const tx = db.transaction("documents");
              const result = tx.objectStore("documents").get(id);
              tx.oncomplete = () => {
                db.close();
                resolve(result.result === undefined);
              };
            };
          }),
        stored.id,
      ),
    ).toBe(true);
  } finally {
    await stale.close();
  }
});

test("saved collections reopen exact source selections, undo clearing, and restore immutable selections", async ({
  page,
}) => {
  await page.goto("/app/investigations?entity=records&accession=PSI-25");
  const records = page.locator("article input[type=checkbox]");
  await records.nth(0).check();
  await records.nth(1).check();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByText("Save or return to a search", { exact: true }).click();
  await page
    .getByLabel("Name this query", { exact: true })
    .fill("Frozen source collection regression");
  await page
    .getByRole("button", { name: "Save collection", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Saved. You can find this research" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(records.nth(0)).not.toBeChecked();
  await page
    .getByRole("button", { name: "Undo selection change", exact: true })
    .click();
  await expect(records.nth(0)).toBeChecked();
  await expect(records.nth(1)).toBeChecked();
  await records.nth(1).uncheck();
  await page
    .getByRole("button", { name: "Save collection revision", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Saved. You can find this research" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Open Frozen source collection regression · revision 2",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByText("Save or return to a search", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Open Frozen source collection regression · revision 2",
      exact: true,
    })
    .click();
  await expect(records.nth(0)).toBeChecked();
  await expect(records.nth(1)).not.toBeChecked();
  await page
    .getByRole("combobox", {
      name: "Restore collection selection revision",
      exact: true,
    })
    .selectOption("1");
  await expect(records.nth(0)).toBeChecked();
  await expect(records.nth(1)).toBeChecked();
});

test("catalog facets expose source-backed alternatives and counts without claiming measured conditions", async ({
  page,
}) => {
  await page.goto("/app/investigations");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Availability", exact: true })
    .selectOption("");
  await expect(
    page.getByText("36 research entries found", { exact: true }),
  ).toBeVisible();
  await page
    .locator("#discovery-filter-panel summary")
    .filter({ hasText: "Material / fuel named in catalog" })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Material / fuel named in catalog: Nomex (2)",
      exact: true,
    })
    .check();
  await expect(
    page.getByText("2 research entries found", { exact: true }),
  ).toBeVisible();
  await page
    .locator("#discovery-filter-panel summary")
    .filter({ hasText: "Instrument named in catalog" })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Instrument named in catalog: Thermocouples (1)",
      exact: true,
    })
    .check();
  await expect(
    page.getByText("1 research entries found", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "SAFFIRE-II", exact: true }),
  ).toBeVisible();
  // Own material selection is excluded from its option count; the instrument remains applied.
  await expect(
    page.getByRole("checkbox", {
      name: "Material / fuel named in catalog: SIBAL cotton / fiberglass composite (2)",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByText("Topic sources · PSI-99", {
      exact: true,
    })
    .click();
  const material = page
    .locator("article")
    .first()
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "material", exact: true }),
    });
  await material
    .getByRole("button", { name: "Inspect exact source", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Exact source inspector" }),
  ).toContainText("PMMA with Nomex");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", {
      name: "Remove sensor catalog filter Thermocouples",
      exact: true,
    })
    .click();
  await expect(
    page.getByText("2 research entries found", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("investigation watches reopen their frozen baseline and public change feed", async ({
  page,
}) => {
  let checked = 0;
  await page.route("**/v1/snapshots/*/changes", (route) => {
    checked++;
    return route.fulfill({
      json: {
        observed_changes: [
          {
            accession: "PSI-69",
            status: "metadata_changed",
            changed_fields: ["description"],
          },
        ],
        released_changes: {},
        limitations: [
          "Offline change-feed fixture; no source release was promoted.",
        ],
      },
    });
  });
  await page.goto("/app/investigations/PSI-69?section=sources");
  await page
    .getByRole("button", { name: "Watch source changes", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 observed changes for PSI-69." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Pause source watch", exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "1 observed changes for PSI-69." }),
  ).toBeVisible();
  expect(checked).toBeGreaterThanOrEqual(2);
  await page.goto("/app/settings");
  await page.getByText("Source watches", { exact: true }).click();
  await page
    .getByRole("link", { name: "PSI-69 · source watch", exact: true })
    .click();
  await expect(page).toHaveURL(/snapshot=[a-f0-9]{64}/);
  await page
    .getByRole("button", { name: "Pause source watch", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Watch source changes", exact: true }),
  ).toBeVisible();
});

import { expect, Page, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function scientificRecords(page: Page, accession: string) {
  await page.goto(`/app/investigations/${accession}?section=sources`);
  await page
    .locator(".asset-row")
    .filter({ hasText: ".csv" })
    .first()
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Scientific records", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Experimental records",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".scientific-records")).not.toHaveAttribute(
    "aria-busy",
    "true",
  );
}

test("preserve mixed row roles, ranges, days, and sessions without inventing runs", async ({
  page,
}) => {
  await scientificRecords(page, "PSI-99");
  const category = page.getByLabel("Record category", { exact: true });
  await expect(category.locator('option[value="sample_record"]')).toHaveText(
    "Sample record (9)",
  );
  await expect(
    category.locator('option[value="flow_visualization"]'),
  ).toHaveText("Flow visualization (2)");
  await expect(category.locator('option[value="note"]')).toHaveText(
    "Source note (4)",
  );
  await category.selectOption("note");
  await expect(
    page
      .getByRole("region", { name: "Experimental source values", exact: true })
      .locator("tbody > tr"),
  ).toHaveCount(4);
  await expect(
    page.getByText("4 records in this category", { exact: true }),
  ).toBeVisible();
  await category.selectOption("sample_record");
  await expect(
    page
      .getByRole("region", { name: "Experimental source values", exact: true })
      .locator("tbody > tr"),
  ).toHaveCount(9);
  await page.getByRole("button", { name: "Record 2", exact: true }).click();
  const thickness = page.locator(".field-table tbody tr").filter({
    has: page.getByRole("rowheader", {
      name: "Samle Thickness",
      exact: true,
    }),
  });
  await expect(thickness.locator("td").nth(0)).toHaveText("0.27 mm");
  await expect(thickness.locator("td").nth(1)).toHaveText("0.00027 m");
  const oxygen = page.locator(".field-table tbody tr").filter({
    has: page.getByRole("rowheader", {
      name: "Percent O2 (Note 1)",
      exact: true,
    }),
  });
  await expect(oxygen).toContainText("~ 21.5");
  await expect(oxygen).toContainText("Source value type: derived");
  const notApplicable = page.locator(".field-table tbody tr").filter({
    has: page.getByRole("rowheader", {
      name: "?-g Spread Length",
      exact: true,
    }),
  });
  await expect(notApplicable.locator("td").nth(0)).toHaveText("n/a");
  await expect(notApplicable).toContainText("Not applicable");

  for (const [accession, count, role] of [
    ["PSI-68", 8, "Condition-range summaries"],
    ["PSI-20", 18, "Daily summaries"],
    ["PSI-47", 2, "Session records"],
  ] as const) {
    await scientificRecords(page, accession);
    const table = page.getByRole("region", {
      name: "Experimental source values",
      exact: true,
    });
    await expect(table.locator("tbody > tr")).toHaveCount(count);
    await table
      .getByRole("button", { name: /^Record / })
      .first()
      .click();
    await expect(table.getByRole("heading", { level: 3 })).toContainText(
      role.replace(/summaries$/, "summary").replace(/records$/, "record"),
    );
    await page
      .getByText("How to interpret these records", { exact: true })
      .click();
    await expect(
      page.getByText(
        "Independent experimental units have not been established for this table.",
        { exact: true },
      ),
    ).toBeVisible();
  }
});

test("distinguish raw zero, missingness, and withheld meaning on a narrow dark source view", async ({
  page,
}) => {
  await scientificRecords(page, "PSI-69");
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Switch to dark theme", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await page.getByRole("button", { name: "Record 2", exact: true }).click();
  const helium = page.locator(".mobile-scientific-field").filter({
    has: page.getByRole("heading", {
      name: "He initial ambient composition; mole fraction",
      exact: true,
    }),
  });
  await expect(helium.locator(".field-original")).toHaveText("0");
  await expect(helium.locator(".field-normalized")).toHaveText("0 1");
  const burning = page.locator(".mobile-scientific-field").filter({
    has: page.getByRole("heading", { name: "Burning rate; mm", exact: true }),
  });
  await expect(burning.locator(".field-original")).toHaveText("0.52");
  await expect(burning.locator(".field-normalized")).toHaveText(
    "Meaning unresolved",
  );
  await page.getByRole("button", { name: "Record 5", exact: true }).click();
  const missingDiameter = page.locator(".mobile-scientific-field").filter({
    has: page.getByRole("heading", {
      name: "Visible flame extinction diameter; mm",
      exact: true,
    }),
  });
  await expect(missingDiameter.locator(".field-original")).toHaveText(
    "Empty cell",
  );
  await expect(missingDiameter).toContainText("Not reported");
  await expect(missingDiameter.locator(".field-normalized")).toHaveText(
    "No reported value",
  );
  await page.getByRole("button", { name: "Quality", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Unresolved fields in this page" }),
  ).toBeVisible();
  await expect(page.locator(".quality-view")).toContainText(
    "source burning-rate header",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.route("**/records?**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        detail: "Source interpretation is temporarily unavailable.",
      }),
    }),
  );
  await page.reload();
  await page
    .locator(".asset-row")
    .filter({ hasText: ".csv" })
    .first()
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Scientific records", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Source interpretation is temporarily unavailable." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Return to original values", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "20CAL08", exact: true }),
  ).toBeVisible();
});

test("pin an exact source row and preserve new and legacy research backups", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/app/cases/new");
  await page
    .getByLabel("Notes title", { exact: true })
    .fill("Pinned Saffire source");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/cases\/[a-f0-9-]+$/);
  const caseUrl = page.url();
  const caseTitle = await page
    .getByLabel("Notes title", { exact: true })
    .inputValue();
  const staleEditor = await page.context().newPage();
  await staleEditor.goto(caseUrl);
  await staleEditor
    .getByLabel("Notes and unresolved questions")
    .fill("A draft opened before the source row was attached.");
  await scientificRecords(page, "PSI-99");
  await page.getByRole("button", { name: "Record 2", exact: true }).click();
  await page
    .getByText("Attach this record to saved research", { exact: true })
    .click();
  await page
    .getByLabel("Research case for physical row 2", { exact: true })
    .selectOption({ label: caseTitle });
  await page
    .getByRole("button", { name: "Attach source row", exact: true })
    .click();
  await expect(
    page.getByText("Physical row 2 attached as revision 2.", { exact: true }),
  ).toBeVisible();
  await staleEditor
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    staleEditor
      .getByRole("alert")
      .filter({ hasText: "This case changed in another tab." }),
  ).toBeVisible();
  await staleEditor.close();
  await page.goto(caseUrl);
  await expect(
    page.getByRole("heading", { name: "Pinned source rows" }).first(),
  ).toBeVisible();
  await page.goto("/app/settings");
  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download research backup", exact: true })
    .click();
  const backupPath = testInfo.outputPath("source-anchors.json");
  await (await downloadEvent).saveAs(backupPath);
  const backup = JSON.parse(await readFile(backupPath, "utf8"));
  expect(backup.version).toBe(2);
  expect(backup.cases[0].source_anchors).toHaveLength(1);
  const anchor = backup.cases[0].source_anchors[0];
  expect(anchor.source_sha256).toBe(
    "3c24390b9ef86f3d1ebaab911a1a3cc95a8759aebf42062371370e6d4b31b8ac",
  );
  expect(anchor.source_row).toBe(2);
  expect(anchor.raw_cells[2]).toBe("0.27 mm");
  expect(anchor.raw_cells[12]).toBe("n/a");
  expect(backup.cases[0].revisions[1].source_anchors).toEqual([anchor]);
  expect(backup.cases[0].notes).toBe("");

  const isolated = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const restored = await isolated.newPage();
    await restored.goto("/app/cases");
    await restored
      .getByLabel("Restore a research backup")
      .setInputFiles(backupPath);
    await restored
      .getByRole("button", { name: "Import independent copies", exact: true })
      .click();
    await expect(
      restored.getByRole("region", {
        name: "Review research restore",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      restored
        .getByRole("status")
        .filter({ hasText: /Restored .* research items/ }),
    ).toBeVisible();
    await restored
      .getByRole("banner")
      .getByRole("link", { name: "Your research", exact: true })
      .click();
    await restored.getByRole("link", { name: new RegExp(caseTitle) }).click();
    await expect(
      restored.getByRole("heading", { name: "Pinned source rows" }).first(),
    ).toBeVisible();
    await restored
      .locator(".source-identity > .case-source-evidence > details")
      .locator("summary")
      .click();
    await expect(
      restored.locator(".source-identity > .case-source-evidence"),
    ).toContainText(anchor.source_sha256);
    await expect(
      restored.locator(".source-identity > .case-source-evidence"),
    ).toContainText("0.27 mm");
    const legacy = JSON.parse(JSON.stringify(backup));
    legacy.version = 1;
    delete legacy.documents;
    for (const item of legacy.cases) {
      item.title = "Legacy source notebook";
      delete item.source_anchors;
      for (const revision of item.revisions) delete revision.source_anchors;
    }
    await restored.getByLabel("Restore a research backup").setInputFiles({
      name: "legacy-v1.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(legacy)),
    });
    await restored
      .getByRole("button", { name: "Import independent copies", exact: true })
      .click();
    await expect(
      restored.getByRole("region", {
        name: "Review research restore",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      restored
        .getByRole("status")
        .filter({ hasText: /Restored .* research items/ }),
    ).toBeVisible();
    await restored
      .getByRole("banner")
      .getByRole("link", { name: "Your research", exact: true })
      .click();
    await expect(
      restored.getByRole("link", { name: /Legacy source notebook/ }),
    ).toBeVisible();
    await expect(
      restored
        .getByRole("region", { name: "Saved research", exact: true })
        .getByRole("heading", { level: 2 }),
    ).toHaveCount(2);
  } finally {
    await isolated.close();
  }
});

test("inspect retained workbook formulas separately from cached values and read exact text lines", async ({
  page,
}) => {
  await page.goto("/app/investigations/PSI-25?section=sources");
  await page
    .locator(".asset-row")
    .filter({ hasText: "PSI-25_Reference Data_Fan calibration data.xlsx" })
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original workbook cells", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Worksheet", { exact: true })).toHaveValue(
    "Fan Calibration data",
  );
  await expect(
    page.getByText(
      "Formulas are preserved as source text and are not executed.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next cells", exact: true }).click();
  await expect(
    page.getByText("Cells 101–200 of 1755", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next cells", exact: true }).click();
  await expect(
    page.getByText("Cells 201–300 of 1755", { exact: true }),
  ).toBeVisible();
  const formulaCell = page
    .locator(".workbook-table tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "D7", exact: true }) });
  await expect(formulaCell.locator("td").nth(0)).toHaveText("12.2");
  await expect(formulaCell.locator("td").nth(1)).toHaveText("B7/10");
  await expect(formulaCell.locator("td").nth(2)).toHaveText("12.2");
  await formulaCell
    .getByText("Inspect cell attributes", { exact: true })
    .click();
  await expect(formulaCell).toContainText("Raw XML value");
  await expect(formulaCell).toContainText("Fan Calibration data");

  await page.goto("/app/investigations/PSI-69?section=sources");
  await page
    .locator(".asset-row")
    .filter({ hasText: "PSI-69_Raw Data_FLEX-007_TestSheet.txt" })
    .getByRole("button", { name: "Inspect source", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Original source text", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".source-text-table")).toContainText("FLEX-007");
  const identifier = page
    .locator(".source-text-table tbody tr")
    .filter({ has: page.getByRole("rowheader", { name: "6", exact: true }) });
  await expect(identifier).toContainText("CIR Test Number:");
  await expect(identifier).toContainText("20CAL13");
  await expect(
    page.getByRole("link", { name: "Download original file", exact: true }),
  ).toHaveAttribute(
    "href",
    /cb748242c189bca59b861d0bb0f406fb7a80aee1710cee363f7620c43d66e2a0\/raw\?snapshot_id=[a-f0-9]{64}/,
  );
});

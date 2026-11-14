import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("inspect a real source, reproduce its labels, and recover a failed catalog request", async ({
  page,
}) => {
  await page.goto("/app/investigations");
  await expect(
    page.getByText("24 investigations", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search investigations" })
    .fill("FLEX");
  await page.getByRole("link", { name: "FLEX", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "FLEX", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Inspect table", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Burning rate; mm", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "20CAL08", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("cp1252 encoding", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByText("Records 31–60 of 274", { exact: true }),
  ).toBeVisible();

  await page.goto("/app/lab");
  const chart = page.getByRole("img", { name: /Completion: 27 records/ });
  await expect(chart).toHaveAttribute(
    "aria-label",
    "Completion: 27 records; Disruption: 61 records; Extinction: 186 records",
  );
  await expect(
    page.getByText("274 table records", { exact: true }),
  ).toBeVisible();
  await page
    .getByText("Method, provenance, and limitations", { exact: true })
    .click();
  await expect(
    page.getByText(/no conversion to mm²\/s is authorized/i),
  ).toBeVisible();

  await page.route("**/v1/investigations?limit=100", (route) => route.abort());
  await page.goto("/app/investigations");
  await expect(
    page.getByRole("alert").filter({ hasText: "Evidence could not be loaded" }),
  ).toContainText("Evidence could not be loaded");
  await page.unroute("**/v1/investigations?limit=100");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByText("24 investigations", { exact: true }),
  ).toBeVisible();
});

test("calculate oxygen partial pressure with explicit assumptions and refuse unsupported pooling", async ({
  page,
}) => {
  await page.goto("/app/lab/scenarios");
  await page
    .getByRole("button", { name: "Calculate partial pressure" })
    .click();
  await expect(page.locator(".calculated-value")).toHaveText("3.087psia");
  await expect(
    page.getByText(
      "Similar partial pressures do not establish equivalent flammability.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByLabel("Oxygen mole fraction").fill("30");
  await page.getByLabel("Total absolute pressure").fill("10.2");
  await expect(
    page.getByText("Inputs changed — recalculate", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export calculation" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Calculate partial pressure" })
    .click();
  await expect(page.locator(".calculated-value")).toHaveText("3.06psia");
  await expect(
    page.getByText("30% oxygen × 10.2 psia absolute", { exact: true }),
  ).toBeVisible();

  await page.goto("/app/compare");
  await page
    .locator(".comparison-choice")
    .filter({ hasText: "PSI-25" })
    .getByRole("checkbox")
    .check();
  await page
    .locator(".comparison-choice")
    .filter({ hasText: "PSI-69" })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Check comparability" }).click();
  await expect(
    page.getByRole("heading", { name: "Comparability assessment" }),
  ).toBeVisible();
  await expect(
    page.getByText("Quantitative pooling unsupported", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Not established", exact: true }),
  ).toHaveCount(5);
});

test("save a revision and restore a portable case in an independent browser, with mobile navigation", async ({
  page,
  browser,
}, testInfo) => {
  await page.goto("/app/investigations/PSI-69");
  await page
    .getByRole("button", { name: "Save to a case", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/cases\/[a-f0-9-]+$/);
  await page.getByLabel("Case title").fill("FLEX endpoint interpretation");
  await page
    .getByLabel("Research question")
    .fill(
      "How are disruption and extinction distinguished in the original table?",
    );
  await page
    .getByLabel("Notes and unresolved questions")
    .fill(
      "Keep all three source labels. Confirm the burning-rate unit from the protocol.",
    );
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revision 2 saved", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes and unresolved questions")).toHaveValue(
    "Keep all three source labels. Confirm the burning-rate unit from the protocol.",
  );

  const downloadEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up workspace", exact: true })
    .click();
  const download = await downloadEvent;
  const backupPath = testInfo.outputPath("workspace.json");
  await download.saveAs(backupPath);
  const before = JSON.parse(await readFile(backupPath, "utf8"));
  expect(before.cases).toHaveLength(1);
  expect(before.cases[0].investigation_ids).toEqual(["PSI-69"]);
  expect(before.cases[0].revisions).toHaveLength(2);

  const other = await browser.newContext({
    viewport: { width: 390, height: 844 },
    baseURL: testInfo.project.use.baseURL,
  });
  try {
    const restored = await other.newPage();
    await restored.goto("/app/cases");
    await expect(
      restored.getByRole("heading", {
        name: "Begin with a question worth keeping",
      }),
    ).toBeVisible();
    await restored
      .getByLabel("Restore a workspace backup")
      .setInputFiles(backupPath);
    await restored
      .getByRole("link", { name: /FLEX endpoint interpretation/ })
      .click();
    expect(restored.url()).not.toContain(before.cases[0].id);
    await expect(
      restored.getByLabel("Notes and unresolved questions"),
    ).toHaveValue(before.cases[0].notes);
    await restored
      .getByLabel("Notes and unresolved questions")
      .fill("A separate note in the restored copy.");
    await restored
      .getByRole("button", { name: "Save revision", exact: true })
      .click();
    await page.reload();
    await expect(page.getByLabel("Notes and unresolved questions")).toHaveValue(
      before.cases[0].notes,
    );

    await expect
      .poll(() =>
        restored.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      )
      .toBe(true);
    await expect(restored.locator("#mobile-navigation")).toBeHidden();
    await restored.getByRole("button", { name: "More", exact: true }).click();
    await expect(
      restored
        .getByRole("complementary", { name: "Application navigation" })
        .getByRole("button", { name: "Close navigation", exact: true }),
    ).toBeFocused();
    await restored.keyboard.press("Escape");
    await expect(
      restored.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
    await expect(restored.locator("#mobile-navigation")).toBeHidden();
    await restored.keyboard.press("Tab");
    expect(
      await restored.evaluate(() =>
        Boolean(document.activeElement?.closest("#mobile-navigation")),
      ),
    ).toBe(false);
  } finally {
    await other.close();
  }
});

import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("reproduce source-label counts and recover a failed exact discovery request", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("img", {
      name: "Completion: 27 records; Disruption: 61 records; Extinction: 186 records",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("274 table records", { exact: true }),
  ).toBeVisible();
  await page.route("**/v1/discovery/investigations", (route) => route.abort());
  await page.goto("/app/investigations");
  await expect(
    page.getByRole("alert").filter({ hasText: "Evidence could not be loaded" }),
  ).toBeVisible();
  await page.unroute("**/v1/discovery/investigations");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByLabel("Exact metadata terms").fill("FLEX");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "FLEX", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "FLEX", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "FLEX", exact: true }),
  ).toBeVisible();
});

test("calculate stated oxygen and pressure while keeping unsupported pooling unresolved", async ({
  page,
}) => {
  await page.goto("/app/lab/scenarios");
  const oxygen = page.getByRole("group", {
    name: "Oxygen mole fraction",
    exact: true,
  });
  const pressure = page.getByRole("group", {
    name: "Total absolute pressure",
    exact: true,
  });
  await oxygen
    .getByRole("textbox", { name: "Oxygen mole fraction", exact: true })
    .fill("21");
  await pressure
    .getByRole("textbox", { name: "Total absolute pressure", exact: true })
    .fill("14.7");
  await pressure.getByLabel("Unit", { exact: true }).fill("psia");
  await page
    .getByRole("button", { name: "Calculate partial pressure", exact: true })
    .click();
  await expect(page.locator(".calculated-value")).toHaveText("3.087psia");
  await oxygen
    .getByRole("textbox", { name: "Oxygen mole fraction", exact: true })
    .fill("30");
  await pressure
    .getByRole("textbox", { name: "Total absolute pressure", exact: true })
    .fill("10.2");
  await expect(
    page.getByText("Atmosphere changed; prior calculation is stale.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Calculate partial pressure", exact: true })
    .click();
  await expect(page.locator(".calculated-value")).toHaveText("3.06psia");
  await expect(
    page.getByText(/Similar partial pressure does not establish equivalent/),
  ).toBeVisible();
  await page.goto("/app/compare?ids=PSI-25,PSI-69");
  await expect(
    page.getByRole("heading", { name: "Comparability: unknown", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/^quantitative pooling:\s*not established$/),
  ).toContainText("not established");
  await expect(
    page.getByRole("heading", {
      name: "Condition difference matrix",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Not reported", exact: true }),
  ).toHaveCount(66);
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
      .getByRole("button", { name: "Import independent copies", exact: true })
      .click();
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

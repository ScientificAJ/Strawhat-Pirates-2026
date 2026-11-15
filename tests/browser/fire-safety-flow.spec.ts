import { expect, test } from "@playwright/test";

test("fire-safety filters and source comparisons connect discovery to evidence", async ({
  page,
}) => {
  await page.goto("/app/investigations?focus=prevention");
  await expect(
    page.getByRole("button", { name: "Prevention", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Purpose: Material flammability")).toBeVisible();
  await page.getByRole("button", { name: "Suppression", exact: true }).click();
  await expect(page.getByText("Purpose: Suppression research")).toBeVisible();
  await page.goto("/app/compare");
  await page.getByRole("button", { name: "MDCA droplet studies" }).click();
  await expect(
    page.getByRole("heading", { name: "Research side by side" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "FLEX", exact: true }).first(),
  ).toBeVisible();

  await page.goto("/app/investigations?entity=records&accession=PSI-25");
  const records = page.locator("article input[type=checkbox]");
  await records.nth(0).check();
  await records.nth(1).check();
  await page.getByRole("button", { name: "Compare side by side" }).click();
  await expect(
    page.getByRole("heading", { name: "Source records side by side" }),
  ).toBeVisible();
  const sourceComparison = page
    .getByRole("heading", { name: "Source records side by side" })
    .locator("..");
  await expect(
    sourceComparison.getByRole("columnheader", { name: /PSI-25 · line/ }),
  ).toHaveCount(2);
  await expect(
    sourceComparison.getByRole("columnheader", {
      name: "Comparison",
      exact: true,
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

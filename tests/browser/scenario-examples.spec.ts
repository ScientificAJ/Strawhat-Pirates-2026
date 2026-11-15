import { expect, test } from "@playwright/test";

test("atmosphere and gravity examples retain the question and use source-record filtering", async ({
  page,
}) => {
  await page.goto("/app/lab/scenarios");
  const question = page.getByLabel("What outcome do you want to understand?");
  await question.fill("flame spread");
  await page
    .getByLabel("Starting conditions (optional)")
    .selectOption("exploration-atmosphere-example");
  await expect(question).toHaveValue("flame spread");
  await expect(
    page.getByText(/Selected example: 34% O₂ at 8.2 psia/),
  ).toBeVisible();
  await expect(
    page.getByLabel("Show records with at least 30% oxygen"),
  ).toBeChecked();
  await question.fill("");
  await expect(page.getByText(/NASA-FM2 · physical row/).first()).toBeVisible();
  await question.fill("flame spread");
  await page.getByLabel("Gravity context (optional)").selectOption("moon");
  await page.getByText("Environment", { exact: true }).click();
  await expect(
    page.getByLabel("Gravity magnitude", { exact: true }),
  ).toHaveValue("1.62");
  await page
    .getByText("Calculate oxygen partial pressure", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Calculate partial pressure" })
    .click();
  await expect(page.getByText("2.788", { exact: true })).toBeVisible();
  await page
    .getByLabel("Starting conditions (optional)")
    .selectOption("challenge-boundary-example");
  await expect(page.getByText(/42.9% higher than 21% air/)).toBeVisible();
  await page
    .getByRole("button", { name: "Calculate partial pressure" })
    .click();
  await expect(page.getByText("3.06", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save scenario" }).click();
  await expect(page.getByText(/Scenario revision saved/)).toBeVisible();
  await page.getByLabel("Gravity magnitude", { exact: true }).fill("2.5");
  await expect(page.getByLabel("Gravity context (optional)")).toHaveValue("");
  await page.getByLabel("Gravity context (optional)").selectOption("mars");
  await expect(
    page.getByLabel("Gravity magnitude", { exact: true }),
  ).toHaveValue("3.71");
  await page.getByRole("tab", { name: "Saved versions" }).click();
  await page
    .getByRole("button", { name: "Restore into draft" })
    .first()
    .click();
  await page.getByRole("tab", { name: "Question & evidence" }).click();
  await expect(page.getByLabel("Gravity context (optional)")).toHaveValue(
    "moon",
  );
  await expect(
    page.getByLabel("Show records with at least 30% oxygen"),
  ).toBeChecked();
  await page.getByLabel("Starting conditions (optional)").selectOption("");
  await expect(page.getByLabel("Starting conditions (optional)")).toHaveValue(
    "",
  );
  await expect(
    page.getByLabel("Show records with at least 30% oxygen"),
  ).not.toBeChecked();
  await page.getByText("Atmosphere", { exact: true }).click();
  await expect(
    page.getByLabel("Oxygen mole fraction", { exact: true }),
  ).toHaveValue("30");
  await page
    .getByLabel("Starting conditions (optional)")
    .selectOption("exploration-atmosphere-example");
  await page.getByLabel("Starting conditions (optional)").selectOption("lunar");
  await expect(
    page.getByLabel("Show records with at least 30% oxygen"),
  ).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

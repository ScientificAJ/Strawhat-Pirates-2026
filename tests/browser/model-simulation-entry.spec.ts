import { expect, test } from "@playwright/test";

test("the model workbench opens the FLEX droplet visualization", async ({
  page,
}) => {
  await page.goto("/app/lab/models");
  const launcher = page.getByRole("button", {
    name: "Open simulation",
    exact: true,
  });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(
    page.getByLabel("Initial droplet diameter D₀ (mm)"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Use source-reported FLEX-007 inputs" })
    .click();
  await expect(
    page.getByRole("region", { name: "FLEX-007 source conditions" }),
  ).toContainText("PSI-69 · FLEX-007");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("img", { name: /Illustrative three-dimensional chamber/ })
    .screenshot({ path: "/tmp/nova-model-simulation-scene.png" });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-model-simulation-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Close simulation", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Initial droplet diameter D₀ (mm)")).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Open simulation", exact: true }),
  ).toBeVisible();
});

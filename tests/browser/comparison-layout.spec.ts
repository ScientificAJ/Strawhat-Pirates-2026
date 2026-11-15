import { expect, test } from "@playwright/test";

test("mobile comparison remains readable and scrolls with a keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/compare");
  await page.getByRole("button", { name: "ACME gas flames" }).click();

  const region = page.getByRole("region", {
    name: "Research comparison table",
  });
  await expect(region).toBeVisible();
  await expect(region).toHaveAccessibleDescription(
    "Scroll horizontally to see all investigations.",
  );
  const rowLabel = region.getByRole("rowheader").first();
  const initialLeft = (await rowLabel.boundingBox())!.x;
  await region.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  expect(
    Math.abs((await rowLabel.boundingBox())!.x - initialLeft),
  ).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

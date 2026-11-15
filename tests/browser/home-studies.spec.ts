import { expect, test } from "@playwright/test";

test("fire-safety starting points open a populated comparison", async ({
  page,
}) => {
  await page.goto("/app");
  const prevention = page
    .locator("article")
    .filter({ hasText: "Prevention: How do materials" });
  await expect(
    prevention.getByRole("link", { name: "BASS-II", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/BASS-II research informs combustion models/),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/nova-home-studies-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-home-studies-mobile.png",
    fullPage: true,
  });
  await prevention.getByRole("link", { name: "Compare and rank" }).click();
  await expect(page).toHaveURL(
    /\/app\/compare\?ids=PSI-26%2CPSI-25|\/app\/compare\?ids=PSI-26,PSI-25/,
  );
  await expect(
    page.getByText("Change selected investigations (2/8)"),
  ).toBeVisible();
  await expect(
    page.getByText("Check experimental comparability and rank evidence"),
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";
import { mockFireSafetyRankings } from "./fire-safety-ranking-fixture";

test("fire-safety starting points open a populated comparison", async ({
  page,
  request,
}) => {
  await mockFireSafetyRankings(page, request);
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
  await prevention.getByRole("link", { name: "Compare the first two" }).click();
  await expect(page).toHaveURL(
    /\/app\/compare\?ids=PSI-25%2CPSI-26|\/app\/compare\?ids=PSI-25,PSI-26/,
  );
  await expect(
    page.getByText("Change selected investigations (2/8)"),
  ).toBeVisible();
  await expect(
    page.getByText("Check experimental comparability and rank evidence"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Automatic fire-safety ranking" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Research focus" }),
  ).toHaveValue("prevention");
  await expect(page.getByLabel("Rank 1").first()).toBeVisible();
});

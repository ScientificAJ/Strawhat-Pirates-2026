import { expect, test } from "@playwright/test";
import { mockFireSafetyRankings } from "./fire-safety-ranking-fixture";

test("ranked discovery explains its source and carries the selected focus into comparison", async ({
  page,
  request,
}) => {
  await mockFireSafetyRankings(page, request);
  await page.goto("/app/investigations?focus=detection");
  const ranked = page.getByRole("region", { name: "Ranked investigations" });
  await expect(
    ranked.getByRole("heading", { name: "Ranked detection research" }),
  ).toBeVisible();
  await expect(
    ranked.getByRole("link", { name: "SAME-R", exact: true }),
  ).toBeVisible();
  await ranked.getByText("Why this rank?").first().click();
  await ranked
    .getByRole("button", { name: "Inspect NASA source" })
    .first()
    .click();
  const inspector = page.getByRole("complementary", {
    name: "Exact source inspector",
  });
  await expect(inspector).toContainText("PSI-101");
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);

  await page.getByRole("button", { name: "Suppression", exact: true }).click();
  await expect(
    ranked.getByRole("heading", { name: "Ranked suppression research" }),
  ).toBeVisible();
  await expect(
    ranked.getByRole("link", { name: "FLEX", exact: true }),
  ).toBeVisible();
  await ranked.getByRole("link", { name: "Compare the first two" }).click();
  await expect(page).toHaveURL(
    /\/app\/compare\?ids=PSI-69(?:,|%2C)PSI-68&focus=suppression/,
  );
  const focus = page.getByRole("combobox", { name: "Research focus" });
  await expect(focus).toHaveValue("suppression");
  await expect(
    page.getByRole("heading", { name: "Automatic fire-safety ranking" }),
  ).toBeVisible();
  await expect(page.getByText("Source table retained").first()).toBeVisible();
  await focus.selectOption("detection");
  await expect(
    page.getByText("Not ranked for this focus: PSI-69, PSI-68."),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-ranking-comparison-mobile.png",
    fullPage: true,
  });
});

test("a failed ranking can be retried without leaving discovery", async ({
  page,
  request,
}) => {
  await mockFireSafetyRankings(page, request);
  let attempts = 0;
  let failRanking = true;
  await page.route("**/v1/discovery/fire-safety-ranking?*", (route) => {
    if (new URL(route.request().url()).searchParams.get("area") !== "detection")
      return route.fallback();
    attempts += 1;
    return failRanking
      ? route.fulfill({ status: 503, body: "Unavailable" })
      : route.fallback();
  });
  await page.goto("/app/investigations?focus=detection");
  const ranked = page.getByRole("region", { name: "Ranked investigations" });
  await expect(ranked.getByText("Rankings are unavailable.")).toBeVisible();
  failRanking = false;
  await ranked.getByRole("button", { name: "Try again" }).click();
  await expect(
    ranked.getByRole("link", { name: "SAME-R", exact: true }),
  ).toBeVisible();
  expect(attempts).toBeGreaterThan(1);
});

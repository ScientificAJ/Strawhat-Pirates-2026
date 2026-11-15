import { expect, test } from "@playwright/test";

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`retained Saffire results reach analysis and exact report text at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({
      colorScheme: viewport.width < 500 ? "dark" : "light",
      reducedMotion: "reduce",
    });
    await page.goto("/app/investigations/NASA-SAFFIRE-VI?section=runs");
    await expect(
      page.getByRole("heading", { name: "Saffire-VI", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Dataset", exact: true })
      .selectOption({
        label: "Calorimetry, temperature and gas results",
      });
    await expect(page).toHaveURL(/dataset=e4efb205/);
    await expect(page.getByText("3217", { exact: true })).toBeVisible();
    await page
      .getByRole("link", { name: "Analyze or export this dataset" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Explore source data", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Dataset", exact: true }),
    ).toHaveValue(
      "e4efb205948a5b2aabe591709adc8a77129af1730d9130ee737d275ae93d907a",
    );
    await page
      .getByRole("button", { name: "Apply selection", exact: true })
      .click();
    await expect(page.getByText("3217", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Export CSV", exact: true }).click();
    const downloadButton = page.getByRole("button", { name: /Download .*csv/ });
    await expect(downloadButton).toBeVisible({ timeout: 30000 });
    const downloaded = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream!) csv += chunk.toString();
    expect(csv).toContain("3217");
    expect(csv).toContain("3080");
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.goBack();
    await expect(
      page.getByRole("combobox", { name: "Dataset", exact: true }),
    ).toHaveValue(
      "e4efb205948a5b2aabe591709adc8a77129af1730d9130ee737d275ae93d907a",
    );
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(page.getByText(/Text search excludes pages 5/)).toBeVisible();
    await page
      .getByRole("button", { name: "Read retained page 1", exact: true })
      .click();
    const inspector = page.getByRole("complementary", {
      name: "Exact source inspector",
    });
    await expect(inspector).toContainText(
      "Preliminary Results from the Saffire VI Experiment",
    );
    await expect(
      inspector.getByRole("link", { name: "Publisher source" }),
    ).toHaveAttribute("href", /20240002981\/downloads\/.*#page=1$/);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Read retained page 1", exact: true }),
    ).toBeFocused();
  });
}

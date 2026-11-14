import { expect, test } from "@playwright/test";

async function noModelCalls(page: import("@playwright/test").Page) {
  await page.route("**/v1/research**", (route) => route.abort());
}

test("real source selection renders Vega and retains an incomplete linked dashboard", async ({
  page,
}) => {
  await noModelCalls(page);
  await page.goto("/app/lab/data");
  await page
    .getByRole("combobox", { name: "Value representation", exact: true })
    .selectOption("canonical");
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Copy selected source rows" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Charts", exact: true }).click();
  await page
    .getByLabel("Figure title", { exact: true })
    .fill("Saffire geometry inspection");
  await page
    .getByRole("button", { name: "Validate and draw", exact: true })
    .click();
  await expect(page.locator(".vega-embed svg")).toBeVisible();
  await expect(
    page.locator(".vega-embed svg .mark-symbol path"),
  ).not.toHaveCount(0);
  await page
    .getByRole("button", { name: "Inspect exact values", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "0.00027", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save analysis", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved to this browser" }),
  ).toBeVisible();
  await page.screenshot({
    path: "/tmp/nova-lab-source-chart-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Compose a dashboard", exact: true })
    .click();
  await page
    .getByLabel("Research question", { exact: true })
    .fill("Compare the retained Saffire geometry and missing calibration");
  await page
    .getByLabel("Authorized saved analysis / method")
    .selectOption({ label: "Saffire geometry inspection" })
    .catch(async () => {
      const select = page.getByRole("combobox").filter({
        has: page.locator("option", {
          hasText: "Saffire geometry inspection",
        }),
      });
      const value = await select
        .locator("option")
        .filter({ hasText: "Saffire geometry inspection" })
        .last()
        .getAttribute("value");
      await select.selectOption(value!);
    });
  await page
    .getByRole("button", { name: "Add selected component", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add selected component", exact: true })
    .click();
  const sources = page.getByLabel("Selection source");
  const targets = page.getByLabel("Affected target");
  const sourceId = await sources.locator("option").nth(1).getAttribute("value");
  const targetId = await targets.locator("option").nth(2).getAttribute("value");
  await sources.selectOption(sourceId!);
  await targets.selectOption(targetId!);
  await page.getByLabel("Source physical column index").fill("2");
  await page.getByLabel("Target physical column index").fill("2");
  await page
    .getByRole("button", { name: "Add linked-selection rule", exact: true })
    .click();
  await page.getByLabel("Component type").selectOption("unresolved_questions");
  await page.getByLabel("Authorized saved analysis / method").selectOption("");
  await page
    .getByRole("button", { name: "Add selected component", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Validate / refresh components", exact: true })
    .click();
  await expect(
    page
      .getByText(/No authorized source or completed calculation is attached/)
      .first(),
  ).toBeVisible();
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: "Inspect exact values", exact: true })
    .click();
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: "Select source row 2", exact: true })
    .click();
  await expect(
    page
      .locator("article")
      .nth(1)
      .getByText(/1 eligible response coordinates from 1 source records/)
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "composition and results saved" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Edit dashboard", exact: true })
    .click();
  const first = page.locator("article").first();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await first
    .getByRole("button", { name: "Increase width", exact: true })
    .click();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Undo last layout or component change" })
    .click();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Undo last layout or component change" }),
  ).toBeDisabled();
  await first.getByRole("button", { name: /^Move .* after$/ }).click();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  const staleResults = page.getByRole("status", {
    name: "Previous validated dashboard results",
  });
  await expect(staleResults).toHaveCount(0);
  await page
    .getByRole("button", { name: "Undo last layout or component change" })
    .click();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await page.getByLabel("Research question", { exact: true }).fill("");
  await expect(staleResults).toBeVisible();
  await expect(staleResults).toContainText("source snapshot");
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Validate / refresh components", exact: true })
    .click();
  const validationError = page
    .getByRole("alert")
    .filter({ hasText: "Local edits remain in this draft." });
  await expect(validationError).toBeVisible();
  await expect(staleResults).toBeVisible();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-lab-dashboard-stale-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Undo last layout or component change" })
    .click();
  await expect(page.locator(".vega-embed svg")).toHaveCount(2);
  await expect(staleResults).toHaveCount(0);
  await expect(validationError).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-lab-dashboard-mobile.png",
    fullPage: true,
  });
});

test("private chunks, real Python execution and local output recovery work without accounts", async ({
  page,
  request,
}) => {
  test.setTimeout(90000);
  await noModelCalls(page);
  let uploadId = "",
    sessionId = "",
    jobId = "";
  try {
    await page.goto("/app/lab/uploads");
    await page.getByLabel("Selected file").setInputFiles({
      name: "analytical-reference.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("time,value\n0,2\n1,4\n2,6\n"),
    });
    await page
      .getByLabel("License / usage terms", { exact: true })
      .fill(
        "CC0-1.0; synthetic analytical reference created for interface verification",
      );
    await page
      .getByLabel("Your processing rights", { exact: true })
      .fill("I created these analytical reference values.");
    await page.getByRole("checkbox", { name: /I confirm this file/ }).check();
    const prepared = page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/uploads") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Prepare and transfer", exact: true })
      .click();
    uploadId = (await (await prepared).json()).upload_id;
    await page
      .getByRole("button", { name: "Submit and validate file", exact: true })
      .click();
    await expect(
      page.getByRole("status").filter({ hasText: "Private input submitted" }),
    ).toBeVisible();
    expect((await request.get(`/v1/uploads/${uploadId}`)).status()).toBe(404);
    await page
      .getByRole("button", { name: "Use in execution", exact: true })
      .click();
    await page
      .getByRole("link", { name: "Python and shell", exact: true })
      .click();
    await page
      .getByRole("checkbox", { name: /analytical-reference.csv/ })
      .check();
    const opened = page.waitForResponse(
      (response) =>
        response.url().endsWith("/v1/execution/sessions") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Start selected session", exact: true })
      .click();
    sessionId = (await (await opened).json()).id;
    const code =
      "import csv\nfrom pathlib import Path\nfile=next(Path('/inputs').glob('*.csv'))\nrows=list(csv.DictReader(file.open()))\nprint(sum(float(row['value']) for row in rows))\nPath('/outputs/summary.csv').write_text('sum\\n12\\n')\n";
    await page.getByRole("textbox", { name: "Code", exact: true }).fill(code);
    const queued = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/sessions/${sessionId}/commands`) &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Run selected code", exact: true })
      .click();
    jobId = (await (await queued).json()).id;
    await expect(
      page.getByRole("heading", { name: "Job succeeded", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    await expect(page.getByLabel("Streamed execution output")).toContainText(
      "12.0",
    );
    const download = page.getByRole("button", {
      name: "summary.csv",
      exact: true,
    });
    await download
      .locator("..")
      .getByRole("button", { name: "Keep file on this browser", exact: true })
      .click();
    await expect(
      page.getByRole("button", {
        name: "summary.csv · download local copy",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save notebook", exact: true })
      .click();
    await page
      .getByRole("button", { name: "End session", exact: true })
      .click();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(
            `/v1/execution/sessions/${sessionId}`,
          );
          return (await response.json()).terminated_at;
        },
        { timeout: 15000 },
      )
      .not.toBeNull();
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Code", exact: true }),
    ).toHaveValue(code);
    await expect(
      page.getByRole("button", {
        name: "summary.csv · download local copy",
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/nova-lab-execution-recovered.png",
      fullPage: true,
    });
  } finally {
    if (sessionId)
      await page.request.delete(`/v1/execution/sessions/${sessionId}`);
    if (uploadId) await page.request.delete(`/v1/uploads/${uploadId}`);
    if (jobId) await page.request.delete(`/v1/workflows/${jobId}`);
  }
});

test("a declared analytical trace produces a real source-qualified fit and residual figure", async ({
  page,
}) => {
  test.setTimeout(90000);
  await noModelCalls(page);
  await page.goto("/app/lab/models");
  const form = page.locator("form");
  for (let index = 0; index < 4; index++) {
    await form.getByRole("button", { name: /Add points.*entry/ }).click();
    const point = form
      .getByRole("group", { name: `Entry ${index + 1}`, exact: true })
      .first();
    await point
      .getByLabel("source locator *", { exact: true })
      .fill(`analytical:frame:${index}`);
    await point.getByLabel("time *", { exact: true }).fill(String(index));
    await point
      .getByLabel("value *", { exact: true })
      .fill(String(5 + 2 * index));
  }
  await form.getByLabel("length unit *", { exact: true }).selectOption("mm");
  await form.getByLabel("interval start *", { exact: true }).fill("0");
  await form.getByLabel("interval end *", { exact: true }).fill("3");
  await form
    .getByLabel("interval justification *", { exact: true })
    .fill("Analytical reference window with no ignition transient");
  await form
    .getByLabel("observable *", { exact: true })
    .fill("Analytical luminous leading edge");
  for (const [name, value] of Object.entries({
    "spatial calibration reference": "Analytical spatial reference",
    "time calibration reference": "Analytical clock reference",
    "time origin": "Relative analytical time zero",
    direction: "Positive specimen axis",
    "viewing geometry": "Orthographic analytical reference",
    "ignition transient treatment":
      "No ignition transient in analytical reference",
  })) {
    await form
      .getByRole("button", { name: `Add ${name} (optional)`, exact: true })
      .click();
    await form.getByLabel(name, { exact: true }).fill(value);
  }
  const context = form.getByRole("group", { name: "context *", exact: true });
  await context
    .getByLabel("input origin *", { exact: true })
    .selectOption("synthetic_reference");
  await page
    .getByRole("button", { name: "Run selected method", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Job succeeded", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".scientific-result strong")).toHaveText("0.002");
  await page.getByRole("button", { name: "fit view", exact: true }).click();
  await expect(page.locator(".vega-embed svg")).toBeVisible();
  await page
    .getByRole("button", { name: "residual view", exact: true })
    .click();
  await expect(page.locator(".vega-embed svg")).toBeVisible();
  await page.screenshot({
    path: "/tmp/nova-lab-known-fit-residual.png",
    fullPage: true,
  });
});

import { expect, test } from "@playwright/test";

test("BASS-II fire is generated inline and links to its source row", async ({
  page,
  request,
}) => {
  const response = await request.get("/v1/investigations/PSI-25");
  expect(response.ok()).toBeTruthy();
  const investigation = await response.json();
  const asset = investigation.assets.find(
    (item: { kind: string }) => item.kind === "experimental_table",
  );
  const snapshot = investigation.snapshot_id;
  const job = "30000000-0000-4000-8000-000000000001";
  const content = {
    artifact_type: "bass_fire_illustration",
    title: "BASS-II fire illustration",
    snapshot_id: snapshot,
    accession: "PSI-25",
    asset_id: asset.id,
    asset_sha256: asset.sha256,
    source_row: 2,
    conditions: [
      {
        label: "Fuel Sample Material",
        value: "100 micron PMMA film   2 cm wide",
      },
      { label: "Calibrated initial O2 % by vol", value: "22.2" },
    ],
  };
  await page.route("**/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const send = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path === "/v1/capabilities/models")
      return send({ configured: true, reasoning_models: ["gpt-6.1-sol"] });
    if (path === "/v1/usage/models")
      return send({
        request_limit_usd: 0.1,
        daily_limit_usd: 5,
        committed_or_reserved_usd: "0",
      });
    if (path === "/v1/research" && route.request().method() === "POST")
      return send({ id: job, status: "queued" }, 202);
    if (path === `/v1/workflows/${job}/events`)
      return route.fulfill({
        contentType: "text/event-stream",
        body: ": offline fixture\n\n",
      });
    if (path === `/v1/workflows/${job}`)
      return send({
        id: job,
        kind: "research",
        status: "succeeded",
        snapshot_id: snapshot,
        result: {
          status: "completed",
          model: "offline",
          cost_usd: "0",
          facts: [
            {
              id: "bass-fire",
              label: content.title,
              origin: "source_record",
              sources: [],
              limitations: [],
              content,
            },
          ],
          actions: [],
          answer: {
            title: "BASS-II fire",
            claims: [
              {
                statement: "Here is the BASS-II fire illustration.",
                origin: "interpretation",
                fact_ids: ["bass-fire"],
                limitations: [],
              },
            ],
            contradictions: [],
            next_actions: [],
            limitations: [],
            withheld_claims: [],
          },
        },
      });
    if (path.startsWith("/v1/voice/") && route.request().method() === "POST")
      return route.abort("blockedbyclient");
    return route.continue();
  });
  await page.goto("/app/agent");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Create a BASS-II fire visualization");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const view = page.getByRole("region", { name: "BASS-II fire illustration" });
  const canvas = view.getByRole("img", {
    name: "Generated illustration of a flame over a solid fuel sample",
  });
  await expect(canvas).toBeVisible();
  await expect(view).toContainText("100 micron PMMA film");
  await expect(
    view.getByRole("link", { name: "Inspect the source record" }),
  ).toHaveAttribute("href", /\/app\/runs\//);
  await expect(view.getByRole("button", { name: "Pause flame" })).toBeVisible();
  const firstFrame = await canvas.screenshot();
  await page.waitForTimeout(500);
  const laterFrame = await canvas.screenshot();
  expect(laterFrame.equals(firstFrame)).toBe(false);
  await view.getByRole("button", { name: "Pause flame" }).click();
  await expect(view.getByRole("button", { name: "Play flame" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(
    view.getByRole("button", { name: "Motion reduced" }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(canvas).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await canvas.evaluate((element: HTMLCanvasElement) => {
    element
      .getContext("webgl2")
      ?.getExtension("WEBGL_lose_context")
      ?.loseContext();
  });
  await expect(view.getByRole("status")).toContainText(
    "The flame view is unavailable",
  );
  await view.getByRole("link", { name: "Inspect the source record" }).click();
  await expect(page).toHaveURL(/\/app\/runs\//);
  await expect(
    page.getByText("100 micron PMMA film", { exact: false }).first(),
  ).toBeVisible();
});

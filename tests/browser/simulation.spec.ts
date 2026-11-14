import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { DropletVisualization } from "../../apps/web/lib/simulation";

const sceneName = /^Illustrative three-dimensional chamber/;
type SceneProbe = {
  frames: number;
  contextRequests: number;
  context: WebGL2RenderingContext | null;
};
declare global {
  interface Window {
    sceneProbe: SceneProbe;
  }
}

async function observeScene(page: Page) {
  await page.addInitScript(() => {
    const probe: SceneProbe = { frames: 0, contextRequests: 0, context: null };
    window.sceneProbe = probe;
    const isScene = (canvas: HTMLCanvasElement) =>
      canvas
        .getAttribute("aria-label")
        ?.startsWith("Illustrative three-dimensional chamber");
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind,
      ...options
    ) {
      const result = Reflect.apply(getContext, this, [kind, ...options]);
      if (kind === "webgl2" && isScene(this)) {
        probe.contextRequests++;
        probe.context = result as WebGL2RenderingContext | null;
      }
      return result;
    } as typeof getContext;
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (mask) {
      if (this.canvas instanceof HTMLCanvasElement && isScene(this.canvas))
        probe.frames++;
      return clear.call(this, mask);
    };
  });
}

async function sceneState(page: Page) {
  return page.evaluate(() => {
    const probe = window.sceneProbe;
    return {
      frames: probe.frames,
      contextRequests: probe.contextRequests,
      contextLost: probe.context?.isContextLost() ?? false,
      time: performance.now(),
    };
  });
}

async function preventProviderCalls(page: Page) {
  const blocked: string[] = [];
  for (const pattern of ["**/v1/research**", "**/v1/voice/**"])
    await page.route(pattern, (route) => {
      blocked.push(new URL(route.request().url()).pathname);
      return route.abort("blockedbyclient");
    });
  return blocked;
}

function simulation(page: Page) {
  return page
    .getByRole("region")
    .filter({
      has: page.getByLabel("Initial droplet diameter D₀ (mm)", { exact: true }),
    })
    .last();
}

function modelValue(panel: Locator, label: string) {
  return panel
    .locator("dl > div")
    .filter({
      has: panel
        .page()
        .locator("dt")
        .filter({ hasText: new RegExp(`^${label}$`) }),
    })
    .locator("dd")
    .first();
}

async function openDossierSimulation(page: Page) {
  await page.goto("/app/investigations/PSI-69");
  await page
    .getByRole("tab", { name: "Methods and hardware", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open simulation", exact: true })
    .click();
  await expect(
    page.getByLabel("Initial droplet diameter D₀ (mm)", { exact: true }),
  ).toBeVisible();
  return simulation(page);
}

async function prepareTeachingExample(page: Page, panel: Locator) {
  await panel
    .getByRole("button", { name: "Use teaching example", exact: true })
    .click();
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/visualizations/droplet" &&
      response.request().method() === "POST",
  );
  await panel
    .getByRole("button", { name: "Calculate visualization", exact: true })
    .click();
  const returned = await response;
  expect(returned.ok()).toBe(true);
  return (await returned.json()) as DropletVisualization;
}

async function expectStaticScene(page: Page) {
  await expect
    .poll(async () => (await sceneState(page)).frames)
    .toBeGreaterThan(0);
  // Allow the pending observer/input frame to settle, then sample an idle interval.
  await page.waitForTimeout(150);
  const before = await sceneState(page);
  await page.waitForTimeout(350);
  expect((await sceneState(page)).frames).toBe(before.frames);
}

test("dossier simulation is opt-in, computes known states, preserves stale results and exports exact provenance", async ({
  page,
}, testInfo) => {
  const blocked = await preventProviderCalls(page);
  await observeScene(page);
  const calculations: string[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.startsWith("/v1/visualizations/")
    )
      calculations.push(request.url());
  });
  await page.goto("/app/investigations/PSI-69");
  await page
    .getByRole("tab", { name: "Methods and hardware", exact: true })
    .click();
  const opener = page.getByRole("button", {
    name: "Open simulation",
    exact: true,
  });
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  expect((await sceneState(page)).contextRequests).toBe(0);
  expect(calculations).toEqual([]);
  await opener.click();
  const panel = simulation(page);
  await expect(
    panel.getByRole("button", { name: "Calculate visualization", exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole("button", { name: "Use teaching example", exact: true })
    .click();
  expect(calculations).toEqual([]);
  expect((await sceneState(page)).contextRequests).toBe(0);
  const result = await prepareTeachingExample(page, panel);
  expect(calculations).toHaveLength(1);
  expect(result.parameter_origin).toBe("analyst_assumptions");
  expect(result.idealized_endpoint_s).toBe(8);
  await expect(modelValue(panel, "Droplet diameter D")).toHaveText("2 mm");
  const timeline = panel.getByRole("slider", {
    name: "Model time",
    exact: true,
  });
  await timeline.focus();
  await timeline.press("Home");
  for (let step = 0; step < 5; step++) await timeline.press("PageUp");
  await expect(timeline).toHaveValue("120");
  await expect(timeline).toHaveAttribute(
    "aria-valuetext",
    "4 seconds of model time",
  );
  await expect(modelValue(panel, "Model time")).toHaveText("4 s");
  await expect(modelValue(panel, "Diameter squared D²")).toHaveText("2 mm²");
  expect(result.points[120].diameter_mm).toBeCloseTo(Math.SQRT2, 12);
  await timeline.press("End");
  await expect(timeline).toHaveAttribute(
    "aria-valuetext",
    "8 seconds of model time",
  );
  await expect(modelValue(panel, "Model time")).toHaveText("8 s");
  await expect(modelValue(panel, "Droplet diameter D")).toHaveText("0 mm");
  await expect(modelValue(panel, "Remaining mass / initial mass")).toHaveText(
    "0",
  );

  await panel
    .getByLabel("Initial droplet diameter D₀ (mm)", { exact: true })
    .fill("3");
  await expect(
    panel.getByRole("status").filter({ hasText: "Inputs changed" }),
  ).toBeVisible();
  await expect(modelValue(panel, "Model time")).toHaveText("8 s");
  await expect(
    panel.getByRole("button", { name: "Play visualization", exact: true }),
  ).toBeDisabled();
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Export exact model record", exact: true })
    .click();
  const destination = testInfo.outputPath("stale-model-record.json");
  await (await download).saveAs(destination);
  expect(JSON.parse(await readFile(destination, "utf8"))).toEqual(result);
  const recalculation = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/visualizations/droplet",
  );
  await panel
    .getByRole("button", { name: "Calculate visualization", exact: true })
    .click();
  expect((await (await recalculation).json()).idealized_endpoint_s).toBe(18);
  await expect(modelValue(panel, "Droplet diameter D")).toHaveText("3 mm");
  await expect(
    panel.getByRole("status").filter({ hasText: "Inputs changed" }),
  ).toHaveCount(0);
  expect(blocked).toEqual([]);
});

test("FLEX-007 source inputs retain exact units, text anchors and visibility qualifications", async ({
  page,
}, testInfo) => {
  const blocked = await preventProviderCalls(page);
  const panel = await openDossierSimulation(page);
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/visualizations/flex-007",
  );
  await panel
    .getByRole("button", {
      name: "Use source-reported FLEX-007 inputs",
      exact: true,
    })
    .click();
  const returned = await response;
  expect(returned.ok()).toBe(true);
  const source = await returned.json();
  expect(source.parameter_origin).toBe("source_reported_nominal");
  expect(source.parameter_sources.initial_diameter).toMatchObject({
    value: 1.82,
    unit: "mm",
    anchor: {
      source_row: 18,
      line_end: 18,
      kind: "text_lines",
      accession: "PSI-69",
    },
  });
  expect(source.parameter_sources.burning_constant).toMatchObject({
    value: 0.68,
    unit: "mm^2/s",
    anchor: {
      source_row: 19,
      line_end: 19,
      kind: "text_lines",
      accession: "PSI-69",
    },
  });
  for (const parameter of Object.values(source.parameter_sources) as {
    anchor: { snapshot_id: string; source_sha256: string; asset_id: string };
    source_text: string;
  }[]) {
    expect(parameter.anchor.snapshot_id).toBe(source.context.source_snapshot);
    expect(parameter.anchor.source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parameter.anchor.asset_id).toContain("FLEX-007_TestSheet.txt");
    expect(parameter.source_text).toMatch(/(?:D0|kavg)/);
  }
  await expect(
    panel.getByLabel("Initial droplet diameter D₀ (mm)", { exact: true }),
  ).toHaveValue("1.82");
  await expect(
    panel.getByLabel("Burning constant K (mm²/s)", { exact: true }),
  ).toHaveValue("0.68");
  const preservedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/visualizations/flex-007",
  );
  await panel
    .getByRole("button", { name: "Calculate visualization", exact: true })
    .click();
  const preserved = await preservedResponse;
  expect(preserved.ok()).toBe(true);
  expect(await preserved.json()).toEqual(source);
  await panel
    .getByText("Equations, derivation and parameter provenance", {
      exact: true,
    })
    .click();
  await expect(
    panel.getByRole("heading", {
      name: "Source-reported inputs and conditions",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "The test sheet reports luminous-flame obscuration during much of the run and its end.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByText(
      "FLEX-007 ended in disruption; it is not an observed complete chemical extinction.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole("link", {
      name: "FLEX-007 source test sheet",
      exact: true,
    }),
  ).toHaveAttribute(
    "href",
    source.references.find((reference: string) =>
      reference.includes("FLEX-007_TestSheet"),
    ),
  );
  await expect(
    panel.getByRole("link", {
      name: "NASA Technical Memorandum 4069: classical droplet combustion",
      exact: true,
    }),
  ).toHaveAttribute("href", "https://ntrs.nasa.gov/citations/19890010934");
  const download = page.waitForEvent("download");
  await panel
    .getByRole("button", { name: "Export exact model record", exact: true })
    .click();
  const destination = testInfo.outputPath("source-parameterized-model.json");
  await (await download).saveAs(destination);
  expect(JSON.parse(await readFile(destination, "utf8"))).toEqual(source);
  await page.goto("/app/investigations/PSI-25");
  await expect(
    page.getByRole("heading", { name: "BASS-II", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open simulation", exact: true }),
  ).toHaveCount(0);
  expect(blocked).toEqual([]);
});

test("pending preparation preserves the submitted inputs until the actual calculation returns", async ({
  page,
}) => {
  const blocked = await preventProviderCalls(page);
  const panel = await openDossierSimulation(page);
  await panel
    .getByRole("button", { name: "Use teaching example", exact: true })
    .click();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/v1/visualizations/droplet",
    async (route) => {
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/visualizations/droplet",
  );
  const diameter = panel.getByLabel("Initial droplet diameter D₀ (mm)", {
    exact: true,
  });
  const coefficient = panel.getByLabel("Burning constant K (mm²/s)", {
    exact: true,
  });
  await panel
    .getByRole("button", { name: "Calculate visualization", exact: true })
    .click();
  try {
    await expect(diameter).not.toBeEditable();
    await expect(coefficient).not.toBeEditable();
    await diameter.focus();
    await page.keyboard.press("End");
    await page.keyboard.type("9");
    await expect(diameter).toHaveValue("2");
    await expect(coefficient).toHaveValue("0.5");
  } finally {
    release();
  }
  const returned = await response;
  expect(returned.ok()).toBe(true);
  const result = await returned.json();
  expect(result.request).toMatchObject({
    initial_diameter_mm: 2,
    burning_constant_mm2_s: 0.5,
  });
  await expect(diameter).toBeEditable();
  await expect(coefficient).toBeEditable();
  await expect(modelValue(panel, "Droplet diameter D")).toHaveText("2 mm");
  expect(blocked).toEqual([]);
});

test("3D drawing is bounded during Play and stops while paused, offscreen or closed", async ({
  page,
}) => {
  const blocked = await preventProviderCalls(page);
  await observeScene(page);
  const panel = await openDossierSimulation(page);
  await prepareTeachingExample(page, panel);
  const canvas = panel.getByRole("img", { name: sceneName });
  await canvas.scrollIntoViewIfNeeded();
  await expectStaticScene(page);
  const size = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  expect(size.width).toBeLessThanOrEqual(640);
  expect(size.height).toBeLessThanOrEqual(400);
  const start = await sceneState(page);
  await panel
    .getByRole("button", { name: "Play visualization", exact: true })
    .click();
  await page.waitForTimeout(1000);
  const playing = await sceneState(page);
  expect(playing.frames).toBeGreaterThan(start.frames);
  expect(playing.frames - start.frames).toBeLessThanOrEqual(
    Math.ceil((playing.time - start.time) / 50) + 2,
  );
  await panel
    .getByRole("button", { name: "Pause visualization", exact: true })
    .click();
  await expectStaticScene(page);
  await panel
    .getByRole("button", { name: "Play visualization", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(
    panel.getByRole("button", { name: "Play visualization", exact: true }),
  ).toBeAttached();
  await expectStaticScene(page);
  await panel
    .getByRole("button", { name: "Close droplet visualization", exact: true })
    .click();
  await expect
    .poll(async () => (await sceneState(page)).contextLost)
    .toBe(true);
  await expect(page.getByRole("img", { name: sceneName })).toHaveCount(0);
  await expectStaticScene(page);
  await page
    .getByRole("button", { name: "Open simulation", exact: true })
    .click();
  const reopened = simulation(page);
  await prepareTeachingExample(page, reopened);
  await expect(
    reopened.getByRole("button", { name: "Play visualization", exact: true }),
  ).toBeVisible();
  await reopened.getByRole("img", { name: sceneName }).scrollIntoViewIfNeeded();
  await expectStaticScene(page);
  expect((await sceneState(page)).contextLost).toBe(false);
  expect(blocked).toEqual([]);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`narrow ${colorScheme} simulation supports keyboard, reduced motion and graphics failure recovery`, async ({
    page,
  }) => {
    const blocked = await preventProviderCalls(page);
    await observeScene(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const panel = await openDossierSimulation(page);
    await prepareTeachingExample(page, panel);
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-theme",
      colorScheme,
    );
    const canvas = panel.getByRole("img", { name: sceneName });
    await canvas.scrollIntoViewIfNeeded();
    await expectStaticScene(page);
    await expect(
      panel.getByRole("button", { name: "Play visualization", exact: true }),
    ).toBeDisabled();
    await expect(
      panel.getByText("Reduced motion is enabled.", { exact: false }),
    ).toBeVisible();
    const top = panel.getByRole("button", { name: "Top view", exact: true });
    await top.focus();
    const beforeCamera = await sceneState(page);
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => (await sceneState(page)).frames)
      .toBeGreaterThan(beforeCamera.frames);
    const timeline = panel.getByRole("slider", {
      name: "Model time",
      exact: true,
    });
    await timeline.focus();
    await page.keyboard.press("End");
    await expect(modelValue(panel, "Droplet diameter D")).toHaveText("0 mm");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      const context = window.sceneProbe.context;
      const loss = context?.getExtension("WEBGL_lose_context");
      if (!loss)
        throw new Error("The test browser does not support WebGL context loss");
      loss.loseContext();
    });
    await expect(
      panel
        .getByRole("status")
        .filter({ hasText: "The 3D view is unavailable" }),
    ).toBeVisible();
    await expect(modelValue(panel, "Droplet diameter D")).toHaveText("0 mm");
    await expect(
      panel.getByRole("button", {
        name: "Export exact model record",
        exact: true,
      }),
    ).toBeEnabled();
    expect(blocked).toEqual([]);
  });
}

test("an offline Studio exchange opens a real calculated source artifact inline and reloads it closed", async ({
  page,
  request,
}) => {
  await observeScene(page);
  const snapshotResponse = await request.get("/v1/snapshots/current");
  expect(snapshotResponse.ok()).toBe(true);
  const { snapshot_id: snapshot } = await snapshotResponse.json();
  const modelResponse = await request.post("/v1/visualizations/flex-007", {
    data: { snapshot_id: snapshot, sample_count: 241 },
  });
  expect(modelResponse.ok()).toBe(true);
  const model = await modelResponse.json();
  const teachingResponse = await request.post("/v1/visualizations/droplet", {
    data: {
      initial_diameter_mm: 2,
      burning_constant_mm2_s: 0.5,
      sample_count: 241,
      context: {
        input_origin: "synthetic_reference",
        source_snapshot: snapshot,
        sources: [
          {
            source_id: "interface-regression-teaching-reference",
            locator:
              "Explicit 2 mm and 0.5 mm²/s teaching assumptions, not experimental measurements",
          },
        ],
        assumptions: [
          "Known-answer teaching reference for browser state isolation",
        ],
      },
    },
  });
  expect(teachingResponse.ok()).toBe(true);
  const teaching = await teachingResponse.json();
  const job = "20000000-0000-4000-8000-000000000001";
  const fact = "offline-transport-real-calculated-droplet";
  const teachingFact = "offline-transport-real-teaching-droplet";
  const sourceTitle =
    "Actual registered source-parameterized droplet calculation";
  const teachingTitle =
    "Actual registered teaching-reference droplet calculation";
  let interceptedResearch = 0;
  const unexpectedPosts: string[] = [];
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const send = (value: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (pathname === "/v1/capabilities/models")
      return send({
        configured: true,
        reasoning_models: ["gpt-6.1-sol", "gpt-6.1-terra"],
      });
    if (pathname === "/v1/usage/models")
      return send({
        request_limit_usd: 0.1,
        daily_limit_usd: 5,
        committed_or_reserved_usd: "0",
      });
    if (pathname === "/v1/research" && request.method() === "POST") {
      interceptedResearch++;
      return send({ id: job, status: "queued" }, 202);
    }
    if (pathname === `/v1/workflows/${job}/events`)
      return route.fulfill({
        contentType: "text/event-stream",
        body: ": Offline interface transport; no provider request.\n\n",
      });
    if (pathname === `/v1/workflows/${job}`)
      return send({
        id: job,
        kind: "research",
        status: "succeeded",
        snapshot_id: snapshot,
        result: {
          status: "completed",
          model: "offline-interface-transport",
          cost_usd: "0",
          facts: [
            {
              id: fact,
              label: sourceTitle,
              origin: "deterministic_calculation",
              sources: [],
              limitations: [
                "Offline interface transport; the artifact was calculated by the real registered API.",
              ],
              content: model,
            },
            {
              id: teachingFact,
              label: teachingTitle,
              origin: "deterministic_calculation",
              sources: [],
              limitations: [
                "Offline interface transport; the teaching artifact was calculated by the real registered API.",
              ],
              content: teaching,
            },
          ],
          actions: [],
          answer: {
            title: "Source-parameterized droplet model prepared",
            claims: [
              {
                statement:
                  "The source-parameterized model is ready for inspection.",
                origin: "calculated",
                fact_ids: [fact],
                limitations: [
                  "The flame envelope is illustrative; the constant-K trajectory does not predict actual extinction.",
                ],
              },
            ],
            contradictions: [],
            next_actions: [
              "Would you like to compare this source model with your own assumptions?",
            ],
            limitations: [
              "Offline research transport fixture; no provider inference was made.",
            ],
            withheld_claims: [],
          },
        },
      });
    if (request.method() === "POST") {
      unexpectedPosts.push(pathname);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  await page.goto("/app/agent");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill(
      "Prepare an optional source-parameterized FLEX-007 model for inspection.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const exchange = page.getByRole("article", {
    name: "Research exchange",
    exact: true,
  });
  const card = exchange
    .getByRole("region", {
      name: "Prepared droplet simulation",
      exact: true,
    })
    .first();
  await expect(
    exchange.getByRole("region", { name: "Next research steps" }),
  ).toContainText(
    "Would you like to compare this source model with your own assumptions?",
  );
  await expect(
    exchange.getByRole("region", { name: "Next research steps" }),
  ).toBeVisible();
  const opener = card.getByRole("button", {
    name: "Open prepared simulation",
    exact: true,
  });
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  expect((await sceneState(page)).contextRequests).toBe(0);
  await opener.click();
  await expect(exchange.getByRole("img", { name: sceneName })).toBeVisible();
  await expect(modelValue(simulation(page), "Droplet diameter D")).toHaveText(
    "1.82 mm",
  );
  await expect(page).toHaveURL(/\/app\/agent$/);
  await card
    .getByRole("button", { name: "Close prepared simulation", exact: true })
    .click();
  const artifactCanvas = page.getByRole("region", {
    name: "Research artifact canvas",
    exact: true,
  });
  const artifactSelector = artifactCanvas.getByRole("combobox", {
    name: "Artifact",
    exact: true,
  });
  await artifactSelector.selectOption({ label: sourceTitle });
  await expect(
    artifactCanvas.getByRole("button", {
      name: "Open prepared simulation",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await artifactCanvas
    .getByRole("button", { name: "Open prepared simulation", exact: true })
    .click();
  const sourcePanel = artifactCanvas
    .getByRole("region")
    .filter({
      has: page.getByLabel("Initial droplet diameter D₀ (mm)", { exact: true }),
    })
    .last();
  await expect(modelValue(sourcePanel, "Droplet diameter D")).toHaveText(
    "1.82 mm",
  );
  await sourcePanel
    .getByRole("slider", { name: "Model time", exact: true })
    .press("End");
  await expect(modelValue(sourcePanel, "Droplet diameter D")).toHaveText(
    "0 mm",
  );
  await artifactSelector.selectOption({ label: teachingTitle });
  await expect(
    artifactCanvas.getByRole("button", {
      name: "Open prepared simulation",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    artifactCanvas.getByRole("img", { name: sceneName }),
  ).toHaveCount(0);
  await artifactCanvas
    .getByRole("button", { name: "Open prepared simulation", exact: true })
    .click();
  const teachingPanel = artifactCanvas
    .getByRole("region")
    .filter({
      has: page.getByLabel("Initial droplet diameter D₀ (mm)", { exact: true }),
    })
    .last();
  await expect(modelValue(teachingPanel, "Droplet diameter D")).toHaveText(
    "2 mm",
  );
  await expect(
    teachingPanel.getByRole("slider", { name: "Model time", exact: true }),
  ).toHaveValue("0");
  await expect(
    teachingPanel.getByLabel("Burning constant K (mm²/s)", { exact: true }),
  ).toHaveValue("0.5");
  await artifactSelector.selectOption({ label: sourceTitle });
  await expect(
    artifactCanvas.getByRole("button", {
      name: "Open prepared simulation",
      exact: true,
    }),
  ).toHaveAttribute("aria-expanded", "false");
  await artifactCanvas
    .getByRole("button", { name: "Open prepared simulation", exact: true })
    .click();
  await expect(modelValue(sourcePanel, "Droplet diameter D")).toHaveText(
    "1.82 mm",
  );
  await expect(
    sourcePanel.getByRole("slider", { name: "Model time", exact: true }),
  ).toHaveValue("0");
  await expect
    .poll(() =>
      page.evaluate(
        async (factId) =>
          new Promise<number>((resolve, reject) => {
            const opening = indexedDB.open("nova-ember-workspace", 2);
            opening.onerror = () => reject(new Error("Storage unavailable"));
            opening.onsuccess = () => {
              const db = opening.result;
              const transaction = db.transaction("documents", "readonly");
              const documents = transaction.objectStore("documents").getAll();
              transaction.oncomplete = () => {
                db.close();
                resolve(
                  documents.result.filter(
                    (item: { kind: string; data: unknown }) =>
                      item.kind === "studio_session" &&
                      JSON.stringify(item.data).includes(factId),
                  ).length,
                );
              };
              transaction.onerror = transaction.onabort = () => {
                db.close();
                reject(new Error("Saved Studio session could not be read"));
              };
            };
          }),
        fact,
      ),
    )
    .toBe(1);
  await page.reload();
  await expect(
    exchange
      .getByRole("button", {
        name: "Open prepared simulation",
        exact: true,
      })
      .first(),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(
    exchange.getByRole("button", {
      name: "Open prepared simulation",
      exact: true,
    }),
  ).toHaveCount(2);
  expect((await sceneState(page)).contextRequests).toBe(0);
  expect(interceptedResearch).toBe(1);
  expect(unexpectedPosts).toEqual([]);
});

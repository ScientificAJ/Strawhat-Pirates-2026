import { expect, test, type Page } from "@playwright/test";

async function trackEmberFrames(page: Page) {
  await page.addInitScript(() => {
    const draw = WebGL2RenderingContext.prototype.drawArrays;
    WebGL2RenderingContext.prototype.drawArrays = function (...args) {
      if (
        this.canvas instanceof HTMLCanvasElement &&
        this.canvas.closest(".wordmark")
      ) {
        const root = document.documentElement;
        root.dataset.emberDraws = String(
          Number(root.dataset.emberDraws ?? 0) + 1,
        );
      }
      return draw.apply(this, args);
    };
  });
}

async function frameCount(page: Page) {
  return page.evaluate(() =>
    Number(document.documentElement.dataset.emberDraws ?? 0),
  );
}

async function expectFramesStopped(page: Page) {
  // Allow a queued visibility/media callback to settle, then check a full
  // interval longer than the renderer's frame period.
  await page.waitForTimeout(100);
  const stopped = await frameCount(page);
  await page.waitForTimeout(200);
  expect(await frameCount(page)).toBe(stopped);
}

test("wordmark flame rests idle, bounds activation, and stops for interruption or reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await trackEmberFrames(page);
  await page.goto("/app");
  const wordmark = page.getByRole("link", { name: "Nova Ember", exact: true });
  await expect.poll(() => frameCount(page)).toBe(1);
  await expectFramesStopped(page);

  await wordmark.hover();
  await expect.poll(() => frameCount(page)).toBeGreaterThan(1);
  await page.waitForTimeout(1500);
  // One static frame plus at most 29 draws in the 1.4 second activation.
  expect(await frameCount(page)).toBeLessThanOrEqual(30);
  await expectFramesStopped(page);

  await page.mouse.move(800, 100);
  const previous = await frameCount(page);
  await wordmark.focus();
  await expect.poll(() => frameCount(page)).toBeGreaterThan(previous);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expectFramesStopped(page);
  const reduced = await frameCount(page);
  await page.mouse.move(800, 100);
  await wordmark.hover();
  await expectFramesStopped(page);
  expect(await frameCount(page)).toBe(reduced);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(() => frameCount(page)).toBeGreaterThan(reduced);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#mobile-navigation")).toBeHidden();
  await expectFramesStopped(page);
});

test("workspace reduced motion prevents flame animation and context loss keeps navigation usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await trackEmberFrames(page);
  await page.goto("/app/settings");
  await page.getByLabel("Reduce motion", { exact: true }).check();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-reduce-motion",
    "true",
  );
  const wordmark = page.getByRole("link", { name: "Nova Ember", exact: true });
  await wordmark.focus();
  await wordmark.hover();
  await expectFramesStopped(page);

  const canvas = wordmark.locator("canvas");
  await canvas.evaluate((element) =>
    element.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(canvas).toHaveCSS("opacity", "0");
  await expectFramesStopped(page);
  await wordmark.click();
  await expect(
    page.getByRole("heading", { name: "Research overview", exact: true }),
  ).toBeVisible();
});

test("unavailable WebGL leaves a static wordmark with a readable accessible name", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === "webgl2") return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto("/app");
  const wordmark = page.getByRole("link", { name: "Nova Ember", exact: true });
  await expect(wordmark).toBeVisible();
  await expect(wordmark.locator("canvas")).toHaveCSS("opacity", "0");
  await expect(wordmark.locator(".wordmark-ember > span")).toBeVisible();
  await wordmark.hover();
  await expect(wordmark.locator("canvas")).toHaveCSS("opacity", "0");
  await expect(
    page.getByRole("heading", { name: "Research overview", exact: true }),
  ).toBeVisible();
});

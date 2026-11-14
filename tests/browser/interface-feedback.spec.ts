import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectComfortableTarget(target: Locator) {
  await expect(target).toBeVisible();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
}

async function savedStudioIntents(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; data: { question: string } }[]>(
        (resolve, reject) => {
          const opening = indexedDB.open("nova-ember-workspace", 2);
          opening.onerror = () => reject(new Error("Storage unavailable"));
          opening.onsuccess = () => {
            const db = opening.result;
            const transaction = db.transaction("documents", "readonly");
            const request = transaction.objectStore("documents").getAll();
            transaction.oncomplete = () => {
              db.close();
              resolve(
                request.result.filter(
                  (item: { kind: string }) => item.kind === "studio_intent",
                ),
              );
            };
            transaction.onerror = transaction.onabort = () => {
              db.close();
              reject(new Error("Saved research could not be read"));
            };
          };
        },
      ),
  );
}

test("command search tolerates pasted whitespace and restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Understand fire/ }),
  ).toBeVisible();
  const trigger = page.getByRole("button", {
    name: "Find a page or tool",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", {
    name: "Find a page or tool",
    exact: true,
  });
  await expect(palette).toBeVisible();
  await expect(
    page.getByLabel("What do you need?", { exact: true }),
  ).toBeFocused();
  await page
    .getByLabel("What do you need?", { exact: true })
    .fill(" Settings ");
  await expect(
    palette.getByRole("button", { name: "Settings & backup", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(palette).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(palette).toBeVisible();
  await palette
    .getByRole("button", { name: "Settings & backup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Preferences & backups", exact: true }),
  ).toBeVisible();
});

for (const width of [1440, 390]) {
  test(`overview controls retain comfortable targets without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: /Understand fire/ }),
    ).toBeVisible();
    const targets = page.locator(
      ".research-content .button, .home-examples button, .site-tools button",
    );
    expect(await targets.count()).toBeGreaterThan(4);
    for (const target of await targets.all()) {
      if (await target.isVisible()) await expectComfortableTarget(target);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    if (width < 960) {
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    }
    await expectComfortableTarget(page.locator(".wordmark"));
    if (width < 960) {
      const brand = await page.locator(".wordmark").boundingBox();
      const close = await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .boundingBox();
      expect(brand!.x + brand!.width).toBeLessThanOrEqual(close!.x);
      await page.keyboard.press("Escape");
      await expect(page.locator("#research-navigation")).toBeHidden();
    }
  });
}

test("repeated question submission saves one intent and sends one research request", async ({
  page,
}) => {
  const submittedRequests: string[] = [];
  await page.route("**/v1/**", async (route) => {
    if (route.request().method() === "POST") {
      submittedRequests.push(new URL(route.request().url()).pathname);
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.goto("/app");
  const submit = page.getByRole("button", {
    name: "Ask Nova Ember",
    exact: true,
  });
  await expect(submit).toBeDisabled();
  const question = "How do the original FLEX sources distinguish extinction?";
  await page
    .getByLabel("What would you like to understand?", { exact: true })
    .fill(question);
  await expect(submit).toBeEnabled();
  // Both events arrive before the asynchronous browser-storage save completes.
  await page.locator(".home-question").evaluate((element) => {
    const form = element as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit();
  });
  await expect(page).toHaveURL(/\/app\/agent\?intent=[a-f0-9-]{36}$/);
  await expect(page.getByText(question, { exact: true }).first()).toBeVisible();
  await expect
    .poll(
      () => submittedRequests.filter((path) => path === "/v1/research").length,
    )
    .toBe(1);
  const intents = await savedStudioIntents(page);
  expect(intents).toHaveLength(1);
  expect(intents[0].data.question).toBe(question);
  expect(new URL(page.url()).searchParams.get("intent")).toBe(intents[0].id);
  expect(submittedRequests.filter((path) => path === "/v1/research")).toEqual([
    "/v1/research",
  ]);
});

test("a failed local draft save preserves the question and permits recovery", async ({
  page,
}) => {
  await page.goto("/app");
  const question = page.getByLabel("What would you like to understand?", {
    exact: true,
  });
  await question.fill("Which measurements remain unresolved?");
  const submit = page.getByRole("button", {
    name: "Ask Nova Ember",
    exact: true,
  });
  await expect(submit).toBeEnabled();
  await page.evaluate(() => {
    const transaction = IDBDatabase.prototype.transaction;
    let failed = false;
    IDBDatabase.prototype.transaction = function (names, mode, ...options) {
      if (
        !failed &&
        mode === "readwrite" &&
        (names === "documents" || Array.from(names).includes("documents"))
      ) {
        failed = true;
        throw new DOMException(
          "Draft save interrupted by the storage fixture",
          "QuotaExceededError",
        );
      }
      return Reflect.apply(transaction, this, [names, mode, ...options]);
    } as typeof transaction;
  });
  await submit.click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Your question could not be saved" }),
  ).toBeVisible();
  await expect(question).toHaveValue("Which measurements remain unresolved?");
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page).toHaveURL(/\/app\/agent\?intent=[a-f0-9-]{36}$/);
  expect(await savedStudioIntents(page)).toHaveLength(1);
});

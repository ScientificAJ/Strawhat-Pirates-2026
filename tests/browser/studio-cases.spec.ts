import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const SNAPSHOT = "a".repeat(64);
async function offlineCases(page: Page) {
  const state = { exports: [] as Record<string, unknown>[] };
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (data: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(data),
      });
    if (url.pathname === "/v1/snapshots/current")
      return send({ snapshot_id: SNAPSHOT });
    if (url.pathname === "/v1/investigations")
      return send({ snapshot_id: SNAPSHOT, items: [], total: 0 });
    if (url.pathname.includes("/changes"))
      return send({
        pinned_snapshot_id: SNAPSHOT,
        current_scientific_snapshot_id: "b".repeat(64),
        observed_changes: [
          { accession: "PSI-69", status: "source_observation_changed" },
        ],
        case_mutation: false,
        released_changes: [],
        limitations: ["Offline interface reference."],
      });
    if (url.pathname === "/v1/capabilities/models")
      return send({ configured: false });
    if (url.pathname === "/v1/usage/models")
      return send({ request_limit_usd: 0.1 });
    if (url.pathname === "/v1/exports") {
      state.exports.push(route.request().postDataJSON());
      return route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({
          id: "10000000-0000-4000-8000-000000000004",
          status: "queued",
        }),
      });
    }
    if (url.pathname.startsWith("/v1/workflows/"))
      return send({
        id: "10000000-0000-4000-8000-000000000004",
        status: "succeeded",
      });
    if (route.request().method() !== "GET")
      return route.abort("blockedbyclient");
    return send({ items: [] });
  });
  return state;
}

async function seedArtifact(page: Page) {
  await page.evaluate(async (snapshot) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("nova-ember-workspace");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("documents", "readwrite");
        const data = {
          value: 2.575,
          unit: "kPa",
          result: { value: 2.575, unit: "kPa" },
          origin: "synthetic_reference",
          limitations: [
            "Synthetic independent arithmetic reference, not NASA measurements.",
          ],
        };
        const timestamp = new Date().toISOString();
        transaction.objectStore("documents").put({
          id: "known-analysis",
          kind: "analysis",
          title: "Frozen pressure reference",
          snapshot_id: snapshot,
          data,
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          revisions: [
            {
              revision: 1,
              saved_at: timestamp,
              title: "Frozen pressure reference",
              snapshot_id: snapshot,
              data,
            },
          ],
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, SNAPSHOT);
}

test("Structured cases freeze exact artifacts, preserve personal corrections, and export safe qualified reports", async ({
  page,
}, testInfo) => {
  const state = await offlineCases(page);
  await page.goto("/app/cases/new");
  await page
    .getByLabel("Notes title", { exact: true })
    .fill("Frozen pressure research");
  await seedArtifact(page);
  await page.reload();
  await page
    .getByLabel("Notes title", { exact: true })
    .fill("Frozen pressure research");
  await page
    .getByLabel("Research question", { exact: true })
    .fill("Can <img src=x onerror=alert(1)> be treated as data?");
  await page
    .getByLabel("Notes and unresolved questions", { exact: true })
    .fill("PRIVATE NOTE OMIT FROM PUBLIC REPORT");
  await page
    .getByText("Prepare a research report or assess applicability", {
      exact: true,
    })
    .click();
  const report = page.getByRole("region", {
    name: "Structured research case",
    exact: true,
  });
  await report
    .getByRole("textbox", { name: /Scenario and assumptions/ })
    .fill("Synthetic arithmetic reference; no operational safety inference.");
  await report
    .getByLabel(/^Findings/)
    .fill("The selected synthetic pressure difference is 2.575 kPa.");
  await report
    .getByRole("textbox", { name: /Limitations and applicability/ })
    .fill(
      "Synthetic reference only. Source calibration, experimental independence and safety applicability are unresolved.",
    );
  await report
    .getByRole("textbox", { name: /Reproducibility/ })
    .fill(
      "Exact decimal subtraction: 101.325 - 98.750 kPa. Keep original values.",
    );
  await report
    .getByRole("combobox", { name: /Saved research item/ })
    .selectOption("known-analysis");
  await report
    .getByRole("button", { name: "Attach revision", exact: true })
    .click();
  await expect(
    report.getByText("Attached a frozen local copy.", { exact: false }),
  ).toBeVisible();
  await report
    .getByText("Inspect frozen content and source identity", { exact: true })
    .click();
  await expect(
    report.getByText(
      "Synthetic independent arithmetic reference, not NASA measurements.",
      { exact: true },
    ),
  ).toBeVisible();
  await report
    .getByRole("combobox", { name: /Annotation type/ })
    .selectOption("correction");
  await report
    .getByRole("combobox", { name: /Exact target/ })
    .selectOption("artifact:known-analysis:revision:1");
  await report.getByLabel("Original value and unit").fill("2.575 kPa");
  await report
    .getByLabel("Proposed value and unit")
    .fill("2.600 kPa (unverified personal proposal)");
  await report
    .getByLabel("Reason for proposed correction")
    .fill(
      "An illustrative unresolved correction; preserve the original reference.",
    );
  await report
    .getByLabel("Supporting source or exact evidence locator")
    .fill(
      "Synthetic reference table, row 2; personal proposed value has no validation.",
    );
  await report
    .getByRole("button", { name: "Add personal correction", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/cases\/[a-f0-9-]+$/);
  if (!(await report.isVisible()))
    await page
      .getByText("Prepare a research report or assess applicability", {
        exact: true,
      })
      .click();
  await expect(
    report.locator("article > strong").filter({ hasText: /^Case revision 1$/ }),
  ).toBeVisible();
  await report
    .getByRole("button", { name: "Export preview", exact: true })
    .click();
  const preview = page.getByRole("region", {
    name: "Frozen research export preview",
  });
  await expect(
    preview.getByRole("checkbox", { name: "Include private case notes" }),
  ).not.toBeChecked();
  const jsonDownload = page.waitForEvent("download");
  await preview
    .getByRole("button", { name: "Download JSON", exact: true })
    .click();
  const jsonPath = testInfo.outputPath("frozen-case.json");
  await (await jsonDownload).saveAs(jsonPath);
  const exported = JSON.parse(await readFile(jsonPath, "utf8"));
  expect(exported.case_revision).toBe(1);
  expect(exported.private_notes).toBeUndefined();
  expect(exported.annotations).toBeUndefined();
  expect(exported.artifacts[0].data).toBeUndefined();
  expect(exported.artifacts[0].limitations).toContain(
    "Synthetic independent arithmetic reference, not NASA measurements.",
  );
  expect(exported.sections.findings).toContain("2.575 kPa");
  expect(exported.frozen_sha256).toMatch(/^[a-f0-9]{64}$/);
  const htmlDownload = page.waitForEvent("download");
  await preview
    .getByRole("button", { name: "Download safe HTML", exact: true })
    .click();
  const htmlPath = testInfo.outputPath("frozen-case.html");
  await (await htmlDownload).saveAs(htmlPath);
  const html = await readFile(htmlPath, "utf8");
  expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  expect(html).not.toContain("<img");
  expect(html).not.toContain("PRIVATE NOTE OMIT");
  expect(html).toContain("Review required:");
  await preview
    .getByRole("button", { name: "Build reproducibility bundle", exact: true })
    .click();
  await expect.poll(() => state.exports.length).toBe(1);
  const selection = state.exports[0].selection as Record<string, unknown>;
  expect(selection.include_original_bytes).toBe(false);
  expect(selection.notes).toBe("");
  const artifacts = selection.artifacts as Record<string, unknown>[];
  const reportPayload = artifacts[0].payload as Record<string, unknown>;
  expect(reportPayload.sections).toEqual(exported.sections);
  expect(reportPayload.private_notes).toBeUndefined();
  expect(artifacts[0].snapshot_id).toBe(SNAPSHOT);
  expect(artifacts[0].scientific_origin).toBe("unknown");
  await report
    .getByRole("textbox", { name: /Scenario and assumptions/ })
    .fill("Changed assumption; old findings require review.");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    report.locator("article > strong").filter({ hasText: /^Case revision 2$/ }),
  ).toBeVisible();
  await report
    .locator("article")
    .filter({ has: page.getByText("Case revision 1", { exact: true }) })
    .getByRole("button", { name: "Restore as new draft" })
    .click();
  await expect(
    report.getByRole("textbox", { name: /Scenario and assumptions/ }),
  ).toHaveValue(
    "Synthetic arithmetic reference; no operational safety inference.",
  );
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    report.locator("article > strong").filter({ hasText: /^Case revision 3$/ }),
  ).toBeVisible();
  await expect(
    report.locator("article > strong").filter({ hasText: /^Case revision 1$/ }),
  ).toBeVisible();
  await report
    .getByRole("button", { name: "Check source changes now" })
    .click();
  await expect(report.getByText(/1 observed source changes/)).toBeVisible();
  await report
    .getByRole("button", { name: "Prepare a local evidence-review revision" })
    .click();
  await expect(
    page.getByText(/Its frozen source snapshot is preserved/),
  ).toBeVisible();
});

test("Structured frozen case survives portable backup into a fresh browser without changing its content hash", async ({
  browser,
  page,
}, testInfo) => {
  await offlineCases(page);
  await page.goto("/app/cases/new");
  await page
    .getByLabel("Notes title", { exact: true })
    .fill("Portable scientific case");
  await page
    .getByLabel("Research question", { exact: true })
    .fill("Which source conditions remain unresolved?");
  await page
    .getByText("Prepare a research report or assess applicability", {
      exact: true,
    })
    .click();
  const region = page.getByRole("region", {
    name: "Structured research case",
    exact: true,
  });
  await region
    .getByRole("textbox", { name: /Limitations and applicability/ })
    .fill("Unresolved source context stays unresolved after import.");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    region.getByText("Case revision 1", { exact: true }),
  ).toBeVisible();
  const original = await page.evaluate(
    async () =>
      await new Promise<Record<string, unknown>>((resolve) => {
        const request = indexedDB.open("nova-ember-workspace");
        request.onsuccess = () => {
          const database = request.result;
          const tx = database.transaction("documents", "readonly");
          const op = tx.objectStore("documents").getAll();
          tx.oncomplete = () => {
            database.close();
            resolve(
              (
                op.result as { kind: string; data: Record<string, unknown> }[]
              ).find((item) => item.kind === "case_research")!.data,
            );
          };
        };
      }),
  );
  await page.goto("/app/settings");
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download research backup", exact: true })
    .first()
    .click();
  const path = testInfo.outputPath("portable-case-workspace.json");
  await (await event).saveAs(path);
  const context = await browser.newContext();
  const restored = await context.newPage();
  try {
    await offlineCases(restored);
    await restored.goto("/app/settings");
    await restored
      .getByRole("button", { name: "Restore research backup", exact: true })
      .first()
      .click();
    await restored.locator('input[type="file"]').first().setInputFiles(path);
    await expect(
      restored.getByRole("button", { name: /Import independent copies/ }),
    ).toBeVisible();
    await restored
      .getByRole("button", { name: /Import independent copies/ })
      .click();
    await expect(
      restored
        .getByRole("status")
        .filter({ hasText: /Restored .* research items/ }),
    ).toBeVisible();
    await restored
      .getByRole("banner")
      .getByRole("link", { name: "Your research", exact: true })
      .click();
    await restored
      .getByRole("link", { name: /Portable scientific case/ })
      .first()
      .click();
    await restored
      .getByText("Prepare a research report or assess applicability", {
        exact: true,
      })
      .click();
    const research = restored.getByRole("region", {
      name: "Structured research case",
      exact: true,
    });
    await expect(
      research.getByText("Case revision 1", { exact: true }),
    ).toBeVisible();
    const imported = await restored.evaluate(
      async () =>
        await new Promise<Record<string, unknown>>((resolve) => {
          const request = indexedDB.open("nova-ember-workspace");
          request.onsuccess = () => {
            const database = request.result;
            const tx = database.transaction("documents", "readonly");
            const op = tx.objectStore("documents").getAll();
            tx.oncomplete = () => {
              database.close();
              resolve(
                (
                  op.result as { kind: string; data: Record<string, unknown> }[]
                ).find((item) => item.kind === "case_research")!.data,
              );
            };
          };
        }),
    );
    expect((imported.frozen as unknown[])[0]).toEqual(
      (original.frozen as unknown[])[0],
    );
    await research
      .getByRole("textbox", { name: /Limitations and applicability/ })
      .fill("Changed only in restored browser draft.");
    expect(JSON.stringify(original)).toContain(
      "Unresolved source context stays unresolved after import.",
    );
  } finally {
    await context.close();
  }
});

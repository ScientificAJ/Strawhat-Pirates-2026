import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const stamp = "2026-11-14T10:00:00.000Z";
const snapshot =
  "d2e1342353ec1fc3bcdd69fab4fc8aa0ea4ffacf1b95c627547cd7fcc41d549d";
function document(id: string, kind: string, data: Record<string, unknown>) {
  return {
    id,
    kind,
    title: `Offline storage fixture ${kind}`,
    snapshot_id: snapshot,
    data,
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
    revisions: [
      {
        revision: 1,
        saved_at: stamp,
        title: `Offline storage fixture ${kind}`,
        snapshot_id: snapshot,
        data,
      },
    ],
  };
}
async function countDocuments(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<number>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onerror = () => reject(new Error("Storage unavailable"));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("documents");
          const result = tx.objectStore("documents").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(
              result.result.filter((item: { title: string }) =>
                item.title.startsWith("Offline storage fixture"),
              ).length,
            );
          };
        };
      }),
  );
}

test("portable research backup preserves revisions and references, excludes credentials, and imports atomically", async ({
  page,
}, testInfo) => {
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("dark");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  const source = document("source-local", "analysis", {
    value: 3.06,
    unit: "psia",
    origin: "derived_from_assumptions",
    receipt: "fixture-must-not-export",
    api_key: "fixture-must-not-export",
    activeJob: "transient",
  });
  const linked = document("dashboard-local", "dashboard", {
    source_document_id: source.id,
    source_revision: 1,
    annotation_target: `artifact:${source.id}:revision:1`,
    frozen: {
      annotation_target: `artifact:${source.id}:revision:1`,
      source_document_id: source.id,
    },
  });
  const remote = document("job-local", "remote_job", {
    job_id: "12345678-1234-1234-1234-123456789abc",
  });
  await page.evaluate(
    async (items) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onerror = () => reject(new Error("Storage unavailable"));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("documents", "readwrite");
          for (const item of items) tx.objectStore("documents").put(item);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(new Error("Fixture write failed"));
        };
      }),
    [source, linked, remote],
  );
  const event = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Back up workspace", exact: true })
    .first()
    .click();
  const file = testInfo.outputPath("research-backup.json");
  await (await event).saveAs(file);
  const backup = JSON.parse(await readFile(file, "utf8"));
  expect(backup.version).toBe(2);
  expect(
    backup.documents.some(
      (item: { kind: string }) => item.kind === "remote_job",
    ),
  ).toBe(false);
  expect(JSON.stringify(backup)).not.toContain("fixture-must-not-export");
  expect(
    backup.documents.find((item: { id: string }) => item.id === source.id)
      .revisions[0].data.value,
  ).toBe(3.06);
  const before = await countDocuments(page);
  const invalid = structuredClone(backup);
  invalid.documents.push({
    ...linked,
    id: "broken",
    revisions: [{ revision: 99 }],
  });
  await page.getByLabel("Restore a workspace backup").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page
    .getByRole("button", { name: "Import independent copies", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nothing was imported" }),
  ).toBeVisible();
  expect(await countDocuments(page)).toBe(before);
  await page
    .getByRole("button", { name: "Cancel restore", exact: true })
    .click();
  await page.getByLabel("Restore a workspace backup").setInputFiles(file);
  await page
    .getByRole("button", { name: "Import independent copies", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Restored .* research items/ }),
  ).toBeVisible();
  const copied = await page.evaluate(
    async () =>
      new Promise<Record<string, unknown>[]>((resolve) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("documents");
          const request = tx.objectStore("documents").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(request.result);
          };
        };
      }),
  );
  const secondSource = copied.find(
    (item) => item.kind === "analysis" && item.id !== source.id,
  )!;
  const secondLink = copied.find(
    (item) => item.kind === "dashboard" && item.id !== linked.id,
  )!;
  expect((secondLink.data as Record<string, unknown>).source_document_id).toBe(
    secondSource.id,
  );
  expect((secondSource.data as Record<string, unknown>).value).toBe(3.06);
  expect((secondLink.data as Record<string, unknown>).annotation_target).toBe(
    `artifact:${secondSource.id}:revision:1`,
  );
  expect((secondLink.data as Record<string, unknown>).frozen).toEqual(
    linked.data.frozen,
  );
});

test("separate local workspaces preserve an already open tab and keyboard navigation", async ({
  page,
}) => {
  await page.goto("/app/cases/new");
  await page.getByLabel("Case title").fill("Primary browser research");
  await page
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revision 1 saved", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/cases\/[a-f0-9-]{36}$/);
  const original = page.url();
  const other = await page.context().newPage();
  await other.goto(original);
  await page
    .getByRole("button", { name: "New workspace", exact: true })
    .click();
  await page
    .getByLabel("Workspace name", { exact: true })
    .fill("Separate laboratory");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByLabel("Local workspace", { exact: true }),
  ).not.toHaveValue("primary");
  await page.goto("/app/cases");
  await expect(
    page.getByRole("link", { name: /Primary browser research/ }),
  ).toHaveCount(0);
  await other
    .getByLabel("Notes and unresolved questions")
    .fill("Saved from the original tab after switching another tab.");
  await other
    .getByRole("button", { name: "Save revision", exact: true })
    .click();
  await expect(
    other.getByRole("button", { name: "Revision 2 saved", exact: true }),
  ).toBeVisible();
  await other.close();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByLabel("Local workspace", { exact: true })
    .selectOption("primary");
  await page.goto(original);
  await expect(page.getByLabel("Notes and unresolved questions")).toHaveValue(
    "Saved from the original tab after switching another tab.",
  );
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Find a destination", { exact: true }).fill("Settings");
  await page
    .getByRole("dialog", { name: "Command palette", exact: true })
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Workspace settings", exact: true }),
  ).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("system");
  await page
    .getByLabel("Enable Cmd / Ctrl K for commands", { exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await expect(page.locator(".header-search kbd")).toHaveText("Commands");
  await page.keyboard.press("Control+k");
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Open command palette", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Command palette", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.evaluate(() =>
    sessionStorage.setItem(
      "nova-discovery-view:primary:fixture",
      "stale selection",
    ),
  );
  await page
    .getByRole("button", { name: "Clear this workspace", exact: true })
    .click();
  await page
    .getByLabel(
      "Remove all Nova Ember local workspaces in this browser profile",
      { exact: true },
    )
    .check();
  await page
    .getByLabel(/Also remove this workspace’s remembered server jobs/)
    .uncheck();
  await page
    .getByRole("button", { name: "Clear all local workspaces", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app$/);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("nova-discovery-view:primary:fixture"),
    ),
  ).toBeNull();
  await expect(
    page.getByLabel("Local workspace", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await page.goto("/app/cases");
  await expect(
    page.getByRole("heading", {
      name: "Begin with a question worth keeping",
      exact: true,
    }),
  ).toBeVisible();
});

import { expect, test } from "@playwright/test";

// Real retained NASA evidence and deterministic operations; no model calls.
test.beforeEach(async ({ page }) => {
  await page.route("**/v1/research", (route) => route.abort());
});

test("an investigation becomes a source selection, CSV and reopened analysis", async ({
  page,
}) => {
  await page.goto("/app/investigations/PSI-25");
  await page.getByRole("tab", { name: "Explore data", exact: true }).click();
  await page
    .getByRole("link", { name: /Analyze or export this dataset/ })
    .click();
  await page
    .getByRole("combobox", { name: "Investigation", exact: true })
    .selectOption("PSI-25");
  const variables = page.getByRole("complementary").getByRole("checkbox");
  await expect(variables).not.toHaveCount(0);
  await page
    .getByRole("complementary")
    .getByLabel("Test #", { exact: true })
    .check();
  await page
    .getByRole("complementary")
    .getByLabel("Fuel Sample Material", { exact: true })
    .check();
  const queryResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/v1/queries" &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  const values = await (await queryResponse).json();
  expect(values.returned_source_records).toBe(129);
  expect(
    values.columns.map(
      (column: { source_index: number }) => column.source_index,
    ),
  ).toEqual(expect.arrayContaining([1, 5]));
  await expect(
    page.getByRole("cell", { name: "B1", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save analysis", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Analysis saved" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const downloadButton = page.getByRole("button", { name: /Download .*csv/ });
  await expect(downloadButton).toBeVisible({ timeout: 30000 });
  const downloadEvent = page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  expect(csv.split("\n")[0]).toContain("column_1");
  expect(csv.split("\n")[0]).toContain("column_5");
  expect(csv).toContain("B1");
  await page.getByRole("button", { name: "Save a copy", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Copy saved", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Research", exact: true })
    .getByRole("link", { name: "Your research", exact: true })
    .click();
  await page.route("**/v1/workflows/*/artifacts/*", (route) => route.abort());
  const retainedDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download saved file", exact: true })
    .click();
  const retainedStream = await (await retainedDownload).createReadStream();
  let retainedCsv = "";
  for await (const chunk of retainedStream!) retainedCsv += chunk.toString();
  expect(retainedCsv).toBe(csv);
  await page
    .getByRole("link", { name: /BASS-II —/ })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved analysis reopened" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByLabel("Test #", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("cell", { name: "B1", exact: true }).first(),
  ).toBeVisible();
});

test("earlier research is combined once without changing originals or references", async ({
  page,
  context,
}) => {
  await page.goto("/app");
  await page.getByRole("heading", { name: /Understand fire/ }).waitFor();
  await page.evaluate(async () => {
    const id = "30000000-0000-4000-8000-000000000001";
    localStorage.setItem(
      "nova-ember-local-workspaces",
      JSON.stringify([
        {
          id,
          name: "Earlier experiments",
          created_at: new Date().toISOString(),
        },
      ]),
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`nova-ember-workspace-${id}`, 2);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("cases", { keyPath: "id" });
        request.result.createObjectStore("documents", { keyPath: "id" });
        request.result.createObjectStore("preferences");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const time = new Date().toISOString();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(["documents"], "readwrite");
      for (const [id, title, data] of [
        ["legacy-source", "Earlier FLEX bookmark", { accession: "PSI-69" }],
        [
          "legacy-link",
          "Earlier linked result",
          { source_id: "legacy-source" },
        ],
      ] as const) {
        tx.objectStore("documents").add({
          id,
          title,
          kind: id === "legacy-source" ? "bookmark" : "analysis",
          data,
          snapshot_id: null,
          revision: 1,
          created_at: time,
          updated_at: time,
          revisions: [
            { revision: 1, title, saved_at: time, snapshot_id: null, data },
          ],
        });
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  });
  const second = await context.newPage();
  await Promise.all([page.reload(), second.goto("/app")]);
  await page.getByRole("heading", { name: /Understand fire/ }).waitFor();
  await second.getByRole("heading", { name: /Understand fire/ }).waitFor();
  await page.goto("/app/cases");
  await expect(
    page.getByRole("link", { name: /Earlier FLEX bookmark/ }),
  ).toHaveCount(1);
  const stored = await page.evaluate(async () => {
    async function documents(name: string) {
      return new Promise<Record<string, unknown>[]>((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction("documents");
          const read = tx.objectStore("documents").getAll();
          tx.oncomplete = () => {
            db.close();
            resolve(read.result);
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    }
    const imported = await documents("nova-ember-workspace");
    const originals = await documents(
      "nova-ember-workspace-30000000-0000-4000-8000-000000000001",
    );
    return {
      imported: imported.filter((item) =>
        String(item.title).startsWith("Earlier"),
      ),
      originals,
    };
  });
  expect(stored.originals.map((item) => item.id)).toEqual([
    "legacy-link",
    "legacy-source",
  ]);
  const source = stored.imported.find(
    (item) => item.title === "Earlier FLEX bookmark",
  )!;
  const linked = stored.imported.find(
    (item) => item.title === "Earlier linked result",
  )!;
  expect((linked.data as { source_id: string }).source_id).toBe(source.id);
  expect(stored.imported).toHaveLength(3); // Two records plus the atomic import marker.
  await page.reload();
  await expect(
    page.getByRole("link", { name: /Earlier FLEX bookmark/ }),
  ).toHaveCount(1);
});

test("late data responses cannot replace an edited selection and source-specific rules reset", async ({
  page,
}) => {
  await page.goto("/app/lab/data/PSI-25");
  const testNumber = page
    .getByRole("complementary")
    .getByLabel("Test #", { exact: true });
  await expect(testNumber).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/v1/queries", async (route) => {
    requests++;
    if (requests === 1) await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  await expect.poll(() => requests).toBe(1);
  await testNumber.check();
  release();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Your selection changed while the data was loading" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  await expect(
    page.getByRole("cell", { name: "B1", exact: true }).first(),
  ).toBeVisible();
  await page
    .getByText("Filter, group or summarize data", { exact: true })
    .click();
  await page.getByLabel("Source rows", { exact: true }).fill("2");
  await page
    .getByRole("combobox", { name: "Group records by", exact: true })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Summary operation", exact: true })
    .selectOption("mean");
  await page
    .getByRole("combobox", { name: "Investigation", exact: true })
    .selectOption("PSI-69");
  await expect(
    page.getByRole("heading", {
      name: "PSI-69_Experimental table_FLEX.csv",
      exact: true,
    }),
  ).toBeVisible();
  const sourceRules = page.locator("details").filter({
    has: page.getByText("Filter, group or summarize data", { exact: true }),
  });
  if ((await sourceRules.getAttribute("open")) === null)
    await sourceRules.locator("summary").click();
  await expect(page.getByLabel("Source rows", { exact: true })).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Group records by", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Summary operation", exact: true }),
  ).toHaveValue("none");
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toHaveCount(0);
});

test("chart validation preserves edits made while the submitted specification is pending", async ({
  page,
}) => {
  await page.goto("/app/lab/data/PSI-99");
  await page
    .getByRole("combobox", { name: "Value representation", exact: true })
    .selectOption("canonical");
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  await page.getByRole("tab", { name: "Charts", exact: true }).click();
  const title = page.getByLabel("Figure title", { exact: true });
  await title.fill("Submitted figure");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let submitted = false;
  await page.route("**/v1/charts/validate", async (route) => {
    submitted = true;
    await gate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Validate and draw", exact: true })
    .click();
  await expect.poll(() => submitted).toBe(true);
  await title.fill("My newer figure title");
  release();
  await expect(
    page.getByRole("status").filter({
      hasText: "Chart settings changed while validation was running",
    }),
  ).toBeVisible();
  await expect(title).toHaveValue("My newer figure title");
  await expect(page.locator(".vega-embed")).toHaveCount(0);
});

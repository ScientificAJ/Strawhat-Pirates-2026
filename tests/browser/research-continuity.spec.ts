import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const SNAPSHOT = "a".repeat(64);
const INTENT = "20000000-0000-4000-8000-000000000001";
const JOB = "20000000-0000-4000-8000-000000000002";
const QUESTION =
  "Which NASA investigations address flame spread in spacecraft?";

async function researchService(
  context: BrowserContext,
  failFirst = false,
  withCitations = false,
) {
  const requests: {
    key: string | undefined;
    input: Record<string, unknown>;
  }[] = [];
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path === "/v1/snapshots/current")
      return json({ snapshot_id: SNAPSHOT });
    if (path === "/v1/investigations")
      return json({ snapshot_id: SNAPSHOT, items: [], total: 0 });
    if (path === "/v1/investigations/PSI-25")
      return json({
        accession: "PSI-25",
        title: "Synthetic catalog fixture",
        assets: [],
      });
    if (path === "/v1/capabilities/models") return json({ configured: true });
    if (path === "/v1/usage/models") return json({ request_limit_usd: 0.1 });
    if (path === "/v1/research") {
      requests.push({
        key: request.headers()["idempotency-key"],
        input: request.postDataJSON(),
      });
      if (failFirst && requests.length === 1) return route.abort("failed");
      return json({ id: JOB, status: "queued" }, 202);
    }
    if (path === `/v1/workflows/${JOB}/events`)
      return route.fulfill({
        contentType: "text/event-stream",
        body: ": done\n\n",
      });
    if (path === `/v1/workflows/${JOB}`)
      return json({
        id: JOB,
        status: "succeeded",
        result: {
          status: "completed",
          facts: withCitations
            ? ["PSI-25", "PSI-69"].map((accession, index) => ({
                id: `source-${index}`,
                label: `Synthetic citation ${accession}`,
                origin: "source_text",
                content: {
                  records: [{ value: "Synthetic source table fixture" }],
                  anchor: {
                    snapshot_id: SNAPSHOT,
                    source_kind: "psi",
                    accession,
                    investigation_version: 1,
                    source_sha256: "c".repeat(64),
                    kind: "metadata_field",
                    field: "objectives",
                  },
                },
              }))
            : [],
          actions: [],
          answer: {
            title: "Interface test response",
            claims: [
              {
                statement:
                  "Synthetic response for interface verification only." +
                  (withCitations
                    ? " This long synthetic answer checks that a completed reply begins where it can be read. It is not a scientific conclusion.".repeat(
                        24,
                      )
                    : ""),
                origin: "interpretation",
                fact_ids: withCitations ? ["source-0", "source-1"] : [],
                limitations: [],
              },
            ],
            limitations: [],
            contradictions: [],
            next_actions: [],
          },
        },
      });
    return json({ items: [] });
  });
  return requests;
}

async function seedQuestion(page: Page, withImage = false) {
  await page.goto("/app/agent");
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    async ({ snapshot, intent, question, image }) => {
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace");
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction("documents", "readwrite");
          const timestamp = new Date().toISOString();
          const data = {
            question,
            snapshot_id: snapshot,
            investigations: [],
            auto_submit: true,
            ...(image
              ? {
                  image: {
                    expected_sha256: "b".repeat(64),
                    media_type: "image/png",
                    image_base64:
                      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJxkAAAAASUVORK5CYII=",
                  },
                  image_name: "Synthetic interface test pixel",
                }
              : {}),
          };
          transaction.objectStore("documents").put({
            id: intent,
            kind: "studio_intent",
            title: question,
            snapshot_id: snapshot,
            data,
            revision: 1,
            created_at: timestamp,
            updated_at: timestamp,
            revisions: [
              {
                revision: 1,
                saved_at: timestamp,
                title: question,
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
    },
    {
      snapshot: SNAPSHOT,
      intent: INTENT,
      question: QUESTION,
      image: withImage,
    },
  );
}

test("a submitted question starts research once and resumes after reload", async ({
  page,
  context,
}) => {
  const requests = await researchService(context);
  await seedQuestion(page);
  await page.goto(`/app/agent?intent=${INTENT}`);
  await expect(
    page.getByText("Synthetic response for interface verification only.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0].input.question).toContain(QUESTION);
  expect(requests[0].input.question).toContain("retained NASA corpus");
  await page.reload();
  await expect(page.getByText(QUESTION, { exact: true })).toBeVisible();
  await expect(
    page.getByText("Synthetic response for interface verification only.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.goto("/app/cases");
  await expect(
    page.getByRole("heading", { name: "Your research", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: new RegExp(QUESTION.replace("?", "\\?")) }),
  ).toBeVisible();
});

test("an interrupted question recovers the same durable operation", async ({
  page,
  context,
}) => {
  const requests = await researchService(context, true);
  await seedQuestion(page);
  await page.goto(`/app/agent?intent=${INTENT}`);
  await expect(
    page.getByRole("button", { name: "Recover this request", exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(1);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Recover this request", exact: true }),
  ).toBeEnabled();
  expect(requests).toHaveLength(1);
  await page
    .getByRole("button", { name: "Recover this request", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic response for interface verification only.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[1].key).toBe(requests[0].key);
  expect(requests[1].input).toEqual(requests[0].input);
});

test("parallel opens of one question share one research request", async ({
  page,
  context,
}) => {
  const requests = await researchService(context);
  await seedQuestion(page);
  const second = await context.newPage();
  await Promise.all([
    page.goto(`/app/agent?intent=${INTENT}`),
    second.goto(`/app/agent?intent=${INTENT}`),
  ]);
  await expect.poll(() => requests.length).toBe(1);
  await expect(page.getByText(QUESTION, { exact: true })).toBeVisible();
  await expect(second.getByText(QUESTION, { exact: true })).toBeVisible();
  await second.close();
  expect(requests).toHaveLength(1);
});

test("the home question completes the assistant entry flow", async ({
  page,
  context,
}) => {
  const requests = await researchService(context);
  await page.goto("/app");
  await page
    .getByRole("textbox", {
      name: "What would you like to understand?",
      exact: true,
    })
    .fill(QUESTION);
  await page
    .getByRole("button", { name: "Ask Nova Ember", exact: true })
    .click();
  await expect(
    page.getByText("Synthetic response for interface verification only.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
  await page.screenshot({
    path: "/tmp/nova-assistant-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "/tmp/nova-assistant-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New question", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/agent\/[^?]+$/);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toHaveValue("");
  expect(requests).toHaveLength(1);
});

test("a selected image still requires consent before an automatic question is sent", async ({
  page,
  context,
}) => {
  const requests = await researchService(context);
  await seedQuestion(page, true);
  await page.goto(`/app/agent?intent=${INTENT}`);
  await expect(
    page.getByText(
      "Confirm sharing this selected image, or remove it before sending.",
      { exact: true },
    ),
  ).toBeVisible();
  expect(requests).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /Share this selected image with the model/ })
    .check();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText("Synthetic response for interface verification only.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(requests).toHaveLength(1);
});

test("answers connect cited evidence to investigations and comparison", async ({
  page,
  context,
}) => {
  const requests = await researchService(context, false, true);
  await seedQuestion(page);
  await page.goto(`/app/agent?intent=${INTENT}`);
  const sources = page.getByRole("region", { name: "Sources for this reply" });
  await expect(
    page.getByRole("region", { name: "Research artifact canvas", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Inspect retrieved evidence",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Interface test response", { exact: true }),
  ).toBeInViewport();
  await expect(
    sources.getByRole("link", {
      name: "Explore investigation PSI-25",
      exact: true,
    }),
  ).toHaveAttribute("href", `/app/investigations/PSI-25?snapshot=${SNAPSHOT}`);
  await expect(
    sources.getByRole("link", {
      name: "Explore investigation PSI-69",
      exact: true,
    }),
  ).toHaveAttribute("href", `/app/investigations/PSI-69?snapshot=${SNAPSHOT}`);
  const compare = sources.getByRole("link", {
    name: "Compare cited investigations",
    exact: true,
  });
  await expect(compare).toHaveAttribute(
    "href",
    `/app/compare?ids=PSI-25,PSI-69&snapshot=${SNAPSHOT}`,
  );
  await compare.click();
  await expect(page).toHaveURL(
    new RegExp(`/app/compare\\?ids=PSI-25,PSI-69&snapshot=${SNAPSHOT}`),
  );
  expect(requests).toHaveLength(1);
});

test("a saved record without a dedicated tool remains inspectable and portable", async ({
  page,
  context,
}, testInfo) => {
  await researchService(context);
  await page.goto("/app/cases");
  await expect(
    page.getByRole("heading", { name: "Your research", exact: true }),
  ).toBeVisible();
  await page.evaluate(async (snapshot) => {
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open("nova-ember-workspace");
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const transaction = db.transaction("documents", "readwrite");
        const timestamp = new Date().toISOString();
        const data = {
          value: "2.575",
          unit: "kPa",
          origin: "synthetic_interface_fixture",
          limitations: ["Synthetic interface reference only."],
        };
        transaction.objectStore("documents").put({
          id: "unmapped-record",
          kind: "research_artifact",
          title: "Preserved calculation record",
          snapshot_id: snapshot,
          data,
          revision: 1,
          created_at: timestamp,
          updated_at: timestamp,
          revisions: [
            {
              revision: 1,
              saved_at: timestamp,
              title: "Preserved calculation record",
              snapshot_id: snapshot,
              data,
            },
          ],
        });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, SNAPSHOT);
  await page.reload();
  await page.getByText("Preserved calculation record", { exact: true }).click();
  await expect(
    page.locator("pre").filter({ hasText: "synthetic_interface_fixture" }),
  ).toContainText("2.575");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download saved record", exact: true })
    .click();
  const path = testInfo.outputPath("preserved-record.json");
  await (await download).saveAs(path);
  const exported = JSON.parse(await readFile(path, "utf8"));
  expect(exported.snapshot_id).toBe(SNAPSHOT);
  expect(exported.data).toEqual({
    value: "2.575",
    unit: "kPa",
    origin: "synthetic_interface_fixture",
    limitations: ["Synthetic interface reference only."],
  });
});

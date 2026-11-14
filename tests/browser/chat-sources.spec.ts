import { expect, test } from "@playwright/test";
import { chatCitations, recordedAnchor } from "../../apps/web/lib/chat-sources";

const SNAPSHOT =
  "d2e1342353ec1fc3bcdd69fab4fc8aa0ea4ffacf1b95c627547cd7fcc41d549d";
const SHA = "cb748242c189bca59b861d0bb0f406fb7a80aee1710cee363f7620c43d66e2a0";
const ANCHOR = {
  snapshot_id: SNAPSHOT,
  source_sha256: SHA,
  source_kind: "psi",
  accession: "PSI-69",
  investigation_version: 5,
  asset_id: "PSI-69:v1:PSI-69_Raw Data_FLEX-007_TestSheet.txt",
  kind: "text_lines",
  source_row: 18,
  line_end: 19,
};

test("reply references keep one number per cited fact and expose missing records", () => {
  const citations = chatCitations(
    [
      { fact_ids: ["source", "calculation", "source"] },
      { fact_ids: ["missing", "source"] },
    ],
    [
      {
        id: "source",
        origin: "source_text",
        label: "Test sheet",
        content: { source_fields: { diameter: { anchor: ANCHOR } } },
        sources: [],
      },
      {
        id: "calculation",
        origin: "deterministic_calculation",
        label: "Derived result",
        content: { parameter_sources: { diameter: { anchor: ANCHOR } } },
      },
      { id: "unused", origin: "source_text", content: { anchor: ANCHOR } },
    ],
  );
  expect(citations.map(({ id, number }) => ({ id, number }))).toEqual([
    { id: "source", number: 1 },
    { id: "calculation", number: 2 },
    { id: "missing", number: 3 },
  ]);
  expect(citations[0].anchors).toEqual([ANCHOR]);
  expect(citations[1]).toMatchObject({ calculated: true, anchors: [ANCHOR] });
  expect(citations[2]).toMatchObject({ available: false, anchors: [] });
  expect(chatCitations([], [{ id: "unused" }])).toEqual([]);
});

test("source locations preserve zero indices and exact spans without inferring missing locators", () => {
  expect(
    recordedAnchor({
      ...ANCHOR,
      kind: "table_cell",
      column: 0,
      start: 0,
      end: 1,
    }),
  ).toMatchObject({ column: 0, start: 0, end: 1 });
  expect(
    recordedAnchor({ ...ANCHOR, kind: "media_frame", frame: 0 }),
  ).toMatchObject({ frame: 0 });
  expect(recordedAnchor({ ...ANCHOR, kind: "table_cell" })).toBeNull();
  expect(recordedAnchor({ ...ANCHOR, kind: "constructor" })).toBeNull();
  expect(recordedAnchor({ ...ANCHOR, start: 4, end: 4 })).toBeNull();
  expect(recordedAnchor({ ...ANCHOR, source_sha256: "unknown" })).toBeNull();
  expect(
    recordedAnchor({
      ...ANCHOR,
      source_kind: "ntrs",
      document_id: "19910018899",
      capture_id: "b".repeat(64),
      kind: "document_page",
      page: 3,
    }),
  ).toBeNull();
  const noLocator = chatCitations(
    [{ fact_ids: ["calculated"] }],
    [
      {
        id: "calculated",
        origin: "deterministic_calculation",
        content: {
          asset: { sha256: SHA },
          source_rows: [18],
          source_columns: [0],
        },
      },
    ],
  );
  expect(noLocator[0].anchors).toEqual([]);
  const table = chatCitations(
    [{ fact_ids: ["table"] }],
    [
      {
        id: "table",
        origin: "source_measurement",
        sources: [
          {
            id: ANCHOR.asset_id,
            sha256: SHA,
            snapshot_id: SNAPSHOT,
            accession: "PSI-69",
            investigation_version: 5,
            source_rows: [7],
          },
        ],
        content: {
          accession: "PSI-69",
          asset_id: ANCHOR.asset_id,
          source_sha256: SHA,
          records: [
            {
              source_row: 7,
              raw_cells: ["recorded", "1.82"],
              fields: [
                { column_index: 0, raw_text: "recorded" },
                { column_index: 1, raw_text: "1.82" },
                { column_index: 2, raw_text: "unrecorded" },
              ],
            },
            {
              source_row: 8,
              raw_cells: ["out of scope"],
              fields: [{ column_index: 0, raw_text: "out of scope" }],
            },
          ],
        },
      },
    ],
  );
  expect(table[0].anchors).toEqual(
    [0, 1].map((column) => ({
      snapshot_id: SNAPSHOT,
      source_sha256: SHA,
      source_kind: "psi",
      accession: "PSI-69",
      investigation_version: 5,
      asset_id: ANCHOR.asset_id,
      kind: "table_cell",
      source_row: 7,
      column,
    })),
  );
  expect(table[0].scopeNote).toContain("claim-specific cell was not recorded");
});

test("numbered chat sources reveal a real retained passage and retain calculation boundaries", async ({
  page,
  request,
}) => {
  const snapshot = await (await request.get("/v1/snapshots/current")).json();
  expect(snapshot.snapshot_id).toBe(SNAPSHOT);
  const job = "10000000-0000-4000-8000-000000000099";
  const secondJob = "10000000-0000-4000-8000-000000000098";
  const sourceReads: Record<string, unknown>[] = [];
  let researchCalls = 0;
  const chartValues = [
    { time: 0, value: 2 },
    { time: 1, value: 3 },
  ];
  const result = {
    status: "completed",
    model: "offline-interface-fixture",
    cost_usd: "0",
    facts: [
      {
        id: "source",
        label: "Retained FLEX-007 test-sheet passage",
        origin: "source_text",
        sources: [ANCHOR],
        content: { anchor: ANCHOR },
        limitations: [
          "This UI fixture cites a retained source; its prose is not a research finding.",
        ],
      },
      {
        id: "calculated",
        label: "Synthetic coordinate example",
        origin: "deterministic_calculation",
        sources: [ANCHOR],
        limitations: ["Synthetic browser fixture, not measured science."],
        content: {
          status: "complete",
          spec: { title: "Synthetic coordinate example", view: "coordinates" },
          vega_lite: {
            data: { values: chartValues },
            mark: "point",
            encoding: {
              x: { field: "time", type: "quantitative", title: "Time [s]" },
              y: { field: "value", type: "quantitative" },
            },
          },
          data: {
            snapshot_id: SNAPSHOT,
            asset: { sha256: "c".repeat(64), accession: "registered-analysis" },
            value_origin: "registered_calculation",
            columns: [
              { key: "time", title: "Time", units: ["s"], source_index: null },
              {
                key: "value",
                title: "Synthetic coordinate",
                units: ["1"],
                source_index: null,
              },
            ],
            values: chartValues,
            total_source_records: 2,
            returned_source_records: 2,
            independent_run_count: null,
          },
          plot: {
            caption:
              "Synthetic coordinates for interface verification; no experimental interpretation.",
          },
        },
      },
      {
        id: "unused",
        label: "Uncited record",
        origin: "source_text",
        content: { anchor: ANCHOR },
      },
    ],
    actions: [],
    answer: {
      title: "Source navigation interface fixture",
      claims: [
        {
          statement:
            "This interface fixture links to the retained test-sheet passage.",
          origin: "source_text",
          fact_ids: ["source"],
          limitations: [
            "A resolved passage does not validate a scientific interpretation.",
          ],
        },
        {
          statement:
            "The same source reference keeps its number; the synthetic chart is a separate calculation record.",
          origin: "calculated",
          fact_ids: ["source", "calculated", "missing"],
          limitations: [],
        },
      ],
      withheld_claims: [
        {
          claim: {
            statement:
              "This withheld statement must not create a source reference.",
            fact_ids: ["unused"],
          },
          reasons: ["Synthetic unsupported statement."],
        },
      ],
      limitations: [],
      contradictions: [
        "Synthetic unresolved comparison retained for interface verification.",
      ],
      next_actions: ["Which retained source passage should we inspect next?"],
    },
  };
  await page.route("**/v1/**", async (route) => {
    const url = new URL(route.request().url());
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/v1/capabilities/models")
      return send({ configured: true, reasoning_models: ["gpt-6.1-sol"] });
    if (url.pathname === "/v1/usage/models")
      return send({
        request_limit_usd: 0.1,
        daily_limit_usd: 5,
        committed_or_reserved_usd: "0",
      });
    if (url.pathname === "/v1/research") {
      researchCalls += 1;
      return send(
        { id: researchCalls === 1 ? job : secondJob, status: "queued" },
        202,
      );
    }
    if ([job, secondJob].some((id) => url.pathname === `/v1/workflows/${id}`))
      return send({
        id: job,
        kind: "research",
        status: "succeeded",
        snapshot_id: SNAPSHOT,
        result,
      });
    if (
      [job, secondJob].some(
        (id) => url.pathname === `/v1/workflows/${id}/events`,
      )
    )
      return route.fulfill({
        contentType: "text/event-stream",
        body: ": offline fixture\n\n",
      });
    if (url.pathname === "/v1/evidence/read") {
      sourceReads.push(route.request().postDataJSON());
      return route.continue();
    }
    if (route.request().method() !== "GET")
      return route.abort("blockedbyclient");
    return route.continue();
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) =>
          sessionStorage.setItem("copied-source-reply", text),
      },
    });
  });
  await page.goto("/app/agent");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Exercise source navigation with an offline interface fixture.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Source navigation interface fixture" }),
  ).toBeVisible();
  const exchange = page.getByRole("article", { name: "Research exchange" });
  const sources = exchange.getByRole("region", {
    name: "Sources for this reply",
  });
  await expect(sources.getByRole("listitem")).toHaveCount(3);
  await expect(
    sources.getByText("Uncited record", { exact: true }),
  ).toBeHidden();
  await sources.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nova-chat-sources-footer-desktop.png" });
  const sourceButton = exchange
    .getByRole("button", {
      name: "Source 1: Retained FLEX-007 test-sheet passage",
      exact: true,
    })
    .first();
  await sourceButton.focus();
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("complementary", {
    name: "Exact source inspector",
  });
  await expect(inspector.locator("blockquote")).toContainText("D0  (mm)");
  await expect(inspector.locator("blockquote")).toContainText("1.82");
  await expect(inspector.locator("blockquote")).toContainText("0.68");
  await expect(inspector.getByText(SHA, { exact: true })).toBeVisible();
  await expect(inspector.getByText(/source line 18–19/).first()).toBeVisible();
  expect(sourceReads.length).toBeGreaterThan(0);
  expect(
    sourceReads.every(
      (anchor) => JSON.stringify(anchor) === JSON.stringify(sourceReads[0]),
    ),
  ).toBe(true);
  expect(sourceReads[0]).toEqual(ANCHOR);
  await expect(
    inspector.getByRole("button", { name: "Close source inspector" }),
  ).toBeFocused();
  await inspector.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: "/tmp/nova-chat-sources-desktop.png" });
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await expect(sourceButton).toBeFocused();
  await exchange
    .getByRole("button", {
      name: "Source 2: Synthetic coordinate example",
      exact: true,
    })
    .first()
    .click();
  await expect(
    inspector.getByText(/Original source input to a calculation/),
  ).toBeVisible();
  await expect(inspector.locator("blockquote")).toContainText("1.82");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Inspect exact values", exact: true })
    .click();
  const values = page.getByRole("table").filter({
    has: page.getByRole("columnheader", {
      name: "Point / source locator",
      exact: true,
    }),
  });
  await expect(
    values.getByRole("columnheader", { name: "Time [s]", exact: true }),
  ).toBeVisible();
  await expect(
    values.getByRole("rowheader", { name: "Point 1", exact: true }),
  ).toBeVisible();
  await expect(
    values.getByRole("columnheader", { name: "Source row", exact: true }),
  ).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".app-shell")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await sources
    .getByRole("button", {
      name: "Source 3: Unavailable evidence record (unavailable)",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "This cited evidence record" }),
  ).toContainText("cited evidence record is unavailable");
  await sources
    .getByRole("button", {
      name: "Source 1: Retained FLEX-007 test-sheet passage",
      exact: true,
    })
    .click();
  await expect(inspector.locator("blockquote")).toContainText("1.82");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await inspector.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: "/tmp/nova-chat-sources-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await exchange
    .getByRole("button", { name: "Copy with evidence", exact: true })
    .click();
  const copied = await page.evaluate(() =>
    sessionStorage.getItem("copied-source-reply"),
  );
  expect(copied).toContain("[1] Retained FLEX-007 test-sheet passage");
  expect(copied).toContain(
    "A resolved passage does not validate a scientific interpretation.",
  );
  expect(copied).toContain(
    "Unresolved: Synthetic unresolved comparison retained for interface verification.",
  );
  expect(copied).toContain(
    "Next research step: Which retained source passage should we inspect next?",
  );
  expect(copied).toContain(SHA);
  await sources.scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/nova-chat-sources-footer-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await sourceButton.click();
  await expect(inspector).toBeVisible();
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Repeat the offline source-navigation interface fixture.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Source navigation interface fixture",
      exact: true,
    }),
  ).toHaveCount(2);
  const secondReplySource = page
    .getByRole("article", { name: "Research exchange" })
    .nth(1)
    .getByRole("button", {
      name: "Source 1: Retained FLEX-007 test-sheet passage",
      exact: true,
    })
    .first();
  await secondReplySource.click();
  await expect(inspector).toHaveCount(1);
  await expect(inspector.locator("blockquote")).toContainText("1.82");
  await expect(
    inspector.getByRole("button", { name: "Close source inspector" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(inspector).toBeHidden();
  await expect(secondReplySource).toBeFocused();
  await secondReplySource.click();
  await page.getByRole("button", { name: "New question", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", {
      name: "What would you like to understand?",
      exact: true,
    }),
  ).toBeVisible();
  await expect(inspector).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toBeFocused();
  expect(researchCalls).toBe(2);
});

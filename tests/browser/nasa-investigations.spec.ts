import { expect, test, type BrowserContext } from "@playwright/test";
import {
  isInvestigationId,
  isPsiAccession,
} from "../../apps/web/lib/investigation-identifiers";
import { chatCitations, recordedAnchor } from "../../apps/web/lib/chat-sources";
import { researchDocumentHref } from "../../apps/web/lib/research-history";
import {
  initialFilters,
  parseRunIdentity,
  proposeLanguage,
} from "../../apps/web/lib/discovery-helpers";
import { validRevision } from "../../apps/web/lib/workspace-storage";

const SNAPSHOT = "a".repeat(64);
const SHA = "c".repeat(64);
const ID = "NASA-SOFIE-MIST";
const ANCHOR = {
  snapshot_id: SNAPSHOT,
  source_kind: "nasa",
  accession: ID,
  investigation_version: 1,
  source_sha256: SHA,
  kind: "metadata_field",
  field: "objective",
};
const asset = {
  id: `${ID}:published-table`,
  accession: ID,
  source_kind: "nasa",
  origin: "published_table_transcription",
  investigation_version: 1,
  file_name: "published-conditions.csv",
  file_version: 1,
  sha256: SHA,
  byte_size: 30,
  media_type: "text/csv",
  encoding: "utf-8",
  source_url: "https://ntrs.nasa.gov/citations/20240000001",
  source_provenance: [
    {
      title: "Synthetic NASA table publication",
      source_url: "https://ntrs.nasa.gov/citations/20240000001",
      page: 4,
      table: "Table 1",
    },
  ],
  doi: null,
  license: null,
  kind: "table",
};
function investigation(id = ID) {
  return {
    accession: id,
    source_kind: "nasa",
    origin: "curated_nasa_research",
    record_type: id === "NASA-SOFIE" ? "program" : "investigation",
    parent_accession: id === ID ? "NASA-SOFIE" : null,
    data_status: "reported_conditions",
    title: id === ID ? "Synthetic MIST test record" : "Synthetic SoFIE program",
    acronym: id === ID ? "MIST" : "SoFIE",
    doi: null,
    version: 1,
    description: "Interface fixture only.",
    objective: "Synthetic objective for interface verification.",
    approach: "Synthetic source description.",
    research_area: "Combustion",
    sub_research_area: "Solids",
    license: null,
    source_url: "https://www.nasa.gov/missions/station/iss-research/sofie/",
    source_provenance: [
      {
        title: "Original NASA program description",
        source_url: "https://www.nasa.gov/missions/station/iss-research/sofie/",
      },
    ],
    declared_bytes: 30,
    hardware: "",
    platform: "ISS",
    quality_notes: [],
    assets: id === ID ? [asset] : [],
  };
}

test("NASA catalog identities survive context, saved records and citation boundaries", () => {
  for (const id of [ID, "NASA-SAFFIRE-VI", "PSI-69"])
    expect(isInvestigationId(id)).toBe(true);
  for (const id of [
    "NASA-a",
    "NASA-A",
    "PSI-0",
    "PSI-01",
    "PSI-1000000",
    "NASA-MIST/other",
    "PSI-1\n",
    "NASA-MIST\n",
  ])
    expect(isInvestigationId(id)).toBe(false);
  expect(isPsiAccession(ID)).toBe(false);
  expect(recordedAnchor(ANCHOR)).toEqual(ANCHOR);
  expect(recordedAnchor({ ...ANCHOR, source_kind: "psi" })).toBeNull();
  expect(recordedAnchor({ ...ANCHOR, accession: "PSI-69" })).toBeNull();
  expect(recordedAnchor({ ...ANCHOR, document_id: "20240000001" })).toBeNull();
  expect(
    chatCitations(
      [{ fact_ids: ["source"] }],
      [{ id: "source", origin: "source_text", content: { anchor: ANCHOR } }],
    )[0].anchors,
  ).toEqual([ANCHOR]);
  expect(
    proposeLanguage(`Compare ${ID}`, initialFilters).filters.accession,
  ).toBe(ID);
  expect(parseRunIdentity(JSON.stringify([ID, asset.id, SHA, 2]))[0]).toBe(ID);
  expect(
    validRevision({
      revision: 1,
      saved_at: "2026-11-15T00:00:00Z",
      question: "Compare",
      notes: "",
      snapshot_id: SNAPSHOT,
      investigation_ids: [ID],
    }),
  ).toBe(true);
  expect(
    researchDocumentHref({
      id: "bookmark",
      kind: "bookmark",
      snapshot_id: SNAPSHOT,
      title: "MIST",
      data: { accession: ID },
      revision: 1,
      created_at: "",
      updated_at: "",
      revisions: [],
    }),
  ).toBe(`/app/investigations/${ID}?snapshot=${SNAPSHOT}`);
});

async function mockNasaSources(context: BrowserContext) {
  const requests: {
    path: string;
    snapshot: string | null;
    body: Record<string, unknown> | null;
  }[] = [];
  await context.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.push({
      path: url.pathname,
      snapshot: url.searchParams.get("snapshot_id"),
      body: request.method() === "POST" ? request.postDataJSON() : null,
    });
    const json = (body: unknown) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/v1/snapshots/current")
      return json({ snapshot_id: "b".repeat(64) });
    if (url.pathname === "/v1/investigations")
      return json({
        snapshot_id: SNAPSHOT,
        items: [investigation("NASA-SOFIE"), investigation()],
        total: 2,
      });
    if (url.pathname.startsWith("/v1/investigations/")) {
      const id = url.pathname.split("/")[3];
      return json({
        ...investigation(id),
        snapshot_id: SNAPSHOT,
        child_investigations: id === "NASA-SOFIE" ? [investigation()] : [],
        literature_sources: [
          {
            document_id: "20240000001",
            capture_id: "d".repeat(64),
            title: "Synthetic retained NASA report",
            source_url: asset.source_url,
            source_sha256: SHA,
            page_count: 4,
            status: "text_available",
          },
        ],
        source_fields: {
          objective: {
            value: "Synthetic objective for interface verification.",
            anchor: { ...ANCHOR, accession: id },
            scientific_role: "objective",
          },
        },
        coverage: {
          acquired_assets: id === ID ? 1 : 0,
          row_roles: {},
          model_readiness: "unknown",
          calibration_status: "unknown",
        },
      });
    }
    if (url.pathname === "/v1/evidence/read")
      return json({
        text: "Synthetic exact passage.",
        anchor: request.postDataJSON(),
        status: "resolved",
        source_origin: "curated_nasa_research",
        upstream_sources: [
          {
            label: "Original NASA research page",
            source_url: investigation().source_url,
          },
        ],
      });
    if (url.pathname === `/v1/assets/${SHA}/records`)
      return json({
        asset,
        snapshot_id: SNAPSHOT,
        adapter_id: "published-table-v1",
        status: "interpreted",
        headers: ["Pressure (kPa)"],
        records: [
          {
            source_row: 2,
            line_end: 2,
            row_kind: "condition_record",
            raw_cells: ["100"],
            fields: [
              {
                column_index: 0,
                raw_text: "100",
                canonical_value: 100000,
                canonical_unit: "Pa",
                original_unit: "kPa",
                quantity_kind: "pressure",
                status: "normalized",
              },
            ],
          },
        ],
        source_record_count: 1,
        independent_run_count: null,
        empty_record_count: 0,
        limitations: [],
        refusals: [],
        total_records: 1,
        row_kind_counts: { condition_record: 1 },
      });
    if (url.pathname === "/v1/queries")
      return json({
        snapshot_id: SNAPSHOT,
        asset,
        columns: [
          { key: "value", source_index: 0, title: "Pressure", units: ["Pa"] },
        ],
        values: [{ source_row: 2, value: 100000 }],
        total_source_records: 1,
        returned_source_records: 1,
        independent_run_count: null,
        limitations: [],
      });
    if (url.pathname === "/v1/capabilities/models")
      return json({ configured: false });
    return json({ items: [] });
  });
  return requests;
}

for (const appearance of ["desktop light", "mobile dark"]) {
  test(`NASA program studies, exact sources and comparison preserve the selected snapshot (${appearance})`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize(
      appearance === "mobile dark"
        ? { width: 390, height: 844 }
        : { width: 1440, height: 1000 },
    );
    await page.emulateMedia({
      colorScheme: appearance === "mobile dark" ? "dark" : "light",
      reducedMotion: "reduce",
    });
    const requests = await mockNasaSources(context);
    await page.goto(`/app/investigations/NASA-SOFIE?snapshot=${SNAPSHOT}`);
    const studies = page.getByRole("region", {
      name: "Studies in this program",
    });
    const child = studies.getByRole("link", { name: "MIST" });
    await expect(child).toHaveAttribute(
      "href",
      `/app/investigations/${ID}?snapshot=${SNAPSHOT}`,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/nova-nasa-program-${appearance.replace(" ", "-")}.png`,
      fullPage: true,
    });
    await child.click();
    await expect(
      page.getByRole("heading", { name: "MIST", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Explore the research program" }),
    ).toHaveAttribute(
      "href",
      `/app/investigations/NASA-SOFIE?snapshot=${SNAPSHOT}`,
    );
    await page
      .getByRole("button", { name: "Inspect exact source" })
      .first()
      .click();
    const inspector = page.getByRole("complementary", {
      name: "Exact source inspector",
    });
    await expect(inspector.getByText("Synthetic exact passage.")).toBeVisible();
    await expect(
      inspector.getByRole("link", { name: "Original NASA research page" }),
    ).toHaveAttribute("href", investigation().source_url);
    await expect(
      page.getByRole("button", { name: "Close source inspector" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Inspect exact source" }).first(),
    ).toBeFocused();
    await page.getByRole("tab", { name: "Sources", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "Original NASA program description" }),
    ).toHaveAttribute("href", investigation().source_url);
    await page
      .getByRole("button", { name: "Read retained page 1", exact: true })
      .click();
    await expect(inspector.getByText("Synthetic exact passage.")).toBeVisible();
    expect(
      requests.filter((item) => item.path === "/v1/evidence/read").at(-1)?.body,
    ).toEqual({
      snapshot_id: SNAPSHOT,
      source_kind: "ntrs",
      document_id: "20240000001",
      capture_id: "d".repeat(64),
      source_sha256: SHA,
      kind: "document_page",
      page: 1,
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Compare with another investigation" })
      .click();
    await expect(page).toHaveURL(new RegExp(`ids=${ID}.*snapshot=${SNAPSHOT}`));
    await expect(
      page.getByRole("checkbox", { name: /MIST/ }).first(),
    ).toBeChecked();
    expect(
      requests
        .filter((item) => item.path.includes("/investigations/"))
        .every((item) => item.snapshot === SNAPSHOT),
    ).toBe(true);
  });
}

test("NASA data handoff opens and queries a published transcription without a saved-analysis detour", async ({
  page,
  context,
}) => {
  const requests = await mockNasaSources(context);
  await page.goto(`/app/lab/data/${ID}?snapshot=${SNAPSHOT}`);
  await expect(
    page.getByRole("combobox", { name: "Investigation", exact: true }),
  ).toHaveValue(ID);
  await expect(
    page.getByRole("heading", { name: asset.file_name }),
  ).toBeVisible();
  await expect(
    page.getByText(/Table transcribed from a NASA publication/),
  ).toBeVisible();
  await page
    .getByText("Publication and transcription details", { exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Synthetic NASA table publication" }),
  ).toHaveAttribute("href", asset.source_url);
  await expect(
    page.getByRole("checkbox", { name: "Pressure (kPa)" }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Apply selection", exact: true })
    .click();
  await expect
    .poll(() => requests.filter((item) => item.path === "/v1/queries").length)
    .toBe(1);
  expect(
    requests.find((item) => item.path === "/v1/queries")?.body,
  ).toMatchObject({ snapshot_id: SNAPSHOT, asset_sha256: SHA, columns: [0] });
  await expect(
    page.getByText("This saved dataset could not be opened."),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save analysis", exact: true })
    .click();
  await expect(
    page.getByText("Analysis saved. Reopen it from Your research."),
  ).toBeVisible();
  await page.goto(`/app/lab/data?snapshot=${SNAPSHOT}`);
  await expect(
    page.getByRole("combobox", { name: "Investigation", exact: true }),
  ).toHaveValue(ID);
  await expect(
    page.getByRole("heading", { name: asset.file_name }),
  ).toBeVisible();
});

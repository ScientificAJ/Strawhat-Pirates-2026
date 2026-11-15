import type { APIRequestContext, Page } from "@playwright/test";

/** Use real catalog records and source anchors while exercising the new endpoint offline. */
export async function mockFireSafetyRankings(
  page: Page,
  request: APIRequestContext,
) {
  const accessions = [
    "PSI-25",
    "PSI-26",
    "PSI-101",
    "PSI-102",
    "PSI-69",
    "PSI-68",
  ];
  const dossiers = await Promise.all(
    accessions.map(async (accession) => {
      const response = await request.get(
        `/v1/investigations/${accession}/dossier`,
      );
      if (!response.ok())
        throw new Error(`Could not load ${accession} fixture`);
      return response.json();
    }),
  );
  const byId = new Map(dossiers.map((dossier) => [dossier.accession, dossier]));
  const areas: Record<string, string[]> = {
    prevention: ["PSI-25", "PSI-26"],
    detection: ["PSI-101", "PSI-102"],
    suppression: ["PSI-69", "PSI-68", "PSI-25"],
  };
  await page.route("**/v1/discovery/fire-safety-ranking?*", (route) => {
    const area = new URL(route.request().url()).searchParams.get("area") ?? "";
    const items = (areas[area] ?? []).map((accession, index) => {
      const dossier = byId.get(accession);
      return {
        rank: index + 1,
        investigation: dossier,
        relevance: index < 2 ? "direct" : "related",
        data_availability: index === 0 ? "source_table" : "other_assets",
        evidence: {
          quote: dossier.source_fields.objective.value.slice(0, 160),
          anchor: dossier.source_fields.objective.anchor,
        },
      };
    });
    return route.fulfill({
      json: { snapshot_id: dossiers[0].snapshot_id, area, criteria: [], items },
    });
  });
}

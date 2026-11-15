import { expect, test } from "@playwright/test";

for (const legacy of [false, true]) {
  test(`${legacy ? "older saved evidence" : "prepared source visual"} shows the BASS-II image and a useful reply`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize(
      legacy ? { width: 390, height: 844 } : { width: 1440, height: 1100 },
    );
    const snapshot = (await (await request.get("/v1/snapshots/current")).json())
      .snapshot_id;
    const dossier = await (
      await request.get(
        `/v1/investigations/PSI-25/dossier?snapshot_id=${snapshot}`,
      )
    ).json();
    const asset = dossier.assets.find(
      (item: { media_type: string }) => item.media_type === "image/jpeg",
    );
    const visual = {
      artifact_type: "source_media_visualization",
      status: "prepared",
      title: "BASS-II flame image",
      snapshot_id: snapshot,
      asset,
      media_origin: "original_source_bytes",
      example_role: "repository_representative_image",
    };
    const anchor = {
      snapshot_id: snapshot,
      accession: "PSI-25",
      investigation_version: asset.investigation_version,
      source_kind: "psi",
      source_sha256: asset.sha256,
      asset_id: asset.id,
      kind: "media_frame",
      frame: 0,
    };
    const note =
      "The image is representative; no individual test is identified.";
    const fact = legacy
      ? {
          id: "dossier",
          label: "Investigation dossier",
          origin: "source_metadata",
          content: dossier,
          sources: [dossier.source_fields.objective.anchor],
        }
      : {
          id: "visual",
          label: "BASS-II source image",
          origin: "source_media",
          content: visual,
          sources: [anchor],
        };
    const claims = legacy
      ? []
      : [
          {
            origin: "source_summary",
            statement: "Here is the BASS-II flame image.",
            fact_ids: [fact.id],
            limitations: [note],
          },
        ];
    const result = {
      status: legacy ? "incomplete" : "completed",
      cost_usd: "0",
      facts: [fact],
      answer: {
        title: legacy ? "" : "BASS-II flame image",
        claims,
        limitations: [note, note],
        next_actions: [],
        contradictions: [],
      },
    };
    const job = "10000000-0000-4000-8000-000000000087";
    let submissions = 0;
    await page.route("**/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const send = (value: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify(value),
        });
      if (path === "/v1/capabilities/models") return send({ configured: true });
      if (path === "/v1/usage/models") return send({ request_limit_usd: 0.1 });
      if (path === "/v1/research") {
        submissions++;
        return send({ id: job, status: "queued" }, 202);
      }
      if (path === `/v1/workflows/${job}`)
        return send({
          id: job,
          kind: "research",
          status: "succeeded",
          snapshot_id: snapshot,
          result,
        });
      if (path === `/v1/workflows/${job}/events`)
        return route.fulfill({
          contentType: "text/event-stream",
          body: ": done\n\n",
        });
      return route.continue();
    });
    await page.goto("/app/agent");
    const composer = page.getByRole("textbox", {
      name: "Research question",
      exact: true,
    });
    await composer.fill("create visualization of fire from BASS II");
    await page.getByRole("button", { name: "Send", exact: true }).click();
    const exchange = page.getByRole("article", { name: "Research exchange" });
    const image = exchange.getByRole("img").first();
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBe(1200);
    await expect(exchange).not.toContainText("couldn't finish this answer");
    await expect(exchange).not.toContainText(
      "Research stopped before a complete answer",
    );
    await expect(exchange.getByText(note, { exact: true })).toHaveCount(1);
    await expect(exchange.getByText(note, { exact: true })).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: legacy
        ? "/tmp/nova-bass-recovered-mobile.png"
        : "/tmp/nova-bass-visualization-desktop.png",
      fullPage: false,
    });
    if (legacy) {
      await expect(exchange).toContainText(
        dossier.description.split(/\n\s*\n/)[0].slice(0, 80),
      );
      await exchange
        .getByRole("button", { name: "Try this question again" })
        .click();
      await expect(composer).toHaveValue(
        "create visualization of fire from BASS II",
      );
      await expect(composer).toBeFocused();
      expect(submissions).toBe(1);
    } else {
      await exchange
        .getByRole("button", {
          name: "Source 1: BASS-II source image",
          exact: true,
        })
        .first()
        .click();
      const inspector = page.getByRole("complementary", {
        name: "Exact source inspector",
      });
      await expect(inspector.getByRole("img")).toBeVisible();
      await expect(inspector).toContainText(asset.sha256);
    }
  });
}

test("research selections from separate tabs save without a draft-conflict banner", async ({
  page,
  context,
}) => {
  await page.goto("/app/investigations/NASA-SAFFIRE-VI?section=runs");
  await expect(
    page.getByRole("combobox", { name: "Dataset", exact: true }),
  ).toBeVisible();
  const other = await context.newPage();
  await other.goto("/app/investigations/PSI-25");
  await expect(
    other.getByRole("heading", { name: "BASS-II", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Dataset", exact: true })
    .selectOption({ label: "Calorimetry, temperature and gas results" });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string | undefined>((resolve, reject) => {
            const opening = indexedDB.open("nova-ember-workspace", 2);
            opening.onerror = () => reject(new Error("Storage unavailable"));
            opening.onsuccess = () => {
              const db = opening.result;
              const tx = db.transaction("documents", "readonly");
              const selected = tx
                .objectStore("documents")
                .get("active-research-context");
              tx.oncomplete = () => {
                db.close();
                resolve(
                  selected.result?.data.context.selected_sources?.[0]
                    ?.asset_sha256,
                );
              };
              tx.onerror = () => {
                db.close();
                reject(new Error("Selection could not be read"));
              };
            };
          }),
      ),
    )
    .toBe("e4efb205948a5b2aabe591709adc8a77129af1730d9130ee737d275ae93d907a");
  await expect(page.getByText(/This item changed in another tab/)).toBeHidden();
  await expect(
    other.getByText(/This item changed in another tab/),
  ).toBeHidden();
  await other.close();
});

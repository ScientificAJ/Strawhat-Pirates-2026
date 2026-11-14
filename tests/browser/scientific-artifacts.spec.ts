import { expect, test } from "@playwright/test";

test("a saved uncertainty artifact displays its dimensional outputs and interpretation", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Understand fire/ }),
  ).toBeVisible();
  const snapshot = await page.request
    .get("/v1/snapshots/current")
    .then((response) => response.json());
  const data = {
    result: {
      method_id: "first-order-correlated-uncertainty-v1",
      status: "calculated",
      context: { input_origin: "synthetic_reference" },
      request: { output_units: ["Pa", "K"] },
      output_standard_uncertainty: [2, 3],
      output_covariance: [
        [4, 0],
        [0, 9],
      ],
      interpretation:
        "Synthetic dimensional reference, not measured confidence.",
      limitations: [
        "No measurement precision is established by this interface fixture.",
      ],
    },
    limitations: ["Keep the outer source qualification visible."],
  };
  const stamp = new Date().toISOString();
  await page.evaluate(
    async ({ data, snapshot, stamp }) =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onerror = () => reject(new Error("Storage unavailable"));
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction("documents", "readwrite");
          tx.objectStore("documents").put({
            id: "dimensional-reference",
            kind: "analysis",
            title: "Offline dimensional reference",
            snapshot_id: snapshot,
            data,
            revision: 1,
            created_at: stamp,
            updated_at: stamp,
            revisions: [
              {
                revision: 1,
                saved_at: stamp,
                title: "Offline dimensional reference",
                snapshot_id: snapshot,
                data,
              },
            ],
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    { data, snapshot: snapshot.snapshot_id, stamp },
  );
  await page.goto("/app/cases/new");
  await page
    .getByText("Prepare a research report or assess applicability", {
      exact: true,
    })
    .click();
  await page
    .getByRole("combobox", { name: /Saved research item/ })
    .selectOption("dimensional-reference");
  await page
    .getByRole("button", { name: "Attach revision", exact: true })
    .click();
  await page
    .getByText("Inspect frozen content and source identity", { exact: true })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: /^2 Pa$/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: /^3 K$/ }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Synthetic dimensional reference, not measured confidence.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Keep the outer source qualification visible.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Entry \(i, j\) has the product of output i and output j units/,
    ),
  ).toBeVisible();
});

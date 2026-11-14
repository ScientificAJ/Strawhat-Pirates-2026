import { expect, test } from "@playwright/test";

test("system appearance follows device changes while an explicit theme survives reload", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/app/settings");
  const appearance = page.getByRole("combobox", {
    name: "Appearance",
    exact: true,
  });
  const shell = page.locator(".app-shell");
  const save = page.getByRole("button", {
    name: "Save preferences",
    exact: true,
  });
  await expect(appearance).toHaveValue("system");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(shell).toHaveAttribute("data-theme", "light");

  await appearance.selectOption("dark");
  await save.click();
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(appearance).toHaveValue("dark");
  await expect(shell).toHaveAttribute("data-theme", "dark");

  await appearance.selectOption("system");
  await save.click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(appearance).toHaveValue("system");
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(shell).toHaveAttribute("data-theme", "light");
});

for (const legacyTheme of ["light", "dark"] as const) {
  test(`legacy saved ${legacyTheme} appearance keeps its explicit choice`, async ({
    page,
  }) => {
    const deviceTheme = legacyTheme === "light" ? "dark" : "light";
    await page.emulateMedia({ colorScheme: deviceTheme });
    await page.goto("/app/settings");
    await expect(
      page.getByRole("heading", { name: "Preferences & backups", exact: true }),
    ).toBeVisible();
    await page.evaluate(
      (theme) =>
        new Promise<void>((resolve, reject) => {
          const opening = indexedDB.open("nova-ember-workspace", 2);
          opening.onerror = () => reject(new Error("Storage unavailable"));
          opening.onsuccess = () => {
            const db = opening.result;
            const transaction = db.transaction("preferences", "readwrite");
            const store = transaction.objectStore("preferences");
            store.delete("research");
            store.put(theme, "theme");
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onerror = transaction.onabort = () => {
              db.close();
              reject(new Error("Legacy appearance fixture could not be saved"));
            };
          };
        }),
      legacyTheme,
    );
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Appearance", exact: true }),
    ).toHaveValue(legacyTheme);
    await expect(page.locator(".app-shell")).toHaveAttribute(
      "data-theme",
      legacyTheme,
    );
  });
}

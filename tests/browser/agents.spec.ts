import { expect, test, type Page } from "@playwright/test";
import type { CustomAgentProfile } from "../../apps/web/lib/agent-profiles";

type StoredDocument = {
  id: string;
  kind: string;
  title: string;
  revision: number;
  data: {
    profile?: CustomAgentProfile;
    agent?: { frozen: { profile: CustomAgentProfile } };
    turns?: { status: string }[];
    draft_provenance?: {
      model: string;
      prompt_version: string;
      description: string;
      cost_usd: string;
    };
  };
};

async function savedDocuments(page: Page): Promise<StoredDocument[]> {
  return page.evaluate(
    () =>
      new Promise<StoredDocument[]>((resolve, reject) => {
        const opening = indexedDB.open("nova-ember-workspace", 2);
        opening.onerror = () =>
          reject(new Error("Workspace storage unavailable"));
        opening.onsuccess = () => {
          const db = opening.result;
          const transaction = db.transaction("documents", "readonly");
          const reading = transaction.objectStore("documents").getAll();
          transaction.oncomplete = () => {
            db.close();
            resolve(reading.result as StoredDocument[]);
          };
          transaction.onerror = () => {
            db.close();
            reject(new Error("Saved documents could not be read"));
          };
        };
      }),
  );
}

test("Agents keep reviewed skills and frozen chats separate from core research, and drafts require Save", async ({
  page,
}) => {
  const requests: Record<string, unknown>[] = [];
  const draftRequests: Record<string, unknown>[] = [];
  const blockedPosts: string[] = [];
  const jobs = new Set<string>();
  let releaseDraft!: () => void;
  const draftReady = new Promise<void>((resolve) => {
    releaseDraft = resolve;
  });
  const skill = {
    name: "Passage review checklist",
    instructions:
      "Keep exact source locations and distinguish reported text from interpretation.",
  };
  const profile: CustomAgentProfile = {
    name: "Interface evidence reviewer",
    description: "Synthetic role for browser workflow verification.",
    instructions:
      "Inspect the requested evidence and ask a targeted question when its scope is unclear.",
    skills: [skill],
    capabilities: ["sources", "analysis"],
  };
  const draftProfile: CustomAgentProfile = {
    name: "Prepared review role",
    description: "An editable structured interface fixture.",
    instructions:
      "Review source statements and retain their units, conditions and limitations.",
    skills: [],
    capabilities: ["sources"],
  };
  const draftDescription =
    "Prepare a source-review role that asks for exact passages and preserves uncertainties.";
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
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
    if (url.pathname === "/v1/agents/draft" && request.method() === "POST") {
      draftRequests.push(request.postDataJSON());
      await draftReady;
      return send({
        schema_version: 1,
        status: "draft",
        kind: "profile",
        profile: draftProfile,
        skill: null,
        model: "offline-structured-draft-fixture",
        prompt_version: "agent-draft-test-v1",
        cost_usd: "0",
        provider_calls: [],
        limitations: [
          "Offline structured response for interface verification; no provider call.",
        ],
      });
    }
    if (url.pathname === "/v1/research" && request.method() === "POST") {
      requests.push(request.postDataJSON());
      const id = `20000000-0000-4000-8000-${String(requests.length).padStart(12, "0")}`;
      jobs.add(id);
      return send({ id, status: "queued" }, 202);
    }
    const workflow = /^\/v1\/workflows\/([^/]+)(\/events)?$/.exec(url.pathname);
    if (workflow && jobs.has(workflow[1])) {
      if (workflow[2])
        return route.fulfill({
          contentType: "text/event-stream",
          body: ": offline interface fixture\n\n",
        });
      return send({
        id: workflow[1],
        kind: "research",
        status: "succeeded",
        result: {
          status: "completed",
          model: "offline-agent-interface-fixture",
          cost_usd: "0",
          facts: [],
          actions: [],
          answer: {
            title: "Offline agent configuration check",
            claims: [
              {
                statement:
                  "This browser fixture checked saved configuration transport.",
                origin: "model_interpretation",
                fact_ids: [],
                limitations: [
                  "No scientific inference or provider call was performed.",
                ],
              },
            ],
            limitations: [],
            contradictions: [],
            next_actions: [],
            withheld_claims: [],
          },
        },
      });
    }
    if (request.method() !== "GET") {
      blockedPosts.push(url.pathname);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });

  const catalogResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/v1/agents/catalog",
  );
  await page.goto("/app/agents");
  expect((await catalogResponse).ok()).toBe(true);
  const library = page.getByRole("complementary", {
    name: "Agent library",
    exact: true,
  });
  for (const name of [
    "Evidence investigator",
    "Quantitative analyst",
    "Scientific tutor",
  ]) {
    await expect(
      library.getByRole("button", { name: new RegExp(`^${name}\\b`) }),
    ).toBeVisible();
  }

  await page
    .getByRole("button", { name: "Reusable skills", exact: true })
    .click();
  const skillEditor = page.getByRole("region", {
    name: "Skill editor",
    exact: true,
  });
  await skillEditor
    .getByRole("textbox", { name: "Skill name", exact: true })
    .fill(skill.name);
  await skillEditor
    .getByRole("textbox", { name: "Skill instructions", exact: true })
    .fill(skill.instructions);
  await skillEditor
    .getByRole("button", { name: "Save skill", exact: true })
    .click();
  await expect(
    page.getByText(`Saved ${skill.name} in your reusable skill library.`, {
      exact: true,
    }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Agent library", exact: true })
    .click();
  await page.getByRole("button", { name: "New agent", exact: true }).click();
  const editor = page.getByRole("region", {
    name: "Agent editor",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Agent name", exact: true })
    .fill(profile.name);
  await editor
    .getByRole("textbox", { name: "Short description", exact: true })
    .fill(profile.description);
  await editor
    .getByRole("textbox", { name: "Agent instructions", exact: true })
    .fill(profile.instructions);
  await editor
    .getByRole("checkbox", { name: /^Calculations and comparison\b/ })
    .check();
  await editor
    .getByRole("combobox", { name: "Reusable skill", exact: true })
    .selectOption({ label: skill.name });
  await editor
    .getByRole("button", { name: "Attach skill", exact: true })
    .click();
  await expect(
    editor.getByRole("textbox", { name: "Skill instructions", exact: true }),
  ).toHaveValue(skill.instructions);
  await editor.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(
    page.getByText(`Saved ${profile.name}, revision 1, on this device.`, {
      exact: true,
    }),
  ).toBeVisible();
  await editor.getByRole("button", { name: "Use agent", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: profile.name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Live voice", exact: true }),
  ).toBeHidden();
  await page
    .getByRole("textbox", { name: "Session title", exact: true })
    .fill("Frozen role conversation");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Check the saved role configuration without a scientific inference.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].agent_profile).toEqual(profile);
  await expect
    .poll(
      async () =>
        (await savedDocuments(page))
          .find(
            (document) =>
              document.kind === "agent_session" &&
              document.title === "Frozen role conversation",
          )
          ?.data.turns?.at(-1)?.status,
    )
    .toBe("succeeded");

  await page.getByRole("button", { name: "Agents", exact: true }).click();
  await library
    .getByRole("button", { name: new RegExp(`^${profile.name}\\b`) })
    .click();
  await editor
    .getByRole("textbox", { name: "Agent instructions", exact: true })
    .fill(
      "This later library revision must not replace an existing chat's role.",
    );
  await editor
    .getByRole("textbox", { name: "Skill instructions", exact: true })
    .fill(
      "This later attachment edit must not replace the saved chat's skill.",
    );
  await editor.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(
    page.getByText(`Saved ${profile.name}, revision 2, on this device.`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Frozen role conversation", exact: true })
    .click();
  await page
    .getByText("Agent configuration for this conversation", { exact: true })
    .click();
  await expect(
    page.getByText(profile.instructions, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(skill.instructions, { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill(
      "Check that this resumed chat still uses its original frozen instructions.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].agent_profile).toEqual(profile);
  await expect
    .poll(
      async () =>
        (await savedDocuments(page))
          .find((document) => document.kind === "agent_session")
          ?.data.turns?.at(-1)?.status,
    )
    .toBe("succeeded");

  await page.goto("/app/agent");
  await expect(
    page.getByRole("heading", { name: "Research Studio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Session title", exact: true }),
  ).toHaveValue("Untitled research");
  await expect(
    page.getByText("Agent configuration for this conversation", {
      exact: true,
    }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Saved research sessions", exact: true })
      .getByRole("button", { name: "Frozen role conversation", exact: true }),
  ).toBeHidden();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Check the regular core research request without a custom role.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  expect(requests[2]).not.toHaveProperty("agent_profile");
  await expect
    .poll(
      async () =>
        (await savedDocuments(page))
          .find((document) => document.kind === "studio_session")
          ?.data.turns?.at(-1)?.status,
    )
    .toBe("succeeded");
  const sessions = (await savedDocuments(page)).filter((document) =>
    ["agent_session", "studio_session"].includes(document.kind),
  );
  expect(sessions).toHaveLength(2);
  expect(
    sessions.find((document) => document.kind === "agent_session")?.data.agent
      ?.frozen.profile,
  ).toEqual(profile);
  expect(
    sessions.find((document) => document.kind === "studio_session")?.data.agent,
  ).toBeUndefined();

  await page.goto("/app/agents");
  await page
    .getByRole("button", { name: "Describe the agent you need", exact: true })
    .click();
  await page
    .getByRole("textbox", {
      name: "Agent description for drafting",
      exact: true,
    })
    .fill(draftDescription);
  await page
    .getByRole("button", { name: "Prepare draft", exact: true })
    .click();
  await expect.poll(() => draftRequests.length).toBe(1);
  await expect(
    page.getByRole("button", { name: "Preparing draft…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "New agent", exact: true }),
  ).toBeDisabled();
  expect(draftRequests[0]).toEqual({
    description: draftDescription,
    kind: "profile",
  });
  releaseDraft();
  await expect(
    editor.getByRole("textbox", { name: "Agent name", exact: true }),
  ).toHaveValue(draftProfile.name);
  await expect(
    page.getByText(/Draft ready to review\. Estimated model cost/),
  ).toBeVisible();
  await expect(
    editor.getByRole("button", { name: "Use agent", exact: true }),
  ).toBeDisabled();
  expect(
    (await savedDocuments(page)).filter(
      (document) => document.kind === "agent_profile",
    ),
  ).toHaveLength(1);
  const reviewedName = "Reviewed draft reviewer";
  await editor
    .getByRole("textbox", { name: "Agent name", exact: true })
    .fill(reviewedName);
  await editor
    .getByRole("textbox", { name: "Agent instructions", exact: true })
    .fill(
      `${draftProfile.instructions}\nAsk before broadening an unclear evidence scope.`,
    );
  await editor.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(
    page.getByText(`Saved ${reviewedName}, revision 1, on this device.`, {
      exact: true,
    }),
  ).toBeVisible();
  const profiles = (await savedDocuments(page)).filter(
    (document) => document.kind === "agent_profile",
  );
  expect(profiles).toHaveLength(2);
  expect(
    profiles.find((document) => document.title === reviewedName)?.data,
  ).toMatchObject({
    profile: {
      ...draftProfile,
      name: reviewedName,
      instructions: `${draftProfile.instructions}\nAsk before broadening an unclear evidence scope.`,
    },
    draft_provenance: {
      model: "offline-structured-draft-fixture",
      prompt_version: "agent-draft-test-v1",
      description: draftDescription,
      cost_usd: "0",
    },
  });
  expect(blockedPosts).toEqual([]);
  expect(draftRequests).toHaveLength(1);
});

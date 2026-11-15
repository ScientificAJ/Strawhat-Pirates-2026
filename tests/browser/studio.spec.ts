import { expect, test, type Page } from "@playwright/test";

const SNAPSHOT = "a".repeat(64);
const JOB = "10000000-0000-4000-8000-000000000001";
const CHILD = "10000000-0000-4000-8000-000000000002";
const VOICE = "10000000-0000-4000-8000-000000000003";

async function offlineStudio(page: Page) {
  const state = {
    requests: [] as Record<string, unknown>[],
    controls: [] as Record<string, unknown>[],
    done: false,
    canceled: false,
    child: false,
    approved: false,
    voiceStarted: false,
    voiceClosed: false,
    voiceContext: {} as Record<string, unknown>,
  };
  await page.route("**/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const send = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (url.pathname === "/v1/snapshots/current")
      return send({ snapshot_id: SNAPSHOT });
    if (url.pathname === "/v1/investigations")
      return send({
        snapshot_id: SNAPSHOT,
        total: 0,
        limit: 100,
        offset: 0,
        items: [],
      });
    if (url.pathname === "/v1/capabilities/models")
      return send({
        configured: true,
        reasoning_models: ["gpt-6.1-sol", "gpt-6.1-terra"],
      });
    if (url.pathname === "/v1/usage/models")
      return send({
        request_limit_usd: 0.1,
        daily_limit_usd: 5,
        committed_or_reserved_usd: "0",
      });
    if (url.pathname === "/v1/research") {
      state.requests.push(request.postDataJSON());
      return send({ id: JOB, status: "queued" }, 202);
    }
    if (url.pathname === `/v1/workflows/${JOB}/events`)
      return route.fulfill({
        contentType: "text/event-stream",
        body:
          url.searchParams.get("after") === "0"
            ? 'id: 1\nevent: tool_started\ndata: {"sequence":1,"event_type":"tool_started","payload":{"tool":"inspect_dataset"}}\n\n'
            : ": no new events\n\n",
      });
    if (url.pathname === `/v1/workflows/${JOB}/cancel`) {
      state.canceled = true;
      return send({ id: JOB, status: "canceled" });
    }
    if (url.pathname === `/v1/workflows/${JOB}`)
      return send({
        id: JOB,
        kind: "research",
        status: state.canceled
          ? "canceled"
          : state.done
            ? "succeeded"
            : "running",
        snapshot_id: SNAPSHOT,
        result: state.done
          ? {
              status: "completed",
              model: "offline-interface-fixture",
              cost_usd: "0.001",
              facts: [
                {
                  id: "offline-evidence",
                  origin: "deterministic_calculation",
                  label: "Offline reference table",
                  sources: [],
                  limitations: [
                    "Synthetic browser-test fixture, not NASA measurements.",
                  ],
                  content: {
                    columns: [
                      {
                        key: "temperature",
                        title: "Reference temperature",
                        units: ["K"],
                      },
                    ],
                    values: [{ temperature: 300 }, { temperature: 310 }],
                  },
                },
                ...(state.child
                  ? [
                      {
                        id: "offline-code",
                        origin: "model_proposal",
                        label: "Proposed reference code",
                        sources: [],
                        limitations: ["Offline interface fixture."],
                        content: {
                          proposal: {
                            code: "print('reference')",
                            language: "python",
                            purpose: "Inspect the selected synthetic input.",
                          },
                          operation: { id: CHILD, status: "waiting_approval" },
                          frozen_inputs: [],
                        },
                      },
                    ]
                  : []),
              ],
              actions: [],
              answer: {
                title: "Two records in the offline reference",
                claims: [
                  {
                    statement:
                      "The offline reference contains 2 source records.",
                    origin: "calculated",
                    fact_ids: ["offline-evidence"],
                    limitations: [
                      "These are synthetic values for interface verification.",
                    ],
                  },
                ],
                contradictions: [],
                next_actions: [],
                limitations: [
                  "A record count does not establish independent runs.",
                ],
                withheld_claims: [],
              },
            }
          : null,
      });
    if (url.pathname === `/v1/workflows/${CHILD}/approve`) {
      state.approved = true;
      state.controls.push(request.postDataJSON());
      return send({ id: CHILD, status: "queued" });
    }
    if (url.pathname === `/v1/workflows/${CHILD}`)
      return send({
        id: CHILD,
        kind: "execute_code",
        status: state.approved ? "succeeded" : "waiting_approval",
        approval_revision: 0,
        approval: {
          inputs_sha256: "b".repeat(64),
          inputs: { code: "print('reference')", profile: "standard" },
        },
      });
    if (url.pathname === "/v1/voice/sessions" && request.method() === "POST") {
      const body = request.postDataJSON();
      state.voiceStarted = true;
      state.voiceContext = body.context;
      state.controls.push(body);
      return send({
        id: VOICE,
        status: "negotiating",
        sdp: "v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\n",
        context_version: body.context.context_version,
      });
    }
    if (url.pathname === `/v1/voice/sessions/${VOICE}/controls`) {
      const body = request.postDataJSON();
      state.controls.push(body);
      if (["end", "revoke_microphone"].includes(body.action))
        state.voiceClosed = true;
      return send({ action: body.action, local_actions: [] });
    }
    if (url.pathname === `/v1/voice/sessions/${VOICE}`)
      return send({
        id: VOICE,
        status: state.voiceClosed ? "closed" : "active",
        context_version: state.voiceContext.context_version,
        workspace: state.voiceContext,
        expires_at: new Date(Date.now() + 90000).toISOString(),
        transcript: [
          {
            sequence: 1,
            speaker: "user",
            text: "Review the selected oxygen value before using it.",
            context_version: state.voiceContext.context_version,
          },
        ],
        tasks: {},
        finalization_confirmed: state.voiceClosed,
        final_usage_confirmed: state.voiceClosed,
        close_requested: state.voiceClosed,
      });
    if (request.method() !== "GET") return route.abort("blockedbyclient");
    return send({ items: [], sessions: [] });
  });
  return state;
}

test("Studio retains named drafts, forks without overwriting, and renders checked artifacts", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.goto("/app/agent");
  await page
    .getByText("Conversation details", { exact: false })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Conversation title" })
    .fill("Pressure evidence notebook");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Inspect the selected source records.");
  await expect(
    page.getByText("Saved automatically", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByText("Conversation details", { exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Conversation title" }),
  ).toHaveValue("Pressure evidence notebook");
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toHaveValue("Inspect the selected source records.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.requests.length).toBe(1);
  state.done = true;
  await expect(
    page.getByRole("heading", { name: "Two records in the offline reference" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Source 1: Offline reference table",
      exact: true,
    })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline reference table" }),
  ).toBeVisible();
  await page.getByText("Answer details", { exact: true }).click();
  await expect(
    page.getByText("A record count does not establish independent runs.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Make a copy", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Conversation title" }),
  ).toHaveValue("Pressure evidence notebook · copy");
  await expect(page.getByText(/This is a separate copy/)).toBeVisible();
  await expect(
    page.getByText(/The current page has a different selection/),
  ).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/nova-ember-studio-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/nova-ember-studio-mobile.png",
    fullPage: true,
  });
});

test("Contextual draft moves to Studio and keyboard range changes the actual split", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.setViewportSize({ width: 1500, height: 950 });
  await page.goto("/app/cases");
  await page
    .getByRole("button", { name: "Ask Nova Ember", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Contextual research assistant",
  });
  await panel
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Keep this unsent source question.");
  await panel
    .getByRole("button", { name: "Open full conversation", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/agent\/[a-f0-9-]+$/);
  await expect(
    page.getByRole("textbox", { name: "Research question", exact: true }),
  ).toHaveValue("Keep this unsent source question.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  state.done = true;
  await expect(
    page.getByRole("heading", { name: "Two records in the offline reference" }),
  ).toBeVisible();
  await page
    .getByText("Adjust answer and evidence layout", { exact: true })
    .click();
  const range = page.getByRole("slider", { name: "Conversation width" });
  const before = await page
    .getByRole("region", { name: "Conversation", exact: true })
    .boundingBox();
  await range.focus();
  await page.keyboard.press("ArrowRight");
  await expect(range).toHaveValue("43");
  const after = await page
    .getByRole("region", { name: "Conversation", exact: true })
    .boundingBox();
  expect(after!.width).toBeGreaterThan(before!.width);
  await page
    .getByRole("banner")
    .getByRole("button", { name: "Switch to dark theme" })
    .click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "/tmp/nova-ember-studio-dark.png",
    fullPage: true,
  });
  await page.goto("/app/cases");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Ask Nova Ember", exact: true }),
  ).toBeHidden();
  const header = page.locator("#contextual-assistant-header");
  await header.click();
  await page
    .getByRole("button", { name: "Close contextual assistant", exact: true })
    .click();
  await expect(header).toBeFocused();
});

test("Stop cancels the real workflow boundary and private execution uses exact approval", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.goto("/app/agent");
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Inspect before calculating.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Stop research" }).click();
  await expect.poll(() => state.canceled).toBe(true);
  state.canceled = false;
  state.child = true;
  state.done = true;
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Propose reference code.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Run selected code" }).click();
  await expect.poll(() => state.approved).toBe(true);
  expect(state.controls.at(-1)).toEqual({
    expected_revision: 0,
    inputs_sha256: "b".repeat(64),
  });
});

test("Selected images require explicit sharing and preserve byte hashes", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.goto("/app/agent");
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await page
    .locator('input[type="file"][accept="image/png,image/jpeg"]')
    .setInputFiles({
      name: "reference.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5ZkAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Describe this explicitly selected image.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Confirm sharing" }),
  ).toBeVisible();
  expect(state.requests).toHaveLength(0);
  await page
    .getByRole("checkbox", { name: /Share this selected image/ })
    .check();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => state.requests.length).toBe(1);
  const images = state.requests[0].images as {
    consent: boolean;
    expected_sha256: string;
  }[];
  expect(images[0].consent).toBe(true);
  expect(images[0].expected_sha256).toMatch(/^[a-f0-9]{64}$/);
});

test("Permission denial preserves complete text operation without starting voice", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => {
        throw new DOMException("Denied in offline test", "NotAllowedError");
      },
    });
  });
  await page.goto("/app/agent");
  await page.getByRole("button", { name: "Live voice", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: /Share microphone audio for this live session/,
    })
    .check();
  await page
    .getByRole("button", { name: "Start live conversation", exact: true })
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Microphone permission was denied" }),
  ).toBeVisible();
  expect(state.voiceStarted).toBe(false);
  await page
    .getByRole("textbox", { name: "Research question", exact: true })
    .fill("Continue using text.");
  await expect(
    page.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
});

test("Offline WebRTC transport uses broker SDP and End stops microphone tracks", async ({
  page,
}) => {
  const state = await offlineStudio(page);
  await page.addInitScript(() => {
    const counters = { stopped: 0, enabled: true };
    Object.assign(window, { __voiceTransport: counters });
    const track = {
      get enabled() {
        return counters.enabled;
      },
      set enabled(value: boolean) {
        counters.enabled = value;
      },
      stop() {
        counters.stopped += 1;
      },
      onended: null,
    };
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      }),
    });
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: undefined,
    });
    class OfflinePeer {
      connectionState = "new";
      iceGatheringState = "complete";
      localDescription = { sdp: "v=0\nm=audio 9 UDP/TLS/RTP/SAVPF 111\n" };
      onconnectionstatechange: (() => void) | null = null;
      addTrack() {}
      createDataChannel() {
        return { onmessage: null };
      }
      async createOffer() {
        return this.localDescription;
      }
      async setLocalDescription() {}
      async setRemoteDescription() {
        this.connectionState = "connected";
        this.onconnectionstatechange?.();
      }
      close() {
        this.connectionState = "closed";
      }
      addEventListener() {}
      removeEventListener() {}
    }
    Object.defineProperty(window, "RTCPeerConnection", {
      configurable: true,
      value: OfflinePeer,
    });
  });
  await page.goto("/app/agent");
  await page.getByRole("button", { name: "Live voice", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: /Share microphone audio for this live session/,
    })
    .check();
  await page
    .getByRole("button", { name: "Start live conversation", exact: true })
    .click();
  await expect.poll(() => state.voiceStarted).toBe(true);
  await expect(
    page.getByText("Review the selected oxygen value before using it.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mute microphone", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __voiceTransport: { enabled: boolean } })
            .__voiceTransport.enabled,
      ),
    )
    .toBe(false);
  await page
    .getByRole("button", { name: "Stop playback", exact: true })
    .click();
  expect(state.controls.some((value) => value.action === "stop_speaking")).toBe(
    true,
  );
  await page.getByRole("button", { name: "End voice", exact: true }).click();
  await expect.poll(() => state.voiceClosed).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __voiceTransport: { stopped: number } })
            .__voiceTransport.stopped,
      ),
    )
    .toBeGreaterThan(0);
});

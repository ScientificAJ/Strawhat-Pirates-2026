import { expect, test } from "@playwright/test";
import { isDropletVisualization } from "../../apps/web/lib/simulation";
import {
  newSession,
  selectedHistory,
  type StudioTurn,
} from "../../apps/web/lib/studio-session";

type RecordValue = Record<string, unknown>;
const record = (value: unknown) => value as RecordValue;

test("follow-up history retains scientific qualifications and the collaborator's questions", () => {
  const context = newSession("a".repeat(64)).context;
  const turn: StudioTurn = {
    id: "conversation-reference",
    question: "Prepare the source model.",
    created_at: "2026-11-14T12:00:00Z",
    operation_key: "offline-reference",
    status: "completed",
    events: [],
    request: {
      question: "Prepare the source model.",
      context,
      expected_context_version: context.context_version,
    },
    result: {
      answer: {
        claims: [
          {
            statement: "The model record is prepared.",
            limitations: ["The trajectory assumes constant K."],
          },
        ],
        limitations: ["The source endpoint remains distinct from model time."],
        contradictions: [
          "The source reports disruption rather than established chemical extinction.",
        ],
        next_actions: [
          "Which observation should we compare with the calculated trajectory?",
        ],
      },
    },
  };
  const history = selectedHistory([turn]);
  expect(history).toHaveLength(2);
  expect(history[0]).toEqual({ role: "user", text: turn.question });
  expect(history[1].role).toBe("assistant");
  expect(history[1].text).toContain(
    "Qualification: The trajectory assumes constant K.",
  );
  expect(history[1].text).toContain(
    "Limit: The source endpoint remains distinct from model time.",
  );
  expect(history[1].text).toContain(
    "Unresolved: The source reports disruption rather than established chemical extinction.",
  );
  expect(history[1].text).toContain(
    "Next research step: Which observation should we compare with the calculated trajectory?",
  );
});

test("serialized simulation records require consistent scientific provenance and bounded states", async ({
  request,
}) => {
  const snapshot = (await (await request.get("/v1/snapshots/current")).json())
    .snapshot_id;
  const sourceResponse = await request.post("/v1/visualizations/flex-007", {
    data: { snapshot_id: snapshot, sample_count: 5 },
  });
  expect(sourceResponse.ok()).toBe(true);
  const source: RecordValue = await sourceResponse.json();
  expect(isDropletVisualization(source)).toBe(true);
  const corruptions: { name: string; change: (value: RecordValue) => void }[] =
    [
      {
        name: "missing frozen snapshot",
        change: (value) => {
          delete record(value.context).source_snapshot;
        },
      },
      {
        name: "contradictory origins",
        change: (value) => {
          record(value.request).parameter_origin = "analyst_assumptions";
        },
      },
      {
        name: "missing source parameter anchors",
        change: (value) => {
          value.parameter_sources = {};
        },
      },
      {
        name: "different source snapshot",
        change: (value) => {
          record(
            record(record(value.parameter_sources).initial_diameter).anchor,
          ).snapshot_id = "a".repeat(64);
        },
      },
      {
        name: "wrong source unit",
        change: (value) => {
          record(record(value.parameter_sources).burning_constant).unit = "mm";
        },
      },
      {
        name: "missing typed summaries",
        change: (value) => {
          value.summaries = {};
        },
      },
      {
        name: "incorrect returned units",
        change: (value) => {
          record(value.units).diameter_mm = "m";
        },
      },
      {
        name: "missing scientific qualification",
        change: (value) => {
          delete value.scientific_qualification;
        },
      },
      {
        name: "unbounded automatic playback",
        change: (value) => {
          value.autoplay = true;
        },
      },
      {
        name: "contradictory calculated count",
        change: (value) => {
          value.point_count = 999;
        },
      },
      {
        name: "diameter exceeds initial input",
        change: (value) => {
          (value.points as RecordValue[])[1].diameter_mm = 999;
        },
      },
      {
        name: "negative model state",
        change: (value) => {
          (value.points as RecordValue[])[1].relative_mass = -1;
        },
      },
      {
        name: "nonzero analytical endpoint",
        change: (value) => {
          (value.points as RecordValue[]).at(-1)!.diameter_mm = 1;
        },
      },
    ];
  for (const { name, change } of corruptions) {
    const value = structuredClone(source);
    change(value);
    expect(isDropletVisualization(value), name).toBe(false);
  }
  const assignedResponse = await request.post("/v1/visualizations/droplet", {
    data: {
      initial_diameter_mm: 2,
      burning_constant_mm2_s: 0.5,
      sample_count: 5,
      context: {
        input_origin: "analyst_input",
        source_snapshot: snapshot,
        sources: [
          {
            source_id: "independent-arithmetic-reference",
            locator: "D0=2mm and K=0.5mm²/s are explicitly assigned.",
          },
        ],
      },
    },
  });
  expect(assignedResponse.ok()).toBe(true);
  expect(isDropletVisualization(await assignedResponse.json())).toBe(true);
});

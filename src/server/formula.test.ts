import { describe, expect, it } from "vitest";
import {
  computeDerivedField,
  entitiesForMetrics,
  evaluateMetric,
  parseWindowDays,
  type MetricEngine,
} from "./formula.js";

// Mirrors examples/training-coach/capability.yaml schema + metrics.
const schema = {
  session: {
    logged_at: "datetime",
    duration_min: "int",
    rpe: "int",
    load: { derived: "duration_min * rpe" },
  },
};
const metrics = {
  rolling_load: { window: "14d", formula: "sum(session.load)" },
  acwr: { formula: "rolling_load(7d) / rolling_load(28d)" },
};

// now = 2026-07-01; rows placed to fall in/out of the 7/14/28-day windows.
const now = new Date("2026-07-01T00:00:00Z");
const rows = [
  { logged_at: "2026-06-28T10:00:00Z", duration_min: 60, rpe: 7 }, // load 420 — in 7d,14d,28d
  { logged_at: "2026-06-20T10:00:00Z", duration_min: 30, rpe: 6 }, // load 180 — in 14d,28d
  { logged_at: "2026-06-10T10:00:00Z", duration_min: 40, rpe: 5 }, // load 200 — in 28d only
  { logged_at: "2026-05-01T10:00:00Z", duration_min: 50, rpe: 8 }, // load 400 — outside all
];

const engine: MetricEngine = { metrics, schema, rowsByEntity: { session: rows }, now };

describe("computeDerivedField", () => {
  it("evaluates a per-row formula over row fields", () => {
    expect(computeDerivedField("duration_min * rpe", { duration_min: 60, rpe: 7 })).toBe(420);
  });
  it("rejects a non-numeric field", () => {
    expect(() => computeDerivedField("duration_min * rpe", { duration_min: "x", rpe: 7 })).toThrow();
  });
});

describe("parseWindowDays", () => {
  it("parses Nd windows", () => {
    expect(parseWindowDays("7d")).toBe(7);
    expect(parseWindowDays(" 28d ")).toBe(28);
  });
  it("rejects unsupported windows", () => {
    expect(() => parseWindowDays("2w")).toThrow();
  });
});

describe("evaluateMetric", () => {
  it("sums a derived field over the default window (rolling_load, 14d)", () => {
    // in-14d loads: 420 + 180 = 600
    expect(evaluateMetric("rolling_load", engine)).toBe(600);
  });

  it("computes a ratio of two windowed metric calls (acwr)", () => {
    // rolling_load(7d)=420, rolling_load(28d)=420+180+200=800 → 0.525
    expect(evaluateMetric("acwr", engine)).toBeCloseTo(420 / 800, 10);
  });

  it("uses a present (DB-generated) load value instead of recomputing", () => {
    const dbRows = [{ logged_at: "2026-06-28T10:00:00Z", load: 999 }];
    const e: MetricEngine = { ...engine, rowsByEntity: { session: dbRows } };
    expect(evaluateMetric("rolling_load", e)).toBe(999);
  });

  it("returns 0 for an empty window", () => {
    const e: MetricEngine = { ...engine, rowsByEntity: { session: [] } };
    expect(evaluateMetric("rolling_load", e)).toBe(0);
  });
});

describe("entitiesForMetrics", () => {
  it("collects entities transitively through metric references", () => {
    expect([...entitiesForMetrics(["acwr"], metrics, schema)]).toEqual(["session"]);
  });
});

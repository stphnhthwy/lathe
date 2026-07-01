import { z } from "zod";
import { describe, expect, it } from "vitest";
import { entityInputShape } from "./schema-to-zod.js";

// Fixture mirrors examples/training-coach/capability.yaml `schema.plan_week`
// (plus a derived field to prove omission).
const planWeek = {
  week_start: "date",
  phase: "enum[base, build, peak, taper]",
  target_load: "int",
};

describe("entityInputShape", () => {
  it("maps declared field types to zod validators", () => {
    const shape = entityInputShape(planWeek);
    const object = z.object(shape);
    expect(
      object.parse({ week_start: "2026-07-01", phase: "base", target_load: 300 }),
    ).toEqual({ week_start: "2026-07-01", phase: "base", target_load: 300 });
  });

  it("rejects an invalid enum value", () => {
    const object = z.object(entityInputShape(planWeek));
    expect(() => object.parse({ week_start: "2026-07-01", phase: "nope", target_load: 1 })).toThrow();
  });

  it("rejects a non-integer for an int field", () => {
    const object = z.object(entityInputShape({ target_load: "int" }));
    expect(() => object.parse({ target_load: 1.5 })).toThrow();
  });

  it("omits derived and ask fields from the input shape", () => {
    const shape = entityInputShape({
      external_id: "string",
      load: { derived: "duration_min * rpe" },
      rpe: "ask",
    });
    expect(Object.keys(shape)).toEqual(["external_id"]);
  });
});

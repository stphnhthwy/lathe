import { z, type ZodRawShape, type ZodTypeAny } from "zod";

/**
 * Turn a `schema.<entity>` declaration into a zod raw shape for a tool's input.
 *
 * The manifest `schema` is a MAPPING TARGET, not DDL — here it becomes the input
 * contract for an atomic write tool (e.g. `save_plan` writes a `plan_week`). Each
 * field's declared type maps to a zod validator:
 *
 *   string             → z.string()
 *   int                → z.number().int()
 *   date | datetime    → z.string()        (ISO string; format checks are later)
 *   enum[a, b, c]      → z.enum(["a","b","c"])
 *
 * Fields the caller does not supply are omitted from the input shape:
 *   - `{ derived: "..." }` — computed by lathe (locked compute), never an input.
 *   - `ask` — supplied by the model/user at call time via other means.
 * Unknown type strings fall back to z.any() so an unmodeled field never hard-fails.
 */

const ENUM_RE = /^enum\[(.*)\]$/;

function fieldToZod(spec: unknown): ZodTypeAny | null {
  // Object form: `{ derived: ... }` (and any object) is not a user input.
  if (spec !== null && typeof spec === "object") return null;

  if (typeof spec !== "string") return z.any();
  const type = spec.trim();

  if (type === "ask") return null;
  if (type === "string") return z.string();
  if (type === "int") return z.number().int();
  if (type === "date" || type === "datetime") return z.string();

  const enumMatch = type.match(ENUM_RE);
  if (enumMatch) {
    const values = enumMatch[1]
      .split(",")
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
    if (values.length > 0) return z.enum(values as [string, ...string[]]);
  }

  return z.any();
}

/** Build a zod raw shape (`{ field: zodType }`) from a schema entity declaration. */
export function entityInputShape(entity: Record<string, unknown>): ZodRawShape {
  const shape: ZodRawShape = {};
  for (const [name, spec] of Object.entries(entity)) {
    const zod = fieldToZod(spec);
    if (zod !== null) shape[name] = zod;
  }
  return shape;
}

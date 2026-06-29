import { z } from "zod";

/**
 * Structural schema for a lathe capability manifest (capability.yaml).
 *
 * This validates the *shape* of the manifest — required keys, enums, and the
 * tool/source structure. It deliberately does NOT do semantic validation
 * (formula grammar, JSONPath in `map`, cross-references between sources and
 * tools). Those are a later milestone; see
 * agent-os/standards/manifest/spec-not-code.md.
 *
 * Nested objects use `.passthrough()` so a manifest can carry adapter-specific
 * fields we haven't modeled yet without failing structural validation.
 */

// ── Sources ──────────────────────────────────────────────────────────────────
// Live data you CALL. `http`/`mcp` are APIs; `postgres`/`sqlite` are a local
// store, only for data with no home elsewhere.
const sourceSchema = z
  .object({
    type: z.enum(["http", "mcp", "postgres", "sqlite"]),
  })
  .passthrough();

// ── Tools ────────────────────────────────────────────────────────────────────
// A tool is either a DECLARED PIPELINE (linear `steps`) or an ATOMIC tool the
// model chains (`reads`/`writes`). Every tool has a name and at least one of
// those; `reads`/`writes` are intentionally loose (string | object | array).
const toolSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().optional(),
    steps: z.array(z.any()).optional(),
    reads: z.any().optional(),
    writes: z.any().optional(),
    readonly: z.boolean().optional(),
    confirm: z.boolean().optional(),
  })
  .passthrough()
  .refine(
    (t) => t.steps !== undefined || t.reads !== undefined || t.writes !== undefined,
    { message: "a tool must declare `steps` (pipeline) or `reads`/`writes` (atomic)" },
  );

// ── Behavior ─────────────────────────────────────────────────────────────────
const behaviorSchema = z
  .object({
    computed_locked: z.array(z.string()).optional(),
  })
  .passthrough();

// ── Manifest ─────────────────────────────────────────────────────────────────
export const manifestSchema = z
  .object({
    capability: z.string().min(1),
    version: z.string().min(1),
    summary: z.string().optional(),
    skill: z.string().optional(),
    references: z.array(z.string()).optional(),
    sources: z.record(sourceSchema).optional(),
    schema: z.record(z.any()).optional(),
    metrics: z.record(z.any()).optional(),
    behavior: behaviorSchema.optional(),
    tools: z.array(toolSchema).optional(),
    emit: z.array(z.enum(["skill", "mcp"])).optional(),
  })
  .passthrough();

export type Manifest = z.infer<typeof manifestSchema>;

import { z, type ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { request, type HttpSource } from "./http.js";
import { entityInputShape } from "./schema-to-zod.js";
import { entityFromPath, executePipeline, type PipelineStep } from "./pipeline.js";

export { entityFromPath };
import {
  entitiesForMetrics,
  evaluateMetric,
  type MetricDef,
  type MetricEngine,
} from "./formula.js";

/**
 * Classify a manifest tool and, when it's executable, turn it into an MCP tool
 * registration (config + handler).
 *
 * Executable so far:
 *   - `atomic-read`/`atomic-write` — a single `reads` (GET) or `writes` (POST)
 *     against an `http` source (Slice 1).
 *   - `pipeline` — a tool with linear `steps` (declared pipeline; Slice 2). Its
 *     input schema is the `ask` fields the pipeline needs the caller to supply.
 *
 * Still DEFERRED (recognized, surfaced at startup, not dropped):
 *   - `metric` — a tool whose `reads` is an array of metric names, which needs
 *     the locked-compute formula engine (→ Slice 3).
 */

export type ToolKind = "atomic-read" | "atomic-write" | "pipeline" | "metric" | "unsupported";

/** A tool as declared in the manifest (loose — `reads`/`writes` are string|object|array). */
export interface ManifestTool {
  name: string;
  description?: string;
  steps?: unknown[];
  reads?: unknown;
  writes?: unknown;
  readonly?: boolean;
  confirm?: boolean;
}

export interface BuildContext {
  sources: Record<string, HttpSource>;
  schema: Record<string, Record<string, unknown>>;
  /** Metric definitions (`behavior.computed_locked` inputs) for the formula engine. */
  metrics: Record<string, MetricDef>;
  /** Entity → where its rows are read from (derived from atomic-read tools). */
  entitySources: Record<string, { source: string; path: string }>;
  /** Reference "now" for metric windows — injected so results are reproducible. */
  now: Date;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface ToolRegistration {
  name: string;
  config: { description?: string; inputSchema?: ZodRawShape; annotations?: ToolAnnotations };
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

/** Decide what kind of tool this is — purely from its declared shape. */
export function classifyTool(tool: ManifestTool): ToolKind {
  if (Array.isArray(tool.steps)) return "pipeline";
  if (Array.isArray(tool.reads)) return "metric";
  if (isCallSpec(tool.reads)) return "atomic-read";
  if (isCallSpec(tool.writes)) return "atomic-write";
  return "unsupported";
}

function isCallSpec(value: unknown): value is { source: string; path: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { source?: unknown }).source === "string" &&
    typeof (value as { path?: unknown }).path === "string"
  );
}


const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/**
 * A pipeline's input schema is exactly the `ask` fields its `map` steps need the
 * caller to supply. Each `ask` key is typed from the write target's schema entity
 * when known (e.g. `rpe` → int from `schema.session`), else left permissive.
 */
function pipelineInputShape(
  steps: PipelineStep[],
  schema: Record<string, Record<string, unknown>>,
): ZodRawShape {
  const askKeys = new Set<string>();
  let writeEntity: Record<string, unknown> = {};
  for (const step of steps) {
    if (step.call && step.for_each !== undefined) {
      writeEntity = schema[entityFromPath(step.call.path)] ?? writeEntity;
    }
    for (const [key, spec] of Object.entries(step.map ?? {})) {
      if (spec === "ask") askKeys.add(key);
    }
  }
  const entityShape = entityInputShape(writeEntity);
  const shape: ZodRawShape = {};
  for (const key of askKeys) shape[key] = entityShape[key] ?? z.any();
  return shape;
}

/**
 * Compute the requested locked metrics and return them FROZEN. This is the
 * guardrail: `behavior.computed_locked` values are computed here, in code, and
 * returned authoritative — the model reasons about them and never recomputes.
 * Underlying rows come from each entity's declared read source.
 */
async function computeLockedMetrics(
  metricNames: string[],
  ctx: BuildContext,
): Promise<{ computed_locked: true; metrics: Record<string, number>; note: string }> {
  const entities = entitiesForMetrics(metricNames, ctx.metrics, ctx.schema);
  const rowsByEntity: Record<string, Array<Record<string, unknown>>> = {};
  for (const entity of entities) {
    const binding = ctx.entitySources[entity];
    if (!binding) {
      throw new Error(`no source for entity "${entity}" — need a readonly tool reading /${entity}`);
    }
    const source = ctx.sources[binding.source];
    if (!source) throw new Error(`unknown source "${binding.source}" for entity "${entity}"`);
    const rows = await request({
      source,
      method: "GET",
      path: binding.path,
      env: ctx.env,
      fetchImpl: ctx.fetchImpl,
    });
    rowsByEntity[entity] = Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [];
  }

  const engine: MetricEngine = { metrics: ctx.metrics, schema: ctx.schema, rowsByEntity, now: ctx.now };
  const values: Record<string, number> = {};
  for (const name of metricNames) values[name] = evaluateMetric(name, engine);

  return {
    computed_locked: true,
    metrics: values,
    note: "Authoritative values computed by lathe. Reason about these; do not recompute or estimate them.",
  };
}

/**
 * Turn a tool into a registration, or return why it's deferred. `kind` is passed
 * in so the caller (which already classified for its startup notice) doesn't
 * re-derive it.
 */
export function toRegistration(
  tool: ManifestTool,
  kind: ToolKind,
  ctx: BuildContext,
): ToolRegistration | { deferred: string } {
  if (kind === "unsupported") return { deferred: "unrecognized tool shape" };

  if (kind === "metric") {
    const metricNames = (tool.reads as string[]).filter((n) => ctx.metrics[n]);
    if (metricNames.length === 0) return { deferred: "no known metrics in `reads`" };
    return {
      name: tool.name,
      config: {
        description: tool.description,
        inputSchema: {},
        annotations: { readOnlyHint: true }, // metrics only read + compute
      },
      handler: async () => text(await computeLockedMetrics(metricNames, ctx)),
    };
  }

  if (kind === "pipeline") {
    const steps = (tool.steps ?? []) as PipelineStep[];
    return {
      name: tool.name,
      config: {
        description: tool.description,
        inputSchema: pipelineInputShape(steps, ctx.schema),
        annotations: { readOnlyHint: false, destructiveHint: true }, // pipelines write
      },
      handler: async (args) =>
        text(
          await executePipeline(steps, {
            sources: ctx.sources,
            args,
            schema: ctx.schema,
            env: ctx.env,
            fetchImpl: ctx.fetchImpl,
          }),
        ),
    };
  }

  const spec = (kind === "atomic-read" ? tool.reads : tool.writes) as {
    source: string;
    path: string;
    query?: Record<string, unknown>;
    prefer?: string;
  };

  const source = ctx.sources[spec.source];
  if (!source) return { deferred: `unknown source "${spec.source}"` };
  if (source.type !== "http") return { deferred: `source "${spec.source}" is not http (${source.type})` };

  if (kind === "atomic-read") {
    return {
      name: tool.name,
      config: { description: tool.description, inputSchema: {}, annotations: { readOnlyHint: true } },
      handler: async () =>
        text(
          await request({
            source,
            method: "GET",
            path: spec.path,
            query: spec.query,
            env: ctx.env,
            fetchImpl: ctx.fetchImpl,
          }),
        ),
    };
  }

  // atomic-write
  const entity = ctx.schema[entityFromPath(spec.path)] ?? {};
  return {
    name: tool.name,
    config: {
      description: tool.description,
      inputSchema: entityInputShape(entity),
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    handler: async (args) =>
      text(
        await request({
          source,
          method: "POST",
          path: spec.path,
          body: args,
          prefer: spec.prefer,
          env: ctx.env,
          fetchImpl: ctx.fetchImpl,
        }),
      ),
  };
}

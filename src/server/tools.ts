import type { ZodRawShape } from "zod";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { request, type HttpSource } from "./http.js";
import { entityInputShape } from "./schema-to-zod.js";

/**
 * Classify a manifest tool and, when it's executable in this slice, turn it into
 * an MCP tool registration (config + handler).
 *
 * M3 Slice 1 executes ATOMIC tools only — a single `reads` (GET) or `writes`
 * (POST) against an `http` source. Two shapes are recognized but DEFERRED to
 * later slices, and surfaced (not dropped) at startup:
 *   - `pipeline` — a tool with `steps` (declared pipeline → Slice 2).
 *   - `metric`   — a tool whose `reads` is an array of metric names, which need
 *                  the locked-compute formula engine (→ Slice 3).
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

/** Entity name a write targets, from its path (`/plan_week` → `plan_week`). */
function entityFromPath(path: string): string {
  return path.replace(/^\//, "").split("?")[0];
}

const text = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

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
  if (kind === "pipeline") return { deferred: "declared pipeline (steps) — Slice 2" };
  if (kind === "metric") return { deferred: "reads locked metrics — Slice 3" };
  if (kind === "unsupported") return { deferred: "unrecognized tool shape" };

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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Manifest } from "../manifest/schema.js";
import type { HttpSource } from "./http.js";
import type { MetricDef } from "./formula.js";
import {
  classifyTool,
  entityFromPath,
  toRegistration,
  type BuildContext,
  type ManifestTool,
} from "./tools.js";

export interface BuildServerOptions {
  /** Environment for `${VAR}` resolution (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Fetch implementation (defaults to global `fetch`); injectable for tests. */
  fetchImpl?: typeof fetch;
  /** Reference "now" for metric windows (defaults to the current time). */
  now?: Date;
  /** Diagnostic sink. Defaults to stderr — NEVER stdout (it carries the protocol). */
  log?: (message: string) => void;
}

export interface DeferredTool {
  name: string;
  reason: string;
}

export interface BuildResult {
  server: McpServer;
  registered: string[];
  deferred: DeferredTool[];
}

/**
 * Read a validated manifest and return a configured `McpServer` — registering
 * every executable atomic tool and reporting the rest as deferred.
 *
 * PURE: this opens no transport and does no I/O of its own. The caller connects
 * a transport (stdio in `serve`, in-memory in tests), which is what makes the
 * server testable without a subprocess.
 */
export function buildServer(manifest: Manifest, options: BuildServerOptions = {}): BuildResult {
  const log = options.log ?? ((message: string) => console.error(message));

  const server = new McpServer({
    name: manifest.capability,
    version: manifest.version,
  });

  const tools = (manifest.tools ?? []) as ManifestTool[];

  // Bind each schema entity to where its rows are read (from atomic-read tools),
  // so metric tools know where to fetch the rows they aggregate over.
  const entitySources: Record<string, { source: string; path: string }> = {};
  for (const tool of tools) {
    if (classifyTool(tool) === "atomic-read") {
      const spec = tool.reads as { source: string; path: string };
      const entity = entityFromPath(spec.path);
      if (!entitySources[entity]) entitySources[entity] = { source: spec.source, path: spec.path };
    }
  }

  const ctx: BuildContext = {
    sources: (manifest.sources ?? {}) as unknown as Record<string, HttpSource>,
    schema: (manifest.schema ?? {}) as Record<string, Record<string, unknown>>,
    metrics: (manifest.metrics ?? {}) as Record<string, MetricDef>,
    entitySources,
    now: options.now ?? new Date(),
    env: options.env,
    fetchImpl: options.fetchImpl,
  };
  const registered: string[] = [];
  const deferred: DeferredTool[] = [];

  for (const tool of tools) {
    const kind = classifyTool(tool);
    const result = toRegistration(tool, kind, ctx);
    if ("deferred" in result) {
      deferred.push({ name: tool.name, reason: result.deferred });
      continue;
    }
    // The SDK's generic ToolCallback typing is stricter than our uniform
    // (args) => CallToolResult handler; the cast is the registration boundary.
    server.registerTool(result.name, result.config, result.handler as never);
    registered.push(result.name);
  }

  if (deferred.length > 0) {
    log(`deferred ${deferred.length} tool(s) not supported in this build:`);
    for (const d of deferred) log(`  - ${d.name}: ${d.reason}`);
  }

  return { server, registered, deferred };
}

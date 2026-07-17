import { createServer, type IncomingMessage, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadManifest } from "../manifest/load.js";
import type { Manifest } from "../manifest/schema.js";
import { classifyTool, type ManifestTool } from "./tools.js";
import { buildServer } from "./build.js";

// ── classification against the real example fixture ──────────────────────────
const examplePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "examples",
  "training-coach",
  "capability.yaml",
);

function exampleTool(name: string): ManifestTool {
  const loaded = loadManifest(examplePath);
  if (!loaded.ok) throw new Error("example manifest should be valid");
  const tool = (loaded.manifest.tools as ManifestTool[]).find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool;
}

describe("classifyTool (example capability)", () => {
  it("classifies atomic reads, atomic writes, pipelines, and metric reads", () => {
    expect(classifyTool(exampleTool("get_history"))).toBe("atomic-read");
    expect(classifyTool(exampleTool("save_plan"))).toBe("atomic-write");
    expect(classifyTool(exampleTool("import_recent"))).toBe("pipeline");
    expect(classifyTool(exampleTool("weekly_checkin"))).toBe("metric");
  });
});

// ── buildServer driven through an in-memory MCP client ───────────────────────
interface Captured {
  method?: string;
  url?: string;
  body: string;
}
let server: Server;
let baseUrl: string;
let last: Captured;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => res(data));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    last = { method: req.method, url: req.url, body: await readBody(req) };
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // Row carries id/sport (for read + pipeline tests) plus logged_at/load (for metrics).
    res.end('[{"id":1,"sport":"run","logged_at":"2026-06-28T10:00:00Z","load":300}]');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

function testManifest(): Manifest {
  return {
    capability: "test-cap",
    version: "0.0.1",
    sources: {
      store: {
        type: "http",
        base_url: baseUrl,
        auth: { kind: "bearer", token: "${K}" },
        headers: { apikey: "${K}" },
      },
    },
    schema: {
      session: {
        external_id: "string",
        logged_at: "datetime",
        sport: "enum[run, ride]",
        duration_min: "int",
        rpe: "int",
        load: { derived: "duration_min * rpe" },
      },
      plan_week: { week_start: "date", phase: "enum[base, build, peak, taper]", target_load: "int" },
    },
    metrics: {
      rolling_load: { window: "14d", formula: "sum(session.load)" },
      acwr: { formula: "rolling_load(7d) / rolling_load(28d)" },
    },
    behavior: { computed_locked: ["load", "rolling_load", "acwr"] },
    tools: [
      { name: "get_history", description: "recent sessions", reads: { source: "store", path: "/session", query: { limit: 5 } }, readonly: true },
      { name: "save_plan", description: "save a plan", writes: { source: "store", path: "/plan_week" }, confirm: true },
      {
        name: "import_recent",
        description: "pipeline",
        steps: [
          { call: { source: "store", method: "GET", path: "/activities" }, as: "activities" },
          {
            for_each: "activities",
            call: { source: "store", method: "POST", path: "/session", prefer: "resolution=merge-duplicates" },
            map: { external_id: "$.id", sport: "$.sport", rpe: "ask" },
          },
        ],
        writes: "store.session",
      },
      { name: "weekly_checkin", description: "metrics", reads: ["rolling_load", "acwr"], readonly: true },
    ],
  } as unknown as Manifest;
}

async function connectedClient(extra: Record<string, unknown> = {}) {
  const result = buildServer(testManifest(), { env: { K: "secret" }, log: () => {}, ...extra });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await result.server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return { client, result };
}

describe("buildServer", () => {
  it("registers every tool in the example (nothing deferred) once metrics land", () => {
    const result = buildServer(testManifest(), { env: { K: "secret" }, log: () => {} });
    expect(result.registered.sort()).toEqual(["get_history", "import_recent", "save_plan", "weekly_checkin"]);
    expect(result.deferred).toEqual([]);
  });

  it("lists the executable tools with read/write annotations", async () => {
    const { client } = await connectedClient();
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

    expect(Object.keys(byName).sort()).toEqual([
      "get_history",
      "import_recent",
      "save_plan",
      "weekly_checkin",
    ]);
    expect(byName["weekly_checkin"].annotations?.readOnlyHint).toBe(true);
    expect(byName["get_history"].annotations?.readOnlyHint).toBe(true);
    expect(byName["save_plan"].annotations?.readOnlyHint).toBe(false);
    expect(byName["save_plan"].annotations?.destructiveHint).toBe(true);
    expect(Object.keys(byName["save_plan"].inputSchema.properties ?? {}).sort()).toEqual([
      "phase",
      "target_load",
      "week_start",
    ]);
    // import_recent's input is exactly its `ask` field (rpe), typed from schema.session.
    expect(byName["import_recent"].annotations?.readOnlyHint).toBe(false);
    expect(Object.keys(byName["import_recent"].inputSchema.properties ?? {})).toEqual(["rpe"]);
  });

  it("calls the http adapter on an atomic read and returns the payload", async () => {
    const { client } = await connectedClient();
    const res = await client.callTool({ name: "get_history", arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toContain('"sport": "run"');
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/session?limit=5");
  });

  it("POSTs the validated body on an atomic write", async () => {
    const { client } = await connectedClient();
    await client.callTool({
      name: "save_plan",
      arguments: { week_start: "2026-07-01", phase: "base", target_load: 300 },
    });
    expect(last.method).toBe("POST");
    expect(JSON.parse(last.body)).toEqual({ week_start: "2026-07-01", phase: "base", target_load: 300 });
  });

  it("runs a declared pipeline on callTool (GET → for_each upsert)", async () => {
    const { client } = await connectedClient();
    const res = await client.callTool({ name: "import_recent", arguments: { rpe: 5 } });
    const content = res.content as Array<{ type: string; text: string }>;
    // Mock returns one activity for the GET; the for_each upserts it once.
    expect(JSON.parse(content[0].text)).toEqual({ steps: 2, reads: 1, writes: 1, skipped: [] });
    expect(last.method).toBe("POST"); // last request is the /session upsert
    expect(last.url).toBe("/session");
    expect(JSON.parse(last.body)).toEqual({ external_id: 1, sport: "run", rpe: 5 });
  });

  it("computes locked metrics and returns them frozen (weekly_checkin)", async () => {
    // Fixed now so the single mock row (2026-06-28, load 300) is inside all windows.
    const { client } = await connectedClient({ now: new Date("2026-07-01T00:00:00Z") });
    const res = await client.callTool({ name: "weekly_checkin", arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    const payload = JSON.parse(content[0].text);

    expect(payload.computed_locked).toBe(true);
    expect(payload.metrics.rolling_load).toBe(300); // sum(load) over 14d
    expect(payload.metrics.acwr).toBeCloseTo(1, 10); // 300 / 300
    expect(payload.note).toMatch(/do not recompute/i);
    expect(last.method).toBe("GET"); // rows fetched via the entity's read source
    expect(last.url).toBe("/session");
  });
});

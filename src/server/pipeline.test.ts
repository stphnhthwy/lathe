import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { HttpSource } from "./http.js";
import { coerceToFieldType, executePipeline, extractPath, resolveMap, type PipelineStep } from "./pipeline.js";

// ── pure helpers ─────────────────────────────────────────────────────────────
describe("extractPath", () => {
  it("resolves flat and nested $. paths", () => {
    expect(extractPath({ id: 7 }, "$.id")).toBe(7);
    expect(extractPath({ a: { b: "x" } }, "$.a.b")).toBe("x");
    expect(extractPath({ a: {} }, "$.a.missing")).toBeUndefined();
  });
});

describe("resolveMap", () => {
  const item = { id: 42, start_date: "2026-06-28T10:00:00Z", sport_type: "run", moving_time: 3600 };
  it("maps paths, arithmetic expressions, ask, and literals", () => {
    const body = resolveMap(
      {
        external_id: "$.id",
        logged_at: "$.start_date",
        sport: "$.sport_type",
        duration_min: "$.moving_time / 60",
        rpe: "ask",
        source: "strava",
      },
      item,
      { rpe: 7 },
    );
    expect(body).toEqual({
      external_id: 42,
      logged_at: "2026-06-28T10:00:00Z",
      sport: "run",
      duration_min: 60, // 3600 / 60
      rpe: 7, // from args
      source: "strava", // literal
    });
  });

  it("honors operator precedence and parentheses in expressions", () => {
    expect(resolveMap({ x: "$.a + $.b * 2" }, { a: 1, b: 3 }, {})).toEqual({ x: 7 });
    expect(resolveMap({ x: "($.a + $.b) * 2" }, { a: 1, b: 3 }, {})).toEqual({ x: 8 });
  });
});

describe("coerceToFieldType", () => {
  it("rounds numbers declared int", () => {
    expect(coerceToFieldType(56.1, "int")).toBe(56);
    expect(coerceToFieldType(56, "int")).toBe(56);
  });

  it("case-folds strings onto a declared enum value", () => {
    expect(coerceToFieldType("Run", "enum[run, ride, hiit, strength]")).toBe("run");
    expect(coerceToFieldType("run", "enum[run, ride, hiit, strength]")).toBe("run");
  });

  it("leaves values it cannot coerce unchanged", () => {
    expect(coerceToFieldType("WeightTraining", "enum[run, ride]")).toBe("WeightTraining"); // no match → source decides
    expect(coerceToFieldType("2026-06-01", "datetime")).toBe("2026-06-01");
    expect(coerceToFieldType(7, { derived: "a * b" })).toBe(7); // object spec → not coercible
    expect(coerceToFieldType(7, undefined)).toBe(7); // field not in schema
  });
});

// ── executor against a mock server that records the request sequence ─────────
interface Req {
  method?: string;
  url?: string;
  prefer?: string | string[];
  body: string;
}
let server: Server;
let baseUrl: string;
let seen: Req[] = [];

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => res(d));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    seen.push({ method: req.method, url: req.url, prefer: req.headers["prefer"], body: await readBody(req) });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    // The first (GET) call returns two activities; writes return empty.
    if (req.method === "GET") {
      res.end(
        JSON.stringify([
          { id: 1, start_date: "2026-06-01T08:00:00Z", sport_type: "run", moving_time: 1800 },
          { id: 2, start_date: "2026-06-02T08:00:00Z", sport_type: "ride", moving_time: 3600 },
        ]),
      );
    } else {
      res.end("");
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("executePipeline (import_recent shape)", () => {
  it("runs a call → for_each fan-out with map + prefer upsert", async () => {
    seen = [];
    const sources: Record<string, HttpSource> = {
      strava: { type: "http", base_url: baseUrl, auth: { kind: "oauth2", token: "${T}" } },
      store: { type: "http", base_url: baseUrl, auth: { kind: "bearer", token: "${K}" } },
    };
    const steps: PipelineStep[] = [
      { call: { source: "strava", method: "GET", path: "/athlete/activities", query: { per_page: 10 } }, as: "activities" },
      {
        for_each: "activities",
        call: { source: "store", method: "POST", path: "/session", prefer: "resolution=merge-duplicates" },
        map: {
          external_id: "$.id",
          logged_at: "$.start_date",
          sport: "$.sport_type",
          duration_min: "$.moving_time / 60",
          rpe: "ask",
        },
      },
    ];

    const result = await executePipeline(steps, {
      sources,
      args: { rpe: 6 },
      env: { T: "strava-tok", K: "store-key" },
    });

    expect(result).toEqual({ steps: 2, reads: 1, writes: 2, skipped: [] });

    // 1 GET to strava, then 2 POST upserts to store.
    expect(seen[0].method).toBe("GET");
    expect(seen[0].url).toBe("/athlete/activities?per_page=10");

    const posts = seen.slice(1);
    expect(posts.map((p) => p.method)).toEqual(["POST", "POST"]);
    expect(posts.every((p) => p.prefer === "resolution=merge-duplicates")).toBe(true);
    expect(JSON.parse(posts[0].body)).toEqual({
      external_id: 1,
      logged_at: "2026-06-01T08:00:00Z",
      sport: "run",
      duration_min: 30, // 1800 / 60
      rpe: 6,
    });
    expect(JSON.parse(posts[1].body)).toMatchObject({ external_id: 2, duration_min: 60 });
  });

  it("coerces mapped bodies to the write entity's declared types when schema is provided", async () => {
    // Real Strava payloads: capitalized sport_type, moving_time that doesn't
    // divide evenly into minutes. Without coercion both violate the store's
    // column types (int column, lowercase enum check).
    const raw = createServer(async (req, res) => {
      seen.push({ method: req.method, url: req.url, prefer: req.headers["prefer"], body: await readBody(req) });
      res.setHeader("Content-Type", "application/json");
      res.end(
        req.method === "GET"
          ? JSON.stringify([{ id: 9, start_date: "2026-07-01T08:00:00Z", sport_type: "Run", moving_time: 3366 }])
          : "",
      );
    });
    await new Promise<void>((r) => raw.listen(0, "127.0.0.1", r));
    const addr = raw.address();
    const rawUrl = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "";
    seen = [];

    try {
      await executePipeline(
        [
          { call: { source: "strava", method: "GET", path: "/athlete/activities" }, as: "activities" },
          {
            for_each: "activities",
            call: { source: "store", method: "POST", path: "/session" },
            map: { external_id: "$.id", sport: "$.sport_type", duration_min: "$.moving_time / 60", rpe: "ask" },
          },
        ],
        {
          sources: {
            strava: { type: "http", base_url: rawUrl },
            store: { type: "http", base_url: rawUrl },
          },
          args: { rpe: 6 },
          schema: {
            session: {
              external_id: "string",
              sport: "enum[run, ride, hiit, strength]",
              duration_min: "int",
              rpe: "int",
            },
          },
        },
      );
    } finally {
      await new Promise<void>((r) => raw.close(() => r()));
    }

    expect(JSON.parse(seen[1].body)).toEqual({
      external_id: 9,
      sport: "run", // "Run" case-folded onto the enum
      duration_min: 56, // 3366 / 60 = 56.1 → rounded for the int column
      rpe: 6,
    });
  });

  it("skips and reports for_each rows the store rejects instead of aborting the batch", async () => {
    // One unmappable activity (Yoga → 400 from the store's check constraint)
    // must not prevent the mappable ones from importing.
    const raw = createServer(async (req, res) => {
      const body = await readBody(req);
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET") {
        res.end(
          JSON.stringify([
            { id: 1, sport_type: "Yoga" },
            { id: 2, sport_type: "Run" },
          ]),
        );
        return;
      }
      seen.push({ method: req.method, url: req.url, prefer: req.headers["prefer"], body });
      if (JSON.parse(body).sport === "Yoga") {
        res.statusCode = 400;
        res.end(JSON.stringify({ message: 'violates check constraint "session_sport_check"' }));
      } else {
        res.end("");
      }
    });
    await new Promise<void>((r) => raw.listen(0, "127.0.0.1", r));
    const addr = raw.address();
    const rawUrl = addr && typeof addr === "object" ? `http://127.0.0.1:${addr.port}` : "";
    seen = [];

    try {
      const result = await executePipeline(
        [
          { call: { source: "strava", method: "GET", path: "/athlete/activities" }, as: "activities" },
          {
            for_each: "activities",
            call: { source: "store", method: "POST", path: "/session" },
            map: { external_id: "$.id", sport: "$.sport_type" },
          },
        ],
        {
          sources: { strava: { type: "http", base_url: rawUrl }, store: { type: "http", base_url: rawUrl } },
          args: {},
          schema: { session: { external_id: "string", sport: "enum[run, ride, hiit, strength]" } },
        },
      );

      expect(result.writes).toBe(1); // the Run row landed
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toMatch(/session_sport_check/);
      expect(seen).toHaveLength(2); // both rows were attempted
    } finally {
      await new Promise<void>((r) => raw.close(() => r()));
    }
  });

  it("throws a clear error when for_each targets a non-list", async () => {
    await expect(
      executePipeline([{ for_each: "missing", call: { source: "store", path: "/x" } }], {
        sources: { store: { type: "http", base_url: baseUrl } },
        args: {},
      }),
    ).rejects.toThrow(/not a bound list/);
  });
});

import { createServer, type IncomingMessage, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildAuthHeaders, request, resolveEnv, type HttpSource } from "./http.js";

// Self-contained: spin up an in-process HTTP server and point the adapter at it.
// No live Supabase — automated tests never depend on an external service.

interface Captured {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

let server: Server;
let baseUrl: string;
let last: Captured;
// What the next response should be; tests tweak this before each call.
let next: { status: number; body: string } = { status: 200, body: "[]" };

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => res(data));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    last = { method: req.method, url: req.url, headers: req.headers, body: await readBody(req) };
    res.statusCode = next.status;
    res.setHeader("Content-Type", "application/json");
    res.end(next.body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const store: HttpSource = {
  type: "http",
  base_url: "", // set per test to baseUrl
  auth: { kind: "bearer", token: "${TEST_KEY}" },
  headers: { apikey: "${TEST_KEY}" },
};

describe("resolveEnv", () => {
  it("substitutes ${VAR} from the environment", () => {
    expect(resolveEnv("a/${FOO}/b", { FOO: "x" })).toBe("a/x/b");
  });

  it("throws a clear error naming a missing variable", () => {
    expect(() => resolveEnv("${NOPE}/x", {})).toThrow(/NOPE/);
  });
});

describe("buildAuthHeaders", () => {
  it("sets Authorization: Bearer and merges resolved headers", () => {
    const h = buildAuthHeaders(store, { TEST_KEY: "secret" });
    expect(h["Authorization"]).toBe("Bearer secret");
    expect(h["apikey"]).toBe("secret");
  });

  it("treats oauth2 like a bearer token (no refresh in M3)", () => {
    const src: HttpSource = { type: "http", base_url: "", auth: { kind: "oauth2", token: "${T}" } };
    expect(buildAuthHeaders(src, { T: "tok" })["Authorization"]).toBe("Bearer tok");
  });
});

describe("request", () => {
  const env = { TEST_KEY: "secret" };

  it("serializes a PostgREST-style query and sends auth headers on GET", async () => {
    next = { status: 200, body: '[{"id":1}]' };
    const result = await request({
      source: { ...store, base_url: baseUrl },
      method: "GET",
      path: "/session",
      query: { order: "logged_at.desc", limit: 60 },
      env,
    });
    expect(result).toEqual([{ id: 1 }]);
    expect(last.method).toBe("GET");
    expect(last.url).toBe("/session?order=logged_at.desc&limit=60");
    expect(last.headers["authorization"]).toBe("Bearer secret");
    expect(last.headers["apikey"]).toBe("secret");
  });

  it("sends a JSON body and the Prefer header on POST", async () => {
    next = { status: 201, body: "" };
    const result = await request({
      source: { ...store, base_url: baseUrl },
      method: "POST",
      path: "/plan_week",
      body: { week_start: "2026-07-01", phase: "base" },
      prefer: "resolution=merge-duplicates",
      env,
    });
    expect(result).toBeNull(); // empty body → null
    expect(last.method).toBe("POST");
    expect(last.headers["content-type"]).toContain("application/json");
    expect(last.headers["prefer"]).toBe("resolution=merge-duplicates");
    expect(JSON.parse(last.body)).toEqual({ week_start: "2026-07-01", phase: "base" });
  });

  it("throws a clear error with status and body on non-2xx", async () => {
    next = { status: 400, body: '{"message":"bad column"}' };
    await expect(
      request({ source: { ...store, base_url: baseUrl }, method: "GET", path: "/nope", env }),
    ).rejects.toThrow(/400.*bad column/s);
  });

  it("throws when a referenced env var is missing", async () => {
    await expect(
      request({ source: { ...store, base_url: baseUrl }, method: "GET", path: "/x", env: {} }),
    ).rejects.toThrow(/TEST_KEY/);
  });
});

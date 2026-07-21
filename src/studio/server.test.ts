import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { startStudio, type StudioHandle } from "./server.js";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const exampleDir = join(projectRoot, "examples", "training-coach");

// Handles opened by a test; closed after each.
let open: StudioHandle[] = [];

async function studio(opts: Parameters<typeof startStudio>[0]): Promise<StudioHandle> {
  const handle = await startStudio({ port: 0, ...opts });
  open.push(handle);
  return handle;
}

afterEach(async () => {
  for (const h of open) await h.close();
  open = [];
});

function tempCapability(yamlText: string): string {
  const dir = mkdtempSync(join(tmpdir(), "lathe-studio-"));
  writeFileSync(join(dir, "capability.yaml"), yamlText);
  return dir;
}

describe("GET /api/manifest", () => {
  it("returns the parsed manifest, empty issues, and an mtime for a valid capability", async () => {
    const h = await studio({ dir: exampleDir });
    const res = await fetch(`${h.url}/api/manifest`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      manifest: { capability: string; sources: Record<string, unknown> };
      issues: unknown[];
      mtimeMs: number;
    };
    expect(body.ok).toBe(true);
    expect(body.manifest.capability).toBe("training-coach");
    expect(Object.keys(body.manifest.sources)).toEqual(["strava", "store"]);
    expect(body.issues).toEqual([]);
    expect(typeof body.mtimeMs).toBe("number");
  });

  it("still returns the raw manifest alongside issues when validation fails (invalid still opens)", async () => {
    const dir = tempCapability(
      // missing required `version`; tool declares neither steps nor reads/writes
      ["capability: broken", "tools:", "  - name: nothing_declared", ""].join("\n"),
    );
    const h = await studio({ dir });
    const body = (await (await fetch(`${h.url}/api/manifest`)).json()) as {
      ok: boolean;
      manifest: { capability: string };
      issues: { path: string; message: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.manifest.capability).toBe("broken");
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues.map((i) => i.path)).toContain("version");
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a parse error (not a crash) for YAML that does not parse", async () => {
    const dir = tempCapability("capability: [unclosed");
    const h = await studio({ dir });
    const res = await fetch(`${h.url}/api/manifest`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("YAML parse error");
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a missing manifest file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "lathe-studio-empty-"));
    const h = await studio({ dir });
    const body = (await (await fetch(`${h.url}/api/manifest`)).json()) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("cannot read");
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("PUT /api/manifest", () => {
  /** A scratch copy of the training-coach manifest, so writes never touch the example. */
  function exampleCopy(): string {
    const dir = mkdtempSync(join(tmpdir(), "lathe-studio-put-"));
    copyFileSync(join(exampleDir, "capability.yaml"), join(dir, "capability.yaml"));
    return dir;
  }

  async function loadedMtime(h: StudioHandle): Promise<number> {
    const body = (await (await fetch(`${h.url}/api/manifest`)).json()) as { mtimeMs: number };
    return body.mtimeMs;
  }

  function put(h: StudioHandle, body: unknown): Promise<Response> {
    return fetch(`${h.url}/api/manifest`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("applies path-scoped edits, changing only the targeted lines on disk", async () => {
    const dir = exampleCopy();
    const before = readFileSync(join(dir, "capability.yaml"), "utf8");
    const h = await studio({ dir });
    const res = await put(h, {
      baseMtimeMs: await loadedMtime(h),
      edits: [
        { op: "set", path: ["sources", "store", "base_url"], value: "http://127.0.0.1:54321/rest/v1" },
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      manifest: { sources: { store: { base_url: string } } };
      issues: unknown[];
      mtimeMs: number;
    };
    expect(body.ok).toBe(true);
    expect(body.manifest.sources.store.base_url).toBe("http://127.0.0.1:54321/rest/v1");
    expect(body.issues).toEqual([]);

    const after = readFileSync(join(dir, "capability.yaml"), "utf8");
    const changed = after.split("\n").filter((line, i) => line !== before.split("\n")[i]);
    expect(changed).toEqual([
      "    base_url: http://127.0.0.1:54321/rest/v1                 # local Supabase or hosted",
    ]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("409s a stale write and leaves the file untouched", async () => {
    const dir = exampleCopy();
    const before = readFileSync(join(dir, "capability.yaml"), "utf8");
    const h = await studio({ dir });
    const res = await put(h, {
      baseMtimeMs: (await loadedMtime(h)) - 1000,
      edits: [{ op: "set", path: ["version"], value: "9.9.9" }],
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("changed on disk");
    expect(readFileSync(join(dir, "capability.yaml"), "utf8")).toBe(before);
    rmSync(dir, { recursive: true, force: true });
  });

  it("400s a bad edit (remove of a missing key) and leaves the file untouched", async () => {
    const dir = exampleCopy();
    const before = readFileSync(join(dir, "capability.yaml"), "utf8");
    const h = await studio({ dir });
    const res = await put(h, {
      baseMtimeMs: await loadedMtime(h),
      edits: [{ op: "remove", path: ["sources", "store", "nope"] }],
    });
    expect(res.status).toBe(400);
    expect(readFileSync(join(dir, "capability.yaml"), "utf8")).toBe(before);
    rmSync(dir, { recursive: true, force: true });
  });

  it("400s a malformed body", async () => {
    const dir = exampleCopy();
    const h = await studio({ dir });
    for (const bad of [
      { edits: "not-an-array", baseMtimeMs: 1 },
      { edits: [{ op: "set", path: "not-a-path", value: 1 }], baseMtimeMs: 1 },
      { edits: [{ op: "set", path: ["a"], value: { nested: true } }], baseMtimeMs: 1 },
      { edits: [] },
    ]) {
      const res = await put(h, bad);
      expect(res.status).toBe(400);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("GET /api/env-status", () => {
  it("reports every referenced ${VAR} as resolved or missing, never values", async () => {
    const h = await studio({
      dir: exampleDir,
      env: { STRAVA_TOKEN: "secret-token" },
    });
    const res = await fetch(`${h.url}/api/env-status`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { vars: Record<string, boolean> };
    expect(body.vars).toEqual({
      STRAVA_TOKEN: true,
      SUPABASE_URL: false,
      SUPABASE_KEY: false,
    });
    expect(JSON.stringify(body)).not.toContain("secret-token");
  });
});

describe("POST /api/source-check", () => {
  const env = {
    STRAVA_TOKEN: "tok-123",
    SUPABASE_URL: "http://db.local",
    SUPABASE_KEY: "key-456",
  };

  function check(h: StudioHandle, body: unknown): Promise<Response> {
    return fetch(`${h.url}/api/source-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("makes one GET through the http adapter and reports ok + status", async () => {
    const calls: { url: string; auth?: string }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        auth: (init?.headers as Record<string, string>)?.Authorization,
      });
      return new Response("[]", { status: 200 });
    }) as typeof fetch;

    const h = await studio({ dir: exampleDir, env, fetchImpl });
    const res = await check(h, { source: "strava", path: "/athlete" });
    expect(res.status).toBe(200);
    expect((await res.json()) as object).toEqual({ ok: true, status: 200 });
    expect(calls).toEqual([
      { url: "https://www.strava.com/api/v3/athlete", auth: "Bearer tok-123" },
    ]);
  });

  it("reports a non-2xx response as ok: false with the status", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 503 })) as typeof fetch;
    const h = await studio({ dir: exampleDir, env, fetchImpl });
    const body = (await (await check(h, { source: "store" })).json()) as {
      ok: boolean;
      status: number;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(503);
    expect(body.error).toContain("503");
  });

  it("reports a missing env var as ok: false without calling out", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("[]", { status: 200 });
    }) as typeof fetch;
    const h = await studio({ dir: exampleDir, env: {}, fetchImpl });
    const body = (await (await check(h, { source: "strava" })).json()) as {
      ok: boolean;
      error: string;
    };
    expect(body.ok).toBe(false);
    expect(body.error).toContain("STRAVA_TOKEN");
    expect(called).toBe(false);
  });

  it("rejects unknown sources and non-http sources", async () => {
    const dir = tempCapability(
      [
        "capability: t",
        "version: 0.0.1",
        "sources:",
        "  db: { type: postgres }",
        "",
      ].join("\n"),
    );
    const h = await studio({ dir });
    const unknown = (await (await check(h, { source: "nope" })).json()) as { ok: boolean; error: string };
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toContain("no such source");
    const nonHttp = (await (await check(h, { source: "db" })).json()) as { ok: boolean; error: string };
    expect(nonHttp.ok).toBe(false);
    expect(nonHttp.error).toContain("http");
    rmSync(dir, { recursive: true, force: true });
  });

  it("400s any method other than GET — connection checks are read-only", async () => {
    const h = await studio({ dir: exampleDir, env });
    const res = await check(h, { source: "store", method: "POST" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("read-only");
  });
});

describe("API misc", () => {
  it("404s an unknown API route as JSON", async () => {
    const h = await studio({ dir: exampleDir });
    const res = await fetch(`${h.url}/api/nope`);
    expect(res.status).toBe(404);
    expect((await res.json()) as object).toHaveProperty("error");
  });
});

describe("static UI serving", () => {
  function tempUi(): string {
    const dir = mkdtempSync(join(tmpdir(), "lathe-studio-ui-"));
    writeFileSync(join(dir, "index.html"), "<html><body>studio</body></html>");
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "assets", "app.js"), "console.log('ui')");
    return dir;
  }

  it("serves index.html at / and assets with content types", async () => {
    const staticDir = tempUi();
    const h = await studio({ dir: exampleDir, staticDir });

    const index = await fetch(`${h.url}/`);
    expect(index.status).toBe(200);
    expect(index.headers.get("content-type")).toContain("text/html");
    expect(await index.text()).toContain("studio");

    const js = await fetch(`${h.url}/assets/app.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("javascript");
    rmSync(staticDir, { recursive: true, force: true });
  });

  it("falls back to index.html for client-side routes (SPA)", async () => {
    const staticDir = tempUi();
    const h = await studio({ dir: exampleDir, staticDir });
    const res = await fetch(`${h.url}/sources`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("studio");
    rmSync(staticDir, { recursive: true, force: true });
  });

  it("does not serve files outside the static dir", async () => {
    const staticDir = tempUi();
    const h = await studio({ dir: exampleDir, staticDir });
    // Encoded traversal: must not escape staticDir; the SPA fallback or a 404
    // are both acceptable — leaked file content is not.
    const res = await fetch(`${h.url}/..%2f..%2fetc%2fpasswd`);
    const text = await res.text();
    expect(text).not.toContain("root:");
    rmSync(staticDir, { recursive: true, force: true });
  });

  it("503s when the UI bundle is absent (built package not present in dev)", async () => {
    const h = await studio({ dir: exampleDir, staticDir: join(tmpdir(), "lathe-no-such-ui") });
    const res = await fetch(`${h.url}/`);
    expect(res.status).toBe(503);
    expect(await res.text()).toContain("not built");
  });
});

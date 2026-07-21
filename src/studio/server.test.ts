import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "../server/build.js";
import { loadManifest } from "../manifest/load.js";
import type { Manifest } from "../manifest/schema.js";
import { ejectCapability } from "./eject.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE_MANIFEST = resolve(REPO_ROOT, "examples", "training-coach", "capability.yaml");
const VENDORED_FILES = ["build.js", "http.js", "pipeline.js", "formula.js", "schema-to-zod.js", "tools.js"];

/**
 * End-to-end proof for Slice 1: the emitted manifest, passed through the
 * same `buildServer` the vendored copy runs, produces the training-coach
 * tool surface the interpreter serves. The vendored `.js` files are
 * separately verified to match the repo's `dist/server/*.js` byte-for-byte,
 * so "source buildServer against emitted manifest" is equivalent to
 * "vendored buildServer against emitted manifest".
 */
describe("eject — training-coach integration", () => {
  it("vendored dist/server/*.js match the repo's dist/server/*.js byte-for-byte", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-int-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
      if (!result.ok) return;

      const repoDist = resolve(REPO_ROOT, "dist", "server");
      const ejectedDist = resolve(tmp, "mcp-server", "dist", "server");
      for (const name of VENDORED_FILES) {
        const source = readFileSync(join(repoDist, name));
        const vendored = readFileSync(join(ejectedDist, name));
        expect(vendored.equals(source), `${name} should be a byte-for-byte copy`).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emitted manifest yields the same tools/list surface the interpreter serves", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-int-"));
    try {
      const eject = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(eject.ok, eject.ok ? "" : eject.error).toBe(true);
      if (!eject.ok) return;

      const emittedModule = await import(
        pathToFileURL(join(tmp, "mcp-server", "dist", "manifest.js")).href
      );
      const emittedManifest = emittedModule.manifest as Manifest;

      const loaded = loadManifest(EXAMPLE_MANIFEST);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;

      // Env vars the training-coach manifest references at buildServer time.
      const env = {
        STRAVA_TOKEN: "test-token",
        SUPABASE_URL: "http://127.0.0.1:65535",
        SUPABASE_KEY: "test-key",
      };
      const log = () => {};

      const emittedResult = buildServer(emittedManifest, { env, log });
      const interpreterResult = buildServer(loaded.manifest, { env, log });

      expect(emittedResult.registered.sort()).toEqual(interpreterResult.registered.sort());
      expect(emittedResult.deferred).toEqual(interpreterResult.deferred);

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      await emittedResult.server.connect(serverTransport);
      const client = new Client({ name: "eject-integration-test", version: "0.0.0" });
      await client.connect(clientTransport);

      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      expect(names).toEqual(["get_history", "import_recent", "save_plan", "weekly_checkin"]);

      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
      expect(byName["get_history"].annotations?.readOnlyHint).toBe(true);
      expect(byName["weekly_checkin"].annotations?.readOnlyHint).toBe(true);
      expect(byName["save_plan"].annotations?.readOnlyHint).toBe(false);
      expect(byName["save_plan"].annotations?.destructiveHint).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadManifest } from "../manifest/load.js";
import { ejectCapability } from "./eject.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMPLE_MANIFEST = resolve(REPO_ROOT, "examples", "training-coach", "capability.yaml");

const VENDORED_FILES = [
  "build.js",
  "http.js",
  "pipeline.js",
  "formula.js",
  "schema-to-zod.js",
  "tools.js",
];

describe("ejectCapability", () => {
  it("emits mcp-server/ with generated files + vendored server modules", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok, result.ok ? "" : result.error).toBe(true);
      if (!result.ok) return;

      const server = join(tmp, "mcp-server");
      expect(existsSync(server)).toBe(true);

      for (const path of [
        "package.json",
        "dist/main.js",
        "dist/manifest.js",
        ...VENDORED_FILES.map((f) => `dist/server/${f}`),
      ]) {
        expect(existsSync(join(server, path)), `${path} should exist`).toBe(true);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a package.json with only sdk + zod (no @lathe/cli, yaml, or commander)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const pkg = JSON.parse(readFileSync(join(tmp, "mcp-server", "package.json"), "utf8"));
      expect(pkg.name).toBe("training-coach-mcp-server");
      expect(pkg.type).toBe("module");
      expect(pkg.bin["training-coach-mcp"]).toBe("./dist/main.js");
      expect(pkg.dependencies).toEqual({
        "@modelcontextprotocol/sdk": "^1.0.0",
        zod: "^3.23.0",
      });
      // The whole point of eject — no lathe on the wire, no manifest parsing.
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      expect(allDeps["@lathe/cli"]).toBeUndefined();
      expect(allDeps.yaml).toBeUndefined();
      expect(allDeps.commander).toBeUndefined();
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("emits a manifest.js that round-trips the parsed manifest", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const loaded = loadManifest(EXAMPLE_MANIFEST);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;

      const emitted = await import(
        pathToFileURL(join(tmp, "mcp-server", "dist", "manifest.js")).href
      );
      expect(emitted.manifest).toEqual(loaded.manifest);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing mcp-server/", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      mkdirSync(join(tmp, "mcp-server"), { recursive: true });
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("refusing");
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails with issue list when the manifest is invalid", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: join(tmp, "no-such-file.yaml"), out: tmp });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.issues).toBeDefined();
      }
      expect(existsSync(join(tmp, "mcp-server"))).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  // ── Slice 2: SKILL.md + references + README ──────────────────────────────

  it("copies SKILL.md next to mcp-server/ and emits mcp-server/README.md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(existsSync(join(tmp, "SKILL.md")), "SKILL.md should be copied").toBe(true);
      const readme = readFileSync(join(tmp, "mcp-server", "README.md"), "utf8");
      // README carries the capability name + the enumerated env-var placeholders.
      expect(readme).toContain("training-coach");
      expect(readme).toContain("SUPABASE_URL");
      expect(readme).toContain("SUPABASE_KEY");
      expect(readme).toContain("STRAVA_TOKEN");
      expect(readme).toContain('"command": "node"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("warns instead of failing when a declared reference is missing", () => {
    // training-coach declares `references: [./methodology.pdf]` but the file
    // isn't present in the repo. The eject should succeed with a warning.
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const result = ejectCapability({ manifestPath: EXAMPLE_MANIFEST, out: tmp });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.warnings.some((w) => w.includes("methodology.pdf"))).toBe(true);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("copies references that exist alongside the manifest", () => {
    // Build a minimal manifest + skill + a real reference file in a tmp dir,
    // then eject from there so the reference resolves.
    const tmp = mkdtempSync(join(tmpdir(), "lathe-eject-"));
    try {
      const src = join(tmp, "src");
      mkdirSync(src);
      writeFileSync(
        join(src, "capability.yaml"),
        [
          "capability: mini",
          "version: 0.0.1",
          "skill: ./SKILL.md",
          "references:",
          "  - ./notes.md",
          "tools:",
          "  - name: ping",
          "    reads:",
          "      source: s",
          "      path: /ping",
          "    readonly: true",
          "sources:",
          "  s: { type: http, base_url: http://x }",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(join(src, "SKILL.md"), "# mini\n", "utf8");
      writeFileSync(join(src, "notes.md"), "hello\n", "utf8");

      const out = join(tmp, "out");
      const result = ejectCapability({ manifestPath: join(src, "capability.yaml"), out });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(readFileSync(join(out, "SKILL.md"), "utf8")).toContain("# mini");
      expect(readFileSync(join(out, "references", "notes.md"), "utf8")).toBe("hello\n");
      expect(result.warnings).toEqual([]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

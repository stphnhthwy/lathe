import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifest } from "./load.js";

const here = dirname(fileURLToPath(import.meta.url));
const exampleYaml = readFileSync(
  resolve(here, "../../examples/training-coach/capability.yaml"),
  "utf8",
);

describe("validateManifest", () => {
  it("accepts the canonical training-coach example", () => {
    const result = validateManifest(exampleYaml);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.capability).toBe("training-coach");
    }
  });

  it("rejects a manifest missing the required `capability` key", () => {
    const result = validateManifest("version: 0.1.0\nsummary: no name here");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path === "capability")).toBe(true);
    }
  });

  it("rejects a source with an unknown type", () => {
    const result = validateManifest(
      ["capability: x", "version: 0.1.0", "sources:", "  bad:", "    type: carrier-pigeon"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.startsWith("sources.bad.type"))).toBe(true);
    }
  });

  it("rejects a tool that declares neither steps nor reads/writes", () => {
    const result = validateManifest(
      ["capability: x", "version: 0.1.0", "tools:", "  - name: orphan"].join("\n"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.path.startsWith("tools.0"))).toBe(true);
    }
  });

  it("reports a clear issue for malformed YAML", () => {
    const result = validateManifest("capability: : :\n  - broken");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].message).toMatch(/YAML parse error/);
    }
  });
});

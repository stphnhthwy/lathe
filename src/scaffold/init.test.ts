import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifest } from "../manifest/load.js";
import { initCapability } from "./init.js";

// Layer-1 (library) tests for the scaffold logic. The key invariant: the
// generated capability.yaml must pass the same validation `lathe check` runs,
// so `init` can never produce a manifest that immediately fails `check`.

describe("initCapability", () => {
  it("scaffolds a valid capability into a new subdir", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-init-"));
    try {
      const result = initCapability({ name: "demo", cwd: tmp });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const dir = join(tmp, "demo");
      for (const file of ["capability.yaml", "SKILL.md", ".env.example", "references/README.md"]) {
        expect(existsSync(join(dir, file)), `${file} should exist`).toBe(true);
      }

      // The invariant: the generated manifest validates, and carries the name.
      const yaml = readFileSync(join(dir, "capability.yaml"), "utf8");
      const validated = validateManifest(yaml);
      expect(validated.ok).toBe(true);
      if (validated.ok) {
        expect(validated.manifest.capability).toBe("demo");
      }

      // SKILL.md frontmatter carries the name too.
      const skill = readFileSync(join(dir, "SKILL.md"), "utf8");
      expect(skill).toContain("name: demo");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("rejects invalid names", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-init-"));
    try {
      for (const name of ["Bad Name", "1bad"]) {
        const result = initCapability({ name, cwd: tmp });
        expect(result.ok, `"${name}" should be rejected`).toBe(false);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("refuses to overwrite an existing capability", () => {
    const tmp = mkdtempSync(join(tmpdir(), "lathe-init-"));
    try {
      // Pre-create the target with a capability.yaml already in place.
      const dir = join(tmp, "demo");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "capability.yaml"), "capability: existing\nversion: 0.0.1\n", "utf8");

      const result = initCapability({ name: "demo", cwd: tmp });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("refusing");
      }
      // Sanity: the pre-existing file is untouched.
      expect(readFileSync(join(dir, "capability.yaml"), "utf8")).toContain("capability: existing");
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

import { resolve } from "node:path";
import type { Command } from "commander";
import { loadManifest } from "../manifest/load.js";

const DEFAULT_MANIFEST = "capability.yaml";

/**
 * `lathe check [path]` — parse + structurally validate a capability manifest.
 *
 * This is STRUCTURAL validation only. A "valid" result means the manifest has
 * the right shape; it does not mean the formulas, JSONPath maps, or
 * source/tool cross-references are sound (that's a later milestone).
 */
export function registerCheck(program: Command): void {
  program
    .command("check")
    .description("Parse and validate a capability manifest (structure only)")
    .argument("[path]", "path to the manifest", DEFAULT_MANIFEST)
    .action((path: string) => {
      const fullPath = resolve(process.cwd(), path);
      const result = loadManifest(fullPath);

      if (result.ok) {
        const name = result.manifest.capability;
        console.log(`✓ ${path} is valid (capability: ${name})`);
        console.log("  note: structural check only — formulas, maps, and cross-refs not yet checked");
        return;
      }

      console.error(`✗ ${path} is invalid:`);
      for (const issue of result.issues) {
        const where = issue.path ? `${issue.path}: ` : "";
        console.error(`  - ${where}${issue.message}`);
      }
      process.exitCode = 1;
    });
}

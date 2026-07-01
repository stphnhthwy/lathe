import { relative } from "node:path";
import type { Command } from "commander";
import { ejectCapability } from "../build/eject.js";

/**
 * `lathe build [path] --eject [--out <dir>]` — emit a standalone
 * `mcp-server/` package (and, in Slice 2, `SKILL.md` + `references/`) that
 * runs the capability without `@lathe/cli`.
 *
 * `build` reserves the subcommand name; today only `--eject` is meaningful.
 * Follows agent-os/standards/cli/commands.md — parse input, call into
 * `src/build/eject.ts`, format output; no manifest parsing or filesystem
 * logic here.
 */
export function registerBuild(program: Command): void {
  program
    .command("build")
    .description("Build a capability into a distributable form. Only --eject is supported today.")
    .argument("[path]", "path to the manifest", "capability.yaml")
    .option("--eject", "emit a standalone mcp-server/ that runs without @lathe/cli")
    .option("--out <dir>", "output directory (default: ./<capability>/)")
    .action((path: string, options: { eject?: boolean; out?: string }) => {
      if (!options.eject) {
        console.error("✗ `lathe build` currently requires --eject.");
        process.exitCode = 1;
        return;
      }

      const result = ejectCapability({ manifestPath: path, out: options.out });

      if (!result.ok) {
        console.error(`✗ ${result.error}`);
        if (result.issues) {
          for (const issue of result.issues) {
            const where = issue.path ? `${issue.path}: ` : "";
            console.error(`  - ${where}${issue.message}`);
          }
        }
        process.exitCode = 1;
        return;
      }

      console.log(`✓ ejected capability to ${result.dir}`);
      for (const file of result.files) {
        console.log(`  - ${relative(result.dir, file)}`);
      }
      for (const warning of result.warnings) {
        console.error(`  ! ${warning}`);
      }
      console.log("\nNext steps:");
      console.log(`  cd ${relative(process.cwd(), result.dir) || "."}/mcp-server`);
      console.log("  npm install");
      console.log("  node ./dist/main.js");
    });
}

import { relative } from "node:path";
import type { Command } from "commander";
import { initCapability } from "../scaffold/init.js";

/**
 * `lathe init <name>` — scaffold a new capability into `./<name>/`.
 *
 * Parses input and formats output only; the scaffolding logic lives in
 * `src/scaffold/init.ts` (see agent-os/standards/cli/commands.md). This is a
 * write command, but it refuses to clobber an existing capability rather than
 * prompting — there is nothing to confirm when it never overwrites.
 */
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Scaffold a new capability (capability.yaml, SKILL.md, references/, .env.example)")
    .argument("<name>", "capability name (kebab-case); also the new folder name")
    .action((name: string) => {
      const result = initCapability({ name });

      if (!result.ok) {
        console.error(`✗ ${result.error}`);
        process.exitCode = 1;
        return;
      }

      console.log(`✓ created capability "${name}" in ${result.dir}`);
      for (const file of result.files) {
        console.log(`  - ${relative(result.dir, file)}`);
      }
      console.log("\nNext steps:");
      console.log(`  cd ${name}`);
      console.log("  edit capability.yaml and SKILL.md");
      console.log("  lathe check");
    });
}

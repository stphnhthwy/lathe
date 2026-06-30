import { resolve } from "node:path";
import type { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadManifest } from "../manifest/load.js";
import { buildServer } from "../server/build.js";

const DEFAULT_MANIFEST = "capability.yaml";

/**
 * `lathe serve [path]` — read a capability manifest and serve it as an MCP
 * server over stdio.
 *
 * STDIO HYGIENE: the MCP protocol speaks over stdout, so every diagnostic
 * (banner, deferred-tool notices, validation errors) goes to stderr. Writing to
 * stdout here would corrupt the stream.
 */
export function registerServe(program: Command): void {
  program
    .command("serve")
    .description("Serve a capability manifest as an MCP server over stdio")
    .argument("[path]", "path to the manifest", DEFAULT_MANIFEST)
    .action(async (path: string) => {
      const fullPath = resolve(process.cwd(), path);
      const result = loadManifest(fullPath);

      if (!result.ok) {
        console.error(`✗ ${path} is invalid:`);
        for (const issue of result.issues) {
          const where = issue.path ? `${issue.path}: ` : "";
          console.error(`  - ${where}${issue.message}`);
        }
        process.exitCode = 1;
        return;
      }

      const { capability, version } = result.manifest;
      console.error(`lathe serve — ${capability} v${version}`);

      const { server, registered } = buildServer(result.manifest); // deferred notices → stderr
      console.error(`  serving ${registered.length} tool(s): ${registered.join(", ") || "(none)"}`);

      await server.connect(new StdioServerTransport());
    });
}

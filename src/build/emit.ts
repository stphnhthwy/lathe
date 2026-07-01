import type { Manifest } from "../manifest/schema.js";

/**
 * Template strings for the ejected `mcp-server/` package. Kept inline (no
 * fixture files) so everything ships via `dist/` with no `files` change —
 * same convention as `src/scaffold/templates.ts`.
 */

/** Collect every `${VAR}` env reference inside the manifest, sorted + deduped. */
export function envVarsIn(manifest: Manifest): string[] {
  const found = new Set<string>();
  const pattern = /\$\{([A-Z_][A-Z0-9_]*)\}/g;
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      for (const match of value.matchAll(pattern)) found.add(match[1]);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value && typeof value === "object") {
      for (const v of Object.values(value as Record<string, unknown>)) walk(v);
    }
  };
  walk(manifest);
  return Array.from(found).sort();
}

/** The generated `dist/main.js` — imports the vendored buildServer + hardcoded manifest, connects stdio. */
export function mainJs(): string {
  return `#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./server/build.js";
import { manifest } from "./manifest.js";

// Stdio hygiene: the MCP protocol speaks over stdout; every diagnostic (banner,
// deferred notices, errors) goes to stderr. Writing to stdout here would
// corrupt the stream.
console.error(\`\${manifest.capability} v\${manifest.version} — standalone mcp-server\`);

const { server, registered } = buildServer(manifest);
console.error(\`  serving \${registered.length} tool(s): \${registered.join(", ") || "(none)"}\`);

await server.connect(new StdioServerTransport());
`;
}

/** The generated `dist/manifest.js` — the validated manifest as a JS literal. */
export function manifestJs(manifest: Manifest): string {
  return `export const manifest = ${JSON.stringify(manifest, null, 2)};\n`;
}

/**
 * The generated `package.json` for the ejected `mcp-server/`. Deps are exactly
 * the ones `buildServer` and stdio need: no `@lathe/cli`, no `yaml` (the
 * manifest is a JS literal), no `commander` (no CLI).
 */
export function packageJson(manifest: Manifest): string {
  const pkg = {
    name: `${manifest.capability}-mcp-server`,
    version: manifest.version,
    description: `${manifest.capability} — standalone MCP server, ejected by lathe`,
    type: "module",
    bin: {
      [`${manifest.capability}-mcp`]: "./dist/main.js",
    },
    main: "./dist/main.js",
    files: ["dist"],
    engines: { node: ">=18" },
    scripts: {
      start: "node ./dist/main.js",
    },
    dependencies: {
      "@modelcontextprotocol/sdk": "^1.0.0",
      zod: "^3.23.0",
    },
  };
  return JSON.stringify(pkg, null, 2) + "\n";
}

/**
 * The generated `mcp-server/README.md` — run instructions + a
 * copy-pasteable `claude_desktop_config.json` snippet that points at
 * `node <abs>/dist/main.js` (no `@lathe/cli`). The `env:` block enumerates
 * the `${VAR}` references the manifest actually uses.
 */
export function readmeMd(manifest: Manifest): string {
  const cap = manifest.capability;
  const envVars = envVarsIn(manifest);
  const envBlock =
    envVars.length === 0
      ? ""
      : `,\n      "env": {\n${envVars.map((v) => `        "${v}": "<value>"`).join(",\n")}\n      }`;

  return `# ${cap} — standalone MCP server

Ejected from a lathe capability manifest. Runs without \`@lathe/cli\`; only
\`@modelcontextprotocol/sdk\` and \`zod\` are needed at runtime.

## Run

\`\`\`bash
npm install
node ./dist/main.js
\`\`\`

The server speaks the MCP protocol over stdio. The stderr banner
(\`${cap} v${manifest.version} — standalone mcp-server\` + tool count) is a
sanity check that the manifest loaded and every tool registered.

## Connect to Claude Desktop

Add this block to \`claude_desktop_config.json\` (macOS:
\`~/Library/Application Support/Claude/claude_desktop_config.json\`; Windows:
\`%APPDATA%\\Claude\\claude_desktop_config.json\`) and restart the app. Use the
absolute path to \`dist/main.js\` — Claude Desktop's cwd is not this directory.

\`\`\`json
{
  "mcpServers": {
    "${cap}": {
      "command": "node",
      "args": ["<absolute-path>/dist/main.js"]${envBlock}
    }
  }
}
\`\`\`

${envVars.length === 0 ? "" : `Values for the \`env:\` block are the \`\${VAR}\` references your capability's sources use. The subprocess Claude Desktop spawns does not inherit your shell, so set them here — a \`.env\` file will not be read.\n\n`}## Troubleshooting

- Tools don't appear in Claude Desktop → run \`node ./dist/main.js\` directly
  in a terminal to see the stderr banner + any registration error.
- \`Cannot find module '@modelcontextprotocol/sdk/...'\` → \`npm install\` was
  skipped inside \`mcp-server/\`.
`;
}

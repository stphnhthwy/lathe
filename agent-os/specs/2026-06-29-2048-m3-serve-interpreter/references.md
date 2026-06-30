# References

Pointers into the codebase and prior artifacts that shaped this spec.

- **`src/commands/check.ts`** and **`src/commands/init.ts`** — the command pattern to mirror.
  `registerX(program)` registers a subcommand; the action resolves input, calls a library
  function, formats output, and sets `process.exitCode = 1` on failure. `src/commands/serve.ts`
  follows the same shape (but connects a long-lived stdio transport instead of exiting).
- **`src/manifest/load.ts`** — exports `loadManifest(path)` / `validateManifest(yamlText)`.
  `serve` reuses `loadManifest`; on failure it formats issues to stderr (same shape as `check`)
  and exits non-zero before any transport opens.
- **`src/scaffold/init.ts` + `src/index.ts`** — M2 confirmed the layering: a library module
  under `src/` does the work and is re-exported from `index.ts` for testing. `buildServer` and
  the http `request` helper get the same treatment.
- **`examples/training-coach/capability.yaml`** — the canonical fixture. Its tools cover every
  classification: `get_history` (atomic read), `save_plan` (atomic write), `import_recent`
  (pipeline → Slice 2), `weekly_checkin` (metric reads → Slice 3). The `store` source
  (PostgREST over `${SUPABASE_URL}/rest/v1`) is the live verification target.
- **`@modelcontextprotocol/sdk@1.29.0`** (installed) — `server/mcp.js` (`McpServer`,
  `registerTool`), `server/stdio.js` (`StdioServerTransport`), `inMemory.js`
  (`InMemoryTransport.createLinkedPair`), `client/index.js` (`Client`). Verified the
  `registerTool` config shape and `ToolAnnotations` fields against the installed `.d.ts`.
- **`src/cli.test.ts`** — the layer-2 (CLI) test pattern: build first, spawn the real
  `dist/cli.js`, assert exit codes + stdout/stderr. Extended for `serve --help` and the
  invalid-manifest path.

# Shape — M3 `lathe serve` (interpreter)

## Scope

M3 of the lathe build order: a generic server that reads `capability.yaml` and stands up a
real MCP server — the first milestone where lathe *executes* rather than just validating.
This completes the Prisma-like inner loop: `init` → edit → `check` → **`serve`**.

M3 is split into **three vertical slices** that all land before M4 (connect to Claude):

1. **Slice 1 (this pass)** — `lathe serve` over stdio, the `http` source adapter, and
   **atomic** `reads`/`writes` tools registered on the official MCP SDK. End-to-end against a
   real local PostgREST. Tools fully working: `get_history`, `save_plan`.
2. **Slice 2** — declared **pipelines** (`steps`, `for_each`, `map`/JSONPath, `prefer`
   upsert). Makes `import_recent` callable.
3. **Slice 3** — the **locked-compute / formula engine** (`sum/avg/min/max/last`, windows,
   ratios, `delta`) and frozen `behavior.computed_locked`. Makes `weekly_checkin` callable.

Out of scope for M3: OAuth *refresh*; `mcp`/`postgres`/`sqlite` source adapters (http only);
M4 connect-to-Claude; M5 `build --eject`; richer formula grammar / branching (Phase 2).

## Confirmed decisions

1. **Vertical slice first.** Build serve + http adapter + atomic tools end-to-end before
   pipelines or the formula engine. Pipeline tools and metric-reading tools are recognized and
   **surfaced as deferred at startup** (to stderr) — never silently dropped, never crashed on.
2. **Locked compute is its own slice.** The formula engine and frozen `computed_locked` land
   after the http/MCP plumbing is proven (Slice 3), not interleaved into Slice 1.
3. **Verify against a real local PostgREST.** The user has a local Supabase; the live MCP
   smoke test points a `store` source at it. Automated tests stay **self-contained** (an
   in-process mock http server), never depending on the live service.

## Context

- **Visuals:** none.
- **References:** `src/commands/check.ts` / `src/commands/init.ts` (the command pattern to
  mirror); `src/manifest/load.ts` (`loadManifest`, reused by `serve`);
  `examples/training-coach/capability.yaml` (the fixture whose tools drive the tests).
- **Product alignment:** roadmap M3 (`serve` interpreter) — "a generic server reads the
  manifest, registers tools (official MCP SDK, zod input schemas, `confirm`/`readonly`
  annotations), and runs locked compute. Wire the `http` adapter against local PostgREST first."

## Key technical notes

- Installed `@modelcontextprotocol/sdk@1.29.0`: `new McpServer({ name, version })` +
  `registerTool(name, { description, inputSchema, annotations }, cb)`; `ToolAnnotations` has
  `readOnlyHint`/`destructiveHint` (no native "confirm"). `StdioServerTransport` for the real
  serve; `InMemoryTransport.createLinkedPair()` + `Client` for in-process tests.
- **stdio hygiene:** the protocol speaks over **stdout**; every diagnostic (banner, deferred
  notices, errors) goes to **stderr** or it corrupts the stream.
- `buildServer(manifest)` is **pure** — returns a configured `McpServer`, opens no transport —
  so it is testable via an in-memory client without a subprocess.

## Standards Applied

- **`agent-os/standards/cli/commands.md`** — `src/commands/serve.ts` is a thin wrapper; logic
  lives in `src/server/*`. readonly→`readOnlyHint`, write/confirm→`destructiveHint` carries the
  read-vs-write distinction from CLI to emitted tool.
- **`agent-os/standards/testing/tdd.md`** — tests ship with the feature; the example capability
  is the fixture; test the contract (which tools register, that a read hits the adapter), not
  message wording.
- **`agent-os/standards/testing/packaging.md`** — library + CLI layers run in `npm test`;
  automated tests use an in-process mock http server, not a live Supabase.
- **`agent-os/standards/manifest/spec-not-code.md`** — the manifest declares, lathe executes;
  the declare/defer dial; locked compute is frozen (engine in Slice 3, framing preserved).

# M6 — eject HTTP entrypoint: emit `dist/main-http.js`

## Context

M5's ejected `mcp-server/` runs without lathe, but only for a client that
launches it as a subprocess and speaks stdio (Claude Desktop). A hosted
capability — remote connector, team-shared server, long-running container —
needs Streamable HTTP. The gap is exactly two things the eject doesn't emit:
an HTTP entrypoint and docs for running it. M6 adds the entrypoint; the
deployment rail around it (containerization, registry, orchestration) stays a
consumer concern by decision (see `shape.md` and `agent-os/decisions.md`,
2026-07-17).

The design fact that makes this cheap: `buildServer` (`src/server/build.ts:43`)
is pure and transport-agnostic — it registers tools and returns an `McpServer`
without opening a transport. The stdio `main.js` is one wiring of it; M6 emits
a second wiring, nothing more.

## Recommended approach

Add one generated template (`mainHttpJs()`) beside `mainJs()` in
`src/build/emit.ts`, join it to the eject `files` array, and extend the emitted
`package.json`/`README.md` and the CLI "Next steps" copy. No vendored-runtime
changes, no new dependencies in the ejected package (the SDK already ships
`StreamableHTTPServerTransport`), no manifest grammar changes.

`main-http.js` shape (stateless, per the SDK's stateless pattern):

- `node:http` server; `PORT` env, default 3000.
- `GET /health` → `200 {"status":"ok"}` (no MCP involvement — orchestrator
  healthchecks must not depend on protocol state).
- `ALL /mcp` → construct `buildServer(manifest)` + a
  `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` per
  request, `server.connect(transport)`, `transport.handleRequest(req, res)`.
- Anything else → 404.
- Startup banner + `listening on :<port>` to **stderr**; nothing ever writes
  to stdout.

## Files affected

### Modified
- `src/build/emit.ts` — add `mainHttpJs()`; `packageJson()` gains
  `"start:http": "node ./dist/main-http.js"`; `readmeMd()` gains a
  "Run over HTTP" section (routes, `PORT`, single-tenant caveat).
- `src/build/eject.ts` — add `[<dist>/main-http.js, mainHttpJs()]` to the
  `files` array (currently `eject.ts:64-69`).
- `src/commands/build.ts` — "Next steps" block lists both run modes
  (`node ./dist/main.js` for stdio, `npm run start:http` for HTTP).
- `src/build/eject.test.ts` — emitted file list, `package.json` scripts,
  README section assertions.

### New
- `src/build/eject-http-integration.test.ts` — boot the emitted server and
  exercise it over real HTTP (see Verification; mirror the eject/e2e approach
  in `src/build/eject-integration.test.ts` for locating the emitted tree and
  resolving the SDK from the repo's `node_modules`).

### Spec
- `agent-os/specs/2026-07-17-2332-m6-eject-http/` — this folder.

## Architecture — where new code goes

Everything lands in the existing `src/build/` emit layer. `mainHttpJs()` is a
static template string exactly like `mainJs()` — no interpolation; the
manifest arrives via the emitted `manifest.js` at runtime. The vendored
`dist/server/*.js` files are untouched: the HTTP entrypoint imports the same
`buildServer` the stdio one does. No new module directories, no changes under
`src/server/` or `src/manifest/`.

## Tasks

### Task 1 — Save spec documentation
1. This folder: `plan.md`, `shape.md`, `standards.md`, `references.md`.
2. Roadmap: add M6 under Phase 2 in `agent-os/product/roadmap.md`.
3. Decision entry in `agent-os/decisions.md` (2026-07-17 — HTTP entrypoint is
   upstream; deployment rail is personal).

### Task 2 — Emit `main-http.js`
1. Write the `eject.test.ts` assertions first: `dist/main-http.js` in the
   emitted file list; `start:http` script; README "Run over HTTP" section.
2. Add `mainHttpJs()` to `src/build/emit.ts` per the shape above.
3. Join it to the `files` array in `src/build/eject.ts`.
4. Extend `packageJson()` and `readmeMd()`.

### Task 3 — Integration test over real HTTP
1. Eject `examples/training-coach/` to a temp dir (existing test helper
   pattern), start the emitted `main-http.js` as a subprocess on an ephemeral
   `PORT`.
2. `fetch` `GET /health` → 200 `{"status":"ok"}`.
3. POST an MCP `initialize` + `tools/list` to `/mcp` → the same four
   training-coach tools the stdio entrypoint serves.
4. Unknown path → 404; process exits cleanly on SIGTERM.

### Task 4 — CLI copy + live smoke
1. Update the "Next steps" block in `src/commands/build.ts`.
2. Live smoke: eject, `npm install` in the emitted `mcp-server/`,
   `npm run start:http`, connect MCP Inspector over Streamable HTTP, call
   `get_history` + `weekly_checkin` against local PostgREST (same target as
   the M4/M5 smokes). Record the trace in `references.md` and flip the
   roadmap line.

## Verification

1. `npm test` — emit/eject unit tests plus the new HTTP integration test, all
   green.
2. Emitted-artifact check (packaging discipline): fresh eject →
   `npm install` inside `mcp-server/` with `@lathe/cli` absent globally →
   `npm run start:http` serves `/health` and `/mcp`.
3. **Live smoke (the M6 acceptance):** MCP Inspector connected over Streamable
   HTTP to the emitted server; `get_history` round-trips PostgREST;
   `weekly_checkin` returns `computed_locked` metrics frozen. Trace lands in
   `references.md`.

## Out of scope — later milestones

- Dockerfile / CI / compose emission (consumer's deployment rail).
- Auth and per-request identity (JWT forwarding through the http source
  adapter; RLS-scoped multi-tenant capabilities) — its own milestone.
- `lathe serve --http` for the dev loop — stdio + Inspector covers it until
  real friction says otherwise.
- Single-file bundling of the ejected server (esbuild) — unchanged from M5's
  out-of-scope list.

## Standards that apply

See `standards.md` — `cli/commands`, `testing/tdd`, `testing/packaging`,
`global/commits`, `manifest/spec-not-code`.

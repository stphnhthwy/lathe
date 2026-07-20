# References for M6 — eject HTTP entrypoint

## Existing lathe surface — reused, unchanged

### `buildServer` — transport-agnostic by design
- **Location:** `src/server/build.ts:43` (`buildServer(manifest, options)`)
- **Relevance:** Pure — registers tools and returns an `McpServer`; opens no
  transport and does no I/O of its own. This is the design fact that makes M6
  a template, not a runtime change: `main-http.js` is a second wiring of the
  same vendored `buildServer` the stdio `main.js` already calls. Being cheap
  to construct is also what permits the stateless per-request pattern.

### `mainJs()` — the emit template `mainHttpJs()` mirrors
- **Location:** `src/build/emit.ts:31`
- **Relevance:** Static string, zero interpolation — the manifest arrives via
  the emitted `dist/manifest.js` at runtime. `mainHttpJs()` follows the same
  discipline: banner and diagnostics to stderr, protocol never on stdout.

### `ejectCapability` — the `files` array the new emit joins
- **Location:** `src/build/eject.ts:64-69`
- **Relevance:** Emitted files are declared as `[path, contents]` pairs;
  M6 adds one entry (`dist/main-http.js`). `packageJson()` and `readmeMd()`
  in `emit.ts` grow the `start:http` script and the "Run over HTTP" section.

### `src/build/eject-integration.test.ts` — the emitted-artifact test pattern
- **Location:** `src/build/eject-integration.test.ts`
- **Relevance:** Precedent for testing the *emitted* tree rather than the
  repo's code — locating the eject output and resolving
  `@modelcontextprotocol/sdk` from the repo's `node_modules` without a full
  `npm install`. The M6 HTTP integration test mirrors this, adding an
  ephemeral-`PORT` subprocess boot and `fetch` assertions.

## Prior art

### Personal `mcp` repo — Streamable HTTP + `/health` in production
- **Location:** `/Users/stephenhathaway/Development/mcp/src/transports/http.ts`
  (and its Dockerfile / compose service on the stack)
- **Relevance:** A working Streamable HTTP MCP server already deployed on the
  self-hosted stack — proof of the target shape (`/mcp` endpoint, `/health`
  for the compose healthcheck, `PORT` env). Equally important as a **boundary
  marker**: everything around that file — express, JWT verification, GHCR
  workflow, compose entry, tailnet posture — is the personal deployment rail
  M6 deliberately does *not* emit. Note the ejected entrypoint uses
  `node:http`, not express, to keep ejected deps at sdk + zod.

## Prior spec pattern

### M5 spec folder
- **Location:** `agent-os/specs/2026-07-01-1217-m5-build-eject/`
- **Relevance:** Same four files, same snapshot-standards-inline convention;
  its `references.md` "Live smoke run" section is the trace format M6's
  Task 4 smoke should mirror.

## Runtime target for the live smoke

### Local Supabase / PostgREST
- **Location:** `~/.claude/projects/-Users-stephenhathaway-Development-lathe/memory/stack-postgrest-testing.md`
- **Relevance:** Same target as the M3/M4/M5 smokes — `SUPABASE_URL=http://localhost:8000`,
  the `sb_secret_…` key from `stack/.env`, server-internal `session`/`plan_week`
  tables. The M6 smoke connects MCP Inspector over Streamable HTTP instead of
  launching a subprocess.

## External docs

### MCP Streamable HTTP transport
- **Location:** https://modelcontextprotocol.io/docs/concepts/transports (and
  the SDK's `StreamableHTTPServerTransport`, including the stateless
  `sessionIdGenerator: undefined` pattern in the typescript-sdk README)
- **Relevance:** The spec M6's `/mcp` endpoint implements; the stateless
  pattern is what `main-http.js` follows — new server + transport per request,
  no session store.

---

## Live smoke run (Inspector over HTTP)

_TODO — after implementation: fresh eject of `examples/training-coach/`,
`npm install` inside the emitted `mcp-server/` with `@lathe/cli` absent
globally (`npm ls -g @lathe/cli` empty), `npm run start:http`, connect MCP
Inspector via Streamable HTTP to `http://localhost:3000/mcp`, verify
`GET /health` → `{"status":"ok"}`, call `get_history` + `weekly_checkin`
against local PostgREST per `memory/stack-postgrest-testing.md`. Record the
trace here and flip the roadmap line._

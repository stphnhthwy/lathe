# M3 — `lathe serve` (interpreter): vertical slice

## Context

M0–M2 are done and on `main`: a publishable package (`@lathe/cli`), `lathe check` (structural
manifest validation), and `lathe init` (scaffold). **M3 is the first milestone where lathe
*executes*** — a generic server reads `capability.yaml` and stands up a real MCP server.

The roadmap (`agent-os/product/roadmap.md`) defines M3 as: a generic server that reads the
manifest, registers tools (official MCP SDK, zod input schemas, `confirm`/`readonly`
annotations), runs locked compute, and wires the `http` adapter **against local PostgREST
first**, then real APIs.

M3 is large, so it is split into **three vertical slices** that together complete the
milestone before M4 (slice boundaries confirmed with the user). All three land before we move
to M4; this document plans all three, and the immediate work is Slice 1.

### M3 slice roadmap
- **Slice 1 — serve + http adapter + atomic tools (this pass, detailed below).** `lathe serve`
  over stdio; the `http` adapter; atomic `reads`/`writes` tools registered on the MCP SDK with
  zod inputs and `readonly`/`confirm` annotations; verified against the user's local PostgREST.
  Pipeline tools and metric-reading tools are **surfaced as deferred at startup**, not dropped
  or crashed on. Tools that fully work this slice: `get_history`, `save_plan`.
- **Slice 2 — declared pipelines.** Linear `steps` execution: `call` + `as`, `for_each`,
  `map` (JSONPath `$.field` + simple expressions), `prefer` upsert. Turns the deferred
  `import_recent` into a callable tool. (Tasks 7–8.)
- **Slice 3 — locked compute / formula engine.** The tiny formula grammar
  (`sum/avg/min/max/last`, windows, ratios, `delta`), `schema` derived fields, and frozen
  `behavior.computed_locked`. Turns the deferred `weekly_checkin` (metric reads) into a
  callable tool returning authoritative numbers. (Tasks 9–10.)

After Slice 3, every tool in the example capability is callable and M3 is complete → M4
(connect to Claude) talks to exactly this server.

The end-to-end outcome of Slice 1 alone: edit `capability.yaml` → `lathe serve` → an MCP
client can list the capability's atomic tools and actually call them against a real PostgREST
store.

## Architecture (follows the established `check`/`init` pattern)

Command file = thin wrapper → library module under `src/` → re-exported from `index.ts` →
tested at library + CLI layers. Logic stays out of the command file
(`agent-os/standards/cli/commands.md`).

New modules:

```
src/commands/serve.ts        thin wrapper: lathe serve [path] → loadManifest → buildServer → StdioServerTransport
src/server/build.ts          buildServer(manifest) → configured McpServer (PURE: no transport, no I/O) — the testable core
src/server/tools.ts          classify + map a manifest tool → { name, config, handler }; mark deferred tools
src/server/http.ts           http source adapter: env resolution, auth/header build, request(); throws clear errors
src/server/schema-to-zod.ts  minimal entity schema (string/int/date/datetime/enum) → zod object, for write inputs
```

`src/index.ts` re-exports `buildServer` and the http `request` helper (library face, testable).

### Key API facts (verified against installed `@modelcontextprotocol/sdk@1.29.0`)
- `new McpServer({ name, version })` then `server.registerTool(name, { description, inputSchema, annotations }, cb)`.
- `ToolAnnotations` carries `readOnlyHint` / `destructiveHint` (no native "confirm" — the
  client decides confirmation from the hints; this matches the CLI standard's read-vs-write rule).
- Real transport: `StdioServerTransport` (`server/stdio.js`); `await server.connect(transport)`.
- Tests: `InMemoryTransport.createLinkedPair()` + `Client` — drive the built server in-process,
  no subprocess/real client needed.
- Node 18+ global `fetch` is available — no HTTP dependency to add.

### Tool mapping (this slice)
- **Atomic read** — `reads: { source, path, query }`, `readonly: true` → GET; annotation
  `readOnlyHint: true`; declared `query` is sent as-is; no required input args.
  (e.g. `get_history`.)
- **Atomic write** — `writes: { source, path }`, `confirm: true` → POST with the tool input as
  the JSON body; annotations `readOnlyHint: false`, `destructiveHint: true`; input schema derived
  from `schema.<entity>` via the minimal schema-to-zod mapper. (e.g. `save_plan`.)
- **Deferred** — a tool with `steps` (pipeline) or whose `reads` is an array of **metric
  names** (locked compute). Logged to **stderr** at startup as "deferred (not in this build)";
  not registered as callable.

### Critical detail: stdio hygiene
A stdio MCP server speaks the protocol over **stdout** — any stray `console.log` to stdout
corrupts it. All diagnostics (startup banner, deferred-tool notices, errors) go to **stderr**.

## Tasks — Slice 1 (this pass)

### Task 1 — Save spec documentation
Create `agent-os/specs/2026-06-29-2048-m3-serve-interpreter/` (matches the M2 folder
convention) with `plan.md` (this plan), `shape.md` (scope + the three confirmed decisions),
`standards.md` (full text of the standards below), `references.md` (M2 `check`/`init` as the
pattern to mirror; the example capability as fixture).

### Task 2 — `http` source adapter (`src/server/http.ts` + tests)
- `resolveEnv(value)`: replace `${VAR}` with `process.env.VAR`; throw a clear, specific error
  naming the missing var.
- `buildAuthHeaders(source)`: `auth.kind: bearer|oauth2` → `Authorization: Bearer <token>`;
  merge `source.headers` (e.g. Supabase `apikey`); resolve `${...}` in all of these. OAuth
  *refresh* is explicitly out of scope (Phase 2).
- `request({ source, method, path, query, body, prefer })`: compose `base_url` + `path` +
  serialized PostgREST query (`?order=logged_at.desc&limit=60`), set `Prefer` header when given,
  `fetch`, parse JSON, throw a clear error on non-2xx (status + body snippet).
- Tests: spin up an **in-process Node `http` mock server** (self-contained, CI-safe) and assert
  GET query serialization, POST body, auth/`apikey`/`Prefer` headers, env resolution, and the
  missing-env + non-2xx error paths. (Automated tests never depend on a live Supabase.)

### Task 3 — schema → zod for write inputs (`src/server/schema-to-zod.ts` + tests)
- Map a `schema.<entity>` record to a `z.object`: `string`→`z.string()`, `int`→`z.number().int()`,
  `date`/`datetime`→`z.string()` (ISO), `enum[a,b,c]`→`z.enum([...])`.
- `{ derived: ... }` and `ask` fields are **omitted** from the input schema (supplied by
  compute/model later). Unknown types fall back to `z.any()` so it never hard-fails.
- Tests: `plan_week` → expected zod shape; an enum field parses valid / rejects invalid.

### Task 4 — tool classification + registration (`src/server/tools.ts`, `src/server/build.ts` + tests)
- `classifyTool(tool)` → `atomic-read` | `atomic-write` | `deferred` (pipeline or metric-array reads).
- `buildServer(manifest)`: construct `McpServer({ name: capability, version })`; for each atomic
  tool register `{ description, inputSchema, annotations }` + a handler that calls the http
  adapter and returns a `content` result; collect deferred tools and emit one stderr notice
  listing them. **Pure** — returns the server, opens no transport.
- Handler result shape: a single `text` content block with the JSON response (locked-compute
  framing comes with the deferred formula engine).
- Tests (library): drive `buildServer` with `InMemoryTransport` + `Client`; assert `listTools`
  shows `get_history` (readOnly) and `save_plan` (write/destructive) but **not** the deferred
  `import_recent`/`weekly_checkin`; assert `callTool` on a read hits the http adapter (pointed at
  the Task-2 mock server) and returns its payload.

### Task 5 — `serve` command + CLI wiring (`src/commands/serve.ts`, `src/cli.ts`, `src/index.ts`)
- `registerServe(program)`: `lathe serve [path]` (default `capability.yaml`); `loadManifest`,
  and on validation failure print issues to **stderr** and exit non-zero (reuse `check`'s
  formatting shape); on success `buildServer` and `connect(new StdioServerTransport())`; startup
  banner + deferred notices to **stderr only**.
- Register in `src/cli.ts`; re-export `buildServer` (and the http `request` helper) from
  `src/index.ts`.
- CLI test: extend `src/cli.test.ts` — `lathe --help` lists `serve`; invalid manifest path →
  non-zero exit + clear stderr. (The live stdio loop is covered by the Task-4 in-memory tests,
  not a subprocess.)

### Task 6 — docs + verification
- Mark M3 status in `agent-os/product/roadmap.md` (note the slice landed; pipelines + locked
  compute still open within M3).
- Add a decision-log entry in `agent-os/decisions.md` (e.g. "serve is a pure `buildServer` +
  thin transport; stdout reserved for protocol; deferred tools surfaced, not dropped").

## Tasks — Slice 2 (declared pipelines)

Lands after Slice 1. Promotes pipeline tools from "deferred" to callable; `classifyTool` stops
treating `steps` as deferred.

### Task 7 — pipeline executor (`src/server/pipeline.ts` + tests)
- Run `steps` **linearly** (branching/looping in a pipeline is the signal to escape — enforce
  linear-only per `manifest/spec-not-code.md`).
- Step kinds: `call` (one http request via the Slice-1 adapter, bind result to `as`) and
  `for_each: <bound var>` with a nested `call` (one request per item — fan-out, no branching).
- `map`: response→schema mapping via a tiny extractor — JSONPath-lite `$.field` plus simple
  arithmetic expressions (`"$.moving_time / 60"`); `ask` fields are supplied from tool input.
- `prefer: resolution=merge-duplicates` → `Prefer` header (PostgREST upsert on the dedup key).
- `writes: store.session` (string form) records the write target for annotations.
- Tests: multi-step pipeline + `for_each` fan-out + `map` extraction/expression, against the
  Task-2 in-process mock server; assert request sequence, bodies, and `Prefer` header.

### Task 8 — register pipelines as tools (`src/server/tools.ts`, `build.ts` + tests)
- `classifyTool` → `pipeline`; register `import_recent` as callable; input schema = the `ask`
  fields (e.g. `rpe`); annotations `readOnlyHint: false` (it writes).
- Tests (in-memory client): `import_recent` appears in `listTools` and a `callTool` runs the
  full pipeline against the mock server.

## Tasks — Slice 3 (locked compute / formula engine)

Lands after Slice 2. Promotes metric-reading tools from "deferred" to callable; completes M3.

### Task 9 — formula engine (`src/server/formula.ts` + tests)
- Parse + evaluate the **tiny grammar**: operators `+ - * /`; aggregates
  `sum/avg/min/max/last`; windows (`window: 14d`, `rolling_load(7d)`); ratios (`acwr =
  rolling_load(7d) / rolling_load(28d)`); `delta`. No branching — escape, don't grow it.
- Resolve `schema` derived fields (`load: "duration_min * rpe"`) and `metrics` definitions over
  a set of rows; honor windows by `logged_at`.
- Tests: known fixture rows → **exact** values for `load`, `rolling_load`, `acwr` (contract by
  value, per `testing/tdd.md`).

### Task 10 — frozen computed_locked + metric tools (`src/server/tools.ts`, `build.ts` + tests)
- A tool whose `reads` is a metric-name array (`reads: [rolling_load, acwr]`) becomes callable:
  fetch underlying rows via the adapter, compute metrics, return them **frozen** — the tool
  result marks `behavior.computed_locked` values as authoritative (the model reasons about them,
  never recomputes). Turns `weekly_checkin` callable.
- Tests (in-memory client): `weekly_checkin` lists + calls; result carries the locked metrics
  with the frozen framing; no deferred tools remain for the example capability.

## Verification (end-to-end against the user's local Supabase/PostgREST)

1. **Automated (CI-safe):** `npm test` — library tests (http adapter vs in-process mock,
   schema-to-zod, `buildServer` via in-memory client/server) and CLI tests all green. `npm run build`
   clean.
2. **Live MCP smoke (user's local Supabase):** point a `store` source at the local PostgREST
   (`SUPABASE_URL`, `SUPABASE_KEY` in `.env`); ensure `session`/`plan_week` tables exist. Run
   `lathe serve examples/training-coach/capability.yaml`. Use the MCP Inspector
   (`npx @modelcontextprotocol/inspector`) or a tiny in-repo `Client` script over stdio to:
   `listTools` (see `get_history` readonly + `save_plan` write; deferred tools absent); call
   `get_history` and confirm rows come back from PostgREST; call `save_plan` with a `plan_week`
   row and confirm the POST inserts it. Confirm all diagnostics appear on stderr and stdout
   carries only protocol.
3. **Deferred surfaced, not silent:** startup stderr lists `import_recent` and `weekly_checkin`
   as deferred — no crash, no silent drop.

## Out of scope for M3 (later milestones)
- OAuth *refresh*; `mcp`/`postgres`/`sqlite` source adapters (http only across all M3 slices).
- M4 connect-to-Claude and M5 `build --eject`.
- Richer formula grammar / branching (Phase 2 — escape to code/model is the design).

## Standards that apply
- `cli/commands.md` — one file per command, logic in libraries, readonly-vs-confirm carried
  from CLI to emitted tool.
- `testing/tdd.md` — tests first/alongside; the example capability is the fixture; test the
  contract.
- `testing/packaging.md` — library + CLI layers in `npm test`; keep automated tests
  self-contained (mock http), not dependent on a live service.
- `manifest/spec-not-code.md` — the manifest declares; lathe executes; the declare/defer dial;
  locked compute is frozen (engine deferred, but the framing is preserved).

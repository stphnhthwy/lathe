# Decisions

A chronological log of significant decisions, newest first. Each entry: the decision, why,
and any trade-offs accepted.

## 2026-07-18 — Import semantics from real data: coerce mechanically, skip-and-report, pass through source vocabularies

**Decision.** Three related contract decisions, all forced by running `import_recent`
against real Strava data during the M5 smoke:

1. **The map step coerces resolved bodies toward the write entity's declared schema
   types** — `int` rounds (`moving_time / 60` → 56.1 → 56), `enum[...]` case-folds onto
   a declared value (`"Run"` → `run`). Only mechanical normalizations; anything needing
   judgment stays `ask`. This implements the `coerce` leg of the declare/coerce/ask dial
   the manifest always promised.
2. **A `for_each` row the source rejects is skipped and reported, never fatal.** The
   pipeline result carries `skipped: [{reason}]` alongside `writes`, so the model can
   relay "8 imported, 2 skipped" — while step-level failures (bad auth, unreachable
   source, unbound list) still abort the pipeline.
3. **Source-owned vocabularies pass through; declare enums only for vocabularies the
   capability owns.** Strava's `sport_type` (~50 values Strava controls, e.g.
   `HighIntensityIntervalTraining`, `Yoga`) cannot honestly be projected onto
   `enum[run, ride, hiit, strength]` at write time — and for this capability the enum
   bought nothing: no locked metric filters by sport (`load` is `duration_min * rpe`
   regardless). `session.sport` is now `string` (the example's DB check constraint is
   dropped in the stack repo, migration `20260718001500`); `plan_week.phase` keeps its
   enum because *base/build/peak/taper* is the capability's own model. Classification
   judgment ("does yoga count toward the plan?") happens at read time — the model plus
   `methodology.pdf`, the judgment side of the dial.

**Why.** Real data is the spec check. The first import attempt failed three different
ways (float into int column, case mismatch, batch abort on one Yoga row), and each fix
had to choose semantics. The through-line: reproducible-side machinery must be
mechanical and total (coerce what has one right answer, report what it can't do),
and vocabulary projection is not mechanical — it's either the author's declaration or
the model's judgment, never a silent write-time guess.

**Trade-offs.** A declared value map (`values: {HighIntensityIntervalTraining: hiit}`)
was considered and **deferred** — it's the honest bridge if a future capability needs
locked compute keyed by categories the source doesn't share, but no current capability
does, and the grammar stays tiny until one exists. `skipped` reasons carry raw source
error text (useful, but verbose); trimming is a later polish. Passing vocabularies
through means downstream consumers see source-flavored values — the accepted cost of
"the agent gets the real data."

## 2026-07-17 — The HTTP entrypoint is upstream; the deployment rail is personal

**Decision.** `build --eject` will emit a Streamable HTTP entrypoint
(`dist/main-http.js` — `node:http`, `ALL /mcp` + `GET /health`, `PORT` env)
alongside the stdio `dist/main.js`, always both, no `--transport` flag (M6,
spec at `agent-os/specs/2026-07-17-2332-m6-eject-http/`). lathe does **not**
emit a Dockerfile, CI workflow, compose entry, or any other deployment
scaffolding, and the ejected server stays single-tenant (source credentials
from the `env:` block; no per-request identity).

**Why.** The litmus for what belongs in the open-source package: *would a
lathe user who has never heard of your deployment target need it?* Streamable
HTTP — yes; it is the ecosystem-standard transport for any MCP server not
launched as a desktop subprocess, and without it the ejected "deliverable"
only works next to Claude Desktop. Registry/orchestrator/network choices — no;
they are the consumer's opinion, and emitting them turns lathe into a deploy
tool for one person's stack. Keeping ejected `dependencies` at
`@modelcontextprotocol/sdk` + `zod` forces `node:http` over express.

**Trade-offs.** Consumers hand-write their own container/deploy wrapper (a
few lines; the first-party stack repo does exactly this and doubles as the
dogfood). Anyone reaching the HTTP port can call the tools — acceptable
behind a private network, documented plainly in the emitted README, and the
reason auth/JWT-forwarding is named as its own future milestone rather than
a rider on M6.

## 2026-07-01 — Ejection vendors the interpreter and hardcodes the manifest, not per-tool codegen

**Decision.** `lathe build --eject` emits a standalone `mcp-server/` by (1)
copying lathe's own pre-built `dist/server/*.js` 1:1 into the ejected
`mcp-server/dist/server/`, (2) writing `dist/manifest.js` as a JS literal
(`export const manifest = {...}`), and (3) writing a tiny `dist/main.js` that
imports the vendored `buildServer` + the hardcoded manifest and connects
`StdioServerTransport`. The ejected `package.json` has no `@lathe/cli`, no
`yaml`, no `commander` — only `@modelcontextprotocol/sdk` + `zod`. Slice 2
copies `manifest.skill` (default `./SKILL.md`) to `<out>/SKILL.md` and each
`manifest.references[]` to `<out>/references/`, and emits `mcp-server/README.md`
with a `claude_desktop_config.json` snippet using `command: "node"` +
`args: ["<abs>/dist/main.js"]`.

**Why.** The interpreter modules (`http.ts`, `pipeline.ts`, `formula.ts`,
`tools.ts`, `build.ts`) are already the code you'd write by hand for a custom
MCP server. Generating specialized per-tool handlers would duplicate all of
this logic and open a divergence gap between interpreter and ejection.
Vendoring is deterministic (same manifest → same emit), honest (the ejected
runtime is literally the interpreter, snapshotted), and cheap — Slice 1 is
just three small template files plus a copy. Type-only imports in
`src/server/build.ts` are erased by `tsc`, so `dist/server/*.js` has zero
cross-directory imports; the 1:1 copy needs no path rewriting.

**Trade-offs.** The ejected bundle carries roughly 300 lines of vendored
runtime the user could otherwise skip — an obvious future bundling
optimization (esbuild single-file) but not the M5 shape. Vendored code
drifts by design: once ejected, the bundle is frozen against lathe's
`dist/server/` at eject time, and later interpreter changes do not reach
out and modify their distributable. The `capability.yaml` isn't shipped in
the emitted tree because the manifest is already baked into `manifest.js`
as executable JS; users who want the original YAML for reference can
include their own. Missing references (e.g. training-coach's declared
`methodology.pdf`) surface as `warnings` on the eject result rather than
failing the eject — the ejection still produces a runnable server.

## 2026-07-01 — M4 is docs + live smoke, no new interpreter surface

**Decision.** M4 ships as a `Connect to Claude Desktop` section in `README.md` (config
path, copy-pasteable `claude_desktop_config.json` snippet, `env:` block caveat,
absolute-path caveat, hammer-icon verification, stderr troubleshooting one-liner)
plus a **live end-to-end smoke** of `examples/training-coach/` against local
PostgREST, run through Claude Desktop. No changes under `src/`. Trace captured in
`agent-os/specs/2026-07-01-1200-m4-connect/references.md`: `get_history` round-trips
through the http adapter; `weekly_checkin` returns
`{ computed_locked: true, metrics: { rolling_load, acwr }, note: ... }` — the M3
Slice 3 locked-compute framing survives through the Claude conversation.

**Why.** The whole point of the M3 slicing was to make M4 a paste-and-verify step.
`lathe serve` already reads a manifest, registers every executable tool on the MCP
SDK, and connects `StdioServerTransport`; Claude Desktop's MCP client already knows
how to launch a stdio subprocess and route `tools/list` / `tools/call`. Nothing
lathe-side needs to run for the loop to close — the docs *are* the milestone.
Verifying against the same local Supabase/PostgREST used in the M3 smoke keeps the
wire path identical, so a green M4 smoke really is a green M4.

**Trade-offs.** No `lathe serve --print-config` and no `lathe connect` command, so
users hand-edit `claude_desktop_config.json` and paste absolute paths — accepted
until we see friction. Only Claude Desktop is documented; Claude Code / Cursor /
other clients wait for a real reason to add them. The `import_recent` tool wasn't
exercised in the smoke because it needs a Strava token; the M3 pipeline tests
already cover its behavior, so the M4 acceptance leans on `get_history` +
`weekly_checkin` (frozen locked compute is the invariant M4 had to prove survives
the client hop, and it does).

## 2026-06-29 — Locked compute: a tiny formula engine, rows via the entity's read source (M3 Slice 3)

**Decision.** `behavior.computed_locked` is computed by a small formula engine
(`src/server/formula.ts`) and returned **frozen** — the tool result carries `computed_locked:
true`, the metric values, and a note telling the model to reason about them and not recompute.
The grammar is intentionally tiny: arithmetic `+ - * /`, derived fields over one row
(`duration_min * rpe`), aggregates `sum/avg/min/max/last(entity.field)`, `Nd` windows, and
metric-with-window calls (`rolling_load(7d)`) composed into ratios (`acwr`). A metric-reading
tool fetches its entity's rows from **the source a `readonly` atomic tool already declares for
that entity** (e.g. `session` → `get_history`'s `store /session`); `now` is injected so window
math is reproducible/testable.

**Why.** Frozen locked compute is the product's core guardrail — the reproducible side of the
dial. Deriving the row source from an existing read tool avoids inventing new manifest syntax to
bind a metric to a source (the manifest already says where `session` is read). Injecting `now`
keeps the engine pure and unit-testable to exact values.

**Trade-offs.** The grammar stays deliberately small — no branching, no custom functions, one
window unit (`Nd`); richer needs escape to code, not grammar growth. Metric row fetches pull the
entity's full read path (no windowed server-side filter yet), so very large stores fetch more
than a window needs — fine at M3 scale, an optimization later. An empty window yields 0 (keeps
sums/ratios clean) rather than an error. This completes M3: every tool in the example capability
is callable.

## 2026-06-29 — Declared pipelines are linear-only; `ask` fields are the tool's input (M3 Slice 2)

**Decision.** A tool's `steps` run as a **linear** pipeline: plain `call` steps bind their
result to a variable via `as`, and a `for_each: <var>` fans out one `call` per item. A step's
`map` builds each request body from the current item via **JSONPath-lite** (`$.field`, `$.a.b`)
plus a **tiny arithmetic evaluator** (`+ - * /`, parens) for expressions like `"$.moving_time /
60"`; `prefer` becomes the PostgREST upsert header. Any `map` value of `ask` is filled from the
**tool's input arguments**, and those `ask` keys (typed from the write target's schema entity)
are exactly the pipeline tool's zod input schema.

**Why.** This keeps the reproducible orchestration (fetch → shape → upsert) declared while the
one genuinely deferred value (`rpe`) is asked of the caller — the declare/defer dial at the
orchestration level. Linear-only holds the grammar tiny: branching/looping is the signal to
escape to code or the model, not to grow the pipeline language.

**Trade-offs.** No branching, no conditional steps, no cross-step expression scope beyond `as`
bindings — by design. The arithmetic evaluator is deliberately minimal (numbers + `$.path`
terms); richer formulas belong to the Slice 3 locked-compute engine, not to `map`. A single
`ask` value is applied across every `for_each` item (e.g. one `rpe` for the whole import);
per-item judgment would be a model-chained tool, not a pipeline.

## 2026-06-29 — `serve` is a pure `buildServer` + a thin transport; M3 ships in slices

**Decision.** `lathe serve` is split into a **pure** `buildServer(manifest)` (registers tools on
an `McpServer`, opens no transport, does no I/O) and a thin command that connects a
`StdioServerTransport`. M3 itself ships in three slices — (1) serve + `http` adapter + atomic
`reads`/`writes` tools, (2) declared pipelines, (3) locked-compute formula engine — all before
M4. Slice 1 is done.

**Why.** A pure builder is testable through an in-memory client/server pair
(`InMemoryTransport` + `Client`) with no subprocess, so the whole tool surface is exercised in
fast unit tests. Slicing keeps each PR a real end-to-end loop (edit → serve → call a tool
against PostgREST) instead of one giant interpreter drop.

**Trade-offs / rules.**
- **stdout is reserved for the MCP protocol.** All diagnostics — banner, errors, and the
  deferred-tool notice — go to **stderr**; a stray `console.log` would corrupt the stream.
- **Deferred tools are surfaced, not dropped.** A pipeline (`steps`) or metric-reads tool isn't
  registered yet, but `serve` lists it as deferred at startup so the served surface stays honest.
- **`http` only, no OAuth refresh in M3.** `oauth2` sources are treated as an already-valid
  bearer token; `mcp`/`postgres`/`sqlite` adapters and refresh are later.
- Automated tests use an in-process mock HTTP server (CI-safe); live PostgREST is a manual smoke.

## 2026-06-29 — `lathe init` scaffolds a subdir with a guided, valid template

**Decision.** `lathe init <name>` creates a new `./<name>/` subdirectory and scaffolds a
`capability.yaml`, `SKILL.md`, `.env.example`, and `references/README.md` inside it. The
generated `capability.yaml` is a guided template — a minimal valid core plus commented
examples of every section — that passes `lathe check` as-is. It refuses to overwrite a
directory that already holds a `capability.yaml`.

**Why.** A blank file is a poor starting point; a guided-but-valid template teaches the
manifest shape (the declare/defer dial, quoted `${VAR}` placeholders) while guaranteeing the
inner loop works from the first `check`. Subdir-only keeps `init` non-destructive and defers
the riskier `init .` / `--here` cwd-scaffolding to later. Refusing to clobber means re-running
`init` is always safe.

**Trade-offs.** Templates are inline strings (not files on disk) so they ship via `dist/`
with no `files` change, at the cost of living in TypeScript rather than as editable fixtures.

## 2026-06-29 — ESM-only package, accepted

**Decision.** lathe ships as ESM only (`type: module`); no CommonJS build. The `attw`
warning that CJS consumers can't `require('@lathe/cli')` (dynamic `import()` only) is an
accepted trade-off — most consumers use the `lathe` bin, and dual CJS/ESM publishing is
weight we don't want. Revisit only if a real CJS consumer of the library face appears.

## 2026-06-29 — npm package name: `@lathe/cli`, binary stays `lathe`

**Decision.** Publish under the scoped name `@lathe/cli`; keep the CLI binary named `lathe`.

**Why.** The bare name `lathe` is already taken on npm (an unrelated `lathe@0.4.0` exists).
The scoped `@lathe/cli` is available and mirrors the old working name `@capkit/cli`. The
binary name is independent of the package name, so users still type `npx lathe`.

**Trade-offs.** Install command is `npm i -D @lathe/cli` rather than `npm i -D lathe`. Worth
it to keep the `lathe` invocation that the whole UX is built around.

## 2026-06-29 — Interpret first, eject later

**Decision.** Build a generic interpreter (`lathe serve` reads the manifest at runtime and
stands up the server) before building `build --eject` (emit standalone code).

**Why.** The interpreter is the shortest path to a real end-to-end loop — edit YAML, serve,
talk to Claude. Once it works, ejecting to standalone code is mechanical. Doing it the other
way would mean designing the emitted-code shape before we know the runtime is right.

**Trade-offs.** The interpreter carries lathe as a runtime dependency until a capability is
ejected. Acceptable for the dev loop; ejection removes it for distribution.

## 2026-06-29 — The manifest is a spec; lathe is the engine

**Decision.** The capability manifest (`capability.yaml`) is declarative and **never
executes**. lathe reads the declaration and runs real code on the user's behalf — like a
Prisma schema generating SQL, or a Dockerfile building an image.

**Why.** This is the core of the product. It keeps the reproducible side (locked compute,
declared pipelines) cleanly separated from the judgment side (what the model decides), and
makes capabilities reviewable as data, not code. Locked compute is returned **frozen** so
the model reasons about authoritative numbers instead of re-deriving them.

**Trade-offs.** The declarative grammar must stay tiny — a few operators, `sum/avg/min/max/
last`, windows, ratios. The moment a capability needs branching or richer logic, it escapes
to code or to the model rather than growing the grammar.

## 2026-06-29 — License: MIT

**Decision.** MIT license, copyright Stephen Hathaway, 2026.

**Why.** Lightweight, permissive, and the common default for OSS developer tooling — fewest
obligations for adopters.

## 2026-06-29 — Name: `lathe` (formerly `capkit`)

**Decision.** The project and CLI are named `lathe`. The design docs that seeded the project
called it `capkit`; that is the old name.

**Why.** A lathe shapes raw stock into a precise, repeatable form — which is what the tool
does to a capability manifest. Treat any remaining `capkit` references as historical.

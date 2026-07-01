# Decisions

A chronological log of significant decisions, newest first. Each entry: the decision, why,
and any trade-offs accepted.

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

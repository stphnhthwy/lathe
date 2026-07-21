# Product Roadmap

## Phase 1: MVP

The bar for MVP is "a developer can write a `capability.yaml`, validate it, serve it as a
local MCP server, talk to it through Claude, and eject a standalone server." We build it as
an **interpreter first** (a generic server reads the manifest at runtime); ejecting to
standalone code comes last.

### M0 — Skeleton ✅
- Publishable npm package: `bin` (`lathe`), `exports`, `files`, `engines`.
- `lathe --help` lists commands; no-args shows usage.

### M1 — Parse + validate ✅
- `lathe check [path]` — load `capability.yaml`, parse YAML, validate the manifest shape
  with a zod schema, report errors clearly (non-zero exit) or confirm it's valid.
- Faithful *structural* validation. Semantic checks (formula grammar, JSONPath in `map`,
  cross-references between sources/tools) are deferred to a later milestone.

### M2 — `init` ✅
- `lathe init <name>` — scaffold `capability.yaml`, `SKILL.md`, `references/`, `.env.example`
  into a new `./<name>/` subdir. The generated manifest is a guided, valid template that
  passes `lathe check` as-is; refuses to overwrite an existing capability.

### M3 — `serve` (interpreter) ✅
- A generic server reads the manifest, registers tools (official MCP SDK, zod input schemas,
  `confirm`/`readonly` annotations), and runs locked compute. Wire the `http` adapter against
  local PostgREST first — the simplest real API — then point the same adapter at real APIs.
- Built in three slices (all done — every tool in the example capability is callable):
  - **Slice 1 — serve + http adapter + atomic tools ✅.** `lathe serve` over stdio; the `http`
    source adapter (`${...}` env, bearer/oauth2 auth, headers, GET/POST, PostgREST query);
    atomic `reads`/`writes` tools registered with `readOnlyHint`/`destructiveHint`. Pipeline and
    metric-reading tools are surfaced as deferred at startup (stderr), not dropped.
  - **Slice 2 — declared pipelines ✅.** Linear `steps` (`call` + `as`, `for_each` fan-out),
    `map` with JSONPath-lite `$.field` + a tiny arithmetic evaluator, `prefer` upsert. `ask`
    fields become the pipeline tool's input. `import_recent` is now callable.
  - **Slice 3 — locked compute ✅.** A tiny formula engine (derived fields, `sum/avg/min/max/
    last`, `Nd` windows, metric funcs like `rolling_load(7d)`, ratios like `acwr`). Metric-reading
    tools fetch their entity's rows via its declared read source and return `computed_locked`
    values **frozen**. `weekly_checkin` is now callable.

### M4 — Connect ✅
- stdio → Claude. Run a real flow by talking to the capability.
- Shipped: `claude_desktop_config.json` docs in `README.md` + live smoke of the
  training-coach example against local PostgREST — `get_history` returned rows
  from PostgREST; `weekly_checkin` returned locked metrics (`rolling_load`, `acwr`)
  framed as authoritative. `import_recent` deferred (needs Strava token; covered
  by M3 pipeline tests).

### M5 — `build --eject` ✅
- `lathe build --eject` emits `<out>/{SKILL.md, references/, mcp-server/}`.
  `mcp-server/` runs with only `@modelcontextprotocol/sdk` + `zod` — no
  `@lathe/cli` in its `dependencies`, no `yaml` (the manifest ships as a JS
  literal). Vendored runtime is the same `dist/server/*.js` `lathe serve`
  runs, so the ejected server serves the interpreter's `tools/list`
  byte-for-byte.
- **Proven:** unit + in-process integration tests; CLI smoke on
  `examples/training-coach/` (all four tools registered, `initialize` +
  `tools/list` round-trip over stdio); `npm pack --dry-run` ships only the
  intended 10 files; pack-and-install into a scratch consumer runs via the
  bin with `@lathe/cli` absent from `node_modules`; and a live smoke of the
  ejected bundle with real Strava data — all four tools through MCP
  Inspector plus a Claude client conversation (`get_history` returned 10
  imported sessions, `weekly_checkin` returned frozen `rolling_load`/`acwr`),
  with `@lathe/cli` absent globally. Trace in
  `agent-os/specs/2026-07-01-1217-m5-build-eject/references.md`. The smoke
  also hardened the interpreter: mapped bodies now coerce to declared schema
  types, rejected `for_each` rows skip-and-report, and source vocabularies
  pass through (decisions 2026-07-18).

## Phase 2: Post-Launch

### M6 — eject HTTP entrypoint (spec shaped, not started)
- `build --eject` additionally emits `dist/main-http.js` — the same vendored
  `buildServer()` behind Streamable HTTP on `node:http` (`ALL /mcp` + `GET /health`,
  `PORT` env, default 3000). Both entrypoints always emitted, no flag; ejected deps
  stay `@modelcontextprotocol/sdk` + `zod`.
- Boundary: no Dockerfile/CI/compose emission (the deployment rail is the consumer's)
  and no auth/per-request identity (single-tenant env credentials — "live first,
  auth next"). Spec: `agent-os/specs/2026-07-17-2332-m6-eject-http/`.

### M7 — Studio: declarative capability editor (in progress — slices 1–2 of 4 done)
- `lathe studio [path]` — a local web UI over one capability directory,
  Prisma-Studio-style: structured forms for **Sources → Skill → Behavior**
  (that priority order), tools view-only, nothing generative — fields only,
  **purely declarative** (the declared-read row preview is deferred).
- Sources are exposed as declarations plus evidence they work: per-`${VAR}`
  env-resolution badges (booleans, never values) and an explicit connection
  check through the existing `http` adapter.
- Edits write `capability.yaml` back **preserving comments and key order**
  (the `yaml` Document API); validation is the same zod `manifestSchema`
  that `lathe check` runs. Server is `node:http` (M6 litmus), loopback only.
- Frontend: Vite + React + **shadcn/ui on Base UI primitives** (compose,
  don't invent components). The studio **ships in the npm package**
  (`dist/studio/`) from the first slice.
- Spec: `agent-os/specs/2026-07-21-0952-m7-studio-declarative-editor/`.

### Later
- **A lighter capability-testing harness.** Exercising a real capability end-to-end
  today needs the full dependency stack — a fresh OAuth token (Strava's expires in
  6h), a running local Supabase, env plumbing into whichever client is doing the
  calling — a lot of tinkering just to test the idea (felt hard during the M5/
  2026-07-18 smoke). Wanted: recorded/replayable source fixtures or a
  `lathe serve --mock-sources` mode that fakes declared sources from sample
  payloads, so the manifest → tools → locked-compute loop can be verified with
  zero live credentials. Live smokes stay the final gate; they shouldn't be the
  only way to try an idea.
- Auth / per-request identity for hosted capabilities (JWT forwarding through the
  `http` source adapter) — its own milestone, not a rider on M6.
- Richer source adapters (OAuth/refresh for real APIs like Strava/Shopify).
- Broader formula grammar before escaping to code.
- npm publish, CI, contribution docs.

## Architectural invariants (hold across all phases)
1. **The manifest declares; lathe executes.** The YAML never runs — lathe reads the
   declaration and runs real code (like Prisma schema → SQL, Dockerfile → image).
2. **Locked compute is returned frozen.** Anything in `behavior.computed_locked` is computed
   in code and returned authoritative; the model reasons about it, never recomputes it.
3. **lathe owns no data.** Data lives in the sources; with `http` sources lathe doesn't even
   define where data lives.
4. **Secrets resolve from the environment (`${...}`) at runtime, never committed.**
5. **Interpret first, eject later.** A generic interpreter proves the mechanism; ejected
   standalone code is an optimization, not the foundation.
6. **The dial is the design.** At every level — value (`formula` vs `ask`), field mapping
   (`declare`/`coerce`/`ask`), orchestration (declared pipeline vs model-chained tools) —
   declare what must be reproducible, defer what needs judgment.

## Decision log
- **Interpreter before ejection** — a manifest-reading server is the cheapest path to a real
  end-to-end loop; standalone emission is mechanical once the interpreter works.
- **`http` is the default source; DB is the fallback** — most capabilities call APIs, not
  databases; a local store is only for data with no home yet.
- **Linear pipelines only** — branching/looping in a declared pipeline is the signal to
  escape to code or to the model, keeping the declarative grammar tiny.

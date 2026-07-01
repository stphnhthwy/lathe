# M5 — `build --eject`: emit a standalone `SKILL.md` + `mcp-server/`

## Context

M0–M4 are done and on `main`: `check`, `init`, `serve` (interpreter, http
adapter, declared pipelines, locked-compute formula engine), and the M4 live
smoke through Claude Desktop against `examples/training-coach/`. What's missing
is the last MVP step: **remove the lathe runtime from the wire**. Today a user
connects a capability via `npx -y @lathe/cli serve <path>` — so `@lathe/cli`
sits between the client and the manifest at every call. M5 emits a
distributable snapshot the user can drop into any repo and run with only
`@modelcontextprotocol/sdk` + `zod` installed.

Roadmap (`agent-os/product/roadmap.md:51-52`) defines M5 as: *"Emit a standalone
`SKILL.md` + `mcp-server/` that runs without lathe."* The invariant "interpret
first, eject later" (roadmap invariant 5) becomes real here — the interpreter
is a snapshot the user owns.

## Recommended approach

**Vendor the interpreter, hardcode the manifest, emit a runnable `mcp-server/`.**

1. Copy lathe's own pre-built `dist/server/*.js` into `<out>/mcp-server/dist/server/`.
   Type-only imports in the source (`import type { Manifest }` in
   `src/server/build.ts`) are erased by `tsc`, so `dist/server/*.js` has zero
   cross-directory imports — the copy is 1:1, no path rewriting.
2. Emit `<out>/mcp-server/dist/manifest.js` — the parsed manifest serialized
   as a JS literal (`export const manifest = {...}`). No `yaml` needed at
   runtime.
3. Emit `<out>/mcp-server/dist/main.js` — a tiny entry that imports
   `buildServer` from the vendored `./server/build.js`, imports the manifest,
   writes the same stderr banner `src/commands/serve.ts:37-40` writes, and
   connects `StdioServerTransport`.
4. Emit `<out>/mcp-server/package.json` with only `@modelcontextprotocol/sdk`
   + `zod` in `dependencies` (drops `yaml`, `commander`, `@lathe/cli`).

**Why vendoring, not per-tool codegen:** the interpreter code is already the
code you'd write by hand for a custom MCP server that does the same thing.
Regenerating specialized handlers per tool would duplicate all of it and risk
divergence. Vendoring is deterministic (same input → same output) and honest
about what's happening (the interpreter code is the snapshot).

**Ship in two slices** — both under the M5 roadmap line, same pattern as M3.

- **Slice 1 — `mcp-server/` only.** Command works end-to-end for
  training-coach; automated integration test proves the emitted server's
  `tools/list` matches the interpreter's byte-for-byte.
- **Slice 2 — Distributable bundle.** Copies `SKILL.md` + `references/`;
  emits `mcp-server/README.md`; standalone live smoke through Claude Desktop
  with `@lathe/cli` NOT installed on the machine. Roadmap flips ✅ here.

Out of scope for M5: publishing either package to npm, non-stdio transports,
bundling `mcp-server/` into a single file, emitting TS + build step.

## Files affected

### Slice 1 — new

- `src/build/eject.ts` — pure `ejectCapability(opts): EjectResult` (parse
  manifest, refuse-to-overwrite `<out>/mcp-server/`, orchestrate emit +
  vendor). Follows `initCapability` at `src/scaffold/init.ts:33`.
- `src/build/emit.ts` — inline-string generators for `main.js`, `manifest.js`,
  `package.json` (Slice 1) and `README.md` (Slice 2). Same convention as
  `src/scaffold/templates.ts`.
- `src/build/vendor.ts` — resolves lathe's own `dist/server/` via
  `import.meta.url` and copies the six `.js` files to the target.
- `src/build/eject.test.ts` — unit: refuse-to-overwrite; emitted
  `package.json` has no `@lathe/cli` / `yaml` / `commander`; `manifest.js`
  round-trips; vendored files land in the target.
- `src/build/eject-integration.test.ts` — integration: eject training-coach
  to a tmp dir, load the emitted `main.js`'s `buildServer` composition
  through an `InMemoryTransport` MCP `Client` (same pattern as
  `src/server/build.test.ts`), assert `tools/list` matches the interpreter's
  list byte-for-byte.
- `src/commands/build.ts` — commander wiring for `build [path] --eject
  --out <dir>`, mirroring `src/commands/serve.ts:17-44`.

### Slice 1 — modified

- `src/cli.ts` — one line: `registerBuild(program)`.

### Slice 2 — modified

- `README.md` — add `## Eject a standalone capability` between
  `## Connect to Claude Desktop` and `## Status`; flip the Status line for
  eject.
- `agent-os/product/roadmap.md` — flip **M5 — `build --eject` ✅** with a
  one-line summary.
- `agent-os/decisions.md` — new entry at top:
  **`2026-07-01 — Ejection vendors the interpreter and hardcodes the manifest, not per-tool codegen`**.

### Spec

- `agent-os/specs/2026-07-01-1217-m5-build-eject/` — this folder (`plan.md`,
  `shape.md`, `standards.md`, `references.md`).

## Architecture — where new code goes

Everything new lives in `src/build/` (mirroring `src/scaffold/`) plus one
command file. The interpreter is unchanged; the ejected bundle runs the
same `buildServer` the interpreter runs, just from a copy of `dist/server/`.

```
src/
  build/                    NEW — eject library
    eject.ts                orchestrator
    emit.ts                 template string generators (main/manifest/pkg/readme)
    vendor.ts               copy dist/server/*.js from lathe's own install
    eject.test.ts           unit tests
    eject-integration.test.ts  in-process MCP client vs emitted main.js
  commands/
    build.ts                NEW — commander wiring
    check.ts serve.ts init.ts   unchanged
  server/                   UNCHANGED — becomes the vendored artifact
```

The emitted layout (Slice 1 + Slice 2):

```
<out>/                              default: ./<capability>/
├── SKILL.md                        [Slice 2] copied from manifest.skill
├── references/                     [Slice 2] copied recursively
└── mcp-server/
    ├── package.json                [Slice 1] generated
    ├── README.md                   [Slice 2] generated
    └── dist/
        ├── main.js                 [Slice 1] generated
        ├── manifest.js             [Slice 1] generated
        └── server/                 [Slice 1] vendored 1:1 from lathe's dist/server/
            ├── build.js  http.js  pipeline.js
            ├── formula.js  schema-to-zod.js  tools.js
```

## Tasks

### Task 1 — Save spec documentation
Create `agent-os/specs/2026-07-01-1217-m5-build-eject/` with `plan.md` (this
plan), `shape.md` (scope + three confirmed decisions), `standards.md`
(snapshots of `cli/commands.md`, `testing/tdd.md`, `testing/packaging.md`,
`global/commits.md`, `manifest/spec-not-code.md`), `references.md` (pointers
into the codebase and a **Live smoke run** placeholder for Slice 2's trace).

### Task 2 — Slice 1: build the eject library
1. `src/build/emit.ts` — three exported functions returning strings:
   `mainJs()`, `manifestJs(manifest)`, `packageJson(manifest)`.
   - `mainJs()` is a static string; it imports `buildServer` from
     `./server/build.js`, imports `{ manifest }` from `./manifest.js`,
     `StdioServerTransport` from the SDK; writes the M4-parity stderr banner;
     `await server.connect(...)`.
   - `manifestJs(manifest)` returns `export const manifest = ${JSON.stringify(manifest, null, 2)};\n`.
   - `packageJson(manifest)` returns a stringified `package.json` with:
     `name: "${capability}-mcp-server"`, `version: manifest.version`,
     `type: "module"`, `bin: { "${capability}-mcp": "./dist/main.js" }`,
     `main: "./dist/main.js"`, `dependencies: { "@modelcontextprotocol/sdk":
     "^1.0.0", "zod": "^3.23.0" }`.
2. `src/build/vendor.ts` — one function `copyVendoredServer(targetDir)`:
   resolves `import.meta.url` → parent → up to lathe's own `dist/server/`,
   `readdirSync` for `.js` files, `copyFileSync` each into
   `<targetDir>/dist/server/`.
3. `src/build/eject.ts` — `ejectCapability(opts)`:
   - Validate options; resolve `out` to `./<capability>/` if omitted (needs
     manifest first — see next step).
   - Call `loadManifest(manifestPath)`. On failure, return `{ ok: false,
     issues: [...] }`.
   - Refuse if `<out>/mcp-server/` already exists.
   - `mkdirSync(<out>/mcp-server/dist/server/, { recursive: true })`.
   - Write `main.js`, `manifest.js`, `package.json` via `emit.ts` functions.
   - Call `copyVendoredServer(<out>/mcp-server/)`.
   - Return `{ ok: true, dir, files }`.

### Task 3 — Slice 1: tests
1. `src/build/eject.test.ts` — vitest with tmp dirs (`mkdtempSync`):
   - happy path against `examples/training-coach/capability.yaml`;
   - `<out>/mcp-server/dist/main.js` exists; `manifest.js` module exports the
     parsed manifest verbatim (dynamically import + deep-equal);
   - `<out>/mcp-server/package.json` has no `@lathe/cli`, no `yaml`, no
     `commander`; deps are exactly `@modelcontextprotocol/sdk` + `zod`;
   - the six vendored `.js` files are all present;
   - re-running eject on an existing dir returns `{ ok: false }` (no clobber).
2. `src/build/eject-integration.test.ts`:
   - eject training-coach to a tmp dir;
   - dynamically import the emitted `dist/manifest.js`;
   - build a server via the vendored `dist/server/build.js`
     (`buildServer(manifest)`);
   - connect an `InMemoryTransport` MCP `Client`;
   - call `client.listTools()`, assert names + descriptions match what the
     interpreter yields for the same manifest.

### Task 4 — Slice 1: CLI + smoke
1. `src/commands/build.ts` — `registerBuild(program)` with `build [path]
   --eject --out <dir>`. Rejects invocation without `--eject` with a clear
   message ("only --eject is supported today"). On success, prints a short
   summary (files created) to stdout; failure goes to stderr with exit code 1.
2. `src/cli.ts` — add `registerBuild(program)`.
3. Smoke: `npm run build` then
   `node dist/cli.js build --eject examples/training-coach --out /tmp/coach-ejected`.
   Inspect the tree; `cd /tmp/coach-ejected/mcp-server && npm install && node
   dist/main.js` — expect the stderr banner and a stdio server that answers
   `tools/list` when poked via MCP Inspector or a hand-rolled probe.

### Task 5 — Slice 2: SKILL + references + README
1. Extend `src/build/eject.ts` to copy `manifest.skill` (default
   `./SKILL.md`, relative to the manifest) → `<out>/SKILL.md`. Non-fatal
   warning to stderr if missing.
2. Copy each `manifest.references[]` path → `<out>/references/`. Recursive
   directory copy for entries that are directories; single-file copy for
   files.
3. Extend `src/build/emit.ts` with `readmeMd(manifest)` — a short
   `mcp-server/README.md` documenting `npm install`, `node dist/main.js`,
   and a copy-pasteable `claude_desktop_config.json` snippet using
   `command: "node"` + `args: ["<abs>/dist/main.js"]` and an `env:` block
   for the env vars referenced by the manifest's sources.
4. Extend unit tests: SKILL.md and README.md exist; references copied when
   present; missing skill emits `{ ok: true, warnings: [...] }`.

### Task 6 — Slice 2: docs + roadmap + decisions
1. Add `## Eject a standalone capability` to `README.md` between
   `## Connect to Claude Desktop` and `## Status`. One paragraph on what
   the command does, the command line, and where the output goes; note the
   ejected package needs `npm install` inside `mcp-server/`. Update Status
   to mark M5 ✅.
2. `agent-os/product/roadmap.md` — flip **M5 — `build --eject` ✅** with a
   one-liner: "`lathe build --eject` emits `<out>/{SKILL.md, references/,
   mcp-server/}`; standalone smoke of training-coach ran through Claude
   Desktop with `@lathe/cli` uninstalled."
3. `agent-os/decisions.md` — prepend
   **`2026-07-01 — Ejection vendors the interpreter and hardcodes the
   manifest, not per-tool codegen`**. Decision / Why / Trade-offs, matching
   existing entries.

### Task 7 — Slice 2: packaging + live smoke
Per `agent-os/standards/testing/packaging.md`, the emitted `mcp-server/`
gets the same four-layer treatment lathe does:

1. **Packaging** — inside the emitted `mcp-server/`: `npm pack --dry-run`
   ships only `dist/`, `package.json`, `README.md` (no stray files).
2. **Consumer install** — `npm pack` → install the tarball into a scratch
   dir → `node ./node_modules/<capability>-mcp-server/dist/main.js` starts
   and responds to a hand-rolled `initialize` probe.
3. **Live smoke** — bring local Supabase/PostgREST up per
   `memory/stack-postgrest-testing.md`; wire the ejected server into
   `claude_desktop_config.json` via `node <abs>/dist/main.js`; restart Claude
   Desktop; confirm the hammer icon shows `training-coach`; call
   `get_history` and `weekly_checkin` in a real conversation — locked
   metrics (`rolling_load`, `acwr`) come back frozen. Trace goes into
   `references.md` under a **Live smoke run** section.
4. **Standalone check** — the smoke machine has `@lathe/cli` uninstalled
   (`npm ls -g @lathe/cli` empty) to prove the ejected server truly runs on
   its own.

If any step fails, fix the cause **before** flipping the roadmap.

## Verification

1. **Unit + integration** — `npm run build && npm test` green; the
   integration test proves `tools/list` parity with the interpreter.
2. **CLI smoke (Slice 1)** — `node dist/cli.js build --eject` produces the
   expected tree; `node dist/main.js` in the emitted package registers the
   three training-coach tools and responds to stdio MCP.
3. **Packaging smoke (Slice 2)** — `npm pack --dry-run` in the emitted
   package ships only intended files; `npm pack && npm i tarball && node`
   in a scratch dir starts the server.
4. **Live smoke (Slice 2, the real M5 acceptance)** — Claude Desktop drives
   the ejected server end-to-end with `@lathe/cli` uninstalled locally.
5. **No regressions** — the interpreter path (`lathe serve`) still runs the
   M4 live smoke identically; nothing under `src/server/` changes.

## Out of scope — later milestones
- Publishing `@lathe/cli` to npm — Phase 2.
- Publishing the ejected `mcp-server/` on the user's behalf — consumer's
  choice.
- Non-stdio transports (HTTP/SSE) — later milestone.
- Bundling the ejected `mcp-server/` into a single file (esbuild/rollup) —
  a nice-to-have if the multi-file layout proves awkward.
- Emitting TypeScript source + a build step — pre-built JS is the M5 shape.

## Standards that apply
- `cli/commands.md` — one file per command, logic in a library, meaningful
  exit codes.
- `testing/tdd.md` — tests first / alongside; use training-coach as the
  fixture.
- `testing/packaging.md` — four layers; explicitly applies to the emitted
  package too (see item 4 discipline).
- `global/commits.md` — `feat:` for code, `docs:` for README/roadmap/
  decisions, `chore:` for the spec folder; one logical change per commit.
- `manifest/spec-not-code.md` — the ejected bundle preserves the
  declare/defer dial and frozen-locked-compute contract.

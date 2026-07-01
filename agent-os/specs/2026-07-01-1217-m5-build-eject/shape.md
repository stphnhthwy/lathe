# Shape — M5 `build --eject` (standalone `SKILL.md` + `mcp-server/`)

## Scope

M5 of the lathe build order: **emit a standalone `SKILL.md` + `mcp-server/` that
runs without lathe.** M0–M4 ship a working interpreter — `lathe serve` reads a
manifest at runtime and stands up the MCP server. M5 pays off the "interpret
first, eject later" decision (2026-06-29): the emitted bundle is a distributable
snapshot a user can drop into any repo and run with only
`@modelcontextprotocol/sdk` + `zod` installed — no `@lathe/cli` on the box.

Delivered in **two slices**, both under the M5 roadmap line:

- **Slice 1 — `mcp-server/` only.** `lathe build --eject [path] --out <dir>`
  writes `<out>/mcp-server/` (generated `package.json`, `dist/main.js`,
  `dist/manifest.js`; vendored `dist/server/*.js`). Verified by an in-process
  MCP client asserting the ejected server's `tools/list` matches the
  interpreter's, byte-for-byte on `examples/training-coach/`.
- **Slice 2 — Distributable bundle.** Copy `manifest.skill` → `<out>/SKILL.md`;
  copy each `manifest.references[]` → `<out>/references/`; emit
  `<out>/mcp-server/README.md` with a `claude_desktop_config.json` snippet
  pointing at `node <abs>/dist/main.js`. Live smoke through Claude Desktop with
  `@lathe/cli` NOT installed — proves standalone. Roadmap flips ✅ after this.

Out of scope for M5:
- Publishing the ejected package to npm (consumer's choice; Phase 2).
- Publishing `@lathe/cli` itself (Phase 2).
- Transports other than stdio (HTTP/SSE, Claude Code, Cursor).
- Bundling `mcp-server/` into a single file (esbuild/rollup) — the multi-file
  vendored layout is simpler for a first cut.
- Emitting TypeScript source + a build step in the ejected package — pre-built
  JS is what "runs without lathe" means most literally.

## Confirmed decisions

1. **Vendor the interpreter, hardcode the manifest — don't generate per-tool
   code.** The interpreter modules (`http.ts`, `pipeline.ts`, `formula.ts`,
   `tools.ts`, `build.ts`) are already the code you'd write by hand for a
   custom server. Regenerating specialized handlers would duplicate all of it
   and risk divergence between interpreter and ejection. Vendoring copies
   lathe's own `dist/server/*.js` 1:1 into `<out>/mcp-server/dist/server/`,
   emits a `manifest.js` (`export const manifest = {...}`) as a JS literal, and
   emits a `main.js` that calls `buildServer(manifest)` and connects
   `StdioServerTransport`. The ejected `package.json` has no `@lathe/cli`, no
   `yaml`, no `commander` — just `@modelcontextprotocol/sdk` + `zod`.
2. **Emit pre-built JS, no build step in the ejected package.** Since lathe
   already ships `dist/` (via `prepublishOnly: npm run build`), the eject
   command copies from its own installed `dist/server/`. The user runs
   `npm install && node dist/main.js` — no `tsc`, no `tsx`.
3. **Default output is `./<capability>/`, refuse-to-overwrite.** Mirrors
   `lathe init` (see `src/scaffold/init.ts:45`) so re-running is always safe.
   The manifest's `capability:` field names the subdir.

## Context

- **Visuals:** none.
- **References:** `src/commands/serve.ts:17-44` (the stdio wiring the emitted
  `main.js` will mirror); `src/server/build.ts:43` (`buildServer` — imported
  from the vendored copy at runtime); `src/scaffold/init.ts:33` (the
  refuse-to-overwrite pattern to mirror); `src/scaffold/templates.ts` (inline
  string templates convention); `examples/training-coach/capability.yaml` +
  `SKILL.md` (the acceptance fixture); `agent-os/specs/2026-07-01-1200-m4-connect/`
  (prior spec format to match); `memory/stack-postgrest-testing.md` (local
  Supabase target used in the M3/M4 smokes — same target here for the
  standalone smoke).
- **Product alignment:** roadmap M5 (`agent-os/product/roadmap.md:51-52`) —
  "Emit a standalone `SKILL.md` + `mcp-server/` that runs without lathe." The
  invariant "interpret first, eject later" (roadmap invariant 5) becomes real:
  the interpreter is a snapshot the user owns.

## Key notes

- **Type-only import erasure keeps vendoring trivial.** `src/server/build.ts`
  imports `type { Manifest }` from `../manifest/schema.js` — erased by `tsc`,
  so `dist/server/build.js` has zero cross-directory imports. Copying the
  six `.js` files is a 1:1 operation, no path rewriting.
- **Stderr banner survives.** The emitted `main.js` writes the same
  `<capability> v<version>` and `serving N tool(s)` lines to stderr that
  `src/commands/serve.ts:37-40` does — so the user can still `node dist/main.js`
  in a terminal to sanity-check tool registration before wiring into a client.
- **The vendored server code drifts by design.** Once ejected, the bundle is
  frozen against lathe's `dist/server/` at eject time. This is intentional —
  ejection means the user owns the snapshot, and later interpreter changes
  don't reach out and modify their distributable.
- **Emit-time errors surface like `check` does.** A manifest that fails
  `loadManifest` fails eject with the same zod issue list — no partial write.

## Standards Applied

- **`agent-os/standards/cli/commands.md`** — `build` is one file at
  `src/commands/build.ts`, logic lives in a library at `src/build/`,
  registers on the shared `commander` program; exit codes are meaningful.
- **`agent-os/standards/testing/tdd.md`** — the eject library ships with
  vitest coverage from the first commit; training-coach is the happy-path
  fixture.
- **`agent-os/standards/testing/packaging.md`** — the four-layer discipline
  applies to the emitted `mcp-server/`, not just to lathe itself. Slice 2's
  acceptance includes `npm pack --dry-run` on the ejected package and a
  pack-and-install smoke.
- **`agent-os/standards/global/commits.md`** — `feat:` for the new code;
  `docs:` for README/roadmap/decisions; `chore:` for the spec-folder commit;
  one logical change per commit.
- **`agent-os/standards/manifest/spec-not-code.md`** — the ejected bundle
  preserves the declare/defer dial and frozen-locked-compute contract that
  the interpreter enforces; nothing about the manifest's semantics changes on
  its way through eject.

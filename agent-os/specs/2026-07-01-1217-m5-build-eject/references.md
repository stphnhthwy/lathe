# References for M5 — `build --eject`

## Existing lathe surface — reused, unchanged

### `buildServer` — the interpreter that gets vendored
- **Location:** `src/server/build.ts:43` (`buildServer(manifest, options)`)
- **Relevance:** The emitted `main.js` imports `buildServer` from the vendored
  copy at `mcp-server/dist/server/build.js` and calls it against a hardcoded
  manifest. No divergence: the interpreter and the ejected server run the
  identical code path.
- **Type-only import erasure:** `build.ts` imports `type { Manifest }` from
  `../manifest/schema.js`, which `tsc` erases in `dist/server/build.js`. That
  makes the vendor step trivial — the six `dist/server/*.js` files have zero
  cross-directory imports, so copying them 1:1 is enough.

### `lathe serve` — the stdio wiring the emitted `main.js` mirrors
- **Location:** `src/commands/serve.ts:17-44`
- **Relevance:** The emitted `main.js` reproduces the same shape — banner to
  stderr, `buildServer(manifest)`, `await server.connect(new
  StdioServerTransport())`. Stdout stays clean for the MCP protocol.

### `loadManifest` — parse + validate before eject
- **Location:** `src/manifest/load.ts`
- **Relevance:** Eject calls `loadManifest(path)` and refuses to emit if it
  returns `{ ok: false, issues }`. Same error surface `check` and `serve`
  present, so users don't learn a third failure mode.

### `initCapability` — the scaffolding precedent
- **Location:** `src/scaffold/init.ts:33`
- **Relevance:** Pattern to mirror for `ejectCapability`:
  - result shape (`{ ok: true, dir, files } | { ok: false, error }`);
  - refuse-to-overwrite (`existsSync` guard at `init.ts:45`);
  - inline string templates via `src/scaffold/templates.ts`
    (no fixture files; ships via `dist/`);
  - filesystem writes wrapped in `try` so errors return rather than throw.

### `src/server/build.test.ts` — the in-process client pattern
- **Location:** `src/server/build.test.ts`
- **Relevance:** Uses `InMemoryTransport` + an MCP `Client` to exercise
  `buildServer` without a subprocess. `src/build/eject-integration.test.ts`
  uses the identical pattern against the ejected composition to prove
  `tools/list` parity.

## Fixture we eject

### `examples/training-coach/`
- **Location:** `examples/training-coach/capability.yaml`, `SKILL.md`,
  `README.md`
- **Relevance:** The M5 happy-path fixture. Exercises every code path the
  ejected bundle needs to preserve: two `http` sources (oauth2 + bearer),
  schema with derived fields (`load = duration_min * rpe`), locked metrics
  (`rolling_load`, `acwr`), a declared pipeline (`import_recent`), an atomic
  read (`get_history`), and a metric-reading tool (`weekly_checkin`). If
  training-coach ejects cleanly and its emitted server matches the
  interpreter's `tools/list`, the surface is covered.

## Prior spec pattern

### M4 spec folder
- **Location:** `agent-os/specs/2026-07-01-1200-m4-connect/`
- **Relevance:** The format template this spec follows — same four files
  (`plan.md`, `shape.md`, `standards.md`, `references.md`), same
  snapshot-standards-inline convention. M4 is the immediate predecessor so
  the "Live smoke run" section format at the bottom of its `references.md`
  is what Task 7's Slice 2 trace should mirror.

### M3 spec folder
- **Location:** `agent-os/specs/2026-06-29-2048-m3-serve-interpreter/`
- **Relevance:** The precedent for a multi-slice milestone under one
  roadmap line. M3 shipped in three slices; M5 ships in two. Same discipline:
  each slice is a real end-to-end loop, not a partial refactor.

## Runtime target for the Slice 2 live smoke

### Local Supabase / PostgREST
- **Location:** `~/.claude/projects/-Users-stephenhathaway-Development-lathe/memory/stack-postgrest-testing.md`
- **Relevance:** Same target as M3/M4 smokes. Slice 2's live smoke wires the
  emitted server into Claude Desktop with `command: "node"` (not
  `npx @lathe/cli`) and calls `get_history` + `weekly_checkin` against local
  PostgREST. The `@lathe/cli` package must be uninstalled globally on the
  smoke machine to prove standalone.

## External docs

### MCP quickstart (user side)
- **Location:** `https://modelcontextprotocol.io/quickstart/user`
- **Relevance:** Same `claude_desktop_config.json` path and `mcpServers`
  shape M4 documented, referenced from the emitted
  `mcp-server/README.md` so users aren't rediscovering the config path.

---

## Packaging smoke — 2026-07-01

Layers 3–4 of `agent-os/standards/testing/packaging.md` applied to the
*emitted* `mcp-server/`, using `examples/training-coach/`.

**Eject.** `node dist/cli.js build --eject examples/training-coach/capability.yaml
--out $SCRATCH/coach-ejected` produced the expected tree:

```
coach-ejected/
├── SKILL.md
└── mcp-server/
    ├── package.json         # deps: @modelcontextprotocol/sdk + zod only
    ├── README.md            # env: block enumerates STRAVA_TOKEN, SUPABASE_URL, SUPABASE_KEY
    └── dist/
        ├── main.js          # #!/usr/bin/env node + buildServer + stdio
        ├── manifest.js
        └── server/*.js      # 6 vendored files, byte-identical to lathe's dist/server/*
```

Warning surfaced on stderr:
`! reference not found at .../examples/training-coach/methodology.pdf; skipped`
— expected; the example manifest declares a placeholder PDF that isn't
checked into the repo.

**Layer 3 — `npm pack --dry-run` inside `mcp-server/`:**

```
package: training-coach-mcp-server@0.1.0
files: README.md, package.json, dist/main.js, dist/manifest.js,
       dist/server/{build,formula,http,pipeline,schema-to-zod,tools}.js
total files: 10
package size: 10.7 kB · unpacked: 34.4 kB
```

No stray `src/`, `test-*/`, or spec files — the `"files": ["dist"]` entry in
the emitted `package.json` filters correctly.

**Layer 4 — pack + install into a scratch consumer:**

```
$ npm pack                                                       # → tarball
$ cd $(mktemp -d) && npm init -y >/dev/null
$ npm i /path/to/training-coach-mcp-server-0.1.0.tgz
$ ls node_modules/@lathe                                         # (missing — expected)
$ ls -la node_modules/.bin/training-coach-mcp
  → symlink to ../training-coach-mcp-server/dist/main.js
$ printf '<initialize>\n<tools/list>\n' | npx training-coach-mcp
```

Result: stderr banner `training-coach v0.1.0 — standalone mcp-server` and
`serving 4 tool(s): import_recent, get_history, save_plan, weekly_checkin`.
stdout carried the JSON-RPC replies for `initialize` (protocol
`2025-06-18`, `serverInfo.name: training-coach`) and `tools/list` (all
four tools with correct `inputSchema` and `readOnlyHint`/`destructiveHint`
annotations). `@lathe/cli` was NOT in the consumer's `node_modules` — the
ejected server truly runs standalone.

## Live smoke run (Claude Desktop)

_TODO — wire the emitted `mcp-server/` into `claude_desktop_config.json`
via `command: "node"` + `args: ["<abs>/dist/main.js"]`, restart Claude
Desktop, call `get_history` and `weekly_checkin` against local PostgREST
per `memory/stack-postgrest-testing.md`. `@lathe/cli` must be uninstalled
globally (`npm ls -g @lathe/cli` empty) during the run to prove standalone._

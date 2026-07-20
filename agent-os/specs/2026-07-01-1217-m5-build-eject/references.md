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

**Date:** 2026-07-18 (prep + terminal/Inspector layers 2026-07-17 → 18)

**Standalone proof:** `npm ls -g @lathe/cli` → `(empty)` throughout the run;
the emitted `mcp-server/node_modules` contains only
`{"@modelcontextprotocol/sdk":"^1.0.0","zod":"^3.23.0"}` and their deps
(`npm ls @lathe/cli` inside the bundle → `(empty)`). Node v22.14.0.

**Eject:** fresh `node dist/cli.js build --eject examples/training-coach/capability.yaml
--out ~/Development/lathe-m5-smoke/training-coach` — 10 emitted files + `SKILL.md`;
one expected warning (`methodology.pdf` placeholder not in repo).

**Config used** (sanitized):

```json
{
  "mcpServers": {
    "training-coach": {
      "command": "node",
      "args": ["<smoke-dir>/training-coach/mcp-server/dist/main.js"],
      "env": {
        "SUPABASE_URL": "http://localhost:8000",
        "SUPABASE_KEY": "sb_secret_...",
        "STRAVA_TOKEN": "<6h access token, activity:read_all>"
      }
    }
  }
}
```

**What the smoke found (and fixed) before the client hop.** Running the
pipeline against real Strava data surfaced three interpreter defects —
float map results rejected by int columns, capitalized `sport_type`
rejected by the enum's check constraint, and a whole-batch abort on the
first unmappable row. Fixed as `fix: coerce mapped bodies to schema types;
skip rows the store rejects`, plus the vocabulary-passthrough decision
(`agent-os/decisions.md`, 2026-07-18) and stack migration `20260718001500`.
The trace below is against the re-ejected bundle containing those fixes.

**Layer: scripted stdio client** (MCP SDK `Client` + `StdioClientTransport`,
launching `dist/main.js` exactly as Claude Desktop does):

- stderr banner: `training-coach v0.1.0 — standalone mcp-server` /
  `serving 4 tool(s): import_recent, get_history, save_plan, weekly_checkin`.
- `import_recent` (rpe 6) → `{ "steps": 2, "reads": 1, "writes": 10, "skipped": [] }` —
  all ten real activities upserted, source vocabulary intact.
- `get_history` → 10 rows, newest:
  `{"external_id":"19352836947","logged_at":"2026-07-17T16:03:25+00:00",
  "sport":"Yoga","duration_min":56,"rpe":6,"load":336}` — passthrough sport,
  coerced int, derived load.
- `weekly_checkin` → `{ "computed_locked": true, "metrics":
  { "rolling_load": 2514, "acwr": 0.489… }, "note": "Authoritative values
  computed by lathe. Reason about these; do not recompute or estimate them." }`

**Layer: MCP Inspector (hands-on).** Stdio connect to the same bundle with env
passed via `-e`; all four tools listed and exercised interactively —
`get_history`, `weekly_checkin`, `import_recent` (idempotent rerun), `save_plan`.

**Layer: Claude client (the M5 acceptance).** The emitted bundle was added to
`claude_desktop_config.json` as `command: "node"`,
`args: ["<smoke-dir>/training-coach/mcp-server/dist/main.js"]` (no `npx`, no
`@lathe/cli`) and consumed by the Claude desktop app as an MCP connector.
In conversation, the model called:

- `get_history` → all 10 rows, source vocabulary verbatim
  (`Yoga`, `HighIntensityIntervalTraining`, `Workout`, `Walk`), coerced ints,
  derived `load` present on every row.
- `weekly_checkin` → `{ "computed_locked": true, "metrics":
  { "rolling_load": 2514, "acwr": 0.3747… }, "note": … }` — the model reasoned
  about the frozen values rather than recomputing them. (ACWR shifted from the
  prior night's 0.489 because the 7d window slid past midnight — locked compute
  moving with `now`, as designed.)

Also exercised in passing: a config typo (placeholder text pasted as
`SUPABASE_KEY`) surfaced exactly as the README's troubleshooting predicts, and
a cold Docker daemon reproduced PostgREST's `PGRST002` retry — both external
to the bundle. M5 flips ✅ on this trace.

# References for M4 — Connect

## Existing lathe surface (unchanged by M4)

### `lathe serve` — stdio wiring
- **Location:** `src/commands/serve.ts:1-45`
- **Relevance:** The M4 mission is "stdio → Claude." This file already sets up the
  `StdioServerTransport` (`serve.ts:42`) and enforces stdio hygiene — banner + deferred
  notices go to **stderr** (`serve.ts:27,37,40`); stdout is reserved for the MCP
  protocol. Claude Desktop's MCP client launches this subprocess unchanged.
- **What to borrow:** nothing needs to change here. When documenting the Connect flow,
  reference the stderr banner text (`lathe serve — {capability} v{version}` and
  `serving N tool(s): ...`) as what the user will see if they run `lathe serve`
  directly for troubleshooting.

### `buildServer` — tool registration
- **Location:** `src/server/build.ts` (`buildServer` at ~lines 43-95)
- **Relevance:** Registers every executable tool (atomic reads/writes, pipelines,
  metric-reading tools with locked compute) on the MCP SDK. After M3 Slice 3 there are
  no more deferred tools for the training-coach example — `import_recent`,
  `get_history`, and `weekly_checkin` are all callable, which is what M4 verifies.

## Fixture we connect

### `examples/training-coach/`
- **Location:** `examples/training-coach/capability.yaml`, `SKILL.md`, `README.md`
- **Relevance:** The capability under test for the M4 live smoke. `SKILL.md` documents
  the intended flow the model follows (`import_recent` → `get_history` →
  `weekly_checkin`); the smoke run in Task 3 exercises exactly this flow.
- **What to borrow:** the SKILL.md's framing of *authoritative* locked metrics
  (`load`, `rolling_load`, `acwr` — "reason about these numbers; never recompute")
  is what the model should demonstrate during the `weekly_checkin` step.

## Prior spec pattern

### M3 spec folder
- **Location:** `agent-os/specs/2026-06-29-2048-m3-serve-interpreter/`
- **Relevance:** The format template. M4's `shape.md` / `plan.md` / `standards.md` /
  `references.md` follow the same section headings, decision-log structure, and
  snapshot-standards-inline convention.

### M2 spec folder
- **Location:** `agent-os/specs/2026-06-29-2031-m2-init-scaffold/`
- **Relevance:** Confirms the same folder-name format (`YYYY-MM-DD-HHMM-slug/`) and
  four-file structure. Consistency across specs matters more than perfection in any
  one of them.

## Runtime target for the live smoke

### Local Supabase / PostgREST
- **Location:** `/Users/stephenhathaway/.claude/projects/-Users-stephenhathaway-Development-lathe/memory/stack-postgrest-testing.md`
- **Relevance:** The same local PostgREST target used during M3's Slice 1 live smoke.
  Uses the new `sb_secret_` key format, PostgREST on port 8000, server-internal
  tables. The M4 smoke uses the same credentials so we're testing the identical wire
  path Claude will see.

## External docs

### MCP quickstart (user side)
- **Location:** `https://modelcontextprotocol.io/quickstart/user`
- **Relevance:** Authoritative source for the `claude_desktop_config.json` path
  (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS;
  `%APPDATA%\Claude\claude_desktop_config.json` on Windows) and the shape of the
  `mcpServers` entry. Cite this in the README section rather than reinventing.

---

## Live smoke run

**Date:** 2026-07-01

**Config used** (sanitized):

```json
{
  "mcpServers": {
    "training-coach": {
      "command": "node",
      "args": [
        "<repo>/dist/cli.js",
        "serve",
        "<repo>/examples/training-coach/capability.yaml"
      ],
      "env": {
        "SUPABASE_URL": "http://localhost:8000",
        "SUPABASE_KEY": "sb_secret_..."
      }
    }
  }
}
```

Started from a fresh `npm run build`. Claude Desktop launched the subprocess and
the stderr banner confirmed `serving 4 tool(s): import_recent, get_history,
save_plan, weekly_checkin`. Tools appeared under the hammer icon.

**Tool calls verified:**

- `get_history` → `[]`. Empty because the local Supabase had no seeded `session`
  rows yet; the important part is that the http adapter hit PostgREST and returned
  a valid JSON response with no auth or URL error.
- `weekly_checkin` → `{ "computed_locked": true, "metrics": { "rolling_load": 0,
  "acwr": null }, "note": "Authoritative values computed by lathe. Reason about
  these; do not recompute or estimate them." }`. This is the M4 acceptance:
  a metric-reading tool round-trips through Claude Desktop, the M3 Slice 3
  formula engine runs (0 sessions → 0 load, null ratio), and the result is
  framed as locked so the model treats it authoritatively rather than recomputing.
- `import_recent` — **skipped intentionally.** Requires `STRAVA_TOKEN` for the
  Strava source and the smoke didn't have one. `serve` starts fine without it
  (env resolution is lazy per M3 Slice 1); the tool would only fail if called.
  Covered by the M3 pipeline tests already; not blocking on it for M4.
- `save_plan` — not exercised in this smoke; it's a write path already covered
  by M3 Slice 1 tests. M4 needed metric-reading + locked-compute proof, which
  `weekly_checkin` gave.

**Observations for the README:**

- The startup banner + tool count on stderr is exactly the troubleshooting
  handle the README notes — worth keeping that line as-is.
- Claude Desktop honored the `env:` block; no `.env` reading needed. The
  README's "set secrets in `env:`, not a `.env` file" caveat is correct and
  worth keeping.
- The subprocess needs an absolute path to `capability.yaml`; a relative path
  would resolve against Claude Desktop's cwd, not the repo. README already
  covers this.

**Conclusion:** loop closes. `stdio → Claude` works. M4 done.

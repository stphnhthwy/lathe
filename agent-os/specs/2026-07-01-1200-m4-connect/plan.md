# M4 — Connect (stdio → Claude Desktop): run a real flow

## Context

M0–M3 are done and on `main`: `check`, `init`, and a fully working `lathe serve`
(interpreter, http adapter, declared pipelines, locked-compute formula engine). Every
tool in `examples/training-coach/` is now callable over MCP stdio. What's missing is the
step that makes the whole build order pay off: **a user actually talking to their
capability through Claude.**

The roadmap (`agent-os/product/roadmap.md:42-43`) defines M4 as "stdio → Claude. Run a
real flow by talking to the capability." No new lathe features are needed; the server
already works. This milestone closes the loop: document how to wire `lathe serve` into
Claude Desktop, then verify it end-to-end against the training-coach example using the
user's local Supabase/PostgREST (same target M3 was proven on — see
`memory/stack-postgrest-testing.md`).

## Recommended approach

**Docs + verified live smoke. No new code.**

- Client target: **Claude Desktop app only** (macOS `claude_desktop_config.json`).
- Capability under test: `examples/training-coach/` — all three tools
  (`import_recent`, `get_history`, `weekly_checkin`).
- Verification: **manual live smoke** — connect training-coach to Claude Desktop, run
  the three tools through a real conversation, capture the trace in `references.md`.

Out of scope for M4: a `--print-config` flag, a `lathe connect` command, Claude Code /
Cursor / other clients, MCP Inspector-focused docs (Inspector remains the pre-connect
smoke path already mentioned in README; it isn't the M4 story).

## Files affected

Docs / spec only. `src/**` is untouched.

- `README.md` — add a **Connect to Claude Desktop** section between the inner-loop
  block and the Status block. Include the exact `claude_desktop_config.json` snippet
  (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS), the env
  vars the training-coach example needs (`SUPABASE_URL`, `SUPABASE_KEY`), the
  restart-app step, and how to verify tools show up in Claude Desktop. Update the
  Status block to mark "connect to Claude" ✅.
- `agent-os/product/roadmap.md` — mark **M4 — Connect ✅** and append the one-line
  summary of what shipped.
- `agent-os/decisions.md` — new entry at the top:
  **`2026-07-01 — M4 is docs + live smoke, no new interpreter surface`**.
- `agent-os/specs/2026-07-01-1200-m4-connect/` — this spec folder (`plan.md`,
  `shape.md`, `standards.md`, `references.md`).

## Architecture — no code moves

The whole design point here is that **no interpreter code needs to change**. `lathe
serve` already:

- reads a manifest, builds an `McpServer`, registers all executable tools, and connects
  a `StdioServerTransport` (`src/commands/serve.ts:22-42`);
- keeps stdout clean for the protocol; all diagnostics go to stderr
  (`src/commands/serve.ts:9-15,27-40`).

Claude Desktop's MCP client already knows how to launch a stdio server and route
`initialize` / `tools/list` / `tools/call` to it. The connect step is therefore purely
a config paste + env setup by the user — exactly the M4 mission on the roadmap.

## Tasks

### Task 1 — Save spec documentation
Create `agent-os/specs/2026-07-01-1200-m4-connect/` (folder-name format matches
`2026-06-29-2048-m3-serve-interpreter/`) with `plan.md` (this plan), `shape.md`
(scope + the three confirmed decisions), `standards.md` (full text snapshot of
`global/commits.md` and `manifest/spec-not-code.md` — the two that actually apply),
`references.md` (pointers into the codebase, the M3 spec as prior pattern, the
Supabase memory note, and a **Live smoke run** placeholder for Task 3's trace).

### Task 2 — Add "Connect to Claude Desktop" section to `README.md`
Insert `## Connect to Claude Desktop` after the inner-loop block (`README.md:24-38`)
and before `## Status`. Content:

- One-line lead: `lathe serve` is a stdio MCP server; any MCP client that can launch a
  subprocess can talk to it. Claude Desktop is the target for M4.
- The config path (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`;
  Windows: `%APPDATA%\Claude\claude_desktop_config.json`).
- A copy-pasteable JSON snippet that adds a `training-coach` server:
  `command: "npx"`, `args: ["-y", "@lathe/cli", "serve", "<absolute path>/capability.yaml"]`,
  and an `env:` block with `SUPABASE_URL` / `SUPABASE_KEY`. Explicitly note the env
  values ship into the subprocess — the Claude Desktop subprocess does not inherit the
  user's shell, so `.env` files are not read.
- The "restart Claude Desktop, look for the hammer icon, expect the three tools
  (`import_recent`, `get_history`, `weekly_checkin`) to appear" verification step.
- A troubleshooting one-liner: if tools don't appear, run `lathe serve <path>`
  directly in a terminal to see the stderr banner + any manifest errors.

Update the Status block: `connect to Claude over stdio and run a real flow ✅`.

### Task 3 — Live end-to-end smoke on training-coach
The actual M4 deliverable — proving the loop closes:

1. Bring the local Supabase/PostgREST up per `memory/stack-postgrest-testing.md`.
   Confirm `session` and `plan_week` tables exist.
2. Add the training-coach block from Task 2's snippet to `claude_desktop_config.json`
   with real absolute paths and the sb_secret_ key.
3. Restart Claude Desktop; confirm the hammer icon shows `training-coach` with three
   tools listed.
4. Run a real flow — one conversation exercising each tool:
   - Ask for a training import → model calls `import_recent`; verify a row lands in
     PostgREST.
   - Ask for recent history → model calls `get_history`; verify the rows come back.
   - Ask for a weekly check-in → model calls `weekly_checkin`; verify locked metrics
     (`rolling_load`, `acwr`) are returned frozen and the model reasons about them
     rather than recomputing.
5. Capture a short trace (tool names called + which numbers came back frozen) into
   `references.md` under a **Live smoke run** section.

If any step fails, fix the cause **before** flipping the roadmap.

### Task 4 — Update roadmap + decisions log
- `agent-os/product/roadmap.md`: mark **M4 — Connect ✅** and append the one-line
  summary ("`claude_desktop_config.json` docs + live smoke of the training-coach
  example against local PostgREST").
- `agent-os/decisions.md`: prepend a new entry
  **`2026-07-01 — M4 is docs + live smoke, no new interpreter surface`**. Structure per
  the existing entries: Decision / Why / Trade-offs. Call out that we deliberately
  skipped `--print-config` and Claude Code / other clients for now.

## Verification

1. **Live smoke (the M4 acceptance criterion).** Task 3 above — three tools called in
   a real Claude Desktop conversation against local PostgREST, trace captured in
   `references.md`.
2. **Docs render sanely.** Re-read the README section as a new user with only Claude
   Desktop installed — the snippet should be copy-pasteable and the env vars obvious.
3. **No regressions.** `npm test` and `npm run build` still green (nothing under
   `src/` changed, so this is a sanity check, not a discovery step).

## Out of scope — later milestones
- `lathe serve --print-config` / `lathe connect` — deferred until Desktop's hand-edit
  friction is a signal.
- Claude Code, Cursor, and other MCP clients — one client is enough to prove the loop.
- Anything from M5 (`build --eject`) or Phase 2 (OAuth refresh, richer sources, npm
  publish/CI).

## Standards that apply
- `global/commits.md` — `docs:` prefix for the README/roadmap/decisions changes; one
  focused commit per logical change.
- `manifest/spec-not-code.md` — the framing carried through the README section and the
  decisions entry: the manifest declared, lathe executes, the client just launches the
  stdio server; nothing new runs.

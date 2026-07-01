# Shape — M4 Connect (stdio → Claude Desktop)

## Scope

M4 of the lathe build order: **run a real flow by talking to the capability through
Claude.** M0–M3 already ship a working stdio MCP server that reads `capability.yaml` and
registers every atomic, pipeline, and metric-reading tool from the example capability. M4
closes the loop — a user wires `lathe serve` into an MCP client and actually has a
conversation with their capability.

M4 is a docs + verification milestone. There is no new interpreter surface; the server
proven in M3 is the server we connect. Deliverables:

1. A **Connect to Claude Desktop** section in the README with a copy-pasteable
   `claude_desktop_config.json` snippet.
2. A **live end-to-end smoke** of `examples/training-coach/` against the user's local
   Supabase/PostgREST, called through Claude Desktop, with the trace captured in this
   spec's `references.md`.
3. Roadmap flip to M4 ✅ and a decisions-log entry for the "docs-only" choice.

Out of scope for M4:
- A `lathe serve --print-config` flag or a dedicated `lathe connect` command.
- Claude Code, Cursor, Continue, or any client other than Claude Desktop.
- Anything from M5 (`build --eject`) or Phase 2 (OAuth refresh, richer sources, npm
  publish, CI).

## Confirmed decisions

1. **Docs + verified smoke, no new code.** The server already works after M3 Slice 3;
   adding a config-emitting flag or a connect command is premature until we have signal
   that Desktop's hand-edit friction is real for users beyond the author. The smallest
   thing that closes the loop is docs.
2. **Claude Desktop is the only target.** The user runs Claude Code day-to-day but M4 is
   about proving the "capability talks to a Claude client" story once. Desktop is the
   canonical MCP client documented on modelcontextprotocol.io; extending to other
   clients is a later, cheaper follow-up once one client is proven.
3. **Live smoke on training-coach against local PostgREST is the acceptance test.** All
   three tools must be called in a real conversation (`import_recent`, `get_history`,
   `weekly_checkin`), and the locked metrics returned by `weekly_checkin` must come back
   frozen. Anything less leaves "run a real flow" unverified.

## Context

- **Visuals:** none.
- **References:** `src/commands/serve.ts:1-45` (the already-existing stdio wiring —
  M4 changes nothing here); `examples/training-coach/capability.yaml` + `SKILL.md`
  (the fixture we connect); `agent-os/specs/2026-06-29-2048-m3-serve-interpreter/`
  (prior spec format to match); `memory/stack-postgrest-testing.md` (local Supabase
  target used in the M3 live smoke — same target here).
- **Product alignment:** roadmap M4 (`agent-os/product/roadmap.md:42-43`) — "stdio →
  Claude. Run a real flow by talking to the capability." The invariants section of the
  roadmap (interpret first, eject later; the manifest declares, lathe executes) is
  exactly what M4 makes visible to a user for the first time.

## Key notes

- **No `src/` changes.** `lathe serve` already prints its banner + registered tools to
  stderr, keeps stdout clean for the protocol, and connects a `StdioServerTransport`.
  Claude Desktop's MCP client already knows how to launch a stdio subprocess and route
  `tools/list` / `tools/call` to it. The user step is a config paste + env setup.
- **Env goes through Desktop's `env:` block, not `.env`.** The subprocess Claude Desktop
  spawns doesn't inherit the user's shell; the `SUPABASE_URL` / `SUPABASE_KEY` values
  must be set in `claude_desktop_config.json` alongside the command. Call this out in
  the README section — it's the most likely footgun.
- **Absolute paths in the snippet.** Claude Desktop's cwd is not the project directory;
  `npx -y @lathe/cli serve <path>` must receive an absolute path to the manifest.

## Standards Applied

- **`agent-os/standards/global/commits.md`** — `docs:` prefix on the README/roadmap/
  decisions changes; one logical change per commit (spec files, README + Status,
  roadmap + decisions, smoke-trace addendum are separable).
- **`agent-os/standards/manifest/spec-not-code.md`** — the framing in the README
  section and the decisions entry: the manifest declared, lathe stood up the server,
  the client just launches the stdio server; nothing new executes at M4.

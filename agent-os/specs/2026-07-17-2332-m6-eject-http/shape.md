# Shape — M6 eject HTTP entrypoint (`dist/main-http.js`)

## Scope

First milestone past the Phase 1 MVP: **the ejected `mcp-server/` gains a
Streamable HTTP entrypoint alongside stdio.** M5 proved the ejected bundle is a
finished deliverable — but only for the desktop-subprocess case, where a client
like Claude Desktop spawns `node dist/main.js` and speaks over stdin/stdout.
Any hosted use — a remote connector, a team-shared server, a long-running
container — needs the ecosystem-standard remote transport instead: Streamable
HTTP. M6 emits it.

Delivered in **one slice**:

- `lathe build --eject` additionally writes `<out>/mcp-server/dist/main-http.js`:
  the same vendored `buildServer()` behind `StreamableHTTPServerTransport`,
  served by `node:http` (no express) — `ALL /mcp` for the MCP JSON-RPC
  endpoint, `GET /health` → `{"status":"ok"}` for orchestrator healthchecks.
  `PORT` env selects the listen port (default 3000). Diagnostics (banner, tool
  count, listen line) go to stderr, matching the stdio entrypoint's hygiene.
- The emitted `package.json` gains `"start:http": "node ./dist/main-http.js"`;
  the emitted `README.md` gains a "Run over HTTP" section; the CLI's
  "Next steps" block mentions both run modes.
- Ejected `dependencies` stay exactly `@modelcontextprotocol/sdk` + `zod`.

Out of scope for M6:
- **Dockerfile / CI workflow / compose emission.** The deployment rail (image
  registry, orchestrator, network posture) is the consumer's opinion, not
  lathe's. Trivial for a user to add; every emitted file is maintained surface.
- **Auth / per-request identity.** The ejected HTTP server is single-tenant:
  source credentials resolve from the `env:` block at startup, and network
  reachability is the access control ("live first, auth next"). Forwarding a
  caller's JWT through the http source adapter (per-request identity, RLS
  scoping) is a real feature with its own design — a future milestone, not a
  rider on this one.
- **Changing `lathe serve`.** The dev inner loop stays stdio; MCP Inspector
  already covers local testing. HTTP is a distribution concern, so it lives in
  the ejected artifact.
- **SSE compatibility transport, session resumability tuning** — stateless
  Streamable HTTP is the baseline; add state only when a real client needs it.

## Confirmed decisions

1. **The HTTP entrypoint is upstream; the deployment rail is personal.** The
   litmus for what lathe emits: *would a lathe user who has never heard of your
   deployment target need it?* Streamable HTTP — yes, unavoidably; it is the
   standard transport for any MCP server not launched as a desktop subprocess.
   GHCR workflows, compose entries, tailnet assumptions — no; those wrap the
   ejected artifact in the consumer's own repo. (Recorded in
   `agent-os/decisions.md`, 2026-07-17.)
2. **Always emit both entrypoints — no `--transport` flag.** The marginal cost
   is one small generated file, and a flag would make eject a decision point.
   `dist/main.js` (stdio) and `dist/main-http.js` (HTTP) ship side by side;
   the consumer runs the one their situation needs.
3. **`node:http`, not express.** The ejected dependency set is a load-bearing
   invariant (`@modelcontextprotocol/sdk` + `zod` only). The HTTP surface is
   two routes; the built-in module carries it. If the routing ever grows past
   trivial, that growth is the signal to reconsider — not a reason to start
   with a framework.
4. **Stateless per-request wiring.** Each request builds a fresh
   `buildServer(manifest)` + `StreamableHTTPServerTransport` with
   `sessionIdGenerator: undefined` — the SDK's stateless pattern. `buildServer`
   is pure and cheap (no I/O at build time), so per-request construction buys
   zero shared mutable state without a session-management story.

## Context

- **Visuals:** none.
- **References:** `src/build/emit.ts` (`mainJs()` — the template `mainHttpJs()`
  mirrors); `src/build/eject.ts:64-69` (the `files` array the new emit joins);
  `src/server/build.ts:43` (`buildServer` is transport-agnostic and does no
  I/O of its own — the design fact that makes M6 cheap);
  `~/Development/mcp/src/transports/http.ts` (working prior art for
  Streamable HTTP + `/health` behind a personal deployment rail — the rail M6
  deliberately excludes). See `references.md`.
- **Product alignment:** pays off invariant 5 ("interpret first, eject later")
  a second time — the interpreter stays the single runtime, and ejection grows
  a new door into it rather than a new engine. The MVP bar ("write, validate,
  serve, talk through Claude, eject") is unchanged; M6 is the first
  Phase 2 milestone.

## Key notes

- The stdio entrypoint's stdout-hygiene rule has an HTTP analogue: the protocol
  now lives on the HTTP response stream, and **stderr remains the only
  diagnostic channel** — nothing writes to stdout at all.
- The emitted README's HTTP section should state the single-tenant posture
  plainly (anyone who can reach the port can call the tools) so consumers
  don't mistake the ejected server for an authenticated service.
- Deferred-tool startup notices (stderr) must appear in the HTTP entrypoint
  too — same `buildServer` log sink, once at boot, not per request.

## Standards Applied

- **`cli/commands.md`** — logic lives in `src/build/` (library face); the
  `build` command file only grows its "Next steps" copy.
- **`testing/tdd.md`** — the emit template and eject file-list changes land
  with tests first/alongside; `examples/training-coach/` stays the fixture.
- **`testing/packaging.md`** — the emitted artifact is the product: the
  integration test boots the *emitted* `main-http.js` and exercises `/health`
  + an MCP `initialize` over real HTTP, mirroring the four-layer discipline.
- **`global/commits.md`** — spec ships as `docs:`; implementation as `feat:`.
- **`manifest/spec-not-code.md`** — nothing in the manifest grammar changes;
  the manifest stays a spec, and transport remains an engine concern.

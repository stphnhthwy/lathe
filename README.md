# lathe

> Turn a small YAML manifest into a working MCP server + Agent Skill. The manifest never
> executes, lathe reads the declaration and runs real code on your behalf.

`lathe` is a tool you bring into a project to build **skills that have structure**. Like
Prisma (a schema + a CLI that generates real SQL) or a Dockerfile (a spec that Docker turns
into an image), a lathe **capability manifest** is a spec — `lathe` is the engine that reads
it and stands up a real [Model Context Protocol](https://modelcontextprotocol.io) server and
an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills).

## The idea

A capability composes two kinds of input:

- **Sources** are live data you *call*: an HTTP API, an MCP server, or your own store. These
  feed the **reproducible** side: locked, deterministic compute returned frozen.
- **References** are static knowledge the model *reads*: a methodology PDF, a docs file.
  Bundled with the skill and consulted as context. These feed the **judgment** side.

You declare what must be reproducible and defer what needs judgment. That dial is the whole
design.

## Install & inner loop

```bash
npm i -D @lathe/cli          # add to your project (CLI name is `lathe`)

npx lathe init my-capability  # scaffold capability.yaml + SKILL.md + references/
# edit capability.yaml
npx lathe check               # parse + validate the manifest
npx lathe serve               # run the MCP server locally (test in MCP Inspector)
npx lathe build --eject       # emit a standalone SKILL.md + mcp-server/
```

> Inner loop: **edit `capability.yaml` → `lathe serve` → test in the Inspector → connect to
> Claude**. Your server is a passive provider — it never calls the model; the model decides
> when to call your tools.

## Connect to Claude Desktop

`lathe serve` is a stdio MCP server, so any client that can launch a subprocess can talk to
your capability. To wire it into [Claude Desktop](https://claude.ai/download), add an entry
to `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "training-coach": {
      "command": "npx",
      "args": ["-y", "@lathe/cli", "serve", "/absolute/path/to/capability.yaml"],
      "env": {
        "SUPABASE_URL": "https://your-project.supabase.co",
        "SUPABASE_KEY": "sb_secret_..."
      }
    }
  }
}
```

Two things to know:

- **Use an absolute path** to `capability.yaml`. Claude Desktop's working directory isn't
  your project.
- **Set secrets in the `env:` block**, not a `.env` file. The subprocess Claude Desktop
  spawns does not inherit your shell.

Restart Claude Desktop. The tools icon in the composer will show your capability
(e.g. `training-coach`) with its tools listed; ask a question that maps to one of them and
the model will call it.

If tools don't show up, run `lathe serve /absolute/path/to/capability.yaml` directly in a
terminal — the startup banner and any manifest errors print to stderr.

## Eject a standalone capability

Once a capability works under `lathe serve`, you can eject it into a distributable package
that runs without `@lathe/cli` on the wire:

```bash
npx lathe build --eject examples/training-coach/capability.yaml --out ./training-coach
```

You get a tree like:

```
training-coach/
├── SKILL.md
├── references/
└── mcp-server/
    ├── package.json          # deps: @modelcontextprotocol/sdk + zod only
    ├── README.md             # copy-pasteable claude_desktop_config.json snippet
    └── dist/
        ├── main.js           # buildServer + stdio
        ├── manifest.js       # the manifest as a JS literal
        └── server/*.js       # vendored runtime — same code lathe serve runs
```

`cd training-coach/mcp-server && npm install && node ./dist/main.js` starts the same MCP
server, and the `claude_desktop_config.json` snippet in the emitted `README.md` uses
`command: "node"` (no `npx @lathe/cli`) — the ejected bundle is the deliverable.

## Status

Early. The build order:

- package skeleton, `lathe --help` ✅
- `lathe check`: parse + validate the manifest ✅
- `lathe init`: scaffold a new capability ✅
- `lathe serve`: a generic server that reads the manifest, registers tools, runs locked compute ✅
- connect to Claude over stdio and run a real flow ✅
- `lathe build --eject`: standalone SKILL.md + mcp-server/ — code complete, live smoke pending

See [`agent-os/product/`](agent-os/product/) for the mission, roadmap, and tech stack, and
[`agent-os/standards/`](agent-os/standards/) for the conventions this project is built to.

## License

[MIT](LICENSE) © 2026 Stephen Hathaway

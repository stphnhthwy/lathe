# lathe

> Turn a small YAML manifest into a working MCP server + Agent Skill. The manifest never
> executes — lathe reads the declaration and runs real code on your behalf.

`lathe` is a tool you bring into a project to build **skills that have structure**. Like
Prisma (a schema + a CLI that generates real SQL) or a Dockerfile (a spec that Docker turns
into an image), a lathe **capability manifest** is a spec — `lathe` is the engine that reads
it and stands up a real [Model Context Protocol](https://modelcontextprotocol.io) server and
an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills).

## The idea

A capability composes two kinds of input:

- **Sources** — live data you *call*: an HTTP API, an MCP server, or your own store. These
  feed the **reproducible** side: locked, deterministic compute returned frozen.
- **References** — static knowledge the model *reads*: a methodology PDF, a docs file.
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

## Status

Early. The build order:

- **M0** — package skeleton, `lathe --help` ✅
- **M1** — `lathe check`: parse + validate the manifest ✅
- **M2** — `lathe init`: scaffold a new capability
- **M3** — `lathe serve`: a generic server that reads the manifest, registers tools, runs locked compute
- **M4** — connect to Claude over stdio and run a real flow
- **M5** — `lathe build --eject`: standalone SKILL.md + mcp-server/

See [`agent-os/product/`](agent-os/product/) for the mission, roadmap, and tech stack, and
[`agent-os/standards/`](agent-os/standards/) for the conventions this project is built to.

## License

[MIT](LICENSE) © 2026 Stephen Hathaway

# Tech Stack

## Frontend
N/A — lathe is a CLI + library, no UI.

## Backend
- **Language/runtime:** TypeScript on Node.js (ESM, `type: module`, NodeNext).
- **MCP SDK:** `@modelcontextprotocol/sdk` (official; `McpServer` + `registerTool` with zod
  input schemas) — used from M3 (`serve`) onward.
- **Manifest validation:** `zod` — the capability manifest is parsed into a typed, validated
  shape.
- **YAML parsing:** `yaml`.
- **CLI:** `commander` — subcommand structure (`check`, later `init`/`serve`/`build`).
- **Dev runner:** `tsx` (run TypeScript directly in the inner loop).
- **Tests:** `vitest`.
- **Build:** `tsc` → `dist/`.

### Code structure
```
src/
  index.ts            programmatic API surface (loadManifest, validate) — the library face
  cli.ts              commander program + shebang; registers commands (the bin face)
  commands/
    check.ts          M1: `lathe check [path]`
  manifest/
    schema.ts         zod schema for capability.yaml
    load.ts           read file, parse YAML, run schema → typed result/errors
    schema.test.ts    valid + invalid manifest cases
examples/
  training-coach/     canonical example capability (also the M1 test fixture)
```

## Database
None owned by lathe. Capabilities declare their own **sources** (`http`, `mcp`, or a local
`postgres`/`sqlite` store only when data has no home). For local testing, Supabase exposes the
same Postgres as both a direct DB and an HTTP API (PostgREST) — the cheapest way to exercise
the `http` adapter against a real API shape.

## Other

### Distribution
- Published as **`@lathe/cli`** on npm (the bare name `lathe` was taken). The CLI binary is
  still `lathe`, so usage is `npm i -D @lathe/cli` then `npx lathe <cmd>` — Prisma-like.
- `bin: { lathe: ./dist/cli.js }`, `main`/`exports` → `dist/index.js`, `files: ["dist"]`,
  `engines.node >= 18`, `prepublishOnly: build`. Publish-ready from the first commit; actual
  `npm publish` is later.

### Config / env vars
Capabilities reference secrets via `${...}` (e.g. `${STRAVA_TOKEN}`, `${SUPABASE_URL}`,
`${SUPABASE_KEY}`), resolved from the environment at runtime. An `.env.example` ships with a
scaffolded capability; real `.env` files are git-ignored.

### Repos
- `lathe` — this repo (the engine). Open source, MIT.

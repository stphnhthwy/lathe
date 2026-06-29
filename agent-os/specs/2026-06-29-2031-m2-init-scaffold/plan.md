# M2 — `lathe init`: scaffold a new capability

> **Self-contained spec.** This conversation will be cleared before execution. Everything
> needed is here. Repo: `/Users/stephenhathaway/Development/lathe` (public:
> github.com/stphnhthwy/lathe, MIT, ESM-only `@lathe/cli`, binary `lathe`).

## Context

`lathe` reads a declarative YAML *capability manifest* and emits/serves an MCP server + Agent
Skill ("the manifest declares; lathe executes"). M0 (package skeleton) and M1 (`lathe check`
— structural manifest validation) are **done and committed**. This is **M2**: a `lathe init`
command that scaffolds a new capability so users have a valid starting point instead of a
blank file. It's the next step in the Prisma-like inner loop:
`npx lathe init <name>` → edit `capability.yaml` → `npx lathe check` → (later) `lathe serve`.

**Confirmed UX decisions (this session):**
1. `lathe init <name>` creates a **new `./<name>/` subdirectory** and scaffolds inside it;
   refuses if that dir already holds a `capability.yaml` (no clobber).
2. The scaffolded `capability.yaml` is a **guided template** — a minimal VALID core plus
   commented examples of every section — and must pass `lathe check` as-is.

## Current state to build on (patterns to reuse)
- `src/cli.ts` — commander program; registers commands (`registerCheck(program)`), then
  `program.parseAsync`. Add `registerInit(program)` here.
- `src/commands/check.ts` — the command pattern: `registerX(program)` registers a subcommand,
  the action calls a library function, formats output, sets `process.exitCode = 1` on failure.
  Mirror this for `init`.
- `src/manifest/load.ts` — exports `validateManifest(yamlText)` / `loadManifest(path)`
  returning `{ ok: true, manifest } | { ok: false, issues }`. **Reuse `validateManifest` in
  the scaffold test** to prove the generated manifest is valid.
- `src/index.ts` — programmatic API surface; re-export the new scaffold function here.
- `src/manifest/schema.test.ts`, `src/cli.test.ts` — test patterns. `cli.test.ts` builds
  `dist/` in `beforeAll` and has a `runCli(args)` helper that spawns `node dist/cli.js`.

## Standards that apply (read before coding)
- `agent-os/standards/cli/commands.md` — **one file per command**, logic lives in a library
  the command calls (not in the command file), `readonly` vs `confirm` semantics, exit codes
  matter, `--help` is a feature.
- `agent-os/standards/testing/tdd.md` — every feature ships with passing `vitest` tests.
- `agent-os/standards/testing/packaging.md` — layer 1 (library) + layer 2 (CLI) tests run in
  `npm test`; templates are inline (ship via `dist/`), so no `files` changes needed.
- `agent-os/standards/manifest/spec-not-code.md` — the guided template must reflect the
  declare/defer dial and quote `${VAR}` placeholders inside YAML flow maps.

---

## Task 1 — Save the Agent OS spec (do this FIRST)

Create the spec folder so the shaping is recorded per Agent OS convention. Generate the
timestamp at execution time:
```bash
cd /Users/stephenhathaway/Development/lathe
mkdir -p "agent-os/specs/$(date +%Y-%m-%d-%H%M)-m2-init-scaffold"
```
Write four files into it:
- **plan.md** — this plan (copy it in).
- **shape.md** — Scope (M2 `lathe init`), the two confirmed decisions above, Context
  (Visuals: none; References: `src/commands/check.ts`, `src/manifest/load.ts`; Product
  alignment: roadmap M2), and "Standards Applied" listing the four standards above with one
  line each on why.
- **standards.md** — embed the **full current text** of `agent-os/standards/cli/commands.md`,
  `agent-os/standards/testing/tdd.md`, `agent-os/standards/testing/packaging.md`, and
  `agent-os/standards/manifest/spec-not-code.md` (read them at execution time and paste).
- **references.md** — point to `src/commands/check.ts` (command pattern), `src/manifest/load.ts`
  (`validateManifest` reuse), `examples/training-coach/capability.yaml` + `SKILL.md` (shape the
  template echoes), and `~/Desktop/mcp/capkit-handoff.md` §7 (M2 in the original build order).

## Task 2 — Scaffold library (`src/scaffold/`)

**`src/scaffold/templates.ts`** — inline string templates (no template files on disk; inline
ships automatically via `dist/`). Functions:
- `capabilityYaml(name)` → the guided manifest below (active core valid; rest commented).
- `skillMd(name)` → Agent Skills frontmatter + short body.
- `envExample()` and `referencesReadme()` → static strings.

Guided `capability.yaml` (active lines must pass `lathe check`; avoid `: ` inside plain
scalars; quote `${VAR}` inside flow maps):
```yaml
# Capability manifest — created by `lathe init`.
# This is a SPEC, not code: lathe reads it and runs real code on your behalf.
# Validate anytime with `lathe check`.

capability: <name>
version: 0.1.0
summary: One-line description of what this capability does

# The skill body the model reads (Agent Skills format), alongside this file.
skill: ./SKILL.md

# References — static knowledge the MODEL reads (PDFs, docs). Consulted, never called.
# references:
#   - ./references/methodology.pdf

# ── SOURCES ── live data you CALL. `http` is the default; also `mcp`, `postgres`, `sqlite`.
# sources:
#   api:
#     type: http
#     base_url: https://api.example.com
#     auth: { kind: bearer, token: "${API_TOKEN}" }   # quote ${...} inside flow maps

# ── SCHEMA ── the SHAPE responses map onto (not DDL — lathe creates no tables).
# schema:
#   item:
#     external_id: string
#     logged_at:   datetime
#     amount:      int
#     score:       { derived: "amount * 2" }

# ── METRICS / BEHAVIOR ── locked, reproducible compute returned FROZEN.
# metrics:
#   rolling: { window: 14d, formula: "sum(item.amount)" }
# behavior:
#   computed_locked: [score, rolling]

# ── TOOLS ── a declared linear pipeline (`steps`) OR atomic tools the model chains.
# tools:
#   - name: get_recent
#     description: Recent items, newest first.
#     reads: { source: api, path: /items, query: { order: logged_at.desc, limit: 20 } }
#     readonly: true

# What to emit when you build: a skill, an MCP server, or both.
emit: [skill, mcp]
```
`SKILL.md` template:
```markdown
---
name: <name>
description: One-line description used when listing this skill — say when to use it (and when not).
---

# <name>

You help the user … Describe the persona and how to behave here.

## When to use
- …

## How to behave
- Reason about locked metrics; never recompute them.
- Confirm before any write.
```
`.env.example`: a comment block explaining `${...}` placeholders resolve at runtime, copy to
`.env`, never commit secrets, with one commented `API_TOKEN=` line.
`references/README.md`: one paragraph — static knowledge the model reads; drop files here and
list them under `references:` in `capability.yaml`.

**`src/scaffold/init.ts`** — the logic (kept out of the command file per the cli standard):
```ts
export interface InitOptions { name: string; cwd?: string }
export type InitResult =
  | { ok: true; dir: string; files: string[] }
  | { ok: false; error: string };
export function initCapability(opts: InitOptions): InitResult
```
- Validate `name` as a capability id / safe folder name: `/^[a-z][a-z0-9-]*$/` (else
  `{ ok: false, error: "invalid name … use kebab-case" }`).
- `dir = resolve(cwd ?? process.cwd(), name)`. If `dir/capability.yaml` exists →
  `{ ok: false, error: "refusing to overwrite existing capability at <dir>" }`.
- `mkdirSync(dir, { recursive: true })` and `mkdirSync(dir/references)`; write
  `capability.yaml`, `SKILL.md`, `.env.example`, `references/README.md` (inject `name`).
- Return `{ ok: true, dir, files: [...absolute paths] }`. Catch fs errors → `{ ok: false }`.

## Task 3 — Wire the CLI (`src/commands/init.ts` + `cli.ts` + `index.ts`)

**`src/commands/init.ts`** — mirror `check.ts`:
```ts
export function registerInit(program: Command): void {
  program
    .command("init")
    .description("Scaffold a new capability (capability.yaml, SKILL.md, references/, .env.example)")
    .argument("<name>", "capability name (kebab-case); also the new folder name")
    .action((name: string) => {
      const result = initCapability({ name });
      if (!result.ok) { console.error(`✗ ${result.error}`); process.exitCode = 1; return; }
      console.log(`✓ created capability "${name}" in ${result.dir}`);
      // list each created file (path relative to result.dir)
      // print next steps: `cd ${name}`, "edit capability.yaml and SKILL.md", "lathe check"
    });
}
```
- `src/cli.ts`: import and call `registerInit(program)` after `registerCheck(program)`.
- `src/index.ts`: `export { initCapability, type InitOptions, type InitResult } from "./scaffold/init.js";`

## Task 4 — Tests (ship with the feature)

**`src/scaffold/init.test.ts`** (layer 1, library):
- Scaffold into an OS temp dir (`mkdtempSync`): `initCapability({ name: "demo", cwd: tmp })`
  → `ok: true`; all four files exist; **read the generated `capability.yaml` and run
  `validateManifest` → `ok: true` and `manifest.capability === "demo"`** (the key invariant);
  `SKILL.md` contains `name: demo`.
- Invalid name (`"Bad Name"`, `"1bad"`) → `ok: false`.
- Refuse-clobber: pre-create `capability.yaml` in the target → `ok: false` with "refusing".
- Clean up temp dirs in `finally`.

**Extend `src/cli.test.ts`** (layer 2, CLI — reuses the build `beforeAll` + `runCli`):
- `runCli(["init", "demo"])` with cwd set to a temp dir → exit 0, `demo/capability.yaml`
  exists. (Pass `cwd` through `runCli`, or add a temp-cwd variant.)
- Run the same init twice → second call exits 1 with "refusing".

## Task 5 — Docs

- `README.md`: mark the `lathe init` build-order line ✅.
- `agent-os/product/roadmap.md`: mark **M2 — `init`** done (✅) like M0/M1.
- `agent-os/decisions.md` (newest first): add an entry — "lathe init scaffolds a new
  `./<name>/` subdir with a guided, valid template; refuses to overwrite an existing
  capability." One short paragraph with the why.

---

## Verification
1. `npm run build` — clean `tsc`.
2. `npm test` — all green (existing 9 + new scaffold/init cases).
3. End-to-end in a scratch dir:
   ```bash
   cd "$(mktemp -d)" && node /Users/stephenhathaway/Development/lathe/dist/cli.js init demo
   ls demo                       # capability.yaml SKILL.md .env.example references/
   cd demo && node /Users/stephenhathaway/Development/lathe/dist/cli.js check   # → valid
   node /Users/stephenhathaway/Development/lathe/dist/cli.js init demo 2>&1; echo $?  # from parent: refusing, exit 1
   ```
4. `npx publint` still "All good"; `npm pack --dry-run` still ships only `dist/` + LICENSE +
   README + package.json (templates are inline, nothing new to leak).

## Commits (per agent-os/standards/global/commits.md)
1. `docs: add Agent OS spec for M2 (lathe init)` — the spec folder (Task 1).
2. `feat: add lathe init to scaffold a capability (M2)` — scaffold lib, command, cli wiring,
   index export, and tests (Tasks 2–4).
3. `docs: mark M2 done and record init scaffold decision` — README, roadmap, decisions (Task 5).

Then `git push origin main`.

## Out of scope
- M3 `serve` (the interpreter), any source adapter, formula evaluation.
- `lathe init .` / `--here` (cwd scaffolding) — deferred; M2 is subdir-only.
- Deep semantic manifest validation.

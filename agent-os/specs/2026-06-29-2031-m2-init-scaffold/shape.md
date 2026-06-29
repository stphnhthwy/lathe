# Shape — M2 `lathe init`

## Scope

M2 of the lathe build order: a `lathe init <name>` command that scaffolds a new
capability so users start from a valid template instead of a blank file. It is the
second step of the Prisma-like inner loop:
`npx lathe init <name>` → edit `capability.yaml` → `npx lathe check` → (later) `lathe serve`.

Out of scope: M3 `serve` (the interpreter), source adapters, formula evaluation,
`lathe init .` / `--here` (cwd scaffolding — deferred; M2 is subdir-only), and
deep semantic manifest validation.

## Confirmed decisions

1. **New subdir, no clobber.** `lathe init <name>` creates a new `./<name>/`
   subdirectory and scaffolds inside it; it refuses if that directory already
   holds a `capability.yaml` (never overwrites).
2. **Guided, valid template.** The scaffolded `capability.yaml` is a guided
   template — a minimal VALID core plus commented examples of every section — and
   must pass `lathe check` as-is.

## Context

- **Visuals:** none.
- **References:** `src/commands/check.ts` (the command pattern to mirror —
  `registerX(program)`, action calls a library fn, sets `process.exitCode = 1` on
  failure), `src/manifest/load.ts` (`validateManifest` reused in the scaffold test
  to prove the generated manifest is valid).
- **Product alignment:** roadmap M2 (`init`) — scaffold `capability.yaml`,
  `SKILL.md`, `references/`, `.env.example`.

## Standards Applied

- **`agent-os/standards/cli/commands.md`** — one file per command; logic lives in
  a library (`src/scaffold/init.ts`) the command (`src/commands/init.ts`) calls,
  not in the command file. Exit codes matter (0 success / 1 refusal); `--help`
  documents the `<name>` arg.
- **`agent-os/standards/testing/tdd.md`** — the feature ships with passing vitest
  tests; the contract tested is "generated manifest validates," not message wording.
- **`agent-os/standards/testing/packaging.md`** — layer 1 (library:
  `src/scaffold/init.test.ts`) + layer 2 (CLI: extended `src/cli.test.ts`) both run
  in `npm test`; templates are inline so they ship via `dist/` with no `files` change.
- **`agent-os/standards/manifest/spec-not-code.md`** — the guided template reflects
  the declare/defer dial (declared pipelines vs model-chained tools, locked compute
  frozen) and quotes `${VAR}` placeholders inside YAML flow maps.

# Decisions

A chronological log of significant decisions, newest first. Each entry: the decision, why,
and any trade-offs accepted.

## 2026-06-29 — `lathe init` scaffolds a subdir with a guided, valid template

**Decision.** `lathe init <name>` creates a new `./<name>/` subdirectory and scaffolds a
`capability.yaml`, `SKILL.md`, `.env.example`, and `references/README.md` inside it. The
generated `capability.yaml` is a guided template — a minimal valid core plus commented
examples of every section — that passes `lathe check` as-is. It refuses to overwrite a
directory that already holds a `capability.yaml`.

**Why.** A blank file is a poor starting point; a guided-but-valid template teaches the
manifest shape (the declare/defer dial, quoted `${VAR}` placeholders) while guaranteeing the
inner loop works from the first `check`. Subdir-only keeps `init` non-destructive and defers
the riskier `init .` / `--here` cwd-scaffolding to later. Refusing to clobber means re-running
`init` is always safe.

**Trade-offs.** Templates are inline strings (not files on disk) so they ship via `dist/`
with no `files` change, at the cost of living in TypeScript rather than as editable fixtures.

## 2026-06-29 — ESM-only package, accepted

**Decision.** lathe ships as ESM only (`type: module`); no CommonJS build. The `attw`
warning that CJS consumers can't `require('@lathe/cli')` (dynamic `import()` only) is an
accepted trade-off — most consumers use the `lathe` bin, and dual CJS/ESM publishing is
weight we don't want. Revisit only if a real CJS consumer of the library face appears.

## 2026-06-29 — npm package name: `@lathe/cli`, binary stays `lathe`

**Decision.** Publish under the scoped name `@lathe/cli`; keep the CLI binary named `lathe`.

**Why.** The bare name `lathe` is already taken on npm (an unrelated `lathe@0.4.0` exists).
The scoped `@lathe/cli` is available and mirrors the old working name `@capkit/cli`. The
binary name is independent of the package name, so users still type `npx lathe`.

**Trade-offs.** Install command is `npm i -D @lathe/cli` rather than `npm i -D lathe`. Worth
it to keep the `lathe` invocation that the whole UX is built around.

## 2026-06-29 — Interpret first, eject later

**Decision.** Build a generic interpreter (`lathe serve` reads the manifest at runtime and
stands up the server) before building `build --eject` (emit standalone code).

**Why.** The interpreter is the shortest path to a real end-to-end loop — edit YAML, serve,
talk to Claude. Once it works, ejecting to standalone code is mechanical. Doing it the other
way would mean designing the emitted-code shape before we know the runtime is right.

**Trade-offs.** The interpreter carries lathe as a runtime dependency until a capability is
ejected. Acceptable for the dev loop; ejection removes it for distribution.

## 2026-06-29 — The manifest is a spec; lathe is the engine

**Decision.** The capability manifest (`capability.yaml`) is declarative and **never
executes**. lathe reads the declaration and runs real code on the user's behalf — like a
Prisma schema generating SQL, or a Dockerfile building an image.

**Why.** This is the core of the product. It keeps the reproducible side (locked compute,
declared pipelines) cleanly separated from the judgment side (what the model decides), and
makes capabilities reviewable as data, not code. Locked compute is returned **frozen** so
the model reasons about authoritative numbers instead of re-deriving them.

**Trade-offs.** The declarative grammar must stay tiny — a few operators, `sum/avg/min/max/
last`, windows, ratios. The moment a capability needs branching or richer logic, it escapes
to code or to the model rather than growing the grammar.

## 2026-06-29 — License: MIT

**Decision.** MIT license, copyright Stephen Hathaway, 2026.

**Why.** Lightweight, permissive, and the common default for OSS developer tooling — fewest
obligations for adopters.

## 2026-06-29 — Name: `lathe` (formerly `capkit`)

**Decision.** The project and CLI are named `lathe`. The design docs that seeded the project
called it `capkit`; that is the old name.

**Why.** A lathe shapes raw stock into a precise, repeatable form — which is what the tool
does to a capability manifest. Treat any remaining `capkit` references as historical.

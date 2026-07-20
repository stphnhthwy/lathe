# Standards for M6 — eject HTTP entrypoint

---

## cli/commands

# CLI command structure

Commands are small, testable units wired into one `commander` program.

## Structure
- One file per command at `src/commands/<name>.ts`, exporting a function that registers the
  command on the shared `commander` program (name, description, args, options, action).
- `src/cli.ts` owns the program, the `#!/usr/bin/env node` shebang, and registers every
  command. It is the `bin` entry (`dist/cli.js`).
- **Keep logic out of the command file.** A command parses input, calls into a library
  function (e.g. `src/manifest/load.ts`), and formats output. The library face lives under
  `src/` and is re-exported from `src/index.ts` so it's testable and usable programmatically.

## Conventions
- **Exit codes matter.** Success exits 0; a validation or runtime failure prints a clear
  message and exits non-zero. Don't throw raw stack traces at the user for expected failures.
- **Read vs write semantics carry through.** A command (and later, an emitted MCP tool) that
  only reads is `readonly` (no confirmation); one that writes is `confirm` (the assistant
  prompts before the write). Preserve this distinction from CLI to emitted tool.
- **`--help` is a feature.** Every command has a one-line description and documents its args.

## Don't
- Don't put manifest parsing, HTTP calls, or compute inside a command file — that belongs in a
  library module the command calls.

**Why it applies to M6:** the only command-file change is presentation (the
"Next steps" copy in `src/commands/build.ts`). The new behavior — the
`mainHttpJs()` template and the eject file list — lives in the `src/build/`
library face, where it is testable without spawning the CLI.

---

## testing/tdd

# Test-driven development

Every feature ships with passing tests. No exceptions. Tests are the build gate.

## Rules
- **Write the test first**, or alongside, the behavior — never after the fact "to catch up."
- **`vitest`** is the test framework (ESM/TS-native, fast).
- **A feature is not done until its tests pass.** A red build is not mergeable.
- **Test the contract, not the implementation.** For the manifest, that means: a valid
  manifest validates; a malformed one fails with a clear, specific error.
- **Use the real example as a fixture.** `examples/training-coach/capability.yaml` is the
  canonical happy-path input — test against it so the schema tracks the real target.

## Don't
- Don't add a feature with no test "for now."
- Don't assert on incidental detail (error message wording, field order) that will churn.

**Why it applies to M6:** Task 2 writes the `eject.test.ts` assertions before
the template exists; the contract under test is "the emitted tree contains a
working HTTP entrypoint," not the template's text. `examples/training-coach/`
stays the fixture for both the unit and integration layers.

---

## testing/packaging

# Testing a package, not just the code

lathe is published and installed. It is not enough that the code works — the **artifact a
user installs** must work. Test in four layers, cheap to expensive.

## 1. Library tests — the logic
`vitest` against exported functions (`validateManifest`, `loadManifest`). Fast, run
constantly, the bulk of coverage. Test the contract, not message wording. (See `tdd.md`.)

## 2. CLI tests — the actual binary
Unit tests never exercise the real entry point — arg parsing, exit codes, stdout/stderr.
Spawn the built CLI as a subprocess and assert on it:
- valid input → exit 0, expected stdout
- bad input / missing file → **non-zero exit**, clear stderr

This catches "works in a test, throws as a command." Build first, then run `node dist/cli.js`.

## 3. Packaging tests — does the artifact ship correctly
The layer apps don't have. None of these publish:
- **`npm pack --dry-run`** — confirm only the intended files ship (`files: ["dist"]` + the
  always-included `LICENSE`/`README`/`package.json`). No `src/`, `examples/`, or `agent-os/`.
- **`npx publint`** — lints `package.json` for broken `exports` / `bin` / `main`.
- **`npx @arethetypeswrong/cli --pack`** — confirms the emitted `.d.ts` types resolve for
  consumers. Relevant because lathe exposes a library face via `exports`.

## 4. Consumer smoke test — install it like a user
The highest-fidelity check. Pack, install the tarball into a throwaway project, run it:
```bash
npm pack                                  # → @lathe-cli-x.y.z.tgz
cd "$(mktemp -d)" && npm init -y >/dev/null
npm i /path/to/the.tgz                     # installs deps + bin, as a real user does
npx lathe check                            # the bin resolves and runs
node -e "import('@lathe/cli').then(m => console.log(typeof m.validateManifest))"
```
This is the only layer that catches a dep mislabeled as a `devDependency`, a bad `bin` path,
or `exports` that don't resolve once installed — your repo can't see these because it has
everything on disk. (`npm link` is the dev shortcut; pack-and-install is the honest version.)

## Discipline
- Layers 1–2 run in `npm test` (CI on every PR).
- Layers 3–4 are a **pre-publish gate**: build → test → `publint` → pack → install-and-run.
- When lathe **emits** a package (`build --eject`, M5), the emitted artifact gets the same
  four layers — the eject is not done until a packed-and-installed copy runs.

**Why it applies to M6:** the deliverable *is* an emitted artifact. The
integration test boots the emitted `main-http.js` over real HTTP (layer 4 in
miniature), and the M6 acceptance is a live Inspector session against a fresh
eject with `@lathe/cli` absent — the same "test the artifact, not the repo"
discipline M5's smoke established.

---

## global/commits

# Commit messages

Every commit message starts with a type prefix, then a colon, then a short description. Use the present tense, lowercase after the colon, no trailing period.

## Types

- `feat:` — new capability
- `fix:` — bug fix
- `docs:` — documentation
- `chore:` — maintenance, cleanup, config tweaks
- `refactor:` — code restructuring without behavior change
- `build:` — Dockerfile, package.json, dependency changes

## Examples

- `feat: add password reset flow`
- `fix: handle empty cart on checkout`
- `docs: update README install steps`
- `chore: bump node to 22`
- `refactor: extract auth middleware`
- `build: pin postgres to 16.2`

## Guidance

Keep the subject line under ~72 characters. If a commit needs more explanation, leave a blank line after the subject and write a body paragraph below. The subject answers "what changed"; the body answers "why."

One logical change per commit. If you find yourself writing "and" in the subject, consider splitting into two commits.

**Why it applies to M6:** the spec lands as `docs: shape M6 eject-http spec`;
the implementation lands as `feat:` commits, one logical change each (emit
template, integration test, CLI copy).

---

## manifest/spec-not-code

# The manifest is a spec, not code

`capability.yaml` is **declarative and never executes.** lathe reads the declaration and runs
real code on the user's behalf — like a Prisma schema generating SQL, or a Dockerfile building
an image. Manifest = spec; lathe = engine.

## The dial
At every level, **declare what must be reproducible, defer what needs judgment:**

| Level         | Reproducible (declare)            | Judgment (defer)                 |
|---------------|-----------------------------------|----------------------------------|
| Value         | `formula: "duration_min * rpe"`   | `ask` (model/user supplies)      |
| Field mapping | `declare` / `coerce`              | `ask`                            |
| Orchestration | declared pipeline (`steps`)       | atomic tools the model chains    |

## Locked compute is frozen
Anything in `behavior.computed_locked` is computed in code and returned **frozen**. The model
reasons about these numbers; it never recomputes or estimates them. This is the guardrail that
keeps a model-built plan physically sane.

## Keep the grammar tiny
Formulas allow a few operators plus `sum/avg/min/max/last`, a window, ratios, and `delta`.
**Branching or looping in a declared pipeline is the signal to escape** — to code or to the
model — not to grow the grammar. Declared pipelines are **linear only**.

## Sources vs references
- **Sources** are live data you *call* (`http`, `mcp`, `postgres`/`sqlite`). They feed the
  reproducible side. lathe owns none of this data.
- **References** are static knowledge the model *reads* (a PDF, a docs file). They ride with
  the skill and are consulted, never called. A PDF is a reference, not a source.

## Validation boundary (M1)
`lathe check` validates the manifest's **structure** (shape, required keys, enums). **Semantic**
checks — formula grammar, JSONPath in `map`, cross-references between sources and tools — are a
later milestone. Keep that line explicit in `check` output so a "valid" result isn't mistaken
for "semantically sound."

**Why it applies to M6:** M6 must not leak transport into the manifest. There
is no `transport:` key, no `port:` key — the manifest stays a declaration of
capability, and how the server is reachable remains an engine/deployment
concern expressed only in the emitted entrypoints.

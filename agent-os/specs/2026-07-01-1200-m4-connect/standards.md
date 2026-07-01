# Standards for M4 — Connect

The following standards apply to this work. Full text snapshotted so the spec is
self-contained.

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

**Why it applies to M4:** every change here is either documentation
(`README.md`, `agent-os/product/roadmap.md`, `agent-os/decisions.md`) or spec
(`agent-os/specs/2026-07-01-1200-m4-connect/**`). All commits use the `docs:` prefix.
The spec-folder commit, the README + Status commit, the roadmap + decisions commit,
and the smoke-trace addendum commit are separable logical changes.

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

**Why it applies to M4:** the Connect docs and the decisions entry both frame what happens
at connect-time in these terms — the manifest declared, `lathe serve` stood up the tools,
and the client (Claude Desktop) just launches the stdio subprocess. Nothing new executes
at M4; the frozen locked-compute contract from M3 Slice 3 flows unchanged through the
Claude conversation.

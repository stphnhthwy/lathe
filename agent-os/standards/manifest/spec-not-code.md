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

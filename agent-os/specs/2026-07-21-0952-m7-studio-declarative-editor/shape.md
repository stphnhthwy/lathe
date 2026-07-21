# Shape — M7 Studio: a declarative capability editor (`lathe studio`)

> **Status: reviewed and confirmed (2026-07-21).** Shaped against the wireframe
> session ("Studio, similar to Supabase/Prisma studio") plus the product docs;
> the open questions below were answered in review. Panel naming/layout follows
> the manifest's own section structure — reconcile fine details against
> `lathe-wireframes.html` opportunistically during implementation (the file
> was not available in the environment where this spec was written).

## Scope

A small local web UI around building a capability — the **declarative** side
only. `lathe studio [path]` opens a browser UI over one capability directory
(the same directory `check`/`serve`/`build` take), the way `prisma studio`
opens over a schema. The studio edits `capability.yaml` through structured
forms; it never generates content and never executes the manifest (the engine
still does that via `serve`).

Focus order (confirmed in session): **Sources → Skill → Behavior.** Generative
aspects from the wireframe are scrubbed — every panel is plain fields for now.
Tools/pipelines are **view-only** in M7 (the pipeline grammar is the most
complex part of the manifest; editing it is its own milestone).

Delivered in four slices, each a real end-to-end loop:

- **Slice 1 — read-only studio.** `lathe studio` starts a local server
  (`node:http`, consistent with the M6 transport decision — no express),
  serves the static UI, and exposes `GET /api/manifest` — the parsed manifest
  plus zod validation issues from the existing `manifestSchema`. The UI renders
  the capability across panels (Sources / Skill / Behavior / Tools view-only)
  with a validation status bar. No writes yet.
- **Slice 2 — sources.** The flagship panel. List declared sources; per-type
  forms (`http` first: `base_url`, `auth.kind` + `auth.token` env reference,
  `headers`; `mcp`/`postgres`/`sqlite` render as generic key/value forms until
  their adapters exist). Two exposure mechanics beyond the fields themselves
  (see "Exposing sources" below): env-resolution status and connection check.
  Saving writes `capability.yaml` back **preserving comments and key order**
  (the `yaml` package's Document API).
- **Slice 3 — skill.** Capability identity (`capability`, `version`,
  `summary`), the `skill` file pointer, the `references` list with on-disk
  existence indicators (missing references already surface as eject warnings —
  same signal, earlier), and `emit` targets. Fields only — no SKILL.md
  drafting/generation.
- **Slice 4 — behavior.** `schema` entities and fields (type strings,
  `enum[...]`, `derived` formulas as text fields), `metrics`
  (`window`/`formula` as text fields), and `behavior.computed_locked` as a
  multi-select over declared derived fields + metrics. Validation stays
  structural (the M1 boundary): formulas are opaque strings to the studio;
  the formula grammar is not parsed client-side.

## Exposing sources (the core design question)

Supabase/Prisma studio browse *owned* data. lathe owns no data (invariant 3),
so the studio exposes sources as **declarations plus evidence they work**:

1. **Env-resolution status.** `GET /api/env-status` reports, for every
   `${VAR}` referenced in the manifest, whether it resolves in the studio
   process's environment — **booleans only, never values**. The UI shows a
   resolved/missing badge per source. This reuses the `resolveEnv` contract
   (`src/server/http.ts`) without ever shipping a secret to the browser.
2. **Connection check.** `POST /api/source-check` makes one real request
   through the existing `http` adapter (`request()` in `src/server/http.ts`)
   against a source and reports ok/status/error — the same call path `serve`
   uses, so a green check is meaningful. Explicit button, never automatic.
A third mechanic — a **read preview** that runs a declared `readonly` read and
shows rows (the Supabase-studio moment) — was considered and **deferred in
review**: M7 stays purely declarative, and the preview is the one piece that
fetches real data. It returns as its own slice/milestone when wanted; the
entity→read-source derivation the metric engine uses (decision 2026-06-29) is
the design it would reuse.

## Confirmed decisions (review, 2026-07-21)

1. **Studio is a local dev tool, Prisma-style.** One capability directory, one
   local server, browser UI. No hosted mode, no auth, no multi-capability
   workspace. Loopback bind only (`127.0.0.1`).
2. **The studio edits the YAML file; the YAML file stays the source of truth.**
   No sidecar state, no database. Round-trip must preserve comments and key
   order — manifests are comment-rich (see `examples/training-coach/`), and a
   save that strips comments would destroy the guided-template value. This
   makes the `yaml` Document API (not parse→stringify) a load-bearing
   implementation constraint.
3. **Server transport: `node:http`**, matching the M6 litmus — two-digit route
   count, no framework until routing outgrows trivial.
4. **Frontend: Vite + React + TypeScript + shadcn/ui on Base UI primitives**
   in a separate `studio/` source tree, built to `dist/studio/` static assets
   and **shipped in the npm `files`** from the first slice. Component rule
   (confirmed): **do not invent new components** — compose the UI from
   shadcn/ui components (generated into the studio tree, shadcn's
   copy-in model); anything genuinely custom must be built on the underlying
   Base UI primitives, never from scratch. shadcn assets are vendored source
   (not a runtime component dependency), which fits the repo's
   ship-what-you-own posture; only the built static bundle ships to npm.
5. **Tools panel is view-only in M7.** Pipelines (`steps`, `map`, `for_each`,
   `ask`) are the deepest grammar; a form editor for them deserves its own
   shaped milestone with the wireframe in hand.
6. **Validation is the existing zod schema, server-side.** The studio calls
   the same `manifestSchema` that `lathe check` runs; issues render inline per
   panel. No second schema in the frontend.

## Out of scope for M7

- **Generative aspects** (AI-drafted SKILL.md, suggested metrics/mappings) —
  explicitly scrubbed; fields only.
- **Read preview** (running a declared `readonly` read to show rows) —
  deferred in review to keep M7 purely declarative; see "Exposing sources".
- **Tool/pipeline editing** — view-only (proposed decision 5).
- **Semantic validation** (formula grammar, JSONPath in `map`,
  source/tool cross-references) — same boundary as M1; the studio surfaces
  structural issues only.
- **`mcp`/`postgres`/`sqlite` typed forms** — generic key/value editing until
  those adapters exist in the engine; the studio should not model fields the
  runtime can't execute.
- **OAuth flows / secret entry.** The studio never collects secret values —
  it shows which `${VAR}`s are missing and points at `.env`; filling them is
  the user's shell/env concern (invariant 4).
- **Creating a capability from the studio** — `lathe init` owns scaffolding;
  the studio opens an existing directory.

## Context

- **Visuals:** `lathe-wireframes.html` (user's desktop; not in repo — see
  status note). Consider committing a copy under this spec folder when
  implementation starts.
- **References:** `src/manifest/schema.ts` (the shape every form maps onto);
  `src/manifest/load.ts` (read path the API reuses); `src/server/http.ts`
  (`resolveEnv`, `request` — env-status and source-check reuse these);
  `examples/training-coach/capability.yaml` (the comment-rich round-trip
  fixture); `src/build/emit.ts` (M6's `node:http` server shape as prior art).
- **Product alignment:** the studio is a new *face* on the same engine — it
  reads and writes the declaration; `serve`/`build` still do all execution
  (invariant 1). It makes the declare/defer dial visible as UI (invariant 6):
  locked compute, derived fields, and `ask` markers each render distinctly.
  First milestone to touch the tech-stack doc's "Frontend: N/A" line.

## Key notes

- The studio server must never log secrets; env-status is boolean-only and
  `source-check` errors should be passed through the existing adapter error
  text (which contains status + body snippet, not credentials).
- Concurrent edits (user edits YAML in their editor while studio is open):
  last-write-wins is not acceptable silently. Cheapest honest behavior: the
  API returns the file's mtime with the manifest and refuses a save against a
  stale mtime with a "file changed on disk — reload" error.
- A manifest that fails zod validation must still open in the studio (render
  what parsed, show the issues) — a tool that only opens valid files can't
  help you fix an invalid one. YAML that fails to *parse* renders as an error
  page pointing back at the CLI.

## Open questions — resolved in review (2026-07-21)

1. **Frontend stack:** Vite + React confirmed, **plus shadcn/ui as the
   component library on Base UI primitives**. No new bespoke components —
   compose from shadcn; anything custom builds on the primitives.
2. **Wireframe reconciliation:** layout as specced looks good; reconcile fine
   details against `lathe-wireframes.html` during implementation.
3. **Packaging:** the studio **ships with the package** from the first slice
   (`dist/studio/` in the npm `files`).
4. **Read preview:** **deferred** — M7 is purely declarative.

## Standards Applied

- **`cli/commands.md`** — `src/commands/studio.ts` stays thin; server + API
  logic in `src/studio/`. The studio API's write route is the `confirm`-side
  analogue: explicit save, no auto-write.
- **`testing/tdd.md`** — round-trip preservation (comments/order) and the API
  routes land test-first; `examples/training-coach/` is the fixture.
- **`manifest/spec-not-code.md`** — the studio edits the spec; it never
  executes it. Source-check/preview go through the same adapter the engine
  uses rather than new execution paths.
- **`global/commits.md`** — spec ships as `docs:`; implementation as `feat:`.
- **`testing/packaging.md`** — if studio ships in the package, `dist/studio/`
  joins the pack-list assertions and the consumer install smoke.

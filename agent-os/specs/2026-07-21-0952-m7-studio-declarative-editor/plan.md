# M7 — Studio: declarative capability editor (`lathe studio`)

> Pending review — see the status note in `shape.md`. Slice 1 is safe to start
> once the open questions (frontend stack, wireframe reconciliation) are
> answered; Slices 2–4 depend on them only in layout, not in architecture.

## Context

Everything lathe does today is CLI + YAML-in-an-editor. The manifest's whole
point is that a capability is *reviewable as data* — a structured editor is the
natural next face on that data, the way Prisma Studio sits on a Prisma schema.
M7 builds the smallest honest version: a local web UI that reads
`capability.yaml`, renders it as forms across Sources / Skill / Behavior
panels, validates through the existing zod schema, and writes the YAML back
without destroying its comments. Nothing generative; tools view-only.

The design facts that make this cheap:

- `loadManifest` (`src/manifest/load.ts`) already produces
  parsed-manifest-or-issues — `GET /api/manifest` is a thin wrapper.
- `resolveEnv` / `request` (`src/server/http.ts`) already implement env
  resolution and real source calls — env-status and source-check reuse them
  instead of growing new execution paths.
- M6 already established the `node:http`-no-express pattern for a tiny server.

## Recommended approach

New command + new library directory + new frontend tree:

```
src/
  commands/studio.ts     thin: parse args (path, --port, --no-open), call startStudio
  studio/
    server.ts            node:http server: static assets + JSON API
    api.ts               route handlers (manifest read/write, env-status, source-check)
    yaml-edit.ts         comment-preserving manifest mutation (yaml Document API)
studio/                  Vite + React app (separate tsconfig; built by vite)
  index.html, src/...
dist/studio/             vite build output, served by server.ts, shipped in files
```

### API surface (all JSON, loopback only)

- `GET  /api/manifest` → `{ manifest, issues, mtimeMs }` — raw parsed YAML
  (even if zod-invalid) + zod issues + file mtime for stale-write detection.
- `PUT  /api/manifest` — body `{ edits, baseMtimeMs }`; applies **path-scoped
  edits** (e.g. set `sources.strava.base_url`) to the YAML `Document`, writes
  the file, returns the new manifest+issues. 409 on mtime mismatch. Path-scoped
  edits (not whole-document replacement) are what keeps untouched comments and
  ordering intact.
- `GET  /api/env-status` → `{ vars: { STRAVA_TOKEN: true, ... } }` — every
  `${VAR}` found in the manifest, boolean resolved/missing. Never values.
- `POST /api/source-check` — body `{ source, method?, path? }`; one `request()`
  through the http adapter; returns `{ ok, status?, error? }`. Only for
  `type: http` sources in M7.
- `POST /api/read-preview` — body `{ tool }`; runs a declared `readonly` read
  and returns rows (capped, e.g. first 20). *(Slice 2, pending open question 4.)*

### Frontend (pending stack confirmation)

Vite + React + TS. One page, left nav of panels (matching the wireframe's
Studio layout): **Sources**, **Skill**, **Behavior**, **Tools (view-only)**.
A persistent validation bar renders zod issues, each linking to its panel.
Forms are controlled inputs over the manifest JSON; Save issues the path-scoped
`PUT`. The declare/defer dial gets visual vocabulary: locked
(`computed_locked`), derived (`derived:` fields), and deferred (`ask`) values
are badged distinctly wherever they appear.

## Slices

### Slice 1 — read-only studio
1. `src/studio/server.ts` + `api.ts` with `GET /api/manifest`; static serving
   of `dist/studio/`; `lathe studio [path] [--port] [--no-open]` command
   (default port 4989 or next free; prints URL to stderr — stdout stays clean
   by CLI habit even though no protocol runs on it).
2. Frontend scaffold + panels rendering the training-coach manifest read-only,
   validation bar, invalid-manifest-still-opens behavior.
3. Tests: API route unit tests (inject a fixture dir); command registers; a
   served-asset smoke.

### Slice 2 — sources (the flagship)
1. `yaml-edit.ts` test-first against `examples/training-coach/capability.yaml`:
   set/add/remove source fields, assert **comments and key order survive**
   byte-diff-minimal round-trips.
2. `PUT /api/manifest` with mtime guard; `GET /api/env-status`;
   `POST /api/source-check` (mock fetch in tests, live PostgREST in smoke).
3. Sources panel: typed `http` form (base_url, auth kind/token ref, headers
   key-value rows), generic key-value form for other types, env badges,
   check button. Read preview if confirmed in scope.

### Slice 3 — skill
1. Identity fields (`capability`, `version`, `summary`), `skill` path,
   `references` list editor with on-disk existence badges
   (`GET /api/manifest` gains `referenceStatus`), `emit` checkboxes.

### Slice 4 — behavior
1. Schema entity/field editor (field name + type string; `enum[...]` and
   `derived:` rendered as dedicated inputs but validated only structurally).
2. Metrics editor (`window`, `formula` text fields); `computed_locked`
   multi-select sourced from declared derived fields + metric names.
3. Badge pass: locked/derived/ask vocabulary consistent across panels.

## Verification

1. `npm test` green throughout; the round-trip preservation suite is the
   load-bearing one — a save through the studio then `git diff` on the example
   manifest shows only the intended lines.
2. `lathe check` passes on any manifest the studio saves (studio writes are a
   superset-strict client of the same schema).
3. Live smoke per slice: open training-coach in the studio; Slice 2's
   acceptance is editing the `store` source, seeing env badges for
   `${SUPABASE_URL}`/`${SUPABASE_KEY}`, a green source-check against local
   PostgREST, and a diff-clean save. Trace lands in `references.md`.
4. If shipped in the package: `npm pack --dry-run` includes `dist/studio/`;
   consumer install smoke runs `npx lathe studio`.

## Out of scope — later milestones

- Tool/pipeline **editing** (form editor for `steps`/`map`/`ask`) — own
  milestone, wireframe in hand.
- Generative assists of any kind.
- Semantic validation (formula grammar, JSONPath, cross-refs) — when the
  engine grows it, the studio inherits it through the shared schema.
- Typed forms for `mcp`/`postgres`/`sqlite` sources — track the adapters.
- Hosted/multi-user studio, auth, non-loopback bind.

## Standards that apply

See `standards.md` — `cli/commands`, `testing/tdd`, `testing/packaging`,
`global/commits`, `manifest/spec-not-code`.

# References — M7 Studio

## Visuals

- `lathe-wireframes.html` — the wireframe this milestone came from (user's
  desktop; shared in the shaping session but **not committed to the repo and
  not available in the environment where this spec was written**). The session
  framing: a Studio in the Supabase/Prisma mold; focus the declarative
  aspects (sources, skill, behavior); scrub the generative aspects down to
  plain fields. **Action for implementation start: commit a copy of the
  wireframe into this folder and reconcile panel names/layout in `shape.md`
  against it.**

## Code to study (grounding for the design)

- `src/manifest/schema.ts` — the zod shape every form maps onto; also the
  boundary of what the studio may validate (structural only).
- `src/manifest/load.ts` — read path `GET /api/manifest` wraps.
- `src/server/http.ts` — `resolveEnv` (env-status reuses its `${VAR}`
  contract; note the regex `ENV_REF` is the definition of "a referenced var")
  and `request` (source-check/read-preview call it directly).
- `src/server/build.ts` — how the engine derives an entity's read source from
  a `readonly` tool; read-preview reuses that derivation.
- `src/build/emit.ts` (`mainHttpJs()`) — M6's `node:http` two-route server;
  the studio server follows the same no-framework shape.
- `examples/training-coach/capability.yaml` — the comment-rich round-trip
  fixture; preserving its comments through a studio save is the Slice 2
  acceptance bar.

## Prior art

- **Prisma Studio** — local command opens a browser UI over the schema/data;
  the interaction model (`lathe studio` ≈ `prisma studio`) and the
  "one directory, one local server, no auth" posture.
- **Supabase Studio** — the visual reference for the sources/data panels in
  the wireframe; lathe's analogue browses *declarations plus evidence*
  (env badges, connection check) since lathe owns no data — the
  declared-read preview is deferred.
- **shadcn/ui on Base UI primitives** — the confirmed component library.
  Copy-in model: the CLI generates component source into
  `studio/src/components/ui`; the rule is compose-don't-invent, and any
  custom piece builds on the Base UI primitives underneath.

## Smoke traces

### Slice 1 — read-only studio (2026-07-21)

- Built CLI (`node dist/cli.js studio examples/training-coach --no-open --port
  4989`): `GET /api/manifest` returned the training-coach manifest with
  `issues: []` and an mtime; `GET /` served the built UI (`dist/studio/ui`).
- Headless-browser pass over all four panels (Playwright screenshots):
  **Sources** shows strava/store cards with type badges, auth kind + token
  refs, headers, and `${VAR}` environment chips; **Skill** shows identity,
  references, emit; **Behavior** shows the locked-compute badges
  (`load`/`rolling_load`/`acwr`), both schema entities with the `derived` +
  `locked` badge on `load`, and the metrics table; **Tools** shows
  `import_recent` as `pipeline · 2 steps` with `ask ×1`, and the atomic tools
  with `readonly`/`confirm` badges. No console errors.
- `npm pack --dry-run` ships `dist/studio/{api,server}.js` + `dist/studio/ui/`
  (index.html + hashed assets) inside the existing `files: ["dist"]`.
- Vitest: 74/74 including the 9 new studio server tests (valid manifest,
  invalid-still-opens, parse error, missing file, API 404, static serving,
  SPA fallback, traversal guard, UI-not-built 503).

### Slice 1 implementation notes

- The shadcn CLI's registry (`ui.shadcn.com`) was unreachable from the
  implementation environment (network policy), so the equivalent output was
  assembled from the shadcn-ui/ui sources directly: the `vite-app` template
  (`apps/v4/public/r/templates/vite-app.tar.gz`), the Base UI component
  sources (`apps/v4/registry/bases/base/ui/*.tsx`, imports rewritten to
  `@/lib/utils`), the nova preset stylesheet
  (`apps/v4/registry/styles/style-nova.css`, vendored as
  `studio/src/style-nova.css`), and the v4 neutral oklch theme variables
  (`apps/v4/app/globals.css`). `@import "shadcn/tailwind.css"` comes from the
  `shadcn` npm package (a devDependency), which exports it. A
  `components.json` (style nova, base `base`, neutral) is in place so
  `npx shadcn add` works normally where the registry is reachable.

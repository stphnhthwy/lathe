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
  (env badges, connection check, declared-read preview) since lathe owns no
  data.

## Smoke traces

*(empty — filled in per slice during implementation, matching M4–M6 practice)*

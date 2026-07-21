# Standards — M7 Studio

Standards from `agent-os/standards/` that govern this spec, and how each lands.

## `cli/commands`

`lathe studio` follows the one-file-per-command rule: `src/commands/studio.ts`
parses args and delegates to `src/studio/` (the library face). The studio's
write path honors the readonly/confirm spirit: reads are free, every write to
`capability.yaml` is an explicit user Save (no autosave), and the API refuses
stale writes (mtime guard) rather than clobbering.

## `testing/tdd`

Test-first on the two riskiest pieces: comment/order-preserving YAML edits
(`yaml-edit.ts`, fixture: `examples/training-coach/capability.yaml` — the most
comment-dense manifest we have) and the API routes (fixture dir + injected
env/fetch, CI-safe). Live PostgREST stays a manual smoke, matching M3–M6
practice. The vitest build gate applies to the new `src/studio/` code.

## `testing/packaging`

The studio ships in `@lathe/cli` (confirmed in review): `dist/studio/` joins
the `files` allow-list and the `npm pack --dry-run` assertions, and the
consumer install smoke gains `npx lathe studio` boot. The `studio/` source
tree (including copied-in shadcn components) is **not** packed — only the
built bundle ships.

## `manifest/spec-not-code`

The studio is a second reader/writer of the spec, never an executor. Its only
execution paths (source-check, read-preview) go through the same `http`
adapter the engine uses — no studio-private call logic. Structural validation
only, via the shared `manifestSchema`; the studio must not invent a stricter
or looser second schema.

## `global/commits`

This spec ships as `docs:`. Implementation slices ship as `feat:` (one per
slice), test-only follow-ups as `test:`, and the tech-stack/roadmap updates
as `docs:`.

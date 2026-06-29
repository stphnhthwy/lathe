# References

Pointers into the codebase and prior artifacts that shaped this spec.

- **`src/commands/check.ts`** — the command pattern to mirror. `registerCheck(program)`
  registers a subcommand; the action resolves input, calls a library function, formats
  output, and sets `process.exitCode = 1` on failure. `src/commands/init.ts` follows the
  same shape.
- **`src/manifest/load.ts`** — exports `validateManifest(yamlText)`. Reused directly in
  `src/scaffold/init.test.ts` to prove the generated `capability.yaml` is valid (the key
  invariant: `init` can never emit a manifest that immediately fails `check`).
- **`examples/training-coach/capability.yaml`** + **`examples/training-coach/SKILL.md`** —
  the canonical capability whose shape the guided template echoes (sources, schema, metrics,
  behavior, tools; Agent Skills frontmatter + persona body).
- **`~/Desktop/mcp/capkit-handoff.md` §7** — M2 in the original build order (the handoff that
  seeded the project under its former name `capkit`).

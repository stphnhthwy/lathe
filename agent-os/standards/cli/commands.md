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

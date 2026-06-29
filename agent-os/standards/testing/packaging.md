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

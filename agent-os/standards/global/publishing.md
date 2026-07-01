# Publishing to npm

The mechanics of getting `@lathe/cli` onto the registry. Pairs with
[`testing/packaging.md`](../testing/packaging.md) — that doc covers verifying the artifact;
this one covers shipping it.

## One-time setup

1. **npm account** with a verified email (npm blocks publish until verified).
2. **2FA** enabled at `npmjs.com/settings/{username}/profile`. "Auth Only" is enough — it
   gates login but not publish. "Auth and Writes" adds an OTP prompt on every publish.
3. **The `@lathe` org** created at `npmjs.com/org/create` on the free **Unlimited Public**
   plan. Scoped packages default to private and would reject on the free tier — we set
   `publishConfig.access: "public"` in `package.json` so `npm publish` overrides that.
4. **CLI login**: `npm login` (browser flow), then verify with `npm whoami` and
   `npm org ls lathe`.

## Publish flow

Publish from a clean checkout of `main`, not a worktree — the tag should match what shipped.

```bash
git checkout main && git pull
npm publish
```

What runs:
1. `prepublishOnly` → `npm run test && npm run build`. A failing suite blocks the publish.
2. npm packs `dist/` + `LICENSE` + `README.md` + `package.json` (`files: ["dist"]` in
   `package.json` limits the tarball; `LICENSE` and `README.md` are always included).
3. `publishConfig.access: "public"` makes the scoped package public.
4. If 2FA-for-writes is on, npm prompts for an OTP.

Then tag the git SHA that shipped:

```bash
git tag v$(node -p "require('./package.json').version")
git push --tags
```

## Version bumps

Every publish needs a new version — the registry rejects re-uploads of an existing version,
forever. Use `npm version` so the manifest bump, git commit, and tag are one step:

```bash
npm version patch   # 0.1.0 → 0.1.1  (bugfix)
npm version minor   # 0.1.0 → 0.2.0  (feature)
npm version major   # 0.1.0 → 1.0.0  (breaking)
git push && git push --tags
npm publish
```

The CLI's `--version` reads from `package.json` at runtime via `createRequire`, so bumping
the manifest is enough — nothing in `src/` needs to change.

## Prereleases

Use a dist-tag so `npm i @lathe/cli` keeps resolving to the last stable:

```bash
npm version prerelease --preid=rc   # 0.1.1 → 0.1.2-rc.0
npm publish --tag next
```

Users opt in with `npm i @lathe/cli@next`. Promote to stable by publishing the non-prerelease
version to the default `latest` tag: `npm publish` (no `--tag`).

## Undoing a bad publish

- **Within 72 hours**: `npm unpublish @lathe/cli@x.y.z` removes it. Use sparingly — anyone
  who installed it in that window has a broken lockfile.
- **After 72 hours**: `npm deprecate @lathe/cli@x.y.z "reason"`. The version stays
  installable but warns on install. Ship a fixed patch alongside.
- **Never re-use a version number.** If `0.1.0` was broken, ship `0.1.1`.

## Pre-publish gate

Before running `npm publish`, layers 3–4 of [`testing/packaging.md`](../testing/packaging.md)
must pass — `publint`, `attw`, and a real pack-and-install into a throwaway consumer. Green
tests in the repo are not sufficient; the tarball has its own failure modes (bad `bin` path,
`exports` that don't resolve, a runtime dep declared as `devDependency`).

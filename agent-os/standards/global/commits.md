# Commit messages

Every commit message starts with a type prefix, then a colon, then a short description. Use the present tense, lowercase after the colon, no trailing period.

## Types

- `feat:` — new capability
- `fix:` — bug fix
- `docs:` — documentation
- `chore:` — maintenance, cleanup, config tweaks
- `refactor:` — code restructuring without behavior change
- `build:` — Dockerfile, package.json, dependency changes

## Examples

- `feat: add password reset flow`
- `fix: handle empty cart on checkout`
- `docs: update README install steps`
- `chore: bump node to 22`
- `refactor: extract auth middleware`
- `build: pin postgres to 16.2`

## Guidance

Keep the subject line under ~72 characters. If a commit needs more explanation, leave a blank line after the subject and write a body paragraph below. The subject answers "what changed"; the body answers "why."

One logical change per commit. If you find yourself writing "and" in the subject, consider splitting into two commits.

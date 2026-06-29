/**
 * Inline string templates for `lathe init`.
 *
 * These ship as code (no template files on disk) so they're carried into
 * `dist/` automatically — nothing extra to add to `files` in package.json.
 * Each function injects the capability `name` into a guided starting point.
 *
 * The generated `capability.yaml` is a SPEC, not code (see
 * agent-os/standards/manifest/spec-not-code.md): the active lines are a minimal
 * VALID core that passes `lathe check` as-is, and every other section is shown
 * commented as a guided example. `${VAR}` placeholders are quoted inside flow
 * maps so YAML doesn't choke on them.
 */

/** The guided `capability.yaml` — active core valid, the rest commented. */
export function capabilityYaml(name: string): string {
  return `# Capability manifest — created by \`lathe init\`.
# This is a SPEC, not code: lathe reads it and runs real code on your behalf.
# Validate anytime with \`lathe check\`.

capability: ${name}
version: 0.1.0
summary: One-line description of what this capability does

# The skill body the model reads (Agent Skills format), alongside this file.
skill: ./SKILL.md

# References — static knowledge the MODEL reads (PDFs, docs). Consulted, never called.
# references:
#   - ./references/methodology.pdf

# ── SOURCES ── live data you CALL. \`http\` is the default; also \`mcp\`, \`postgres\`, \`sqlite\`.
# sources:
#   api:
#     type: http
#     base_url: https://api.example.com
#     auth: { kind: bearer, token: "\${API_TOKEN}" }   # quote \${...} inside flow maps

# ── SCHEMA ── the SHAPE responses map onto (not DDL — lathe creates no tables).
# schema:
#   item:
#     external_id: string
#     logged_at:   datetime
#     amount:      int
#     score:       { derived: "amount * 2" }

# ── METRICS / BEHAVIOR ── locked, reproducible compute returned FROZEN.
# metrics:
#   rolling: { window: 14d, formula: "sum(item.amount)" }
# behavior:
#   computed_locked: [score, rolling]

# ── TOOLS ── a declared linear pipeline (\`steps\`) OR atomic tools the model chains.
# tools:
#   - name: get_recent
#     description: Recent items, newest first.
#     reads: { source: api, path: /items, query: { order: logged_at.desc, limit: 20 } }
#     readonly: true

# What to emit when you build: a skill, an MCP server, or both.
emit: [skill, mcp]
`;
}

/** The companion `SKILL.md` — Agent Skills frontmatter + a short guided body. */
export function skillMd(name: string): string {
  return `---
name: ${name}
description: One-line description used when listing this skill — say when to use it (and when not).
---

# ${name}

You help the user … Describe the persona and how to behave here.

## When to use
- …

## How to behave
- Reason about locked metrics; never recompute them.
- Confirm before any write.
`;
}

/** `.env.example` — explains `${...}` placeholders resolve at runtime. */
export function envExample(): string {
  return `# Environment for this capability.
#
# Manifest values written as \${SOMETHING} are placeholders — lathe resolves them
# from the environment at runtime, so secrets stay out of capability.yaml.
#
# Copy this file to .env and fill in real values. Never commit .env or any secret.

# API_TOKEN=
`;
}

/** `references/README.md` — what static references are and how to wire them up. */
export function referencesReadme(): string {
  return `# references

Static knowledge the model reads as context — a methodology PDF, a docs file, a
style guide. These are consulted, never called (unlike \`sources\`, which are live
data you call). Drop files here, then list them under \`references:\` in
\`capability.yaml\` so they ride along with the skill.
`;
}

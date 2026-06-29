# Product Mission

## Problem

Building a good MCP server or Agent Skill by hand means writing the same plumbing every
time: an HTTP client with auth and refresh, input schemas, tool registration, confirm/read
annotations, and — the part that quietly goes wrong — deterministic compute that must return
the *same* numbers every time. Worse, the two halves of a real capability get tangled: the
**reproducible** part (locked metrics, declared pipelines) ends up interleaved with the
**judgment** part (what the model should decide), so neither is easy to reason about or
trust.

## Target Users

Developers building personal or product skills on top of Claude (or any MCP client) who want
**structure**: a declared, validated shape for a capability instead of a pile of bespoke
handler code. People who already think in terms of "this number must be reproducible, this
decision belongs to the model" and want a tool that makes that line explicit.

## Solution

`lathe` is a distributable npm package (Prisma-like: a CLI + a runtime) that reads a
declarative **capability manifest** and emits/serves a real MCP server + Agent Skill. The
manifest never executes — lathe reads the declaration and runs real code on the user's
behalf, the way a Prisma schema generates real SQL or a Dockerfile builds an image.

A capability composes two kinds of input, and the design is the dial between them:

1. **Sources** — live data you *call* (`http`, `mcp`, or a local `postgres`/`sqlite` store
   only when data has no home yet). Sources feed the **reproducible** side.
2. **References** — static knowledge the model *reads* (a methodology PDF, a docs file),
   bundled with the skill and consulted as context. References feed the **judgment** side.

The principle, applied at every level (value, field mapping, orchestration): **declare what
must be reproducible, defer what needs judgment.** Locked compute is returned frozen so the
model reasons about authoritative numbers instead of re-deriving them.

lathe owns no data and holds no store. Data lives in the sources; secrets resolve from the
environment at runtime and are never committed. What ships and is safe to share is the
manifest, the `SKILL.md`, and the skill's references.

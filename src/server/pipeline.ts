import { request, type HttpSource } from "./http.js";

/**
 * Declared-pipeline execution — the Slice 2 half of the interpreter.
 *
 * A pipeline is a LINEAR list of `steps` (no branching, no looping beyond a flat
 * `for_each` fan-out — branching is the signal to escape to code or the model,
 * per manifest/spec-not-code.md). Two step kinds:
 *
 *   - a plain `call` (one request) whose result is bound to a variable via `as`.
 *   - a `for_each: <var>` that iterates the bound list and, per item, builds a
 *     body from `map` and issues `call` (typically a POST upsert via `prefer`).
 *
 * `map` values are resolved per item:
 *   - `ask`                → taken from the tool's input arguments (same key).
 *   - `$.field` / `$.a.b`  → JSONPath-lite extraction from the current item.
 *   - `"$.x / 60"`         → a tiny arithmetic expression over extracted numbers.
 *   - anything else        → a literal.
 */

export interface PipelineCall {
  source: string;
  method?: string;
  path: string;
  query?: Record<string, unknown>;
  prefer?: string;
}

export interface PipelineStep {
  call?: PipelineCall;
  as?: string;
  for_each?: string;
  map?: Record<string, unknown>;
}

export interface PipelineRunContext {
  sources: Record<string, HttpSource>;
  /** Tool input, used to fill `ask` fields in a `map`. */
  args: Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface PipelineResult {
  steps: number;
  reads: number;
  writes: number;
}

// ── JSONPath-lite + arithmetic over `map` values ─────────────────────────────

const PATH_ONLY = /^\$\.[\w.]+$/;

/** Resolve a `$.a.b` path against an object (undefined if any hop is missing). */
export function extractPath(item: unknown, path: string): unknown {
  const keys = path.replace(/^\$\./, "").split(".");
  let cur: unknown = item;
  for (const key of keys) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

// Tiny recursive-descent evaluator for + - * / and parentheses, where terms are
// number literals or `$.path` references (resolved to numbers) against `item`.
function evalExpression(expr: string, item: unknown): number {
  const tokens = expr.match(/\$\.[\w.]+|\d+\.?\d*|[+\-*/()]/g) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpr(): number {
    let value = parseTerm();
    while (peek() === "+" || peek() === "-") {
      const op = next();
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
    return value;
  }
  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === "*" || peek() === "/") {
      const op = next();
      const rhs = parseFactor();
      value = op === "*" ? value * rhs : value / rhs;
    }
    return value;
  }
  function parseFactor(): number {
    const token = next();
    if (token === "(") {
      const value = parseExpr();
      if (next() !== ")") throw new Error(`unbalanced parentheses in "${expr}"`);
      return value;
    }
    if (token === "-") return -parseFactor();
    if (token?.startsWith("$.")) {
      const raw = extractPath(item, token);
      const num = Number(raw);
      if (Number.isNaN(num)) throw new Error(`"${token}" is not numeric in expression "${expr}"`);
      return num;
    }
    const num = Number(token);
    if (Number.isNaN(num)) throw new Error(`unexpected token "${token}" in expression "${expr}"`);
    return num;
  }

  const result = parseExpr();
  if (pos !== tokens.length) throw new Error(`could not fully parse expression "${expr}"`);
  return result;
}

function resolveMapValue(
  spec: unknown,
  item: unknown,
  args: Record<string, unknown>,
  key: string,
): unknown {
  if (spec === "ask") return args[key];
  if (typeof spec !== "string") return spec;
  const trimmed = spec.trim();
  if (PATH_ONLY.test(trimmed)) return extractPath(item, trimmed); // preserve raw type (id, date)
  if (trimmed.includes("$.")) return evalExpression(trimmed, item); // arithmetic → number
  return spec; // plain literal
}

/** Build a request body from a `map`, resolved against one `for_each` item. */
export function resolveMap(
  map: Record<string, unknown>,
  item: unknown,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(map)) {
    out[key] = resolveMapValue(spec, item, args, key);
  }
  return out;
}

// ── executor ─────────────────────────────────────────────────────────────────

/** Run a declared pipeline linearly and report how many reads/writes it made. */
export async function executePipeline(
  steps: PipelineStep[],
  ctx: PipelineRunContext,
): Promise<PipelineResult> {
  const vars: Record<string, unknown> = {};
  let reads = 0;
  let writes = 0;

  const resolveSource = (name: string): HttpSource => {
    const source = ctx.sources[name];
    if (!source) throw new Error(`pipeline references unknown source "${name}"`);
    if (source.type !== "http") throw new Error(`source "${name}" is not http (${source.type})`);
    return source;
  };

  for (const step of steps) {
    if (step.for_each !== undefined) {
      const list = vars[step.for_each];
      if (!Array.isArray(list)) {
        throw new Error(`for_each: "${step.for_each}" is not a bound list`);
      }
      const call = step.call;
      if (!call) throw new Error("a for_each step must declare a `call`");
      const source = resolveSource(call.source);
      const method = (call.method ?? "POST") as "GET" | "POST" | "PATCH" | "DELETE";
      for (const item of list) {
        const body = resolveMap(step.map ?? {}, item, ctx.args);
        await request({
          source,
          method,
          path: call.path,
          prefer: call.prefer,
          body,
          env: ctx.env,
          fetchImpl: ctx.fetchImpl,
        });
        writes++;
      }
    } else if (step.call) {
      const call = step.call;
      const source = resolveSource(call.source);
      const method = (call.method ?? "GET") as "GET" | "POST" | "PATCH" | "DELETE";
      const result = await request({
        source,
        method,
        path: call.path,
        query: call.query,
        prefer: call.prefer,
        env: ctx.env,
        fetchImpl: ctx.fetchImpl,
      });
      if (method === "GET") reads++;
      else writes++;
      if (step.as) vars[step.as] = result;
    } else {
      throw new Error("a pipeline step must declare `call` or `for_each`");
    }
  }

  return { steps: steps.length, reads, writes };
}

/**
 * The locked-compute formula engine — the Slice 3 half of the interpreter.
 *
 * This is the guardrail behind the whole product: anything in
 * `behavior.computed_locked` is computed HERE, in code, and returned frozen, so
 * the model reasons about authoritative numbers instead of re-deriving them.
 *
 * The grammar is deliberately tiny (see manifest/spec-not-code.md):
 *   - arithmetic `+ - * /` with parentheses
 *   - derived fields over one row: `duration_min * rpe`
 *   - aggregates over a windowed set of rows: `sum|avg|min|max|last(entity.field)`
 *   - windows on a metric call: `rolling_load(7d)` (N days back from `now`)
 *   - metric references and ratios: `rolling_load(7d) / rolling_load(28d)`
 * Branching/looping is intentionally absent — that's the signal to escape to code
 * or the model, not to grow this language.
 */

const AGGREGATES = new Set(["sum", "avg", "min", "max", "last"]);
const DAY_MS = 86_400_000;

export interface MetricDef {
  window?: string;
  formula: string;
}

export interface MetricEngine {
  metrics: Record<string, MetricDef>;
  /** Entity → field type declarations (for derived fields + the datetime window field). */
  schema: Record<string, Record<string, unknown>>;
  /** Entity → its rows (already fetched from the source). */
  rowsByEntity: Record<string, Array<Record<string, unknown>>>;
  /** Reference "now" for window math — injected so results are reproducible/testable. */
  now: Date;
}

/** Parse a window literal like `14d` into a day count. */
export function parseWindowDays(window: string): number {
  const match = /^(\d+)d$/.exec(String(window).trim());
  if (!match) throw new Error(`unsupported window "${window}" (expected e.g. 14d)`);
  return Number(match[1]);
}

// ── tokenizer + arithmetic core ──────────────────────────────────────────────
// Order matters: identifiers (with an optional `.field`) before windows before
// plain numbers, so `session.load` and `7d` tokenize as single units.
const TOKEN_RE = /[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)?|\d+d|\d+\.?\d*|[()+\-*/,]/g;

interface EvalHooks {
  /** Resolve a bare identifier (a row field, or a metric name). */
  ident: (name: string) => number;
  /** Resolve a `name(arg)` call — aggregates or metric-with-window. */
  call: (name: string, arg: string) => number;
}

function evaluate(expr: string, hooks: EvalHooks): number {
  const tokens = expr.match(TOKEN_RE) ?? [];
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function parseExpression(): number {
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
    if (token === undefined) throw new Error(`unexpected end of expression "${expr}"`);
    if (token === "(") {
      const value = parseExpression();
      if (next() !== ")") throw new Error(`unbalanced parentheses in "${expr}"`);
      return value;
    }
    if (token === "-") return -parseFactor();
    if (peek() === "(") {
      next(); // consume "("
      const arg = next();
      if (arg === undefined || arg === ")") throw new Error(`"${token}(...)" needs an argument`);
      if (next() !== ")") throw new Error(`expected ) after ${token}(${arg}`);
      return hooks.call(token, arg);
    }
    if (/^\d/.test(token)) return Number(token);
    return hooks.ident(token);
  }

  const result = parseExpression();
  if (pos !== tokens.length) throw new Error(`could not fully parse expression "${expr}"`);
  return result;
}

// ── derived fields (per row) ─────────────────────────────────────────────────

/** Evaluate a derived-field formula (e.g. `duration_min * rpe`) over one row. */
export function computeDerivedField(formula: string, row: Record<string, unknown>): number {
  return evaluate(formula, {
    ident: (name) => {
      const value = Number(row[name]);
      if (Number.isNaN(value)) throw new Error(`field "${name}" is not numeric in "${formula}"`);
      return value;
    },
    call: () => {
      throw new Error(`function calls are not allowed in a derived field ("${formula}")`);
    },
  });
}

// ── metrics (aggregates over windowed rows) ──────────────────────────────────

/** The datetime/date field of an entity — the axis windows are measured on. */
function timestampField(entitySchema: Record<string, unknown>): string {
  for (const [key, spec] of Object.entries(entitySchema)) {
    if (spec === "datetime" || spec === "date") return key;
  }
  throw new Error("entity has no datetime/date field to window on");
}

function windowedRows(
  entity: string,
  windowDays: number | null,
  engine: MetricEngine,
): Array<Record<string, unknown>> {
  const rows = engine.rowsByEntity[entity] ?? [];
  if (windowDays === null) return rows;
  const tsField = timestampField(engine.schema[entity] ?? {});
  const nowMs = engine.now.getTime();
  const cutoff = nowMs - windowDays * DAY_MS;
  return rows.filter((row) => {
    const t = Date.parse(String(row[tsField]));
    return !Number.isNaN(t) && t >= cutoff && t <= nowMs;
  });
}

/** Value of `entity.field` for a row — using a present value or the derived formula. */
function fieldValue(entity: string, field: string, row: Record<string, unknown>, engine: MetricEngine): number {
  const present = row[field];
  if (present !== undefined && present !== null && !Number.isNaN(Number(present))) {
    return Number(present);
  }
  const spec = engine.schema[entity]?.[field];
  if (spec !== null && typeof spec === "object" && "derived" in (spec as object)) {
    return computeDerivedField(String((spec as { derived: unknown }).derived), row);
  }
  const value = Number(present);
  if (Number.isNaN(value)) throw new Error(`field "${entity}.${field}" is not numeric`);
  return value;
}

function aggregate(name: string, arg: string, windowDays: number | null, engine: MetricEngine): number {
  const [entity, field] = arg.split(".");
  if (!entity || !field) throw new Error(`aggregate "${name}" expects entity.field, got "${arg}"`);
  const rows = windowedRows(entity, windowDays, engine);
  const values = rows.map((row) => fieldValue(entity, field, row, engine));
  if (values.length === 0) return 0; // empty window → 0 (keeps ratios/sums clean)
  switch (name) {
    case "sum": return values.reduce((a, b) => a + b, 0);
    case "avg": return values.reduce((a, b) => a + b, 0) / values.length;
    case "min": return Math.min(...values);
    case "max": return Math.max(...values);
    case "last": return values[values.length - 1];
    default: throw new Error(`unknown aggregate "${name}"`);
  }
}

function evalMetricFormula(formula: string, windowDays: number | null, engine: MetricEngine): number {
  return evaluate(formula, {
    ident: (name) => {
      if (engine.metrics[name]) return evaluateMetric(name, engine);
      throw new Error(`unknown identifier "${name}" in metric formula "${formula}"`);
    },
    call: (name, arg) => {
      if (AGGREGATES.has(name)) return aggregate(name, arg, windowDays, engine);
      if (engine.metrics[name]) return evalMetricFormula(engine.metrics[name].formula, parseWindowDays(arg), engine);
      throw new Error(`unknown function "${name}" in metric formula "${formula}"`);
    },
  });
}

/** Evaluate a named metric using its declared default window (if any). */
export function evaluateMetric(name: string, engine: MetricEngine): number {
  const def = engine.metrics[name];
  if (!def) throw new Error(`unknown metric "${name}"`);
  const windowDays = def.window ? parseWindowDays(def.window) : null;
  return evalMetricFormula(def.formula, windowDays, engine);
}

/**
 * Collect the schema entities a set of metrics needs (transitively through metric
 * references), so the caller knows which entities' rows to fetch.
 */
export function entitiesForMetrics(
  names: string[],
  metrics: Record<string, MetricDef>,
  schema: Record<string, Record<string, unknown>>,
): Set<string> {
  const entities = new Set<string>();
  const seen = new Set<string>();
  const visit = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    const def = metrics[name];
    if (!def) return;
    for (const m of def.formula.matchAll(/([A-Za-z_]\w*)\.[A-Za-z_]\w*/g)) {
      if (schema[m[1]]) entities.add(m[1]);
    }
    for (const m of def.formula.matchAll(/[A-Za-z_]\w*/g)) {
      if (metrics[m[0]]) visit(m[0]);
    }
  };
  names.forEach(visit);
  return entities;
}

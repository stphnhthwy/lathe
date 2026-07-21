/**
 * The `http` source adapter — the one source kind lathe executes in M3.
 *
 * A capability declares sources (live data you CALL); this module turns an
 * `http` source declaration plus a request shape into a real HTTP call. It
 * resolves `${VAR}` secrets from the environment at call time (never committed),
 * builds auth/headers, serializes a PostgREST-style query, and returns parsed
 * JSON — throwing a clear, specific error on a missing env var or a non-2xx
 * response.
 *
 * OAuth *refresh* is intentionally out of scope (Phase 2): an `oauth2` source is
 * treated like a bearer token that must already be valid in the environment.
 */

/** An `http` source as declared in the manifest (loose — extra keys allowed). */
export interface HttpSource {
  type: string;
  base_url: string;
  auth?: { kind?: string; token?: string };
  headers?: Record<string, string>;
}

export interface RequestOptions {
  source: HttpSource;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  /** PostgREST-style query, e.g. `{ order: "logged_at.desc", limit: 60 }`. */
  query?: Record<string, unknown>;
  /** JSON body for writes. */
  body?: unknown;
  /** Value for the `Prefer` header, e.g. `resolution=merge-duplicates`. */
  prefer?: string;
  /** Environment to resolve `${VAR}` from (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Fetch implementation (defaults to the global `fetch`); injectable for tests. */
  fetchImpl?: typeof fetch;
}

/** The definition of "a referenced env var" — shared by the studio's env-status. */
export const ENV_REF = /\$\{([A-Z0-9_]+)\}/gi;

/**
 * Replace every `${VAR}` in a string with its environment value. Throws a clear
 * error naming the first missing variable — secrets resolve at runtime or fail
 * loudly, never silently as the literal `${VAR}`.
 */
export function resolveEnv(value: string, env: NodeJS.ProcessEnv = process.env): string {
  return value.replace(ENV_REF, (_match, name: string) => {
    const resolved = env[name];
    if (resolved === undefined) {
      throw new Error(`missing environment variable: ${name} (referenced as \${${name}})`);
    }
    return resolved;
  });
}

/**
 * Build the request headers for a source: `Authorization: Bearer <token>` from
 * `auth` (bearer/oauth2), plus any declared `headers` (e.g. Supabase `apikey`).
 * Every value is env-resolved.
 */
export function buildAuthHeaders(
  source: HttpSource,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const kind = source.auth?.kind;
  if (kind === "bearer" || kind === "oauth2") {
    const token = source.auth?.token;
    if (!token) {
      throw new Error(`source auth kind "${kind}" requires a token`);
    }
    headers["Authorization"] = `Bearer ${resolveEnv(token, env)}`;
  }

  for (const [key, raw] of Object.entries(source.headers ?? {})) {
    headers[key] = resolveEnv(String(raw), env);
  }

  return headers;
}

/** Serialize a query record into a `?a=1&b=2` string (empty string if no query). */
function serializeQuery(query?: Record<string, unknown>): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/**
 * Make one HTTP request against a source and return parsed JSON (or `null` for
 * an empty body). Throws on a non-2xx response with the status and a body snippet.
 */
export async function request(opts: RequestOptions): Promise<unknown> {
  const { source, method, path, query, body, prefer } = opts;
  const env = opts.env ?? process.env;
  const doFetch = opts.fetchImpl ?? fetch;

  const base = resolveEnv(source.base_url, env).replace(/\/$/, "");
  const url = `${base}${path}${serializeQuery(query)}`;

  const headers = buildAuthHeaders(source, env);
  if (prefer) headers["Prefer"] = prefer;

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await doFetch(url, init);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`request to ${method} ${url} failed: ${message}`);
  }

  const text = await res.text();
  if (!res.ok) {
    const snippet = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    throw new Error(`${method} ${url} → ${res.status} ${res.statusText}: ${snippet}`);
  }

  if (text.trim() === "") return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

import { readFileSync, statSync, writeFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { manifestSchema } from "../manifest/schema.js";
import type { ManifestIssue } from "../manifest/load.js";
import { ENV_REF, request, type HttpSource } from "../server/http.js";
import { applyEdits, type ManifestEdit } from "./yaml-edit.js";

/**
 * The studio's read model for one capability manifest.
 *
 * Unlike `loadManifest`, a zod-invalid manifest is still `ok: true` here — the
 * studio must open invalid manifests so the user can fix them, so validation
 * issues ride alongside the raw parsed document instead of replacing it.
 * Only an unreadable file or unparseable YAML is `ok: false`.
 */
export type ManifestState =
  | {
      ok: true;
      /** The raw parsed YAML document (not the zod-narrowed type — may be invalid). */
      manifest: Record<string, unknown>;
      issues: ManifestIssue[];
      /** File mtime at read, for stale-write detection when saves arrive (Slice 2). */
      mtimeMs: number;
    }
  | { ok: false; error: string };

export function readManifestState(manifestPath: string): ManifestState {
  let text: string;
  let mtimeMs: number;
  try {
    text = readFileSync(manifestPath, "utf8");
    mtimeMs = statSync(manifestPath).mtimeMs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `cannot read ${manifestPath}: ${message}` };
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `YAML parse error: ${message}` };
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `manifest is not a YAML mapping: ${manifestPath}` };
  }

  const result = manifestSchema.safeParse(raw);
  const issues: ManifestIssue[] = result.success
    ? []
    : result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

  return { ok: true, manifest: raw as Record<string, unknown>, issues, mtimeMs };
}

// ── PUT /api/manifest ────────────────────────────────────────────────────────

export type WriteManifestResult =
  | { ok: true; status: 200; state: ManifestState }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Apply path-scoped edits to the manifest file and return the fresh state.
 * The mtime guard makes stale writes explicit: if the file changed on disk
 * since the client loaded it (`baseMtimeMs`), the write is refused with a 409
 * instead of silently clobbering the newer content.
 */
export function writeManifest(
  manifestPath: string,
  edits: ManifestEdit[],
  baseMtimeMs: number,
): WriteManifestResult {
  let text: string;
  let mtimeMs: number;
  try {
    text = readFileSync(manifestPath, "utf8");
    mtimeMs = statSync(manifestPath).mtimeMs;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 404, error: `cannot read ${manifestPath}: ${message}` };
  }

  if (mtimeMs !== baseMtimeMs) {
    return {
      ok: false,
      status: 409,
      error: "capability.yaml changed on disk since it was loaded — reload before saving",
    };
  }

  let next: string;
  try {
    next = applyEdits(text, edits);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 400, error: message };
  }

  writeFileSync(manifestPath, next);
  return { ok: true, status: 200, state: readManifestState(manifestPath) };
}

/** Validate a PUT body into typed edits + base mtime; null when malformed. */
export function parseWriteBody(
  body: unknown,
): { edits: ManifestEdit[]; baseMtimeMs: number } | null {
  if (body === null || typeof body !== "object") return null;
  const { edits, baseMtimeMs } = body as { edits?: unknown; baseMtimeMs?: unknown };
  if (typeof baseMtimeMs !== "number" || !Array.isArray(edits)) return null;

  const isPath = (p: unknown): p is (string | number)[] =>
    Array.isArray(p) &&
    p.length > 0 &&
    p.every((k) => typeof k === "string" || typeof k === "number");
  const isScalar = (v: unknown): boolean =>
    v === null || ["string", "number", "boolean"].includes(typeof v);

  const parsed: ManifestEdit[] = [];
  for (const e of edits) {
    if (e === null || typeof e !== "object") return null;
    const { op, path, value } = e as { op?: unknown; path?: unknown; value?: unknown };
    if (!isPath(path)) return null;
    if (op === "remove") parsed.push({ op, path });
    else if (op === "set" && isScalar(value)) {
      parsed.push({ op, path, value: value as string | number | boolean | null });
    } else return null;
  }
  return { edits: parsed, baseMtimeMs };
}

// ── GET /api/env-status ──────────────────────────────────────────────────────

/**
 * Every `${VAR}` referenced by a manifest *value*, marked resolved/missing
 * against the environment. Booleans only — the studio never sees values.
 */
export function envStatus(
  manifestPath: string,
  env: NodeJS.ProcessEnv = process.env,
): { vars: Record<string, boolean> } {
  const state = readManifestState(manifestPath);
  if (!state.ok) return { vars: {} };
  const vars: Record<string, boolean> = {};
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      for (const m of value.matchAll(new RegExp(ENV_REF.source, ENV_REF.flags))) {
        vars[m[1]] = env[m[1]] !== undefined;
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value !== null && typeof value === "object") {
      Object.values(value).forEach(walk);
    }
  };
  walk(state.manifest);
  return { vars };
}

// ── POST /api/source-check ───────────────────────────────────────────────────

export interface SourceCheckOptions {
  manifestPath: string;
  /** Name of the source under `sources:` to check. */
  source: string;
  /** Path to GET on the source (default `/`). */
  path?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

export interface SourceCheckResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * One GET through the engine's `request()` adapter — the same env resolution
 * and auth building real tool calls use, no studio-private call logic. A
 * failed check is a *result*, not a server error: the caller always gets
 * `{ ok, status?, error? }`.
 */
export async function sourceCheck(opts: SourceCheckOptions): Promise<SourceCheckResult> {
  const state = readManifestState(opts.manifestPath);
  if (!state.ok) return { ok: false, error: state.error };

  const sources = state.manifest.sources;
  const source =
    sources !== null && typeof sources === "object" && !Array.isArray(sources)
      ? (sources as Record<string, unknown>)[opts.source]
      : undefined;
  if (source === undefined || source === null || typeof source !== "object") {
    return { ok: false, error: `no such source: ${opts.source}` };
  }

  const declared = source as Partial<HttpSource> & { type?: unknown };
  if (declared.type !== "http") {
    return { ok: false, error: `source-check supports type: http only (got ${String(declared.type)})` };
  }
  if (typeof declared.base_url !== "string") {
    return { ok: false, error: `source ${opts.source} has no base_url` };
  }

  let status: number | undefined;
  const inner = opts.fetchImpl ?? fetch;
  const capture: typeof fetch = async (input, init) => {
    const res = await inner(input, init);
    status = res.status;
    return res;
  };

  try {
    await request({
      source: declared as HttpSource,
      method: "GET",
      path: opts.path ?? "/",
      env: opts.env,
      fetchImpl: capture,
    });
    return { ok: true, status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status, error: message };
  }
}

import { readFileSync, statSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { manifestSchema } from "../manifest/schema.js";
import type { ManifestIssue } from "../manifest/load.js";

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

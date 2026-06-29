import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { manifestSchema, type Manifest } from "./schema.js";

export interface ManifestIssue {
  /** Dotted path to the offending field, e.g. `tools.0.name`. */
  path: string;
  message: string;
}

export type LoadResult =
  | { ok: true; manifest: Manifest }
  | { ok: false; issues: ManifestIssue[] };

/**
 * Parse + structurally validate a capability manifest from a YAML string.
 * Returns a typed manifest on success, or a flat list of issues on failure.
 */
export function validateManifest(yamlText: string): LoadResult {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ path: "", message: `YAML parse error: ${message}` }] };
  }

  const result = manifestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, manifest: result.data };
  }

  const issues = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { ok: false, issues };
}

/** Read a manifest file from disk and validate it. */
export function loadManifest(path: string): LoadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, issues: [{ path: "", message: `cannot read ${path}: ${message}` }] };
  }
  return validateManifest(text);
}

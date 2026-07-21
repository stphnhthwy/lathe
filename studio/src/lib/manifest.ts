// The studio's read model, mirroring src/studio/api.ts (ManifestState).
// The manifest is the RAW parsed YAML — possibly zod-invalid — so every
// field access here is defensive.

export interface ManifestIssue {
  path: string
  message: string
}

export type ManifestState =
  | {
      ok: true
      manifest: Record<string, unknown>
      issues: ManifestIssue[]
      mtimeMs: number
    }
  | { ok: false; error: string }

export type Dict = Record<string, unknown>

export function asDict(value: unknown): Dict {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Dict)
    : {}
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : value === undefined ? "" : String(value)
}

/** Every `${VAR}` referenced anywhere in a value (same contract as resolveEnv). */
export function envRefs(value: unknown): string[] {
  const out = new Set<string>()
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      for (const m of v.matchAll(/\$\{([A-Z0-9_]+)\}/gi)) out.add(m[1])
    } else if (Array.isArray(v)) {
      v.forEach(walk)
    } else if (v !== null && typeof v === "object") {
      Object.values(v).forEach(walk)
    }
  }
  walk(value)
  return [...out]
}

/** A schema field's display type: plain string, or an object with `derived`. */
export function fieldType(value: unknown): { type: string; derived?: string } {
  if (typeof value === "string") return { type: value }
  const dict = asDict(value)
  if (typeof dict.derived === "string") {
    return { type: "derived", derived: dict.derived }
  }
  return { type: JSON.stringify(value) }
}

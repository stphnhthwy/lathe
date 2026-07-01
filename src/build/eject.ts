import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { loadManifest, type ManifestIssue } from "../manifest/load.js";
import { mainJs, manifestJs, packageJson, readmeMd } from "./emit.js";
import { copyVendoredServer } from "./vendor.js";

export interface EjectOptions {
  /** Path to the capability manifest. Defaults to `./capability.yaml`. */
  manifestPath?: string;
  /**
   * Output directory. Defaults to `./<capability>/` in cwd (using the
   * manifest's `capability:` field, same convention as `lathe init`).
   */
  out?: string;
  /** cwd override, used by tests. */
  cwd?: string;
}

export type EjectResult =
  | { ok: true; dir: string; files: string[]; warnings: string[] }
  | { ok: false; error: string; issues?: ManifestIssue[] };

const DEFAULT_MANIFEST = "capability.yaml";

/**
 * Emit a standalone `mcp-server/` package that runs a specific capability
 * without `@lathe/cli`. Slice 1 shape:
 *
 *   <out>/mcp-server/
 *     package.json                (@modelcontextprotocol/sdk + zod only)
 *     dist/main.js                buildServer + stdio
 *     dist/manifest.js            manifest as a JS literal
 *     dist/server/                vendored 1:1 from lathe's dist/server/
 *
 * The manifest is parsed and validated first — an invalid manifest fails the
 * eject with the same issue list `check` and `serve` present. Refuses to
 * overwrite an existing `<out>/mcp-server/` so re-running is safe.
 */
export function ejectCapability(opts: EjectOptions = {}): EjectResult {
  const cwd = opts.cwd ?? process.cwd();
  const manifestPath = resolve(cwd, opts.manifestPath ?? DEFAULT_MANIFEST);

  const loaded = loadManifest(manifestPath);
  if (!loaded.ok) {
    return {
      ok: false,
      error: `manifest at ${manifestPath} is invalid`,
      issues: loaded.issues,
    };
  }
  const { manifest } = loaded;

  const outDir = resolve(cwd, opts.out ?? manifest.capability);
  const mcpServerDir = resolve(outDir, "mcp-server");

  if (existsSync(mcpServerDir)) {
    return { ok: false, error: `refusing to overwrite existing mcp-server at ${mcpServerDir}` };
  }

  try {
    const distDir = resolve(mcpServerDir, "dist");
    mkdirSync(distDir, { recursive: true });

    const files: Array<[string, string]> = [
      [resolve(mcpServerDir, "package.json"), packageJson(manifest)],
      [resolve(mcpServerDir, "README.md"), readmeMd(manifest)],
      [resolve(distDir, "main.js"), mainJs()],
      [resolve(distDir, "manifest.js"), manifestJs(manifest)],
    ];

    for (const [path, contents] of files) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents, "utf8");
    }

    const vendored = copyVendoredServer(mcpServerDir);

    const manifestDir = dirname(manifestPath);
    const written: string[] = [...files.map(([path]) => path), ...vendored];
    const warnings: string[] = [];

    const skillSource = resolve(manifestDir, manifest.skill ?? "SKILL.md");
    const skillDest = resolve(outDir, "SKILL.md");
    if (existsSync(skillSource)) {
      cpSync(skillSource, skillDest);
      written.push(skillDest);
    } else {
      warnings.push(`skill file not found at ${skillSource}; skipped`);
    }

    for (const ref of manifest.references ?? []) {
      const refSource = resolve(manifestDir, ref);
      if (!existsSync(refSource)) {
        warnings.push(`reference not found at ${refSource}; skipped`);
        continue;
      }
      const refDest = resolve(outDir, "references", basename(ref));
      mkdirSync(dirname(refDest), { recursive: true });
      cpSync(refSource, refDest, { recursive: true });
      written.push(refDest);
    }

    return { ok: true, dir: outDir, files: written, warnings };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `failed to eject capability: ${message}` };
  }
}

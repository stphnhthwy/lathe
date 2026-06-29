import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  capabilityYaml,
  envExample,
  referencesReadme,
  skillMd,
} from "./templates.js";

export interface InitOptions {
  /** Capability id; also the name of the new subdirectory created under `cwd`. */
  name: string;
  /** Directory to scaffold into. Defaults to `process.cwd()`. */
  cwd?: string;
}

export type InitResult =
  | { ok: true; dir: string; files: string[] }
  | { ok: false; error: string };

/** A capability id / safe folder name: lowercase, kebab-case, starts with a letter. */
const NAME_PATTERN = /^[a-z][a-z0-9-]*$/;

/**
 * Scaffold a new capability into `./<name>/`: a guided `capability.yaml` (valid
 * as-is — it passes `lathe check`), a companion `SKILL.md`, an `.env.example`,
 * and a `references/` directory with a README.
 *
 * Refuses to clobber an existing capability (a `capability.yaml` already in the
 * target dir). All filesystem errors are caught and returned as `{ ok: false }`
 * rather than thrown, so the command layer can print a clean message.
 */
export function initCapability(opts: InitOptions): InitResult {
  const { name } = opts;

  if (!NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error: `invalid name "${name}" — use kebab-case (lowercase letters, digits, and hyphens; must start with a letter)`,
    };
  }

  const dir = resolve(opts.cwd ?? process.cwd(), name);

  if (existsSync(resolve(dir, "capability.yaml"))) {
    return { ok: false, error: `refusing to overwrite existing capability at ${dir}` };
  }

  try {
    mkdirSync(dir, { recursive: true });
    mkdirSync(resolve(dir, "references"), { recursive: true });

    const files: Array<[string, string]> = [
      [resolve(dir, "capability.yaml"), capabilityYaml(name)],
      [resolve(dir, "SKILL.md"), skillMd(name)],
      [resolve(dir, ".env.example"), envExample()],
      [resolve(dir, "references", "README.md"), referencesReadme()],
    ];

    for (const [path, contents] of files) {
      writeFileSync(path, contents, "utf8");
    }

    return { ok: true, dir, files: files.map(([path]) => path) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `failed to scaffold capability: ${message}` };
  }
}

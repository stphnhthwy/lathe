import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join, parse } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Files vendored into the ejected `mcp-server/dist/server/`. These are the
 * six `.js` modules `buildServer` needs at runtime. Type-only imports in
 * `src/server/build.ts` (`import type { Manifest }`) are erased by `tsc`, so
 * the built files have zero cross-directory imports — a 1:1 copy is enough.
 */
const VENDORED_FILES = [
  "build.js",
  "http.js",
  "pipeline.js",
  "formula.js",
  "schema-to-zod.js",
  "tools.js",
] as const;

/**
 * Resolve lathe's own built `dist/server/` directory. Anchored on the nearest
 * `package.json` (walked up from this file), so the result is always
 * `<lathe-pkg-root>/dist/server/` — the same location whether we're running
 * from `dist/build/vendor.js` in a real install, from `src/build/vendor.ts`
 * under vitest, or from a global install.
 */
function lathServerDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  const { root } = parse(dir);
  while (dir !== root) {
    if (existsSync(join(dir, "package.json"))) return join(dir, "dist", "server");
    dir = dirname(dir);
  }
  throw new Error("cannot locate lathe package root (no package.json found walking up)");
}

/**
 * Copy the six runtime `.js` files from lathe's own `dist/server/` into
 * `<targetMcpServerDir>/dist/server/`. Creates the target directory as needed.
 * Throws with a message that names the missing file if a vendored source
 * doesn't exist (a clear signal that lathe wasn't built).
 */
export function copyVendoredServer(targetMcpServerDir: string): string[] {
  const sourceDir = lathServerDir();
  const available = new Set(readdirSync(sourceDir));

  for (const name of VENDORED_FILES) {
    if (!available.has(name)) {
      throw new Error(
        `cannot vendor ${name}: not found in ${sourceDir}. Run \`npm run build\` on lathe before ejecting.`,
      );
    }
  }

  const outDir = join(targetMcpServerDir, "dist", "server");
  mkdirSync(outDir, { recursive: true });

  const written: string[] = [];
  for (const name of VENDORED_FILES) {
    const dest = join(outDir, name);
    copyFileSync(join(sourceDir, name), dest);
    written.push(dest);
  }
  return written;
}

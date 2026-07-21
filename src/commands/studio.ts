import { resolve } from "node:path";
import { spawn } from "node:child_process";
import type { Command } from "commander";
import { startStudio } from "../studio/server.js";

/**
 * `lathe studio [dir]` — open a local web UI over one capability directory
 * (Prisma-Studio-style). The studio edits the declaration; it never executes
 * the manifest. Loopback only; diagnostics to stderr.
 */
export function registerStudio(program: Command): void {
  program
    .command("studio")
    .description("Open a local web UI over a capability directory")
    .argument("[dir]", "capability directory (contains capability.yaml)", ".")
    .option("-p, --port <port>", "port to listen on (default 4989)")
    .option("--no-open", "do not open the browser")
    .action(async (dir: string, opts: { port?: string; open: boolean }) => {
      const fullDir = resolve(process.cwd(), dir);
      const port = opts.port === undefined ? undefined : Number(opts.port);
      if (port !== undefined && (!Number.isInteger(port) || port < 0 || port > 65535)) {
        console.error(`✗ invalid port: ${opts.port}`);
        process.exitCode = 1;
        return;
      }

      const handle = await startStudio({ dir: fullDir, port });
      console.error(`lathe studio — ${fullDir}`);
      console.error(`  ${handle.url}`);

      if (opts.open) openBrowser(handle.url);
    });
}

/** Best-effort platform browser open; failure is silent (the URL is printed). */
function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(cmd, args as string[], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

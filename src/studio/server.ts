import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { readManifestState } from "./api.js";

/**
 * The studio server: a tiny `node:http` server (no framework — same litmus as
 * the M6 ejected HTTP entrypoint) that serves the built studio UI plus a small
 * JSON API over one capability directory. Binds loopback only — the studio is
 * a local dev tool, never a hosted service.
 */

export interface StudioOptions {
  /** Capability directory (contains `capability.yaml`). */
  dir: string;
  /** Listen port; 0 picks a free port. Default 4989. */
  port?: number;
  /** Static UI bundle dir; defaults to the packaged `dist/studio/ui`. */
  staticDir?: string;
}

export interface StudioHandle {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

const MANIFEST_FILE = "capability.yaml";
const DEFAULT_PORT = 4989;

/** The built UI ships beside this module: `dist/studio/server.js` → `dist/studio/ui/`. */
function defaultStaticDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "ui");
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function handleApi(req: IncomingMessage, res: ServerResponse, pathname: string, dir: string): void {
  if (req.method === "GET" && pathname === "/api/manifest") {
    sendJson(res, 200, readManifestState(join(dir, MANIFEST_FILE)));
    return;
  }
  sendJson(res, 404, { error: `no such API route: ${req.method} ${pathname}` });
}

function serveStatic(res: ServerResponse, staticDir: string, pathname: string): void {
  if (!existsSync(join(staticDir, "index.html"))) {
    res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(
      "studio UI not built — run `npm run build:studio` (repo) or reinstall @lathe/cli (package)\n",
    );
    return;
  }

  // Resolve inside staticDir only; anything that escapes falls back to the SPA
  // index rather than the filesystem.
  const root = resolve(staticDir);
  const requested = resolve(root, `.${pathname}`);
  const inside = requested === root || requested.startsWith(root + sep);
  const isFile = inside && existsSync(requested) && statSync(requested).isFile();
  const filePath = isFile ? requested : join(root, "index.html");

  const type = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
  res.writeHead(200, { "Content-Type": type });
  res.end(readFileSync(filePath));
}

/** Start the studio server on loopback and resolve once it is listening. */
export function startStudio(options: StudioOptions): Promise<StudioHandle> {
  const { dir } = options;
  const staticDir = options.staticDir ?? defaultStaticDir();

  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    try {
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        handleApi(req, res, pathname, dir);
      } else {
        serveStatic(res, staticDir, pathname);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendJson(res, 500, { error: message });
    }
  });

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? DEFAULT_PORT, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolvePromise({
        server,
        port,
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((err) => (err ? fail(err) : done())),
          ),
      });
    });
  });
}

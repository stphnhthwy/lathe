import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { envStatus, parseWriteBody, readManifestState, sourceCheck, writeManifest } from "./api.js";

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
  /** Environment for env-status/source-check (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Fetch implementation for source-check (defaults to global `fetch`). */
  fetchImpl?: typeof fetch;
}

export interface StudioHandle {
  server: Server;
  port: number;
  url: string;
  close(): Promise<void>;
}

const MANIFEST_FILE = "capability.yaml";
const DEFAULT_PORT = 4989;

/**
 * The built UI ships beside the BUILT module: `dist/studio/server.js` →
 * `dist/studio/ui/`. In the dev loop this module runs from `src/studio/`
 * (tsx), where no `ui/` exists — fall back to the repo's `dist/studio/ui`
 * so `npx tsx src/cli.ts studio` serves the last `build:studio` output.
 */
function defaultStaticDir(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, "ui"),
    join(moduleDir, "..", "..", "dist", "studio", "ui"),
  ];
  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? candidates[0];
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

/** Read and parse a JSON request body; null (plus a 400 already sent) on failure. */
async function readJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 1024 * 1024) {
      sendJson(res, 400, { error: "request body too large" });
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    sendJson(res, 400, { error: "request body is not valid JSON" });
    return null;
  }
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  options: StudioOptions,
): Promise<void> {
  const manifestPath = join(options.dir, MANIFEST_FILE);

  if (req.method === "GET" && pathname === "/api/manifest") {
    sendJson(res, 200, readManifestState(manifestPath));
    return;
  }

  if (req.method === "PUT" && pathname === "/api/manifest") {
    const body = await readJsonBody(req, res);
    if (body === null) return;
    const parsed = parseWriteBody(body);
    if (parsed === null) {
      sendJson(res, 400, { error: "body must be { edits: [{ op, path, value? }...], baseMtimeMs }" });
      return;
    }
    const result = writeManifest(manifestPath, parsed.edits, parsed.baseMtimeMs);
    sendJson(res, result.status, result.ok ? result.state : { error: result.error });
    return;
  }

  if (req.method === "GET" && pathname === "/api/env-status") {
    sendJson(res, 200, envStatus(manifestPath, options.env));
    return;
  }

  if (req.method === "POST" && pathname === "/api/source-check") {
    const body = await readJsonBody(req, res);
    if (body === null) return;
    const { source, path, method } = (body ?? {}) as {
      source?: unknown;
      path?: unknown;
      method?: unknown;
    };
    if (typeof source !== "string" || (path !== undefined && typeof path !== "string")) {
      sendJson(res, 400, { error: "body must be { source, path? }" });
      return;
    }
    if (method !== undefined && method !== "GET") {
      sendJson(res, 400, { error: "connection checks are read-only — only GET is allowed" });
      return;
    }
    sendJson(
      res,
      200,
      await sourceCheck({
        manifestPath,
        source,
        path,
        env: options.env,
        fetchImpl: options.fetchImpl,
      }),
    );
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
  const staticDir = options.staticDir ?? defaultStaticDir();

  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const fail = (err: unknown): void => {
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) sendJson(res, 500, { error: message });
      else res.end();
    };
    try {
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        handleApi(req, res, pathname, options).catch(fail);
      } else {
        serveStatic(res, staticDir, pathname);
      }
    } catch (err) {
      fail(err);
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

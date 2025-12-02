import { join, extname } from "path";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function handleStaticRequest(
  req: Request,
  isDev: boolean
): Promise<Response> {
  const url = new URL(req.url);
  let pathname = url.pathname;

  if (isDev) {
    return proxyToVite(req);
  }

  const distDir = join(import.meta.dir, "../../../dist/client");

  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = join(distDir, pathname);

  const file = Bun.file(filePath);
  const exists = await file.exists();

  if (!exists) {
    const indexFile = Bun.file(join(distDir, "index.html"));
    const indexExists = await indexFile.exists();

    if (indexExists) {
      return new Response(indexFile, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  }

  return new Response(file, {
    headers: { "Content-Type": getMimeType(filePath) },
  });
}

async function proxyToVite(req: Request): Promise<Response> {
  const viteUrl = new URL(req.url);
  viteUrl.port = "5173";

  try {
    const viteReq = new Request(viteUrl.toString(), {
      method: req.method,
      headers: req.headers,
      body: req.body,
    });
    return await fetch(viteReq);
  } catch {
    return new Response("Vite dev server not available", { status: 502 });
  }
}

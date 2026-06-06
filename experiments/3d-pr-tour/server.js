import { file } from "bun";
import { join, extname } from "node:path";

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT ?? 5180);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = decodeURIComponent(url.pathname);
    if (path === "/") path = "/index.html";
    const full = join(ROOT, path);
    const f = file(full);
    if (!(await f.exists())) {
      return new Response("Not found", { status: 404 });
    }
    const type = MIME[extname(full)] ?? "application/octet-stream";
    return new Response(f, {
      headers: { "content-type": type, "cache-control": "no-store" },
    });
  },
});

console.log(`3d-pr-tour serving on http://localhost:${PORT}`);

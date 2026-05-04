import { extname, join, resolve } from "node:path";

const HTML_CACHE_CONTROL = "no-store, no-cache, must-revalidate";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

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

function isAssetPath(pathname: string): boolean {
	return pathname === "/assets" || pathname.startsWith("/assets/");
}

function hasFileExtension(pathname: string): boolean {
	return extname(pathname) !== "";
}

function acceptsHtml(req: Request): boolean {
	const accept = req.headers.get("Accept");
	return accept?.toLowerCase().includes("text/html") ?? false;
}

function shouldServeSpaFallback(req: Request, pathname: string): boolean {
	return (
		req.method === "GET" &&
		acceptsHtml(req) &&
		!isAssetPath(pathname) &&
		!hasFileExtension(pathname)
	);
}

function cacheControlForPath(pathname: string, filePath: string): string {
	if (extname(filePath).toLowerCase() === ".html") {
		return HTML_CACHE_CONTROL;
	}

	if (isAssetPath(pathname)) {
		return IMMUTABLE_CACHE_CONTROL;
	}

	return "no-cache";
}

export async function handleStaticRequest(
	req: Request,
	isDev: boolean,
	webUIDir?: string,
): Promise<Response> {
	const url = new URL(req.url);
	let pathname = url.pathname;

	if (isDev) {
		return proxyToVite(req);
	}

	// Use provided webUIDir (e.g., from extracted bundled assets) or default to local dist
	const distDir = webUIDir
		? join(webUIDir, "client")
		: join(import.meta.dir, "../../../dist/client");

	if (pathname === "/") {
		pathname = "/index.html";
	}

	// Canonicalize paths to prevent directory traversal attacks
	const resolvedDist = resolve(distDir);
	const filePath = resolve(distDir, pathname.slice(1)); // slice(1) removes leading /

	// Security: Ensure resolved path is within distDir
	if (!filePath.startsWith(`${resolvedDist}/`) && filePath !== resolvedDist) {
		return new Response("Forbidden", { status: 403 });
	}

	const file = Bun.file(filePath);
	const exists = await file.exists();

	if (!exists) {
		const indexFile = Bun.file(join(distDir, "index.html"));
		const indexExists = await indexFile.exists();

		if (indexExists && shouldServeSpaFallback(req, pathname)) {
			return new Response(indexFile.stream(), {
				headers: {
					"Cache-Control": HTML_CACHE_CONTROL,
					"Content-Type": "text/html; charset=utf-8",
				},
			});
		}

		return new Response("Not found", {
			status: 404,
			headers: { "Content-Type": "text/plain; charset=utf-8" },
		});
	}

	return new Response(file.stream(), {
		headers: {
			"Cache-Control": cacheControlForPath(pathname, filePath),
			"Content-Type": getMimeType(filePath),
		},
	});
}

async function proxyToVite(req: Request): Promise<Response> {
	const viteUrl = new URL(req.url);
	viteUrl.port = "6810";

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

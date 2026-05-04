import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleStaticRequest } from "../../server/routes/static";

const HTML_CACHE_CONTROL = "no-store, no-cache, must-revalidate";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function request(pathname: string, headers?: HeadersInit): Request {
	return new Request(`http://localhost${pathname}`, {
		headers,
	});
}

describe("handleStaticRequest", () => {
	let webUIDir: string;

	beforeAll(async () => {
		webUIDir = await mkdtemp(join(tmpdir(), "rp1-static-routes-"));
		const clientDir = join(webUIDir, "client");
		await mkdir(join(clientDir, "assets"), { recursive: true });
		await Bun.write(
			join(clientDir, "index.html"),
			'<!doctype html><div id="root">Arcade</div>',
		);
		await Bun.write(
			join(clientDir, "assets", "app-a1b2c3.js"),
			"console.log('arcade');",
		);
	});

	afterAll(async () => {
		await rm(webUIDir, { recursive: true, force: true });
	});

	test("returns 404 for missing JavaScript assets instead of the HTML shell", async () => {
		const response = await handleStaticRequest(
			request("/assets/missing.js", { Accept: "*/*" }),
			false,
			webUIDir,
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not found");
		expect(response.headers.get("Content-Type")?.toLowerCase()).toBe(
			"text/plain; charset=utf-8",
		);
	});

	test("falls back to index.html for HTML navigation routes", async () => {
		const response = await handleStaticRequest(
			request("/runs/run-1", { Accept: "text/html,application/xhtml+xml" }),
			false,
			webUIDir,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("Cache-Control")).toBe(HTML_CACHE_CONTROL);
		expect(await response.text()).toContain("Arcade");
	});

	test("returns 404 for missing extension-bearing paths outside assets", async () => {
		const response = await handleStaticRequest(
			request("/workspace/main.js", { Accept: "text/html" }),
			false,
			webUIDir,
		);

		expect(response.status).toBe(404);
		expect(await response.text()).toBe("Not found");
	});

	test("serves existing JavaScript assets with MIME and immutable cache headers", async () => {
		const response = await handleStaticRequest(
			request("/assets/app-a1b2c3.js", { Accept: "*/*" }),
			false,
			webUIDir,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"application/javascript; charset=utf-8",
		);
		expect(response.headers.get("Cache-Control")).toBe(IMMUTABLE_CACHE_CONTROL);
		expect(await response.text()).toBe("console.log('arcade');");
	});

	test("serves index.html with no-store cache headers", async () => {
		const response = await handleStaticRequest(
			request("/", { Accept: "text/html" }),
			false,
			webUIDir,
		);

		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Type")).toBe(
			"text/html; charset=utf-8",
		);
		expect(response.headers.get("Cache-Control")).toBe(HTML_CACHE_CONTROL);
		expect(await response.text()).toContain("Arcade");
	});
});

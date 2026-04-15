/**
 * Unit tests for the web_access semantic tag.
 * Tests output correctness for all three platforms and graceful degradation.
 */

import { describe, expect, test } from "bun:test";
import { Liquid } from "liquidjs";
import { registerTags } from "../../../build/tags/index.js";

function createLiquid(): Liquid {
	const liquid = new Liquid({
		strictVariables: false,
		strictFilters: false,
	});
	registerTags(liquid);
	return liquid;
}

async function render(template: string, platform: string): Promise<string> {
	const liquid = createLiquid();
	return (await liquid.parseAndRender(template, { platform })).trim();
}

describe("web_access tag", () => {
	describe("search capability", () => {
		const template =
			'{% web_access "search", "Look up the latest documentation" %}';

		test("CC: renders WebSearch", async () => {
			const output = await render(template, "claude-code");
			expect(output).toBe("WebSearch: Look up the latest documentation");
		});

		test("OpenCode: renders web_search", async () => {
			const output = await render(template, "opencode");
			expect(output).toBe("web_search: Look up the latest documentation");
		});

		test("Codex: renders web_search without degradation note", async () => {
			const output = await render(template, "codex");
			expect(output).toBe("web_search: Look up the latest documentation");
			expect(output).not.toContain("not available");
		});
	});

	describe("fetch capability", () => {
		const template = '{% web_access "fetch", "Download the API response" %}';

		test("CC: renders WebFetch", async () => {
			const output = await render(template, "claude-code");
			expect(output).toBe("WebFetch: Download the API response");
		});

		test("OpenCode: renders web_fetch", async () => {
			const output = await render(template, "opencode");
			expect(output).toBe("web_fetch: Download the API response");
		});

		test("Codex: renders web_search with degradation note", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("web_search: Download the API response");
			expect(output).toContain("WebFetch is not available on Codex");
		});
	});

	describe("both capability", () => {
		const template = '{% web_access "both", "Search and fetch resources" %}';

		test("CC: renders both WebFetch and WebSearch", async () => {
			const output = await render(template, "claude-code");
			expect(output).toContain("WebFetch: Search and fetch resources");
			expect(output).toContain("WebSearch: Search and fetch resources");
		});

		test("OpenCode: renders both web_fetch and web_search", async () => {
			const output = await render(template, "opencode");
			expect(output).toContain("web_fetch: Search and fetch resources");
			expect(output).toContain("web_search: Search and fetch resources");
		});

		test("Codex: renders web_search with degradation note for fetch", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("web_search: Search and fetch resources");
			expect(output).toContain("WebFetch is not available on Codex");
			expect(output).toContain("Only web_search is supported");
		});
	});

	describe("copilot: search capability (degradation)", () => {
		const template =
			'{% web_access "search", "Look up the latest documentation" %}';

		test("renders fetch_url with degradation note for search", async () => {
			const output = await render(template, "copilot");
			expect(output).toContain("fetch_url: Look up the latest documentation");
			expect(output).toContain("Web search is not available on Copilot CLI");
		});
	});

	describe("copilot: fetch capability", () => {
		const template = '{% web_access "fetch", "Download the API response" %}';

		test("renders fetch_url without degradation note", async () => {
			const output = await render(template, "copilot");
			expect(output).toBe("fetch_url: Download the API response");
			expect(output).not.toContain("not available");
		});
	});

	describe("copilot: both capability", () => {
		const template = '{% web_access "both", "Search and fetch resources" %}';

		test("renders fetch_url with degradation note for search", async () => {
			const output = await render(template, "copilot");
			expect(output).toContain("fetch_url: Search and fetch resources");
			expect(output).toContain("Web search is not available on Copilot CLI");
			expect(output).toContain("Only fetch_url is supported");
		});
	});

	describe("invalid capability fallback", () => {
		test("falls back to search for unknown capability", async () => {
			const template = '{% web_access "invalid", "Do something" %}';
			const output = await render(template, "claude-code");
			expect(output).toBe("WebSearch: Do something");
		});
	});
});

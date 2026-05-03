import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const webUiRoot = resolve(import.meta.dir, "../../..");

function readWebUiFile(path: string) {
	return readFileSync(resolve(webUiRoot, path), "utf8");
}

describe("web UI brand assets", () => {
	test("uses a checked-in RP1 favicon instead of an emoji data URI", () => {
		const html = readWebUiFile("index.html");
		const favicon = readWebUiFile("public/favicon.svg");

		expect(html).toContain('<link rel="icon" href="/favicon.svg" />');
		expect(html).not.toContain("data:image/svg+xml");
		expect(html).not.toContain("🕹️");
		expect(favicon).toContain('viewBox="0 -46.087715 165.30204 165.30204"');
		expect(favicon).toContain("prefers-color-scheme: dark");
		expect(favicon).toContain("#f6f4ef");
		expect(favicon).toContain("#23d188");
	});

	test("publishes current brand assets consumed by Arcade components", () => {
		for (const asset of [
			"public/rp1-mark-only-dark.svg",
			"public/rp1-mark-only-light.svg",
			"public/rp1-empty-state-dark.svg",
			"public/rp1-empty-state-light.svg",
		]) {
			expect(existsSync(resolve(webUiRoot, asset))).toBe(true);
		}
	});
});

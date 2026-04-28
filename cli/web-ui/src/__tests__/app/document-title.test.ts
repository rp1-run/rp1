import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("document title", () => {
	test("omits the icon already supplied by the favicon", () => {
		const html = readFileSync(
			resolve(import.meta.dir, "../../../index.html"),
			"utf8",
		);

		expect(html).toContain("<title>rp1 Arcade</title>");
		expect(html).not.toContain("<title>🕹️ rp1 Arcade</title>");
	});
});

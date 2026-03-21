import { describe, expect, test } from "bun:test";
import { restoreFrontmatter, stripFrontmatter } from "../../lib/frontmatter";

describe("stripFrontmatter", () => {
	test("strips valid frontmatter and returns both parts", () => {
		const md = "---\nrp1_doc_id: abc-123\n---\n# Hello\n\nBody text\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe("---\nrp1_doc_id: abc-123\n---\n");
		expect(body).toBe("# Hello\n\nBody text\n");
	});

	test("returns full content as body when no frontmatter", () => {
		const md = "# No frontmatter\n\nJust content\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe("");
		expect(body).toBe(md);
	});

	test("handles multi-line frontmatter with multiple keys", () => {
		const md =
			"---\nrp1_doc_id: abc\ntitle: My Doc\nstatus: draft\n---\n# Title\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe(
			"---\nrp1_doc_id: abc\ntitle: My Doc\nstatus: draft\n---\n",
		);
		expect(body).toBe("# Title\n");
	});

	test("does not treat --- in body as frontmatter", () => {
		const md = "# Title\n\nSome text\n\n---\n\nMore text\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe("");
		expect(body).toBe(md);
	});

	test("handles Windows-style line endings (CRLF)", () => {
		const md = "---\r\nrp1_doc_id: abc\r\n---\r\n# Title\r\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe("---\r\nrp1_doc_id: abc\r\n---\r\n");
		expect(body).toBe("# Title\r\n");
	});

	test("handles empty body after frontmatter", () => {
		const md = "---\nid: x\n---\n";
		const { body, frontmatter } = stripFrontmatter(md);
		expect(frontmatter).toBe("---\nid: x\n---\n");
		expect(body).toBe("");
	});

	test("handles empty string", () => {
		const { body, frontmatter } = stripFrontmatter("");
		expect(frontmatter).toBe("");
		expect(body).toBe("");
	});
});

describe("restoreFrontmatter", () => {
	test("prepends frontmatter to body", () => {
		const result = restoreFrontmatter(
			"---\nid: abc\n---\n",
			"# Hello\n\nBody\n",
		);
		expect(result).toBe("---\nid: abc\n---\n# Hello\n\nBody\n");
	});

	test("returns body unchanged when frontmatter is empty", () => {
		const body = "# No frontmatter\n";
		expect(restoreFrontmatter("", body)).toBe(body);
	});
});

describe("round-trip", () => {
	test("strip then restore preserves original content exactly", () => {
		const original =
			"---\nrp1_doc_id: 5cc7a6a0-8b75-4e21-8dbb-79c56674aa3e\n---\n# Requirements\n\nSome content\n";
		const { body, frontmatter } = stripFrontmatter(original);
		const restored = restoreFrontmatter(frontmatter, body);
		expect(restored).toBe(original);
	});

	test("round-trip with no frontmatter preserves content", () => {
		const original = "# Just markdown\n\nNo frontmatter here\n";
		const { body, frontmatter } = stripFrontmatter(original);
		const restored = restoreFrontmatter(frontmatter, body);
		expect(restored).toBe(original);
	});

	test("round-trip with CRLF preserves content", () => {
		const original = "---\r\nkey: value\r\n---\r\n# Doc\r\n";
		const { body, frontmatter } = stripFrontmatter(original);
		const restored = restoreFrontmatter(frontmatter, body);
		expect(restored).toBe(original);
	});
});

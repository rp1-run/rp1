import { describe, expect, test } from "bun:test";
import {
	restoreMarkdownHtmlComments,
	stripMarkdownHtmlComments,
} from "../../lib/markdown-comments";

describe("markdown html comments", () => {
	test("strips comments from display body and restores raw content", () => {
		const original = "# Title\n\n<!-- hidden metadata -->\n\nVisible\n";

		const { body, comments } = stripMarkdownHtmlComments(original);

		expect(body).toBe("# Title\n\n\n\nVisible\n");
		expect(body).not.toContain("hidden metadata");
		expect(comments).toHaveLength(1);
		expect(restoreMarkdownHtmlComments(comments, body)).toBe(original);
	});

	test("restores hidden comments into edited display body", () => {
		const original = "# Title\n\n<!-- hidden metadata -->\n\nVisible\n";
		const { body, comments } = stripMarkdownHtmlComments(original);
		const editedBody = body.replace("Visible", "Edited");

		const restored = restoreMarkdownHtmlComments(comments, editedBody);

		expect(restored).toContain("<!-- hidden metadata -->");
		expect(restored).toContain("Edited");
		expect(restored).not.toContain("Visible");
	});

	test("keeps comments inside fenced code blocks visible as code", () => {
		const markdown = [
			"# Title",
			"",
			"```html",
			"<!-- code sample -->",
			"```",
			"",
			"<!-- hidden metadata -->",
		].join("\n");

		const { body, comments } = stripMarkdownHtmlComments(markdown);

		expect(body).toContain("<!-- code sample -->");
		expect(body).not.toContain("hidden metadata");
		expect(comments).toHaveLength(1);
	});
});

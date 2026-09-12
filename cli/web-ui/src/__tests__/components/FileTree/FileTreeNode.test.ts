import { describe, expect, test } from "bun:test";
import { getCopyableFilePath } from "../../../components/FileTree/FileTreeNode";

describe("getCopyableFilePath", () => {
	test("prefers the server-resolved absolute path when the tree provides one", () => {
		expect(
			getCopyableFilePath(
				"/Users/prem/Development/buzz",
				".rp1/work/notes/stack.md",
				"/Users/prem/.rp1/projects/8f20b5a0/work/notes/stack.md",
			),
		).toBe("/Users/prem/.rp1/projects/8f20b5a0/work/notes/stack.md");
	});

	test("joins project root with canonical rp1 file paths without duplicating .rp1", () => {
		expect(
			getCopyableFilePath(
				"/Users/prem/Development/1up",
				".rp1/work/research/2026-04-13-impact-horizon-for-1up.md",
			),
		).toBe(
			"/Users/prem/Development/1up/.rp1/work/research/2026-04-13-impact-horizon-for-1up.md",
		);
	});

	test("normalizes windows separators when copying file paths", () => {
		expect(
			getCopyableFilePath(
				"C:\\Users\\prem\\Development\\1up",
				".rp1/work/research/impact.md",
			),
		).toBe(
			"C:\\Users\\prem\\Development\\1up\\.rp1\\work\\research\\impact.md",
		);
	});

	test("returns the file path unchanged when project root is unavailable", () => {
		expect(getCopyableFilePath(undefined, ".rp1/work/research/impact.md")).toBe(
			".rp1/work/research/impact.md",
		);
	});
});

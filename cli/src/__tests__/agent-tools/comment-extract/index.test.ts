import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { executeExtract } from "../../../agent-tools/comment-extract/index.js";
import {
	cleanupTempDir,
	createTempDir,
	expectLeft,
	expectRight,
	getErrorMessage,
	writeFixture,
} from "../../helpers/index.js";

describe("comment-extract manifest extraction", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await createTempDir("comment-extract-manifest-test");
	});

	afterAll(async () => {
		await cleanupTempDir(tempDir);
	});

	test("extracts only comments inside manifest-owned lines and hunks", async () => {
		await writeFixture(
			tempDir,
			"owned.ts",
			`// outside
const a = 1;
// owned line
const b = 2;
// owned hunk
const c = 3;
`,
		);
		const manifestPath = await writeFixture(
			tempDir,
			"change-manifest-001.json",
			JSON.stringify({
				version: 1,
				files: [
					{
						path: "owned.ts",
						ownedLines: [3],
						ownedHunks: [{ startLine: 5, endLine: 6 }],
						allowedOperations: ["remove_comments"],
					},
				],
			}),
		);

		const result = await executeExtract(
			{
				scope: "manifest",
				base: "manifest",
				changeManifest: manifestPath,
				codeRoot: tempDir,
			},
			tempDir,
		)();
		const output = expectRight(result);

		expect(output.data.scope).toBe("manifest");
		expect(output.data.filesScanned).toBe(1);
		expect(output.data.linesAdded).toBe(3);
		expect(output.data.comments.map((comment) => comment.line)).toEqual([3, 5]);
	});

	test("rejects manifest files outside CODE_ROOT", async () => {
		const manifestPath = await writeFixture(
			tempDir,
			"bad-manifest.json",
			JSON.stringify({
				version: 1,
				files: [
					{
						path: path.join(path.dirname(tempDir), "escape.ts"),
						ownedLines: [1],
					},
				],
			}),
		);

		const result = await executeExtract(
			{
				scope: "manifest",
				base: "manifest",
				changeManifest: manifestPath,
				codeRoot: tempDir,
			},
			tempDir,
		)();
		const error = expectLeft(result);

		expect(getErrorMessage(error)).toContain("outside CODE_ROOT");
	});
});

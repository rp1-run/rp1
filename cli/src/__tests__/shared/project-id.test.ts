import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureProjectId, readProjectId } from "../../../shared/project-id.js";

describe("project-id", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `rp1-project-id-test-${Date.now()}`);
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("readProjectId", () => {
		test("returns UUID when project_id file exists", () => {
			const uuid = "550e8400-e29b-41d4-a716-446655440000";
			writeFileSync(join(tempDir, ".rp1", "project_id"), uuid);

			const result = readProjectId(tempDir);
			expect(result).toBe(uuid);
		});

		test("returns undefined when project_id file is missing", () => {
			const result = readProjectId(tempDir);
			expect(result).toBeUndefined();
		});

		test("returns undefined when project_id file is empty", () => {
			writeFileSync(join(tempDir, ".rp1", "project_id"), "");

			const result = readProjectId(tempDir);
			expect(result).toBeUndefined();
		});

		test("trims whitespace from project_id file", () => {
			const uuid = "550e8400-e29b-41d4-a716-446655440000";
			writeFileSync(join(tempDir, ".rp1", "project_id"), `  ${uuid}  \n`);

			const result = readProjectId(tempDir);
			expect(result).toBe(uuid);
		});
	});

	describe("ensureProjectId", () => {
		test("creates project_id file when missing", async () => {
			const result = await ensureProjectId(tempDir);

			expect(result).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			expect(existsSync(join(tempDir, ".rp1", "project_id"))).toBe(true);

			const fileContent = readFileSync(
				join(tempDir, ".rp1", "project_id"),
				"utf-8",
			);
			expect(fileContent).toBe(result);
		});

		test("is idempotent -- returns same UUID on subsequent calls", async () => {
			const first = await ensureProjectId(tempDir);
			const second = await ensureProjectId(tempDir);

			expect(second).toBe(first);
		});

		test("creates .rp1 directory if missing", async () => {
			const bareDir = join(tmpdir(), `rp1-bare-${Date.now()}`);
			try {
				await mkdir(bareDir, { recursive: true });

				const result = await ensureProjectId(bareDir);

				expect(result).toMatch(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
				);
				expect(existsSync(join(bareDir, ".rp1", "project_id"))).toBe(true);
			} finally {
				await rm(bareDir, { recursive: true, force: true });
			}
		});

		test("preserves existing project_id without modifying the file", async () => {
			const existingId = "existing-uuid-1234-5678-abcdef012345";
			writeFileSync(join(tempDir, ".rp1", "project_id"), existingId);

			const result = await ensureProjectId(tempDir);
			expect(result).toBe(existingId);
		});
	});
});

/**
 * Unit tests for install/claudecode/migration.ts - GitHub marketplace migration.
 * Tests the dry-run path and cache directory resolution.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createLogger } from "../../../../shared/logger.js";
import { migrateFromGitHubMarketplace } from "../../../install/claudecode/migration.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

const logger = createLogger({ level: "error", color: false });

describe("migration", () => {
	let tempDir: string;
	let originalHome: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("migration-test");
		originalHome = process.env.HOME;
		process.env.HOME = tempDir;
	});

	afterEach(async () => {
		process.env.HOME = originalHome;
		await cleanupTempDir(tempDir);
	});

	describe("migrateFromGitHubMarketplace", () => {
		test("returns false in dry-run mode without executing commands", async () => {
			const result = await expectTaskRight(
				migrateFromGitHubMarketplace(logger, true, false),
			);

			expect(result).toBe(false);
		});
	});
});

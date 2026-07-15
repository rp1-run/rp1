/**
 * Unit tests for install/claudecode/migration.ts - GitHub marketplace migration.
 * Tests the dry-run path and cache directory resolution.
 */

import { describe, expect, test } from "bun:test";
import { createLogger } from "../../../../shared/logger.js";
import { migrateFromGitHubMarketplace } from "../../../install/claudecode/migration.js";
import { expectTaskRight } from "../../helpers/index.js";

const logger = createLogger({ level: "error", color: false });

describe("migration", () => {
	describe("migrateFromGitHubMarketplace", () => {
		test("returns false in dry-run mode without executing commands", async () => {
			const result = await expectTaskRight(
				migrateFromGitHubMarketplace(logger, true, false),
			);

			expect(result).toBe(false);
		});
	});
});

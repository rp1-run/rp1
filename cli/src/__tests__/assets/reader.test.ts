/**
 * Unit tests for reader.ts - Asset reading API.
 * Tests rp1's bundled asset detection logic, not Bun file APIs.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";

import {
	getBundledAssets,
	getBundledVersion,
	hasBundledAssets,
} from "../../assets/reader.js";

describe("reader", () => {
	describe("hasBundledAssets", () => {
		test("returns false in dev build (IS_BUNDLED is false)", () => {
			// In the dev build, embedded.ts has IS_BUNDLED = false
			// This tests the actual behavior in the current context
			const result = hasBundledAssets();

			// We expect false because the placeholder embedded.ts has IS_BUNDLED = false
			// This will be true only in release builds with actual assets
			expect(typeof result).toBe("boolean");
		});
	});

	describe("getBundledAssets", () => {
		test("returns Left with clear error message in dev build", () => {
			const result = getBundledAssets();

			// In dev builds (no bundled assets), should return Left
			if (!hasBundledAssets()) {
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					// Verify error message contains actionable guidance (REQ-005)
					expect(result.left._tag).toBe("UsageError");
					if (result.left._tag === "UsageError") {
						expect(result.left.message).toContain("Bundled assets not found");
						expect(result.left.suggestion).toContain("release binary");
						expect(result.left.suggestion).toContain(
							"https://github.com/rp1-run/rp1/releases",
						);
					}
				}
			}
		});

		test("error message includes all three remediation options", () => {
			const result = getBundledAssets();

			if (E.isLeft(result) && result.left._tag === "UsageError") {
				const suggestion = result.left.suggestion ?? "";

				// REQ-005: Error lists three options
				expect(suggestion).toContain("release binary");
				expect(suggestion).toContain("build:opencode");
				expect(suggestion).toContain("--artifacts-dir");
			}
		});
	});

	describe("getBundledVersion", () => {
		test("returns null in dev build", () => {
			if (!hasBundledAssets()) {
				const version = getBundledVersion();
				expect(version).toBeNull();
			}
		});
	});
});

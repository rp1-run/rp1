/**
 * Unit tests for the transformNamespace utility.
 * Tests platform-specific namespace format transformations.
 */

import { describe, expect, test } from "bun:test";
import { transformNamespace } from "../../../build/tags/index.js";

describe("transformNamespace", () => {
	describe("claude-code (passthrough)", () => {
		test("returns canonical reference unchanged", () => {
			expect(transformNamespace("rp1-base:agent", "claude-code")).toBe(
				"rp1-base:agent",
			);
		});

		test("preserves dev plugin reference", () => {
			expect(transformNamespace("rp1-dev:build", "claude-code")).toBe(
				"rp1-dev:build",
			);
		});
	});

	describe("opencode (@ prefix with / separator)", () => {
		test("transforms rp1-base:agent to @rp1-base/agent", () => {
			expect(transformNamespace("rp1-base:agent", "opencode")).toBe(
				"@rp1-base/agent",
			);
		});

		test("transforms rp1-dev:build to @rp1-dev/build", () => {
			expect(transformNamespace("rp1-dev:build", "opencode")).toBe(
				"@rp1-dev/build",
			);
		});
	});

	describe("codex (dash separator)", () => {
		test("transforms rp1-base:agent to rp1-base-agent", () => {
			expect(transformNamespace("rp1-base:agent", "codex")).toBe(
				"rp1-base-agent",
			);
		});

		test("transforms rp1-dev:build to rp1-dev-build", () => {
			expect(transformNamespace("rp1-dev:build", "codex")).toBe(
				"rp1-dev-build",
			);
		});
	});

	describe("copilot (/ separator without @ prefix)", () => {
		test("transforms rp1-base:agent to rp1-base/agent", () => {
			expect(transformNamespace("rp1-base:agent", "copilot")).toBe(
				"rp1-base/agent",
			);
		});

		test("transforms rp1-dev:build to rp1-dev/build", () => {
			expect(transformNamespace("rp1-dev:build", "copilot")).toBe(
				"rp1-dev/build",
			);
		});

		test("transforms rp1-utils:tersify-prompt to rp1-utils/tersify-prompt", () => {
			expect(transformNamespace("rp1-utils:tersify-prompt", "copilot")).toBe(
				"rp1-utils/tersify-prompt",
			);
		});
	});

	describe("invalid input", () => {
		test("returns non-canonical reference unchanged", () => {
			expect(transformNamespace("not-a-ref", "copilot")).toBe("not-a-ref");
		});
	});
});

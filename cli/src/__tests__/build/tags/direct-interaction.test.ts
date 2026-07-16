/**
 * Unit tests for the isDirectInteractionHarness helper.
 * Verifies relay vs direct-interaction detection for each platform.
 */

import { describe, expect, test } from "bun:test";
import {
	isDirectInteractionHarness,
	SUB_AGENT_USER_INTERACTION,
} from "../../../build/tags/index.js";

describe("isDirectInteractionHarness", () => {
	describe("with capabilities provided", () => {
		test("returns true when capabilities include sub-agent-user-interaction", () => {
			expect(
				isDirectInteractionHarness("claude-code", [
					"plugins",
					"slash-commands",
					"agents",
					"skills",
					SUB_AGENT_USER_INTERACTION,
				]),
			).toBe(true);
		});

		test("returns false when capabilities omit sub-agent-user-interaction", () => {
			expect(isDirectInteractionHarness("codex", ["skills", "agents"])).toBe(
				false,
			);
		});

		test("returns false for empty capabilities array", () => {
			expect(isDirectInteractionHarness("claude-code", [])).toBe(false);
		});
	});

	describe("platform fallback (no capabilities)", () => {
		test("returns true for claude-code", () => {
			expect(isDirectInteractionHarness("claude-code")).toBe(true);
		});

		test("returns false for codex", () => {
			expect(isDirectInteractionHarness("codex")).toBe(false);
		});

		test("returns false for opencode", () => {
			expect(isDirectInteractionHarness("opencode")).toBe(false);
		});

		test("returns false for copilot", () => {
			expect(isDirectInteractionHarness("copilot")).toBe(false);
		});

		test("returns false for antigravity", () => {
			expect(isDirectInteractionHarness("antigravity")).toBe(false);
		});
	});

	describe("capability constant", () => {
		test("SUB_AGENT_USER_INTERACTION has expected value", () => {
			expect(SUB_AGENT_USER_INTERACTION).toBe("sub-agent-user-interaction");
		});
	});
});

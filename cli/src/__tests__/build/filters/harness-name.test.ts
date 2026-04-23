/**
 * Unit tests for the harness_name Liquid filter.
 */

import { describe, expect, test } from "bun:test";
import { harnessName } from "../../../build/filters/harness-name.js";

describe("harness_name filter", () => {
	test("maps claude-code to claude-code", () => {
		expect(harnessName("claude-code")).toBe("claude-code");
	});

	test("maps codex to codex", () => {
		expect(harnessName("codex")).toBe("codex");
	});

	test("maps copilot to gh-copilot", () => {
		expect(harnessName("copilot")).toBe("gh-copilot");
	});

	test("maps opencode to opencode", () => {
		expect(harnessName("opencode")).toBe("opencode");
	});
});

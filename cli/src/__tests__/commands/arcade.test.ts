import { describe, expect, test } from "bun:test";
import {
	arcadeCommand,
	formatArcadeHookPayload,
	formatLifecycleAction,
} from "../../commands/arcade.js";

describe("arcade command", () => {
	test("command name is 'arcade'", () => {
		expect(arcadeCommand.name()).toBe("arcade");
	});

	test("includes hidden daemon-only mode for internal flows", () => {
		expect(
			arcadeCommand.options.some((option) => option.long === "--daemon-only"),
		).toBe(true);
	});

	test("formats hook payload with the resolved arcade url", () => {
		expect(
			formatArcadeHookPayload("http://127.0.0.1:7710/projects/test-id"),
		).toBe(
			JSON.stringify({
				systemMessage:
					"🕹️ rp1 Arcade is live at http://127.0.0.1:7710/projects/test-id",
			}),
		);
	});
});

describe("formatLifecycleAction", () => {
	test("reports reused daemon on the given port", () => {
		expect(formatLifecycleAction("reused", 7710)).toBe(
			"Reused daemon on port 7710",
		);
	});

	test("reports started daemon on the given port", () => {
		expect(formatLifecycleAction("started", 8080)).toBe(
			"Started daemon on port 8080",
		);
	});

	test("reports replaced daemon with no reason", () => {
		expect(formatLifecycleAction("replaced", 7710)).toBe(
			"Replaced daemon on port 7710",
		);
	});

	test("reports replaced daemon with version_mismatch reason", () => {
		expect(formatLifecycleAction("replaced", 7710, "version_mismatch")).toBe(
			"Replaced daemon on port 7710 (version mismatch)",
		);
	});

	test("reports replaced daemon with unhealthy_daemon reason", () => {
		expect(formatLifecycleAction("replaced", 9090, "unhealthy_daemon")).toBe(
			"Replaced daemon on port 9090 (unhealthy daemon)",
		);
	});

	test("reports replaced daemon with stale_pid reason", () => {
		expect(formatLifecycleAction("replaced", 7710, "stale_pid")).toBe(
			"Replaced daemon on port 7710 (stale pid)",
		);
	});

	test("reason underscores are replaced with spaces for readability", () => {
		const msg = formatLifecycleAction("replaced", 7710, "missing_pid");
		expect(msg).toContain("missing pid");
		expect(msg).not.toContain("missing_pid");
	});

	test("reused action includes reason when present", () => {
		expect(formatLifecycleAction("reused", 7710, "missing_pid")).toBe(
			"Reused daemon on port 7710 (missing pid)",
		);
		expect(formatLifecycleAction("reused", 7710, "stale_pid")).toBe(
			"Reused daemon on port 7710 (stale pid)",
		);
	});

	test("started action never includes reason", () => {
		expect(formatLifecycleAction("started", 7710, "missing_pid")).toBe(
			"Started daemon on port 7710",
		);
	});
});

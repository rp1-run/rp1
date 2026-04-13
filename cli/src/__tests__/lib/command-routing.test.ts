import { describe, expect, test } from "bun:test";
import {
	getTopLevelCommandToken,
	isTopLevelCommandInvocation,
} from "../../lib/command-routing.js";

describe("command-routing", () => {
	test("detects direct agent-tools invocation", () => {
		expect(getTopLevelCommandToken(["agent-tools", "workflow-bootstrap"])).toBe(
			"agent-tools",
		);
		expect(
			isTopLevelCommandInvocation(
				["agent-tools", "workflow-bootstrap"],
				"agent-tools",
			),
		).toBe(true);
	});

	test("detects agent-tools after root global flags", () => {
		expect(
			getTopLevelCommandToken([
				"--trace",
				"-v",
				"agent-tools",
				"workflow-bootstrap",
				"--name",
				"build",
			]),
		).toBe("agent-tools");
	});

	test("detects daemon server after root global flags", () => {
		expect(
			isTopLevelCommandInvocation(
				["--verbose", "_daemon-server", "--port", "7710"],
				"_daemon-server",
			),
		).toBe(true);
	});

	test("does not route when help/version terminates parsing first", () => {
		expect(getTopLevelCommandToken(["--help", "agent-tools"])).toBeUndefined();
		expect(
			getTopLevelCommandToken(["--version", "agent-tools"]),
		).toBeUndefined();
	});

	test("does not route through unknown leading options", () => {
		expect(
			getTopLevelCommandToken([
				"--unknown-option",
				"agent-tools",
				"workflow-bootstrap",
			]),
		).toBeUndefined();
	});
});

import { describe, expect, test } from "bun:test";
import {
	arcadeCommand,
	formatArcadeHookPayload,
} from "../../commands/arcade.js";

describe("arcade command", () => {
	test("command name is 'arcade'", () => {
		expect(arcadeCommand.name()).toBe("arcade");
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

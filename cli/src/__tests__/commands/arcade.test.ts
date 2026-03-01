import { describe, expect, test } from "bun:test";
import { arcadeCommand } from "../../commands/arcade.js";

describe("arcade command", () => {
	test("command name is 'arcade'", () => {
		expect(arcadeCommand.name()).toBe("arcade");
	});
});

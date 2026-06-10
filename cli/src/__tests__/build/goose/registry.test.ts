import { describe, expect, test } from "bun:test";
import { gooseRegistry } from "../../../build/goose/registry.js";
import { PLATFORM_DEFINITIONS } from "../../../build/platform-definitions.js";
import {
	getDirectoryMapping,
	getToolMapping,
} from "../../../build/registry.js";

describe("goose registry", () => {
	test("maps generated asset directories", () => {
		expect(getDirectoryMapping(gooseRegistry, "skills")).toBe("skills");
		expect(getDirectoryMapping(gooseRegistry, "agents")).toBe("agents");
		expect(getDirectoryMapping(gooseRegistry, "recipes")).toBe("recipes");
	});

	test("maps basic file and shell tools to the Developer extension", () => {
		expect(getToolMapping(gooseRegistry, "Read")).toBe("developer");
		expect(getToolMapping(gooseRegistry, "Write")).toBe("developer");
		expect(getToolMapping(gooseRegistry, "Edit")).toBe("developer");
		expect(getToolMapping(gooseRegistry, "Bash")).toBe("developer");
		expect(getToolMapping(gooseRegistry, "Grep")).toBe("developer");
		expect(getToolMapping(gooseRegistry, "Glob")).toBe("developer");
	});

	test("filters delegation, interactive, and non-basic developer tools", () => {
		expect(getToolMapping(gooseRegistry, "Task")).toBeNull();
		expect(getToolMapping(gooseRegistry, "Skill")).toBeNull();
		expect(getToolMapping(gooseRegistry, "SlashCommand")).toBeNull();
		expect(getToolMapping(gooseRegistry, "AskUserQuestion")).toBeNull();
		expect(getToolMapping(gooseRegistry, "WebSearch")).toBeNull();
		expect(getToolMapping(gooseRegistry, "NotebookEdit")).toBeNull();
		expect(getToolMapping(gooseRegistry, "BashOutput")).toBeNull();
		expect(getToolMapping(gooseRegistry, "KillShell")).toBeNull();
	});

	test("platform definition uses the Goose registry", () => {
		expect(PLATFORM_DEFINITIONS.get("goose")?.registry).toBe(gooseRegistry);
	});
});

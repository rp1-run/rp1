/**
 * Test fixture helpers for accessing and creating test data.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
} from "../../build/models.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "..", "fixtures");

type FixtureType = "valid-plugin" | "invalid-plugin" | "configs";

/**
 * Get the absolute path to a fixture file.
 * @param type - Type of fixture directory
 * @param name - Optional relative path within the fixture type directory
 * @returns Absolute path to the fixture
 */
export function getFixturePath(type: FixtureType, name?: string): string {
	if (name) {
		return join(FIXTURES_DIR, type, name);
	}
	return join(FIXTURES_DIR, type);
}

/**
 * Load fixture file content as string.
 * @param path - Absolute path to the fixture file
 * @returns Promise resolving to the file content
 */
export async function loadFixture(path: string): Promise<string> {
	return readFile(path, "utf-8");
}

/**
 * Create a minimal valid ClaudeCodeCommand for testing.
 * @returns A minimal command object with all required fields
 */
export function createMinimalCommand(): ClaudeCodeCommand {
	return {
		name: "test-command",
		version: "1.0.0",
		description: "A test command for unit testing",
		tags: [],
		created: "2025-01-01",
		author: "test",
		content: "This is test command content.",
	};
}

/**
 * Create a minimal valid ClaudeCodeAgent for testing.
 * @returns A minimal agent object with all required fields
 */
export function createMinimalAgent(): ClaudeCodeAgent {
	return {
		name: "test-agent",
		description: "A test agent for unit testing",
		tools: ["Read", "Write"],
		model: "sonnet",
		content: "You are a test agent.",
	};
}

/**
 * Create a minimal valid ClaudeCodeSkill for testing.
 * @returns A minimal skill object with all required fields
 */
export function createMinimalSkill(): ClaudeCodeSkill {
	return {
		name: "test-skill",
		description: "A test skill for unit testing purposes",
		content: "This skill demonstrates testing.",
		supportingFiles: [],
	};
}

/**
 * Unit tests for comment-preserving writeArcadeSection().
 * Verifies byte-level round-trip preservation, append, merge, and creation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeArcadeSection } from "../../settings/arcade-writer.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("settings-arcade-writer");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

const readFile = (path: string): string => readFileSync(path, "utf-8");

describe("writeArcadeSection", () => {
	test("creates new TOML file with [arcade] section when file does not exist", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, { theme: "dark" });

		const content = readFile(filePath);
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "dark"');
	});

	test("creates new TOML file with downsampling sub-table", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, {
			theme: "light",
			downsampling: { thresholdHours: 48 },
		});

		const content = readFile(filePath);
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "light"');
		expect(content).toContain("[arcade.downsampling]");
		expect(content).toContain("thresholdHours = 48");
	});

	test("appends [arcade] section to existing TOML without disturbing content", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = `[models.claude-code]\nstandard = "claude-sonnet-4-20250514"\n`;

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeArcadeSection(filePath, { theme: "dark" });

		const content = readFile(filePath);
		// Existing content preserved
		expect(content).toContain("[models.claude-code]");
		expect(content).toContain('standard = "claude-sonnet-4-20250514"');
		// New section appended
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "dark"');
	});

	test("preserves existing comments verbatim when appending [arcade] section", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"# My custom model settings",
			"[models.claude-code]",
			"# Use the latest sonnet for standard tier",
			'standard = "claude-sonnet-4-20250514"',
			"",
			"# Budget tier override",
			'fast = "claude-haiku-3"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeArcadeSection(filePath, { theme: "dark" });

		const content = readFile(filePath);
		// All original comments preserved verbatim
		expect(content).toContain("# My custom model settings");
		expect(content).toContain("# Use the latest sonnet for standard tier");
		expect(content).toContain("# Budget tier override");
		// Existing content intact
		expect(content).toContain('standard = "claude-sonnet-4-20250514"');
		expect(content).toContain('fast = "claude-haiku-3"');
	});

	test("merges into existing [arcade] section, appending missing keys only", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = ["[arcade]", 'theme = "light"', ""].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeArcadeSection(filePath, {
			theme: "dark",
			downsampling: { thresholdHours: 48 },
		});

		const content = readFile(filePath);
		// Existing theme preserved (not overwritten)
		expect(content).toContain('theme = "light"');
		expect(content).not.toContain('theme = "dark"');
		// Missing downsampling appended
		expect(content).toContain("[arcade.downsampling]");
		expect(content).toContain("thresholdHours = 48");
	});

	test("does not duplicate keys when written twice with same keys", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, { theme: "dark" });
		writeArcadeSection(filePath, { theme: "light" });

		const content = readFile(filePath);
		const themeMatches = content.match(/theme\s*=/g);
		expect(themeMatches).toHaveLength(1);
		// First write wins
		expect(content).toContain('theme = "dark"');
	});

	test("does not duplicate downsampling sub-table on repeated writes", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, {
			theme: "dark",
			downsampling: { thresholdHours: 48 },
		});
		writeArcadeSection(filePath, {
			downsampling: { thresholdHours: 12 },
		});

		const content = readFile(filePath);
		const downsamplingHeaders = content.match(/\[arcade\.downsampling\]/g);
		expect(downsamplingHeaders).toHaveLength(1);
		const thresholdMatches = content.match(/thresholdHours\s*=/g);
		expect(thresholdMatches).toHaveLength(1);
		// First write wins
		expect(content).toContain("thresholdHours = 48");
	});

	test("handles partial settings (theme only)", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, { theme: "system" });

		const content = readFile(filePath);
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "system"');
		expect(content).not.toContain("[arcade.downsampling]");
	});

	test("handles partial settings (downsampling only)", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, {
			downsampling: { thresholdHours: 72 },
		});

		const content = readFile(filePath);
		expect(content).toContain("[arcade]");
		expect(content).toContain("[arcade.downsampling]");
		expect(content).toContain("thresholdHours = 72");
	});

	test("handles empty settings (no-op arcade header only)", () => {
		const filePath = join(tempDir, "settings.toml");

		writeArcadeSection(filePath, {});

		const content = readFile(filePath);
		expect(content).toContain("[arcade]");
	});

	test("byte-level round-trip: existing file content is identical before and after [arcade] boundary", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"# Top-level comment about this config",
			"",
			"[arguments.build]",
			"# Enable AFK mode for CI",
			"AFK = true",
			"",
			"[models.claude-code]",
			"# Use frontier for deep work",
			'deep = "claude-opus-4-20250514"',
			'standard = "claude-sonnet-4-20250514"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeArcadeSection(filePath, {
			theme: "dark",
			downsampling: { thresholdHours: 48 },
		});

		const content = readFile(filePath);
		// The original content must appear verbatim at the start
		expect(content.startsWith(existingContent)).toBe(true);
	});

	test("merges theme into existing [arcade] that already has downsampling", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"[arcade]",
			"",
			"[arcade.downsampling]",
			"thresholdHours = 12",
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeArcadeSection(filePath, { theme: "dark" });

		const content = readFile(filePath);
		expect(content).toContain('theme = "dark"');
		expect(content).toContain("thresholdHours = 12");
		// No duplicate headers
		const arcadeHeaders = content.match(/^\[arcade\]$/gm);
		expect(arcadeHeaders).toHaveLength(1);
	});

	test("creates parent directories when needed", () => {
		const filePath = join(tempDir, "nested", "dir", "settings.toml");

		writeArcadeSection(filePath, { theme: "dark" });

		const content = readFile(filePath);
		expect(content).toContain('theme = "dark"');
	});
});

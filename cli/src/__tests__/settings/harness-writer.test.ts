/**
 * Unit tests for comment-preserving writeHarnessSelection().
 * Verifies preservation of existing TOML content, idempotency,
 * create vs update, and empty array handling.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeHarnessSelection } from "../../settings/harness-writer.js";
import { resetSettingsCache } from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("settings-harness-writer");
	resetSettingsCache();
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

const readFile = (path: string): string => readFileSync(path, "utf-8");

describe("writeHarnessSelection", () => {
	test("creates new TOML file with [harnesses] section when file does not exist", () => {
		const filePath = join(tempDir, "settings.toml");

		writeHarnessSelection(["claude-code", "codex"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("[harnesses]");
		expect(content).toContain('enabled = ["claude-code", "codex"]');
	});

	test("preserves existing [models] and [arcade] sections when writing [harnesses]", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"[models.claude-code]",
			'standard = "claude-sonnet-4-20250514"',
			"",
			"[arcade]",
			'theme = "dark"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("[models.claude-code]");
		expect(content).toContain('standard = "claude-sonnet-4-20250514"');
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "dark"');
		expect(content).toContain("[harnesses]");
		expect(content).toContain('enabled = ["claude-code"]');
	});

	test("preserves existing comments verbatim when appending [harnesses]", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"# My custom model settings",
			"[models.claude-code]",
			"# Use the latest sonnet for standard tier",
			'standard = "claude-sonnet-4-20250514"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code", "codex"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("# My custom model settings");
		expect(content).toContain("# Use the latest sonnet for standard tier");
		expect(content).toContain('standard = "claude-sonnet-4-20250514"');
	});

	test("updates existing [harnesses] section in place", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"[harnesses]",
			'enabled = ["claude-code"]',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code", "codex", "copilot"], filePath);

		const content = readFile(filePath);
		expect(content).toContain('enabled = ["claude-code", "codex", "copilot"]');
		// No duplicate headers
		const headers = content.match(/^\[harnesses\]$/gm);
		expect(headers).toHaveLength(1);
		// No duplicate enabled keys
		const enabledKeys = content.match(/^enabled\s*=/gm);
		expect(enabledKeys).toHaveLength(1);
	});

	test("is idempotent: repeated writes with same value produce identical content", () => {
		const filePath = join(tempDir, "settings.toml");
		const harnesses = ["claude-code", "codex"];

		writeHarnessSelection(harnesses, filePath);
		const first = readFile(filePath);

		writeHarnessSelection(harnesses, filePath);
		const second = readFile(filePath);

		expect(second).toBe(first);
	});

	test("handles empty array", () => {
		const filePath = join(tempDir, "settings.toml");

		writeHarnessSelection([], filePath);

		const content = readFile(filePath);
		expect(content).toContain("[harnesses]");
		expect(content).toContain("enabled = []");
	});

	test("handles single harness", () => {
		const filePath = join(tempDir, "settings.toml");

		writeHarnessSelection(["codex"], filePath);

		const content = readFile(filePath);
		expect(content).toContain('enabled = ["codex"]');
	});

	test("updates [harnesses] between other sections without corrupting them", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"[models.claude-code]",
			'standard = "claude-sonnet-4-20250514"',
			"",
			"[harnesses]",
			'enabled = ["claude-code"]',
			"",
			"[arcade]",
			'theme = "dark"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code", "codex"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("[models.claude-code]");
		expect(content).toContain('standard = "claude-sonnet-4-20250514"');
		expect(content).toContain('enabled = ["claude-code", "codex"]');
		expect(content).toContain("[arcade]");
		expect(content).toContain('theme = "dark"');
	});

	test("preserves comments within [harnesses] section", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"[harnesses]",
			"# Selected harnesses for this machine",
			'enabled = ["claude-code"]',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code", "codex"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("# Selected harnesses for this machine");
		expect(content).toContain('enabled = ["claude-code", "codex"]');
	});

	test("creates parent directories when needed", () => {
		const filePath = join(tempDir, "nested", "dir", "settings.toml");

		writeHarnessSelection(["claude-code"], filePath);

		const content = readFile(filePath);
		expect(content).toContain("[harnesses]");
		expect(content).toContain('enabled = ["claude-code"]');
	});

	test("byte-level round-trip: existing content before [harnesses] is identical", async () => {
		const filePath = join(tempDir, "settings.toml");
		const existingContent = [
			"# Top-level comment",
			"",
			"[arguments.build]",
			"AFK = true",
			"",
			"[models.claude-code]",
			'deep = "claude-opus-4-20250514"',
			"",
		].join("\n");

		await writeFixture(tempDir, "settings.toml", existingContent);

		writeHarnessSelection(["claude-code", "codex"], filePath);

		const content = readFile(filePath);
		expect(content.startsWith(existingContent)).toBe(true);
	});
});

/**
 * Unit tests for the global stanza writer module.
 * Tests write, replace, remove, and orchestration of fenced stanza blocks
 * in user-global instruction files with filesystem isolation via temp dirs.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	manageGlobalStanzas,
	removeGlobalStanza,
	writeGlobalStanza,
} from "../../init/global-stanza-writer.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

let tempDir: string;

beforeEach(async () => {
	tempDir = await createTempDir("global-stanza-writer-");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

async function readIfExists(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

describe("writeGlobalStanza", () => {
	test("creates file and parent directory when file does not exist", async () => {
		const result = await writeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("written");
		expect(result.filePath).toBe(join(tempDir, ".claude", "CLAUDE.md"));

		const content = await readFile(result.filePath, "utf-8");
		expect(content).toContain("<!-- rp1:start");
		expect(content).toContain("<!-- rp1:end");
		expect(content).toContain("rp1 Knowledge Base");
	});

	test("appends fenced block when file exists without fence", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(
			filePath,
			"# My custom instructions\n\nKeep this.\n",
			"utf-8",
		);

		const result = await writeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("written");

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain("# My custom instructions");
		expect(content).toContain("Keep this.");
		expect(content).toContain("<!-- rp1:start");
		expect(content).toContain("rp1 Knowledge Base");
	});

	test("replaces fenced block when file has existing fence", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(
			filePath,
			"User content\n\n<!-- rp1:start -->\nold stanza\n<!-- rp1:end -->\n\nMore user content\n",
			"utf-8",
		);

		const result = await writeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("updated");

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain("User content");
		expect(content).toContain("More user content");
		expect(content).not.toContain("old stanza");
		expect(content).toContain("rp1 Knowledge Base");
	});

	test("preserves user content outside fence on replace", async () => {
		const filePath = join(tempDir, ".codex", "AGENTS.md");
		await mkdir(join(tempDir, ".codex"), { recursive: true });
		await writeFile(
			filePath,
			"# Header\n\nCustom rules here.\n\n<!-- rp1:start:v0.6.0 -->\nold\n<!-- rp1:end:v0.6.0 -->\n\n## Footer\n",
			"utf-8",
		);

		await writeGlobalStanza("codex", tempDir);

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain("# Header");
		expect(content).toContain("Custom rules here.");
		expect(content).toContain("## Footer");
		expect(content).toContain("Codex agent conventions");
	});

	test("throws for unknown harness ID", async () => {
		await expect(
			writeGlobalStanza("nonexistent-harness", tempDir),
		).rejects.toThrow("Unknown harness ID");
	});

	test("throws for invalid fencing in existing file", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(
			filePath,
			"<!-- rp1:start -->\ncontent\n<!-- rp1:start -->\nmore\n<!-- rp1:end -->\n<!-- rp1:end -->\n",
			"utf-8",
		);

		await expect(writeGlobalStanza("claude-code", tempDir)).rejects.toThrow(
			"Invalid fencing",
		);
	});

	test("writes versioned fence markers", async () => {
		const result = await writeGlobalStanza("claude-code", tempDir);

		const content = await readFile(result.filePath, "utf-8");
		expect(content).toMatch(/<!-- rp1:start:v\d+\.\d+\.\d+ -->/);
		expect(content).toMatch(/<!-- rp1:end:v\d+\.\d+\.\d+ -->/);
	});

	test("codex platform gets codex-specific stanza content", async () => {
		const result = await writeGlobalStanza("codex", tempDir);

		const content = await readFile(result.filePath, "utf-8");
		expect(content).toContain("Task shorthand");
		expect(content).toContain("Subagent waiting");
	});

	test("creates correct path for each harness", async () => {
		const expected: Record<string, string> = {
			"claude-code": join(tempDir, ".claude", "CLAUDE.md"),
			codex: join(tempDir, ".codex", "AGENTS.md"),
			opencode: join(tempDir, ".config", "opencode", "AGENTS.md"),
			copilot: join(tempDir, ".copilot", "copilot-instructions.md"),
			antigravity: join(tempDir, ".gemini", "AGENTS.md"),
		};

		for (const [harnessId, expectedPath] of Object.entries(expected)) {
			const result = await writeGlobalStanza(harnessId, tempDir);
			expect(result.filePath).toBe(expectedPath);
			expect(existsSync(expectedPath)).toBe(true);
		}
	});
});

describe("removeGlobalStanza", () => {
	test("removes fenced block from existing file", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(
			filePath,
			"User content\n\n<!-- rp1:start -->\nmanaged\n<!-- rp1:end -->\n\nMore content\n",
			"utf-8",
		);

		const result = await removeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("removed");
		expect(result.filePath).toBe(filePath);

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain("User content");
		expect(content).toContain("More content");
		expect(content).not.toContain("<!-- rp1:start");
		expect(content).not.toContain("managed");
	});

	test("skips when file does not exist", async () => {
		const result = await removeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("skipped");
		expect(result.filePath).toBe(join(tempDir, ".claude", "CLAUDE.md"));
	});

	test("skips when file has no fenced block", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(filePath, "Just user content, no rp1 fence.\n", "utf-8");

		const result = await removeGlobalStanza("claude-code", tempDir);

		expect(result.action).toBe("skipped");
	});

	test("returns skipped with null filePath for unknown harness", async () => {
		const result = await removeGlobalStanza("nonexistent-harness", tempDir);

		expect(result.action).toBe("skipped");
		expect(result.filePath).toBeNull();
	});

	test("preserves user content when removing fence", async () => {
		const filePath = join(tempDir, ".codex", "AGENTS.md");
		await mkdir(join(tempDir, ".codex"), { recursive: true });
		await writeFile(
			filePath,
			"# My Rules\n\nKeep this.\n\n<!-- rp1:start:v0.7.1 -->\nmanaged stuff\n<!-- rp1:end:v0.7.1 -->\n\n## Also keep\n",
			"utf-8",
		);

		await removeGlobalStanza("codex", tempDir);

		const content = await readFile(filePath, "utf-8");
		expect(content).toContain("# My Rules");
		expect(content).toContain("Keep this.");
		expect(content).toContain("## Also keep");
		expect(content).not.toContain("managed stuff");
	});
});

describe("manageGlobalStanzas", () => {
	test("writes stanzas to enabled harnesses", async () => {
		const result = await manageGlobalStanzas(["claude-code", "codex"], {
			homeDir: tempDir,
		});

		expect(result.written).toContain("claude-code");
		expect(result.written).toContain("codex");
		expect(result.errors).toHaveLength(0);

		const claudeContent = await readIfExists(
			join(tempDir, ".claude", "CLAUDE.md"),
		);
		const codexContent = await readIfExists(
			join(tempDir, ".codex", "AGENTS.md"),
		);
		expect(claudeContent).toContain("rp1 Knowledge Base");
		expect(codexContent).toContain("rp1 Knowledge Base");
	});

	test("removes stanzas from disabled harnesses", async () => {
		await writeGlobalStanza("copilot", tempDir);
		await writeGlobalStanza("antigravity", tempDir);

		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
		});

		expect(result.written).toContain("claude-code");
		expect(result.removed).toContain("copilot");
		expect(result.removed).toContain("antigravity");
	});

	test("skips disabled harnesses that have no existing stanza", async () => {
		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
		});

		expect(result.written).toContain("claude-code");
		expect(result.skipped.length).toBeGreaterThan(0);
	});

	test("reports updated when replacing existing stanzas", async () => {
		await writeGlobalStanza("claude-code", tempDir);

		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
		});

		expect(result.updated).toContain("claude-code");
		expect(result.written).not.toContain("claude-code");
	});

	test("dryRun mode reports what would happen without writing", async () => {
		const result = await manageGlobalStanzas(["claude-code", "codex"], {
			homeDir: tempDir,
			dryRun: true,
		});

		expect(result.written).toContain("claude-code");
		expect(result.written).toContain("codex");

		const claudeFile = await readIfExists(
			join(tempDir, ".claude", "CLAUDE.md"),
		);
		expect(claudeFile).toBeNull();
	});

	test("dryRun reports updated for harnesses with existing stanzas", async () => {
		await writeGlobalStanza("claude-code", tempDir);

		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
			dryRun: true,
		});

		expect(result.updated).toContain("claude-code");
	});

	test("dryRun reports removed for disabled harnesses with existing stanzas", async () => {
		await writeGlobalStanza("codex", tempDir);

		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
			dryRun: true,
		});

		expect(result.removed).toContain("codex");
	});

	test("empty enabled list removes all existing stanzas", async () => {
		await writeGlobalStanza("claude-code", tempDir);
		await writeGlobalStanza("codex", tempDir);

		const result = await manageGlobalStanzas([], { homeDir: tempDir });

		expect(result.removed).toContain("claude-code");
		expect(result.removed).toContain("codex");
		expect(result.written).toHaveLength(0);
	});

	test("collects errors non-blocking", async () => {
		const filePath = join(tempDir, ".claude", "CLAUDE.md");
		await mkdir(join(tempDir, ".claude"), { recursive: true });
		await writeFile(
			filePath,
			"<!-- rp1:start -->\na\n<!-- rp1:start -->\nb\n<!-- rp1:end -->\n<!-- rp1:end -->\n",
			"utf-8",
		);

		const result = await manageGlobalStanzas(["claude-code"], {
			homeDir: tempDir,
		});

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].platform).toBe("claude-code");
		expect(result.errors[0].error).toContain("Invalid fencing");
	});

	test("manages all five harnesses simultaneously", async () => {
		const allHarnesses = [
			"claude-code",
			"codex",
			"opencode",
			"copilot",
			"antigravity",
		];

		const result = await manageGlobalStanzas(allHarnesses, {
			homeDir: tempDir,
		});

		expect(result.written.sort()).toEqual(allHarnesses.sort());
		expect(result.errors).toHaveLength(0);
		expect(result.removed).toHaveLength(0);
		expect(result.skipped).toHaveLength(0);
	});
});

/**
 * Unit tests for the build tool parser module.
 * Tests rp1-specific parsing logic, not library functionality.
 */

import { describe, expect, test } from "bun:test";
import { parseAgent, parseCommand, parseSkill } from "../../build/parser.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getFixturePath,
	writeFixture,
} from "../helpers/index.js";

describe("parser", () => {
	describe("parseCommand", () => {
		test("returns Right with complete ClaudeCodeCommand for valid input", async () => {
			const fixturePath = getFixturePath(
				"valid-plugin",
				"commands/sample-command.md",
			);
			const result = await expectTaskRight(parseCommand(fixturePath));

			expect(result.name).toBe("sample-command");
			expect(result.version).toBe("1.0.0");
			expect(result.description).toBe("A sample command for testing");
			expect(result.author).toBe("rp1-test");
			expect(result.created).toBe("2025-01-01");
			expect(result.argumentHint).toBe("[arg1] [arg2]");
			expect(result.tags).toEqual(["test", "sample"]);
			expect(result.content).toContain("sample command content");
		});

		test("returns Left(ParseError) when frontmatter is missing", async () => {
			const fixturePath = getFixturePath("invalid-plugin", "no-frontmatter.md");
			const error = await expectTaskLeft(parseCommand(fixturePath));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.message).toContain("frontmatter");
			}
		});

		test("returns Left(ParseError) when required fields are missing", async () => {
			const fixturePath = getFixturePath("invalid-plugin", "missing-fields.md");
			const error = await expectTaskLeft(parseCommand(fixturePath));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.message).toContain("Missing required fields");
				expect(error.message).toContain("name");
			}
		});

		test("correctly normalizes Date objects to ISO strings", async () => {
			const tempDir = await createTempDir("parser-date");
			try {
				const content = `---
name: date-test
version: 1.0.0
description: Testing date normalization
author: test
created: 2025-06-15
updated: 2025-06-20
---
Content here.`;

				const filePath = await writeFixture(tempDir, "date-cmd.md", content);
				const result = await expectTaskRight(parseCommand(filePath));

				expect(result.created).toBe("2025-06-15");
				expect(result.updated).toBe("2025-06-20");
			} finally {
				await cleanupTempDir(tempDir);
			}
		});
	});

	describe("parseAgent", () => {
		test("handles tools as array", async () => {
			const fixturePath = getFixturePath(
				"valid-plugin",
				"agents/sample-agent.md",
			);
			const result = await expectTaskRight(parseAgent(fixturePath));

			expect(result.name).toBe("sample-agent");
			expect(result.description).toBe("A sample agent for testing purposes");
			expect(result.tools).toEqual(["Read", "Write", "Bash", "Grep"]);
			expect(result.model).toBe("sonnet");
		});

		test("handles tools as comma-separated string", async () => {
			const tempDir = await createTempDir("parser-tools");
			try {
				const content = `---
name: tools-test
description: Testing comma-separated tools
tools: Read, Write, Bash
---
Agent content.`;

				const filePath = await writeFixture(tempDir, "tools-agent.md", content);
				const result = await expectTaskRight(parseAgent(filePath));

				expect(result.tools).toEqual(["Read", "Write", "Bash"]);
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("defaults model to 'inherit' when not specified", async () => {
			const tempDir = await createTempDir("parser-model");
			try {
				const content = `---
name: no-model
description: Agent without model specified
tools:
  - Read
---
Content.`;

				const filePath = await writeFixture(tempDir, "no-model.md", content);
				const result = await expectTaskRight(parseAgent(filePath));

				expect(result.model).toBe("inherit");
			} finally {
				await cleanupTempDir(tempDir);
			}
		});
	});

	describe("parseSkill", () => {
		test("validates description minimum length (>=20 chars)", async () => {
			const fixturePath = getFixturePath("valid-plugin", "skill/sample-skill");
			const result = await expectTaskRight(parseSkill(fixturePath));

			expect(result.name).toBe("sample-skill");
			expect(result.description.length).toBeGreaterThanOrEqual(20);
		});

		test("returns Left when description is too short", async () => {
			const tempDir = await createTempDir("parser-skill");
			try {
				const skillDir = `${tempDir}/short-skill`;
				await writeFixture(
					tempDir,
					"short-skill/SKILL.md",
					`---
name: short-skill
description: Too short
---
Content.`,
				);

				const error = await expectTaskLeft(parseSkill(skillDir));
				expect(error._tag).toBe("ParseError");
				if (error._tag === "ParseError") {
					expect(error.message).toContain("20 characters");
				}
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("discovers supporting files in templates/ subdirectory", async () => {
			const fixturePath = getFixturePath("valid-plugin", "skill/sample-skill");
			const result = await expectTaskRight(parseSkill(fixturePath));

			expect(result.supportingFiles).toContain("templates/example.md");
		});

		test("extracts metadata map from frontmatter", async () => {
			const tempDir = await createTempDir("parser-skill-meta");
			try {
				const skillDir = `${tempDir}/meta-skill`;
				await writeFixture(
					tempDir,
					"meta-skill/SKILL.md",
					`---
name: meta-skill
description: "A skill with full rp1 metadata for testing extraction"
allowed-tools: Bash(echo *), Read, Write
metadata:
  version: 2.0.0
  tags:
    - core
    - workflow
  created: 2026-01-15
  updated: 2026-02-20
  author: cloud-on-prem/rp1
  argument-hint: "<feature-id> [context]"
---
Skill content with metadata.`,
				);

				const result = await expectTaskRight(parseSkill(skillDir));

				expect(result.name).toBe("meta-skill");
				expect(result.allowedTools).toBe("Bash(echo *), Read, Write");
				expect(result.metadata).toBeDefined();
				expect(result.metadata?.version).toBe("2.0.0");
				expect(result.metadata?.tags).toEqual(["core", "workflow"]);
				expect(result.metadata?.created).toBe("2026-01-15");
				expect(result.metadata?.updated).toBe("2026-02-20");
				expect(result.metadata?.author).toBe("cloud-on-prem/rp1");
				expect(result.metadata?.argumentHint).toBe("<feature-id> [context]");
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("backward compat: skills without metadata map parse without error", async () => {
			const fixturePath = getFixturePath("valid-plugin", "skill/sample-skill");
			const result = await expectTaskRight(parseSkill(fixturePath));

			expect(result.name).toBe("sample-skill");
			expect(result.description).toContain("sample skill");
			expect(result.metadata).toBeUndefined();
		});

		test("parses allowed-tools as comma-separated string", async () => {
			const tempDir = await createTempDir("parser-skill-tools");
			try {
				const skillDir = `${tempDir}/tools-skill`;
				await writeFixture(
					tempDir,
					"tools-skill/SKILL.md",
					`---
name: tools-skill
description: "A skill testing allowed-tools string format parsing"
allowed-tools: Read, Write, Edit, Glob, Grep, Task
---
Skill content.`,
				);

				const result = await expectTaskRight(parseSkill(skillDir));

				expect(result.allowedTools).toBe("Read, Write, Edit, Glob, Grep, Task");
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("handles partial metadata (only some fields present)", async () => {
			const tempDir = await createTempDir("parser-skill-partial");
			try {
				const skillDir = `${tempDir}/partial-skill`;
				await writeFixture(
					tempDir,
					"partial-skill/SKILL.md",
					`---
name: partial-skill
description: "A skill with only version and author in metadata"
metadata:
  version: 1.0.0
  author: test-author
---
Partial metadata content.`,
				);

				const result = await expectTaskRight(parseSkill(skillDir));

				expect(result.metadata).toBeDefined();
				expect(result.metadata?.version).toBe("1.0.0");
				expect(result.metadata?.author).toBe("test-author");
				expect(result.metadata?.tags).toBeUndefined();
				expect(result.metadata?.created).toBeUndefined();
				expect(result.metadata?.updated).toBeUndefined();
				expect(result.metadata?.argumentHint).toBeUndefined();
			} finally {
				await cleanupTempDir(tempDir);
			}
		});
	});
});

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

		test("extracts structured arguments from agent frontmatter", async () => {
			const tempDir = await createTempDir("parser-agent-args");
			try {
				const content = `---
name: task-builder
description: Implements assigned tasks from feature task list
tools: Read, Write, Edit, Bash
model: inherit
arguments:
  - name: FEATURE_ID
    type: string
    required: true
    description: "Feature identifier"
  - name: TASK_IDS
    type: string
    required: true
    description: "Comma-separated task IDs"
    variadic: true
  - name: GIT_COMMIT
    type: boolean
    required: false
    default: false
    description: "Whether to commit changes"
environment:
  - name: RP1_KB_ROOT
    source: "rp1 agent-tools rp1-root-dir"
    description: "Knowledge-base directory"
---
Agent content.`;

				const filePath = await writeFixture(
					tempDir,
					"task-builder.md",
					content,
				);
				const result = await expectTaskRight(parseAgent(filePath));

				expect(result.name).toBe("task-builder");
				expect(result.arguments).toBeDefined();
				expect(result.arguments).toHaveLength(3);

				expect(result.arguments?.[0]?.name).toBe("FEATURE_ID");
				expect(result.arguments?.[0]?.type).toBe("string");
				expect(result.arguments?.[0]?.required).toBe(true);

				expect(result.arguments?.[1]?.name).toBe("TASK_IDS");
				expect(result.arguments?.[1]?.variadic).toBe(true);

				expect(result.arguments?.[2]?.name).toBe("GIT_COMMIT");
				expect(result.arguments?.[2]?.type).toBe("boolean");
				expect(result.arguments?.[2]?.default).toBe(false);

				expect(result.environment).toBeDefined();
				expect(result.environment).toHaveLength(1);
				expect(result.environment?.[0]?.name).toBe("RP1_KB_ROOT");
				expect(result.environment?.[0]?.source).toBe(
					"rp1 agent-tools rp1-root-dir",
				);
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("returns ParseError for malformed argument in agent frontmatter", async () => {
			const tempDir = await createTempDir("parser-agent-bad-args");
			try {
				const content = `---
name: bad-agent
description: Agent with bad argument
tools: Read
arguments:
  - name: MY_ARG
    type: invalid_type
    required: true
    description: "Bad type"
---
Content.`;

				const filePath = await writeFixture(tempDir, "bad-agent.md", content);
				const error = await expectTaskLeft(parseAgent(filePath));

				expect(error._tag).toBe("ParseError");
				if (error._tag === "ParseError") {
					expect(error.message).toContain("invalid 'type'");
				}
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("agent without arguments parses without error", async () => {
			const tempDir = await createTempDir("parser-agent-no-args");
			try {
				const content = `---
name: simple-agent
description: Agent without arguments
tools: Read
---
Content.`;

				const filePath = await writeFixture(
					tempDir,
					"simple-agent.md",
					content,
				);
				const result = await expectTaskRight(parseAgent(filePath));

				expect(result.name).toBe("simple-agent");
				expect(result.arguments).toBeUndefined();
				expect(result.environment).toBeUndefined();
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

		test("extracts structured arguments from skill metadata", async () => {
			const tempDir = await createTempDir("parser-skill-args");
			try {
				const skillDir = `${tempDir}/args-skill`;
				await writeFixture(
					tempDir,
					"args-skill/SKILL.md",
					`---
name: args-skill
description: "A skill with structured arguments for testing extraction"
metadata:
  version: 1.0.0
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
      aliases:
        - "afk"
        - "unattended"
    - name: GIT_PR
      type: boolean
      required: false
      default: false
      description: "Create PR"
      implies:
        - GIT_PUSH
        - GIT_COMMIT
    - name: PLATFORM
      type: enum
      required: false
      description: "Target platform"
      enum_values:
        - claude-code
        - opencode
        - codex
      source:
        env: RP1_PLATFORM
  environment:
    - name: RP1_ROOT
      source: "rp1 agent-tools rp1-root-dir"
      description: "Root directory"
---
Skill with arguments.`,
				);

				const result = await expectTaskRight(parseSkill(skillDir));

				expect(result.metadata).toBeDefined();
				expect(result.metadata?.arguments).toBeDefined();
				expect(result.metadata?.arguments).toHaveLength(4);

				const featureId = result.metadata?.arguments?.[0];
				expect(featureId?.name).toBe("FEATURE_ID");
				expect(featureId?.type).toBe("string");
				expect(featureId?.required).toBe(true);

				const afk = result.metadata?.arguments?.[1];
				expect(afk?.name).toBe("AFK");
				expect(afk?.type).toBe("boolean");
				expect(afk?.default).toBe(false);
				expect(afk?.aliases).toEqual(["afk", "unattended"]);

				const gitPr = result.metadata?.arguments?.[2];
				expect(gitPr?.implies).toEqual(["GIT_PUSH", "GIT_COMMIT"]);

				const platform = result.metadata?.arguments?.[3];
				expect(platform?.type).toBe("enum");
				expect(platform?.enum_values).toEqual([
					"claude-code",
					"opencode",
					"codex",
				]);
				expect(platform?.source).toEqual({ env: "RP1_PLATFORM" });

				expect(result.metadata?.environment).toBeDefined();
				expect(result.metadata?.environment).toHaveLength(1);
				expect(result.metadata?.environment?.[0]?.name).toBe("RP1_ROOT");
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("returns ParseError for malformed argument in skill metadata", async () => {
			const tempDir = await createTempDir("parser-skill-bad-args");
			try {
				const skillDir = `${tempDir}/bad-args-skill`;
				await writeFixture(
					tempDir,
					"bad-args-skill/SKILL.md",
					`---
name: bad-args-skill
description: "A skill with a malformed argument definition"
metadata:
  arguments:
    - name: feature_id
      type: string
      required: true
      description: "Bad name"
---
Content.`,
				);

				const error = await expectTaskLeft(parseSkill(skillDir));
				expect(error._tag).toBe("ParseError");
				if (error._tag === "ParseError") {
					expect(error.message).toContain("UPPER_SNAKE_CASE");
				}
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("returns ParseError for invalid argument type in skill metadata", async () => {
			const tempDir = await createTempDir("parser-skill-bad-type");
			try {
				const skillDir = `${tempDir}/bad-type-skill`;
				await writeFixture(
					tempDir,
					"bad-type-skill/SKILL.md",
					`---
name: bad-type-skill
description: "A skill with an invalid argument type"
metadata:
  arguments:
    - name: MY_ARG
      type: number
      required: true
      description: "Bad type"
---
Content.`,
				);

				const error = await expectTaskLeft(parseSkill(skillDir));
				expect(error._tag).toBe("ParseError");
				if (error._tag === "ParseError") {
					expect(error.message).toContain("invalid 'type'");
					expect(error.message).toContain("number");
				}
			} finally {
				await cleanupTempDir(tempDir);
			}
		});

		test("returns ParseError when argument missing required field", async () => {
			const tempDir = await createTempDir("parser-skill-missing-field");
			try {
				const skillDir = `${tempDir}/missing-field-skill`;
				await writeFixture(
					tempDir,
					"missing-field-skill/SKILL.md",
					`---
name: missing-field-skill
description: "A skill with an argument missing required"
metadata:
  arguments:
    - name: MY_ARG
      type: string
      description: "Missing required field"
---
Content.`,
				);

				const error = await expectTaskLeft(parseSkill(skillDir));
				expect(error._tag).toBe("ParseError");
				if (error._tag === "ParseError") {
					expect(error.message).toContain("required");
				}
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

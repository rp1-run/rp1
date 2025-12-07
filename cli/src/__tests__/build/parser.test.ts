/**
 * Unit tests for the build tool parser module.
 * Tests rp1-specific parsing logic, not library functionality.
 */

import { describe, test, expect } from "bun:test";
import { parseCommand, parseAgent, parseSkill } from "../../build/parser.js";
import {
  getFixturePath,
  expectTaskRight,
  expectTaskLeft,
  createTempDir,
  cleanupTempDir,
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
      const fixturePath = getFixturePath(
        "invalid-plugin",
        "no-frontmatter.md",
      );
      const error = await expectTaskLeft(parseCommand(fixturePath));

      expect(error._tag).toBe("ParseError");
      if (error._tag === "ParseError") {
        expect(error.message).toContain("frontmatter");
      }
    });

    test("returns Left(ParseError) when required fields are missing", async () => {
      const fixturePath = getFixturePath(
        "invalid-plugin",
        "missing-fields.md",
      );
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
      const fixturePath = getFixturePath("valid-plugin", "skills/sample-skill");
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
      const fixturePath = getFixturePath("valid-plugin", "skills/sample-skill");
      const result = await expectTaskRight(parseSkill(fixturePath));

      expect(result.supportingFiles).toContain("templates/example.md");
    });
  });
});

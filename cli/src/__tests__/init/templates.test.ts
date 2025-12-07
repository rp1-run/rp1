/**
 * Unit tests for the init tool templates module.
 * Tests that templates contain required references and warnings.
 */

import { describe, test, expect } from "bun:test";
import { CLAUDE_CODE_TEMPLATE, AGENTS_TEMPLATE } from "../../init/templates/index.js";

describe("templates", () => {
  describe("CLAUDE_CODE_TEMPLATE", () => {
    test("contains KB file references", () => {
      expect(CLAUDE_CODE_TEMPLATE).toContain(".rp1/context/");
      expect(CLAUDE_CODE_TEMPLATE).toContain("index.md");
      expect(CLAUDE_CODE_TEMPLATE).toContain("architecture.md");
      expect(CLAUDE_CODE_TEMPLATE).toContain("modules.md");
      expect(CLAUDE_CODE_TEMPLATE).toContain("patterns.md");
    });

    test("contains loading strategy", () => {
      expect(CLAUDE_CODE_TEMPLATE).toContain("Load");
      expect(CLAUDE_CODE_TEMPLATE).toContain("Read");
    });

    test("warns against /knowledge-load in subagents", () => {
      expect(CLAUDE_CODE_TEMPLATE).toContain("Do NOT");
      expect(CLAUDE_CODE_TEMPLATE).toContain("subagent");
      expect(CLAUDE_CODE_TEMPLATE).toContain("knowledge-load");
    });
  });

  describe("AGENTS_TEMPLATE", () => {
    test("contains KB file references", () => {
      expect(AGENTS_TEMPLATE).toContain(".rp1/context/");
      expect(AGENTS_TEMPLATE).toContain("index.md");
      expect(AGENTS_TEMPLATE).toContain("architecture.md");
    });

    test("contains loading strategy", () => {
      expect(AGENTS_TEMPLATE).toContain("Load");
      expect(AGENTS_TEMPLATE).toContain("Read");
    });

    test("warns against command invocation in subagents", () => {
      expect(AGENTS_TEMPLATE).toContain("Do NOT");
      expect(AGENTS_TEMPLATE).toContain("subagent");
    });
  });

  describe("template consistency", () => {
    test("both templates reference the same KB files", () => {
      const kbFiles = ["index.md", "architecture.md", "modules.md", "patterns.md"];

      for (const file of kbFiles) {
        expect(CLAUDE_CODE_TEMPLATE).toContain(file);
        expect(AGENTS_TEMPLATE).toContain(file);
      }
    });

    test("both templates have consistent structure", () => {
      expect(CLAUDE_CODE_TEMPLATE).toContain("rp1 Knowledge Base");
      expect(AGENTS_TEMPLATE).toContain("rp1 Knowledge Base");

      expect(CLAUDE_CODE_TEMPLATE).toContain("Loading");
      expect(AGENTS_TEMPLATE).toContain("Loading");

      expect(CLAUDE_CODE_TEMPLATE).toContain("Important");
      expect(AGENTS_TEMPLATE).toContain("Important");
    });
  });
});

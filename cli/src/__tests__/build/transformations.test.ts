/**
 * Unit tests for the build tool transformations module.
 * Tests rp1's namespace and content transformation logic.
 */

import { describe, test, expect } from "bun:test";
import {
  transformCommand,
  transformAgent,
  transformSkill,
} from "../../build/transformations.js";
import { defaultRegistry } from "../../build/registry.js";
import {
  expectRight,
  createMinimalCommand,
  createMinimalAgent,
  createMinimalSkill,
} from "../helpers/index.js";

describe("transformations", () => {
  describe("transformCommand", () => {
    test("replaces rp1-base: with rp1-base/ in content", () => {
      const cmd = {
        ...createMinimalCommand(),
        content: "Use rp1-base:knowledge-load for context.",
      };

      const result = expectRight(transformCommand(cmd, defaultRegistry));
      expect(result.template).toContain("rp1-base/knowledge-load");
      expect(result.template).not.toContain("rp1-base:");
    });

    test("replaces rp1-dev: with rp1-dev/ in content", () => {
      const cmd = {
        ...createMinimalCommand(),
        content: "Use rp1-dev:feature-build to implement.",
      };

      const result = expectRight(transformCommand(cmd, defaultRegistry));
      expect(result.template).toContain("rp1-dev/feature-build");
      expect(result.template).not.toContain("rp1-dev:");
    });

    test("transforms multiple namespace references", () => {
      const cmd = {
        ...createMinimalCommand(),
        content:
          "First rp1-base:cmd1, then rp1-dev:cmd2, and rp1-base:cmd3.",
      };

      const result = expectRight(transformCommand(cmd, defaultRegistry));
      expect(result.template).toBe(
        "First rp1-base/cmd1, then rp1-dev/cmd2, and rp1-base/cmd3.",
      );
    });

    test("preserves description and argumentHint", () => {
      const cmd = {
        ...createMinimalCommand(),
        description: "Test description",
        argumentHint: "[test-arg]",
      };

      const result = expectRight(transformCommand(cmd, defaultRegistry));
      expect(result.description).toBe("Test description");
      expect(result.argumentHint).toBe("[test-arg]");
    });
  });

  describe("transformAgent", () => {
    test("maps Claude Code tools to OpenCode equivalents", () => {
      const agent = {
        ...createMinimalAgent(),
        tools: ["Read", "Write", "Grep"],
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.tools).toContain("read_file");
      expect(result.tools).toContain("write_file");
      expect(result.tools).toContain("grep_file");
    });

    test("filters out tools mapped to null (Claude Code specific)", () => {
      const agent = {
        ...createMinimalAgent(),
        tools: ["Read", "ExitPlanMode", "EnterPlanMode", "Write"],
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.tools).toContain("read_file");
      expect(result.tools).toContain("write_file");
      expect(result.tools).not.toContain("ExitPlanMode");
      expect(result.tools).not.toContain("EnterPlanMode");
      expect(result.tools).not.toContain(null);
    });

    test("keeps unknown tools unchanged", () => {
      const agent = {
        ...createMinimalAgent(),
        tools: ["UnknownTool", "Read"],
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.tools).toContain("UnknownTool");
      expect(result.tools).toContain("read_file");
    });

    test("builds correct permissions dict from tools list", () => {
      const agent = {
        ...createMinimalAgent(),
        tools: ["Read", "Write", "Edit", "Bash", "Grep", "Glob"],
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.permissions.file).toContain("read");
      expect(result.permissions.file).toContain("write");
      expect(result.permissions.file).toContain("edit");
      expect(result.permissions.bash).toContain("execute");
      expect(result.permissions.search).toContain("grep");
      expect(result.permissions.search).toContain("glob");
    });

    test("transforms SlashCommand calls to command_invoke pattern", () => {
      const agent = {
        ...createMinimalAgent(),
        content: "Run /rp1-base:knowledge-load then /rp1-dev:feature-build.",
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.content).toContain(
        'command_invoke("rp1-base:knowledge-load")',
      );
      expect(result.content).toContain(
        'command_invoke("rp1-dev:feature-build")',
      );
    });

    test("preserves content inside code blocks", () => {
      const agent = {
        ...createMinimalAgent(),
        content: `Outside /rp1-base:cmd should change.

\`\`\`bash
# Inside code block /rp1-base:cmd should NOT change
\`\`\`

After block /rp1-dev:other should change.`,
      };

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.content).toContain('command_invoke("rp1-base:cmd")');
      expect(result.content).toContain("/rp1-base:cmd should NOT change");
      expect(result.content).toContain('command_invoke("rp1-dev:other")');
    });

    test("sets mode to subagent", () => {
      const agent = createMinimalAgent();

      const result = expectRight(transformAgent(agent, defaultRegistry));
      expect(result.mode).toBe("subagent");
    });
  });

  describe("transformSkill", () => {
    test("preserves skill name and description", () => {
      const skill = createMinimalSkill();

      const result = expectRight(transformSkill(skill, defaultRegistry));
      expect(result.name).toBe(skill.name);
      expect(result.description).toBe(skill.description);
    });

    test("preserves supporting files list", () => {
      const skill = {
        ...createMinimalSkill(),
        supportingFiles: ["templates/foo.md", "scripts/bar.sh"],
      };

      const result = expectRight(transformSkill(skill, defaultRegistry));
      expect(result.supportingFiles).toEqual([
        "templates/foo.md",
        "scripts/bar.sh",
      ]);
    });
  });
});

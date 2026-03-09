/**
 * Unit tests for the Codex transformation engine.
 * Tests namespace transformation (/ to $), code block preservation, and tool mapping.
 */

import { describe, expect, test } from "bun:test";
import {
	transformAgentForCodex,
	transformSkillForCodex,
} from "../../../build/codex/transformations.js";
import {
	createMinimalAgent,
	createMinimalSkill,
	expectRight,
} from "../../helpers/index.js";

describe("transformSkillForCodex", () => {
	describe("namespace transformation", () => {
		test("transforms /rp1-base:skill to $rp1-base-skill", () => {
			const skill = {
				...createMinimalSkill(),
				content: "Use /rp1-base:knowledge-load for context.",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.content).toContain("$rp1-base-knowledge-load");
			expect(result.content).not.toContain("/rp1-base:");
		});

		test("transforms /rp1-dev:skill to $rp1-dev-skill", () => {
			const skill = {
				...createMinimalSkill(),
				content: "Run /rp1-dev:build-fast to build.",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.content).toContain("$rp1-dev-build-fast");
			expect(result.content).not.toContain("/rp1-dev:");
		});

		test("transforms /rp1-utils:skill to $rp1-utils-skill", () => {
			const skill = {
				...createMinimalSkill(),
				content: "Use /rp1-utils:tersify-prompt to optimize.",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.content).toContain("$rp1-utils-tersify-prompt");
			expect(result.content).not.toContain("/rp1-utils:");
		});

		test("transforms multiple references in one content", () => {
			const skill = {
				...createMinimalSkill(),
				content:
					"First /rp1-base:cmd1, then /rp1-dev:cmd2, and /rp1-utils:cmd3.",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.content).toBe(
				"First $rp1-base-cmd1, then $rp1-dev-cmd2, and $rp1-utils-cmd3.",
			);
		});

		test("preserves references inside code blocks", () => {
			const skill = {
				...createMinimalSkill(),
				content: [
					"Use $rp1-base-knowledge-load outside.",
					"```",
					"/rp1-base:knowledge-load",
					"```",
					"And /rp1-dev:build here.",
				].join("\n"),
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.content).toContain("/rp1-base:knowledge-load");
			expect(result.content).toContain("$rp1-dev-build");
		});
	});

	describe("allowed-tools transformation", () => {
		test("maps Bash to functions.exec_command", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: "Bash, Read, Write",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toContain("functions.exec_command");
		});

		test("filters out null-mapped tools", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: "Bash, Read, Write, Grep, Glob",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toBe("functions.exec_command");
		});

		test("handles parenthesized tool patterns", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: "Bash(echo *), Read, Edit",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toContain("functions.exec_command(echo *)");
			expect(result.allowedTools).toContain("functions.apply_patch");
		});

		test("returns undefined when all tools are filtered out", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: "Read, Write, Grep, Glob",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toBeUndefined();
		});

		test("passes through unknown tools as-is", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: "Bash, CustomTool",
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toContain("functions.exec_command");
			expect(result.allowedTools).toContain("CustomTool");
		});

		test("preserves undefined allowedTools", () => {
			const skill = {
				...createMinimalSkill(),
				allowedTools: undefined,
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.allowedTools).toBeUndefined();
		});
	});

	describe("metadata preservation", () => {
		test("preserves name and description", () => {
			const skill = createMinimalSkill();
			const result = expectRight(transformSkillForCodex(skill));
			expect(result.name).toBe(skill.name);
			expect(result.description).toBe(skill.description);
		});

		test("preserves supporting files", () => {
			const skill = {
				...createMinimalSkill(),
				supportingFiles: ["template.md", "config.yaml"],
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.supportingFiles).toEqual(["template.md", "config.yaml"]);
		});

		test("preserves metadata map", () => {
			const skill = {
				...createMinimalSkill(),
				metadata: {
					version: "1.0.0",
					tags: ["workflow"] as readonly string[],
					created: "2026-01-01",
					author: "test",
				},
			};

			const result = expectRight(transformSkillForCodex(skill));
			expect(result.metadata).toEqual(skill.metadata);
		});
	});
});

describe("transformAgentForCodex", () => {
	test("transforms namespace references in agent content", () => {
		const agent = {
			...createMinimalAgent(),
			content:
				"Run /rp1-base:knowledge-load to load KB. Then use /rp1-dev:build.",
		};

		const result = expectRight(transformAgentForCodex(agent));
		expect(result.developerInstructions).toContain("$rp1-base-knowledge-load");
		expect(result.developerInstructions).toContain("$rp1-dev-build");
	});

	test("does not include tools in transformed agent", () => {
		const agent = createMinimalAgent();

		const result = expectRight(transformAgentForCodex(agent));
		expect(result).not.toHaveProperty("tools");
	});

	test("assigns role type based on agent name", () => {
		const builder = {
			...createMinimalAgent(),
			name: "task-builder",
			description: "Implements tasks",
		};
		expect(expectRight(transformAgentForCodex(builder)).roleType).toBe(
			"worker",
		);

		const reviewer = {
			...createMinimalAgent(),
			name: "pr-sub-reviewer",
			description: "Reviews code",
		};
		expect(expectRight(transformAgentForCodex(reviewer)).roleType).toBe(
			"reviewer",
		);

		const analyzer = {
			...createMinimalAgent(),
			name: "kb-spatial-analyzer",
			description: "Analyzes structure",
		};
		expect(expectRight(transformAgentForCodex(analyzer)).roleType).toBe(
			"explorer",
		);
	});

	test("preserves model field", () => {
		const agent = {
			...createMinimalAgent(),
			model: "inherit",
		};

		const result = expectRight(transformAgentForCodex(agent));
		expect(result.model).toBe("inherit");
	});

	test("preserves name and description", () => {
		const agent = createMinimalAgent();
		const result = expectRight(transformAgentForCodex(agent));
		expect(result.name).toBe(agent.name);
		expect(result.description).toBe(agent.description);
	});

	test("preserves content transformation without tools mapping", () => {
		const agent = {
			...createMinimalAgent(),
			content: "Run /rp1-dev:build-fast for quick builds.",
		};

		const result = expectRight(transformAgentForCodex(agent));
		expect(result.developerInstructions).toContain("$rp1-dev-build-fast");
	});
});

/**
 * Unit tests for the Codex transformation engine.
 * Tests namespace transformation (/ to $), code block preservation, and tool mapping.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	discoverSkillMap,
	transformAgentForCodex,
	transformPlainSlashCommands,
	transformSkillForCodex,
} from "../../../build/codex/transformations.js";
import {
	createMinimalAgent,
	createMinimalSkill,
	expectRight,
} from "../../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");

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

describe("transformPlainSlashCommands", () => {
	const skillMap: ReadonlyMap<string, string> = new Map([
		["build", "dev"],
		["build-fast", "dev"],
		["build-express", "dev"],
		["knowledge-build", "base"],
		["knowledge-load", "base"],
		["tersify-prompt", "utils"],
		["pr-review", "dev"],
	]);

	test("transforms plain /skill to $rp1-{plugin}-{skill}", () => {
		const content = "Run /knowledge-build to build KB.";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe("Run $rp1-base-knowledge-build to build KB.");
	});

	test("transforms multiple plain references", () => {
		const content = "Use /build then /pr-review.";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe("Use $rp1-dev-build then $rp1-dev-pr-review.");
	});

	test("longest-match-first prevents /build from matching inside /build-fast", () => {
		const content = "Use /build-fast for speed, /build for full.";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe(
			"Use $rp1-dev-build-fast for speed, $rp1-dev-build for full.",
		);
	});

	test("negative lookahead prevents /build from matching when followed by -express", () => {
		const content = "Use /build-express here.";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe("Use $rp1-dev-build-express here.");
		expect(result.match(/\$rp1-dev-build/g)?.length).toBe(1);
	});

	test("preserves references inside code blocks", () => {
		const content = [
			"Use /build outside.",
			"```",
			"/build inside code block",
			"```",
			"And /pr-review here.",
		].join("\n");

		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toContain("$rp1-dev-build");
		expect(result).toContain("/build inside code block");
		expect(result).toContain("$rp1-dev-pr-review");
	});

	test("no double-transform: already-transformed $rp1- references are not re-matched", () => {
		const content = "Use $rp1-dev-build (already transformed).";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe("Use $rp1-dev-build (already transformed).");
	});

	test("no double-transform when combined with namespace transform", () => {
		const skill = {
			...createMinimalSkill(),
			content: "Run /rp1-dev:build for full. Run /knowledge-load for KB.",
		};

		const result = expectRight(transformSkillForCodex(skill, skillMap));
		expect(result.content).toBe(
			"Run $rp1-dev-build for full. Run $rp1-base-knowledge-load for KB.",
		);
		expect(result.content.match(/\$rp1-dev-build/g)?.length).toBe(1);
	});

	test("returns content unchanged when skill map is empty", () => {
		const content = "Use /build for builds.";
		const result = transformPlainSlashCommands(
			content,
			new Map() as ReadonlyMap<string, string>,
		);
		expect(result).toBe("Use /build for builds.");
	});

	test("does not transform unknown skill names", () => {
		const content = "Use /unknown-skill here.";
		const result = transformPlainSlashCommands(content, skillMap);
		expect(result).toBe("Use /unknown-skill here.");
	});
});

describe("discoverSkillMap", () => {
	test("discovers skill names from real plugin directories", () => {
		const map = discoverSkillMap(projectRoot);

		expect(map.size).toBeGreaterThan(0);
		expect(map.get("build")).toBe("dev");
		expect(map.get("knowledge-build")).toBe("base");
		expect(map.get("tersify-prompt")).toBe("utils");
	});

	test("only includes directories with SKILL.md", async () => {
		const map = discoverSkillMap(projectRoot);

		for (const [name, plugin] of map) {
			const skillMdPath = join(
				projectRoot,
				"plugins",
				plugin,
				"skills",
				name,
				"SKILL.md",
			);
			const size = await Bun.file(skillMdPath).size;
			expect(size).toBeGreaterThan(0);
		}
	});

	test("returns empty map for nonexistent root", () => {
		const map = discoverSkillMap("/nonexistent/path/to/project");
		expect(map.size).toBe(0);
	});
});

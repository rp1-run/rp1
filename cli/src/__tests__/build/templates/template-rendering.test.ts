/**
 * Template rendering tests for Liquid templates.
 *
 * Compares rendered template output against golden files that capture
 * the expected output from the current imperative generators.
 *
 * These tests require liquidjs (devDependency from T1) and the custom
 * filters (T2) to be available. They verify that the Liquid templates
 * produce output functionally equivalent to the existing generator functions.
 *
 * Tests are skipped when liquidjs is not installed (e.g., in worktrees
 * that haven't merged T1 yet).
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const GOLDEN_DIR = join(__dirname, "golden");
const TEMPLATE_DIR = join(__dirname, "../../../build/templates");

// biome-ignore lint/suspicious/noExplicitAny: dynamic import of optional dependency
let LiquidClass: any;
try {
	const mod = await import("liquidjs");
	LiquidClass = mod.Liquid;
} catch {
	// liquidjs not available - tests will be skipped
}

const describeWithLiquid = LiquidClass ? describe : describe.skip;

const readGolden = (name: string): string =>
	readFileSync(join(GOLDEN_DIR, name), "utf-8");

/**
 * Create a minimal Liquid instance with stub filters for template testing.
 *
 * In production, the full filter set from T2 is registered via
 * createTemplateEngine(). Here we use simplified stubs that produce
 * the expected output for the test fixtures.
 */
const createTestEngine = () => {
	const engine = new LiquidClass({
		root: TEMPLATE_DIR,
		extname: ".liquid",
		strictVariables: true,
		strictFilters: true,
		greedy: false,
		lenientIf: true,
	});

	engine.registerFilter("escape_yaml", (value: string) => {
		const needsQuoting = /[[\]{}:#>|*&!%@`'"\\,\n]|^[\s-]|^\s*$/.test(value);
		if (needsQuoting) {
			const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
			return `"${escaped}"`;
		}
		return value;
	});

	engine.registerFilter("escape_toml", (value: string) => {
		return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
	});

	engine.registerFilter(
		"namespace_ref",
		(content: string, platform: string) => {
			if (platform === "opencode") {
				let result = content.replace(/rp1-base:/g, "rp1-base/");
				result = result.replace(/rp1-dev:/g, "rp1-dev/");
				return result;
			}
			if (platform === "codex") {
				return content.replace(
					/\/rp1-(base|dev|utils):([a-z][a-z0-9-]*)/g,
					(_match: string, plugin: string, skill: string) =>
						`$rp1-${plugin}-${skill}`,
				);
			}
			return content;
		},
	);

	engine.registerFilter(
		"slash_commands",
		(content: string, platform: string) => {
			if (platform === "opencode") {
				return content.replace(
					/\/rp1-(base|dev):([a-z-]+)/g,
					(_match: string, plugin: string, command: string) =>
						`command_invoke("rp1-${plugin}:${command}")`,
				);
			}
			return content;
		},
	);

	engine.registerFilter("allowed_tools", (value: string, platform: string) => {
		if (platform === "opencode") {
			return value.split(",").map((t: string) => t.trim());
		}
		if (platform === "codex") {
			const tools = value.split(",").map((t: string) => t.trim());
			const mapped: string[] = [];
			const codexToolMappings: Record<string, string | null> = {
				Bash: "functions.exec_command",
				Edit: "functions.apply_patch",
				Read: null,
				Write: null,
				Grep: null,
				Glob: null,
			};
			for (const tool of tools) {
				const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
				const baseName = parenMatch ? parenMatch[1] : tool;
				const mappedTool = codexToolMappings[baseName];
				if (mappedTool === null) continue;
				if (mappedTool === undefined) {
					mapped.push(tool);
				} else if (parenMatch) {
					mapped.push(`${mappedTool}(${parenMatch[2]})`);
				} else {
					mapped.push(mappedTool);
				}
			}
			return mapped.join(", ");
		}
		return value;
	});

	engine.registerFilter(
		"param_transform",
		(content: string, platform: string) => {
			if (platform === "codex") {
				return content
					.replace(
						/\$ARGUMENTS/g,
						"the arguments provided by the user in their prompt",
					)
					.replace(/\$(\d+)\b/g, (_match: string, num: string) => {
						const ordinals = ["first", "second", "third", "fourth", "fifth"];
						const idx = parseInt(num, 10) - 1;
						const ordinal = ordinals[idx] ?? `#${parseInt(num, 10)}`;
						return `the value of the ${ordinal} argument (extracted from the user's prompt)`;
					});
			}
			return content;
		},
	);

	engine.registerFilter("to_yaml", (value: unknown, indent?: number) => {
		const { stringify } = require("yaml");
		if (value == null) return "";
		const raw = stringify(value, { indent: 2 });
		if (!raw || raw.trim() === "") return "";
		const prefix = " ".repeat(indent ?? 4);
		return raw
			.trimEnd()
			.split("\n")
			.map((line: string) => (line.trim() === "" ? "" : `${prefix}${line}`))
			.join("\n");
	});

	engine.registerFilter("tool_prose", (content: string, platform: string) => {
		if (platform === "codex") {
			const mappings: Record<string, string> = {
				AskUserQuestion: "functions.request_user_input",
				Edit: "functions.apply_patch",
				Bash: "functions.exec_command",
			};
			let result = content;
			for (const [cc, codex] of Object.entries(mappings)) {
				result = result.replace(new RegExp(`\\b${cc}\\b`, "g"), codex);
			}
			return result;
		}
		return content;
	});

	return engine;
};

describeWithLiquid("template rendering", () => {
	describe("opencode/skill.liquid", () => {
		test("renders skill with allowed-tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/skill", {
				platform: "opencode",
				artifact: {
					type: "skill",
					name: "knowledge-build",
					namespacedName: "rp1-base-knowledge-build",
					description: "Build knowledge base artifacts",
					allowedTools: "Bash, Read",
					content:
						"This is the skill content with rp1-base:knowledge-load reference.",
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result.trim()).toBe(readGolden("opencode-skill.md").trim());
		});

		test("renders skill without allowed-tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/skill", {
				platform: "opencode",
				artifact: {
					type: "skill",
					name: "simple-skill",
					namespacedName: "rp1-base-simple-skill",
					description: "A simple skill without tools",
					content: "Simple skill content.",
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result.trim()).toBe(
				readGolden("opencode-skill-no-tools.md").trim(),
			);
		});
	});

	describe("opencode/agent.liquid", () => {
		test("renders agent with model and tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/agent", {
				platform: "opencode",
				artifact: {
					type: "agent",
					name: "test-agent",
					description: "A test agent for building",
					model: "claude-sonnet-4-20250514",
					tools: ["Bash", "Write", "Edit", "Read", "Grep"],
					content: "Agent content with /rp1-dev:build reference.",
				},
			});
			expect(result.trim()).toBe(readGolden("opencode-agent.md").trim());
		});

		test("renders agent with inherit model (model omitted)", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/agent", {
				platform: "opencode",
				artifact: {
					type: "agent",
					name: "inherit-agent",
					description: "Agent with inherited model",
					model: "inherit",
					tools: [],
					content: "Agent content with no tools.",
				},
			});
			expect(result.trim()).toBe(
				readGolden("opencode-agent-inherit.md").trim(),
			);
		});
	});

	describe("codex/skill.liquid", () => {
		test("renders skill with metadata and allowed-tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/skill", {
				platform: "codex",
				artifact: {
					type: "skill",
					name: "build",
					namespacedName: "rp1-dev-build",
					description: "Build plugin artifacts",
					allowedTools: "Bash(echo *)",
					content:
						"Codex skill content with /rp1-base:knowledge-build reference.",
					metadata: {
						version: "1.0.0",
						tags: ["workflow"],
						created: "2026-01-01",
						author: "cloud-on-prem/rp1",
						argumentHint: "<feature-id>",
					},
					supportingFiles: [],
				},
				pluginName: "dev",
			});
			expect(result.trim()).toBe(readGolden("codex-skill.md").trim());
		});
	});

	describe("codex/agent-toml.liquid", () => {
		test("renders agent TOML with developer_instructions", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/agent-toml", {
				platform: "codex",
				pluginName: "dev",
				namespacedPluginName: "rp1-dev",
				artifact: {
					type: "agent",
					name: "task-builder",
					description: "Implements feature tasks",
					model: "inherit",
					tools: ["Bash", "Edit"],
					content:
						"Agent instructions with /rp1-base:knowledge-build reference.",
				},
			});
			expect(result.trim()).toBe(readGolden("codex-agent-toml.toml").trim());
		});
	});

	describe("codex/agents-md.liquid", () => {
		test("renders agents markdown table", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/agents-md", {
				platform: "codex",
				pluginName: "dev",
				artifact: {
					agents: [
						{
							name: "task-builder",
							roleType: "worker",
							description: "Implements feature tasks",
						},
						{
							name: "pr-reviewer",
							roleType: "reviewer",
							description: "Reviews pull requests",
						},
					],
				},
			});
			expect(result.trim()).toBe(readGolden("codex-agents-md.md").trim());
		});
	});

	describe("codex/openai-yaml.liquid", () => {
		test("renders openai.yaml with display_name", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/openai-yaml", {
				platform: "codex",
				artifact: {
					namespacedName: "rp1-dev-build",
				},
			});
			expect(result.trim()).toBe(readGolden("codex-openai-yaml.yaml").trim());
		});
	});

	describe("opencode/manifest.liquid", () => {
		test("renders valid manifest JSON", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/manifest", {
				platform: "opencode",
				pluginName: "base",
				version: "1.0.0",
				buildTimestamp: "2026-01-01T00:00:00.000Z",
				artifact: {
					type: "manifest",
					commands: ["cmd1", "cmd2"],
					agents: ["agent1"],
					skills: ["skill1", "skill2"],
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.plugin).toBe("base");
			expect(manifest.version).toBe("1.0.0");

			expect(manifest.opencodeVersionTested).toBe("0.9.x");
			expect(manifest.artifacts.commands).toEqual(["cmd1", "cmd2"]);
			expect(manifest.artifacts.agents).toEqual(["agent1"]);
			expect(manifest.artifacts.skills).toEqual(["skill1", "skill2"]);
			expect(manifest.installation.agentsDir).toBe(
				"~/.config/opencode/agents/",
			);
			expect(manifest.requirements.opencodeVersion).toBe(">=0.8.0");
		});

		test("includes hasOpenCodePlugin when true", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/manifest", {
				platform: "opencode",
				pluginName: "base",
				version: "1.0.0",
				buildTimestamp: "2026-01-01T00:00:00.000Z",
				artifact: {
					type: "manifest",
					commands: [],
					agents: [],
					skills: [],
					hasOpenCodePlugin: true,
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.hasOpenCodePlugin).toBe(true);
		});
	});

	describe("codex/manifest.liquid", () => {
		test("renders valid codex manifest JSON", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/manifest", {
				platform: "codex",
				pluginName: "dev",
				version: "1.0.0",
				buildTimestamp: "2026-01-01T00:00:00.000Z",
				artifact: {
					type: "manifest",
					skills: ["skill1"],
					agents: ["agent1", "agent2"],
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.plugin).toBe("dev");
			expect(manifest.version).toBe("1.0.0");
			expect(manifest.codexVersionTested).toBe("0.1.x");
			expect(manifest.artifacts.skills).toEqual(["skill1"]);
			expect(manifest.artifacts.agents).toEqual(["agent1", "agent2"]);
			expect(manifest.installation.skillsDir).toBe("~/.codex/skills/");
			expect(manifest.installation.configFile).toBe("~/.codex/config.toml");
		});
	});

	describe("claude-code/skill.liquid", () => {
		test("renders CC skill with passthrough content", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/skill", {
				platform: "claude-code",
				artifact: {
					type: "skill",
					name: "knowledge-build",
					namespacedName: "rp1-base-knowledge-build",
					description: "Build knowledge base artifacts",
					allowedTools: "Bash(echo *), Read, Edit",
					content: "Skill content with rp1-base:knowledge-load reference.",
					metadata: {
						version: "1.0.0",
						tags: ["workflow"],
						created: "2026-01-01",
						author: "cloud-on-prem/rp1",
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toContain("name: rp1-base-knowledge-build");
			expect(result).toContain("allowed-tools: Bash(echo *), Read, Edit");
			expect(result).toContain("`CURRENT_HOST` is `claude-code`");
			expect(result).toContain("rp1-base:knowledge-load");
			expect(result).toContain("version: 1.0.0");
			expect(result).toContain("plugin: base");
			expect(result).toContain("name: knowledge-build");
		});
	});

	describe("claude-code/agent.liquid", () => {
		test("renders CC agent as passthrough content", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/agent", {
				platform: "claude-code",
				artifact: {
					type: "agent",
					name: "test-agent",
					description: "Test agent",
					model: "claude-sonnet-4-20250514",
					tools: ["Bash", "Read"],
					content: "Agent content with rp1-base:agent reference.",
				},
			});
			expect(result).toContain("`CURRENT_HOST` is `claude-code`");
			expect(result).toContain("Agent content with rp1-base:agent reference.");
		});
	});

	describe("claude-code/manifest.liquid", () => {
		test("renders valid CC manifest JSON", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/manifest", {
				platform: "claude-code",
				pluginName: "base",
				version: "1.0.0",
				buildTimestamp: "2026-01-01T00:00:00.000Z",
				artifact: {
					type: "manifest",
					skills: ["skill1"],
					agents: ["agent1"],
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.plugin).toBe("base");
			expect(manifest.artifacts.skills).toEqual(["skill1"]);
			expect(manifest.artifacts.agents).toEqual(["agent1"]);
			expect(manifest.installation.skillsDir).toBe(".claude/skills/");
			expect(manifest.installation.agentsDir).toBe(".claude/agents/");
		});
	});
});

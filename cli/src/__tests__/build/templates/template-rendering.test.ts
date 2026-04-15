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
		if (platform === "copilot") {
			const tools = value.split(",").map((t: string) => t.trim());
			const mapped: string[] = [];
			const copilotToolMappings: Record<string, string | null> = {
				Bash: "run_terminal_command",
				Read: "read_file",
				Write: "write_file",
				Edit: "edit_file",
				Grep: "grep_search",
				Glob: "file_search",
				WebSearch: null,
				TodoWrite: null,
			};
			for (const tool of tools) {
				const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
				const baseName = parenMatch ? parenMatch[1] : tool;
				const mappedTool = copilotToolMappings[baseName];
				if (mappedTool === null) continue;
				if (mappedTool === undefined) {
					mapped.push(tool);
				} else if (parenMatch) {
					mapped.push(`${mappedTool}(${parenMatch[2]})`);
				} else {
					mapped.push(mappedTool);
				}
			}
			return mapped;
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
				namespacedPluginName: "rp1-base",
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

		test("injects resolve-args directory guidance for parameterized skills", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/skill", {
				platform: "opencode",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "skill",
					name: "knowledge-build",
					namespacedName: "rp1-base-knowledge-build",
					description: "Build knowledge base artifacts",
					allowedTools: "Bash, Read",
					content: "Skill content.",
					metadata: {
						arguments: [
							{
								name: "FEATURE_ID",
								type: "string",
								required: false,
								description: "Feature identifier",
							},
						],
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toContain(
				"Extract values from `data.arguments` and `data.directories`",
			);
			expect(result).toContain(
				"| projectRoot | `data.directories.projectRoot` |",
			);
			expect(result).toContain("Do not call `rp1-root-dir`");
		});

		test("injects workflow-bootstrap guidance for tracked workflows", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/skill", {
				platform: "opencode",
				namespacedPluginName: "rp1-dev",
				artifact: {
					type: "skill",
					name: "build-fast",
					namespacedName: "rp1-dev-build-fast",
					schemaPath: "plugins/dev/skills/build-fast/SKILL.md",
					workflowTarget: {
						name: "build-fast",
						schemaPath: "plugins/dev/skills/build-fast/SKILL.md",
					},
					description: "Build fast workflow",
					allowedTools: "Bash(echo *)",
					content: "Workflow content.",
					metadata: {
						isWorkflow: true,
						arguments: [
							{
								name: "DEVELOPMENT_REQUEST",
								type: "string",
								required: true,
								description: "Development request",
							},
						],
					},
					supportingFiles: [],
				},
				pluginName: "dev",
			});
			expect(result).toContain("## 0. Workflow Bootstrap");
			expect(result).toContain("rp1 agent-tools workflow-bootstrap");
			expect(result).toContain("--name build-fast");
			expect(result).toContain(
				"--schema-path plugins/dev/skills/build-fast/SKILL.md",
			);
			expect(result).toContain("| RUN_ID | `data.run.runId` |");
			expect(result).toContain("do not call `emit resume-run` directly");
			expect(result).not.toContain("Run the argument resolver");
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

		test("keeps the closing frontmatter delimiter on its own line for low-metadata skills", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/skill", {
				platform: "opencode",
				artifact: {
					type: "skill",
					name: "analyse-security",
					namespacedName: "rp1-analyse-security",
					description:
						"Performs thorough security validation of features including vulnerability scans.",
					content: "Skill content.",
					metadata: {
						category: "strategy",
						isWorkflow: false,
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toMatch(
				/is_workflow: false\n(?:\n)*---\n(?:\n)*## Host Context/,
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

		test("treats patterned Bash tools as shell-capable", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("opencode/agent", {
				platform: "opencode",
				artifact: {
					type: "agent",
					name: "scoped-bash-agent",
					description: "Agent with scoped Bash permissions",
					model: "inherit",
					tools: ["Read", "Bash(rp1 *)"],
					content: "Agent content.",
				},
			});
			expect(result).toContain("bash: true");
			expect(result).toContain("write: false");
			expect(result).toContain("edit: false");
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
				namespacedPluginName: "rp1-dev",
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

		test("injects resolve-args directory guidance for parameterized skills", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/skill", {
				platform: "codex",
				namespacedPluginName: "rp1-dev",
				artifact: {
					type: "skill",
					name: "build",
					namespacedName: "rp1-dev-build",
					description: "Build plugin artifacts",
					allowedTools: "Bash(echo *)",
					content: "Codex skill content.",
					metadata: {
						arguments: [
							{
								name: "FEATURE_ID",
								type: "string",
								required: true,
								description: "Feature identifier",
							},
						],
					},
					supportingFiles: [],
				},
				pluginName: "dev",
			});
			expect(result).toContain(
				"Extract values from `data.arguments` and `data.directories`",
			);
			expect(result).toContain("| kbRoot | `data.directories.kbRoot` |");
			expect(result).toContain("Do not call `rp1-root-dir`");
		});

		test("injects workflow-bootstrap guidance for tracked workflows", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/skill", {
				platform: "codex",
				namespacedPluginName: "rp1-dev",
				artifact: {
					type: "skill",
					name: "build",
					namespacedName: "rp1-dev-build",
					schemaPath: "plugins/dev/skills/build/SKILL.md",
					workflowTarget: {
						name: "build",
						schemaPath: "plugins/dev/skills/build/SKILL.md",
					},
					description: "Build workflow",
					allowedTools: "Bash(echo *)",
					content: "Codex workflow content.",
					metadata: {
						isWorkflow: true,
						arguments: [
							{
								name: "FEATURE_ID",
								type: "string",
								required: true,
								description: "Feature identifier",
							},
						],
					},
					supportingFiles: [],
				},
				pluginName: "dev",
			});
			expect(result).toContain("## 0. Workflow Bootstrap");
			expect(result).toContain("rp1 agent-tools workflow-bootstrap");
			expect(result).toContain("--name build");
			expect(result).toContain(
				"--schema-path plugins/dev/skills/build/SKILL.md",
			);
			expect(result).toContain(
				'--args "the arguments provided by the user in their prompt"',
			);
			expect(result).toContain("| RUN_RESUMED | `data.run.resumed` |");
			expect(result).toContain("Do not call `resolve-args`");
			expect(result).not.toContain("$ARGUMENTS");
			expect(result).not.toContain("Run the argument resolver");
		});

		test("keeps the closing frontmatter delimiter on its own line for low-metadata skills", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("codex/skill", {
				platform: "codex",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "skill",
					name: "analyse-security",
					namespacedName: "rp1-analyse-security",
					description:
						"Performs thorough security validation of features including vulnerability scans.",
					content: "Skill content.",
					metadata: {
						category: "strategy",
						isWorkflow: false,
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toMatch(
				/is_workflow: false\n(?:\n)*---\n(?:\n)*## Host Context/,
			);
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

	describe("copilot/agent.liquid", () => {
		test("renders native agent frontmatter with namespaced id and mapped tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/agent", {
				platform: "copilot",
				pluginName: "base",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "agent",
					name: "task-builder",
					description: "Builds the requested task",
					model: "inherit",
					tools: ["Bash", "Read", "WebSearch"],
					content: "Agent content.",
				},
			});
			expect(result).toContain("name: rp1-base-task-builder");
			expect(result).toContain("description: Builds the requested task");
			expect(result).toContain("- run_terminal_command");
			expect(result).toContain("- read_file");
			expect(result).not.toContain("WebSearch");
			expect(result).not.toContain("mode:");
			expect(result).not.toContain("model:");
			expect(result).not.toContain("bash:");
		});

		test("renders scoped terminal approvals for patterned Bash tools", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/agent", {
				platform: "copilot",
				pluginName: "dev",
				namespacedPluginName: "rp1-dev",
				artifact: {
					type: "agent",
					name: "emit-agent",
					description: "Runs rp1 agent-tools commands",
					model: "inherit",
					tools: ["Read", "Bash", "Bash(rp1 *)"],
					content: "Agent content.",
				},
			});
			expect(result).toContain("- read_file");
			expect(result).toContain("- run_terminal_command");
			expect(result).toContain("- run_terminal_command(rp1 *)");
		});

		test("renders empty tool array when all tools are filtered out", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/agent", {
				platform: "copilot",
				pluginName: "base",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "agent",
					name: "no-tools",
					description: "No supported tools",
					model: "inherit",
					tools: ["WebSearch", "TodoWrite"],
					content: "Agent content.",
				},
			});
			expect(result).toContain("tools: []");
		});
	});

	describe("copilot/skill.liquid", () => {
		test("renders Copilot skill allowed-tools as permission patterns", async () => {
			const engine = createTestEngine();
			engine.registerFilter("copilot_permissions", (value: string) => {
				if (!value) return [];
				const tools = value.split(",").map((t: string) => t.trim());
				const mapped: string[] = [];
				for (const tool of tools) {
					const parenMatch = tool.match(/^([A-Za-z]+)\((.+)\)$/);
					const base = parenMatch ? parenMatch[1] : tool;
					switch (base) {
						case "Bash":
							mapped.push(
								parenMatch
									? `shell(${parenMatch[2].replace(/^([^\s]+)\s+\*$/, "$1:*")})`
									: "shell",
							);
							break;
						case "Read":
						case "Grep":
						case "Glob":
							mapped.push("read");
							break;
						case "Write":
						case "Edit":
							mapped.push("write");
							break;
						default:
							break;
					}
				}
				return [...new Set(mapped)];
			});
			const result = await engine.renderFile("copilot/skill", {
				platform: "copilot",
				pluginName: "base",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "skill",
					namespacedName: "rp1-knowledge-load",
					description: "Load project knowledge",
					allowedTools: "Bash(echo *), Bash(rp1 *), Read, Edit",
					content: "Skill content.",
					supportingFiles: [],
				},
			});
			expect(result).toContain("allowed-tools:");
			expect(result).toContain("- shell(echo:*)");
			expect(result).toContain("- shell(rp1:*)");
			expect(result).toContain("- read");
			expect(result).toContain("- write");
			expect(result).not.toContain("run_terminal_command");
		});
	});

	describe("copilot/plugin.liquid", () => {
		test("renders native plugin.json fields", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/plugin", {
				platform: "copilot",
				pluginName: "base",
				pluginVersion: "1.2.3",
				namespacedPluginName: "rp1-base",
				artifact: {
					description: "Base plugin for Copilot",
					skills: ["rp1-knowledge-build"],
					agents: ["rp1-base-task-builder"],
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.name).toBe("rp1-base");
			expect(manifest.description).toBe("Base plugin for Copilot");
			expect(manifest.version).toBe("1.2.3");
			expect(manifest.author).toBe("rp1");
			expect(manifest.skills).toBe("skills/");
			expect(manifest.agents).toBe("agents/");
			expect(manifest.hooks).toBeUndefined();
		});

		test("includes hooks only when provided", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/plugin", {
				platform: "copilot",
				pluginName: "base",
				pluginVersion: "1.2.3",
				namespacedPluginName: "rp1-base",
				artifact: {
					description: "Base plugin for Copilot",
					skills: [],
					agents: [],
					hooksPath: "hooks/copilot-hooks.json",
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.hooks).toBe("hooks/copilot-hooks.json");
		});
	});

	describe("copilot/readme.liquid", () => {
		test("renders generated Copilot README content", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/readme", {
				platform: "copilot",
				pluginName: "base",
				pluginVersion: "1.2.3",
				namespacedPluginName: "rp1-base",
				artifact: {
					description: "Base plugin for Copilot",
					skills: ["rp1-knowledge-build"],
					agents: ["rp1-base-task-builder"],
				},
			});
			expect(result).toContain("# rp1-base");
			expect(result).toContain("Base plugin for Copilot");
			expect(result).toContain("`rp1-knowledge-build`");
			expect(result).toContain("`rp1-base-task-builder`");
			expect(result).toContain("Version: `1.2.3`");
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

	describe("copilot/manifest.liquid", () => {
		test("renders native Copilot manifest metadata without legacy paths", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("copilot/manifest", {
				platform: "copilot",
				pluginName: "base",
				namespacedPluginName: "rp1-base",
				version: "1.0.0",
				buildTimestamp: "2026-01-01T00:00:00.000Z",
				artifact: {
					type: "manifest",
					skills: ["rp1-knowledge-build"],
					agents: ["rp1-base-task-builder"],
					commands: [],
				},
			});
			const manifest = JSON.parse(result);
			expect(manifest.plugin).toBe("base");
			expect(manifest.nativePluginName).toBe("rp1-base");
			expect(manifest.copilotVersionTested).toBe("2.74.x");
			expect(manifest.installation.method).toBe("native-plugin-marketplace");
			expect(manifest.installation.marketplaceDir).toBe(
				"~/.rp1/copilot/marketplace",
			);
			expect(manifest.installation.installedPluginsDir).toBe(
				"~/.copilot/installed-plugins/",
			);
			expect(JSON.stringify(manifest)).not.toContain("github-copilot");
		});
	});

	describe("claude-code/skill.liquid", () => {
		test("renders CC skill with passthrough content", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/skill", {
				platform: "claude-code",
				namespacedPluginName: "rp1-base",
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

		test("injects resolve-args directory guidance for parameterized skills", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/skill", {
				platform: "claude-code",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "skill",
					name: "knowledge-build",
					namespacedName: "rp1-base-knowledge-build",
					description: "Build knowledge base artifacts",
					allowedTools: "Bash(echo *), Read, Edit",
					content: "Skill content.",
					metadata: {
						arguments: [
							{
								name: "FEATURE_ID",
								type: "string",
								required: false,
								description: "Feature identifier",
							},
						],
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toContain(
				"Extract values from `data.arguments` and `data.directories`",
			);
			expect(result).toContain("| workRoot | `data.directories.workRoot` |");
			expect(result).toContain("Do not call `rp1-root-dir`");
		});

		test("injects workflow-bootstrap guidance for tracked workflows", async () => {
			const engine = createTestEngine();
			const result = await engine.renderFile("claude-code/skill", {
				platform: "claude-code",
				namespacedPluginName: "rp1-base",
				artifact: {
					type: "skill",
					name: "generate-user-docs",
					namespacedName: "rp1-base-generate-user-docs",
					schemaPath: "plugins/base/skills/generate-user-docs/SKILL.md",
					workflowTarget: {
						name: "generate-user-docs",
						schemaPath: "plugins/base/skills/generate-user-docs/SKILL.md",
					},
					description: "Docs workflow",
					allowedTools: "Bash(echo *), Read",
					content: "Workflow content.",
					metadata: {
						isWorkflow: true,
					},
					supportingFiles: [],
				},
				pluginName: "base",
			});
			expect(result).toContain("## 0. Workflow Bootstrap");
			expect(result).toContain("rp1 agent-tools workflow-bootstrap");
			expect(result).toContain(
				"--schema-path plugins/base/skills/generate-user-docs/SKILL.md",
			);
			expect(result).toContain(
				"| workflowRunPolicy | `data.workflow.runPolicy` |",
			);
			expect(result).toContain("do not call `emit resume-run` directly");
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

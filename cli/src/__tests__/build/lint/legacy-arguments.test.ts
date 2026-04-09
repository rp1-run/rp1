/**
 * Unit tests for L007-L014: source-level argument validation rules.
 */

import { describe, expect, test } from "bun:test";
import {
	lintAgentArguments,
	lintSkillArguments,
} from "../../../build/lint/rules/legacy-arguments.js";
import type {
	ArgumentDefinition,
	SkillMetadata,
} from "../../../build/models.js";

const makeMetadata = (
	overrides: Partial<SkillMetadata> = {},
): SkillMetadata => ({
	version: "1.0.0",
	...overrides,
});

const makeArg = (
	overrides: Partial<ArgumentDefinition> = {},
): ArgumentDefinition => ({
	name: "TEST_ARG",
	type: "string",
	required: false,
	description: "A test argument",
	...overrides,
});

describe("L007: argument-hint alongside arguments", () => {
	test("errors when both argument-hint and arguments present", () => {
		const metadata = makeMetadata({
			argumentHint: "<feature-id>",
			arguments: [makeArg({ name: "FEATURE_ID", required: true })],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test-skill/SKILL.md");
		const l007 = diagnostics.filter((d) => d.rule === "L007");
		expect(l007.length).toBe(1);
		expect(l007[0].severity).toBe("error");
		expect(l007[0].message).toContain("argument-hint");
		expect(l007[0].message).toContain("arguments");
	});

	test("no error when only arguments present (no argument-hint)", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID" })],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L007").length).toBe(0);
	});

	test("no error when neither present", () => {
		const metadata = makeMetadata({});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L007").length).toBe(0);
	});
});

describe("L008: Parameters heading alongside arguments", () => {
	test("errors when ## Parameters found with arguments (skill)", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID" })],
		});
		const body = "Some content\n\n## Parameters\n\n| Name | Default |";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		const l008 = diagnostics.filter((d) => d.rule === "L008");
		expect(l008.length).toBe(1);
		expect(l008[0].severity).toBe("error");
		expect(l008[0].message).toContain("Parameters");
	});

	test("errors when ## 0. Parameters found with arguments (skill)", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID" })],
		});
		const body = "Content\n\n## 0. Parameters\n\n| Name |";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		expect(diagnostics.filter((d) => d.rule === "L008").length).toBe(1);
	});

	test("errors when ### Parameters found with arguments (agent)", () => {
		const args = [makeArg({ name: "FEATURE_ID" })];
		const body = "Content\n\n### Parameters\n\n| Name |";
		const diagnostics = lintAgentArguments(args, body, "agent.md");
		expect(diagnostics.filter((d) => d.rule === "L008").length).toBe(1);
	});

	test("no error when Parameters heading present but no arguments", () => {
		const metadata = makeMetadata({});
		const body = "## Parameters\n\n| Name |";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		expect(diagnostics.filter((d) => d.rule === "L008").length).toBe(0);
	});

	test("no error when arguments present but no Parameters heading", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID" })],
		});
		const body = "No parameters table here.";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		expect(diagnostics.filter((d) => d.rule === "L008").length).toBe(0);
	});
});

describe("L009: argument-hint without arguments", () => {
	test("errors when argument-hint present without arguments", () => {
		const metadata = makeMetadata({
			argumentHint: "<feature-id> [--afk]",
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		const l009 = diagnostics.filter((d) => d.rule === "L009");
		expect(l009.length).toBe(1);
		expect(l009[0].severity).toBe("error");
		expect(l009[0].message).toContain("legacy");
		expect(l009[0].message).toContain("argument-hint");
	});

	test("no error when argument-hint absent and no arguments", () => {
		const metadata = makeMetadata({});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L009").length).toBe(0);
	});

	test("no error when undefined metadata", () => {
		const diagnostics = lintSkillArguments(undefined, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L009").length).toBe(0);
	});
});

describe("L010: enum without enum_values", () => {
	test("errors when enum argument has no enum_values (skill)", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "PLATFORM", type: "enum", required: true })],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		const l010 = diagnostics.filter((d) => d.rule === "L010");
		expect(l010.length).toBe(1);
		expect(l010[0].message).toContain("PLATFORM");
		expect(l010[0].message).toContain("enum_values");
	});

	test("errors when enum argument has empty enum_values", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "PLATFORM",
					type: "enum",
					required: true,
					enum_values: [],
				}),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L010").length).toBe(1);
	});

	test("no error when enum has enum_values", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "PLATFORM",
					type: "enum",
					required: true,
					enum_values: ["codex", "claude-code"],
				}),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L010").length).toBe(0);
	});

	test("errors for agent with enum missing enum_values", () => {
		const args = [makeArg({ name: "MODE", type: "enum", required: true })];
		const diagnostics = lintAgentArguments(args, "", "agent.md");
		const l010 = diagnostics.filter((d) => d.rule === "L010");
		expect(l010.length).toBe(1);
		expect(l010[0].message).toContain("MODE");
	});

	test("no error for non-enum types", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({ name: "NAME", type: "string" }),
				makeArg({ name: "FLAG", type: "boolean" }),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L010").length).toBe(0);
	});
});

describe("L011: implies references non-existent argument", () => {
	test("errors when implies target does not exist", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "GIT_PR",
					type: "boolean",
					implies: ["GIT_PUSH"],
				}),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		const l011 = diagnostics.filter((d) => d.rule === "L011");
		expect(l011.length).toBe(1);
		expect(l011[0].message).toContain("GIT_PR");
		expect(l011[0].message).toContain("GIT_PUSH");
	});

	test("no error when implies target exists", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "GIT_PR",
					type: "boolean",
					implies: ["GIT_PUSH"],
				}),
				makeArg({ name: "GIT_PUSH", type: "boolean" }),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L011").length).toBe(0);
	});

	test("errors for agent with dangling implies", () => {
		const args = [
			makeArg({
				name: "FLAG_A",
				type: "boolean",
				implies: ["FLAG_B"],
			}),
		];
		const diagnostics = lintAgentArguments(args, "", "agent.md");
		expect(diagnostics.filter((d) => d.rule === "L011").length).toBe(1);
	});
});

describe("L012: circular implies chain", () => {
	test("errors on direct circular implies", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "FLAG_A",
					type: "boolean",
					implies: ["FLAG_B"],
				}),
				makeArg({
					name: "FLAG_B",
					type: "boolean",
					implies: ["FLAG_A"],
				}),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		const l012 = diagnostics.filter((d) => d.rule === "L012");
		expect(l012.length).toBeGreaterThanOrEqual(1);
		expect(l012[0].message).toContain("circular");
	});

	test("errors on transitive circular implies", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "FLAG_A",
					type: "boolean",
					implies: ["FLAG_B"],
				}),
				makeArg({
					name: "FLAG_B",
					type: "boolean",
					implies: ["FLAG_C"],
				}),
				makeArg({
					name: "FLAG_C",
					type: "boolean",
					implies: ["FLAG_A"],
				}),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		const l012 = diagnostics.filter((d) => d.rule === "L012");
		expect(l012.length).toBeGreaterThanOrEqual(1);
	});

	test("no error for acyclic implies chain", () => {
		const metadata = makeMetadata({
			arguments: [
				makeArg({
					name: "GIT_PR",
					type: "boolean",
					implies: ["GIT_PUSH"],
				}),
				makeArg({
					name: "GIT_PUSH",
					type: "boolean",
					implies: ["GIT_COMMIT"],
				}),
				makeArg({ name: "GIT_COMMIT", type: "boolean" }),
			],
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		expect(diagnostics.filter((d) => d.rule === "L012").length).toBe(0);
	});

	test("errors for agent with circular implies", () => {
		const args = [
			makeArg({
				name: "FLAG_X",
				type: "boolean",
				implies: ["FLAG_Y"],
			}),
			makeArg({
				name: "FLAG_Y",
				type: "boolean",
				implies: ["FLAG_X"],
			}),
		];
		const diagnostics = lintAgentArguments(args, "", "agent.md");
		expect(
			diagnostics.filter((d) => d.rule === "L012").length,
		).toBeGreaterThanOrEqual(1);
	});
});

describe("L014: parameterized skills must use resolve-args directories", () => {
	test("errors when a parameterized skill body calls rp1-root-dir", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID", required: true })],
		});
		const body =
			"## Step\n\nRun `rp1 agent-tools rp1-root-dir` and extract projectRoot.";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		const l014 = diagnostics.filter((d) => d.rule === "L014");
		expect(l014.length).toBe(1);
		expect(l014[0].severity).toBe("error");
		expect(l014[0].message).toContain("rp1-root-dir");
		expect(l014[0].suggestion).toContain("projectRoot");
	});

	test("does not error when skill has no structured arguments", () => {
		const metadata = makeMetadata({});
		const body = "Run `rp1 agent-tools rp1-root-dir`.";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		expect(diagnostics.filter((d) => d.rule === "L014").length).toBe(0);
	});

	test("does not error when parameterized skill uses generated directories only", () => {
		const metadata = makeMetadata({
			arguments: [makeArg({ name: "FEATURE_ID", required: true })],
		});
		const body =
			"Use the pre-resolved `projectRoot`, `kbRoot`, and `workRoot` values.";
		const diagnostics = lintSkillArguments(metadata, body, "test.md");
		expect(diagnostics.filter((d) => d.rule === "L014").length).toBe(0);
	});
});

describe("actionable messages", () => {
	test("all diagnostics include file path", () => {
		const metadata = makeMetadata({
			argumentHint: "<test>",
			arguments: [
				makeArg({
					name: "TEST",
					type: "enum",
					implies: ["MISSING"],
				}),
			],
		});
		const body = "## Parameters\n\n| Name |";
		const diagnostics = lintSkillArguments(
			metadata,
			body,
			"plugins/dev/skills/build/SKILL.md",
		);
		for (const d of diagnostics) {
			expect(d.file).toBe("plugins/dev/skills/build/SKILL.md");
		}
	});

	test("all diagnostics include suggestion", () => {
		const metadata = makeMetadata({
			argumentHint: "<test>",
		});
		const diagnostics = lintSkillArguments(metadata, "", "test.md");
		for (const d of diagnostics) {
			expect(d.suggestion).toBeDefined();
			expect(d.suggestion!.length).toBeGreaterThan(0);
		}
	});
});

describe("no arguments scenarios", () => {
	test("undefined metadata produces no diagnostics", () => {
		const diagnostics = lintSkillArguments(undefined, "", "test.md");
		expect(diagnostics.length).toBe(0);
	});

	test("empty arguments array for agent produces no diagnostics", () => {
		const diagnostics = lintAgentArguments([], "", "agent.md");
		expect(diagnostics.length).toBe(0);
	});

	test("undefined arguments for agent produces no diagnostics", () => {
		const diagnostics = lintAgentArguments(undefined, "", "agent.md");
		expect(diagnostics.length).toBe(0);
	});
});

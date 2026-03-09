/**
 * Unit tests for build-time sub-agent validation.
 * Tests that declared sub-agents resolve to real agent files
 * and flags undeclared, dead, and cross-plugin references.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { validateSubAgents } from "../../../build/codex/sub-agent-validator.js";
import type { ClaudeCodeSkill } from "../../../build/models.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../../helpers/index.js";

const createSkill = (
	overrides: Partial<ClaudeCodeSkill> & { name: string },
): ClaudeCodeSkill => ({
	description: "A test skill for validation testing",
	content: "Skill content here.",
	supportingFiles: [],
	...overrides,
});

describe("validateSubAgents", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("sub-agent-validator-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("returns empty result when no skills have sub_agents", () => {
		const skills: ClaudeCodeSkill[] = [
			createSkill({ name: "simple-skill", content: "No agents here." }),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
		expect(result.info).toHaveLength(0);
	});

	test("produces error when declared sub-agent has no .md file", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use nonexistent-agent for work.",
				metadata: {
					subAgents: ["rp1-dev:nonexistent-agent"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("[build]");
		expect(result.errors[0]).toContain("nonexistent-agent");
		expect(result.errors[0]).toContain("no corresponding file");
	});

	test("error message includes skill name, agent reference, and expected path", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use missing-builder for work.",
				metadata: {
					subAgents: ["rp1-dev:missing-builder"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("[build]");
		expect(result.errors[0]).toContain("rp1-dev:missing-builder");
		expect(result.errors[0]).toContain(
			join("plugins", "dev", "agents", "missing-builder.md"),
		);
	});

	test("no error when declared sub-agent .md file exists", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"task-builder.md",
			"agent content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use task-builder to implement.",
				metadata: {
					subAgents: ["rp1-dev:task-builder"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(0);
	});

	test("produces warning when content references agent not in sub_agents", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"task-builder.md",
			"agent content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"task-reviewer.md",
			"agent content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use task-builder and task-reviewer.",
				metadata: {
					subAgents: ["rp1-dev:task-builder"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(0);
		const undeclaredWarning = result.warnings.find(
			(w) => w.includes("task-reviewer") && w.includes("not listed"),
		);
		expect(undeclaredWarning).toBeDefined();
		expect(undeclaredWarning).toContain("[build]");
	});

	test("produces warning when declared sub-agent is not referenced in content (dead declaration)", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"task-builder.md",
			"agent content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"unused-agent.md",
			"agent content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use task-builder to implement.",
				metadata: {
					subAgents: ["rp1-dev:task-builder", "rp1-dev:unused-agent"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(0);
		const deadWarning = result.warnings.find(
			(w) => w.includes("unused-agent") && w.includes("not referenced"),
		);
		expect(deadWarning).toBeDefined();
		expect(deadWarning).toContain("[build]");
	});

	test("produces info for cross-plugin sub-agent reference", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "base", "agents"),
			"kb-analyzer.md",
			"agent content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use kb-analyzer for analysis.",
				metadata: {
					subAgents: ["rp1-base:kb-analyzer"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.info).toHaveLength(1);
		expect(result.info[0]).toContain("[build]");
		expect(result.info[0]).toContain("Cross-plugin");
		expect(result.info[0]).toContain("rp1-base:kb-analyzer");
		expect(result.info[0]).toContain("dev");
	});

	test("produces error for invalid sub_agent reference format", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Some content.",
				metadata: {
					subAgents: ["invalid-format"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("Invalid sub_agent reference format");
		expect(result.errors[0]).toContain("invalid-format");
	});

	test("validates multiple skills independently", async () => {
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "build"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "skills", "review"),
			"SKILL.md",
			"skill content",
		);
		await writeFixture(
			join(tempDir, "plugins", "dev", "agents"),
			"task-builder.md",
			"agent content",
		);

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use task-builder.",
				metadata: {
					subAgents: ["rp1-dev:task-builder"],
				},
			}),
			createSkill({
				name: "review",
				content: "Use missing-reviewer.",
				metadata: {
					subAgents: ["rp1-dev:missing-reviewer"],
				},
			}),
		];

		const result = validateSubAgents(tempDir, skills);

		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("[review]");
		expect(result.errors[0]).toContain("missing-reviewer");
	});

	test("validates against real project structure", () => {
		const realProjectRoot = join(import.meta.dir, "..", "..", "..", "..", "..");

		const skills: ClaudeCodeSkill[] = [
			createSkill({
				name: "build",
				content: "Use task-builder to implement tasks.",
				metadata: {
					subAgents: ["rp1-dev:task-builder", "rp1-dev:task-reviewer"],
				},
			}),
		];

		const result = validateSubAgents(realProjectRoot, skills);

		expect(result.errors).toHaveLength(0);
	});
});

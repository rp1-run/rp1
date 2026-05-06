import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
	deriveOrderedSteps,
	getValidNextStates,
} from "../../agent-tools/state-machine/adapter.js";
import { extractStateMachineMermaid } from "../../agent-tools/state-machine/extractor.js";
import { parseAndTransform } from "../../agent-tools/state-machine/transform.js";
import { parseAgent, parseSkill } from "../../build/parser.js";
import { expectRight, expectTaskRight } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const buildSkillDir = join(projectRoot, "plugins/dev/skills/build");

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

const extractDispatches = (content: string, agentName: string): string[] => {
	const start = `{% dispatch_agent "${agentName}" %}`;
	return content
		.split(start)
		.slice(1)
		.map((part) => part.split("{% enddispatch_agent %}")[0] ?? "");
};

const extractArtifactPayloads = (content: string): string[] =>
	[
		...content.matchAll(/--type artifact_registered[\s\S]*?--data '([^']+)'/g),
	].map((match) => match[1] ?? "");

const extractArtifactEmitSteps = (content: string): string[] =>
	[
		...content.matchAll(
			/--type artifact_registered[\s\S]*?--step\s+([A-Za-z0-9:_-]+)/g,
		),
	].map((match) => match[1] ?? "");

const readAgentArgumentNames = async (
	relativePath: string,
): Promise<readonly string[]> => {
	const agent = await expectTaskRight(
		parseAgent(join(projectRoot, relativePath)),
	);
	return agent.arguments?.map((arg) => arg.name) ?? [];
};

describe("Build v2 static contracts", () => {
	test("build skill declares only the four Build v2 parent states", async () => {
		const skill = await expectTaskRight(parseSkill(buildSkillDir));
		const mermaid = extractStateMachineMermaid(skill.content);

		expect(skill.name).toBe("build");
		expect(mermaid).not.toBeNull();

		const machine = expectRight(parseAndTransform("build", mermaid ?? ""));
		const states = [...machine.states.keys()].sort();
		const orderedSteps = deriveOrderedSteps(machine).map((step) => step.id);

		expect(states).toEqual([
			"implementation",
			"planning",
			"release",
			"requirements",
		]);
		expect(orderedSteps).toEqual([
			"requirements",
			"planning",
			"implementation",
			"release",
		]);
		expect(machine.initialStates).toEqual(["requirements"]);
		expect(getValidNextStates(machine, "release")).toEqual([
			"implementation",
			"release",
		]);
	});

	test("build startup uses workflow-state and has no artifact detector dispatch", async () => {
		const skill = await expectTaskRight(parseSkill(buildSkillDir));
		const content = skill.content;
		const workflowStateIndex = content.indexOf(
			"rp1 agent-tools workflow-state",
		);
		const requirementsPhaseIndex = content.indexOf("## §PHASE-1: Requirements");

		expect(workflowStateIndex).toBeGreaterThan(-1);
		expect(workflowStateIndex).toBeLessThan(requirementsPhaseIndex);
		expect(content).toContain(
			"--parent-phases requirements,planning,implementation,release",
		);
		expect(content).toContain(
			"Do not inspect feature files or infer success from filenames.",
		);
		expect(content).not.toContain("build-artifact-detector");
	});

	test("planning has one normal feature-tasker dispatch after the hypothesis gate", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const dispatches = extractDispatches(content, "rp1-dev:feature-tasker");
		const hypothesisGateIndex = content.indexOf("### §2.2 Hypothesis Gate");
		const taskGenerationIndex = content.indexOf("### §2.3 Task Generation");
		const featureTaskerIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:feature-tasker" %}',
		);

		expect(dispatches).toHaveLength(1);
		expect(hypothesisGateIndex).toBeGreaterThan(-1);
		expect(taskGenerationIndex).toBeGreaterThan(hypothesisGateIndex);
		expect(featureTaskerIndex).toBeGreaterThan(taskGenerationIndex);
		expect(dispatches[0]).toContain("UPDATE_MODE=false");
		expect(content).toContain(
			"Normal fresh path invariant: dispatch `feature-tasker` exactly once",
		);
		expect(content).toContain(
			"Do not regenerate tasks before the reason is recorded.",
		);
	});

	test("planning consumes feature-tasker structured JSON completion", async () => {
		const build = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const tasker = await readProjectFile(
			"plugins/dev/agents/feature-tasker.md",
		);

		expect(build).toContain("Parse the response as JSON.");
		expect(build).toContain(
			'"task_plan_path": "features/{FEATURE_ID}/tasks.json"',
		);
		expect(build).toContain(
			"`artifacts[]` entries for both `features/{FEATURE_ID}/tasks.md` and `features/{FEATURE_ID}/tasks.json`",
		);
		expect(build).toContain("Treat prose-prefixed completion");
		expect(tasker).toContain(
			"Return ONLY raw JSON, no prose, no markdown fence.",
		);
		expect(tasker).toContain('"status": "success"');
		expect(tasker).toContain(
			'"task_plan_path": "features/{FEATURE_ID}/tasks.json"',
		);
		expect(tasker).not.toContain("Task planning completed:");
		expect(tasker).not.toContain("Task update completed:");
	});

	test("implementation consumes tasks.json through build-task-plan without parser or grouper agents", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");

		expect(content).toContain("rp1 agent-tools build-task-plan");
		expect(content).toContain(
			'--tasks-path "{workRoot}/features/{FEATURE_ID}/tasks.json"',
		);
		expect(content).toContain(
			"Use the schema-backed task plan sidecar. Do not parse `tasks.md` for machine planning.",
		);
		expect(content).toContain(
			"Never derive task IDs from `tasks.md`; use `TASK_UNIT_IDS` from the current `task_unit`.",
		);
		expect(content).not.toContain("build-task-parser");
		expect(content).not.toContain("build-task-grouper");
	});

	test("implementation persists successful task units through task-reviewer", async () => {
		const build = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const reviewer = await readProjectFile(
			"plugins/dev/agents/task-reviewer.md",
		);

		expect(build).toContain(
			'`status = "SUCCESS"` completes the unit only when `task_plan_updated = true`',
		);
		expect(build).toContain(
			"Do not edit `tasks.json` in the parent orchestrator; the reviewer owns the success decision and task-plan persistence.",
		);
		expect(reviewer).toContain(
			"### 5.5.1 On SUCCESS: Persist Machine Task Plan",
		);
		expect(reviewer).toContain(
			'For each reviewed `TASK_IDS` entry, set matching `tasks[].status = "completed"`.',
		);
		expect(reviewer).toContain(
			"Build v2 resume safety depends on persisted machine status.",
		);
		expect(reviewer).toContain('"task_plan_updated": true');
	});

	test("phase dispatches pass AFK_MODE and CODE_ROOT to the agents that require them", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const afkAgents = [
			"plugins/dev/agents/feature-requirement-gatherer.md",
			"plugins/dev/agents/feature-architect.md",
		];
		const sourceAgents = [
			"plugins/dev/agents/task-builder.md",
			"plugins/dev/agents/task-reviewer.md",
			"plugins/dev/agents/code-checker.md",
			"plugins/dev/agents/feature-verifier.md",
			"plugins/dev/agents/comment-cleaner.md",
		];

		expect(
			extractDispatches(content, "rp1-dev:feature-requirement-gatherer")[0],
		).toContain("AFK_MODE={AFK}");
		expect(
			extractDispatches(content, "rp1-dev:feature-architect")[0],
		).toContain("AFK_MODE={AFK}");

		for (const agentPath of afkAgents) {
			expect(await readAgentArgumentNames(agentPath)).toContain("AFK_MODE");
		}

		for (const agentPath of sourceAgents) {
			expect(await readAgentArgumentNames(agentPath)).toContain("CODE_ROOT");
		}

		expect(extractDispatches(content, "rp1-dev:task-builder")[0]).toContain(
			"CODE_ROOT={codeRoot}",
		);
		expect(extractDispatches(content, "rp1-dev:task-reviewer")[0]).toContain(
			"CODE_ROOT={codeRoot}",
		);
		expect(extractDispatches(content, "rp1-dev:code-checker")[0]).toContain(
			"CODE_ROOT={codeRoot}",
		);
		expect(extractDispatches(content, "rp1-dev:feature-verifier")[0]).toContain(
			"CODE_ROOT={codeRoot}",
		);
		expect(extractDispatches(content, "rp1-dev:comment-cleaner")[0]).toContain(
			"CODE_ROOT={codeRoot}",
		);
	});

	test("active Build v2 artifact registrations include explicit storageRoot", async () => {
		const producerPaths = [
			"plugins/dev/agents/feature-requirement-gatherer.md",
			"plugins/dev/agents/feature-architect.md",
			"plugins/dev/agents/feature-tasker.md",
			"plugins/dev/agents/build-verify-aggregator.md",
			"plugins/dev/agents/feature-archiver.md",
			"plugins/base/skills/artifact-templates/templates/feature-requirement-gatherer/requirements.md",
			"plugins/base/skills/artifact-templates/templates/feature-architect/design.md",
			"plugins/base/skills/artifact-templates/templates/feature-architect/design-decisions.md",
			"plugins/base/skills/artifact-templates/templates/hypothesis-tester/hypothesis-document.md",
			"plugins/base/skills/artifact-templates/templates/feature-tasker/tasks.md",
			"plugins/base/skills/artifact-templates/templates/feature-tasker/tasks.json",
			"plugins/base/skills/artifact-templates/templates/build-verify-aggregator/build-readiness.md",
		];

		for (const producerPath of producerPaths) {
			const payloads = extractArtifactPayloads(
				await readProjectFile(producerPath),
			);
			expect(payloads.length, producerPath).toBeGreaterThan(0);
			for (const payload of payloads) {
				expect(payload, producerPath).toContain('"storageRoot"');
			}
		}
	});

	test("active Build v2 artifact registration steps match the parent state model", async () => {
		const skill = await expectTaskRight(parseSkill(buildSkillDir));
		const mermaid = extractStateMachineMermaid(skill.content);
		const machine = expectRight(parseAndTransform("build", mermaid ?? ""));
		const validParentSteps = new Set(machine.states.keys());
		const producerPaths = [
			"plugins/dev/agents/feature-requirement-gatherer.md",
			"plugins/dev/agents/feature-architect.md",
			"plugins/dev/agents/feature-tasker.md",
			"plugins/dev/agents/build-verify-aggregator.md",
			"plugins/dev/agents/feature-archiver.md",
			"plugins/base/skills/artifact-templates/templates/feature-requirement-gatherer/requirements.md",
			"plugins/base/skills/artifact-templates/templates/feature-architect/design.md",
			"plugins/base/skills/artifact-templates/templates/feature-architect/design-decisions.md",
			"plugins/base/skills/artifact-templates/templates/hypothesis-tester/hypothesis-document.md",
			"plugins/base/skills/artifact-templates/templates/feature-tasker/tasks.md",
			"plugins/base/skills/artifact-templates/templates/feature-tasker/tasks.json",
			"plugins/base/skills/artifact-templates/templates/build-verify-aggregator/build-readiness.md",
		];

		for (const producerPath of producerPaths) {
			const steps = extractArtifactEmitSteps(
				await readProjectFile(producerPath),
			);
			expect(steps.length, producerPath).toBeGreaterThan(0);
			for (const step of steps) {
				expect(
					step.includes(":") || validParentSteps.has(step),
					`${producerPath} uses invalid artifact registration step ${step}`,
				).toBe(true);
			}
		}
	});

	test("readiness statuses and release behavior stay aligned", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const aggregator = await readProjectFile(
			"plugins/dev/agents/build-verify-aggregator.md",
		);

		for (const status of ["PASS", "WARN", "FAIL", "WAITING"]) {
			expect(aggregator).toContain(status);
		}

		for (const behavior of [
			"PASS/proceed",
			"WARN/proceed_with_notes",
			"FAIL/return_to_implementation",
			"WAITING/wait_for_human",
		]) {
			expect(content).toContain(behavior);
		}

		expect(content).toContain(
			'path = "features/{FEATURE_ID}/build-readiness.md"',
		);
		expect(content).toContain('storageRoot = "work_dir"');
	});

	test("implementation checkpoint happens after readiness aggregation", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const aggregatorDispatchIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:build-verify-aggregator" %}',
		);
		const checkpointIndex = content.indexOf(
			"**Implementation checkpoint** (after readiness; skip if AFK):",
		);
		const completionEmitIndex = content.indexOf(
			"After the user chooses Release, or AFK skips this checkpoint, emit `implementation` completed:",
		);

		expect(aggregatorDispatchIndex).toBeGreaterThan(-1);
		expect(checkpointIndex).toBeGreaterThan(aggregatorDispatchIndex);
		expect(completionEmitIndex).toBeGreaterThan(checkpointIndex);
		expect(content).toContain(
			"artifact=features/{FEATURE_ID}/build-readiness.md",
		);
		expect(content).not.toContain('"context": "Build phase complete"');
	});

	test("archive completion is ordered after feature-archiver success", async () => {
		const content = await readProjectFile("plugins/dev/skills/build/SKILL.md");
		const releaseRunningIndex = content.indexOf("Emit `release` running");
		const releaseGateIndex = content.indexOf("**Release gate**");
		const declineIndex = content.indexOf("Complete without archive");
		const archiveSectionIndex = content.indexOf("### Archive");
		const archiverDispatchIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:feature-archiver" %}',
		);
		const successRequirementIndex = content.indexOf(
			"Parse the `feature-archiver` response before completing release:",
		);
		const archiveCompletedIndex = content.indexOf(
			'"archive_status": "completed", "archive_path": "{ARCHIVE_RESULT.archive_path}"',
		);

		expect(releaseRunningIndex).toBeLessThan(releaseGateIndex);
		expect(declineIndex).toBeLessThan(archiveSectionIndex);
		expect(content).toContain("Do not run `feature-archiver`.");
		expect(archiverDispatchIndex).toBeGreaterThan(archiveSectionIndex);
		expect(successRequirementIndex).toBeGreaterThan(archiverDispatchIndex);
		expect(archiveCompletedIndex).toBeGreaterThan(successRequirementIndex);
		expect(content).toContain(
			"After `feature-archiver` succeeds and registers the actual archived output, emit `release` completed:",
		);
		expect(content).toContain(
			'The archived artifact path MUST begin with `archives/features/` and use `storageRoot = "work_dir"`.',
		);
	});
});

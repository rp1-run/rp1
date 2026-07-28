import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
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

/**
 * Read a skill's full prompt surface: SKILL.md plus every file under its
 * references/ directory. Progressive disclosure splits one skill's
 * instructions across several files, so a contract about what the skill
 * specifies holds over the whole surface, not SKILL.md alone.
 */
const readSkillSurface = async (skillRelativeDir: string): Promise<string> => {
	const dir = join(projectRoot, skillRelativeDir);
	const parts = [await readFile(join(dir, "SKILL.md"), "utf-8")];
	const refsDir = join(dir, "references");
	try {
		for (const entry of (await readdir(refsDir)).sort()) {
			if (entry.endsWith(".md")) {
				parts.push(await readFile(join(refsDir, entry), "utf-8"));
			}
		}
	} catch {
		// No references/ directory for this skill.
	}
	return parts.join("\n");
};

const extractDispatches = (content: string, agentName: string): string[] => {
	const pattern = new RegExp(
		`{% dispatch_agent "${agentName}"(?:, \\w+)? %}([\\s\\S]*?){% enddispatch_agent %}`,
		"g",
	);
	return [...content.matchAll(pattern)].map((match) => match[1] ?? "");
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
		expect(content).toContain("WAITING_PHASE");
		expect(content).toContain(
			"return to that phase's recorded checkpoint/decision handler",
		);
		expect(content).not.toContain("build-artifact-detector");
	});

	test("build instructs the model to pass a kebab-case FEATURE_ID slug", async () => {
		const skill = await expectTaskRight(parseSkill(buildSkillDir));
		const content = skill.content;
		// The model must derive a clean slug rather than letting raw prose / a file
		// path land in FEATURE_ID (which names the feature dir and resume key).
		expect(content).toContain("FEATURE_ID slug");
		expect(content).toContain('`--args "<slug> <remaining request>"`');
		expect(content).toContain("the remainder resolves to `REQUIREMENTS`");
	});

	test("checkpoint menus stay within the AskUserQuestion 4-option cap and keep Arcade/Stop", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");

		// The discipline rule that prevents a surfaced sub-decision from evicting a
		// canonical option (e.g. dropping "Review feedback from Arcade") exists.
		expect(content).toContain("## §CHECKPOINT-OPTIONS");
		expect(content).toContain("at most **4 options**");

		// Every ask_user directive declares 2-4 options — the harness hard cap.
		const askUserPattern =
			/\{%\s*ask_user\s+"[^"]*"\s*,\s*options:\s*([^%]*?)%\}/g;
		const matches = [...content.matchAll(askUserPattern)];
		expect(matches.length).toBeGreaterThanOrEqual(5);
		for (const match of matches) {
			const optionCount = (match[1]?.match(/"/g)?.length ?? 0) / 2;
			expect(optionCount).toBeGreaterThanOrEqual(2);
			expect(optionCount).toBeLessThanOrEqual(4);
		}

		// The requirements and planning checkpoints keep the canonical four verbatim.
		const canonical = content.match(
			/\{%\s*ask_user\s+"Continue, Revise, Review feedback from Arcade, or Stop\?"[^%]*%\}/g,
		);
		expect(canonical?.length).toBe(2);
	});

	test("planning has one normal feature-tasker dispatch after the hypothesis gate", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");
		const dispatches = extractDispatches(content, "rp1-dev:feature-tasker");
		const normalDispatches = dispatches.filter((dispatch) =>
			dispatch.includes("UPDATE_MODE=false"),
		);
		const hypothesisGateIndex = content.indexOf("### §2.2 Hypothesis Gate");
		const taskGenerationIndex = content.indexOf("### §2.3 Task Generation");
		const featureTaskerIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:feature-tasker" %}',
		);

		expect(normalDispatches).toHaveLength(1);
		expect(hypothesisGateIndex).toBeGreaterThan(-1);
		expect(taskGenerationIndex).toBeGreaterThan(hypothesisGateIndex);
		expect(featureTaskerIndex).toBeGreaterThan(taskGenerationIndex);
		expect(normalDispatches[0]).toContain(
			"UPDATE_CONTEXT={TASK_REGENERATION_REASON}",
		);
		expect(content).toContain(
			"Normal fresh path invariant: dispatch `feature-tasker` exactly once",
		);
		expect(content).toContain(
			"Do not regenerate tasks before the reason is recorded.",
		);
		expect(content).toContain(
			"set `PLANNING_UPDATE_CONTEXT = TASK_REGENERATION_REASON`",
		);
		expect(content).toContain("UPDATE_CONTEXT={TASK_REGENERATION_REASON}");
		expect(content).not.toContain("UPDATE_CONTEXT=TASK_REGENERATION_REASON");
	});

	test("planning revision context is passed to architect and tasker agents", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");
		const architect = await readProjectFile(
			"plugins/dev/agents/feature-architect.md",
		);
		const tasker = await readProjectFile(
			"plugins/dev/agents/feature-tasker.md",
		);

		expect(
			extractDispatches(content, "rp1-dev:feature-architect")[0],
		).toContain("UPDATE_CONTEXT={PLANNING_UPDATE_CONTEXT}");
		expect(content).toContain(
			"Rejected hypotheses: {ids}; revision requested: {summary}",
		);
		expect(architect).toContain("UPDATE_CONTEXT");
		expect(architect).toContain(
			"avoid regenerating the same rejected hypothesis",
		);
		expect(tasker).toContain("UPDATE_CONTEXT");
		expect(tasker).toContain("treat it as an explicit update requirement");
	});

	test("planning consumes feature-tasker structured JSON completion", async () => {
		const build = await readSkillSurface("plugins/dev/skills/build");
		const tasker = await readProjectFile(
			"plugins/dev/agents/feature-tasker.md",
		);

		// Build validates tasker response as JSON with task_plan_path and both artifact files
		expect(build).toContain("parse JSON");
		expect(build).toContain("task_plan_path");
		expect(build).toContain(
			"`artifacts[]` for both `tasks.md` and `tasks.json`",
		);
		expect(build).toContain("Do not continue without confirmed results");
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
		const content = await readSkillSurface("plugins/dev/skills/build");

		expect(content).toContain("rp1 agent-tools build-task-plan");
		expect(content).toContain(
			'--tasks-path "{workRoot}/features/{FEATURE_ID}/tasks.json"',
		);
		expect(content).toContain(
			"Use the schema-backed task plan sidecar. Do not parse `tasks.md` for machine planning.",
		);
		expect(content).toContain(
			"Never derive task IDs from `tasks.md`; use the tool output.",
		);
		expect(content).not.toContain("build-task-parser");
		expect(content).not.toContain("build-task-grouper");
	});

	test("implementation checks the ready wave before falling back to serial dispatch", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");

		const dispatchCycleIndex = content.indexOf("#### Dispatch Cycle");
		const dispatchFromIndex = content.indexOf(
			"#### Dispatching from `schedule-wave` Output",
		);
		const parallelModeIndex = content.indexOf("**Parallel-wave mode**");
		const serialModeIndex = content.indexOf("**Serial mode**");

		expect(dispatchCycleIndex).toBeGreaterThan(-1);
		expect(dispatchFromIndex).toBeGreaterThan(dispatchCycleIndex);
		expect(parallelModeIndex).toBeGreaterThan(dispatchFromIndex);
		expect(serialModeIndex).toBeGreaterThan(parallelModeIndex);
		expect(content).toContain("rp1 agent-tools schedule-wave");
		expect(content).toContain(
			"Repeat until `schedule-wave` returns an empty dispatch",
		);
		expect(content).toContain('`mode == "parallel-wave"`');
		expect(content).toContain('`mode == "serial"`');
	});

	test("parallel builder reference integrates secondary work only after primary review succeeds", async () => {
		const build = await readSkillSurface("plugins/dev/skills/build");
		const reference = await readProjectFile(
			"plugins/dev/skills/build/references/parallel-builders.md",
		);
		const builder = await readProjectFile("plugins/dev/agents/task-builder.md");

		expect(build).toContain(
			"Review the primary unit first. On primary reviewer success, integrate each secondary worktree",
		);
		expect(build).toContain(
			"If the primary reviewer fails, abandon all secondary worktrees",
		);
		expect(reference).toContain(
			"After both builders complete and reviewer(k) succeeds on the primary branch",
		);
		expect(reference).toContain(
			"If reviewer(k) fails after both builders succeeded:",
		);
		expect(builder).toContain(".task-file.lock");
		expect(builder).toContain(
			"Run Sections 4.1 through 4.3 while holding the lock.",
		);
	});

	test("task plan machine schema includes targets for code and docs parity", async () => {
		const tasker = await readProjectFile(
			"plugins/dev/agents/feature-tasker.md",
		);
		const template = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/feature-tasker/tasks.json",
		);

		expect(tasker).toContain(
			"`target`: primary source, module, config, test, or doc path affected by the task",
		);
		expect(tasker).toContain("Include `target` for every code and docs task.");
		expect(template).toContain('"target": "src/path.ts"');
		expect(template).toContain('"target": "docs/reference/dev/build.md"');
	});

	test("interactive Add Task paths update tasks.json before stopping", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");

		expect(content).toContain("collect `ADDED_TASK_REQUEST`");
		expect(content).toContain(
			'UPDATE_CONTEXT={"source":"implementation_checkpoint","request":"{ADDED_TASK_REQUEST}"}',
		);
		expect(content).toContain(
			'UPDATE_CONTEXT={"source":"release_gate","request":"{ADDED_TASK_REQUEST}"}',
		);
		expect(content).not.toContain('"request":ADDED_TASK_REQUEST');
		expect(content).toContain(
			"On resume, `build-task-plan` must consume the updated `tasks.json`.",
		);
		// Add Task paths carry the added task request in emit data
		expect(content).toContain("added_task_request");
	});

	test("waiting-phase resumes branch before producer dispatches", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");

		for (const phase of [
			'"requirements"',
			'"planning"',
			'"implementation"',
			'"release"',
		]) {
			expect(content).toContain(`WAITING_PHASE.phase == ${phase}`);
		}

		expect(content).toContain(
			"Do not dispatch `feature-requirement-gatherer` unless the resumed decision is Revise.",
		);
		expect(content).toContain(
			"Do not dispatch `feature-architect`, `hypothesis-tester`, or fresh `feature-tasker` on a waiting resume",
		);
		expect(content).toContain(
			"Do not dispatch task-builder, validators, or comment-cleaner before the matching resumed decision path is selected.",
		);
		expect(content).toContain(
			"Do not emit `release` completed on a waiting resume until the resumed release decision succeeds.",
		);
	});

	test("implementation persists successful task units through task-reviewer", async () => {
		const build = await readSkillSurface("plugins/dev/skills/build");
		const reviewer = await readProjectFile(
			"plugins/dev/agents/task-reviewer.md",
		);

		// Build contract: SUCCESS + task_plan_updated completes the unit
		expect(build).toContain("`SUCCESS` + `task_plan_updated = true`");
		expect(build).toContain("completes the unit");
		expect(build).toContain("Do not edit `tasks.json`");
		expect(build).toContain("the reviewer owns");
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
		const content = await readSkillSurface("plugins/dev/skills/build");
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
				expect(
					payload.includes('"storageRoot"') ||
						payload.includes('\\"storageRoot\\"'),
					producerPath,
				).toBe(true);
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
		const content = await readSkillSurface("plugins/dev/skills/build");
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
		const content = await readSkillSurface("plugins/dev/skills/build");
		const aggregatorDispatchIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:build-verify-aggregator" %}',
		);
		const checkpointIndex = content.indexOf(
			"**Implementation checkpoint** (after readiness; skip if AFK):",
		);
		const completionEmitIndex = content.indexOf(
			"After the user chooses Release, or AFK skips this checkpoint, emit `implementation` completed",
		);

		expect(aggregatorDispatchIndex).toBeGreaterThan(-1);
		expect(checkpointIndex).toBeGreaterThan(aggregatorDispatchIndex);
		expect(completionEmitIndex).toBeGreaterThan(checkpointIndex);
		// Readiness artifact reference exists in resume and release sections
		expect(content).toContain(
			'path = "features/{FEATURE_ID}/build-readiness.md"',
		);
		expect(content).not.toContain('"context": "Build phase complete"');
	});

	test("archive completion is ordered after feature-archiver success", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");
		const releaseRunningIndex = content.indexOf("Emit `release` running");
		const releaseGateIndex = content.indexOf("**Release gate**");
		const declineIndex = content.indexOf("Complete without archive");
		const archiveSectionIndex = content.indexOf("### Archive");
		const archiverDispatchIndex = content.indexOf(
			'{% dispatch_agent "rp1-dev:feature-archiver" %}',
		);
		const parseResponseIndex = content.indexOf(
			"Parse the `feature-archiver` response",
		);
		const archiveCompletedIndex = content.indexOf(
			"After `feature-archiver` succeeds and registers the actual archived output",
		);

		expect(releaseRunningIndex).toBeLessThan(releaseGateIndex);
		expect(declineIndex).toBeLessThan(archiveSectionIndex);
		expect(content).toContain("Do not run `feature-archiver`.");
		expect(archiverDispatchIndex).toBeGreaterThan(archiveSectionIndex);
		expect(parseResponseIndex).toBeGreaterThan(archiverDispatchIndex);
		expect(archiveCompletedIndex).toBeGreaterThan(parseResponseIndex);
		// Archive success requires artifacts beginning with archives/features/
		expect(content).toContain(
			'`artifacts[]` entry beginning with `archives/features/` using `storageRoot: "work_dir"`',
		);
	});

	test("feature archiver exposes a registration-only retry path", async () => {
		const archiver = await readProjectFile(
			"plugins/dev/agents/feature-archiver.md",
		);
		const build = await readSkillSurface("plugins/dev/skills/build");

		expect(archiver).toContain("REGISTRATION_ONLY=true");
		expect(archiver).toContain(
			"continue directly to §6.5 to retry artifact registration",
		);
		expect(archiver).toContain("ARCHIVE_PATH");
		expect(archiver).toContain("basename(ARCHIVE_PATH without trailing slash)");
		expect(archiver).toContain("Do not recompute DEST from FEATURE_ID.");
		expect(archiver).toContain('"archive_status": "waiting_registration"');
		expect(archiver).toContain('"registration_retry_required": true');
		expect(archiver).toContain(
			"A later retry MUST pass the failed result's exact `archive_path` as `ARCHIVE_PATH`",
		);
		expect(archiver).toContain('"registration_status":"{REGISTRATION_STATUS}"');
		expect(build).toContain("ARCHIVE_RETRY_PATH");
		expect(build).toContain("ARCHIVE_PATH={ARCHIVE_RETRY_PATH}");
		// Archive-incomplete emit carries the retry path
		expect(build).toContain('archive_path: "{ARCHIVE_RETRY_PATH}"');
		expect(archiver).not.toContain('"registered|skipped"');
		expect(archiver).not.toContain("completed_without_registration");
	});

	test("release Stop and archive decline emits are separate decisions", async () => {
		const content = await readSkillSurface("plugins/dev/skills/build");
		const stopIndex = content.indexOf("On Stop: emit `release` waiting");
		const completeIndex = content.indexOf(
			"On Complete without archive: emit `release` completed",
		);

		expect(stopIndex).toBeGreaterThan(-1);
		expect(completeIndex).toBeGreaterThan(-1);
		expect(completeIndex).not.toBe(stopIndex);

		// Each path is a distinct decision with a distinct archive_status, regardless
		// of the order they appear in the two-step release gate.
		const stopLine = content.slice(stopIndex, content.indexOf("\n", stopIndex));
		const completeLine = content.slice(
			completeIndex,
			content.indexOf("\n", completeIndex),
		);
		// Stop path emits waiting with deferred, not declined
		expect(stopLine).toContain('archive_status: "deferred"');
		expect(stopLine).not.toContain('archive_status: "declined"');
		// Complete-without-archive emits completed with declined
		expect(completeLine).toContain('archive_status: "declined"');
		expect(completeLine).not.toContain('archive_status: "deferred"');
	});

	test("build docs match release gate labels and AFK archive behavior", async () => {
		const docs = await readProjectFile("docs/reference/dev/build.md");

		expect(docs).toContain(
			"Add task, Archive, Review feedback from Arcade, Complete without archive, Stop",
		);
		expect(docs).toContain("**Complete without archive**");
		expect(docs).toContain("Release defaults to archive");
		expect(docs).not.toContain("Do Not Archive");
	});
});

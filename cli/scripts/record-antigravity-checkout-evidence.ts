#!/usr/bin/env bun

import { randomUUID } from "node:crypto";
import {
	mkdir,
	mkdtemp,
	readFile,
	realpath,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const ANTIGRAVITY_CHECKOUT_EVIDENCE_SCHEMA_VERSION = 1;
export const ANTIGRAVITY_CHECKOUT_MARKDOWN_FILENAME =
	"antigravity-checkout-evidence.md";
export const ANTIGRAVITY_CHECKOUT_JSON_FILENAME =
	"antigravity-checkout-evidence.json";

export const ANTIGRAVITY_CHECKOUT_SCENARIOS = [
	"normal_checkout",
	"worktree_checkout",
	"artifact_registration_failure",
] as const;

export type AntigravityCheckoutScenario =
	(typeof ANTIGRAVITY_CHECKOUT_SCENARIOS)[number];

export type AntigravityCheckoutScenarioArg =
	| AntigravityCheckoutScenario
	| "all";

export type AntigravityCheckoutStatus = "passed" | "failed";

export interface AntigravityCheckoutRoots {
	readonly projectRoot: string;
	readonly workRoot: string;
	readonly codeRoot: string;
	readonly kbRoot?: string;
	readonly isWorktree?: boolean;
}

export interface AntigravityCommandEvidence {
	readonly command: readonly string[];
	readonly cwd: string;
	readonly exitCode: number;
	readonly output: string;
}

export interface AntigravityBootstrapEvidence {
	readonly runId: string;
	readonly projectRoot: string;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly codeRoot: string;
	readonly harness: string;
	readonly isWorktree: boolean;
}

export interface AntigravityArtifactEvidence {
	readonly path: string;
	readonly storageRoot: "work_dir";
	readonly step: string;
	readonly absolutePath: string;
	readonly registered: boolean;
}

export interface AntigravityRunStateEvidence {
	readonly status: string;
	readonly harness: string | null;
	readonly projectRoot: string;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly artifactCount: number;
	readonly recentEventTypes: readonly string[];
}

export interface AntigravityCheckoutScenarioEvidence {
	readonly scenario: AntigravityCheckoutScenario;
	readonly status: AntigravityCheckoutStatus;
	readonly requirementRefs: readonly string[];
	readonly sourceVerification: string;
	readonly automationMode: string;
	readonly bootstrap: AntigravityBootstrapEvidence;
	readonly runState: AntigravityRunStateEvidence;
	readonly artifact: AntigravityArtifactEvidence | null;
	readonly expectedFailure: {
		readonly observed: boolean;
		readonly exitCode: number;
		readonly output: string;
	} | null;
	readonly assertions: readonly string[];
	readonly commands: readonly AntigravityCommandEvidence[];
}

export interface AntigravityCheckoutEvidence {
	readonly schemaVersion: typeof ANTIGRAVITY_CHECKOUT_EVIDENCE_SCHEMA_VERSION;
	readonly featureId: string;
	readonly runId: string;
	readonly generatedAt: string;
	readonly roots: AntigravityCheckoutRoots;
	readonly selectedScenarios: readonly AntigravityCheckoutScenario[];
	readonly overallStatus: AntigravityCheckoutStatus;
	readonly scenarios: readonly AntigravityCheckoutScenarioEvidence[];
}

export interface AntigravityCheckoutWriteOptions {
	readonly featureId: string;
	readonly runId: string;
	readonly roots: AntigravityCheckoutRoots;
	readonly scenarios: readonly AntigravityCheckoutScenarioEvidence[];
	readonly now?: Date;
}

export interface AntigravityCheckoutWriteResult {
	readonly evidence: AntigravityCheckoutEvidence;
	readonly markdownPath: string;
	readonly jsonPath: string;
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
}

interface ParsedArgs {
	readonly featureId: string;
	readonly runId: string;
	readonly scenario: AntigravityCheckoutScenarioArg;
	readonly workRoot?: string;
	readonly keepTemp: boolean;
}

interface ToolEnvelope<T> {
	readonly success: boolean;
	readonly data: T;
}

interface BootstrapResult {
	readonly directories: {
		readonly projectRoot: string;
		readonly kbRoot: string;
		readonly workRoot: string;
		readonly codeRoot: string;
	};
	readonly run: {
		readonly runId: string;
	};
	readonly trace: {
		readonly harness: string;
		readonly isWorktree: boolean;
	};
}

interface WorkflowStateResult {
	readonly run: {
		readonly status: string;
		readonly harness: string | null;
		readonly rp1ProjectRoot: string;
		readonly rp1KbRoot: string;
		readonly rp1WorkRoot: string;
		readonly bootstrapContext: string | null;
	};
	readonly artifacts: readonly {
		readonly path: string;
		readonly storageRoot: string;
		readonly step: string | null;
	}[];
	readonly recent_events: readonly {
		readonly type: string;
		readonly step: string | null;
		readonly data: string | null;
	}[];
	readonly steps: readonly {
		readonly step: string;
		readonly status: string;
	}[];
}

const FEATURE_VERIFICATION_SOURCE =
	"features/antigravity/feature_verification_1.md REQ-005 blocker/manual items";
const WORKFLOW = "build-fast";
const WORKFLOW_SCHEMA_PATH = "plugins/dev/skills/build-fast/SKILL.md";
const WORKFLOW_NAME = "rp1-dev:build-fast";
const PARENT_PHASES = "plan,build,review";

const SCENARIO_REQUIREMENTS: Record<
	AntigravityCheckoutScenario,
	readonly string[]
> = {
	normal_checkout: ["REQ-005", "REQ-011", "REQ-012"],
	worktree_checkout: ["REQ-005", "REQ-011", "REQ-012"],
	artifact_registration_failure: ["REQ-005", "REQ-011", "REQ-012"],
};

const selectedScenarios = (
	scenario: AntigravityCheckoutScenarioArg,
): readonly AntigravityCheckoutScenario[] =>
	scenario === "all" ? ANTIGRAVITY_CHECKOUT_SCENARIOS : [scenario];

const validScenario = (
	value: string,
): value is AntigravityCheckoutScenarioArg =>
	value === "all" ||
	ANTIGRAVITY_CHECKOUT_SCENARIOS.includes(value as AntigravityCheckoutScenario);

const safeFeatureId = (featureId: string): string => {
	const trimmed = featureId.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
		throw new Error(
			`Invalid Antigravity checkout evidence feature id: ${featureId}`,
		);
	}
	return trimmed;
};

const normalizePath = (path: string): string => path.replaceAll("\\", "/");

const truncateOutput = (output: string): string =>
	output.length > 4000 ? `${output.slice(0, 4000)}\n[truncated]` : output;

const cleanEnv = (
	overrides: Record<string, string | undefined>,
): Record<string, string> => {
	const env: Record<string, string> = {};
	for (const [key, value] of Object.entries({ ...process.env, ...overrides })) {
		if (value !== undefined) env[key] = value;
	}
	return env;
};

const commandSummary = (
	command: readonly string[],
	cwd: string,
	exitCode: number,
	output: string,
): AntigravityCommandEvidence => ({
	command,
	cwd,
	exitCode,
	output: output.trim(),
});

const runCommand = async (
	command: readonly string[],
	cwd: string,
	env: Record<string, string | undefined> = {},
): Promise<AntigravityCommandEvidence> => {
	try {
		const proc = Bun.spawn([...command], {
			cwd,
			env: cleanEnv(env),
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		return commandSummary(command, cwd, exitCode, `${stdout}${stderr}`);
	} catch (error) {
		return commandSummary(
			command,
			cwd,
			127,
			error instanceof Error ? error.message : String(error),
		);
	}
};

const parseToolEnvelope = <T>(
	command: AntigravityCommandEvidence,
): ToolEnvelope<T> => {
	if (command.exitCode !== 0) {
		throw new Error(
			`Command failed (${command.exitCode}): ${command.command.join(" ")}\n${command.output}`,
		);
	}
	const parsed = JSON.parse(command.output) as ToolEnvelope<T>;
	if (!parsed.success) {
		throw new Error(`Tool returned failure: ${command.output}`);
	}
	return parsed;
};

const assertCondition = (
	condition: unknown,
	message: string,
	assertions: string[],
): void => {
	if (!condition) {
		throw new Error(message);
	}
	assertions.push(message);
};

const findProjectRoot = async (startDir: string): Promise<string> => {
	let current = resolve(startDir);
	while (true) {
		try {
			await readFile(join(current, "cli", "package.json"), "utf-8");
			await readFile(join(current, "Justfile"), "utf-8");
			return current;
		} catch {
			const parent = dirname(current);
			if (parent === current) {
				throw new Error(`Could not find rp1 project root from ${startDir}`);
			}
			current = parent;
		}
	}
};

const createWorkflowSkill = async (projectRoot: string): Promise<void> => {
	const skillPath = join(projectRoot, WORKFLOW_SCHEMA_PATH);
	await mkdir(dirname(skillPath), { recursive: true });
	await writeFile(
		skillPath,
		`---
name: build-fast
description: "Antigravity checkout evidence smoke workflow"
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: resumable
    identity_args:
      - FEATURE_ID
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Build Fast
`,
		"utf-8",
	);
};

const createRp1Project = async (
	projectRoot: string,
	projectId: string,
): Promise<void> => {
	await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
	await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
	await writeFile(join(projectRoot, ".rp1", "project_id"), projectId, "utf-8");
	await writeFile(
		join(projectRoot, ".rp1", "context", "index.md"),
		"# Antigravity checkout smoke KB\n",
		"utf-8",
	);
	await createWorkflowSkill(projectRoot);
};

const createCommittedWorktreeProject = async (
	tempRoot: string,
	projectId: string,
): Promise<{
	readonly mainRoot: string;
	readonly linkedRoot: string;
	readonly invocationRoot: string;
	readonly commands: readonly AntigravityCommandEvidence[];
}> => {
	const mainRoot = join(tempRoot, "canonical-main");
	const linkedRoot = join(tempRoot, "linked-worktree");
	const invocationRoot = join(linkedRoot, "nested", "dir");
	await mkdir(mainRoot, { recursive: true });
	await createRp1Project(mainRoot, projectId);

	const commands: AntigravityCommandEvidence[] = [];
	for (const command of [
		["git", "init"],
		["git", "config", "user.email", "rp1-antigravity-smoke@example.invalid"],
		["git", "config", "user.name", "rp1 antigravity smoke"],
		["git", "add", "."],
		["git", "commit", "-m", "init"],
		["git", "worktree", "add", "-b", "feature/antigravity-smoke", linkedRoot],
	] as const) {
		const result = await runCommand(command, mainRoot);
		commands.push(result);
		parseToolOrGitCommand(result);
	}
	await mkdir(invocationRoot, { recursive: true });
	return {
		mainRoot: await realpath(mainRoot).catch(() => mainRoot),
		linkedRoot: await realpath(linkedRoot).catch(() => linkedRoot),
		invocationRoot: await realpath(invocationRoot).catch(() => invocationRoot),
		commands,
	};
};

const parseToolOrGitCommand = (command: AntigravityCommandEvidence): void => {
	if (command.exitCode !== 0) {
		throw new Error(
			`Command failed (${command.exitCode}): ${command.command.join(" ")}\n${command.output}`,
		);
	}
};

const localAgentToolsCommand = (
	_cliRoot: string,
	...args: readonly string[]
): readonly string[] => ["bun", "run", "src/main.ts", "agent-tools", ...args];

const bootstrapWorkflow = async (options: {
	readonly cliRoot: string;
	readonly dbPath: string;
	readonly featureId: string;
	readonly invocationRoot: string;
}): Promise<{
	readonly command: AntigravityCommandEvidence;
	readonly data: BootstrapResult;
}> => {
	const command = await runCommand(
		localAgentToolsCommand(
			options.cliRoot,
			"workflow-bootstrap",
			"--name",
			WORKFLOW_NAME,
			"--schema-path",
			WORKFLOW_SCHEMA_PATH,
			"--args",
			options.featureId,
			"--project-root",
			options.invocationRoot,
			"--harness",
			"antigravity",
			"--include-trace",
		),
		options.cliRoot,
		{
			RP1_DB: options.dbPath,
			CURRENT_HOST: "antigravity",
		},
	);

	return {
		command,
		data: parseToolEnvelope<BootstrapResult>(command).data,
	};
};

const emit = async (options: {
	readonly cliRoot: string;
	readonly dbPath: string;
	readonly invocationRoot: string;
	readonly runId: string;
	readonly type: "status_change" | "artifact_registered";
	readonly step: string;
	readonly data: Record<string, unknown>;
	readonly closeRun?: boolean;
	readonly name?: string;
}): Promise<AntigravityCommandEvidence> => {
	const command = localAgentToolsCommand(
		options.cliRoot,
		"emit",
		"--harness",
		"antigravity",
		"--workflow",
		WORKFLOW,
		"--type",
		options.type,
		"--run-id",
		options.runId,
		"--step",
		options.step,
		"--project",
		options.invocationRoot,
		"--data",
		JSON.stringify(options.data),
		...(options.name ? ["--name", options.name] : []),
		...(options.closeRun ? ["--close-run"] : []),
	);
	const result = await runCommand(command, options.cliRoot, {
		RP1_DB: options.dbPath,
	});
	if (result.exitCode === 0) parseToolEnvelope(result);
	return result;
};

const readWorkflowState = async (options: {
	readonly cliRoot: string;
	readonly dbPath: string;
	readonly runId: string;
	readonly featureId: string;
}): Promise<{
	readonly command: AntigravityCommandEvidence;
	readonly data: WorkflowStateResult;
}> => {
	const command = await runCommand(
		localAgentToolsCommand(
			options.cliRoot,
			"workflow-state",
			"--run-id",
			options.runId,
			"--workflow",
			WORKFLOW,
			"--feature",
			options.featureId,
			"--parent-phases",
			PARENT_PHASES,
			"--recent-events",
			"25",
		),
		options.cliRoot,
		{ RP1_DB: options.dbPath },
	);
	return {
		command,
		data: parseToolEnvelope<WorkflowStateResult>(command).data,
	};
};

const runSuccessfulCheckoutScenario = async (options: {
	readonly scenario: "normal_checkout" | "worktree_checkout";
	readonly cliRoot: string;
	readonly tempRoot: string;
	readonly suffix: string;
}): Promise<AntigravityCheckoutScenarioEvidence> => {
	const dbPath = join(options.tempRoot, `${options.scenario}.db`);
	const featureId = `antigravity-${options.scenario}-${options.suffix}`;
	const projectId = `${featureId}-project`;
	const setupCommands: AntigravityCommandEvidence[] = [];
	let expectedProjectRoot: string;
	let expectedCodeRoot: string;
	let invocationRoot: string;

	if (options.scenario === "normal_checkout") {
		expectedProjectRoot = join(options.tempRoot, "normal-checkout");
		expectedCodeRoot = expectedProjectRoot;
		invocationRoot = expectedProjectRoot;
		await mkdir(expectedProjectRoot, { recursive: true });
		await createRp1Project(expectedProjectRoot, projectId);
	} else {
		const worktree = await createCommittedWorktreeProject(
			join(options.tempRoot, "worktree-checkout"),
			projectId,
		);
		setupCommands.push(...worktree.commands);
		expectedProjectRoot = worktree.mainRoot;
		expectedCodeRoot = worktree.linkedRoot;
		invocationRoot = worktree.invocationRoot;
	}

	const expectedWorkRoot = join(expectedProjectRoot, ".rp1", "work");
	const expectedKbRoot = join(expectedProjectRoot, ".rp1", "context");
	const commands: AntigravityCommandEvidence[] = [...setupCommands];
	const assertions: string[] = [];

	const bootstrap = await bootstrapWorkflow({
		cliRoot: options.cliRoot,
		dbPath,
		featureId,
		invocationRoot,
	});
	commands.push(bootstrap.command);

	const runId = bootstrap.data.run.runId;
	const artifactPath = `features/${featureId}/checkout-smoke-artifact.md`;
	const artifactAbsolutePath = join(expectedWorkRoot, artifactPath);
	await mkdir(dirname(artifactAbsolutePath), { recursive: true });
	await writeFile(
		artifactAbsolutePath,
		[
			"# Antigravity Checkout Smoke Artifact",
			"",
			`scenario: ${options.scenario}`,
			`feature_id: ${featureId}`,
			`run_id: ${runId}`,
			`project_root: ${expectedProjectRoot}`,
			`code_root: ${expectedCodeRoot}`,
			`work_root: ${expectedWorkRoot}`,
			"",
		].join("\n"),
		"utf-8",
	);

	const emits = [
		await emit({
			cliRoot: options.cliRoot,
			dbPath,
			invocationRoot,
			runId,
			type: "status_change",
			step: "plan",
			name: `Antigravity ${options.scenario} evidence smoke`,
			data: { status: "running", feature: featureId },
		}),
		await emit({
			cliRoot: options.cliRoot,
			dbPath,
			invocationRoot,
			runId,
			type: "status_change",
			step: "build",
			data: { status: "running", feature: featureId },
		}),
		await emit({
			cliRoot: options.cliRoot,
			dbPath,
			invocationRoot,
			runId,
			type: "artifact_registered",
			step: "build",
			data: {
				path: artifactPath,
				feature: featureId,
				storageRoot: "work_dir",
			},
		}),
		await emit({
			cliRoot: options.cliRoot,
			dbPath,
			invocationRoot,
			runId,
			type: "status_change",
			step: "review",
			data: { status: "running", feature: featureId },
		}),
		await emit({
			cliRoot: options.cliRoot,
			dbPath,
			invocationRoot,
			runId,
			type: "status_change",
			step: "review",
			data: { status: "completed", feature: featureId },
			closeRun: true,
		}),
	];
	commands.push(...emits);

	for (const command of emits) parseToolEnvelope(command);

	const workflowState = await readWorkflowState({
		cliRoot: options.cliRoot,
		dbPath,
		runId,
		featureId,
	});
	commands.push(workflowState.command);

	const artifact = workflowState.data.artifacts.find(
		(item) => item.path === artifactPath,
	);
	const bootstrapContext = JSON.parse(
		workflowState.data.run.bootstrapContext ?? "{}",
	) as {
		readonly directories?: { readonly codeRoot?: string };
	};

	assertCondition(
		bootstrap.data.trace.harness === "antigravity",
		"bootstrap trace records harness=antigravity",
		assertions,
	);
	assertCondition(
		bootstrap.data.directories.projectRoot === expectedProjectRoot,
		"bootstrap projectRoot matches the canonical checkout root",
		assertions,
	);
	assertCondition(
		bootstrap.data.directories.kbRoot === expectedKbRoot,
		"bootstrap kbRoot is under the canonical checkout root",
		assertions,
	);
	assertCondition(
		bootstrap.data.directories.workRoot === expectedWorkRoot,
		"bootstrap workRoot is under the canonical checkout root",
		assertions,
	);
	assertCondition(
		bootstrap.data.directories.codeRoot === expectedCodeRoot,
		"bootstrap codeRoot matches the active checkout root",
		assertions,
	);
	assertCondition(
		bootstrap.data.trace.isWorktree ===
			(options.scenario === "worktree_checkout"),
		"bootstrap worktree flag matches the invocation checkout type",
		assertions,
	);
	assertCondition(
		workflowState.data.run.harness === "antigravity",
		"workflow-state records harness=antigravity",
		assertions,
	);
	assertCondition(
		workflowState.data.run.status === "completed",
		"workflow-state reports a completed run",
		assertions,
	);
	assertCondition(
		workflowState.data.run.rp1ProjectRoot === expectedProjectRoot,
		"workflow-state run project root matches the canonical checkout root",
		assertions,
	);
	assertCondition(
		workflowState.data.run.rp1KbRoot === expectedKbRoot,
		"workflow-state run kb root matches the canonical checkout root",
		assertions,
	);
	assertCondition(
		workflowState.data.run.rp1WorkRoot === expectedWorkRoot,
		"workflow-state run work root matches the canonical checkout root",
		assertions,
	);
	assertCondition(
		bootstrapContext.directories?.codeRoot === expectedCodeRoot,
		"bootstrap context preserves the active code root",
		assertions,
	);
	assertCondition(
		artifact?.storageRoot === "work_dir",
		"artifact is registered with storageRoot=work_dir",
		assertions,
	);
	assertCondition(
		artifact?.step === "build",
		"artifact registration is attributed to the build step",
		assertions,
	);
	assertCondition(
		workflowState.data.recent_events.some(
			(event) => event.type === "artifact_registered",
		),
		"recent workflow state includes artifact_registered",
		assertions,
	);

	return {
		scenario: options.scenario,
		status: "passed",
		requirementRefs: SCENARIO_REQUIREMENTS[options.scenario],
		sourceVerification: FEATURE_VERIFICATION_SOURCE,
		automationMode:
			"local rp1 agent-tools smoke with --harness antigravity and disposable temp project",
		bootstrap: {
			runId,
			projectRoot: bootstrap.data.directories.projectRoot,
			kbRoot: bootstrap.data.directories.kbRoot,
			workRoot: bootstrap.data.directories.workRoot,
			codeRoot: bootstrap.data.directories.codeRoot,
			harness: bootstrap.data.trace.harness,
			isWorktree: bootstrap.data.trace.isWorktree,
		},
		runState: {
			status: workflowState.data.run.status,
			harness: workflowState.data.run.harness,
			projectRoot: workflowState.data.run.rp1ProjectRoot,
			kbRoot: workflowState.data.run.rp1KbRoot,
			workRoot: workflowState.data.run.rp1WorkRoot,
			artifactCount: workflowState.data.artifacts.length,
			recentEventTypes: workflowState.data.recent_events.map(
				(event) => event.type,
			),
		},
		artifact: {
			path: artifactPath,
			storageRoot: "work_dir",
			step: "build",
			absolutePath: artifactAbsolutePath,
			registered: true,
		},
		expectedFailure: null,
		assertions,
		commands,
	};
};

const runArtifactRegistrationFailureScenario = async (options: {
	readonly cliRoot: string;
	readonly tempRoot: string;
	readonly suffix: string;
}): Promise<AntigravityCheckoutScenarioEvidence> => {
	const scenario = "artifact_registration_failure";
	const dbPath = join(options.tempRoot, `${scenario}.db`);
	const featureId = `antigravity-${scenario}-${options.suffix}`;
	const projectRoot = join(options.tempRoot, "artifact-registration-failure");
	await mkdir(projectRoot, { recursive: true });
	await createRp1Project(projectRoot, `${featureId}-project`);

	const commands: AntigravityCommandEvidence[] = [];
	const assertions: string[] = [];
	const bootstrap = await bootstrapWorkflow({
		cliRoot: options.cliRoot,
		dbPath,
		featureId,
		invocationRoot: projectRoot,
	});
	commands.push(bootstrap.command);

	const runId = bootstrap.data.run.runId;
	const planEmit = await emit({
		cliRoot: options.cliRoot,
		dbPath,
		invocationRoot: projectRoot,
		runId,
		type: "status_change",
		step: "plan",
		name: "Antigravity artifact registration failure evidence smoke",
		data: { status: "running", feature: featureId },
	});
	commands.push(planEmit);
	parseToolEnvelope(planEmit);

	const buildRunningEmit = await emit({
		cliRoot: options.cliRoot,
		dbPath,
		invocationRoot: projectRoot,
		runId,
		type: "status_change",
		step: "build",
		data: { status: "running", feature: featureId },
	});
	commands.push(buildRunningEmit);
	parseToolEnvelope(buildRunningEmit);

	const failureCommand = await emit({
		cliRoot: options.cliRoot,
		dbPath,
		invocationRoot: projectRoot,
		runId,
		type: "artifact_registered",
		step: "build",
		data: {
			path: "../outside-work-root.md",
			feature: featureId,
			storageRoot: "work_dir",
		},
	});
	commands.push(failureCommand);

	const failedStatusEmit = await emit({
		cliRoot: options.cliRoot,
		dbPath,
		invocationRoot: projectRoot,
		runId,
		type: "status_change",
		step: "build",
		data: {
			status: "failed",
			feature: featureId,
			reason: "forced artifact registration failure smoke",
		},
	});
	commands.push(failedStatusEmit);
	parseToolEnvelope(failedStatusEmit);

	const workflowState = await readWorkflowState({
		cliRoot: options.cliRoot,
		dbPath,
		runId,
		featureId,
	});
	commands.push(workflowState.command);

	const failureOutput = failureCommand.output;
	assertCondition(
		failureCommand.exitCode !== 0,
		"invalid artifact registration exits non-zero",
		assertions,
	);
	assertCondition(
		failureOutput.includes("artifact_registered paths must not contain '..'"),
		"invalid artifact registration prints a recoverable validation error",
		assertions,
	);
	assertCondition(
		workflowState.data.run.harness === "antigravity",
		"workflow-state records harness=antigravity for the failure run",
		assertions,
	);
	assertCondition(
		workflowState.data.run.status === "failed",
		"workflow-state reports failed instead of false success",
		assertions,
	);
	assertCondition(
		workflowState.data.artifacts.length === 0,
		"failed artifact registration does not create an artifact record",
		assertions,
	);
	assertCondition(
		!workflowState.data.recent_events.some(
			(event) => event.type === "artifact_registered",
		),
		"recent workflow state contains no artifact_registered event for the failed registration",
		assertions,
	);

	return {
		scenario,
		status: "passed",
		requirementRefs: SCENARIO_REQUIREMENTS[scenario],
		sourceVerification: FEATURE_VERIFICATION_SOURCE,
		automationMode:
			"local rp1 agent-tools smoke with forced invalid artifact_registered payload",
		bootstrap: {
			runId,
			projectRoot: bootstrap.data.directories.projectRoot,
			kbRoot: bootstrap.data.directories.kbRoot,
			workRoot: bootstrap.data.directories.workRoot,
			codeRoot: bootstrap.data.directories.codeRoot,
			harness: bootstrap.data.trace.harness,
			isWorktree: bootstrap.data.trace.isWorktree,
		},
		runState: {
			status: workflowState.data.run.status,
			harness: workflowState.data.run.harness,
			projectRoot: workflowState.data.run.rp1ProjectRoot,
			kbRoot: workflowState.data.run.rp1KbRoot,
			workRoot: workflowState.data.run.rp1WorkRoot,
			artifactCount: workflowState.data.artifacts.length,
			recentEventTypes: workflowState.data.recent_events.map(
				(event) => event.type,
			),
		},
		artifact: null,
		expectedFailure: {
			observed: true,
			exitCode: failureCommand.exitCode,
			output: truncateOutput(failureOutput),
		},
		assertions,
		commands,
	};
};

const scenarioStatus = (
	scenario: PromiseSettledResult<AntigravityCheckoutScenarioEvidence>,
	scenarioName: AntigravityCheckoutScenario,
): AntigravityCheckoutScenarioEvidence => {
	if (scenario.status === "fulfilled") return scenario.value;
	return {
		scenario: scenarioName,
		status: "failed",
		requirementRefs: SCENARIO_REQUIREMENTS[scenarioName],
		sourceVerification: FEATURE_VERIFICATION_SOURCE,
		automationMode: "local rp1 agent-tools smoke",
		bootstrap: {
			runId: "not-created",
			projectRoot: "unknown",
			kbRoot: "unknown",
			workRoot: "unknown",
			codeRoot: "unknown",
			harness: "antigravity",
			isWorktree: scenarioName === "worktree_checkout",
		},
		runState: {
			status: "failed",
			harness: "antigravity",
			projectRoot: "unknown",
			kbRoot: "unknown",
			workRoot: "unknown",
			artifactCount: 0,
			recentEventTypes: [],
		},
		artifact: null,
		expectedFailure: {
			observed: false,
			exitCode: 1,
			output:
				scenario.reason instanceof Error
					? scenario.reason.message
					: String(scenario.reason),
		},
		assertions: [],
		commands: [],
	};
};

export const collectAntigravityCheckoutScenarioEvidence = async (options: {
	readonly cliRoot: string;
	readonly scenario: AntigravityCheckoutScenarioArg;
	readonly keepTemp: boolean;
}): Promise<readonly AntigravityCheckoutScenarioEvidence[]> => {
	const selected = selectedScenarios(options.scenario);
	const tempRoot = await mkdtemp(join(tmpdir(), "rp1-antigravity-checkouts-"));
	const suffix = randomUUID().slice(0, 8);
	try {
		const promises = selected.map((scenario) => {
			if (scenario === "normal_checkout" || scenario === "worktree_checkout") {
				return runSuccessfulCheckoutScenario({
					scenario,
					cliRoot: options.cliRoot,
					tempRoot,
					suffix,
				});
			}
			return runArtifactRegistrationFailureScenario({
				cliRoot: options.cliRoot,
				tempRoot,
				suffix,
			});
		});
		const results = await Promise.allSettled(promises);
		return results.map((result, index) =>
			scenarioStatus(result, selected[index] as AntigravityCheckoutScenario),
		);
	} finally {
		if (!options.keepTemp) {
			await rm(tempRoot, { recursive: true, force: true });
		} else {
			console.log(`Retained Antigravity checkout smoke temp root: ${tempRoot}`);
		}
	}
};

const getOverallStatus = (
	scenarios: readonly AntigravityCheckoutScenarioEvidence[],
): AntigravityCheckoutStatus =>
	scenarios.some((scenario) => scenario.status === "failed")
		? "failed"
		: "passed";

export const getAntigravityCheckoutEvidenceRelativePaths = (
	featureId: string,
): {
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
} => {
	const safeId = safeFeatureId(featureId);
	return {
		markdownRelativePath: normalizePath(
			join("features", safeId, ANTIGRAVITY_CHECKOUT_MARKDOWN_FILENAME),
		),
		jsonRelativePath: normalizePath(
			join("features", safeId, ANTIGRAVITY_CHECKOUT_JSON_FILENAME),
		),
	};
};

const cell = (value: string | number | boolean | null | undefined): string =>
	String(value ?? "none")
		.replaceAll("|", "\\|")
		.replaceAll(/\r?\n/g, " ");

const renderScenarioRows = (
	scenarios: readonly AntigravityCheckoutScenarioEvidence[],
): readonly string[] => [
	"| Scenario | Status | Requirements | Harness | Run Status | Artifact |",
	"|----------|--------|--------------|---------|------------|----------|",
	...scenarios.map(
		(scenario) =>
			`| ${cell(scenario.scenario)} | ${cell(scenario.status)} | ${cell(
				scenario.requirementRefs.join(", "),
			)} | ${cell(scenario.bootstrap.harness)} | ${cell(
				scenario.runState.status,
			)} | ${cell(scenario.artifact?.path)} |`,
	),
];

const renderScenarioDetails = (
	scenario: AntigravityCheckoutScenarioEvidence,
): readonly string[] => [
	`### ${scenario.scenario}`,
	"",
	`- status: ${scenario.status}`,
	`- source_verification: ${scenario.sourceVerification}`,
	`- automation_mode: ${scenario.automationMode}`,
	`- run_id: ${scenario.bootstrap.runId}`,
	`- project_root: ${scenario.bootstrap.projectRoot}`,
	`- kb_root: ${scenario.bootstrap.kbRoot}`,
	`- work_root: ${scenario.bootstrap.workRoot}`,
	`- code_root: ${scenario.bootstrap.codeRoot}`,
	`- is_worktree: ${scenario.bootstrap.isWorktree}`,
	`- run_status: ${scenario.runState.status}`,
	`- artifact_count: ${scenario.runState.artifactCount}`,
	...(scenario.artifact
		? [
				`- registered_artifact_path: ${scenario.artifact.path}`,
				`- registered_artifact_storage_root: ${scenario.artifact.storageRoot}`,
				`- registered_artifact_step: ${scenario.artifact.step}`,
			]
		: ["- registered_artifact_path: none"]),
	...(scenario.expectedFailure
		? [
				`- expected_failure_observed: ${scenario.expectedFailure.observed}`,
				`- expected_failure_exit_code: ${scenario.expectedFailure.exitCode}`,
			]
		: []),
	"",
	"Assertions:",
	"",
	...scenario.assertions.map((assertion) => `- ${assertion}`),
	"",
];

export const renderAntigravityCheckoutEvidenceMarkdown = (
	evidence: AntigravityCheckoutEvidence,
): string =>
	[
		"# Antigravity Checkout And Artifact Evidence",
		"",
		"## Summary",
		"",
		`- schema_version: ${evidence.schemaVersion}`,
		`- feature_id: ${evidence.featureId}`,
		`- run_id: ${evidence.runId}`,
		`- generated_at: ${evidence.generatedAt}`,
		`- source_verification: ${FEATURE_VERIFICATION_SOURCE}`,
		`- overall_status: ${evidence.overallStatus}`,
		`- evidence_project_root: ${evidence.roots.projectRoot}`,
		`- evidence_code_root: ${evidence.roots.codeRoot}`,
		`- evidence_work_root: ${evidence.roots.workRoot}`,
		`- evidence_kb_root: ${evidence.roots.kbRoot ?? "unknown"}`,
		`- evidence_is_worktree: ${evidence.roots.isWorktree ?? false}`,
		"",
		"## Scenario Status",
		"",
		...renderScenarioRows(evidence.scenarios),
		"",
		"## Reproducibility",
		"",
		"The smoke uses disposable temporary rp1 projects and a temporary `RP1_DB`, then runs local `agent-tools workflow-bootstrap`, `emit`, and `workflow-state` commands with `--harness antigravity`. It does not mutate the user's real Antigravity profile or require a live `agy` session.",
		"",
		...evidence.scenarios.flatMap(renderScenarioDetails),
		`Checkout evidence result: ${evidence.overallStatus.toUpperCase()}`,
		"",
	].join("\n");

export const writeAntigravityCheckoutEvidenceArtifacts = async (
	options: AntigravityCheckoutWriteOptions,
): Promise<AntigravityCheckoutWriteResult> => {
	const evidence: AntigravityCheckoutEvidence = {
		schemaVersion: ANTIGRAVITY_CHECKOUT_EVIDENCE_SCHEMA_VERSION,
		featureId: safeFeatureId(options.featureId),
		runId: options.runId.trim() || "manual",
		generatedAt: (options.now ?? new Date()).toISOString(),
		roots: options.roots,
		selectedScenarios: options.scenarios.map((scenario) => scenario.scenario),
		overallStatus: getOverallStatus(options.scenarios),
		scenarios: options.scenarios,
	};
	const { markdownRelativePath, jsonRelativePath } =
		getAntigravityCheckoutEvidenceRelativePaths(evidence.featureId);
	const markdownPath = join(options.roots.workRoot, markdownRelativePath);
	const jsonPath = join(options.roots.workRoot, jsonRelativePath);
	await mkdir(dirname(markdownPath), { recursive: true });
	await writeFile(
		markdownPath,
		renderAntigravityCheckoutEvidenceMarkdown(evidence),
		"utf-8",
	);
	await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");

	return {
		evidence,
		markdownPath,
		jsonPath,
		markdownRelativePath,
		jsonRelativePath,
	};
};

const resolveRoots = async (
	cliRoot: string,
	workRootOverride?: string,
): Promise<AntigravityCheckoutRoots> => {
	const result = await runCommand(
		localAgentToolsCommand(cliRoot, "rp1-root-dir"),
		cliRoot,
	);
	if (result.exitCode === 0) {
		const parsed = JSON.parse(result.output) as {
			readonly data?: Partial<AntigravityCheckoutRoots>;
		};
		if (
			typeof parsed.data?.projectRoot === "string" &&
			typeof parsed.data.workRoot === "string" &&
			typeof parsed.data.codeRoot === "string"
		) {
			return {
				projectRoot: parsed.data.projectRoot,
				workRoot: workRootOverride ?? parsed.data.workRoot,
				codeRoot: parsed.data.codeRoot,
				kbRoot: parsed.data.kbRoot,
				isWorktree: parsed.data.isWorktree,
			};
		}
	}

	const codeRoot = resolve(cliRoot, "..");
	return {
		projectRoot: codeRoot,
		workRoot: workRootOverride ?? join(codeRoot, ".rp1", "work"),
		codeRoot,
		kbRoot: join(codeRoot, ".rp1", "context"),
		isWorktree: false,
	};
};

export const parseAntigravityCheckoutEvidenceArgs = (
	argv: readonly string[],
	env: Record<string, string | undefined>,
): ParsedArgs => {
	let featureId = env.FEATURE_ID ?? "antigravity";
	let runId = env.RUN_ID ?? "manual";
	let scenario: AntigravityCheckoutScenarioArg = "all";
	let workRoot: string | undefined;
	let keepTemp = false;

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];
		const next = argv[index + 1];
		if (arg === "--feature-id" && next) {
			featureId = next;
			index += 1;
		} else if (arg === "--run-id" && next) {
			runId = next;
			index += 1;
		} else if (arg === "--scenario" && next) {
			if (!validScenario(next)) {
				throw new Error(`Invalid scenario: ${next}`);
			}
			scenario = next;
			index += 1;
		} else if (arg === "--work-root" && next) {
			workRoot = next;
			index += 1;
		} else if (arg === "--keep-temp") {
			keepTemp = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				[
					"Usage: bun run scripts/record-antigravity-checkout-evidence.ts [options]",
					"",
					"Options:",
					"  --feature-id <id>      Feature artifact id (default: antigravity)",
					"  --run-id <id>          Run id to record in evidence (default: RUN_ID or manual)",
					"  --scenario <name>      all, normal_checkout, worktree_checkout, or artifact_registration_failure",
					"  --work-root <path>     Override .rp1/work output root",
					"  --keep-temp            Keep disposable smoke projects for debugging",
				].join("\n"),
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return { featureId, runId, scenario, workRoot, keepTemp };
};

async function main(): Promise<void> {
	const args = parseAntigravityCheckoutEvidenceArgs(
		process.argv.slice(2),
		process.env,
	);
	const projectRoot = await findProjectRoot(process.cwd());
	const cliRoot = join(projectRoot, "cli");
	const roots = await resolveRoots(cliRoot, args.workRoot);
	const scenarios = await collectAntigravityCheckoutScenarioEvidence({
		cliRoot,
		scenario: args.scenario,
		keepTemp: args.keepTemp,
	});
	const result = await writeAntigravityCheckoutEvidenceArtifacts({
		featureId: args.featureId,
		runId: args.runId,
		roots,
		scenarios,
	});

	console.log("Antigravity checkout evidence artifacts written:");
	console.log(`- ${result.markdownRelativePath}`);
	console.log(`- ${result.jsonRelativePath}`);
	console.log(`Overall status: ${result.evidence.overallStatus}`);

	if (result.evidence.overallStatus === "failed") {
		console.error(
			`One or more Antigravity checkout evidence smokes failed: ${result.evidence.scenarios
				.filter((scenario) => scenario.status === "failed")
				.map((scenario) => scenario.scenario)
				.join(", ")}`,
		);
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}

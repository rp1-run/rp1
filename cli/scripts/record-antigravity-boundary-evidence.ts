#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export const ANTIGRAVITY_BOUNDARY_EVIDENCE_SCHEMA_VERSION = 1;
export const ANTIGRAVITY_BOUNDARY_MARKDOWN_FILENAME =
	"antigravity-boundaries.md";
export const ANTIGRAVITY_BOUNDARY_JSON_FILENAME = "antigravity-boundaries.json";

export const ANTIGRAVITY_BOUNDARY_SCENARIOS = [
	"permissions_trust",
	"mcp_failure",
] as const;

export type AntigravityBoundaryScenario =
	(typeof ANTIGRAVITY_BOUNDARY_SCENARIOS)[number];

export type AntigravityBoundaryScenarioArg =
	| AntigravityBoundaryScenario
	| "all";

export type AntigravityBoundaryStatus =
	| "recorded"
	| "manual_required"
	| "failed";

export type AntigravityAutomatedCheckStatus = "passed" | "warning" | "failed";

export interface AntigravityRoots {
	readonly projectRoot: string;
	readonly workRoot: string;
	readonly codeRoot: string;
	readonly kbRoot?: string;
	readonly isWorktree?: boolean;
}

export interface AntigravityTranscriptEvidence {
	readonly env: string;
	readonly path: string;
	readonly sha256: string;
	readonly bytes: number;
}

export interface AntigravityAutomatedCheck {
	readonly id: string;
	readonly status: AntigravityAutomatedCheckStatus;
	readonly evidence: string;
	readonly nextAction: string | null;
	readonly command?: readonly string[];
	readonly details?: readonly string[];
}

export interface AntigravityScenarioEvidence {
	readonly scenario: AntigravityBoundaryScenario;
	readonly status: AntigravityBoundaryStatus;
	readonly requirementRefs: readonly string[];
	readonly sourceVerification: string;
	readonly transcript: AntigravityTranscriptEvidence | null;
	readonly requiredEvidence: readonly string[];
	readonly captureSteps: readonly string[];
	readonly userVisibleNextAction: string;
}

export interface AntigravityBoundaryEvidence {
	readonly schemaVersion: typeof ANTIGRAVITY_BOUNDARY_EVIDENCE_SCHEMA_VERSION;
	readonly featureId: string;
	readonly runId: string;
	readonly generatedAt: string;
	readonly roots: AntigravityRoots;
	readonly selectedScenarios: readonly AntigravityBoundaryScenario[];
	readonly overallStatus: AntigravityBoundaryStatus;
	readonly automatedChecks: readonly AntigravityAutomatedCheck[];
	readonly scenarios: readonly AntigravityScenarioEvidence[];
	readonly manualEvidencePolicy: {
		readonly requireLiveEnv: "RP1_ANTIGRAVITY_REQUIRE_LIVE";
		readonly permissionsTranscriptEnv: "RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT";
		readonly mcpTranscriptEnv: "RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT";
	};
}

export interface AntigravityBoundaryWriteOptions {
	readonly featureId: string;
	readonly runId: string;
	readonly roots: AntigravityRoots;
	readonly scenario: AntigravityBoundaryScenarioArg;
	readonly env?: Record<string, string | undefined>;
	readonly now?: Date;
	readonly automatedChecks?: readonly AntigravityAutomatedCheck[];
}

export interface AntigravityBoundaryWriteResult {
	readonly evidence: AntigravityBoundaryEvidence;
	readonly markdownPath: string;
	readonly jsonPath: string;
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
}

interface ParsedArgs {
	readonly featureId: string;
	readonly runId: string;
	readonly scenario: AntigravityBoundaryScenarioArg;
	readonly workRoot?: string;
	readonly requireLive: boolean;
}

const TRANSCRIPT_ENV_BY_SCENARIO: Record<
	AntigravityBoundaryScenario,
	keyof AntigravityBoundaryEvidence["manualEvidencePolicy"]
> = {
	permissions_trust: "permissionsTranscriptEnv",
	mcp_failure: "mcpTranscriptEnv",
};

const FEATURE_VERIFICATION_SOURCE =
	"features/antigravity/feature_verification_1.md blocker 4/manual items";

const SCENARIO_REQUIREMENTS: Record<
	AntigravityBoundaryScenario,
	readonly string[]
> = {
	permissions_trust: ["REQ-007", "REQ-011", "REQ-012"],
	mcp_failure: ["REQ-008", "REQ-011", "REQ-012"],
};

const MANUAL_EVIDENCE_POLICY = {
	requireLiveEnv: "RP1_ANTIGRAVITY_REQUIRE_LIVE",
	permissionsTranscriptEnv: "RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT",
	mcpTranscriptEnv: "RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT",
} as const;

const SCENARIO_REQUIRED_EVIDENCE: Record<
	AntigravityBoundaryScenario,
	readonly string[]
> = {
	permissions_trust: [
		"Command transcript or screenshot showing the Antigravity workspace trust, tool approval, sandbox, or no-prompt outcome.",
		"The visible next action printed by Antigravity or rp1 when trust or approval blocks the workflow.",
		"The checkout path, whether the session used --print, --prompt-interactive, or --sandbox, and whether the workspace was already trusted.",
	],
	mcp_failure: [
		"Command transcript showing an unavailable or deliberately misconfigured Antigravity MCP dependency.",
		"The user-visible failure text and remediation path without claiming MCP support is automatic.",
		"The disposable MCP configuration or package copy used to avoid mutating the user's real Antigravity profile.",
	],
};

const SCENARIO_CAPTURE_STEPS: Record<
	AntigravityBoundaryScenario,
	readonly string[]
> = {
	permissions_trust: [
		"Build and install local Antigravity assets with `just build-antigravity` and `RP1_ANTIGRAVITY_BUNDLE_DIR=dist/antigravity ./bin/rp1 install antigravity`.",
		"From the intended checkout, run a read-only Antigravity session that needs workspace file access or a harmless tool approval; do not approve destructive actions.",
		"Save the transcript to `/tmp/rp1-antigravity-permissions-trust.txt`.",
		"Rerun `RP1_ANTIGRAVITY_PERMISSIONS_TRUST_TRANSCRIPT=/tmp/rp1-antigravity-permissions-trust.txt just antigravity-smoke-permissions-trust`.",
	],
	mcp_failure: [
		"Use a disposable Antigravity profile or copied generated package; do not edit the user's real profile for a failure smoke.",
		"Configure or invoke a workflow dependency against an intentionally missing MCP server or command.",
		"Capture the Antigravity output showing the missing MCP server, disabled MCP access, or remediation path.",
		"Save the transcript to `/tmp/rp1-antigravity-mcp-failure.txt`.",
		"Rerun `RP1_ANTIGRAVITY_MCP_FAILURE_TRANSCRIPT=/tmp/rp1-antigravity-mcp-failure.txt just antigravity-smoke-mcp-failure`.",
	],
};

const SCENARIO_NEXT_ACTION: Record<AntigravityBoundaryScenario, string> = {
	permissions_trust:
		"Record the trust or approval transcript, then keep the workflow limited until the user action and resume behavior are explicit.",
	mcp_failure:
		"Record the MCP failure transcript from a disposable setup, then keep MCP-dependent workflows limited until remediation is proven.",
};

const validScenario = (
	value: string,
): value is AntigravityBoundaryScenarioArg =>
	value === "all" ||
	ANTIGRAVITY_BOUNDARY_SCENARIOS.includes(value as AntigravityBoundaryScenario);

const selectedScenarios = (
	scenario: AntigravityBoundaryScenarioArg,
): readonly AntigravityBoundaryScenario[] =>
	scenario === "all" ? ANTIGRAVITY_BOUNDARY_SCENARIOS : [scenario];

const safeFeatureId = (featureId: string): string => {
	const trimmed = featureId.trim();
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(trimmed)) {
		throw new Error(
			`Invalid Antigravity boundary evidence feature id: ${featureId}`,
		);
	}
	return trimmed;
};

export const getAntigravityBoundaryEvidenceRelativePaths = (
	featureId: string,
): {
	readonly markdownRelativePath: string;
	readonly jsonRelativePath: string;
} => {
	const safeId = safeFeatureId(featureId);
	return {
		markdownRelativePath: join(
			"features",
			safeId,
			ANTIGRAVITY_BOUNDARY_MARKDOWN_FILENAME,
		),
		jsonRelativePath: join(
			"features",
			safeId,
			ANTIGRAVITY_BOUNDARY_JSON_FILENAME,
		),
	};
};

const normalizeRelativePath = (path: string): string =>
	path.replaceAll("\\", "/");

const pathExists = async (path: string): Promise<boolean> => {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
};

const findProjectRoot = async (startDir: string): Promise<string> => {
	let current = resolve(startDir);

	while (true) {
		if (
			(await pathExists(join(current, "cli"))) &&
			(await pathExists(join(current, "docs")))
		) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Could not find project root from ${startDir}`);
		}
		current = parent;
	}
};

const runCommand = async (
	command: readonly string[],
	cwd?: string,
): Promise<{ readonly exitCode: number; readonly output: string }> => {
	try {
		const proc = Bun.spawn([...command], {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		return { exitCode, output: `${stdout}${stderr}`.trim() };
	} catch (error) {
		return {
			exitCode: 127,
			output: error instanceof Error ? error.message : String(error),
		};
	}
};

const resolveRoots = async (
	cwd: string,
	workRootOverride?: string,
): Promise<AntigravityRoots> => {
	const rootResult = await runCommand(
		["rp1", "agent-tools", "rp1-root-dir"],
		cwd,
	);
	if (rootResult.exitCode === 0) {
		const parsed = JSON.parse(rootResult.output) as {
			readonly data?: Partial<AntigravityRoots>;
		};
		if (
			typeof parsed.data?.projectRoot === "string" &&
			typeof parsed.data.workRoot === "string"
		) {
			return {
				projectRoot: parsed.data.projectRoot,
				workRoot: workRootOverride ?? parsed.data.workRoot,
				codeRoot: parsed.data.codeRoot ?? parsed.data.projectRoot,
				kbRoot: parsed.data.kbRoot,
				isWorktree: parsed.data.isWorktree,
			};
		}
	}

	const projectRoot = await findProjectRoot(cwd);
	return {
		projectRoot,
		workRoot: workRootOverride ?? join(projectRoot, ".rp1", "work"),
		codeRoot: projectRoot,
		kbRoot: join(projectRoot, ".rp1", "context"),
		isWorktree: false,
	};
};

const collectFilesNamed = async (
	root: string,
	fileName: string,
): Promise<readonly string[]> => {
	if (!(await pathExists(root))) return [];

	const entries = await readdir(root, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = join(root, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await collectFilesNamed(entryPath, fileName)));
		} else if (entry.isFile() && entry.name === fileName) {
			files.push(entryPath);
		}
	}
	return files.sort();
};

const readTranscript = async (
	env: Record<string, string | undefined>,
	envName: string,
): Promise<AntigravityTranscriptEvidence | null> => {
	const transcriptPath = env[envName];
	if (!transcriptPath) return null;

	const content = await readFile(transcriptPath);
	return {
		env: envName,
		path: transcriptPath,
		sha256: createHash("sha256").update(content).digest("hex"),
		bytes: content.byteLength,
	};
};

const createScenarioEvidence = async (
	scenario: AntigravityBoundaryScenario,
	env: Record<string, string | undefined>,
): Promise<AntigravityScenarioEvidence> => {
	const envName = MANUAL_EVIDENCE_POLICY[TRANSCRIPT_ENV_BY_SCENARIO[scenario]];
	const transcript = await readTranscript(env, envName);

	return {
		scenario,
		status: transcript ? "recorded" : "manual_required",
		requirementRefs: SCENARIO_REQUIREMENTS[scenario],
		sourceVerification: FEATURE_VERIFICATION_SOURCE,
		transcript,
		requiredEvidence: transcript ? [] : SCENARIO_REQUIRED_EVIDENCE[scenario],
		captureSteps: SCENARIO_CAPTURE_STEPS[scenario],
		userVisibleNextAction: transcript
			? "Review the recorded transcript hash and confirm it shows the expected Antigravity next action."
			: SCENARIO_NEXT_ACTION[scenario],
	};
};

const statusSeverity: Record<AntigravityBoundaryStatus, number> = {
	recorded: 0,
	manual_required: 1,
	failed: 2,
};

const overallStatusFor = (
	scenarios: readonly AntigravityScenarioEvidence[],
): AntigravityBoundaryStatus =>
	scenarios.reduce<AntigravityBoundaryStatus>(
		(current, scenario) =>
			statusSeverity[scenario.status] > statusSeverity[current]
				? scenario.status
				: current,
		"recorded",
	);

const checkAgyVersion = async (): Promise<AntigravityAutomatedCheck> => {
	const result = await runCommand(["agy", "--version"]);
	if (result.exitCode !== 0) {
		return {
			id: "agy-version",
			status: "warning",
			command: ["agy", "--version"],
			evidence:
				"Antigravity CLI was not available for safe local version capture.",
			nextAction:
				"Install Antigravity CLI before recording live permission, trust, sandbox, headless, or MCP evidence.",
			details: [result.output],
		};
	}

	return {
		id: "agy-version",
		status: "passed",
		command: ["agy", "--version"],
		evidence: `Antigravity CLI version: ${result.output}`,
		nextAction: null,
	};
};

const checkAgyHelpFlags = async (): Promise<AntigravityAutomatedCheck> => {
	const result = await runCommand(["agy", "--help"]);
	const requiredFlags = [
		"--print",
		"--prompt-interactive",
		"--sandbox",
		"--dangerously-skip-permissions",
	];
	const missingFlags = requiredFlags.filter(
		(flag) => !result.output.includes(flag),
	);

	return {
		id: "agy-boundary-flags",
		status:
			result.exitCode === 0 && missingFlags.length === 0 ? "passed" : "warning",
		command: ["agy", "--help"],
		evidence:
			result.exitCode === 0
				? `Observed Antigravity boundary flags: ${requiredFlags
						.filter((flag) => !missingFlags.includes(flag))
						.join(", ")}`
				: "Could not inspect Antigravity CLI help.",
		nextAction:
			missingFlags.length === 0
				? null
				: `Confirm local Antigravity CLI supports: ${missingFlags.join(", ")}`,
		details:
			missingFlags.length > 0
				? [`Missing flags: ${missingFlags.join(", ")}`]
				: undefined,
	};
};

const checkGeneratedMcpConfigs = async (
	roots: AntigravityRoots,
): Promise<AntigravityAutomatedCheck> => {
	const distRoot = join(roots.codeRoot, "dist", "antigravity");
	const files = await collectFilesNamed(distRoot, "mcp_config.json");

	if (files.length === 0) {
		return {
			id: "generated-mcp-config",
			status: "warning",
			evidence: `No generated mcp_config.json files found under ${normalizeRelativePath(
				relative(roots.codeRoot, distRoot),
			)}.`,
			nextAction:
				"Run `just build-antigravity`, then rerun the boundary evidence recipe.",
		};
	}

	const details: string[] = [];
	let parseFailure = false;
	for (const file of files) {
		try {
			const parsed = JSON.parse(await readFile(file, "utf-8")) as {
				readonly mcpServers?: unknown;
			};
			const hasServersObject =
				typeof parsed.mcpServers === "object" &&
				parsed.mcpServers !== null &&
				!Array.isArray(parsed.mcpServers);
			if (!hasServersObject) parseFailure = true;
			details.push(
				`${normalizeRelativePath(relative(roots.codeRoot, file))}: mcpServers=${hasServersObject ? "object" : "missing"}`,
			);
		} catch (error) {
			parseFailure = true;
			details.push(
				`${normalizeRelativePath(relative(roots.codeRoot, file))}: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		}
	}

	return {
		id: "generated-mcp-config",
		status: parseFailure ? "failed" : "passed",
		evidence: `Inspected ${files.length} generated Antigravity MCP config file(s).`,
		nextAction: parseFailure
			? "Fix generated Antigravity MCP config JSON before recording live MCP failure evidence."
			: null,
		details,
	};
};

const checkSupportMetadataBoundaries = async (
	roots: AntigravityRoots,
): Promise<AntigravityAutomatedCheck> => {
	const distRoot = join(roots.codeRoot, "dist", "antigravity");
	const files = await collectFilesNamed(distRoot, "support-metadata.json");
	const requiredModes = ["permissions", "trust", "sandbox", "headless", "mcp"];

	if (files.length === 0) {
		return {
			id: "support-metadata-boundaries",
			status: "warning",
			evidence: "No generated support-metadata.json files were found.",
			nextAction:
				"Run `just build-antigravity`, then rerun the boundary evidence recipe.",
		};
	}

	const details: string[] = [];
	let missing = false;
	for (const file of files) {
		const parsed = JSON.parse(await readFile(file, "utf-8")) as {
			readonly runtime?: { readonly unsupportedModes?: readonly string[] };
		};
		const unsupportedModes = parsed.runtime?.unsupportedModes ?? [];
		const missingModes = requiredModes.filter(
			(mode) => !unsupportedModes.includes(mode),
		);
		if (missingModes.length > 0) missing = true;
		details.push(
			`${normalizeRelativePath(relative(roots.codeRoot, file))}: ${
				missingModes.length === 0
					? "all boundary modes present"
					: `missing ${missingModes.join(", ")}`
			}`,
		);
	}

	return {
		id: "support-metadata-boundaries",
		status: missing ? "failed" : "passed",
		evidence:
			"Generated Antigravity support metadata marks permission, trust, sandbox, headless, and MCP modes as explicit support boundaries.",
		nextAction: missing
			? "Regenerate or repair support metadata before release verification."
			: null,
		details,
	};
};

export const collectAntigravityAutomatedBoundaryChecks = async (
	roots: AntigravityRoots,
): Promise<readonly AntigravityAutomatedCheck[]> =>
	Promise.all([
		checkAgyVersion(),
		checkAgyHelpFlags(),
		checkGeneratedMcpConfigs(roots),
		checkSupportMetadataBoundaries(roots),
	]);

export const createAntigravityBoundaryEvidence = async (
	options: AntigravityBoundaryWriteOptions,
): Promise<AntigravityBoundaryEvidence> => {
	const selected = selectedScenarios(options.scenario);
	const env = options.env ?? process.env;
	const scenarios = await Promise.all(
		selected.map((scenario) => createScenarioEvidence(scenario, env)),
	);
	const automatedChecks =
		options.automatedChecks ??
		(await collectAntigravityAutomatedBoundaryChecks(options.roots));
	const failedAutomatedCheck = automatedChecks.some(
		(check) => check.status === "failed",
	);

	return {
		schemaVersion: ANTIGRAVITY_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
		featureId: safeFeatureId(options.featureId),
		runId: options.runId.trim() || "manual",
		generatedAt: (options.now ?? new Date()).toISOString(),
		roots: options.roots,
		selectedScenarios: selected,
		overallStatus: failedAutomatedCheck
			? "failed"
			: overallStatusFor(scenarios),
		automatedChecks,
		scenarios,
		manualEvidencePolicy: MANUAL_EVIDENCE_POLICY,
	};
};

const cell = (value: string | number | boolean | null | undefined): string =>
	String(value ?? "none")
		.replaceAll("|", "\\|")
		.replaceAll(/\r?\n/g, " ");

const renderAutomatedCheckRows = (
	checks: readonly AntigravityAutomatedCheck[],
): readonly string[] => [
	"| Check | Status | Evidence | Next Action |",
	"|-------|--------|----------|-------------|",
	...checks.map(
		(check) =>
			`| ${cell(check.id)} | ${cell(check.status)} | ${cell(
				check.evidence,
			)} | ${cell(check.nextAction)} |`,
	),
];

const renderScenarioRows = (
	scenarios: readonly AntigravityScenarioEvidence[],
): readonly string[] => [
	"| Scenario | Status | Requirements | Transcript | Next Action |",
	"|----------|--------|--------------|------------|-------------|",
	...scenarios.map(
		(scenario) =>
			`| ${cell(scenario.scenario)} | ${cell(scenario.status)} | ${cell(
				scenario.requirementRefs.join(", "),
			)} | ${cell(scenario.transcript?.path)} | ${cell(
				scenario.userVisibleNextAction,
			)} |`,
	),
];

const renderScenarioDetails = (
	scenario: AntigravityScenarioEvidence,
): readonly string[] => [
	`### ${scenario.scenario}`,
	"",
	`- status: ${scenario.status}`,
	`- source_verification: ${scenario.sourceVerification}`,
	`- transcript_env: ${
		MANUAL_EVIDENCE_POLICY[TRANSCRIPT_ENV_BY_SCENARIO[scenario.scenario]]
	}`,
	...(scenario.transcript
		? [
				`- transcript_path: ${scenario.transcript.path}`,
				`- transcript_sha256: ${scenario.transcript.sha256}`,
				`- transcript_bytes: ${scenario.transcript.bytes}`,
			]
		: ["- transcript_path: none"]),
	"",
	"Required evidence:",
	"",
	...(scenario.requiredEvidence.length > 0
		? scenario.requiredEvidence.map((item) => `- ${item}`)
		: [
				"- Recorded transcript hash is present; reviewer should inspect the transcript content for the visible Antigravity outcome.",
			]),
	"",
	"Capture steps:",
	"",
	...scenario.captureSteps.map((item) => `- ${item}`),
	"",
];

export const renderAntigravityBoundaryEvidenceMarkdown = (
	evidence: AntigravityBoundaryEvidence,
): string =>
	[
		"# Antigravity Boundary Evidence",
		"",
		"## Summary",
		"",
		`- schema_version: ${evidence.schemaVersion}`,
		`- feature_id: ${evidence.featureId}`,
		`- run_id: ${evidence.runId}`,
		`- generated_at: ${evidence.generatedAt}`,
		`- source_verification: ${FEATURE_VERIFICATION_SOURCE}`,
		`- overall_status: ${evidence.overallStatus}`,
		`- project_root: ${evidence.roots.projectRoot}`,
		`- code_root: ${evidence.roots.codeRoot}`,
		`- work_root: ${evidence.roots.workRoot}`,
		`- kb_root: ${evidence.roots.kbRoot ?? "unknown"}`,
		`- is_worktree: ${evidence.roots.isWorktree ?? false}`,
		"",
		"## Automated Checks",
		"",
		...renderAutomatedCheckRows(evidence.automatedChecks),
		"",
		"## Scenario Status",
		"",
		...renderScenarioRows(evidence.scenarios),
		"",
		"## Manual Capture Guidance",
		"",
		"Set `RP1_ANTIGRAVITY_REQUIRE_LIVE=1` to make missing live transcripts fail the recipe. Without that flag, the recipe writes this artifact and exits successfully so release verification has a concrete checklist instead of a vague manual note.",
		"",
		...evidence.scenarios.flatMap(renderScenarioDetails),
		`Boundary result: ${evidence.overallStatus.toUpperCase()}`,
		"",
	].join("\n");

export const writeAntigravityBoundaryEvidenceArtifacts = async (
	options: AntigravityBoundaryWriteOptions,
): Promise<AntigravityBoundaryWriteResult> => {
	const evidence = await createAntigravityBoundaryEvidence(options);
	const { markdownRelativePath, jsonRelativePath } =
		getAntigravityBoundaryEvidenceRelativePaths(evidence.featureId);
	const markdownPath = join(options.roots.workRoot, markdownRelativePath);
	const jsonPath = join(options.roots.workRoot, jsonRelativePath);
	await mkdir(dirname(markdownPath), { recursive: true });
	await writeFile(
		markdownPath,
		renderAntigravityBoundaryEvidenceMarkdown(evidence),
		"utf-8",
	);
	await writeFile(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf-8");

	return {
		evidence,
		markdownPath,
		jsonPath,
		markdownRelativePath: normalizeRelativePath(markdownRelativePath),
		jsonRelativePath: normalizeRelativePath(jsonRelativePath),
	};
};

export const parseAntigravityBoundaryEvidenceArgs = (
	argv: readonly string[],
	env: Record<string, string | undefined>,
): ParsedArgs => {
	let featureId = env.FEATURE_ID ?? "antigravity";
	let runId = env.RUN_ID ?? "manual";
	let scenario: AntigravityBoundaryScenarioArg = "all";
	let workRoot: string | undefined;
	let requireLive = env.RP1_ANTIGRAVITY_REQUIRE_LIVE === "1";

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
		} else if (arg === "--require-live") {
			requireLive = true;
		} else if (arg === "--help" || arg === "-h") {
			console.log(
				[
					"Usage: bun run scripts/record-antigravity-boundary-evidence.ts [options]",
					"",
					"Options:",
					"  --feature-id <id>      Feature artifact id (default: antigravity)",
					"  --run-id <id>          Run id to record in evidence (default: RUN_ID or manual)",
					"  --scenario <name>      all, permissions_trust, or mcp_failure",
					"  --work-root <path>     Override .rp1/work output root",
					"  --require-live         Fail when selected live transcripts are missing",
				].join("\n"),
			);
			process.exit(0);
		} else {
			throw new Error(`Unknown argument: ${arg}`);
		}
	}

	return { featureId, runId, scenario, workRoot, requireLive };
};

async function main(): Promise<void> {
	const args = parseAntigravityBoundaryEvidenceArgs(
		process.argv.slice(2),
		process.env,
	);
	const roots = await resolveRoots(process.cwd(), args.workRoot);
	const result = await writeAntigravityBoundaryEvidenceArtifacts({
		featureId: args.featureId,
		runId: args.runId,
		scenario: args.scenario,
		roots,
		env: process.env,
	});

	console.log("Antigravity boundary evidence artifacts written:");
	console.log(`- ${result.markdownRelativePath}`);
	console.log(`- ${result.jsonRelativePath}`);
	console.log(`Overall status: ${result.evidence.overallStatus}`);

	const missingLive = result.evidence.scenarios.some(
		(scenario) => scenario.status === "manual_required",
	);
	if (args.requireLive && missingLive) {
		console.error(
			"Live Antigravity transcript evidence is required but one or more selected scenarios are still manual_required.",
		);
		process.exit(1);
	}

	const failedAutomated = result.evidence.automatedChecks.filter(
		(check) => check.status === "failed",
	);
	if (failedAutomated.length > 0) {
		console.error(
			`Automated Antigravity boundary check failed: ${failedAutomated
				.map((check) => check.id)
				.join(", ")}`,
		);
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}

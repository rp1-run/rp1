import { readFile as readTextFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { resolveRp1Root } from "../../agent-tools/rp1-root-dir/resolver.js";
import {
	GEMINI_ASSET_MANIFEST,
	GEMINI_BOUNDARY_MODES,
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_STATES,
	GEMINI_BOUNDARY_STATUSES,
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
	GEMINI_SUBAGENT_COMMAND_INVOCATION,
	type GeminiAssetFreshnessStatus,
	type GeminiAssetLifecycleStatus,
	type GeminiBoundaryEvidence,
	type GeminiBoundaryScenarioEvidence,
	type GeminiBoundaryStatus,
	type GeminiDelegationEvidence,
	type GeminiDelegationEvidenceStatus,
	type GeminiLifecycleStage,
	type GeminiLifecycleState,
	type GeminiLifecycleStatus,
	type GeminiVerifyDeps,
	type GeminiWorkflowSupportClassification,
	getGeminiBoundaryEvidenceRelativePaths,
	getGeminiSmokeStatusDetail,
	getGeminiSubagentEvidenceRelativePaths,
	verifyGeminiSmokeSetup,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

export interface GeminiVerifyOptions {
	readonly featureId?: string;
}

export interface GeminiVerifyDelegationDeps {
	readonly workRoot?: string;
	readonly readFile?: (path: string) => Promise<string>;
	readonly resolveWorkRoot?: () => Promise<string | null>;
}

export interface GeminiVerifyLifecycleDeps {
	readonly homeDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
}

interface GeminiDelegationReadiness {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly evidence: GeminiDelegationEvidence | null;
	readonly evidencePath: string | null;
	readonly issue: string | null;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
}

interface GeminiBoundaryReadiness {
	readonly status: GeminiBoundaryStatus;
	readonly evidence: GeminiBoundaryEvidence | null;
	readonly evidencePath: string | null;
	readonly issue: string | null;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasStringValue = (
	values: readonly string[],
	value: unknown,
): value is string => typeof value === "string" && values.includes(value);

const isDelegationEvidenceStatus = (
	value: unknown,
): value is GeminiDelegationEvidenceStatus =>
	value === "passed" ||
	value === "failed" ||
	value === "blocked" ||
	value === "incomplete" ||
	value === "not_run";

const isWorkflowClassification = (
	value: unknown,
): value is GeminiWorkflowSupportClassification =>
	isRecord(value) &&
	typeof value.workflowClass === "string" &&
	(value.status === "experimental" ||
		value.status === "blocked" ||
		value.status === "unsupported") &&
	typeof value.reason === "string";

const isBoundaryStatus = (value: unknown): value is GeminiBoundaryStatus =>
	hasStringValue(GEMINI_BOUNDARY_STATUSES, value);

const isBoundaryScenarioEvidence = (
	value: unknown,
): value is GeminiBoundaryScenarioEvidence =>
	isRecord(value) &&
	hasStringValue(GEMINI_BOUNDARY_SCENARIOS, value.scenario) &&
	hasStringValue(GEMINI_BOUNDARY_MODES, value.mode) &&
	isBoundaryStatus(value.status) &&
	hasStringValue(GEMINI_BOUNDARY_STATES, value.state) &&
	(typeof value.blocker === "string" || value.blocker === null) &&
	(typeof value.userAction === "string" || value.userAction === null) &&
	typeof value.resumeSupported === "boolean" &&
	Array.isArray(value.workflowClasses) &&
	value.workflowClasses.every(isWorkflowClassification) &&
	(typeof value.evidenceArtifactPath === "string" ||
		value.evidenceArtifactPath === null);

const isGeminiBoundaryEvidence = (
	value: unknown,
): value is GeminiBoundaryEvidence =>
	isRecord(value) &&
	typeof value.schemaVersion === "number" &&
	typeof value.featureId === "string" &&
	typeof value.runId === "string" &&
	typeof value.geminiVersion === "string" &&
	typeof value.runContext === "string" &&
	Array.isArray(value.scenarios) &&
	value.scenarios.every(isBoundaryScenarioEvidence) &&
	isBoundaryStatus(value.overallStatus) &&
	Array.isArray(value.workflowClasses) &&
	value.workflowClasses.every(isWorkflowClassification);

const isGeminiDelegationEvidence = (
	value: unknown,
): value is GeminiDelegationEvidence =>
	isRecord(value) &&
	typeof value.featureId === "string" &&
	typeof value.runId === "string" &&
	typeof value.geminiVersion === "string" &&
	isDelegationEvidenceStatus(value.overallStatus) &&
	isRecord(value.customSubagent) &&
	isDelegationEvidenceStatus(value.customSubagent.status) &&
	isRecord(value.fanout) &&
	isDelegationEvidenceStatus(value.fanout.status) &&
	isRecord(value.failureHandling) &&
	isDelegationEvidenceStatus(value.failureHandling.status) &&
	isRecord(value.acknowledgement) &&
	isDelegationEvidenceStatus(value.acknowledgement.status) &&
	Array.isArray(value.workflowClasses) &&
	value.workflowClasses.length > 0 &&
	value.workflowClasses.every(isWorkflowClassification);

const defaultResolveWorkRoot = async (): Promise<string | null> => {
	const result = await resolveRp1Root()();
	if (E.isLeft(result)) return null;
	return result.right.workRoot;
};

const defaultReadFile = (path: string): Promise<string> =>
	readTextFile(path, "utf-8");

const defaultReadAssetFile = defaultReadFile;

const missingEvidenceReadiness = (
	issue: string,
	evidencePath: string | null = null,
): GeminiDelegationReadiness => ({
	status: "not_run",
	evidence: null,
	evidencePath,
	issue,
	workflowClasses: GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
});

const blockedClassificationsFor = (
	status: GeminiDelegationEvidenceStatus,
	reason: string,
	evidencePath: string | null,
): readonly GeminiWorkflowSupportClassification[] =>
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS.map((classification) => ({
		...classification,
		reason,
		evidenceArtifactPath: evidencePath ?? classification.evidenceArtifactPath,
		evidenceStatus: status,
	}));

const missingBoundaryReadiness = (
	issue: string,
	evidencePath: string | null = null,
): GeminiBoundaryReadiness => ({
	status: "not_run",
	evidence: null,
	evidencePath,
	issue,
	workflowClasses: GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
});

const isPermissionError = (error: unknown): boolean =>
	isRecord(error) && (error.code === "EACCES" || error.code === "EPERM");

const readManifestAssetStatus = async (
	asset: (typeof GEMINI_ASSET_MANIFEST)[number],
	deps: GeminiVerifyLifecycleDeps,
): Promise<GeminiAssetLifecycleStatus> => {
	const homeDir = deps.homeDir ?? process.env.HOME ?? homedir();
	const assetPath = join(homeDir, asset.relativePath);
	const readAssetFile = deps.readAssetFile ?? defaultReadAssetFile;

	try {
		const actualContent = await readAssetFile(assetPath);
		if (actualContent === asset.expectedContent) {
			return {
				asset,
				freshness: "current",
				issue: null,
				remediation: null,
			};
		}

		return {
			asset,
			freshness: "stale",
			issue: `Gemini asset is stale: ${asset.displayPath}.`,
			remediation:
				"Run `rp1 install gemini` to refresh manifest-owned Gemini validation assets.",
		};
	} catch (error) {
		if (isPermissionError(error)) {
			return {
				asset,
				freshness: "unknown",
				issue: `Gemini asset could not be read: ${asset.displayPath}.`,
				remediation:
					"Check file permissions for the Gemini extension directory, then rerun `rp1 verify gemini`.",
			};
		}

		return {
			asset,
			freshness: "missing",
			issue: `Gemini asset is missing: ${asset.displayPath}.`,
			remediation:
				"Run `rp1 install gemini` to install manifest-owned Gemini validation assets.",
		};
	}
};

const lifecycleStateFor = (
	assets: readonly GeminiAssetLifecycleStatus[],
): GeminiLifecycleState => {
	const count = (freshness: GeminiAssetFreshnessStatus): number =>
		assets.filter((asset) => asset.freshness === freshness).length;
	const missing = count("missing");
	const stale = count("stale");
	const unknown = count("unknown");
	const current = count("current");

	if (unknown > 0) return "blocked";
	if (stale > 0) return "stale";
	if (current === assets.length) return "current";
	if (missing === assets.length) return "removed";
	if (missing > 1) return "partial";
	if (missing === 1) return "missing";
	return "blocked";
};

const lifecycleMessageFor = (
	state: GeminiLifecycleState,
): Pick<GeminiLifecycleStatus, "issue" | "userAction"> => {
	switch (state) {
		case "current":
			return {
				issue: null,
				userAction:
					"Run Gemini validation commands only from trusted workspaces; Gemini may still require shell approval or project acknowledgement.",
			};
		case "removed":
			return {
				issue: "No rp1-owned Gemini extension assets are installed.",
				userAction:
					"Run `rp1 install gemini` before using the experimental Gemini validation commands.",
			};
		case "missing":
			return {
				issue: "A manifest-owned Gemini extension asset is missing.",
				userAction:
					"Run `rp1 install gemini` to restore the missing validation asset.",
			};
		case "partial":
			return {
				issue: "Only part of the rp1 Gemini extension manifest is installed.",
				userAction:
					"Run `rp1 install gemini` to reinstall the complete manifest-owned validation asset set.",
			};
		case "stale":
			return {
				issue:
					"One or more rp1 Gemini extension assets do not match the current manifest.",
				userAction:
					"Run `rp1 install gemini` to refresh stale manifest-owned validation assets.",
			};
		case "blocked":
			return {
				issue: "rp1 could not read one or more Gemini extension assets.",
				userAction:
					"Fix local file permissions or trust/approval blockers, then rerun `rp1 verify gemini`.",
			};
		case "unsupported_before_p3":
			return {
				issue: "Gemini lifecycle verification was unsupported before P3.",
				userAction:
					"Use a P3-capable rp1 build for manifest-backed Gemini lifecycle checks.",
			};
	}
};

const loadGeminiManifestLifecycle = async (
	deps: GeminiVerifyLifecycleDeps = {},
): Promise<GeminiLifecycleStatus> => {
	const stage: GeminiLifecycleStage = "verify";
	const assets = await Promise.all(
		GEMINI_ASSET_MANIFEST.filter((asset) =>
			asset.lifecycleStages.includes(stage),
		).map((asset) => readManifestAssetStatus(asset, deps)),
	);
	const state = lifecycleStateFor(assets);
	const message = lifecycleMessageFor(state);

	return {
		stage,
		state,
		assets,
		issue: message.issue,
		userAction: message.userAction,
	};
};

const loadGeminiDelegationReadiness = async (
	options: GeminiVerifyOptions,
	deps: GeminiVerifyDelegationDeps = {},
): Promise<GeminiDelegationReadiness> => {
	const featureId = options.featureId?.trim();
	if (!featureId) {
		return missingEvidenceReadiness(
			`No P2 evidence feature was supplied. Run ${GEMINI_SUBAGENT_COMMAND_INVOCATION} and verify with --feature-id <feature-id>.`,
		);
	}

	let paths: ReturnType<typeof getGeminiSubagentEvidenceRelativePaths>;
	try {
		paths = getGeminiSubagentEvidenceRelativePaths(featureId);
	} catch (error) {
		return {
			status: "incomplete",
			evidence: null,
			evidencePath: null,
			issue:
				error instanceof Error
					? error.message
					: "Invalid Gemini delegation evidence feature id.",
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini delegation readiness could not be verified because the feature id is invalid.",
				null,
			),
		};
	}
	const workRoot =
		deps.workRoot ?? (await (deps.resolveWorkRoot ?? defaultResolveWorkRoot)());

	if (!workRoot) {
		return {
			status: "incomplete",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue:
				"Could not resolve the rp1 work directory for Gemini delegation evidence.",
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini delegation readiness could not be verified because the rp1 work directory was unavailable.",
				paths.markdownRelativePath,
			),
		};
	}

	const evidencePath = join(workRoot, paths.jsonRelativePath);
	const readEvidence = deps.readFile ?? defaultReadFile;
	let raw: string;

	try {
		raw = await readEvidence(evidencePath);
	} catch {
		return missingEvidenceReadiness(
			`Gemini delegation evidence missing: ${paths.jsonRelativePath}.`,
			paths.jsonRelativePath,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			status: "incomplete",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini delegation evidence is not valid JSON: ${paths.jsonRelativePath}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini delegation readiness could not be verified because the evidence JSON is malformed.",
				paths.markdownRelativePath,
			),
		};
	}

	if (!isGeminiDelegationEvidence(parsed)) {
		return {
			status: "incomplete",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini delegation evidence is incomplete: ${paths.jsonRelativePath}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini delegation readiness could not be verified because required evidence fields are missing.",
				paths.markdownRelativePath,
			),
		};
	}

	if (parsed.featureId !== featureId) {
		return {
			status: "incomplete",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini delegation evidence feature mismatch: expected ${featureId}, got ${parsed.featureId}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini delegation readiness could not be verified because the evidence feature id does not match the requested feature.",
				paths.markdownRelativePath,
			),
		};
	}

	return {
		status: parsed.overallStatus,
		evidence: parsed,
		evidencePath: paths.jsonRelativePath,
		issue:
			parsed.overallStatus === "passed"
				? null
				: "Gemini delegation evidence has not passed all P2 readiness checks.",
		workflowClasses: parsed.workflowClasses,
	};
};

const loadGeminiBoundaryReadiness = async (
	options: GeminiVerifyOptions,
	deps: GeminiVerifyDelegationDeps = {},
): Promise<GeminiBoundaryReadiness> => {
	const featureId = options.featureId?.trim();
	if (!featureId) {
		return missingBoundaryReadiness(
			"No P3 boundary evidence feature was supplied.",
		);
	}

	let paths: ReturnType<typeof getGeminiBoundaryEvidenceRelativePaths>;
	try {
		paths = getGeminiBoundaryEvidenceRelativePaths(featureId);
	} catch (error) {
		return {
			status: "failed",
			evidence: null,
			evidencePath: null,
			issue:
				error instanceof Error
					? error.message
					: "Invalid Gemini boundary evidence feature id.",
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini boundary evidence could not be verified because the feature id is invalid.",
				null,
			),
		};
	}

	const workRoot =
		deps.workRoot ?? (await (deps.resolveWorkRoot ?? defaultResolveWorkRoot)());

	if (!workRoot) {
		return {
			status: "failed",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue:
				"Could not resolve the rp1 work directory for Gemini boundary evidence.",
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini boundary evidence could not be verified because the rp1 work directory was unavailable.",
				paths.markdownRelativePath,
			),
		};
	}

	const evidencePath = join(workRoot, paths.jsonRelativePath);
	const readEvidence = deps.readFile ?? defaultReadFile;
	let raw: string;

	try {
		raw = await readEvidence(evidencePath);
	} catch {
		return missingBoundaryReadiness(
			`Gemini boundary evidence missing: ${paths.jsonRelativePath}.`,
			paths.jsonRelativePath,
		);
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {
			status: "failed",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini boundary evidence is not valid JSON: ${paths.jsonRelativePath}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini boundary evidence could not be verified because the evidence JSON is malformed.",
				paths.markdownRelativePath,
			),
		};
	}

	if (!isGeminiBoundaryEvidence(parsed)) {
		return {
			status: "failed",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini boundary evidence is incomplete: ${paths.jsonRelativePath}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini boundary evidence could not be verified because required evidence fields are missing.",
				paths.markdownRelativePath,
			),
		};
	}

	if (parsed.featureId !== featureId) {
		return {
			status: "failed",
			evidence: null,
			evidencePath: paths.jsonRelativePath,
			issue: `Gemini boundary evidence feature mismatch: expected ${featureId}, got ${parsed.featureId}.`,
			workflowClasses: blockedClassificationsFor(
				"incomplete",
				"Gemini boundary evidence could not be verified because the evidence feature id does not match the requested feature.",
				paths.markdownRelativePath,
			),
		};
	}

	return {
		status: parsed.overallStatus,
		evidence: parsed,
		evidencePath: paths.jsonRelativePath,
		issue:
			parsed.overallStatus === "passed"
				? null
				: "Gemini boundary evidence has not passed all P3 lifecycle, trust, and headless checks.",
		workflowClasses: parsed.workflowClasses,
	};
};

const statusColor = (
	status: GeminiDelegationEvidenceStatus,
): ((value: string) => string) => {
	if (status === "passed") return green;
	if (status === "not_run" || status === "incomplete") return yellow;
	return red;
};

const boundaryStatusColor = (
	status: GeminiBoundaryStatus,
): ((value: string) => string) => {
	if (status === "passed") return green;
	if (status === "not_run" || status === "degraded") return yellow;
	return red;
};

const lifecycleColor = (
	state: GeminiLifecycleState,
): ((value: string) => string) => {
	if (state === "current") return green;
	if (state === "removed" || state === "stale" || state === "blocked") {
		return red;
	}
	return yellow;
};

const classificationColor = (
	status: GeminiWorkflowSupportClassification["status"],
): ((value: string) => string) => {
	if (status === "experimental") return yellow;
	if (status === "blocked") return red;
	return yellow;
};

const renderReadinessStatus = (
	label: string,
	status: GeminiDelegationEvidenceStatus,
): void => {
	const color = statusColor(status);
	console.log(`  ${label.padEnd(28)} ${color(status)}`);
};

const printGeminiDelegationReadiness = (
	readiness: GeminiDelegationReadiness,
): void => {
	console.log("");
	console.log(bold("P2 delegation readiness:"));

	if (readiness.evidencePath) {
		console.log(`Evidence: ${readiness.evidencePath}`);
	} else {
		console.log("Evidence: none");
	}

	const evidence = readiness.evidence;
	renderReadinessStatus("Overall delegation", readiness.status);
	renderReadinessStatus(
		"Custom subagent",
		evidence?.customSubagent.status ?? "not_run",
	);
	renderReadinessStatus(
		"Fanout attribution",
		evidence?.fanout.status ?? "not_run",
	);
	renderReadinessStatus(
		"Delegated failure",
		evidence?.failureHandling.status ?? "not_run",
	);
	renderReadinessStatus(
		"Acknowledgement",
		evidence?.acknowledgement.status ?? "not_run",
	);

	if (readiness.issue) {
		console.log(yellow(`Issue: ${readiness.issue}`));
	}

	console.log("");
	console.log(bold("Heavyweight workflow gate:"));
	for (const classification of readiness.workflowClasses) {
		const color = classificationColor(classification.status);
		const evidenceStatus = classification.evidenceStatus ?? readiness.status;
		console.log(
			`  ${classification.workflowClass.padEnd(16)} ${color(classification.status).padEnd(14)} ${dim(`evidence=${evidenceStatus}`)}`,
		);
		console.log(dim(`    ${classification.reason}`));
		if (classification.evidenceArtifactPath) {
			console.log(dim(`    evidence: ${classification.evidenceArtifactPath}`));
		}
	}
};

const printGeminiManifestLifecycle = (
	lifecycle: GeminiLifecycleStatus,
): void => {
	const current = lifecycle.assets.filter(
		(asset) => asset.freshness === "current",
	).length;
	const missing = lifecycle.assets.filter(
		(asset) => asset.freshness === "missing",
	).length;
	const stale = lifecycle.assets.filter(
		(asset) => asset.freshness === "stale",
	).length;
	const blocked = lifecycle.assets.filter(
		(asset) => asset.freshness === "unknown",
	).length;
	const color = lifecycleColor(lifecycle.state);

	console.log("");
	console.log(bold("Manifest lifecycle:"));
	console.log(`Stage: ${lifecycle.stage}`);
	console.log(`State: ${color(lifecycle.state)}`);
	console.log(
		`Assets: ${current}/${lifecycle.assets.length} current, ${missing} missing, ${stale} stale, ${blocked} blocked`,
	);

	for (const asset of lifecycle.assets.filter(
		(asset) => asset.freshness !== "current",
	)) {
		const assetColor =
			asset.freshness === "unknown" || asset.freshness === "stale"
				? red
				: yellow;
		console.log(
			`  - ${asset.asset.displayPath}: ${assetColor(asset.freshness)}`,
		);
		if (asset.issue) console.log(yellow(`    ${asset.issue}`));
		if (asset.remediation) console.log(dim(`    ${asset.remediation}`));
	}

	if (lifecycle.issue) {
		console.log(yellow(`Issue: ${lifecycle.issue}`));
	}
	if (lifecycle.userAction) {
		console.log(dim(`User action: ${lifecycle.userAction}`));
	}
	console.log(
		dim(
			"Trust/approval note: Gemini may still require workspace trust, shell approval, or agent acknowledgement when validation commands run.",
		),
	);
};

const printGeminiBoundaryReadiness = (
	readiness: GeminiBoundaryReadiness,
): void => {
	console.log("");
	console.log(bold("P3 boundary evidence:"));

	if (readiness.evidencePath) {
		console.log(`Evidence: ${readiness.evidencePath}`);
	} else {
		console.log("Evidence: none");
	}

	const color = boundaryStatusColor(readiness.status);
	console.log(`Overall boundaries: ${color(readiness.status)}`);

	if (readiness.issue) {
		console.log(yellow(`Issue: ${readiness.issue}`));
	}

	for (const scenario of readiness.evidence?.scenarios ?? []) {
		const scenarioColor = boundaryStatusColor(scenario.status);
		console.log(
			`  ${scenario.scenario.padEnd(20)} ${scenarioColor(scenario.status).padEnd(12)} ${dim(`state=${scenario.state}`)}`,
		);
		if (scenario.blocker) {
			console.log(yellow(`    Blocker: ${scenario.blocker}`));
		}
		if (scenario.userAction) {
			console.log(dim(`    User action: ${scenario.userAction}`));
		}
	}
};

export const executeVerifyGemini = async (
	_logger: Logger,
	deps?: GeminiVerifyDeps &
		GeminiVerifyDelegationDeps &
		GeminiVerifyLifecycleDeps,
	options: GeminiVerifyOptions = {},
): Promise<boolean> => {
	console.log(bold("\nVerifying Gemini CLI Smoke Command\n"));

	const result = await verifyGeminiSmokeSetup(deps);
	const lifecycle = await loadGeminiManifestLifecycle(deps);
	const delegationReadiness = await loadGeminiDelegationReadiness(
		options,
		deps,
	);
	const boundaryReadiness = await loadGeminiBoundaryReadiness(options, deps);
	const statusDetail = getGeminiSmokeStatusDetail(result.status);
	const statusLabel = result.verified
		? green(result.status)
		: yellow(result.status);
	const binaryLabel = result.geminiInstalled
		? green(result.geminiVersion ?? "unknown")
		: red("not found");
	const commandLabel = result.commandInstalled
		? green("present")
		: red("missing");

	console.log(
		`Support: ${yellow("experimental")} (${dim("manifest validation assets only")})`,
	);
	console.log(`State: ${statusLabel}`);
	console.log(`Meaning: ${statusDetail.label}`);
	console.log("");
	console.log("+----------------+----------------------+--------+");
	console.log("| Component      | Value                | Status |");
	console.log("+----------------+----------------------+--------+");
	console.log(
		`| Gemini CLI     | ${(result.geminiVersion ?? "not found").padEnd(20)} | ${binaryLabel.padEnd(6)} |`,
	);
	console.log(
		`| Smoke command  | ${result.commandDisplayPath.padEnd(20)} | ${commandLabel.padEnd(6)} |`,
	);
	console.log("+----------------+----------------------+--------+");

	if (result.issues.length > 0) {
		console.log("");
		console.log(yellow("Issues Found:"));
		for (const issue of result.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (result.remediation.length > 0) {
		console.log("");
		console.log(dim("Next steps:"));
		for (const step of result.remediation) {
			console.log(dim(`  - ${step}`));
		}
	}

	printGeminiManifestLifecycle(lifecycle);
	printGeminiDelegationReadiness(delegationReadiness);
	if (options.featureId || boundaryReadiness.evidence) {
		printGeminiBoundaryReadiness(boundaryReadiness);
	}

	const lifecycleReady = lifecycle.state === "current";
	const boundaryEvidencePresent = boundaryReadiness.evidence !== null;

	if (result.verified && lifecycleReady) {
		if (boundaryEvidencePresent && boundaryReadiness.status !== "passed") {
			console.log(yellow(bold("\nGemini P3 boundary evidence is gated")));
			console.log(
				dim(
					"  Review the P3 boundary evidence issue and rerun after the recorded user action is complete.",
				),
			);
			return false;
		}
		if (
			options.featureId &&
			!boundaryEvidencePresent &&
			delegationReadiness.status !== "passed"
		) {
			console.log(yellow(bold("\nGemini P2 delegation readiness is gated")));
			console.log(dim(`  ${GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON}`));
			return false;
		}
		console.log(green(bold("\nGemini experimental smoke command ready")));
		return true;
	}

	console.log(yellow(bold("\nGemini lifecycle path is degraded")));
	if (!result.commandInstalled) {
		console.log(cyan("  rp1 install gemini"));
	}
	if (!lifecycleReady && lifecycle.userAction) {
		console.log(cyan(`  ${lifecycle.userAction}`));
	}
	return false;
};

export const verifyGeminiSubcommand = new Command("gemini")
	.description(
		"Verify experimental Gemini CLI manifest, smoke, and validation readiness",
	)
	.option(
		"--feature-id <featureId>",
		"Read Gemini feature evidence from .rp1/work/features/<featureId>/",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify gemini                          Verify Gemini CLI experimental manifest setup
  rp1 verify gemini --feature-id phase-p3    Verify setup plus feature evidence
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyGemini(logger, undefined, {
			featureId: options.featureId,
		});
		if (!ok) process.exit(1);
	});

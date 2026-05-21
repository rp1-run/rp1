import { readFile as readTextFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { resolveRp1Root } from "../../agent-tools/rp1-root-dir/resolver.js";
import type { BundledAssets } from "../../assets/reader.js";
import {
	attributeGeminiWorkflowAttempt,
	GEMINI_BOUNDARY_MODES,
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_STATES,
	GEMINI_BOUNDARY_STATUSES,
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
	type GeminiAssetManifestEntry,
	type GeminiBoundaryEvidence,
	type GeminiBoundaryScenarioEvidence,
	type GeminiBoundaryStatus,
	type GeminiDelegationEvidence,
	type GeminiDelegationEvidenceStatus,
	type GeminiLifecycleState,
	type GeminiLifecycleStatus,
	type GeminiVerifyDeps,
	type GeminiWorkflowAttemptAttribution,
	type GeminiWorkflowSupportClassification,
	getGeminiBoundaryEvidenceRelativePaths,
	getGeminiManifestLifecycleStatus,
	getGeminiSmokeStatusDetail,
	getGeminiSubagentEvidenceRelativePaths,
	loadGeminiWorkflowSupportMatrixFromAssets,
	verifyGeminiBundleSetup,
} from "../../install/gemini/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

export interface GeminiVerifyOptions {
	readonly featureId?: string;
	readonly workflowId?: string;
}

export interface GeminiVerifyDelegationDeps {
	readonly workRoot?: string;
	readonly readFile?: (path: string) => Promise<string>;
	readonly resolveWorkRoot?: () => Promise<string | null>;
}

export interface GeminiVerifyLifecycleDeps {
	readonly homeDir?: string;
	readonly assetManifest?: readonly GeminiAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
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

interface GeminiWorkflowAttemptReadiness {
	readonly attribution: GeminiWorkflowAttemptAttribution | null;
	readonly issue: string | null;
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
	(value.status === "evidence_recorded" ||
		value.status === "needs_attention" ||
		value.status === "out_of_scope") &&
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

const evidenceClassificationsFor = (
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
					"Run `rp1 install gemini` before using Gemini rp1 commands.",
			};
		case "missing":
			return {
				issue: "A manifest-owned Gemini extension asset is missing.",
				userAction:
					"Run `rp1 install gemini` to restore the missing Gemini extension asset.",
			};
		case "partial":
			return {
				issue: "Only part of the rp1 Gemini extension manifest is installed.",
				userAction:
					"Run `rp1 install gemini` to reinstall the complete manifest-owned Gemini asset set.",
			};
		case "stale":
			return {
				issue:
					"One or more rp1 Gemini extension assets do not match the current manifest.",
				userAction:
					"Run `rp1 install gemini` to refresh stale manifest-owned Gemini assets.",
			};
		case "blocked":
			return {
				issue: "rp1 could not read one or more Gemini extension assets.",
				userAction:
					"Fix local file permissions or trust/approval blockers, then rerun `rp1 verify gemini`.",
			};
		case "legacy_pre_manifest":
			return {
				issue:
					"Gemini lifecycle verification came from legacy pre-manifest evidence.",
				userAction:
					"Run the current manifest-backed Gemini lifecycle check again.",
			};
	}
};

const loadGeminiManifestLifecycle = async (
	deps: GeminiVerifyLifecycleDeps = {},
): Promise<GeminiLifecycleStatus> => {
	const result = await getGeminiManifestLifecycleStatus({
		homeDir: deps.homeDir,
		stage: "verify",
		assetManifest: deps.assetManifest,
		bundledAssets: deps.bundledAssets,
		distDir: deps.distDir,
		readAssetFile: deps.readAssetFile,
	})();

	if (E.isLeft(result)) {
		const state: GeminiLifecycleState = "blocked";
		const message = lifecycleMessageFor(state);
		return {
			stage: "verify",
			state,
			assets: [],
			issue: formatError(result.left, false),
			userAction: message.userAction,
		};
	}

	const message = lifecycleMessageFor(result.right.state);

	return {
		...result.right,
		issue: result.right.issue ?? message.issue,
		userAction: result.right.userAction ?? message.userAction,
	};
};

const loadGeminiDelegationReadiness = async (
	options: GeminiVerifyOptions,
	deps: GeminiVerifyDelegationDeps = {},
): Promise<GeminiDelegationReadiness> => {
	const featureId = options.featureId?.trim();
	if (!featureId) {
		return missingEvidenceReadiness(
			"No P2 evidence feature was supplied. Attach accepted Gemini delegation evidence and verify with --feature-id <feature-id> before upgrading delegation claims.",
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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
			workflowClasses: evidenceClassificationsFor(
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

const loadGeminiWorkflowAttemptReadiness = (
	workflowId: string | undefined,
	lifecycle: GeminiLifecycleStatus,
): GeminiWorkflowAttemptReadiness | null => {
	const requestedWorkflow = workflowId?.trim();
	if (!requestedWorkflow) return null;

	try {
		const matrix = loadGeminiWorkflowSupportMatrixFromAssets(
			lifecycle.assets.map((assetStatus) => assetStatus.asset),
		);
		return {
			attribution: attributeGeminiWorkflowAttempt(matrix, requestedWorkflow),
			issue: null,
		};
	} catch (error) {
		return {
			attribution: null,
			issue:
				error instanceof Error
					? error.message
					: "Gemini support matrix could not be read.",
		};
	}
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
	console.log(bold("P2 delegation evidence:"));

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
		if (scenario.status !== "passed" && scenario.blocker) {
			console.log(yellow(`    Blocker: ${scenario.blocker}`));
		}
		if (scenario.userAction) {
			console.log(dim(`    User action: ${scenario.userAction}`));
		}
	}
};

const workflowAttemptColor = (
	status: GeminiWorkflowAttemptAttribution["status"],
): ((value: string) => string) => {
	if (status === "supported") return green;
	if (status === "unsupported") return red;
	return yellow;
};

const printGeminiWorkflowAttemptReadiness = (
	readiness: GeminiWorkflowAttemptReadiness,
): void => {
	console.log("");
	console.log(bold("Workflow attempt attribution:"));

	if (readiness.issue) {
		console.log(yellow(`Issue: ${readiness.issue}`));
		console.log(
			dim(
				"User action: Install Gemini CLI extension assets so the support matrix can attribute the attempted workflow.",
			),
		);
		return;
	}

	const attribution = readiness.attribution;
	if (!attribution) return;

	const color = workflowAttemptColor(attribution.status);
	console.log(`Workflow: ${attribution.workflowId}`);
	console.log(`State: ${color(attribution.status)}`);
	console.log(
		`Product scope: ${attribution.productOwnedScope ? "product-owned Gemini support boundary" : "supported Gemini matrix row"}`,
	);
	console.log(`Rationale: ${attribution.rationale}`);
	if (attribution.exceptionOwner) {
		console.log(`Exception owner: ${attribution.exceptionOwner}`);
	}
	if (attribution.evidenceSource) {
		console.log(`Evidence: ${attribution.evidenceSource}`);
	}
	console.log(dim(`User action: ${attribution.userAction}`));
};

export const executeVerifyGemini = async (
	_logger: Logger,
	deps?: GeminiVerifyDeps &
		GeminiVerifyDelegationDeps &
		GeminiVerifyLifecycleDeps,
	options: GeminiVerifyOptions = {},
): Promise<boolean> => {
	console.log(bold("\nVerifying Gemini CLI Integration\n"));

	const result = await verifyGeminiBundleSetup(deps);
	const lifecycle = await loadGeminiManifestLifecycle(deps);
	const verifyFeatureEvidence = Boolean(options.featureId?.trim());
	const delegationReadiness = verifyFeatureEvidence
		? await loadGeminiDelegationReadiness(options, deps)
		: null;
	const boundaryReadiness = verifyFeatureEvidence
		? await loadGeminiBoundaryReadiness(options, deps)
		: null;
	const workflowAttemptReadiness = loadGeminiWorkflowAttemptReadiness(
		options.workflowId,
		lifecycle,
	);
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
		`Support: ${green("first-class")} (${dim("Gemini CLI extension assets")})`,
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
		`| Primary command | ${result.commandDisplayPath.padEnd(19)} | ${commandLabel.padEnd(6)} |`,
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
	if (delegationReadiness) {
		printGeminiDelegationReadiness(delegationReadiness);
	}
	if (boundaryReadiness) {
		printGeminiBoundaryReadiness(boundaryReadiness);
	}
	if (workflowAttemptReadiness) {
		printGeminiWorkflowAttemptReadiness(workflowAttemptReadiness);
	}

	const lifecycleReady = lifecycle.state === "current";
	const boundaryEvidencePresent =
		boundaryReadiness?.evidence !== null &&
		boundaryReadiness?.evidence !== undefined;

	if (result.verified && lifecycleReady) {
		if (
			boundaryEvidencePresent &&
			boundaryReadiness &&
			boundaryReadiness.status !== "passed"
		) {
			console.log(
				yellow(bold("\nGemini P3 boundary evidence validation failed")),
			);
			console.log(
				dim(
					"  Review the P3 boundary evidence issue and rerun after the recorded user action is complete.",
				),
			);
			return false;
		}
		if (
			delegationReadiness &&
			!boundaryEvidencePresent &&
			delegationReadiness.status !== "passed"
		) {
			console.log(
				yellow(bold("\nGemini P2 delegation evidence validation failed")),
			);
			console.log(dim(`  ${GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON}`));
			return false;
		}
		if (
			workflowAttemptReadiness &&
			workflowAttemptReadiness.attribution?.status !== "supported"
		) {
			console.log(
				yellow(bold("\nGemini workflow attribution requires attention")),
			);
			console.log(
				dim(
					"  The requested workflow is not a supported Gemini workflow row; the support matrix above identifies the product scope and next action.",
				),
			);
			return false;
		}
		console.log(green(bold("\nGemini CLI ready")));
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
	.description("Verify Gemini CLI integration and support-matrix readiness")
	.option(
		"--feature-id <featureId>",
		"Read Gemini feature evidence from .rp1/work/features/<featureId>/",
	)
	.option(
		"--workflow <workflowId>",
		"Attribute a Gemini workflow attempt against the Gemini support matrix",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify gemini                          Verify Gemini CLI setup
  rp1 verify gemini --feature-id phase-p3    Verify setup plus feature evidence
  rp1 verify gemini --workflow dev:build     Explain Gemini support for a workflow attempt
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
			workflowId: options.workflow,
		});
		if (!ok) process.exit(1);
	});

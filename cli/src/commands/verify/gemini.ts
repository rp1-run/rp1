import { readFile as readTextFile } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { resolveRp1Root } from "../../agent-tools/rp1-root-dir/resolver.js";
import {
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
	GEMINI_SUBAGENT_COMMAND_INVOCATION,
	type GeminiDelegationEvidence,
	type GeminiDelegationEvidenceStatus,
	type GeminiVerifyDeps,
	type GeminiWorkflowSupportClassification,
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

interface GeminiDelegationReadiness {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly evidence: GeminiDelegationEvidence | null;
	readonly evidencePath: string | null;
	readonly issue: string | null;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

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

const statusColor = (
	status: GeminiDelegationEvidenceStatus,
): ((value: string) => string) => {
	if (status === "passed") return green;
	if (status === "not_run" || status === "incomplete") return yellow;
	return red;
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

export const executeVerifyGemini = async (
	_logger: Logger,
	deps?: GeminiVerifyDeps & GeminiVerifyDelegationDeps,
	options: GeminiVerifyOptions = {},
): Promise<boolean> => {
	console.log(bold("\nVerifying Gemini CLI Smoke Command\n"));

	const result = await verifyGeminiSmokeSetup(deps);
	const delegationReadiness = await loadGeminiDelegationReadiness(
		options,
		deps,
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

	console.log(`Support: ${yellow("experimental")} (${dim("smoke-only")})`);
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

	printGeminiDelegationReadiness(delegationReadiness);

	if (result.verified) {
		if (options.featureId && delegationReadiness.status !== "passed") {
			console.log(yellow(bold("\nGemini P2 delegation readiness is gated")));
			console.log(dim(`  ${GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON}`));
			return false;
		}
		console.log(green(bold("\nGemini experimental smoke command ready")));
		return true;
	}

	console.log(yellow(bold("\nGemini smoke path is degraded")));
	if (!result.commandInstalled) {
		console.log(cyan("  rp1 install gemini"));
	}
	return false;
};

export const verifyGeminiSubcommand = new Command("gemini")
	.description(
		"Verify experimental Gemini CLI smoke and P2 delegation readiness",
	)
	.option(
		"--feature-id <featureId>",
		"Read P2 delegation evidence from .rp1/work/features/<featureId>/gemini-subagents.json",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify gemini                          Verify Gemini CLI experimental smoke setup
  rp1 verify gemini --feature-id phase-p2    Verify smoke setup plus P2 delegation evidence
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

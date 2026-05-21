import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import type {
	AntigravityWorkflowSupportEntry,
	AntigravityWorkflowSupportExclusion,
	AntigravityWorkflowSupportMatrix,
} from "../../catalog/index.js";
import {
	type AntigravityAssetManifestEntry,
	type AntigravityLifecycleState,
	type AntigravityLifecycleStatus,
	type AntigravityVerifyDeps,
	getAntigravityManifestLifecycleStatus,
	getAntigravitySmokeStatusDetail,
	verifyAntigravityBundleSetup,
} from "../../install/antigravity/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

export interface AntigravityVerifyOptions {
	readonly workflowId?: string;
}

export interface AntigravityWorkflowAttemptAttribution {
	readonly workflowId: string;
	readonly status:
		| "supported"
		| "limited"
		| "unsupported"
		| "excluded"
		| "unknown";
	readonly productOwnedScope: boolean;
	readonly reason: string;
	readonly limitation: string | null;
	readonly userAction: string;
	readonly evidenceSource: string | null;
	readonly exceptionOwner: string | null;
	readonly delegation: AntigravityWorkflowSupportEntry["delegation"] | null;
}

interface AntigravityWorkflowAttemptReadiness {
	readonly attribution: AntigravityWorkflowAttemptAttribution | null;
	readonly issue: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const isAntigravitySupportEntry = (
	value: unknown,
): value is AntigravityWorkflowSupportEntry =>
	isRecord(value) &&
	typeof value.workflowId === "string" &&
	(value.status === "supported" ||
		value.status === "limited" ||
		value.status === "unsupported") &&
	typeof value.supportRationale === "string" &&
	typeof value.userAction === "string";

const isAntigravitySupportExclusion = (
	value: unknown,
): value is AntigravityWorkflowSupportExclusion =>
	isRecord(value) &&
	typeof value.workflowId === "string" &&
	typeof value.rationale === "string";

export const parseAntigravityWorkflowSupportMatrix = (
	content: string,
): AntigravityWorkflowSupportMatrix => {
	const parsed = JSON.parse(content) as unknown;
	if (
		!isRecord(parsed) ||
		typeof parsed.updatedAt !== "string" ||
		!Array.isArray(parsed.entries) ||
		!Array.isArray(parsed.excludedEntries) ||
		!parsed.entries.every(isAntigravitySupportEntry) ||
		!parsed.excludedEntries.every(isAntigravitySupportExclusion)
	) {
		throw new Error("Antigravity support matrix asset is incomplete.");
	}

	return {
		updatedAt: parsed.updatedAt,
		entries: parsed.entries as readonly AntigravityWorkflowSupportEntry[],
		excludedEntries:
			parsed.excludedEntries as readonly AntigravityWorkflowSupportExclusion[],
	};
};

const loadAntigravityWorkflowSupportMatrixFromAssets = (
	assets: readonly AntigravityAssetManifestEntry[],
): AntigravityWorkflowSupportMatrix => {
	const supportMatrixAsset = assets.find(
		(asset) => asset.kind === "support_matrix",
	);
	if (!supportMatrixAsset) {
		throw new Error(
			"Antigravity support matrix asset is missing from the bundle.",
		);
	}

	return parseAntigravityWorkflowSupportMatrix(
		supportMatrixAsset.expectedContent,
	);
};

export const attributeAntigravityWorkflowAttempt = (
	matrix: AntigravityWorkflowSupportMatrix,
	workflowId: string,
): AntigravityWorkflowAttemptAttribution => {
	const entry = matrix.entries.find((item) => item.workflowId === workflowId);
	if (entry) {
		return {
			workflowId,
			status: entry.status,
			productOwnedScope: entry.status !== "supported",
			reason: entry.supportRationale,
			limitation: entry.limitation,
			userAction: entry.userAction,
			evidenceSource: entry.evidenceSource,
			exceptionOwner: entry.exceptionOwner,
			delegation: entry.delegation,
		};
	}

	const exclusion = matrix.excludedEntries.find(
		(item) => item.workflowId === workflowId,
	);
	if (exclusion) {
		return {
			workflowId,
			status: "excluded",
			productOwnedScope: true,
			reason: exclusion.rationale,
			limitation: `This catalog entry is excluded from shipped Antigravity workflow support claims because it is ${exclusion.reason.replaceAll("_", " ")}.`,
			userAction:
				"Use a shipped user-facing workflow id from the Antigravity support matrix.",
			evidenceSource: null,
			exceptionOwner: "rp1 product",
			delegation: null,
		};
	}

	return {
		workflowId,
		status: "unknown",
		productOwnedScope: true,
		reason: `${workflowId} is not present in the Antigravity support matrix.`,
		limitation:
			"No Antigravity support state is available for this workflow id.",
		userAction:
			"Confirm the workflow id or rebuild Antigravity assets from current catalog sources.",
		evidenceSource: null,
		exceptionOwner: "rp1 product",
		delegation: null,
	};
};

const lifecycleMessageFor = (
	state: AntigravityLifecycleState,
): Pick<AntigravityLifecycleStatus, "issue" | "userAction"> => {
	switch (state) {
		case "current":
			return {
				issue: null,
				userAction:
					"Run Antigravity workflows from trusted workspaces; `agy` may still require user approval for tools or MCP servers.",
			};
		case "removed":
			return {
				issue: "No rp1-owned Antigravity package assets are installed.",
				userAction:
					"Run `rp1 install antigravity` before using Antigravity rp1 commands.",
			};
		case "missing":
			return {
				issue: "A manifest-owned Antigravity package asset is missing.",
				userAction:
					"Run `rp1 install antigravity` to restore the missing Antigravity package asset.",
			};
		case "partial":
			return {
				issue:
					"Only part of the rp1 Antigravity package manifest is installed.",
				userAction:
					"Run `rp1 install antigravity` to reinstall the complete manifest-owned Antigravity asset set.",
			};
		case "stale":
			return {
				issue:
					"One or more rp1 Antigravity package assets or version markers do not match the current manifest.",
				userAction:
					"Run `rp1 update plugins antigravity -y` to refresh stale manifest-owned Antigravity assets.",
			};
		case "blocked":
			return {
				issue: "rp1 could not read one or more Antigravity package assets.",
				userAction:
					"Fix local file permissions or trust/approval blockers, then rerun `rp1 verify antigravity`.",
			};
	}
};

const loadAntigravityManifestLifecycle = async (
	deps: AntigravityVerifyDeps = {},
): Promise<AntigravityLifecycleStatus> => {
	const result = await getAntigravityManifestLifecycleStatus({
		homeDir: deps.homeDir,
		stage: "verify",
		assetManifest: deps.assetManifest,
		bundledAssets: deps.bundledAssets,
		distDir: deps.distDir,
		readAssetFile: deps.readAssetFile,
	})();

	if (E.isLeft(result)) {
		const state: AntigravityLifecycleState = "blocked";
		const message = lifecycleMessageFor(state);
		return {
			stage: "verify",
			state,
			assets: [],
			versionMarker: {
				freshness: "unknown",
				installedVersion: null,
				currentVersion: "unknown",
				issue: formatError(result.left, false),
				remediation: message.userAction,
			},
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

const loadAntigravityWorkflowAttemptReadiness = (
	workflowId: string | undefined,
	lifecycle: AntigravityLifecycleStatus,
): AntigravityWorkflowAttemptReadiness | null => {
	const requestedWorkflow = workflowId?.trim();
	if (!requestedWorkflow) return null;

	try {
		const matrix = loadAntigravityWorkflowSupportMatrixFromAssets(
			lifecycle.assets.map((assetStatus) => assetStatus.asset),
		);
		return {
			attribution: attributeAntigravityWorkflowAttempt(
				matrix,
				requestedWorkflow,
			),
			issue: null,
		};
	} catch (error) {
		return {
			attribution: null,
			issue:
				error instanceof Error
					? error.message
					: "Antigravity support matrix could not be read.",
		};
	}
};

const lifecycleColor = (
	state: AntigravityLifecycleState,
): ((value: string) => string) => {
	if (state === "current") return green;
	if (state === "removed" || state === "stale" || state === "blocked") {
		return red;
	}
	return yellow;
};

const printAntigravityManifestLifecycle = (
	lifecycle: AntigravityLifecycleStatus,
): void => {
	const color = lifecycleColor(lifecycle.state);
	const counts = {
		current: lifecycle.assets.filter((asset) => asset.freshness === "current")
			.length,
		missing: lifecycle.assets.filter((asset) => asset.freshness === "missing")
			.length,
		stale: lifecycle.assets.filter((asset) => asset.freshness === "stale")
			.length,
		blocked: lifecycle.assets.filter((asset) => asset.freshness === "unknown")
			.length,
	};

	console.log("");
	console.log(bold("Manifest lifecycle:"));
	console.log(`State: ${color(lifecycle.state)}`);
	console.log(
		`Assets: ${counts.current}/${lifecycle.assets.length} current, ${counts.missing} missing, ${counts.stale} stale, ${counts.blocked} blocked`,
	);
	console.log(
		`Version marker: ${lifecycle.versionMarker.freshness} (${lifecycle.versionMarker.installedVersion ?? "none"} -> ${lifecycle.versionMarker.currentVersion})`,
	);

	for (const asset of lifecycle.assets.filter(
		(assetStatus) => assetStatus.freshness !== "current",
	)) {
		console.log(yellow(`  - ${asset.asset.displayPath}: ${asset.freshness}`));
	}

	if (lifecycle.issue) {
		console.log(yellow(`Issue: ${lifecycle.issue}`));
	}
	if (lifecycle.userAction) {
		console.log(dim(`Next action: ${lifecycle.userAction}`));
	}
};

const workflowAttemptColor = (
	status: AntigravityWorkflowAttemptAttribution["status"],
): ((value: string) => string) => {
	if (status === "supported") return green;
	if (status === "unsupported" || status === "unknown") return red;
	return yellow;
};

const workflowAttemptNeedsAttention = (
	readiness: AntigravityWorkflowAttemptReadiness | null,
): boolean => {
	if (!readiness) return false;
	if (readiness.issue) return true;
	const status = readiness.attribution?.status;
	return (
		status === "unsupported" || status === "excluded" || status === "unknown"
	);
};

const printAntigravityWorkflowAttemptReadiness = (
	readiness: AntigravityWorkflowAttemptReadiness,
): void => {
	console.log("");
	console.log(bold("Workflow attempt attribution:"));

	if (readiness.issue) {
		console.log(yellow(`Issue: ${readiness.issue}`));
		console.log(
			dim(
				"Fallback: Run `rp1 install antigravity`, then rerun workflow verification so the support matrix can be read.",
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
		`Product scope: ${attribution.productOwnedScope ? "product-owned Antigravity support boundary" : "supported Antigravity matrix row"}`,
	);
	console.log(`Reason: ${attribution.reason}`);
	console.log(`Limitation: ${attribution.limitation ?? "none"}`);
	if (attribution.exceptionOwner) {
		console.log(`Exception owner: ${attribution.exceptionOwner}`);
	}
	if (attribution.evidenceSource) {
		console.log(`Evidence: ${attribution.evidenceSource}`);
	}
	if (attribution.delegation?.mode === "dynamic_session_subagents") {
		console.log(`Delegation: ${attribution.delegation.mode}`);
		console.log(
			`Required subagents: ${attribution.delegation.requiredSubAgents.join(", ")}`,
		);
		console.log(`Runtime contract: ${attribution.delegation.runtimeContract}`);
		console.log(
			`Static agents discovery: ${attribution.delegation.staticAgentsDiscovery}`,
		);
	}
	const actionLabel =
		attribution.status === "unsupported" ||
		attribution.status === "excluded" ||
		attribution.status === "unknown"
			? "Fallback"
			: "Next action";
	console.log(dim(`${actionLabel}: ${attribution.userAction}`));
};

export const executeVerifyAntigravity = async (
	_logger: Logger,
	deps: AntigravityVerifyDeps = {},
	options: AntigravityVerifyOptions = {},
): Promise<boolean> => {
	const result = await verifyAntigravityBundleSetup(deps);
	const lifecycle = await loadAntigravityManifestLifecycle(deps);
	const workflowAttemptReadiness = loadAntigravityWorkflowAttemptReadiness(
		options.workflowId,
		lifecycle,
	);
	const statusDetail = getAntigravitySmokeStatusDetail(result.status);
	const statusColor = result.verified ? green : yellow;

	console.log(bold("Antigravity CLI verification\n"));
	console.log(
		`| Antigravity CLI | ${(result.antigravityVersion ?? "not found").padEnd(20)} | ${statusColor(result.status).padEnd(6)} |`,
	);
	console.log(
		`| Package assets   | ${String(result.bundleAssetCount).padEnd(20)} | ${lifecycleColor(lifecycle.state)(lifecycle.state).padEnd(6)} |`,
	);
	console.log(
		`| Plugin validate  | ${result.pluginValidation.status.padEnd(20)} | ${
			result.pluginValidation.status === "passed" ? green("OK") : yellow("WARN")
		} |`,
	);

	printAntigravityManifestLifecycle(lifecycle);

	if (result.pluginValidation.plugins.length > 0) {
		console.log("");
		console.log(bold("Plugin validation:"));
		for (const plugin of result.pluginValidation.plugins) {
			const color = plugin.status === "passed" ? green : yellow;
			console.log(`  ${plugin.displayDir}: ${color(plugin.status)}`);
			if (plugin.issue) console.log(yellow(`    - ${plugin.issue}`));
		}
	}

	if (result.issues.length > 0) {
		console.log("");
		console.log(yellow("Issues:"));
		for (const issue of result.issues) {
			console.log(yellow(`  - ${issue}`));
		}
	}

	if (workflowAttemptReadiness) {
		printAntigravityWorkflowAttemptReadiness(workflowAttemptReadiness);
	}

	console.log("");
	if (result.verified) {
		if (workflowAttemptNeedsAttention(workflowAttemptReadiness)) {
			console.log(
				yellow(bold("Antigravity workflow support requires attention")),
			);
			console.log(
				dim(
					"  The requested workflow is not a supported or limited Antigravity matrix row; use the attribution details above to choose a supported workflow or update the matrix.",
				),
			);
			return false;
		}
		if (workflowAttemptReadiness?.attribution?.status === "limited") {
			console.log(yellow(bold("Antigravity workflow support is limited")));
			console.log(
				dim(
					"  The matrix row is queryable, but the limitation above must be satisfied in Antigravity.",
				),
			);
		}
		console.log(green("Antigravity verification passed"));
	} else {
		console.log(yellow(statusDetail.label));
		console.log(dim("Next actions:"));
		for (const item of result.remediation) {
			console.log(cyan(`  ${item}`));
		}
	}

	return result.verified;
};

export const verifyAntigravitySubcommand = new Command("antigravity")
	.description("Verify Antigravity CLI package assets")
	.option(
		"--workflow <workflowId>",
		"Attribute an Antigravity workflow attempt against the support matrix",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify antigravity                         Verify Antigravity CLI setup and package assets
  rp1 verify antigravity --workflow dev:build    Explain Antigravity support for a workflow attempt
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyAntigravity(logger, undefined, {
			workflowId: _options.workflow,
		});
		if (!ok) {
			process.exit(1);
		}
	});

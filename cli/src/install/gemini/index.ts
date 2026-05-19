import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import {
	type GeminiBundleAssetManifestOptions,
	loadGeminiBundleAssetManifest,
} from "./bundle-assets.js";
import type { GeminiAssetManifestEntry } from "./lifecycle.js";
import {
	GEMINI_EXPERIMENTAL_GUIDANCE,
	type GeminiInstallResult,
	type GeminiPaths,
	type GeminiVerificationResult,
	getGeminiSmokeStatusDetail,
} from "./models.js";
import {
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
} from "./smoke-command.js";

export interface GeminiInstallOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly getGeminiBinaryPath?: () => string | null;
	readonly assetManifest?: readonly GeminiAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

export interface GeminiVerifyDeps {
	readonly paths?: GeminiPaths;
	readonly getGeminiBinaryPath?: () => string | null;
	readonly getGeminiVersion?: () => Promise<string | null>;
	readonly pathExists?: (path: string) => Promise<boolean>;
	readonly assetManifest?: readonly GeminiAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

export const getGeminiPaths = (
	homeDir = process.env.HOME ?? homedir(),
): GeminiPaths => ({
	commandFile: join(homeDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH),
	commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
});

const defaultPathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await stat(targetPath);
		return true;
	} catch {
		return false;
	}
};

const defaultGeminiVersion = async (): Promise<string | null> => {
	const binaryPath = Bun.which("gemini");
	if (!binaryPath) return null;

	const proc = Bun.spawn([binaryPath, "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) return "unknown";

	const version = (await new Response(proc.stdout).text()).trim();
	return version.length > 0 ? version : "unknown";
};

const bundleOptionsFor = (
	options: GeminiInstallOptions | GeminiVerifyDeps,
): GeminiBundleAssetManifestOptions => ({
	assetManifest: options.assetManifest,
	bundledAssets: options.bundledAssets,
	distDir: options.distDir,
});

const primaryCommandAsset = (
	assets: readonly GeminiAssetManifestEntry[],
): GeminiAssetManifestEntry | undefined =>
	assets.find((asset) => asset.kind === "command");

export const installGeminiSubagentValidationAssets = (
	options: GeminiInstallOptions,
): TE.TaskEither<CLIError, GeminiInstallResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = options.homeDir ?? process.env.HOME ?? homedir();
			const assets = await loadGeminiBundleAssetManifest(
				bundleOptionsFor(options),
			);
			const primaryCommand = primaryCommandAsset(assets);
			const paths = primaryCommand
				? {
						commandFile: join(homeDir, primaryCommand.relativePath),
						commandDisplayPath: primaryCommand.displayPath,
					}
				: getGeminiPaths(options.homeDir);
			const warnings: string[] = [GEMINI_EXPERIMENTAL_GUIDANCE];
			const binaryPath = options.getGeminiBinaryPath?.() ?? Bun.which("gemini");

			if (!binaryPath) {
				warnings.push(
					"Gemini CLI was not found in PATH. Install Gemini CLI before running the rp1 Gemini commands.",
				);
			}

			if (options.dryRun) {
				return {
					commandPath: paths.commandFile,
					commandDisplayPath: paths.commandDisplayPath,
					commandWritten: false,
					assets,
					assetCount: assets.length,
					extensionDisplayDirs: [
						...new Set(
							assets.map((asset) =>
								asset.displayPath.split("/").slice(0, 4).join("/"),
							),
						),
					],
					warnings,
				};
			}

			for (const asset of assets) {
				const assetPath = join(homeDir, asset.relativePath);
				await mkdir(dirname(assetPath), { recursive: true });
				await writeFile(assetPath, asset.expectedContent, "utf-8");
			}

			return {
				commandPath: paths.commandFile,
				commandDisplayPath: paths.commandDisplayPath,
				commandWritten: true,
				assets,
				assetCount: assets.length,
				extensionDisplayDirs: [
					...new Set(
						assets.map((asset) =>
							asset.displayPath.split("/").slice(0, 4).join("/"),
						),
					),
				],
				warnings,
			};
		},
		(error) =>
			installError(
				"gemini-extension-assets",
				error instanceof Error
					? error.message
					: "Failed to install Gemini extension assets",
			),
	);

export const installGeminiSmokeCommand = installGeminiSubagentValidationAssets;

export const verifyGeminiSmokeSetup = async (
	deps: GeminiVerifyDeps = {},
): Promise<GeminiVerificationResult> => {
	const assets = await loadGeminiBundleAssetManifest(bundleOptionsFor(deps));
	const primaryCommand = primaryCommandAsset(assets);
	const paths =
		deps.paths ??
		(primaryCommand
			? {
					commandFile: join(
						process.env.HOME ?? homedir(),
						primaryCommand.relativePath,
					),
					commandDisplayPath: primaryCommand.displayPath,
				}
			: getGeminiPaths());
	const getGeminiBinaryPath =
		deps.getGeminiBinaryPath ?? (() => Bun.which("gemini"));
	const pathExists = deps.pathExists ?? defaultPathExists;
	const geminiBinaryPath = getGeminiBinaryPath();
	const geminiInstalled = Boolean(geminiBinaryPath);
	const geminiVersion = geminiInstalled
		? await (deps.getGeminiVersion?.() ?? defaultGeminiVersion())
		: null;
	const commandInstalled = await pathExists(paths.commandFile);

	const issues: string[] = [];
	const remediation: string[] = [];

	if (!geminiInstalled) {
		const detail = getGeminiSmokeStatusDetail("degraded_missing_binary");
		if (detail.issue) issues.push(detail.issue);
		remediation.push(detail.remediation);
	}

	if (!commandInstalled) {
		issues.push(`Gemini smoke command missing: ${paths.commandDisplayPath}.`);
		remediation.push(
			getGeminiSmokeStatusDetail("degraded_missing_command").remediation,
		);
	}

	const status = !geminiInstalled
		? "degraded_missing_binary"
		: commandInstalled
			? "experimental_ready"
			: "degraded_missing_command";

	if (status === "experimental_ready") {
		remediation.push(getGeminiSmokeStatusDetail(status).remediation);
	}

	return {
		status,
		verified: status === "experimental_ready",
		geminiInstalled,
		geminiVersion,
		commandInstalled,
		commandPath: paths.commandFile,
		commandDisplayPath: paths.commandDisplayPath,
		bundleAssetCount: assets.length,
		issues,
		remediation,
	};
};

export {
	GEMINI_BOUNDARY_COMMAND_DISPLAY_PATH,
	GEMINI_BOUNDARY_COMMAND_INVOCATION,
	GEMINI_BOUNDARY_COMMAND_PROMPT_CONTRACT,
	GEMINI_BOUNDARY_COMMAND_RELATIVE_PATH,
	GEMINI_BOUNDARY_COMMAND_TOML,
} from "./boundary-command.js";
export type {
	GeminiBoundaryArtifactRegistration,
	GeminiBoundaryEvidence,
	GeminiBoundaryEvidenceArtifactResult,
	GeminiBoundaryEvidenceCommandResult,
	GeminiBoundaryEvidenceCommandRunner,
	GeminiBoundaryEvidenceContext,
	GeminiBoundaryEvidencePersistOptions,
	GeminiBoundaryEvidencePersistResult,
	GeminiBoundaryEvidenceWriteOptions,
	GeminiBoundaryMode,
	GeminiBoundaryScenario,
	GeminiBoundaryScenarioEvidence,
	GeminiBoundaryState,
	GeminiBoundaryStatus,
} from "./boundary-evidence.js";
export {
	createGeminiBoundaryEvidence,
	GEMINI_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
	GEMINI_BOUNDARY_HARNESS,
	GEMINI_BOUNDARY_JSON_FILENAME,
	GEMINI_BOUNDARY_MARKDOWN_FILENAME,
	GEMINI_BOUNDARY_MODES,
	GEMINI_BOUNDARY_SCENARIOS,
	GEMINI_BOUNDARY_STATES,
	GEMINI_BOUNDARY_STATUSES,
	GEMINI_BOUNDARY_WORKFLOW_NAME,
	getGeminiBoundaryEvidenceRelativePaths,
	persistGeminiBoundaryEvidence,
	renderGeminiBoundaryEvidenceMarkdown,
	writeGeminiBoundaryEvidenceArtifacts,
} from "./boundary-evidence.js";
export type { GeminiBundleAssetManifestOptions } from "./bundle-assets.js";
export {
	GEMINI_BUNDLE_DIR_ENV,
	geminiExtensionDisplayRoot,
	geminiExtensionRelativeRoot,
	getGeminiManifestAsset,
	loadGeminiBundleAssetManifest,
} from "./bundle-assets.js";
export type {
	GeminiAssetContentCheck,
	GeminiAssetFreshnessStatus,
	GeminiAssetKind,
	GeminiAssetLifecycleStatus,
	GeminiAssetManifestEntry,
	GeminiLifecycleStage,
	GeminiLifecycleState,
	GeminiLifecycleStatus,
	GeminiManifestLifecycleOptions,
	GeminiManifestRefreshOptions,
	GeminiManifestRefreshResult,
	GeminiSafeRemovalResult,
	GeminiSafeRemovalStatus,
} from "./lifecycle.js";
export {
	GEMINI_ASSET_CONTENT_CHECKS,
	GEMINI_ASSET_FRESHNESS_STATUSES,
	GEMINI_ASSET_KINDS,
	GEMINI_LIFECYCLE_STAGES,
	GEMINI_LIFECYCLE_STATES,
	GEMINI_P3_LIFECYCLE_GAP_CONSTRAINT,
	GEMINI_SAFE_REMOVAL_RESULTS,
	getGeminiManifestLifecycleStatus,
	getGeminiManifestOwnedRelativePaths,
	refreshGeminiManifestAssets,
} from "./lifecycle.js";
export type {
	GeminiAcknowledgementCaveat,
	GeminiAcknowledgementEvidence,
	GeminiAcknowledgementScope,
	GeminiCustomSubagentEvidence,
	GeminiDelegatedFailure,
	GeminiDelegatedFailureEvidence,
	GeminiDelegationEvidence,
	GeminiDelegationEvidenceStatus,
	GeminiFanoutEvidence,
	GeminiFanoutOutput,
	GeminiInstallResult,
	GeminiPaths,
	GeminiSmokeStatus,
	GeminiStatusDetail,
	GeminiSupportClassificationStatus,
	GeminiVerificationResult,
	GeminiWorkflowClass,
	GeminiWorkflowSupportClassification,
} from "./models.js";
export {
	GEMINI_ACKNOWLEDGEMENT_SCOPES,
	GEMINI_AUTO_INSTALL_SKIP_GUIDANCE,
	GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS,
	GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
	GEMINI_DELEGATION_EVIDENCE_STATUSES,
	GEMINI_EXPERIMENTAL_GUIDANCE,
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES,
	GEMINI_SMOKE_COMMAND_INVOCATION,
	GEMINI_SMOKE_STATUS_DETAILS,
	GEMINI_SUPPORT_CLASSIFICATION_STATUSES,
	getGeminiSmokeStatusDetail,
} from "./models.js";
export type {
	GeminiRuntimeContractEvaluation,
	GeminiRuntimeContractEvidence,
	GeminiRuntimeContractWorkflowResult,
	GeminiRuntimeWorkflowEvidence,
	GeminiRuntimeWorkflowStatus,
	GeminiWorkflowAttemptAttribution,
} from "./runtime-contract.js";
export {
	attributeGeminiWorkflowAttempt,
	evaluateGeminiRuntimeContract,
	GEMINI_RUNTIME_CONTRACT_SCHEMA_VERSION,
	GEMINI_RUNTIME_WORKFLOW_STATUSES,
	loadGeminiWorkflowSupportMatrixFromAssets,
	parseGeminiWorkflowSupportMatrix,
} from "./runtime-contract.js";
export {
	GEMINI_EXTENSION_DISPLAY_DIR,
	GEMINI_EXTENSION_NAME,
	GEMINI_EXTENSION_RELATIVE_DIR,
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
} from "./smoke-command.js";
export {
	GEMINI_ALPHA_AGENT_MARKDOWN,
	GEMINI_ALPHA_AGENT_RELATIVE_PATH,
	GEMINI_BETA_AGENT_MARKDOWN,
	GEMINI_BETA_AGENT_RELATIVE_PATH,
	GEMINI_EXTENSION_MANIFEST_DISPLAY_PATH,
	GEMINI_EXTENSION_MANIFEST_JSON,
	GEMINI_EXTENSION_MANIFEST_RELATIVE_PATH,
	GEMINI_FAIL_AGENT_MARKDOWN,
	GEMINI_FAIL_AGENT_RELATIVE_PATH,
	GEMINI_RUNTIME_FAIL_AGENT_MARKDOWN,
	GEMINI_RUNTIME_FAIL_AGENT_MODEL,
	GEMINI_RUNTIME_FAIL_AGENT_NAME,
	GEMINI_RUNTIME_FAIL_AGENT_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_DISPLAY_PATH,
	GEMINI_SUBAGENT_COMMAND_INVOCATION,
	GEMINI_SUBAGENT_COMMAND_RELATIVE_PATH,
	GEMINI_SUBAGENT_COMMAND_TOML,
} from "./subagent-command.js";
export type {
	GeminiSubagentEvidenceArtifactResult,
	GeminiSubagentEvidenceCommandResult,
	GeminiSubagentEvidenceCommandRunner,
	GeminiSubagentEvidenceContext,
	GeminiSubagentEvidencePersistOptions,
	GeminiSubagentEvidencePersistResult,
	GeminiSubagentEvidenceWriteOptions,
	GeminiSubagentReductionPayload,
} from "./subagent-evidence.js";
export {
	createGeminiSubagentEvidence,
	GEMINI_SUBAGENT_HARNESS,
	GEMINI_SUBAGENT_JSON_FILENAME,
	GEMINI_SUBAGENT_MARKDOWN_FILENAME,
	GEMINI_SUBAGENT_MARKERS,
	GEMINI_SUBAGENT_WORKFLOW_NAME,
	getGeminiSubagentEvidenceRelativePaths,
	persistGeminiSubagentEvidence,
	renderGeminiSubagentEvidenceMarkdown,
	writeGeminiSubagentEvidenceArtifacts,
} from "./subagent-evidence.js";
export type {
	GeminiUninstallOptions,
	GeminiUninstallResult,
} from "./uninstaller.js";
export { uninstallGeminiExtensionAssets } from "./uninstaller.js";

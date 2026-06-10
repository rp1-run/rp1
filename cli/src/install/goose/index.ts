import { homedir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { formatError, installError } from "../../../shared/errors.js";
import type { BundledAssets } from "../../assets/reader.js";
import { TOOLS_REGISTRY } from "../../config/supported-tools.generated.js";
import {
	findToolById,
	type ToolsRegistry,
} from "../../config/supported-tools.js";
import {
	type GooseBundleAssetManifestOptions,
	gooseAgentsDisplayRoot,
	gooseAgentsRelativeRoot,
	goosePluginNameFromDisplayDir,
	goosePluginsDisplayRoot,
	goosePluginsRelativeRoot,
	gooseRecipesDisplayRoot,
	gooseRecipesRelativeRoot,
	gooseSkillsDisplayRoot,
	gooseSkillsRelativeRoot,
	loadGooseBundleAssetManifest,
} from "./bundle-assets.js";
import type {
	GooseAssetManifestEntry,
	GooseLifecycleState,
} from "./lifecycle.js";
import {
	getGooseManifestLifecycleStatus,
	writeGooseManifestAssets,
} from "./lifecycle.js";
import type {
	GooseBinaryCheck,
	GooseInstallResult,
	GoosePaths,
	GooseRecipeCheckRecipeResult,
	GooseRecipeCheckResult,
	GooseRecipeCheckStatus,
	GooseRuntimeSmokeResult,
	GooseSupportMetadataResult,
	GooseVerificationResult,
	GooseVerificationStatus,
} from "./models.js";
import { getGooseStatusDetail } from "./models.js";

export interface GooseInstallOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly getGooseBinaryPath?: () => string | null;
	readonly assetManifest?: readonly GooseAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
}

export interface GooseVerifyDeps {
	readonly homeDir?: string;
	readonly getGooseBinaryPath?: () => string | null;
	readonly getGooseVersion?: (binaryPath: string) => Promise<string | null>;
	readonly assetManifest?: readonly GooseAssetManifestEntry[];
	readonly bundledAssets?: BundledAssets;
	readonly distDir?: string;
	readonly readAssetFile?: (path: string) => Promise<string>;
	readonly runGooseRecipeValidate?: (
		binaryPath: string,
		recipePath: string,
	) => Promise<GooseCommandResult>;
	readonly runGooseRecipeRender?: (
		binaryPath: string,
		recipePath: string,
	) => Promise<GooseCommandResult>;
	readonly runtimeSmoke?: GooseRuntimeSmokeResult;
}

interface GooseCommandResult {
	readonly exitCode: number;
	readonly stdout: string;
	readonly stderr: string;
}

const homeDirFor = (homeDir?: string): string =>
	homeDir ?? process.env.HOME ?? homedir();

export const getGoosePaths = (
	homeDir = process.env.HOME ?? homedir(),
): GoosePaths => ({
	skillsRoot: join(homeDir, gooseSkillsRelativeRoot()),
	skillsDisplayRoot: gooseSkillsDisplayRoot(),
	agentsRoot: join(homeDir, gooseAgentsRelativeRoot()),
	agentsDisplayRoot: gooseAgentsDisplayRoot(),
	recipesRoot: join(homeDir, gooseRecipesRelativeRoot()),
	recipesDisplayRoot: gooseRecipesDisplayRoot(),
	pluginsRoot: join(homeDir, goosePluginsRelativeRoot()),
	pluginsDisplayRoot: goosePluginsDisplayRoot(),
});

const bundleOptionsFor = (
	options: GooseInstallOptions | GooseVerifyDeps,
): GooseBundleAssetManifestOptions => ({
	assetManifest: options.assetManifest,
	bundledAssets: options.bundledAssets,
	distDir: options.distDir,
});

const minGooseVersion = (): string =>
	findToolById(TOOLS_REGISTRY as ToolsRegistry, "goose")?.min_version ??
	"1.35.0";

const parseSemver = (
	value: string | null,
): readonly [number, number, number] | null => {
	if (!value) return null;
	const match = value.match(/(\d+)\.(\d+)\.(\d+)/);
	if (!match) return null;
	return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
};

const semverGte = (actual: string | null, minimum: string): boolean => {
	const parsedActual = parseSemver(actual);
	const parsedMinimum = parseSemver(minimum);
	if (!parsedActual || !parsedMinimum) return false;
	for (let i = 0; i < parsedMinimum.length; i++) {
		const a = parsedActual[i]!;
		const m = parsedMinimum[i]!;
		if (a > m) return true;
		if (a < m) return false;
	}
	return true;
};

const defaultGooseVersion = async (
	binaryPath: string,
): Promise<string | null> => {
	const proc = Bun.spawn([binaryPath, "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) return "unknown";

	const version = (await new Response(proc.stdout).text()).trim();
	return version.length > 0 ? version : "unknown";
};

const readGooseBinaryCheck = async (
	deps: GooseVerifyDeps,
): Promise<GooseBinaryCheck> => {
	const getGooseBinaryPath =
		deps.getGooseBinaryPath ?? (() => Bun.which("goose"));
	const binaryPath = getGooseBinaryPath();
	const minimum = minGooseVersion();

	if (!binaryPath) {
		const detail = getGooseStatusDetail("degraded_missing_binary");
		return {
			installed: false,
			binaryPath: null,
			version: null,
			minVersion: minimum,
			satisfiesMinVersion: false,
			issue: detail.issue,
			remediation: detail.remediation,
		};
	}

	const version = await (deps.getGooseVersion?.(binaryPath) ??
		defaultGooseVersion(binaryPath));
	const satisfiesMinVersion = semverGte(version, minimum);

	return {
		installed: true,
		binaryPath,
		version,
		minVersion: minimum,
		satisfiesMinVersion,
		issue: satisfiesMinVersion
			? null
			: `Goose ${minimum} or newer is required; found ${version ?? "unknown"}.`,
		remediation: satisfiesMinVersion
			? null
			: getGooseStatusDetail("degraded_unsupported_version").remediation,
	};
};

const pluginDisplayDirs = (
	assets: readonly GooseAssetManifestEntry[],
): readonly string[] => [
	...new Set(
		assets
			.filter(
				(asset) =>
					asset.kind === "support_metadata" ||
					asset.kind === "plugin_manifest" ||
					asset.kind === "metadata",
			)
			.map((asset) => asset.displayPath.split("/").slice(0, 4).join("/")),
	),
];

const countAssets = (
	assets: readonly GooseAssetManifestEntry[],
	kind: GooseAssetManifestEntry["kind"],
): number => assets.filter((asset) => asset.kind === kind).length;

export const installGooseBundleAssets = (
	options: GooseInstallOptions,
): TE.TaskEither<CLIError, GooseInstallResult> =>
	TE.tryCatch(
		async () => {
			const homeDir = homeDirFor(options.homeDir);
			const assets = await loadGooseBundleAssetManifest(
				bundleOptionsFor(options),
			);
			const binaryPath = options.getGooseBinaryPath?.() ?? Bun.which("goose");
			const warnings: string[] = [];

			if (!binaryPath) {
				warnings.push(
					"Goose CLI was not found in PATH. Install Goose CLI before running rp1 Goose recipes.",
				);
			}

			let versionMarkerWritten = false;
			if (!options.dryRun) {
				versionMarkerWritten = await writeGooseManifestAssets({
					homeDir,
					assets,
				});
			}

			return {
				paths: getGoosePaths(homeDir),
				assetsWritten: !options.dryRun,
				assets,
				assetCount: assets.length,
				skillCount: countAssets(assets, "skill"),
				agentCount: countAssets(assets, "agent"),
				recipeCount: countAssets(assets, "recipe"),
				metadataCount:
					countAssets(assets, "support_metadata") +
					countAssets(assets, "plugin_manifest") +
					countAssets(assets, "metadata"),
				pluginDisplayDirs: pluginDisplayDirs(assets),
				versionMarkerWritten,
				warnings,
			};
		},
		(error) =>
			installError(
				"goose-assets",
				error instanceof Error
					? error.message
					: "Failed to install Goose assets",
			),
	);

const commandOutput = (result: GooseCommandResult): string =>
	`${result.stdout}\n${result.stderr}`.trim();

const defaultRunGooseRecipeValidate = async (
	binaryPath: string,
	recipePath: string,
): Promise<GooseCommandResult> => {
	const proc = Bun.spawn([binaryPath, "recipe", "validate", recipePath], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

const defaultRunGooseRecipeRender = async (
	binaryPath: string,
	recipePath: string,
): Promise<GooseCommandResult> => {
	const proc = Bun.spawn(
		[
			binaryPath,
			"run",
			"--recipe",
			recipePath,
			"--render-recipe",
			"--params",
			"ARGUMENTS=",
			"--no-profile",
			"--with-builtin",
			"developer",
		],
		{
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	return { exitCode, stdout, stderr };
};

const recipeCheckRemediation = (status: GooseRecipeCheckStatus): string => {
	if (status === "passed") {
		return "Goose recipe validation and render checks passed.";
	}
	if (status === "missing_binary") {
		return getGooseStatusDetail("degraded_missing_binary").remediation;
	}
	if (status === "missing_assets") {
		return "Run `rp1 install goose` to install rp1 Goose recipes.";
	}
	if (status === "render_failed") {
		return getGooseStatusDetail("degraded_recipe_render_failed").remediation;
	}
	if (status === "validation_failed") {
		return getGooseStatusDetail("degraded_recipe_validation_failed")
			.remediation;
	}
	return "Run `rp1 verify goose` after installing Goose assets.";
};

const validateGooseRecipes = async (options: {
	readonly homeDir: string;
	readonly binaryPath: string | null;
	readonly recipeAssets: readonly GooseAssetManifestEntry[];
	readonly runGooseRecipeValidate?: GooseVerifyDeps["runGooseRecipeValidate"];
	readonly runGooseRecipeRender?: GooseVerifyDeps["runGooseRecipeRender"];
}): Promise<GooseRecipeCheckResult> => {
	if (!options.binaryPath) {
		return {
			status: "missing_binary",
			checked: false,
			renderedRecipeName: null,
			recipes: [],
			issue: getGooseStatusDetail("degraded_missing_binary").issue,
			remediation: recipeCheckRemediation("missing_binary"),
		};
	}

	if (options.recipeAssets.length === 0) {
		return {
			status: "missing_assets",
			checked: false,
			renderedRecipeName: null,
			recipes: [],
			issue: "No rp1 Goose recipes are present in the asset manifest.",
			remediation: recipeCheckRemediation("missing_assets"),
		};
	}

	const runValidate =
		options.runGooseRecipeValidate ?? defaultRunGooseRecipeValidate;
	const runRender = options.runGooseRecipeRender ?? defaultRunGooseRecipeRender;
	const recipes: GooseRecipeCheckRecipeResult[] = [];

	for (let i = 0; i < options.recipeAssets.length; i++) {
		const recipe = options.recipeAssets[i]!;
		const recipePath = join(options.homeDir, recipe.relativePath);
		const validationCommand = [
			options.binaryPath,
			"recipe",
			"validate",
			recipePath,
		] as const;
		const validation = await runValidate(options.binaryPath, recipePath);
		const validationStatus: GooseRecipeCheckStatus =
			validation.exitCode === 0 ? "passed" : "validation_failed";
		let renderStatus: GooseRecipeCheckStatus = "not_run";
		let renderCommand: readonly string[] | null = null;
		let renderIssue: string | null = null;

		if (i === 0 && validationStatus === "passed") {
			renderCommand = [
				options.binaryPath,
				"run",
				"--recipe",
				recipePath,
				"--render-recipe",
				"--params",
				"ARGUMENTS=",
				"--no-profile",
				"--with-builtin",
				"developer",
			] as const;
			const rendered = await runRender(options.binaryPath, recipePath);
			renderStatus = rendered.exitCode === 0 ? "passed" : "render_failed";
			renderIssue =
				renderStatus === "passed"
					? null
					: commandOutput(rendered) || "Goose recipe render failed.";
		}

		const validationIssue =
			validationStatus === "passed"
				? null
				: commandOutput(validation) || "Goose recipe validation failed.";

		recipes.push({
			recipeName: recipe.displayPath.split("/").at(-1) ?? recipe.displayPath,
			recipePath,
			displayPath: recipe.displayPath,
			validationStatus,
			renderStatus,
			validationCommand,
			renderCommand,
			issue: validationIssue ?? renderIssue,
		});
	}

	const status: GooseRecipeCheckStatus = recipes.some(
		(recipe) => recipe.validationStatus === "validation_failed",
	)
		? "validation_failed"
		: recipes.some((recipe) => recipe.renderStatus === "render_failed")
			? "render_failed"
			: "passed";

	return {
		status,
		checked: true,
		renderedRecipeName:
			recipes.find((recipe) => recipe.renderStatus !== "not_run")?.recipeName ??
			null,
		recipes,
		issue:
			status === "passed"
				? null
				: (recipes.find((recipe) => recipe.issue)?.issue ??
					"Goose recipe checks did not pass."),
		remediation: recipeCheckRemediation(status),
	};
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const REQUIRED_UNSUPPORTED_SCOPE = [
	"ACP sidecar work",
	"protocol integration",
	"eval harness expansion",
	"PR-review expansion",
	"nested subagents and nested delegation",
	"interactive headless approvals and user elicitation",
	"broad workflow parity",
] as const;

const isStringArray = (value: unknown): value is string[] =>
	Array.isArray(value) && value.every((item) => typeof item === "string");

const readSupportMetadata = (
	assets: readonly GooseAssetManifestEntry[],
): GooseSupportMetadataResult => {
	const metadataAssets = assets.filter(
		(asset) => asset.kind === "support_metadata",
	);

	if (metadataAssets.length === 0) {
		return {
			status: "missing",
			checked: false,
			metadataFiles: [],
			supportClaims: [],
			unsupportedScopes: [],
			recipeCount: 0,
			agentCount: 0,
			issue: "Goose support metadata is missing from the asset manifest.",
			remediation: getGooseStatusDetail("degraded_support_metadata_failed")
				.remediation,
		};
	}

	let recipeCount = 0;
	let agentCount = 0;
	const metadataFiles: string[] = [];
	const supportClaims: string[] = [];
	const unsupportedScopes = new Set<string>();

	for (const asset of metadataAssets) {
		metadataFiles.push(asset.displayPath);
		try {
			const parsed = JSON.parse(asset.expectedContent) as unknown;
			const supportClaim = isRecord(parsed) ? parsed.supportClaim : null;
			const supportScope = isRecord(parsed) ? parsed.supportScope : null;
			const unsupportedScope = isRecord(parsed)
				? parsed.unsupportedScope
				: null;
			const capabilities = isRecord(parsed) ? parsed.capabilities : null;
			if (
				!isRecord(parsed) ||
				!isRecord(parsed.runtime) ||
				parsed.runtime.harness !== "goose" ||
				supportScope !== "generated-core-harness-assets" ||
				!Array.isArray(parsed.recipes) ||
				!Array.isArray(parsed.agents) ||
				typeof supportClaim !== "string" ||
				!isStringArray(unsupportedScope) ||
				!isRecord(capabilities)
			) {
				throw new Error(
					"metadata contract missing runtime, support scope, recipes, agents, support claim, unsupported scope, or capabilities",
				);
			}
			const shellAndFilesystem = capabilities.shellAndFilesystem;
			const delegation = capabilities.delegation;
			const nestedDelegation = capabilities.nestedDelegation;
			const interactiveInput = capabilities.interactiveInput;
			const webAccess = capabilities.webAccess;
			if (
				!isRecord(shellAndFilesystem) ||
				shellAndFilesystem.status !== "supported" ||
				shellAndFilesystem.extension !== "developer" ||
				!isStringArray(shellAndFilesystem.tools) ||
				!isRecord(delegation) ||
				delegation.status !== "unsupported_fail_closed" ||
				!isRecord(nestedDelegation) ||
				nestedDelegation.status !== "unsupported_fail_closed" ||
				!isRecord(interactiveInput) ||
				interactiveInput.status !== "unsupported_fail_closed" ||
				!isRecord(webAccess) ||
				webAccess.status !== "unsupported_fail_closed"
			) {
				throw new Error(
					"metadata capabilities must declare developer filesystem support and fail-closed unsupported runtime paths",
				);
			}
			const missingUnsupportedScope = REQUIRED_UNSUPPORTED_SCOPE.filter(
				(scope) => !unsupportedScope.includes(scope),
			);
			if (missingUnsupportedScope.length > 0) {
				throw new Error(
					`metadata contract missing unsupported scope: ${missingUnsupportedScope.join(", ")}`,
				);
			}
			supportClaims.push(supportClaim);
			for (const scope of unsupportedScope) unsupportedScopes.add(scope);
			recipeCount += parsed.recipes.length;
			agentCount += parsed.agents.length;
		} catch (error) {
			return {
				status: "invalid",
				checked: true,
				metadataFiles,
				supportClaims,
				unsupportedScopes: [...unsupportedScopes],
				recipeCount,
				agentCount,
				issue:
					error instanceof Error
						? `Invalid Goose support metadata in ${asset.displayPath}: ${error.message}.`
						: `Invalid Goose support metadata in ${asset.displayPath}.`,
				remediation: getGooseStatusDetail("degraded_support_metadata_failed")
					.remediation,
			};
		}
	}

	return {
		status: "passed",
		checked: true,
		metadataFiles,
		supportClaims,
		unsupportedScopes: [...unsupportedScopes],
		recipeCount,
		agentCount,
		issue: null,
		remediation:
			"Goose support metadata is present and declares harness=goose.",
	};
};

const defaultRuntimeSmoke = (): GooseRuntimeSmokeResult => ({
	status: "not_run",
	checked: false,
	evidencePath: null,
	issue: "No optional Goose runtime smoke evidence was supplied.",
	remediation:
		"Run the opt-in Goose runtime smoke when available; verification does not start a model session.",
});

const statusFrom = (
	binary: GooseBinaryCheck,
	lifecycleState: GooseLifecycleState,
	recipeCheck: GooseRecipeCheckResult,
	supportMetadata: GooseSupportMetadataResult,
	runtimeSmoke: GooseRuntimeSmokeResult,
): GooseVerificationStatus => {
	if (!binary.installed) return "degraded_missing_binary";
	if (!binary.satisfiesMinVersion) return "degraded_unsupported_version";
	if (lifecycleState === "removed" || lifecycleState === "missing") {
		return "degraded_missing_assets";
	}
	if (lifecycleState === "partial") return "degraded_missing_assets";
	if (lifecycleState === "blocked") return "degraded_blocked_assets";
	if (lifecycleState === "stale") return "degraded_stale_assets";
	if (recipeCheck.status === "validation_failed") {
		return "degraded_recipe_validation_failed";
	}
	if (recipeCheck.status === "render_failed") {
		return "degraded_recipe_render_failed";
	}
	if (supportMetadata.status !== "passed") {
		return "degraded_support_metadata_failed";
	}
	if (runtimeSmoke.status === "failed" || runtimeSmoke.status === "blocked") {
		return "degraded_runtime_smoke_failed";
	}
	return "ready";
};

export const verifyGooseBundleSetup = async (
	deps: GooseVerifyDeps = {},
): Promise<GooseVerificationResult> => {
	const homeDir = homeDirFor(deps.homeDir);
	const assets = await loadGooseBundleAssetManifest(bundleOptionsFor(deps));
	const lifecycle = await getGooseManifestLifecycleStatus({
		homeDir,
		stage: "verify",
		assetManifest: deps.assetManifest,
		bundledAssets: deps.bundledAssets,
		distDir: deps.distDir,
		readAssetFile: deps.readAssetFile,
	})();
	const lifecycleState = E.isRight(lifecycle)
		? lifecycle.right.state
		: "blocked";
	const binary = await readGooseBinaryCheck(deps);
	const recipeCheck = await validateGooseRecipes({
		homeDir,
		binaryPath: binary.binaryPath,
		recipeAssets: assets.filter((asset) => asset.kind === "recipe"),
		runGooseRecipeValidate: deps.runGooseRecipeValidate,
		runGooseRecipeRender: deps.runGooseRecipeRender,
	});
	const supportMetadata = readSupportMetadata(assets);
	const runtimeSmoke = deps.runtimeSmoke ?? defaultRuntimeSmoke();
	const status = statusFrom(
		binary,
		lifecycleState,
		recipeCheck,
		supportMetadata,
		runtimeSmoke,
	);
	const detail = getGooseStatusDetail(status);
	const issues: string[] = [];
	const remediation: string[] = [];

	if (detail.issue) issues.push(detail.issue);
	remediation.push(detail.remediation);
	if (binary.issue) issues.push(binary.issue);
	if (binary.remediation) remediation.push(binary.remediation);

	if (E.isLeft(lifecycle)) {
		issues.push(formatError(lifecycle.left, false));
	} else {
		if (lifecycle.right.issue) issues.push(lifecycle.right.issue);
		if (lifecycle.right.versionMarker.issue) {
			issues.push(lifecycle.right.versionMarker.issue);
		}
		for (const asset of lifecycle.right.assets.filter(
			(assetStatus) => assetStatus.freshness !== "current",
		)) {
			if (asset.issue) issues.push(asset.issue);
		}
		if (lifecycle.right.userAction) {
			remediation.push(lifecycle.right.userAction);
		}
	}

	if (recipeCheck.issue) issues.push(recipeCheck.issue);
	remediation.push(recipeCheck.remediation);
	if (supportMetadata.issue) issues.push(supportMetadata.issue);
	remediation.push(supportMetadata.remediation);
	if (runtimeSmoke.status !== "not_run" && runtimeSmoke.issue) {
		issues.push(runtimeSmoke.issue);
	}
	if (runtimeSmoke.status !== "not_run") {
		remediation.push(runtimeSmoke.remediation);
	}

	return {
		status,
		verified: status === "ready",
		binary,
		paths: getGoosePaths(homeDir),
		bundleAssetCount: assets.length,
		recipeCheck,
		supportMetadata,
		runtimeSmoke,
		issues: [...new Set(issues)],
		remediation: [...new Set(remediation)],
	};
};

export const gooseBundleScope = (result: {
	readonly pluginDisplayDirs: readonly string[];
}): readonly string[] =>
	result.pluginDisplayDirs.map(goosePluginNameFromDisplayDir);

export {
	GOOSE_BUNDLE_DIR_ENV,
	getGooseManifestAsset,
	gooseAgentsDisplayRoot,
	gooseAgentsRelativeRoot,
	goosePluginNameFromDisplayDir,
	goosePluginsDisplayRoot,
	goosePluginsRelativeRoot,
	gooseRecipesDisplayRoot,
	gooseRecipesRelativeRoot,
	gooseSkillsDisplayRoot,
	gooseSkillsRelativeRoot,
	loadGooseBundleAssetManifest,
} from "./bundle-assets.js";
export type {
	GooseAssetContentCheck,
	GooseAssetFreshnessStatus,
	GooseAssetKind,
	GooseAssetLifecycleStatus,
	GooseAssetManifestEntry,
	GooseLifecycleStage,
	GooseLifecycleState,
	GooseLifecycleStatus,
	GooseManifestLifecycleOptions,
	GooseManifestRefreshOptions,
	GooseManifestRefreshResult,
	GooseVersionMarkerLifecycleStatus,
	GooseVersionMarkerStatus,
} from "./lifecycle.js";
export {
	GOOSE_ASSET_CONTENT_CHECKS,
	GOOSE_ASSET_FRESHNESS_STATUSES,
	GOOSE_ASSET_KINDS,
	GOOSE_LIFECYCLE_STAGES,
	GOOSE_LIFECYCLE_STATES,
	GOOSE_VERSION_MARKER_STATUSES,
	getGooseManifestLifecycleStatus,
	getGooseManifestOwnedRelativePaths,
	refreshGooseManifestAssets,
} from "./lifecycle.js";
export type {
	GooseBinaryCheck,
	GooseInstallResult,
	GoosePaths,
	GooseRecipeCheckRecipeResult,
	GooseRecipeCheckResult,
	GooseRecipeCheckStatus,
	GooseRuntimeSmokeResult,
	GooseRuntimeSmokeStatus,
	GooseStatusDetail,
	GooseSupportMetadataResult,
	GooseSupportMetadataStatus,
	GooseVerificationResult,
	GooseVerificationStatus,
} from "./models.js";
export { GOOSE_STATUS_DETAILS, getGooseStatusDetail } from "./models.js";

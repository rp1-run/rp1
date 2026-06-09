import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import {
	type GooseLifecycleState,
	type GooseLifecycleStatus,
	type GooseVerifyDeps,
	getGooseManifestLifecycleStatus,
	getGooseStatusDetail,
	verifyGooseBundleSetup,
} from "../../install/goose/index.js";
import { colorFns } from "../../lib/colors.js";

const { green, yellow, red, dim, bold, cyan } = colorFns;

const lifecycleMessageFor = (
	state: GooseLifecycleState,
): Pick<GooseLifecycleStatus, "issue" | "userAction"> => {
	switch (state) {
		case "current":
			return {
				issue: null,
				userAction:
					"Run rp1 Goose recipes with `goose run --recipe <recipe-name> --params ARGUMENTS='<args>'`.",
			};
		case "removed":
			return {
				issue: "No rp1-owned Goose assets are installed.",
				userAction: "Run `rp1 install goose` before using rp1 Goose recipes.",
			};
		case "missing":
			return {
				issue: "A manifest-owned Goose asset is missing.",
				userAction:
					"Run `rp1 install goose` to restore the missing Goose asset.",
			};
		case "partial":
			return {
				issue: "Only part of the rp1 Goose manifest is installed.",
				userAction:
					"Run `rp1 install goose` to reinstall the complete Goose asset set.",
			};
		case "stale":
			return {
				issue:
					"One or more rp1 Goose assets or version markers do not match the current manifest.",
				userAction:
					"Run `rp1 install goose` to refresh stale manifest-owned Goose assets.",
			};
		case "blocked":
			return {
				issue: "rp1 could not read one or more Goose assets.",
				userAction:
					"Fix local file permissions, then rerun `rp1 verify goose`.",
			};
	}
};

const loadGooseManifestLifecycle = async (
	deps: GooseVerifyDeps = {},
): Promise<GooseLifecycleStatus> => {
	const result = await getGooseManifestLifecycleStatus({
		homeDir: deps.homeDir,
		stage: "verify",
		assetManifest: deps.assetManifest,
		bundledAssets: deps.bundledAssets,
		distDir: deps.distDir,
		readAssetFile: deps.readAssetFile,
	})();

	if (E.isLeft(result)) {
		const state: GooseLifecycleState = "blocked";
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

const lifecycleColor = (
	state: GooseLifecycleState,
): ((value: string) => string) => {
	if (state === "current") return green;
	if (state === "removed" || state === "stale" || state === "blocked") {
		return red;
	}
	return yellow;
};

const printGooseManifestLifecycle = (lifecycle: GooseLifecycleStatus): void => {
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
	console.log(
		`Version marker: ${lifecycle.versionMarker.freshness} (${lifecycle.versionMarker.installedVersion ?? "none"} -> ${lifecycle.versionMarker.currentVersion})`,
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
};

const checkColor = (passed: boolean): ((value: string) => string) =>
	passed ? green : yellow;

export const executeVerifyGoose = async (
	_logger: Logger,
	deps: GooseVerifyDeps = {},
): Promise<boolean> => {
	const result = await verifyGooseBundleSetup(deps);
	const lifecycle = await loadGooseManifestLifecycle(deps);
	const statusDetail = getGooseStatusDetail(result.status);
	const statusLabel = result.verified
		? green(result.status)
		: yellow(result.status);
	const binaryLabel =
		result.binary.installed && result.binary.satisfiesMinVersion
			? green(result.binary.version ?? "unknown")
			: red(result.binary.version ?? "not found");
	const recipeLabel = checkColor(result.recipeCheck.status === "passed")(
		result.recipeCheck.status,
	);
	const metadataLabel = checkColor(result.supportMetadata.status === "passed")(
		result.supportMetadata.status,
	);
	const smokeLabel = checkColor(result.runtimeSmoke.status === "passed")(
		result.runtimeSmoke.status,
	);

	console.log(bold("\nGoose CLI verification\n"));
	console.log(
		`Support: ${green("experimental")} (${dim("verified Goose core recipe harness")})`,
	);
	console.log(`State: ${statusLabel}`);
	console.log(`Meaning: ${statusDetail.label}`);
	console.log("");
	console.log("+------------------+----------------------+--------+");
	console.log("| Component        | Value                | Status |");
	console.log("+------------------+----------------------+--------+");
	console.log(
		`| Goose CLI        | ${(result.binary.version ?? "not found").padEnd(20)} | ${binaryLabel.padEnd(6)} |`,
	);
	console.log(
		`| Manifest assets  | ${String(result.bundleAssetCount).padEnd(20)} | ${lifecycleColor(lifecycle.state)(lifecycle.state).padEnd(6)} |`,
	);
	console.log(
		`| Recipes          | ${String(result.recipeCheck.recipes.length).padEnd(20)} | ${recipeLabel.padEnd(6)} |`,
	);
	console.log(
		`| Support metadata | ${String(result.supportMetadata.metadataFiles.length).padEnd(20)} | ${metadataLabel.padEnd(6)} |`,
	);
	console.log(
		`| Runtime smoke    | ${(result.runtimeSmoke.evidencePath ?? "not supplied").padEnd(20)} | ${smokeLabel.padEnd(6)} |`,
	);
	console.log("+------------------+----------------------+--------+");

	printGooseManifestLifecycle(lifecycle);

	console.log("");
	console.log(bold("Recipe validation:"));
	console.log(
		`State: ${checkColor(result.recipeCheck.status === "passed")(result.recipeCheck.status)}`,
	);
	if (result.recipeCheck.renderedRecipeName) {
		console.log(`Rendered: ${result.recipeCheck.renderedRecipeName}`);
	}
	for (const recipe of result.recipeCheck.recipes.filter(
		(recipe) => recipe.issue,
	)) {
		console.log(yellow(`  - ${recipe.displayPath}: ${recipe.issue}`));
	}

	console.log("");
	console.log(bold("Support metadata:"));
	console.log(
		`State: ${checkColor(result.supportMetadata.status === "passed")(result.supportMetadata.status)}`,
	);
	if (result.supportMetadata.supportClaims.length > 0) {
		console.log(`Claim: ${result.supportMetadata.supportClaims[0]}`);
	}
	if (result.supportMetadata.unsupportedScopes.length > 0) {
		console.log(
			`Unsupported scope: ${result.supportMetadata.unsupportedScopes.join(", ")}`,
		);
	}
	console.log(`Recipes declared: ${result.supportMetadata.recipeCount}`);
	console.log(`Agents declared: ${result.supportMetadata.agentCount}`);

	console.log("");
	console.log(bold("Runtime smoke:"));
	console.log(`State: ${smokeLabel}`);
	if (result.runtimeSmoke.evidencePath) {
		console.log(`Evidence: ${result.runtimeSmoke.evidencePath}`);
	}
	if (result.runtimeSmoke.issue) {
		console.log(yellow(`Issue: ${result.runtimeSmoke.issue}`));
	}

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
			console.log(cyan(`  ${step}`));
		}
	}

	if (result.verified && lifecycle.state === "current") {
		console.log(green(bold("\nGoose CLI ready")));
		return true;
	}

	console.log(yellow(bold("\nGoose lifecycle path is degraded")));
	return false;
};

export const verifyGooseSubcommand = new Command("goose")
	.description(
		"Verify Goose CLI assets, recipes, support metadata, and smoke status",
	)
	.addHelpText(
		"after",
		`
Examples:
  rp1 verify goose    Verify Goose CLI setup and rp1 Goose assets
`,
	)
	.action(async (_options, command) => {
		const logger = command.parent?.parent?._logger as Logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ok = await executeVerifyGoose(logger);
		if (!ok) {
			process.exit(1);
		}
	});

/**
 * Install parent command module.
 * Provides `rp1 install` with subcommands for different agentic tools.
 * When run without a subcommand, auto-detects platforms and installs to all.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { TOOLS_REGISTRY } from "../../config/supported-tools.generated.js";
import {
	isToolEnabled,
	loadToolsRegistry,
	type ToolsRegistry,
} from "../../config/supported-tools.js";
import type { VerificationResult } from "../../init/models.js";
import {
	verifyClaudeCodePlugins,
	verifyCodexPlugins,
	verifyCopilotPlugins,
	verifyOpenCodePlugins,
} from "../../init/steps/verification.js";
import {
	type AntigravityLifecycleStatus,
	getAntigravityManifestLifecycleStatus,
	verifyAntigravityBundleSetup,
} from "../../install/antigravity/index.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installAllDetectedTools,
	installForSpecificTool,
	type ToolInstallResult,
} from "../../shared/install-core.js";
import { installAllSubcommand } from "./all.js";
import { installAntigravitySubcommand } from "./antigravity.js";
import { installClaudeCodeSubcommand } from "./claude-code.js";
import { installCodexSubcommand } from "./codex.js";
import { installCopilotSubcommand } from "./copilot.js";
import { installOpenCodeSubcommand } from "./opencode.js";

const { green, yellow, red, dim, bold } = colorFns;

const antigravityLifecycleStatus = (
	lifecycle: AntigravityLifecycleStatus,
): string => {
	if (lifecycle.state === "current") return green("[OK]");
	if (lifecycle.state === "blocked" || lifecycle.state === "stale") {
		return red("[MISS]");
	}
	return yellow("[WARN]");
};

const antigravityLifecycleAssetCounts = (
	lifecycle: AntigravityLifecycleStatus,
): {
	readonly current: number;
	readonly missing: number;
	readonly stale: number;
	readonly blocked: number;
} => ({
	current: lifecycle.assets.filter((asset) => asset.freshness === "current")
		.length,
	missing: lifecycle.assets.filter((asset) => asset.freshness === "missing")
		.length,
	stale: lifecycle.assets.filter((asset) => asset.freshness === "stale").length,
	blocked: lifecycle.assets.filter((asset) => asset.freshness === "unknown")
		.length,
});

const printAntigravityLifecycleVerification = (
	lifecycle: AntigravityLifecycleStatus,
): void => {
	const counts = antigravityLifecycleAssetCounts(lifecycle);
	console.log(
		`  ${antigravityLifecycleStatus(lifecycle)} Antigravity manifest lifecycle (${dim(lifecycle.state)})`,
	);
	console.log(
		dim(
			`    - stage=${lifecycle.stage}; assets=${counts.current}/${lifecycle.assets.length} current, ${counts.missing} missing, ${counts.stale} stale, ${counts.blocked} blocked`,
		),
	);
	console.log(
		dim(
			`    - version-marker=${lifecycle.versionMarker.freshness}; installed=${lifecycle.versionMarker.installedVersion ?? "none"}; current=${lifecycle.versionMarker.currentVersion}`,
		),
	);
	for (const asset of lifecycle.assets.filter(
		(asset) => asset.freshness !== "current",
	)) {
		console.log(yellow(`    - ${asset.asset.displayPath}: ${asset.freshness}`));
	}
	if (lifecycle.issue) {
		console.log(yellow(`    - ${lifecycle.issue}`));
	}
	if (lifecycle.userAction) {
		console.log(dim(`    - Next action: ${lifecycle.userAction}`));
	}
};

async function runAntigravityPostInstallVerification(): Promise<boolean> {
	const antigravityResult = await verifyAntigravityBundleSetup();
	const lifecycleResult = await getAntigravityManifestLifecycleStatus({
		stage: "verify",
	})();
	const bundleStatus = antigravityResult.verified
		? green("[OK]")
		: yellow("[WARN]");

	console.log(
		`  ${bundleStatus} Antigravity CLI package validation (${dim(antigravityResult.status)})`,
	);

	if (E.isLeft(lifecycleResult)) {
		console.log(
			`  ${red("[MISS]")} Antigravity manifest lifecycle (${dim("failed")})`,
		);
		console.log(
			yellow(
				`    - ${formatError(lifecycleResult.left, process.stderr.isTTY ?? false)}`,
			),
		);
	} else {
		printAntigravityLifecycleVerification(lifecycleResult.right);
	}

	for (const issue of antigravityResult.issues) {
		console.log(yellow(`    - ${issue}`));
	}

	return (
		antigravityResult.verified &&
		(E.isRight(lifecycleResult)
			? lifecycleResult.right.state === "current"
			: false)
	);
}

/**
 * Run post-install verification for successfully installed tools.
 * Verifies that plugins are actually present and correctly configured.
 */
async function runPostInstallVerification(
	successfulTools: readonly ToolInstallResult[],
): Promise<void> {
	const toolIds = successfulTools.map((t) => t.toolId);
	if (toolIds.length === 0) return;

	console.log(bold("Verifying installation..."));
	console.log("");

	let allVerified = true;

	for (const toolId of toolIds) {
		let result: VerificationResult | null = null;

		if (toolId === "claude-code") {
			result = await verifyClaudeCodePlugins();
		} else if (toolId === "codex") {
			result = await verifyCodexPlugins();
		} else if (toolId === "copilot") {
			result = await verifyCopilotPlugins();
		} else if (toolId === "opencode") {
			result = await verifyOpenCodePlugins();
		}

		if (toolId === "antigravity") {
			if (!(await runAntigravityPostInstallVerification())) {
				allVerified = false;
			}
			continue;
		}

		if (!result) continue;

		for (const plugin of result.plugins) {
			const status = plugin.installed ? green("[OK]") : red("[MISS]");
			const version = plugin.version ?? "not found";
			console.log(`  ${status} ${plugin.name} (${dim(version)})`);
		}

		if (result.issues.length > 0) {
			for (const issue of result.issues) {
				console.log(yellow(`    - ${issue}`));
			}
		}

		if (!result.verified) {
			allVerified = false;
		}
	}

	console.log("");
	if (allVerified) {
		console.log(green("Verification passed"));
	} else {
		console.log(
			yellow("Verification found issues. Run `rp1 verify` for details."),
		);
	}
}

/**
 * Parent command: rp1 install
 * When run without a subcommand, auto-detects platforms and installs to all.
 * Subcommands target specific platforms.
 */
export const installParentCommand = new Command("install")
	.description("Install rp1 plugins to agentic tools")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts")
	.option(
		"-p, --platform <platform>",
		"Target a specific platform (claude-code, opencode, codex, copilot, antigravity)",
	)
	.addHelpText(
		"after",
		`
When run without a subcommand, auto-detects installed platforms and installs to all.
Use --platform to target a specific platform.

Subcommands:
  claude-code    Install plugins to Claude Code
  opencode       Install plugins to OpenCode
  codex          Install plugins to Codex CLI
  copilot        Install plugins to Copilot CLI
  antigravity    Install Antigravity CLI package assets
  all            Install plugins to all detected tools

Examples:
  rp1 install                            Auto-detect and install to all platforms
  rp1 install --platform claude-code     Install to Claude Code only
  rp1 install claude-code                Install to Claude Code (subcommand)
  rp1 install opencode                   Install to OpenCode (subcommand)
  rp1 install copilot                    Install to Copilot CLI (subcommand)
  rp1 install antigravity                Install Antigravity CLI package assets
  rp1 install all                        Install to all detected tools
  rp1 install --dry-run                  Preview installation
  rp1 install -y                         Skip confirmation prompts
`,
	)
	.action(async (options, command) => {
		const logger = command.parent?._logger as Logger;
		const isTTY = command.parent?._isTTY ?? false;
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: options.dryRun ?? false,
			skipPrompt: options.yes ?? false,
		};

		console.log("");
		console.log(bold("Installing rp1 plugins to all detected tools"));
		console.log("");

		spinner.start("Loading tools registry...");
		const registry = await loadToolsRegistry();
		spinner.succeed("Tools registry loaded");

		// If --platform is specified, install to that specific platform
		if (options.platform) {
			const result = await installForSpecificTool(
				options.platform,
				registry,
				ctx,
			)();

			if (E.isLeft(result)) {
				console.error(formatError(result.left, process.stderr.isTTY ?? false));
				process.exit(getExitCode(result.left));
			}

			const toolResult = result.right;
			console.log("");
			if (toolResult.success) {
				console.log(green(`  [OK] ${toolResult.toolName}`));
				for (const plugin of toolResult.pluginsInstalled) {
					console.log(dim(`       - ${plugin}`));
				}
			} else if (toolResult.skipped) {
				console.log(yellow(`  [SKIP] ${toolResult.toolName}`));
			} else {
				console.log(yellow(`  [WARN] ${toolResult.toolName}`));
				if (toolResult.error) {
					console.log(dim(`         ${formatError(toolResult.error, false)}`));
				}
			}

			for (const warning of toolResult.warnings) {
				console.log(yellow(`         ${warning}`));
			}

			console.log("");

			if (toolResult.success && !ctx.dryRun) {
				await runPostInstallVerification([toolResult]);
				console.log("");
			}

			console.log(
				dim(
					"Restart your agentic tools and run /help to see available rp1 skills.",
				),
			);
			return;
		}

		// Default: install to all detected platforms
		const result = await installAllDetectedTools(registry, ctx)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		const installResult = result.right;

		console.log("");
		console.log(bold("Installation Results:"));
		console.log("");

		for (const toolResult of installResult.results) {
			if (toolResult.success) {
				console.log(green(`  [OK] ${toolResult.toolName}`));
				if (toolResult.pluginsInstalled.length > 0) {
					for (const plugin of toolResult.pluginsInstalled) {
						console.log(dim(`       - ${plugin}`));
					}
				}
			} else if (toolResult.skipped) {
				console.log(yellow(`  [SKIP] ${toolResult.toolName}`));
			} else {
				console.log(yellow(`  [WARN] ${toolResult.toolName}`));
				if (toolResult.error) {
					console.log(dim(`         ${formatError(toolResult.error, false)}`));
				}
			}

			for (const warning of toolResult.warnings) {
				console.log(yellow(`         ${warning}`));
			}
		}

		console.log("");
		if (installResult.installed > 0) {
			console.log(
				green(
					`Installed rp1 plugins to ${installResult.installed} tool(s) successfully!`,
				),
			);

			if (!ctx.dryRun) {
				console.log("");
				const successfulTools = installResult.results.filter((r) => r.success);
				await runPostInstallVerification(successfulTools);
			}
		} else {
			console.log(yellow("No tools were installed."));
		}

		console.log("");
		console.log(
			dim(
				"Restart your agentic tools and run /help to see available rp1 skills.",
			),
		);
	});

installParentCommand.addCommand(installClaudeCodeSubcommand);
installParentCommand.addCommand(installOpenCodeSubcommand);

const codexInstallEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"codex",
);
installParentCommand.addCommand(installCodexSubcommand, {
	hidden: !codexInstallEnabled,
});
if (!codexInstallEnabled) {
	installCodexSubcommand.action(async () => {
		process.exit(1);
	});
}

const copilotInstallEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"copilot",
);
installParentCommand.addCommand(installCopilotSubcommand, {
	hidden: !copilotInstallEnabled,
});
if (!copilotInstallEnabled) {
	installCopilotSubcommand.action(async () => {
		process.exit(1);
	});
}

const antigravityInstallEnabled = isToolEnabled(
	TOOLS_REGISTRY as ToolsRegistry,
	"antigravity",
);
installParentCommand.addCommand(installAntigravitySubcommand, {
	hidden: !antigravityInstallEnabled,
});
if (!antigravityInstallEnabled) {
	installAntigravitySubcommand.action(async () => {
		process.exit(1);
	});
}

installParentCommand.addCommand(installAllSubcommand);

export { installAllSubcommand } from "./all.js";
export { installAntigravitySubcommand } from "./antigravity.js";
export { installClaudeCodeSubcommand } from "./claude-code.js";
export { installCodexSubcommand } from "./codex.js";
export { installCopilotSubcommand } from "./copilot.js";
export { installOpenCodeSubcommand } from "./opencode.js";

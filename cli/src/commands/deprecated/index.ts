import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { createSpinner } from "../../../shared/spinner.js";
import { colorFns } from "../../lib/colors.js";
import {
	type InstallContext,
	installClaudeCodePlugins,
	installOpenCodePlugins,
} from "../../shared/install-core.js";
import {
	executeVerifyClaudeCode,
	executeVerifyOpenCode,
} from "../verify/index.js";

const { green, dim, bold } = colorFns;

/**
 * Type for deprecated command action handler.
 * Commander actions receive (options, command) but types vary.
 */
type DeprecatedActionHandler = (
	options: unknown,
	command: Command,
) => Promise<void>;

/**
 * Create a deprecated command wrapper.
 * Prints warning to stderr, then delegates to the target action.
 *
 * @param oldName - The deprecated command name (e.g., "install:claude-code")
 * @param newName - The new command name to suggest (e.g., "install claude-code")
 * @param targetAction - The action function to delegate to
 * @returns A hidden Commander.js Command with deprecation warning
 */
export const createDeprecatedCommand = (
	oldName: string,
	newName: string,
	targetAction: DeprecatedActionHandler,
): Command => {
	return new Command(oldName)
		.description(`[DEPRECATED] Use 'rp1 ${newName}' instead`)
		.allowUnknownOption()
		.action(async (options, command) => {
			console.error(
				`Warning: 'rp1 ${oldName}' is deprecated. Use 'rp1 ${newName}' instead.`,
			);
			await targetAction(options, command);
		});
};

/**
 * Helper to get logger and isTTY from deprecated command.
 * Deprecated commands are registered directly on root, so logger is on parent.
 */
const getContext = (
	command: Command,
): { logger: Logger | undefined; isTTY: boolean } => {
	// biome-ignore lint/suspicious/noExplicitAny: Commander internal property access
	const parent = command.parent as any;
	return {
		logger: parent?._logger as Logger | undefined,
		isTTY: parent?._isTTY ?? false,
	};
};

/**
 * Deprecated: install:claude-code
 * Delegates to: rp1 install claude-code
 */
export const deprecatedInstallClaudeCode = createDeprecatedCommand(
	"install:claude-code",
	"install claude-code",
	async (_options: unknown, command: Command) => {
		const { logger, isTTY } = getContext(command);
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const opts = command.opts();
		const scope = (opts.scope ?? "user") as "user" | "project" | "local";
		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: opts.dryRun ?? false,
			skipPrompt: opts.yes ?? false,
		};

		console.log("");
		console.log(bold("Installing rp1 plugins to Claude Code"));
		console.log("");

		if (ctx.dryRun) {
			console.log(dim("[dry-run] Installation plan:"));
			console.log("");
			console.log(`${dim("1.")} claude plugin marketplace add rp1-run/rp1`);
			console.log(
				`${dim("2.")} claude plugin install rp1-base@rp1-run --scope ${scope}`,
			);
			console.log(
				`${dim("3.")} claude plugin install rp1-dev@rp1-run --scope ${scope}`,
			);
			console.log("");
			console.log(dim("Run without --dry-run to execute these commands."));
			return;
		}

		spinner.start("Installing plugins...");

		const result = await installClaudeCodePlugins(scope, ctx)();

		if (E.isLeft(result)) {
			spinner.stop();
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		spinner.succeed(
			green("rp1 plugins installed successfully to Claude Code!"),
		);
		console.log("");
		console.log(dim("Installed plugins:"));
		for (const plugin of result.right.pluginsInstalled) {
			console.log(dim(`  - ${plugin}`));
		}
		console.log("");
		console.log(dim("Restart Claude Code to load updated plugins."));
	},
);

deprecatedInstallClaudeCode
	.option("--dry-run", "Show what would be executed without making changes")
	.option("-y, --yes", "Skip confirmation prompts")
	.option("-s, --scope <scope>", "Installation scope: user, project, or local");

/**
 * Deprecated: install:opencode
 * Delegates to: rp1 install opencode
 */
export const deprecatedInstallOpencode = createDeprecatedCommand(
	"install:opencode",
	"install opencode",
	async (_options: unknown, command: Command) => {
		const { logger, isTTY } = getContext(command);
		const spinner = createSpinner(isTTY);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const opts = command.opts();
		const ctx: InstallContext = {
			logger,
			isTTY,
			dryRun: opts.dryRun ?? false,
			skipPrompt: opts.yes ?? false,
		};

		console.log("");
		console.log(bold("Installing rp1 plugins to OpenCode"));
		console.log("");

		if (ctx.dryRun) {
			console.log(dim("[dry-run] Installation preview:"));
			console.log("");
			console.log(dim("Would install rp1 plugins to OpenCode configuration."));
			console.log(dim("  - rp1-base: agents, skills"));
			console.log(dim("  - rp1-dev: agents, skills"));
			console.log("");
			console.log(dim("Run without --dry-run to execute installation."));
			return;
		}

		spinner.start("Installing plugins...");

		const result = await installOpenCodePlugins(
			{
				artifactsDir: opts.artifactsDir ?? null,
			},
			ctx,
		)();

		if (E.isLeft(result)) {
			spinner.stop();
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}

		spinner.succeed(green("rp1 plugins installed successfully to OpenCode!"));
		console.log("");
		console.log(dim("Installed plugins:"));
		for (const plugin of result.right.pluginsInstalled) {
			console.log(dim(`  - ${plugin}`));
		}
		console.log("");
		console.log(
			dim("Restart OpenCode and run /skills to see available rp1 skills."),
		);
	},
);

deprecatedInstallOpencode
	.option("-a, --artifacts-dir <path>", "Path to artifacts directory")
	.option("--dry-run", "Show what would be installed without installing")
	.option("-y, --yes", "Skip confirmation prompts");

/**
 * Deprecated: verify:claude-code
 * Delegates to: rp1 verify claude-code
 */
export const deprecatedVerifyClaudeCode = createDeprecatedCommand(
	"verify:claude-code",
	"verify claude-code",
	async (_options: unknown, command: Command) => {
		const { logger } = getContext(command);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		await executeVerifyClaudeCode(logger);
	},
);

/**
 * Deprecated: verify:opencode
 * Delegates to: rp1 verify opencode
 */
export const deprecatedVerifyOpencode = createDeprecatedCommand(
	"verify:opencode",
	"verify opencode",
	async (_options: unknown, command: Command) => {
		const { logger } = getContext(command);

		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const opts = command.opts();
		await executeVerifyOpenCode(opts.artifactsDir, logger);
	},
);

deprecatedVerifyOpencode.option(
	"--artifacts-dir <path>",
	"Path to artifacts for name-based verification",
);

/**
 * Deprecated: self-update
 * Delegates to: rp1 update
 *
 * Note: This imports the update command's action dynamically to avoid
 * circular dependencies and to ensure the update logic is executed.
 */
export const deprecatedSelfUpdate = createDeprecatedCommand(
	"self-update",
	"update",
	async (_options, command: Command) => {
		// Import dynamically to avoid circular dependency
		const { executeUpdateAction } = await import("../update/index.js");

		// Get parent context for logger/isTTY
		const { logger, isTTY } = getContext(command);
		const opts = command.opts();

		await executeUpdateAction(
			{
				check: false,
				dryRun: opts.dryRun ?? false,
				force: opts.force ?? false,
				yes: opts.yes ?? false,
			},
			logger,
			isTTY,
		);
	},
);

deprecatedSelfUpdate
	.option("--dry-run", "Show what would be done without executing")
	.option("--force", "Force update even if already on latest")
	.option("-y, --yes", "Skip confirmation prompts");

/**
 * Deprecated: check-update
 * Maintains backward compatibility with original command options (--json, --force, etc.)
 * For full feature parity, delegates to the original check-update logic.
 */
export const deprecatedCheckUpdate = createDeprecatedCommand(
	"check-update",
	"update --check",
	async (_options, command: Command) => {
		// Import version check logic to maintain backward compatibility
		const { checkForUpdate } = await import("../../lib/version.js");
		const { checkFenceStaleness } = await import("../../lib/fence-check.js");
		const {
			formatCheckOutput,
			formatCheckOutputHookText,
			formatCheckOutputJson,
		} = await import("../update/index.js");

		const { logger, isTTY } = getContext(command);
		const opts = command.opts();

		// Parse options (maintain backward compatibility with original command)
		const timeoutMs = Number.parseInt(opts.timeout ?? "5000", 10);
		const ttlHours = Number.parseInt(opts.cacheTtl ?? "24", 10);
		if (opts.json && opts.format) {
			console.error("Error: --json and --format cannot be used together.");
			process.exit(1);
		}

		if (
			opts.format !== undefined &&
			opts.format !== "human" &&
			opts.format !== "hook-text"
		) {
			console.error("Error: Invalid format. Use 'human' or 'hook-text'.");
			process.exit(1);
		}

		// Validate numeric options
		if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
			const errorOutput = opts.json
				? JSON.stringify({ error: "Invalid timeout value" }, null, 2)
				: "Error: Invalid timeout value. Must be a positive number.";
			console.error(errorOutput);
			process.exit(1);
		}

		if (Number.isNaN(ttlHours) || ttlHours <= 0) {
			const errorOutput = opts.json
				? JSON.stringify({ error: "Invalid cache-ttl value" }, null, 2)
				: "Error: Invalid cache-ttl value. Must be a positive number.";
			console.error(errorOutput);
			process.exit(1);
		}

		// Build check options
		const checkOptions = {
			force: opts.force ?? false,
			timeoutMs,
			ttlHours,
		};

		logger?.debug(
			`Checking for updates (force=${opts.force}, timeout=${timeoutMs}ms, ttl=${ttlHours}h)`,
		);

		try {
			const result = await checkForUpdate(checkOptions);
			let fenceResult = null;
			try {
				fenceResult = checkFenceStaleness(process.cwd());
			} catch {
				// Fence check is best-effort; do not block version output
			}

			// Output result based on format
			if (opts.json) {
				formatCheckOutputJson(result, fenceResult);
			} else if (opts.format === "hook-text") {
				const message = formatCheckOutputHookText(result, fenceResult);
				if (message) {
					console.log(message);
					process.exit(0);
				}
				process.exit(result.error && !result.latestVersion ? 2 : 1);
			} else {
				formatCheckOutput(result, isTTY, fenceResult);
			}

			// Exit code handling
			if (result.error && !result.latestVersion) {
				process.exit(1);
			}
			process.exit(0);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "Unknown error";

			if (opts.json) {
				console.error(
					JSON.stringify(
						{
							current_version: null,
							latest_version: null,
							update_available: false,
							release_url: null,
							error: errorMessage,
							cached: false,
							cache_age_hours: null,
							cache_expires_in_hours: null,
						},
						null,
						2,
					),
				);
			} else {
				console.error(`Error: ${errorMessage}`);
			}
			process.exit(1);
		}
	},
);

deprecatedCheckUpdate
	.option("--json", "Output result as JSON", false)
	.option("--format <format>", "Output format: human or hook-text")
	.option("--timeout <ms>", "API timeout in milliseconds", "5000")
	.option("--force", "Bypass cache and force fresh check", false)
	.option("--cache-ttl <hours>", "Cache TTL in hours", "24");

/**
 * All deprecated commands for easy registration in main.ts.
 * Register these with { hidden: true } option.
 */
export const allDeprecatedCommands = [
	deprecatedInstallClaudeCode,
	deprecatedInstallOpencode,
	deprecatedVerifyClaudeCode,
	deprecatedVerifyOpencode,
	deprecatedSelfUpdate,
	deprecatedCheckUpdate,
];

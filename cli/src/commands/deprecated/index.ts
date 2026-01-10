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
		console.log(
			dim("Restart Claude Code and run /help to see available rp1 commands."),
		);
	},
);

// Add options that the deprecated command accepts (for pass-through)
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
			console.log(dim("  - rp1-base: commands, agents, skills"));
			console.log(dim("  - rp1-dev: commands, agents"));
			console.log("");
			console.log(dim("Run without --dry-run to execute installation."));
			return;
		}

		spinner.start("Installing plugins...");

		const result = await installOpenCodePlugins(
			{
				artifactsDir: opts.artifactsDir ?? null,
				skipSkills: opts.skipSkills ?? false,
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
		console.log(dim("  - rp1-base"));
		console.log(dim("  - rp1-dev"));
		console.log("");
		console.log(
			dim("Restart OpenCode and run /help to see available rp1 commands."),
		);
	},
);

// Add options that the deprecated command accepts
deprecatedInstallOpencode
	.option("-a, --artifacts-dir <path>", "Path to artifacts directory")
	.option("--skip-skills", "Skip skills installation")
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

// Add options that the deprecated command accepts
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

// Add options that the deprecated command accepts
deprecatedSelfUpdate
	.option("--dry-run", "Show what would be done without executing")
	.option("--force", "Force update even if already on latest")
	.option("-y, --yes", "Skip confirmation prompts");

/**
 * Deprecated: check-update
 * Delegates to: rp1 update --check
 */
export const deprecatedCheckUpdate = createDeprecatedCommand(
	"check-update",
	"update --check",
	async (_options, command: Command) => {
		// Import dynamically to avoid circular dependency
		const { executeUpdateAction } = await import("../update/index.js");

		// Get parent context for logger/isTTY
		const { logger, isTTY } = getContext(command);

		await executeUpdateAction(
			{ check: true, dryRun: false, force: false, yes: false },
			logger,
			isTTY,
		);
	},
);

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

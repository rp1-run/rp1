#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json";
import { type CLIError, formatError, getExitCode } from "../shared/errors.js";
import { createLogger, type Logger, LogLevel } from "../shared/logger.js";
import { detectRuntime } from "../shared/runtime.js";
import { checkUpdateCommand } from "./commands/check-update.js";
import { initCommand } from "./commands/init.js";
import {
	installClaudeCodeCommand,
	installCommand,
	listCommand,
	verifyClaudeCodeCommand,
	verifyCommand,
} from "./commands/install.js";
import { selfUpdateCommand } from "./commands/self-update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { viewCommand } from "./commands/view.js";

/**
 * Check if agent-tools command is being invoked.
 * Used for lazy loading to avoid loading puppeteer at CLI startup.
 */
const isAgentToolsCommand = (): boolean => {
	const args = process.argv.slice(2);
	return args.length > 0 && args[0] === "agent-tools";
};

/**
 * Check if daemon-server command is being invoked (internal use only).
 * Used for spawning the web UI daemon server.
 */
const isDaemonServerCommand = (): boolean => {
	const args = process.argv.slice(2);
	return args.length > 0 && args[0] === "_daemon-server";
};

/**
 * Handle agent-tools command with lazy loading.
 * Dynamically imports the agent-tools module to avoid loading puppeteer
 * during normal CLI startup for other commands.
 */
/**
 * Handle daemon server command (internal use only).
 * Starts the web UI server in daemon mode.
 */
const handleDaemonServerCommand = async (): Promise<void> => {
	const { createServer } = await import("../web-ui/src/server.js");
	const { getWebUIDir, getBundledAssets } = await import("./assets/index.js");
	const E = await import("fp-ts/lib/Either.js");

	const args = process.argv.slice(2);
	let port = 7710;

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--port" && args[i + 1]) {
			const parsedPort = Number.parseInt(args[++i], 10);
			if (!Number.isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
				port = parsedPort;
			}
		} else if (arg.startsWith("--port=")) {
			const parsedPort = Number.parseInt(arg.slice("--port=".length), 10);
			if (!Number.isNaN(parsedPort) && parsedPort >= 1 && parsedPort <= 65535) {
				port = parsedPort;
			}
		}
	}

	// Extract web UI assets if needed
	const assetsResult = getBundledAssets();
	if (E.isLeft(assetsResult)) {
		console.error("Failed to get bundled assets:", assetsResult.left);
		process.exit(1);
	}

	const webUIDirResult = await getWebUIDir(assetsResult.right)();
	if (E.isLeft(webUIDirResult)) {
		console.error("Failed to extract web UI assets:", webUIDirResult.left);
		process.exit(1);
	}

	const webUIDir = webUIDirResult.right;

	const { stop } = createServer({
		port,
		projectPath: process.cwd(),
		isDev: false,
		webUIDir,
	});

	process.on("SIGINT", () => {
		stop();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		stop();
		process.exit(0);
	});
};

const handleAgentToolsCommand = async (): Promise<void> => {
	const { agentToolsCommand } = await import("./agent-tools/command.js");

	// Create minimal program for agent-tools with shared configuration
	const agentProgram = new Command()
		.name("rp1")
		.version(pkg.version, "-V, --version", "Show version number")
		.option("-v, --verbose", "Enable debug logging")
		.option("--trace", "Enable trace logging")
		.helpOption("-h, --help", "Show this help message")
		.configureOutput({
			outputError: (str, write) => write(chalk.red(str)),
		});

	agentProgram.hook("preAction", (thisCommand) => {
		const opts = thisCommand.opts();
		const isTTY = process.stdout.isTTY ?? false;

		const level =
			opts.trace || process.env.DEBUG === "*"
				? LogLevel.TRACE
				: opts.verbose
					? LogLevel.DEBUG
					: LogLevel.INFO;

		const logger = createLogger({
			level,
			color: isTTY,
		});

		const runtime = detectRuntime();
		if (runtime.warning) {
			logger.warn(runtime.warning);
		}

		thisCommand._logger = logger;
		thisCommand._isTTY = isTTY;
	});

	agentProgram.addCommand(agentToolsCommand);

	await agentProgram.parseAsync(process.argv);
};

declare module "commander" {
	interface Command {
		_logger?: Logger;
		_isTTY?: boolean;
	}
}

const program = new Command()
	.name("rp1")
	.description("AI-assisted development workflows CLI")
	.version(pkg.version, "-V, --version", "Show version number")
	.option("-v, --verbose", "Enable debug logging")
	.option("--trace", "Enable trace logging")
	.helpOption("-h, --help", "Show this help message")
	.configureOutput({
		outputError: (str, write) => write(chalk.red(str)),
	});

program.hook("preAction", (thisCommand) => {
	const opts = thisCommand.opts();
	const isTTY = process.stdout.isTTY ?? false;

	const level =
		opts.trace || process.env.DEBUG === "*"
			? LogLevel.TRACE
			: opts.verbose
				? LogLevel.DEBUG
				: LogLevel.INFO;

	const logger = createLogger({
		level,
		color: isTTY,
	});

	const runtime = detectRuntime();
	if (runtime.warning) {
		logger.warn(runtime.warning);
	}

	thisCommand._logger = logger;
	thisCommand._isTTY = isTTY;
});

program.addCommand(viewCommand, { hidden: true });
program.addCommand(installCommand);
program.addCommand(installClaudeCodeCommand);
program.addCommand(verifyCommand);
program.addCommand(verifyClaudeCodeCommand);
program.addCommand(listCommand);
program.addCommand(initCommand);
program.addCommand(uninstallCommand);
program.addCommand(checkUpdateCommand);
program.addCommand(selfUpdateCommand);

// Add agent-tools stub command for help visibility
// Actual execution is handled by lazy loading above
program.addCommand(
	new Command("agent-tools")
		.description("Tools for AI agents (lazy-loaded)")
		.addHelpText(
			"after",
			`
Available Tools:
  mmd-validate    Validate Mermaid diagram syntax

Examples:
  rp1 agent-tools mmd-validate ./document.md
  cat diagram.mmd | rp1 agent-tools mmd-validate

Run 'rp1 agent-tools --help' for more information.
`,
		)
		.action(() => {
			// This action should never be reached due to lazy loading check above
			// but is here as a fallback
			console.log(
				"Use 'rp1 agent-tools mmd-validate --help' for usage information.",
			);
		}),
);

const handleError = (error: CLIError): void => {
	const isTTY = process.stderr.isTTY ?? false;
	console.error(formatError(error, isTTY));
	process.exit(getExitCode(error));
};

// Entry point with lazy loading for special commands
if (isDaemonServerCommand()) {
	// Handle daemon server command (internal use only)
	handleDaemonServerCommand().catch((error) => {
		console.error("Daemon server error:", error);
		process.exit(1);
	});
} else if (isAgentToolsCommand()) {
	// Handle agent-tools command with lazy loading to avoid loading puppeteer at startup
	handleAgentToolsCommand().catch((error) => {
		if (error && typeof error === "object" && "code" in error) {
			handleError(error as CLIError);
		} else {
			console.error(error);
			process.exit(1);
		}
	});
} else {
	// Normal program execution for all other commands
	program.parseAsync(process.argv).catch((error) => {
		if (error && typeof error === "object" && "code" in error) {
			handleError(error as CLIError);
		} else {
			console.error(error);
			process.exit(1);
		}
	});
}

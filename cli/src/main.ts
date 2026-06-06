#!/usr/bin/env bun
import chalk from "chalk";
import { Command } from "commander";
import pkg from "../package.json";
import { type CLIError, formatError, getExitCode } from "../shared/errors.js";

// Dev builds inject this constant at build time
declare const __RP1_DEV_BUILD__: boolean | undefined;
const version =
	typeof __RP1_DEV_BUILD__ !== "undefined" && __RP1_DEV_BUILD__
		? `${pkg.version}-dev`
		: pkg.version;

import { createLogger, type Logger, LogLevel } from "../shared/logger.js";
import { detectRuntime } from "../shared/runtime.js";
import { arcadeCommand } from "./commands/arcade.js";
import { allDeprecatedCommands } from "./commands/deprecated/index.js";
import { fakeCommand } from "./commands/fake.js";
import { initCommand } from "./commands/init.js";
import { installParentCommand } from "./commands/install/index.js";
import { listCommand } from "./commands/install.js";
import { migrateCommand } from "./commands/migrate.js";
import { settingsCommand } from "./commands/settings.js";
import { uninstallCommand } from "./commands/uninstall.js";
import { updateCommand } from "./commands/update/index.js";
import { verifyCommand } from "./commands/verify/index.js";
import { isTopLevelCommandInvocation } from "./lib/command-routing.js";

/**
 * Check if agent-tools command is being invoked.
 * Used for lazy loading to avoid loading puppeteer at CLI startup.
 */
const isAgentToolsCommand = (): boolean => {
	return isTopLevelCommandInvocation(process.argv.slice(2), "agent-tools");
};

/**
 * Check if daemon-server command is being invoked (internal use only).
 * Used for spawning the web UI daemon server.
 */
const isDaemonServerCommand = (): boolean => {
	return isTopLevelCommandInvocation(process.argv.slice(2), "_daemon-server");
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
	const { logDaemonError, logDaemonEvent } = await import(
		"../web-ui/src/daemon/diagnostics.js"
	);
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
		version,
	});

	logDaemonEvent("daemon_started", {
		port,
		projectPath: process.cwd(),
		version,
		ppid: process.ppid,
		execPath: process.execPath,
	});

	process.on("unhandledRejection", (reason) => {
		logDaemonError("unhandled_rejection", reason);
	});

	process.on("uncaughtException", (error) => {
		logDaemonError("uncaught_exception", error);
		stop();
		process.exit(1);
	});

	process.on("beforeExit", (code) => {
		logDaemonEvent("before_exit", { code });
	});

	process.on("exit", (code) => {
		logDaemonEvent("exit", { code });
	});

	process.on("SIGINT", () => {
		logDaemonEvent("signal", { signal: "SIGINT" });
		stop();
		process.exit(0);
	});

	process.on("SIGTERM", () => {
		logDaemonEvent("signal", { signal: "SIGTERM" });
		stop();
		process.exit(0);
	});
};

const handleAgentToolsCommand = async (): Promise<void> => {
	const { agentToolsCommand } = await import("./agent-tools/command.js");

	// Create minimal program for agent-tools with shared configuration
	const agentProgram = new Command()
		.name("rp1")
		.version(version, "-V, --version", "Show version number")
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
	.version(version, "-V, --version", "Show version number")
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

program.addCommand(arcadeCommand);

program.addCommand(installParentCommand);
program.addCommand(verifyCommand);
program.addCommand(updateCommand);

// Keep list command (still needed)
program.addCommand(listCommand);
program.addCommand(initCommand);
program.addCommand(migrateCommand);
program.addCommand(uninstallCommand);
program.addCommand(settingsCommand);

// Register deprecated commands with hidden: true
// These still work but don't show in --help
for (const deprecatedCommand of allDeprecatedCommands) {
	program.addCommand(deprecatedCommand, { hidden: true });
}

program.addCommand(fakeCommand, { hidden: true });

// Add agent-tools stub command for help visibility
// Actual execution is handled by lazy loading above
program.addCommand(
	new Command("agent-tools")
		.description("Tools for AI agents (lazy-loaded)")
		.addHelpText(
			"after",
			`
Available Tools:
  mmd-validate        Validate Mermaid diagram syntax
  code-tour-validate  Validate Code Tour JSON walkthrough documents

Examples:
  rp1 agent-tools mmd-validate ./document.md
  cat diagram.mmd | rp1 agent-tools mmd-validate
  rp1 agent-tools code-tour-validate ./walkthrough.json

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

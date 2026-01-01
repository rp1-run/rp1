import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { join, resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import type * as T from "fp-ts/lib/Task.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { loadViewConfig, type ViewConfig } from "../../shared/config.js";
import {
	type CLIError,
	formatError,
	getExitCode,
	notFoundError,
	runtimeError,
	tryCatchTE,
} from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { isBun } from "../../shared/runtime.js";

const directoryExists = (path: string): boolean => {
	try {
		const stat = statSync(path);
		return stat.isDirectory();
	} catch {
		return false;
	}
};

const validateProject = (
	projectPath: string,
	logger: Logger,
): TE.TaskEither<CLIError, string> => {
	logger.debug(`Validating project structure at: ${projectPath}`);

	const rp1Path = join(projectPath, ".rp1");
	if (!directoryExists(rp1Path)) {
		return TE.left(
			notFoundError(
				`.rp1 directory at ${projectPath}`,
				"Make sure you are in an rp1 project directory or specify the correct path",
			),
		);
	}

	const contextPath = join(rp1Path, "context");
	if (!directoryExists(contextPath)) {
		logger.debug(`.rp1/context/ not found - KB may not be built yet`);
	}

	return TE.right(projectPath);
};

const openBrowser =
	(url: string, logger: Logger): T.Task<void> =>
	async () => {
		const platform = process.platform;
		const [command, args]: [string, string[]] =
			platform === "darwin"
				? ["open", [url]]
				: platform === "win32"
					? ["cmd", ["/c", "start", "", url]]
					: ["xdg-open", [url]];

		logger.debug(`Opening browser with: ${command} ${args.join(" ")}`);

		try {
			if (isBun()) {
				const BunRuntime = globalThis.Bun as typeof Bun;
				const proc = BunRuntime.spawn([command, ...args], {
					stdout: "ignore",
					stderr: "ignore",
				});
				await proc.exited;
			} else {
				const proc = spawn(command, args, {
					detached: true,
					stdio: "ignore",
				});
				proc.unref();
			}
		} catch {
			logger.warn(`Could not open browser automatically. Please open ${url}`);
		}
	};

/**
 * Execute with daemon support - start daemon if needed, register project, open browser.
 */
const executeWithDaemon = (
	config: ViewConfig,
	logger: Logger,
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const { ensureDaemon, registerProjectWithDaemon } = await import(
				"../../web-ui/src/daemon/index.js"
			);

			logger.debug("Ensuring daemon is running...");
			const { connection, wasRunning } = await ensureDaemon(config.port);

			if (wasRunning) {
				logger.debug(`Connected to existing daemon on port ${config.port}`);
			} else {
				logger.info(`Started daemon on port ${config.port}`);
			}

			logger.debug(`Registering project: ${config.rp1Root}`);
			const { project, url } = await registerProjectWithDaemon(
				connection,
				config.rp1Root,
			);

			logger.info(`Project registered: ${project.name} (${project.id})`);

			if (config.openBrowser) {
				logger.debug("Opening browser...");
				await openBrowser(url, logger)();
				logger.info(`Opened ${url}`);
			} else {
				logger.info(`Server running at ${url}`);
			}
		},
		(e) => runtimeError(`Failed to start viewer: ${e}`),
	);

/**
 * Stop the daemon.
 */
const stopDaemonCommand = (logger: Logger): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const { stopDaemon } = await import("../../web-ui/src/daemon/index.js");

			logger.debug("Stopping daemon...");
			const stopped = await stopDaemon();

			if (stopped) {
				logger.info("Daemon stopped successfully");
			} else {
				logger.info("No daemon running");
			}
		},
		(e) => runtimeError(`Failed to stop daemon: ${e}`),
	);

/**
 * Get daemon status.
 */
const statusCommand = (_logger: Logger): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const { getStatus } = await import("../../web-ui/src/daemon/index.js");

			const status = await getStatus();

			if (status.running) {
				console.log(chalk.green("Daemon Status: Running"));
				console.log(`  Port: ${status.port}`);
				if (status.uptime !== undefined) {
					const hours = Math.floor(status.uptime / 3600);
					const minutes = Math.floor((status.uptime % 3600) / 60);
					const seconds = status.uptime % 60;
					const uptimeStr =
						hours > 0
							? `${hours}h ${minutes}m ${seconds}s`
							: minutes > 0
								? `${minutes}m ${seconds}s`
								: `${seconds}s`;
					console.log(`  Uptime: ${uptimeStr}`);
				}
				if (status.projectCount !== undefined) {
					console.log(`  Projects: ${status.projectCount}`);
				}
			} else {
				console.log(chalk.yellow("Daemon Status: Stopped"));
			}
		},
		(e) => runtimeError(`Failed to get status: ${e}`),
	);

/**
 * Restart the daemon.
 */
const restartDaemonCommand = (
	port: number,
	logger: Logger,
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const { restartDaemon } = await import(
				"../../web-ui/src/daemon/index.js"
			);

			logger.debug("Restarting daemon...");
			await restartDaemon(port);
			logger.info(`Daemon restarted on port ${port}`);
		},
		(e) => runtimeError(`Failed to restart daemon: ${e}`),
	);

const execute = (
	args: string[],
	options: { stop?: boolean; status?: boolean; restart?: boolean },
	logger: Logger,
): TE.TaskEither<CLIError, void> => {
	if (options.stop) {
		return stopDaemonCommand(logger);
	}

	if (options.status) {
		return statusCommand(logger);
	}

	if (options.restart) {
		return pipe(
			loadViewConfig(args),
			TE.fromEither,
			TE.chain((config) => restartDaemonCommand(config.port, logger)),
		);
	}

	return pipe(
		loadViewConfig(args),
		TE.fromEither,
		TE.chainFirst((config) => {
			logger.debug(
				`Config: rp1Root=${config.rp1Root}, port=${config.port}, openBrowser=${config.openBrowser}`,
			);
			return TE.right(undefined);
		}),
		TE.chain((config) =>
			pipe(
				validateProject(config.rp1Root, logger),
				TE.map(() => config),
			),
		),
		TE.chain((config) => executeWithDaemon(config, logger)),
	);
};

export const viewCommand = new Command("view")
	.description(
		"Launch the web-based documentation viewer with background daemon",
	)
	.argument("[path]", "Path to project directory", process.cwd())
	.option("-p, --port <port>", "Port to run server on", "7710")
	.option("--no-open", "Start server without opening browser")
	.option("--stop", "Stop the background daemon")
	.option("--status", "Show daemon status")
	.option("--restart", "Restart the daemon")
	.addHelpText(
		"after",
		`
Examples:
  rp1 view                      View current project
  rp1 view /path/to/project     View specific project
  rp1 view --port 8080          Use custom port
  rp1 view --no-open            Don't auto-open browser
  rp1 view --stop               Stop the daemon
  rp1 view --status             Show daemon status
  rp1 view --restart            Restart the daemon

Daemon:
  The viewer runs as a background daemon. Multiple projects can be viewed
  by running 'rp1 view' in different directories. Use the project switcher
  in the web UI to navigate between projects.

Environment:
  RP1_ROOT                      Set default project path

Note: This command requires Bun runtime. Install from https://bun.sh
`,
	)
	.action(async (path, options, command) => {
		// Check for Bun runtime early - the web-ui server requires Bun APIs
		if (!isBun()) {
			console.error(
				chalk.red("Error: The 'view' command requires Bun runtime."),
			);
			console.error(
				"\nThe web UI server uses Bun-specific APIs that are not available in Node.js.",
			);
			console.error("\nTo fix this:");
			console.error(
				"  1. Install Bun: curl -fsSL https://bun.sh/install | bash",
			);
			console.error("  2. Run with Bun: bun rp1 view");
			console.error("\nOther rp1 commands work with Node.js.");
			process.exit(1);
		}

		const logger = command.parent?._logger;
		if (!logger) {
			console.error("Logger not initialized");
			process.exit(1);
		}

		const args: string[] = [];
		if (path && path !== process.cwd()) {
			args.push(resolve(path));
		}
		if (options.port !== "7710") {
			args.push("--port", options.port);
		}
		if (!options.open) {
			args.push("--no-open");
		}

		const result = await execute(
			args,
			{
				stop: options.stop,
				status: options.status,
				restart: options.restart,
			},
			logger,
		)();

		if (E.isLeft(result)) {
			console.error(formatError(result.left, process.stderr.isTTY ?? false));
			process.exit(getExitCode(result.left));
		}
	});

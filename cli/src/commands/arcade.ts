import { spawn } from "node:child_process";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command, Option } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import type * as T from "fp-ts/lib/Task.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type ArcadeConfig,
	loadArcadeConfig,
	parseArcadeArgs,
} from "../../shared/config.js";
import {
	type CLIError,
	formatError,
	getExitCode,
	portInUseError,
	runtimeError,
	tryCatchTE,
} from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { isBun } from "../../shared/runtime.js";
import type {
	DaemonEnsureOptions,
	DaemonStartResult,
	DaemonStatus,
	DaemonStopResult,
} from "../../web-ui/src/daemon/index.js";
import {
	type ArcadeProjectLaunchResult,
	launchArcadeForProject,
} from "../arcade/launch.js";

type ArcadeOutputFormat = "text" | "hook-json";
type LaunchArcadeForProject = typeof launchArcadeForProject;
type EnsureDaemon = (
	port: number,
	options?: DaemonEnsureOptions | string,
) => Promise<DaemonStartResult>;
type StopDaemon = (port?: number) => Promise<DaemonStopResult>;
type GetStatus = (port?: number) => Promise<DaemonStatus>;
type RestartDaemon = (
	port: number,
	options?: DaemonEnsureOptions | string,
) => Promise<DaemonStartResult>;

export interface ArcadeCommandDependencies {
	readonly launchArcadeForProject?: LaunchArcadeForProject;
	readonly ensureDaemon?: EnsureDaemon;
	readonly stopDaemon?: StopDaemon;
	readonly getStatus?: GetStatus;
	readonly restartDaemon?: RestartDaemon;
}

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

const startArcade = async (
	config: ArcadeConfig,
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): Promise<ArcadeProjectLaunchResult> =>
	(dependencies.launchArcadeForProject ?? launchArcadeForProject)({
		projectPath: config.rp1Root,
		port: config.port,
		cliVersion,
	});

export function formatArcadeHookPayload(url: string): string {
	return JSON.stringify({
		systemMessage: `🕹️ rp1 Arcade is live at ${url}`,
	});
}

/**
 * Map daemon errors to CLIErrors, converting port conflicts to PortInUseError.
 * Uses duck-typing to avoid eager import of the Bun-dependent daemon module.
 */
const mapDaemonError =
	(context: string) =>
	(e: unknown): CLIError => {
		if (isCLIError(e)) {
			return e;
		}
		if (
			e instanceof Error &&
			e.name === "DaemonPortConflictError" &&
			"port" in e &&
			typeof (e as Record<string, unknown>).port === "number"
		) {
			return portInUseError((e as { port: number }).port);
		}
		return runtimeError(`${context}: ${e}`);
	};

const isCLIError = (error: unknown): error is CLIError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	typeof (error as { _tag?: unknown })._tag === "string";

/**
 * Format a human-readable lifecycle action message for daemon operations.
 */
export function formatLifecycleAction(
	action: "reused" | "started" | "replaced",
	port: number,
	reason?: string,
): string {
	const reasonSuffix = reason ? ` (${reason.replace(/_/g, " ")})` : "";
	switch (action) {
		case "reused":
			return `Reused daemon on port ${port}${reasonSuffix}`;
		case "started":
			return `Started daemon on port ${port}`;
		case "replaced":
			return `Replaced daemon on port ${port}${reasonSuffix}`;
	}
}

/**
 * Execute with daemon support - start daemon if needed, register project, open browser.
 */
const executeWithDaemon = (
	config: ArcadeConfig,
	logger: Logger,
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(async () => {
		logger.debug("Ensuring daemon is running...");
		const { projectId, projectName, url, action, reason, daemonPort } =
			await startArcade(config, cliVersion, dependencies);

		logger.info(formatLifecycleAction(action, daemonPort, reason));

		logger.debug(`Registering project: ${config.rp1Root}`);
		logger.info(`Project registered: ${projectName} (${projectId})`);

		if (config.openBrowser) {
			logger.debug("Opening browser...");
			await openBrowser(url, logger)();
			logger.info(`Opened ${url}`);
		} else {
			logger.info(`Server running at ${url}`);
		}
	}, mapDaemonError("Failed to start arcade"));

const hookOutputCommand = (
	config: ArcadeConfig,
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(async () => {
		// Hook mode should be side-effect-light: if a healthy daemon is already
		// serving, reuse it instead of forcing the dev-build restart path.
		const { url } = await startArcade(config, cliVersion, dependencies);
		console.log(formatArcadeHookPayload(url));
	}, mapDaemonError("Failed to format arcade hook output"));

const ensureDaemonOnlyCommand = (
	port: number,
	logger: Logger,
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(async () => {
		const ensureDaemon =
			dependencies.ensureDaemon ??
			(await import("../../web-ui/src/daemon/index.js")).ensureDaemon;

		logger.debug("Ensuring daemon is running without project registration...");
		const { connection, action, reason } = await ensureDaemon(port, cliVersion);

		logger.info(formatLifecycleAction(action, connection.port, reason));
	}, mapDaemonError("Failed to ensure daemon"));

/**
 * Stop the daemon.
 */
const stopDaemonCommand = (
	logger: Logger,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const stopDaemon =
				dependencies.stopDaemon ??
				(await import("../../web-ui/src/daemon/index.js")).stopDaemon;

			logger.debug("Stopping daemon...");
			const result = await stopDaemon();

			if (result.action === "stopped") {
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
const statusCommand = (
	_logger: Logger,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(
		async () => {
			const getStatus =
				dependencies.getStatus ??
				(await import("../../web-ui/src/daemon/index.js")).getStatus;

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
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> =>
	tryCatchTE(async () => {
		const restartDaemon =
			dependencies.restartDaemon ??
			(await import("../../web-ui/src/daemon/index.js")).restartDaemon;

		logger.debug("Restarting daemon...");
		const { connection, action, reason } = await restartDaemon(
			port,
			cliVersion,
		);
		logger.info(formatLifecycleAction(action, connection.port, reason));
	}, mapDaemonError("Failed to restart daemon"));

const execute = (
	args: string[],
	options: {
		stop?: boolean;
		status?: boolean;
		restart?: boolean;
		daemonOnly?: boolean;
		format?: ArcadeOutputFormat;
	},
	logger: Logger,
	cliVersion?: string,
	dependencies: ArcadeCommandDependencies = {},
): TE.TaskEither<CLIError, void> => {
	if (options.stop) {
		return stopDaemonCommand(logger, dependencies);
	}

	if (options.status) {
		return statusCommand(logger, dependencies);
	}

	if (options.restart) {
		return pipe(
			loadArcadeConfig(args),
			TE.fromEither,
			TE.chain((config) =>
				restartDaemonCommand(config.port, logger, cliVersion, dependencies),
			),
		);
	}

	if (options.daemonOnly) {
		return pipe(
			parseArcadeArgs(args),
			TE.fromEither,
			TE.chain((config) =>
				ensureDaemonOnlyCommand(config.port, logger, cliVersion, dependencies),
			),
		);
	}

	return pipe(
		loadArcadeConfig(args),
		TE.fromEither,
		TE.chainFirst((config) => {
			logger.debug(
				`Config: rp1Root=${config.rp1Root}, port=${config.port}, openBrowser=${config.openBrowser}`,
			);
			return TE.right(undefined);
		}),
		TE.chain((config) =>
			options.format === "hook-json"
				? hookOutputCommand(config, cliVersion, dependencies)
				: executeWithDaemon(config, logger, cliVersion, dependencies),
		),
	);
};

export const createArcadeCommand = (
	dependencies: ArcadeCommandDependencies = {},
): Command =>
	new Command("arcade")
		.description("Launch the web-based dashboard with background daemon")
		.argument("[path]", "Path to project directory", process.cwd())
		.option("-p, --port <port>", "Port to run server on", "7710")
		.option("--no-open", "Start server without opening browser")
		.option("--stop", "Stop the background daemon")
		.option("--status", "Show daemon status")
		.option("--restart", "Restart the daemon")
		.addOption(new Option("--daemon-only").hideHelp())
		.addOption(
			new Option("--format <format>")
				.choices(["text", "hook-json"])
				.default("text")
				.hideHelp(),
		)
		.addHelpText(
			"after",
			`
Examples:
  rp1 arcade                      Launch dashboard for current project
  rp1 arcade /path/to/project     Launch dashboard for specific project
  rp1 arcade --port 8080          Use custom port
  rp1 arcade --no-open            Don't auto-open browser
  rp1 arcade --stop               Stop the daemon
  rp1 arcade --status             Show daemon status
  rp1 arcade --restart            Restart the daemon

Daemon:
  The dashboard runs as a background daemon. Multiple projects can be viewed
  by running 'rp1 arcade' in different directories. Use the project switcher
  in the web UI to navigate between projects.

Directories:
  Project directories are resolved from the .rp1/project_id file.
  KB root is always <project>/.rp1/context, work root is always <project>/.rp1/work.
  Run 'rp1 migrate' to move legacy external work directories into the project.

Note: This command requires Bun runtime. Install from https://bun.sh
`,
		)
		.action(async (path, options, command) => {
			// Check for Bun runtime early - the web-ui server requires Bun APIs
			if (!isBun()) {
				console.error(
					chalk.red("Error: The 'arcade' command requires Bun runtime."),
				);
				console.error(
					"\nThe web UI server uses Bun-specific APIs that are not available in Node.js.",
				);
				console.error("\nTo fix this:");
				console.error(
					"  1. Install Bun: curl -fsSL https://bun.sh/install | bash",
				);
				console.error("  2. Run with Bun: bun rp1 arcade");
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

			const cliVersion = command.parent?.version?.() as string | undefined;

			const result = await execute(
				args,
				{
					stop: options.stop,
					status: options.status,
					restart: options.restart,
					daemonOnly: options.daemonOnly,
					format: options.format as ArcadeOutputFormat,
				},
				logger,
				cliVersion,
				dependencies,
			)();

			if (E.isLeft(result)) {
				console.error(formatError(result.left, process.stderr.isTTY ?? false));
				process.exit(getExitCode(result.left));
			}
		});

export const arcadeCommand = createArcadeCommand();

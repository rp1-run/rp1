import { spawnSync } from "node:child_process";
import path from "node:path";

export const POST_SELF_UPDATE_ENV = "RP1_POST_SELF_UPDATE";
export const POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV =
	"RP1_POST_SELF_UPDATE_DAEMON_WAS_RUNNING";
export const POST_SELF_UPDATE_DAEMON_PORT_ENV =
	"RP1_POST_SELF_UPDATE_DAEMON_PORT";

export interface PostSelfUpdateState {
	readonly daemonWasRunning: boolean;
	readonly daemonPort?: number;
}

export interface PostSelfUpdateRelaunchResult {
	readonly success: boolean;
	readonly exitCode: number;
	readonly error?: string;
}

type SpawnResult = Pick<ReturnType<typeof spawnSync>, "status" | "error">;
type RelaunchSpawnFn = (
	command: string,
	args: readonly string[],
	options: {
		readonly env: NodeJS.ProcessEnv;
		readonly stdio: "inherit";
	},
) => SpawnResult;

export const isPostSelfUpdateProcess = (
	env: NodeJS.ProcessEnv = process.env,
): boolean => env[POST_SELF_UPDATE_ENV] === "1";

export const readPostSelfUpdateState = (
	env: NodeJS.ProcessEnv = process.env,
): PostSelfUpdateState => {
	const daemonPortRaw = env[POST_SELF_UPDATE_DAEMON_PORT_ENV];
	const parsedPort =
		daemonPortRaw === undefined
			? undefined
			: Number.parseInt(daemonPortRaw, 10);

	return {
		daemonWasRunning: env[POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV] === "1",
		daemonPort:
			parsedPort === undefined || Number.isNaN(parsedPort)
				? undefined
				: parsedPort,
	};
};

const isRp1ExecutablePath = (value: string): boolean => {
	const executable = path.basename(value).toLowerCase();
	return executable === "rp1" || executable === "rp1.exe";
};

export const resolvePostSelfUpdateCommand = (options?: {
	readonly execPath?: string;
}): string => {
	if (options?.execPath) {
		return options.execPath;
	}

	return isRp1ExecutablePath(process.execPath) ? process.execPath : "rp1";
};

/**
 * Relaunch `rp1 update` from the freshly installed binary so post-update work
 * runs with the new code instead of the process image that was already in
 * memory before Homebrew/Scoop replaced the executable on disk.
 */
export const relaunchPostSelfUpdate = (options?: {
	readonly yes?: boolean;
	readonly execPath?: string;
	readonly env?: NodeJS.ProcessEnv;
	readonly state?: PostSelfUpdateState;
	readonly spawnSyncImpl?: RelaunchSpawnFn;
}): PostSelfUpdateRelaunchResult => {
	const args = ["update"];
	if (options?.yes) {
		args.push("--yes");
	}

	const execPath = resolvePostSelfUpdateCommand(options);
	const env = {
		...(options?.env ?? process.env),
		[POST_SELF_UPDATE_ENV]: "1",
		[POST_SELF_UPDATE_DAEMON_WAS_RUNNING_ENV]: options?.state?.daemonWasRunning
			? "1"
			: "0",
		...(options?.state?.daemonPort === undefined
			? {}
			: {
					[POST_SELF_UPDATE_DAEMON_PORT_ENV]: String(options.state.daemonPort),
				}),
	};
	const spawnImpl: RelaunchSpawnFn =
		options?.spawnSyncImpl ??
		((command, commandArgs, spawnOptions) =>
			spawnSync(command, [...commandArgs], spawnOptions));
	const result = spawnImpl(execPath, args, {
		env,
		stdio: "inherit",
	});

	if (result.error) {
		return {
			success: false,
			exitCode: 1,
			error: result.error.message,
		};
	}

	return {
		success: result.status === 0,
		exitCode: result.status ?? 1,
	};
};

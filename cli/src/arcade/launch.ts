import { statSync } from "node:fs";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import {
	type CLIError,
	notFoundError,
	usageError,
} from "../../shared/errors.js";
import type {
	DaemonConnection,
	DaemonLifecycleReason,
	DaemonStartAction,
} from "../../web-ui/src/daemon/index.js";
import type { V2Project } from "../../web-ui/src/types/projects.js";

const DEFAULT_ARCADE_PORT = 7710;

export interface ArcadeLaunchOptions {
	readonly projectPath?: string;
	readonly port?: number;
	readonly cliVersion?: string;
	readonly rp1ExecutablePath?: string;
	readonly openProjectListWhenMissing?: boolean;
}

export interface ArcadeProjectLaunchResult {
	readonly kind: "project";
	readonly projectId: string;
	readonly projectName: string;
	readonly url: string;
	readonly action: DaemonStartAction;
	readonly reason?: DaemonLifecycleReason;
	readonly wasRunning: boolean;
	readonly daemonPort: number;
}

export interface ArcadeProjectListLaunchResult {
	readonly kind: "project-list";
	readonly projects: readonly V2Project[];
	readonly url: string;
	readonly action: DaemonStartAction;
	readonly reason?: DaemonLifecycleReason;
	readonly wasRunning: boolean;
	readonly daemonPort: number;
}

export type ArcadeLaunchResult =
	| ArcadeProjectLaunchResult
	| ArcadeProjectListLaunchResult;

interface ProjectsListResponse {
	readonly projects?: readonly V2Project[];
}

interface ErrorResponse {
	readonly error?: string;
}

const directoryExists = (path: string): boolean => {
	try {
		return statSync(path).isDirectory();
	} catch {
		return false;
	}
};

const validateResolvedProjectRoot = (
	projectRoot: string,
): E.Either<CLIError, string> => {
	const rp1Path = join(projectRoot, ".rp1");
	if (!directoryExists(rp1Path)) {
		return E.left(
			notFoundError(
				`.rp1 directory at ${projectRoot}`,
				"Make sure you are in an rp1 project directory or specify the correct path",
			),
		);
	}

	return E.right(projectRoot);
};

export const resolveArcadeProjectRoot = (
	projectPath: string,
): E.Either<CLIError, string> => {
	const resolved = resolveDirectorySet(projectPath);
	if (E.isLeft(resolved)) return resolved;
	return validateResolvedProjectRoot(resolved.right.projectRoot);
};

const throwLeft = <A>(result: E.Either<CLIError, A>): A => {
	if (E.isLeft(result)) throw result.left;
	return result.right;
};

const ensureArcadeDaemon = async (options: ArcadeLaunchOptions) => {
	const { ensureDaemon } = await import("../../web-ui/src/daemon/index.js");

	return ensureDaemon(options.port ?? DEFAULT_ARCADE_PORT, {
		cliVersion: options.cliVersion,
		executablePath: options.rp1ExecutablePath,
	});
};

const readErrorResponse = async (response: Response): Promise<string> => {
	try {
		const body = (await response.json()) as ErrorResponse;
		return body.error ?? `HTTP ${response.status}`;
	} catch {
		return `HTTP ${response.status}`;
	}
};

const fetchProjectsWithDaemon = async (
	connection: DaemonConnection,
): Promise<readonly V2Project[]> => {
	const response = await fetch(`${connection.baseUrl}/api/v2/projects`, {
		method: "GET",
		signal: AbortSignal.timeout(5000),
	});

	if (!response.ok) {
		throw new Error(await readErrorResponse(response));
	}

	const body = (await response.json()) as ProjectsListResponse;
	if (!Array.isArray(body.projects)) {
		throw new Error("Project list response did not include projects");
	}

	return body.projects;
};

export const launchArcadeForProject = async (
	options: ArcadeLaunchOptions & { readonly projectPath: string },
): Promise<ArcadeProjectLaunchResult> => {
	const projectRoot = throwLeft(resolveArcadeProjectRoot(options.projectPath));
	const { registerProjectWithDaemon } = await import(
		"../../web-ui/src/daemon/index.js"
	);

	const { connection, action, reason, wasRunning } =
		await ensureArcadeDaemon(options);
	const { project, url } = await registerProjectWithDaemon(
		connection,
		projectRoot,
	);

	return {
		kind: "project",
		projectId: project.id,
		projectName: project.name,
		url,
		action,
		reason,
		wasRunning,
		daemonPort: connection.port,
	};
};

export const launchArcadeProjectList = async (
	options: ArcadeLaunchOptions = {},
): Promise<ArcadeProjectListLaunchResult> => {
	const { connection, action, reason, wasRunning } =
		await ensureArcadeDaemon(options);
	const projects = await fetchProjectsWithDaemon(connection);

	return {
		kind: "project-list",
		projects,
		url: `${connection.baseUrl}/projects`,
		action,
		reason,
		wasRunning,
		daemonPort: connection.port,
	};
};

export const launchArcade = async (
	options: ArcadeLaunchOptions,
): Promise<ArcadeLaunchResult> => {
	if (options.projectPath) {
		return launchArcadeForProject({
			...options,
			projectPath: options.projectPath,
		});
	}

	if (options.openProjectListWhenMissing === true) {
		return launchArcadeProjectList(options);
	}

	throw usageError(
		"Project path is required for Arcade project launch",
		"Pass projectPath or enable openProjectListWhenMissing to load registered projects",
	);
};

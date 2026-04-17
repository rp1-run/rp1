import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "./errors.js";
import { notFoundError } from "./errors.js";
import { PROJECT_ID_FILENAME, readProjectId } from "./project-id.js";

export type ProjectRootSource = "walk_up" | "git_common_dir";

export interface ResolvedDirectorySet {
	readonly projectRoot: string;
	readonly projectId: string | undefined;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly codeRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
}

export interface DirectoryResolutionOptions {
	readonly allowHomeProjectRoot?: boolean;
	readonly requireProjectId?: boolean;
}

interface GitContext {
	readonly gitDir: string;
	readonly commonDir: string;
	readonly topLevel: string;
	readonly branch?: string;
}

const GIT_ENV_VARS_TO_CLEAR = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
] as const;

const getIsolatedGitEnv = (): NodeJS.ProcessEnv => {
	const env = { ...process.env };
	for (const key of GIT_ENV_VARS_TO_CLEAR) {
		delete env[key];
	}
	return env;
};

const isDirectory = (targetPath: string): boolean => {
	try {
		return statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
};

const hasProjectIdFile = (targetPath: string): boolean =>
	existsSync(path.join(targetPath, ".rp1", PROJECT_ID_FILENAME));

const hasRp1Directory = (targetPath: string): boolean =>
	isDirectory(path.join(targetPath, ".rp1"));

const canonicalizePathForComparison = (targetPath: string): string => {
	const resolvedPath = path.resolve(targetPath);
	try {
		return realpathSync(resolvedPath);
	} catch {
		return resolvedPath;
	}
};

const getUserHomeDirectory = (): string =>
	canonicalizePathForComparison(process.env.HOME ?? homedir());

const canAutoDiscoverProjectRoot = (
	targetPath: string,
	options: DirectoryResolutionOptions,
): boolean =>
	options.allowHomeProjectRoot === true ||
	canonicalizePathForComparison(targetPath) !== getUserHomeDirectory();

const walkUpToProjectRoot = (
	startPath: string,
	options: DirectoryResolutionOptions,
): { root: string; hasProjectId: boolean } | undefined => {
	let current = path.resolve(startPath);
	let fallbackRp1Dir: string | undefined;

	while (true) {
		if (
			hasProjectIdFile(current) &&
			canAutoDiscoverProjectRoot(current, options)
		) {
			return { root: current, hasProjectId: true };
		}

		if (
			fallbackRp1Dir === undefined &&
			hasRp1Directory(current) &&
			canAutoDiscoverProjectRoot(current, options)
		) {
			fallbackRp1Dir = current;
		}

		const parent = path.dirname(current);
		if (parent === current) {
			break;
		}
		current = parent;
	}

	if (fallbackRp1Dir !== undefined) {
		console.warn(
			`[rp1] Found .rp1/ directory at ${fallbackRp1Dir} without project_id. Run 'rp1 migrate' to create one.`,
		);
		return { root: fallbackRp1Dir, hasProjectId: false };
	}

	return undefined;
};

const missingProjectIdError = (projectRoot: string): CLIError =>
	notFoundError(
		".rp1/project_id",
		`Found a legacy rp1 project at ${projectRoot}. Run 'rp1 migrate' from that project root to create .rp1/project_id.`,
	);

const execGit = (cwd: string, args: readonly string[]): string =>
	execFileSync("git", [...args], {
		cwd,
		encoding: "utf-8",
		stdio: ["ignore", "pipe", "pipe"],
		env: getIsolatedGitEnv(),
	}).trim();

const readGitContext = (cwd: string): GitContext | undefined => {
	try {
		const gitDir = execGit(cwd, ["rev-parse", "--git-dir"]);
		const commonDir = execGit(cwd, ["rev-parse", "--git-common-dir"]);
		const topLevel = execGit(cwd, ["rev-parse", "--show-toplevel"]);
		const branch = execGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);

		return {
			gitDir,
			commonDir,
			topLevel,
			branch: branch === "HEAD" ? undefined : branch,
		};
	} catch {
		return undefined;
	}
};

const normalizeGitPath = (cwd: string, gitPath: string): string =>
	path.isAbsolute(gitPath) ? gitPath : path.resolve(cwd, gitPath);

const deriveProjectRootFromCommonDir = (commonDir: string): string =>
	path.basename(commonDir) === ".git" ? path.dirname(commonDir) : commonDir;

const normalizeProjectKey = (projectRoot: string): string => {
	const resolvedRoot = path.resolve(projectRoot);
	const normalizedRoot = resolvedRoot
		.replace(/^[A-Za-z]:/, "")
		.replace(/^\/+/, "")
		.replace(/[\\/]+/g, "-")
		.replace(/[^A-Za-z0-9._-]/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");

	return normalizedRoot.length > 0 ? normalizedRoot : "project";
};

export { normalizeProjectKey };

const buildDirectorySet = (params: {
	projectRoot: string;
	codeRoot: string;
	isWorktree: boolean;
	worktreeName?: string;
}): ResolvedDirectorySet => {
	const projectRoot = path.resolve(params.projectRoot);
	const projectId = readProjectId(projectRoot);

	return {
		projectRoot,
		projectId,
		kbRoot: path.join(projectRoot, ".rp1", "context"),
		workRoot: path.join(projectRoot, ".rp1", "work"),
		codeRoot: path.resolve(params.codeRoot),
		isWorktree: params.isWorktree,
		worktreeName: params.worktreeName,
	};
};

export const resolveDirectorySet = (
	startPath: string = process.cwd(),
	options: DirectoryResolutionOptions = {},
): E.Either<CLIError, ResolvedDirectorySet> => {
	const resolvedStartPath = path.resolve(startPath);

	// Phase 1: Check git worktree status FIRST.
	// If we're in a worktree, resolve to the main repo's project root so that
	// worktrees with their own .rp1/project_id (e.g. checked into the repo)
	// don't get registered as separate projects.
	const gitContext = existsSync(resolvedStartPath)
		? readGitContext(resolvedStartPath)
		: undefined;

	if (gitContext) {
		const gitDir = normalizeGitPath(resolvedStartPath, gitContext.gitDir);
		const commonDir = normalizeGitPath(resolvedStartPath, gitContext.commonDir);
		const isWorktree = gitDir !== commonDir;

		if (isWorktree) {
			const commonDirProjectRoot = deriveProjectRootFromCommonDir(commonDir);

			if (
				hasProjectIdFile(commonDirProjectRoot) ||
				hasRp1Directory(commonDirProjectRoot)
			) {
				if (
					options.requireProjectId === true &&
					!hasProjectIdFile(commonDirProjectRoot)
				) {
					return E.left(missingProjectIdError(commonDirProjectRoot));
				}

				if (!hasProjectIdFile(commonDirProjectRoot)) {
					console.warn(
						`[rp1] Found .rp1/ directory at ${commonDirProjectRoot} without project_id. Run 'rp1 migrate' to create one.`,
					);
				}

				return E.right(
					buildDirectorySet({
						projectRoot: commonDirProjectRoot,
						codeRoot: gitContext.topLevel,
						isWorktree: true,
						worktreeName: gitContext.branch,
					}),
				);
			}
		}
	}

	// Phase 2: Walk up directory tree to find .rp1/project_id.
	// Only reached for non-worktree contexts or worktrees whose main repo
	// lacks an .rp1 directory.
	const walkedResult = walkUpToProjectRoot(resolvedStartPath, options);
	if (walkedResult) {
		if (options.requireProjectId === true && !walkedResult.hasProjectId) {
			return E.left(missingProjectIdError(walkedResult.root));
		}

		return E.right(
			buildDirectorySet({
				projectRoot: walkedResult.root,
				codeRoot: walkedResult.root,
				isWorktree: false,
			}),
		);
	}

	return E.left(
		notFoundError(
			".rp1/project_id",
			"No rp1 project found. Run 'rp1 init' to initialize a project.",
		),
	);
};

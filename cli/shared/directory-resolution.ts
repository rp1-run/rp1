import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
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
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
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

const walkUpToProjectRoot = (
	startPath: string,
): { root: string; hasProjectId: boolean } | undefined => {
	let current = path.resolve(startPath);
	let fallbackRp1Dir: string | undefined;

	while (true) {
		if (hasProjectIdFile(current)) {
			return { root: current, hasProjectId: true };
		}

		if (fallbackRp1Dir === undefined && hasRp1Directory(current)) {
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
		isWorktree: params.isWorktree,
		worktreeName: params.worktreeName,
	};
};

export const resolveDirectorySet = (
	startPath: string = process.cwd(),
): E.Either<CLIError, ResolvedDirectorySet> => {
	const resolvedStartPath = path.resolve(startPath);

	const walkedResult = walkUpToProjectRoot(resolvedStartPath);
	if (walkedResult) {
		return E.right(
			buildDirectorySet({
				projectRoot: walkedResult.root,
				isWorktree: false,
			}),
		);
	}

	const gitContext = existsSync(resolvedStartPath)
		? readGitContext(resolvedStartPath)
		: undefined;

	if (gitContext) {
		const gitDir = normalizeGitPath(resolvedStartPath, gitContext.gitDir);
		const commonDir = normalizeGitPath(resolvedStartPath, gitContext.commonDir);
		const isWorktree = gitDir !== commonDir;
		const commonDirProjectRoot = deriveProjectRootFromCommonDir(commonDir);

		if (
			isWorktree &&
			(hasProjectIdFile(commonDirProjectRoot) ||
				hasRp1Directory(commonDirProjectRoot))
		) {
			if (!hasProjectIdFile(commonDirProjectRoot)) {
				console.warn(
					`[rp1] Found .rp1/ directory at ${commonDirProjectRoot} without project_id. Run 'rp1 migrate' to create one.`,
				);
			}

			return E.right(
				buildDirectorySet({
					projectRoot: commonDirProjectRoot,
					isWorktree: true,
					worktreeName: gitContext.branch,
				}),
			);
		}
	}

	return E.left(
		notFoundError(
			".rp1/project_id",
			"No rp1 project found. Run 'rp1 init' to initialize a project.",
		),
	);
};

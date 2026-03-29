import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "./errors.js";

export type ProjectRootSource =
	| "env"
	| "walk_up"
	| "git_common_dir"
	| "git_repo_root"
	| "cwd_fallback";

export type DirectorySource =
	| "env"
	| "project_settings"
	| "user_settings"
	| "default";

export interface ResolvedDirectorySet {
	readonly projectRoot: string;
	readonly rp1Root: string;
	readonly kbDir: string;
	readonly workDir: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly sources: {
		readonly projectRoot: ProjectRootSource;
		readonly kbDir: DirectorySource;
		readonly workDir: DirectorySource;
	};
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

const hasRp1Directory = (targetPath: string): boolean =>
	isDirectory(path.join(targetPath, ".rp1"));

const walkUpToProjectRoot = (startPath: string): string | undefined => {
	let current = path.resolve(startPath);
	while (true) {
		if (hasRp1Directory(current)) {
			return current;
		}

		const parent = path.dirname(current);
		if (parent === current) {
			return undefined;
		}
		current = parent;
	}
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

const buildResolvedDirectorySet = (params: {
	projectRoot: string;
	projectRootSource: ProjectRootSource;
	isWorktree: boolean;
	worktreeName?: string;
}): ResolvedDirectorySet => {
	const rp1RootFromEnv = process.env.RP1_ROOT;
	const kbDirFromEnv = process.env.RP1_KB_DIR;
	const workDirFromEnv = process.env.RP1_WORK_DIR;

	const projectRoot = path.resolve(params.projectRoot);
	const rp1Root = rp1RootFromEnv
		? path.resolve(rp1RootFromEnv)
		: path.join(projectRoot, ".rp1");
	const kbDir = kbDirFromEnv
		? path.resolve(kbDirFromEnv)
		: path.join(rp1Root, "context");
	const workDir = workDirFromEnv
		? path.resolve(workDirFromEnv)
		: path.join(homedir(), ".rp1", normalizeProjectKey(projectRoot));

	return {
		projectRoot,
		rp1Root,
		kbDir,
		workDir,
		isWorktree: params.isWorktree,
		worktreeName: params.worktreeName,
		sources: {
			projectRoot: params.projectRootSource,
			kbDir: kbDirFromEnv ? "env" : "default",
			workDir: workDirFromEnv ? "env" : "default",
		},
	};
};

export const resolveDirectorySet = (
	startPath: string = process.cwd(),
): E.Either<CLIError, ResolvedDirectorySet> => {
	const resolvedStartPath = path.resolve(startPath);

	const projectRootFromEnv = process.env.RP1_PROJECT_ROOT;
	if (projectRootFromEnv) {
		return E.right(
			buildResolvedDirectorySet({
				projectRoot: projectRootFromEnv,
				projectRootSource: "env",
				isWorktree: false,
			}),
		);
	}

	const rp1RootFromEnv = process.env.RP1_ROOT;
	if (rp1RootFromEnv) {
		return E.right(
			buildResolvedDirectorySet({
				projectRoot: path.dirname(path.resolve(rp1RootFromEnv)),
				projectRootSource: "env",
				isWorktree: false,
			}),
		);
	}

	const walkedProjectRoot = walkUpToProjectRoot(resolvedStartPath);
	if (walkedProjectRoot) {
		return E.right(
			buildResolvedDirectorySet({
				projectRoot: walkedProjectRoot,
				projectRootSource: "walk_up",
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

		if (isWorktree && hasRp1Directory(commonDirProjectRoot)) {
			return E.right(
				buildResolvedDirectorySet({
					projectRoot: commonDirProjectRoot,
					projectRootSource: "git_common_dir",
					isWorktree: true,
					worktreeName: gitContext.branch,
				}),
			);
		}

		return E.right(
			buildResolvedDirectorySet({
				projectRoot: gitContext.topLevel,
				projectRootSource: "git_repo_root",
				isWorktree,
				worktreeName: isWorktree ? gitContext.branch : undefined,
			}),
		);
	}

	return E.right(
		buildResolvedDirectorySet({
			projectRoot: resolvedStartPath,
			projectRootSource: "cwd_fallback",
			isWorktree: false,
		}),
	);
};

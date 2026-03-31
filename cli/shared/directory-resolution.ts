import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "./errors.js";
import {
	type LoadedDirectorySettings,
	loadDirectorySettings,
} from "./settings.js";

export type ProjectRootSource =
	| "env"
	| "project_settings"
	| "user_settings"
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
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly sources: {
		readonly projectRoot: ProjectRootSource;
		readonly kbRoot: DirectorySource;
		readonly workRoot: DirectorySource;
	};
}

type DirectorySettingsLoadOptions = Parameters<typeof loadDirectorySettings>[1];
type ResolveDirectorySetOptions = DirectorySettingsLoadOptions & {
	readonly honorEnv?: boolean;
};

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

export const defaultWorkRootForProject = (projectRoot: string): string =>
	path.join(homedir(), ".rp1", "work", normalizeProjectKey(projectRoot));

const buildResolvedDirectorySet = (params: {
	projectRoot: string;
	projectRootSource: ProjectRootSource;
	isWorktree: boolean;
	worktreeName?: string;
	legacyRp1Root?: string;
	options?: ResolveDirectorySetOptions;
}): E.Either<CLIError, ResolvedDirectorySet> => {
	const honorEnv = params.options?.honorEnv !== false;
	const kbRootFromEnv = honorEnv ? process.env.RP1_KB_ROOT : undefined;
	const workRootFromEnv = honorEnv ? process.env.RP1_WORK_ROOT : undefined;
	const candidateProjectRoot = path.resolve(params.projectRoot);
	return E.map((settings: LoadedDirectorySettings): ResolvedDirectorySet => {
		const projectRoot =
			params.projectRootSource === "env"
				? candidateProjectRoot
				: path.resolve(settings.projectRoot ?? candidateProjectRoot);
		const projectRootSource: ProjectRootSource =
			params.projectRootSource === "env"
				? params.projectRootSource
				: (settings.sources.projectRoot ?? params.projectRootSource);
		const rp1DotDir = params.legacyRp1Root
			? path.resolve(params.legacyRp1Root)
			: path.join(projectRoot, ".rp1");
		const kbRoot = kbRootFromEnv
			? path.resolve(kbRootFromEnv)
			: (settings.kbRoot ?? path.join(rp1DotDir, "context"));
		const workRoot = workRootFromEnv
			? path.resolve(workRootFromEnv)
			: (settings.workRoot ?? defaultWorkRootForProject(projectRoot));
		const kbRootSource: DirectorySource = kbRootFromEnv
			? "env"
			: (settings.sources.kbRoot ?? "default");
		const workRootSource: DirectorySource = workRootFromEnv
			? "env"
			: (settings.sources.workRoot ?? "default");

		return {
			projectRoot,
			kbRoot,
			workRoot,
			isWorktree: params.isWorktree,
			worktreeName: params.worktreeName,
			sources: {
				projectRoot: projectRootSource,
				kbRoot: kbRootSource,
				workRoot: workRootSource,
			},
		};
	})(loadDirectorySettings(candidateProjectRoot, params.options));
};

export const resolveDirectorySet = (
	startPath: string = process.cwd(),
	options?: ResolveDirectorySetOptions,
): E.Either<CLIError, ResolvedDirectorySet> => {
	const resolvedStartPath = path.resolve(startPath);
	const honorEnv = options?.honorEnv !== false;

	if (honorEnv) {
		const projectRootFromEnv = process.env.RP1_PROJECT_ROOT;
		if (projectRootFromEnv) {
			return buildResolvedDirectorySet({
				projectRoot: projectRootFromEnv,
				projectRootSource: "env",
				isWorktree: false,
				options,
			});
		}

		const rp1RootFromEnv = process.env.RP1_ROOT;
		if (rp1RootFromEnv) {
			return buildResolvedDirectorySet({
				projectRoot: path.dirname(path.resolve(rp1RootFromEnv)),
				projectRootSource: "env",
				isWorktree: false,
				legacyRp1Root: rp1RootFromEnv,
				options,
			});
		}
	}

	const walkedProjectRoot = walkUpToProjectRoot(resolvedStartPath);
	if (walkedProjectRoot) {
		return buildResolvedDirectorySet({
			projectRoot: walkedProjectRoot,
			projectRootSource: "walk_up",
			isWorktree: false,
			options,
		});
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
			return buildResolvedDirectorySet({
				projectRoot: commonDirProjectRoot,
				projectRootSource: "git_common_dir",
				isWorktree: true,
				worktreeName: gitContext.branch,
				options,
			});
		}

		return buildResolvedDirectorySet({
			projectRoot: gitContext.topLevel,
			projectRootSource: "git_repo_root",
			isWorktree,
			worktreeName: isWorktree ? gitContext.branch : undefined,
			options,
		});
	}

	return buildResolvedDirectorySet({
		projectRoot: resolvedStartPath,
		projectRootSource: "cwd_fallback",
		isWorktree: false,
		options,
	});
};

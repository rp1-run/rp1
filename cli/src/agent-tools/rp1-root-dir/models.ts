import type {
	DirectorySource,
	ProjectRootSource,
} from "../../../shared/directory-resolution.js";

export type Rp1RootSource = "env" | "git-common-dir" | "cwd";

export interface Rp1RootSources {
	readonly root: Rp1RootSource;
	readonly projectRoot: ProjectRootSource;
	readonly kbDir: DirectorySource;
	readonly workDir: DirectorySource;
}

export interface Rp1RootResult {
	readonly root: string;
	readonly projectRoot: string;
	readonly kbDir: string;
	readonly workDir: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly source: Rp1RootSource;
	readonly sources: Rp1RootSources;
}

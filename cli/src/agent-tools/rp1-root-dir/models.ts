import type {
	DirectorySource,
	ProjectRootSource,
} from "../../../shared/directory-resolution.js";

export type Rp1RootSource = "env" | "git-common-dir" | "cwd";

export interface Rp1RootSources {
	readonly projectRoot: ProjectRootSource;
	readonly kbRoot: DirectorySource;
	readonly workRoot: DirectorySource;
}

export interface Rp1RootResult {
	readonly projectRoot: string;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly source: Rp1RootSource;
	readonly sources: Rp1RootSources;
}

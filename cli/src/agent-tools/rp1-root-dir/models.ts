export interface Rp1RootResult {
	readonly projectRoot: string;
	readonly projectId: string | undefined;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly codeRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
}

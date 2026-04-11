import type { RunInvocationContext } from "@/types/runs";

function formatRunPolicy(runPolicy: RunInvocationContext["runPolicy"]): string {
	return runPolicy === "fresh" ? "Fresh" : "Resumable";
}

function formatDecision(decision: RunInvocationContext["decision"]): string {
	switch (decision) {
		case "matched_non_terminal_run":
			return "Resumed existing run";
		case "legacy_backfill_resume":
			return "Resumed legacy run";
		default:
			return "Created new run";
	}
}

function formatWorktreeState(invocation: RunInvocationContext): string {
	if (!invocation.isWorktree) {
		return "Canonical checkout";
	}

	return invocation.worktreeName
		? `Linked worktree (${invocation.worktreeName})`
		: "Linked worktree";
}

function InvocationField({
	label,
	value,
	monospace = false,
}: {
	readonly label: string;
	readonly value: string;
	readonly monospace?: boolean;
}) {
	return (
		<div className="min-w-0">
			<dt className="type-secondary text-fg-muted tracking-wider uppercase">
				{label}
			</dt>
			<dd
				className={[
					"mt-[4px] type-secondary text-fg",
					monospace ? "break-all" : "",
				]
					.filter(Boolean)
					.join(" ")}
			>
				{value}
			</dd>
		</div>
	);
}

export function RunInvocationCard({
	invocation,
}: {
	readonly invocation?: RunInvocationContext;
}) {
	if (!invocation) {
		return null;
	}

	return (
		<section className="shrink-0 border-b border-border bg-surface-void px-md py-md md:px-[40px] md:py-[24px]">
			<div className="rounded border border-border bg-surface px-md py-md">
				<h2 className="type-secondary text-fg-muted tracking-wider uppercase">
					Invocation
				</h2>
				<dl className="mt-md grid gap-x-lg gap-y-md md:grid-cols-2 xl:grid-cols-3">
					<InvocationField label="Workflow" value={invocation.workflowName} />
					<InvocationField
						label="Run Policy"
						value={formatRunPolicy(invocation.runPolicy)}
					/>
					<InvocationField
						label="Decision"
						value={formatDecision(invocation.decision)}
					/>
					<InvocationField
						label="Canonical Root"
						value={invocation.canonicalProjectRoot}
						monospace
					/>
					<InvocationField
						label="Requested Root"
						value={invocation.requestedProjectRoot}
						monospace
					/>
					<InvocationField
						label="Worktree"
						value={formatWorktreeState(invocation)}
					/>
					<InvocationField
						label="Work Identity"
						value={invocation.workIdentity ?? "Not used"}
						monospace
					/>
				</dl>
			</div>
		</section>
	);
}

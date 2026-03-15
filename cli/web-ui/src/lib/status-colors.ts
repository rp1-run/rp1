import type { RunStatus } from "@/types/runs";

export const statusBorderColors: Record<RunStatus, string> = {
	running: "border-l-status-running",
	failed: "border-l-status-failed",
	completed: "border-l-status-completed",
	"waiting-input": "border-l-status-waiting",
	"needs-review": "border-l-status-needs-review",
	queued: "border-l-status-queued",
	not_started: "border-l-muted-foreground",
	waiting: "border-l-status-waiting",
	skipped: "border-l-muted-foreground",
};

export const statusGlowColors: Record<RunStatus, string> = {
	running: "hsl(var(--status-accent-running) / 0.2)",
	failed: "hsl(var(--status-accent-failed) / 0.2)",
	completed: "hsl(var(--status-accent-completed) / 0.2)",
	"waiting-input": "hsl(var(--status-accent-waiting) / 0.2)",
	"needs-review": "hsl(var(--status-accent-needs-review) / 0.2)",
	queued: "hsl(var(--status-accent-queued) / 0.1)",
	not_started: "hsl(var(--status-accent-queued) / 0.1)",
	waiting: "hsl(var(--status-accent-waiting) / 0.2)",
	skipped: "hsl(var(--status-accent-queued) / 0.1)",
};

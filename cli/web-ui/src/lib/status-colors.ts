import type { RunStatus } from "@/types/runs";

export const statusBorderColors: Record<RunStatus, string> = {
	not_started: "border-l-muted-foreground",
	running: "border-l-status-running",
	waiting: "border-l-status-waiting",
	inactive: "border-l-muted-foreground",
	completed: "border-l-status-completed",
	failed: "border-l-status-failed",
	cancelled: "border-l-muted-foreground",
	abandoned: "border-l-status-failed",
	skipped: "border-l-muted-foreground",
};

export const statusGlowColors: Record<RunStatus, string> = {
	not_started: "hsl(var(--status-accent-queued) / 0.1)",
	running: "hsl(var(--status-accent-running) / 0.2)",
	waiting: "hsl(var(--status-accent-waiting) / 0.2)",
	inactive: "hsl(var(--status-accent-queued) / 0.08)",
	completed: "hsl(var(--status-accent-completed) / 0.2)",
	failed: "hsl(var(--status-accent-failed) / 0.2)",
	cancelled: "hsl(var(--status-accent-queued) / 0.08)",
	abandoned: "hsl(var(--status-accent-failed) / 0.12)",
	skipped: "hsl(var(--status-accent-queued) / 0.1)",
};

import type { RunStatus } from "@/types/runs";

export const statusBorderColors: Record<RunStatus, string> = {
	running: "border-l-status-running",
	failed: "border-l-status-failed",
	completed: "border-l-status-completed",
	"waiting-input": "border-l-status-waiting",
	"needs-review": "border-l-status-needs-review",
	queued: "border-l-status-queued",
};

export const statusGlowColors: Record<RunStatus, string> = {
	running: "hsl(var(--status-running) / 0.4)",
	failed: "hsl(var(--status-failed) / 0.4)",
	completed: "hsl(var(--status-completed) / 0.4)",
	"waiting-input": "hsl(var(--status-waiting) / 0.4)",
	"needs-review": "hsl(var(--status-needs-review) / 0.4)",
	queued: "hsl(var(--status-queued) / 0.2)",
};

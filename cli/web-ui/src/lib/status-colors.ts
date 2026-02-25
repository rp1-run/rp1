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
	running: "hsl(var(--status-running) / 0.25)",
	failed: "hsl(var(--status-failed) / 0.25)",
	completed: "hsl(var(--status-completed) / 0.25)",
	"waiting-input": "hsl(var(--status-waiting) / 0.25)",
	"needs-review": "hsl(var(--status-needs-review) / 0.25)",
	queued: "hsl(var(--status-queued) / 0.15)",
};

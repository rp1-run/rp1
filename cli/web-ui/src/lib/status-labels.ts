import type { Status } from "../../../shared/events";

export const STATUS_LABELS: Record<Status, string> = {
	not_started: "Not Started",
	running: "Running",
	waiting: "Waiting",
	completed: "Completed",
	failed: "Failed",
	skipped: "Skipped",
};

export function getStatusLabel(status: Status): string {
	return STATUS_LABELS[status];
}

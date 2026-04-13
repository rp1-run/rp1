import type { Status } from "../../../shared/events";

export const STATUS_LABELS: Record<Status, string> = {
	not_started: "Not Started",
	running: "Running",
	waiting: "Waiting",
	inactive: "Inactive",
	completed: "Completed",
	failed: "Failed",
	cancelled: "Cancelled",
	abandoned: "Abandoned",
	skipped: "Skipped",
};

export function getStatusLabel(status: Status): string {
	return STATUS_LABELS[status];
}

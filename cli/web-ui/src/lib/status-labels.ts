import type { Run } from "@/types/runs";
import type { Status } from "../../../shared/events";
import {
	getSocraticDuelEventLabel,
	getSocraticDuelOutcomeLabel,
	isSocraticDuelDisplayLabel,
	isSocraticDuelFlow,
} from "./socratic-duel-status";

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

export function getRunStatusLabel(
	run: Pick<
		Run,
		"command" | "currentStep" | "events" | "status" | "statusMessage"
	>,
): string {
	if (isSocraticDuelFlow(run.command)) {
		if (isSocraticDuelDisplayLabel(run.statusMessage)) {
			return run.statusMessage;
		}

		let latestStepLabel: string | null = null;
		for (let index = run.events.length - 1; index >= 0; index -= 1) {
			const event = run.events[index];
			if (!event) continue;

			const outcomeLabel = getSocraticDuelOutcomeLabel(
				event.metadata?.outcome ?? event.metadata?.terminal_outcome,
			);
			if (outcomeLabel) return outcomeLabel;

			latestStepLabel ??= getSocraticDuelEventLabel(
				run.command,
				event.stepId,
				event.metadata,
			);
		}
		if (latestStepLabel) return latestStepLabel;

		const stepLabel = getSocraticDuelEventLabel(
			run.command,
			run.currentStep,
			null,
		);
		if (stepLabel) return stepLabel;
	}

	return getStatusLabel(run.status);
}

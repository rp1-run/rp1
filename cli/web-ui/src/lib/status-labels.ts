import type { Run } from "@/types/runs";
import type { Status } from "../../../shared/events";
import {
	getSocraticDuelEventLabel,
	getSocraticDuelOutcomeLabel,
	getSocraticDuelStepLabel,
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

function formatStepLabel(stepId: string): string {
	const displayId = stepId.includes(":")
		? stepId.slice(stepId.lastIndexOf(":") + 1)
		: stepId;
	return displayId
		.split(/[-_]/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

export function getRunCurrentStepLabel(
	run: Pick<Run, "command" | "currentStep" | "steps">,
): string | null {
	if (!run.currentStep) return null;
	if (isSocraticDuelFlow(run.command)) {
		const label = getSocraticDuelStepLabel(run.currentStep);
		if (label) return label;
	}
	return (
		run.steps.find((step) => step.id === run.currentStep)?.name ??
		formatStepLabel(run.currentStep)
	);
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

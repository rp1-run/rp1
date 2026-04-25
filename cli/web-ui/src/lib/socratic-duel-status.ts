const SOCRATIC_DUEL_FLOWS = new Set(["socratic-duel", "socratic-duel-run"]);

const SOCRATIC_DUEL_STEP_LABELS: Record<string, string> = {
	preparing: "Preparing",
	waiting_for_participant: "Waiting for participant",
	debating: "Debating",
	closing: "Closing",
	completed: "Completed",
	invalidated: "Invalidated",
};

const SOCRATIC_DUEL_OUTCOME_LABELS: Record<string, string> = {
	ACCEPTED_CONSENSUS: "Completed",
	DISSENT: "Dissent",
	MAX_TURNS: "Max turns",
	TIMEOUT: "Timed out",
	INVALIDATED: "Invalidated",
};

const SOCRATIC_DUEL_LABELS = new Set([
	...Object.values(SOCRATIC_DUEL_STEP_LABELS),
	...Object.values(SOCRATIC_DUEL_OUTCOME_LABELS),
]);

export function isSocraticDuelFlow(flowOrCommand: string | null | undefined) {
	if (!flowOrCommand) return false;
	const flow = flowOrCommand.startsWith("/")
		? flowOrCommand.slice(1)
		: flowOrCommand;
	return SOCRATIC_DUEL_FLOWS.has(flow);
}

export function getSocraticDuelStepLabel(
	step: string | null | undefined,
): string | null {
	return step ? (SOCRATIC_DUEL_STEP_LABELS[step] ?? null) : null;
}

export function getSocraticDuelOutcomeLabel(outcome: unknown): string | null {
	return typeof outcome === "string"
		? (SOCRATIC_DUEL_OUTCOME_LABELS[outcome] ?? null)
		: null;
}

export function isSocraticDuelDisplayLabel(
	value: string | null | undefined,
): value is string {
	return value ? SOCRATIC_DUEL_LABELS.has(value) : false;
}

export function getSocraticDuelEventLabel(
	flowOrCommand: string | null | undefined,
	step: string | null | undefined,
	data: Readonly<Record<string, unknown>> | null | undefined,
): string | null {
	if (!isSocraticDuelFlow(flowOrCommand)) return null;

	const outcomeLabel = getSocraticDuelOutcomeLabel(
		data?.outcome ?? data?.terminal_outcome,
	);
	if (outcomeLabel) return outcomeLabel;

	return getSocraticDuelStepLabel(step);
}

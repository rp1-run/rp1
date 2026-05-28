import type {
	AcpCancelInput,
	AcpPlanSignalPayload,
	AcpPromptInput,
	AcpProvider,
	AcpProviderSessionContext,
	AcpProviderSignalDraft,
} from "./types";

function compactPrompt(prompt: string): string {
	const trimmed = prompt.trim();
	return trimmed.length > 0 ? trimmed : "Inspect the bound rp1 run";
}

function fakePlan(runId: string): AcpPlanSignalPayload {
	return {
		items: [
			{
				id: "plan-1",
				title: `Inspect canonical run ${runId}`,
				status: "completed",
			},
			{
				id: "plan-2",
				title: "Summarize live transcript and tool activity",
				status: "running",
			},
			{
				id: "plan-3",
				title: "Wait for fake permission before continuing",
				status: "pending",
			},
		],
	};
}

export class FakeAcpProvider implements AcpProvider {
	readonly name = "fake";

	initialize(
		context: AcpProviderSessionContext,
	): readonly AcpProviderSignalDraft[] {
		return [
			{
				kind: "session",
				payload: {
					phase: "initialized",
					status: "initializing",
					message: `Fake ACP provider initialized for ${context.sessionId}`,
				},
			},
			{
				kind: "status",
				payload: {
					status: "initializing",
					health: "available",
					message: "Fake sidecar handshake is available",
				},
			},
		];
	}

	createSession(
		context: AcpProviderSessionContext,
	): readonly AcpProviderSignalDraft[] {
		return [
			{
				kind: "session",
				payload: {
					phase: "created",
					status: "ready",
					message: `Fake session bound to run ${context.runId}`,
				},
			},
			{
				kind: "status",
				payload: {
					status: "ready",
					health: "available",
					message: "Fake session is ready for a prompt",
				},
			},
		];
	}

	prompt(
		context: AcpProviderSessionContext,
		input: AcpPromptInput,
	): readonly AcpProviderSignalDraft[] {
		const prompt = compactPrompt(input.prompt);
		const turn = context.promptCount + 1;
		const toolCallId = `fake-tool-${turn}`;
		const permissionId = `fake-permission-${turn}`;

		return [
			{
				kind: "session",
				payload: {
					phase: "prompt_started",
					status: "running",
					message: `Fake prompt turn ${turn} started`,
				},
			},
			{
				kind: "transcript",
				payload: {
					role: "user",
					text: prompt,
				},
			},
			{
				kind: "status",
				payload: {
					status: "running",
					health: "available",
					message: "Streaming fake ACP activity",
				},
			},
			{
				kind: "plan",
				payload: fakePlan(context.runId),
			},
			{
				kind: "tool",
				payload: {
					toolCallId,
					name: "fake.read_run_context",
					status: "started",
					inputSummary: `project=${context.projectId} run=${context.runId}`,
				},
			},
			{
				kind: "transcript",
				payload: {
					role: "assistant",
					text: `I am inspecting run ${context.runId} and preparing live-only activity.`,
				},
			},
			{
				kind: "tool",
				payload: {
					toolCallId,
					name: "fake.read_run_context",
					status: "completed",
					outputSummary: "Loaded canonical run shell and live proof fixture",
				},
			},
			{
				kind: "permission",
				payload: {
					permissionId,
					title: "Approve fake sidecar continuation",
					reason:
						"Proof fixture needs a blocking permission state without changing the canonical run.",
					status: "pending",
					blocking: true,
				},
			},
			{
				kind: "status",
				payload: {
					status: "blocked",
					health: "blocked",
					message: "Waiting on fake sidecar permission",
				},
			},
		];
	}

	cancel(
		context: AcpProviderSessionContext,
		input?: AcpCancelInput,
	): readonly AcpProviderSignalDraft[] {
		const reason = input?.reason?.trim() || "Fake session cancelled";

		return [
			{
				kind: "status",
				payload: {
					status: "cancelling",
					health: "available",
					message: reason,
				},
			},
			{
				kind: "session",
				payload: {
					phase: "cancelled",
					status: "cancelled",
					message: `Fake session ${context.sessionId} cancelled`,
				},
			},
		];
	}

	close(context: AcpProviderSessionContext): readonly AcpProviderSignalDraft[] {
		return [
			{
				kind: "session",
				payload: {
					phase: "closed",
					status: "closed",
					message: `Fake session ${context.sessionId} closed`,
				},
			},
			{
				kind: "status",
				payload: {
					status: "closed",
					health: "closed",
					message: "Fake sidecar session is closed",
				},
			},
		];
	}
}

export type AcpSidecarProviderName = "fake";

export type AcpSidecarSessionStatus =
	| "initializing"
	| "ready"
	| "running"
	| "blocked"
	| "cancelling"
	| "cancelled"
	| "closed";

export type AcpSidecarSignalKind =
	| "session"
	| "transcript"
	| "tool"
	| "plan"
	| "permission"
	| "status";

export type AcpTranscriptRole = "user" | "assistant" | "system";

export type AcpToolStatus = "started" | "completed" | "failed";

export type AcpPlanItemStatus = "pending" | "running" | "completed";

export type AcpPermissionStatus =
	| "pending"
	| "granted"
	| "denied"
	| "cancelled";

export type AcpSessionPhase =
	| "initialized"
	| "created"
	| "prompt_started"
	| "cancelled"
	| "closed";

export interface AcpSidecarBinding {
	readonly projectId: string;
	readonly runId: string;
}

export interface AcpProviderSessionContext extends AcpSidecarBinding {
	readonly sessionId: string;
	readonly provider: AcpSidecarProviderName;
	readonly promptCount: number;
}

export interface AcpPromptInput {
	readonly prompt: string;
}

export interface AcpCancelInput {
	readonly reason?: string;
}

export interface AcpSessionSignalPayload {
	readonly phase: AcpSessionPhase;
	readonly status: AcpSidecarSessionStatus;
	readonly message: string;
}

export interface AcpTranscriptSignalPayload {
	readonly role: AcpTranscriptRole;
	readonly text: string;
}

export interface AcpToolSignalPayload {
	readonly toolCallId: string;
	readonly name: string;
	readonly status: AcpToolStatus;
	readonly inputSummary?: string;
	readonly outputSummary?: string;
}

export interface AcpPlanSignalPayload {
	readonly items: readonly {
		readonly id: string;
		readonly title: string;
		readonly status: AcpPlanItemStatus;
	}[];
}

export interface AcpPermissionSignalPayload {
	readonly permissionId: string;
	readonly title: string;
	readonly reason: string;
	readonly status: AcpPermissionStatus;
	readonly blocking: boolean;
}

export interface AcpStatusSignalPayload {
	readonly status: AcpSidecarSessionStatus;
	readonly message: string;
	readonly health: "available" | "blocked" | "closed";
}

export type AcpProviderSignalDraft =
	| {
			readonly kind: "session";
			readonly payload: AcpSessionSignalPayload;
	  }
	| {
			readonly kind: "transcript";
			readonly payload: AcpTranscriptSignalPayload;
	  }
	| {
			readonly kind: "tool";
			readonly payload: AcpToolSignalPayload;
	  }
	| {
			readonly kind: "plan";
			readonly payload: AcpPlanSignalPayload;
	  }
	| {
			readonly kind: "permission";
			readonly payload: AcpPermissionSignalPayload;
	  }
	| {
			readonly kind: "status";
			readonly payload: AcpStatusSignalPayload;
	  };

export interface AcpSidecarSignalBase extends AcpSidecarBinding {
	readonly signalId: string;
	readonly provider: AcpSidecarProviderName;
	readonly sessionId: string;
	readonly sequence: number;
	readonly timestamp: string;
}

export type AcpSidecarSignal =
	| (AcpSidecarSignalBase & {
			readonly kind: "session";
			readonly payload: AcpSessionSignalPayload;
	  })
	| (AcpSidecarSignalBase & {
			readonly kind: "transcript";
			readonly payload: AcpTranscriptSignalPayload;
	  })
	| (AcpSidecarSignalBase & {
			readonly kind: "tool";
			readonly payload: AcpToolSignalPayload;
	  })
	| (AcpSidecarSignalBase & {
			readonly kind: "plan";
			readonly payload: AcpPlanSignalPayload;
	  })
	| (AcpSidecarSignalBase & {
			readonly kind: "permission";
			readonly payload: AcpPermissionSignalPayload;
	  })
	| (AcpSidecarSignalBase & {
			readonly kind: "status";
			readonly payload: AcpStatusSignalPayload;
	  });

export interface AcpSidecarPermissionState {
	readonly permissionId: string;
	readonly title: string;
	readonly reason: string;
	readonly status: AcpPermissionStatus;
	readonly blocking: boolean;
	readonly updatedAt: string;
}

export interface AcpSidecarSession extends AcpSidecarBinding {
	readonly sessionId: string;
	readonly provider: AcpSidecarProviderName;
	readonly status: AcpSidecarSessionStatus;
	readonly promptCount: number;
	readonly activePermission: AcpSidecarPermissionState | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AcpSidecarResult {
	readonly session: AcpSidecarSession;
	readonly signals: readonly AcpSidecarSignal[];
}

export interface AcpSidecarActiveSessionSummary {
	readonly activeSessions: number;
	readonly blockedSessions: number;
}

export interface AcpProvider {
	readonly name: AcpSidecarProviderName;
	initialize(
		context: AcpProviderSessionContext,
	): readonly AcpProviderSignalDraft[];
	createSession(
		context: AcpProviderSessionContext,
	): readonly AcpProviderSignalDraft[];
	prompt(
		context: AcpProviderSessionContext,
		input: AcpPromptInput,
	): readonly AcpProviderSignalDraft[];
	cancel(
		context: AcpProviderSessionContext,
		input?: AcpCancelInput,
	): readonly AcpProviderSignalDraft[];
	close(context: AcpProviderSessionContext): readonly AcpProviderSignalDraft[];
}

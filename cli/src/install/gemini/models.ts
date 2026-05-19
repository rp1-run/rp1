export type GeminiSmokeStatus =
	| "ready"
	| "degraded_missing_binary"
	| "degraded_missing_command"
	| "degraded_trust_or_approval"
	| "registration_failed";

export const GEMINI_DELEGATION_EVIDENCE_STATUSES = [
	"passed",
	"failed",
	"blocked",
	"incomplete",
	"not_run",
] as const;

export type GeminiDelegationEvidenceStatus =
	(typeof GEMINI_DELEGATION_EVIDENCE_STATUSES)[number];

export const GEMINI_SUPPORT_CLASSIFICATION_STATUSES = [
	"evidence_recorded",
	"needs_attention",
	"out_of_scope",
] as const;

export type GeminiSupportClassificationStatus =
	(typeof GEMINI_SUPPORT_CLASSIFICATION_STATUSES)[number];

export const GEMINI_ACKNOWLEDGEMENT_SCOPES = [
	"extension",
	"project",
	"workspace",
	"user",
] as const;

export type GeminiAcknowledgementScope =
	(typeof GEMINI_ACKNOWLEDGEMENT_SCOPES)[number];

export const GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES = [
	"build_fast",
	"build",
	"knowledge_build",
	"deep_research",
	"pr_review",
] as const;

export type GeminiWorkflowClass =
	(typeof GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES)[number];

export const GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON =
	"Gemini delegation readiness evidence has not passed for custom subagents, fanout attribution, acknowledgement caveats, and delegated failure handling.";

export interface GeminiStatusDetail {
	readonly label: string;
	readonly issue: string | null;
	readonly remediation: string;
}

export type GeminiSmokeStatusDetail = GeminiStatusDetail;

export const GEMINI_SMOKE_STATUS_DETAILS = {
	ready: {
		label: "ready",
		issue: null,
		remediation:
			"Restart Gemini CLI, then run installed rp1 workflows from Gemini slash commands.",
	},
	degraded_missing_binary: {
		label: "degraded: Gemini CLI binary missing",
		issue: "Gemini CLI not found in PATH.",
		remediation:
			"Install Gemini CLI, then confirm `gemini --version` succeeds.",
	},
	degraded_missing_command: {
		label: "degraded: primary command asset missing",
		issue: "Gemini primary command asset is not installed.",
		remediation:
			"Install the Gemini extension assets with `rp1 install gemini`.",
	},
	degraded_trust_or_approval: {
		label: "degraded: Gemini trust or approval required",
		issue: "Gemini blocked shell execution until trust or approval is granted.",
		remediation:
			"Approve Gemini shell execution or trust this project, then retry the Gemini command or verification.",
	},
	registration_failed: {
		label: "degraded: artifact registration failed",
		issue:
			"The Gemini artifact was written, but rp1 artifact registration failed.",
		remediation:
			"Inspect the artifact registration output, fix the rp1 emit failure, then rerun the Gemini workflow.",
	},
} as const satisfies Record<GeminiSmokeStatus, GeminiSmokeStatusDetail>;

export const getGeminiSmokeStatusDetail = (
	status: GeminiSmokeStatus,
): GeminiSmokeStatusDetail => GEMINI_SMOKE_STATUS_DETAILS[status];

export interface GeminiCustomSubagentEvidence {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly agentName: string;
	readonly expectedOutput?: string;
	readonly actualOutput?: string;
	readonly issue?: string;
}

export interface GeminiFanoutOutput {
	readonly unitId: string;
	readonly agentName: string;
	readonly status: GeminiDelegationEvidenceStatus;
	readonly expectedMarker: string;
	readonly actualMarker?: string;
	readonly output?: string;
	readonly issue?: string;
}

export interface GeminiFanoutEvidence {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly expectedUnits: readonly string[];
	readonly outputs: readonly GeminiFanoutOutput[];
	readonly missingUnits: readonly string[];
	readonly duplicateUnits: readonly string[];
	readonly issue?: string;
}

export interface GeminiDelegatedFailure {
	readonly unitId: string;
	readonly agentName: string;
	readonly status: GeminiDelegationEvidenceStatus;
	readonly expectedFailure: boolean;
	readonly message?: string;
}

export interface GeminiDelegatedFailureEvidence {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly failedUnitVisible: boolean;
	readonly successfulOutputsPreserved: boolean;
	readonly failures: readonly GeminiDelegatedFailure[];
	readonly preservedOutputs: readonly GeminiFanoutOutput[];
	readonly issue?: string;
}

export interface GeminiAcknowledgementCaveat {
	readonly scope: GeminiAcknowledgementScope;
	readonly required: boolean;
	readonly affectedWorkflowClasses: readonly GeminiWorkflowClass[];
	readonly reason: string;
	readonly userAction: string;
}

export interface GeminiAcknowledgementEvidence {
	readonly status: GeminiDelegationEvidenceStatus;
	readonly usableWithoutExtraAcknowledgement: boolean;
	readonly caveats: readonly GeminiAcknowledgementCaveat[];
	readonly issue?: string;
}

export interface GeminiWorkflowSupportClassification {
	readonly workflowClass: GeminiWorkflowClass;
	readonly status: GeminiSupportClassificationStatus;
	readonly reason: string;
	readonly evidenceArtifactPath?: string;
	readonly evidenceStatus?: GeminiDelegationEvidenceStatus;
}

export interface GeminiDelegationEvidence {
	readonly featureId: string;
	readonly runId: string;
	readonly geminiVersion: string;
	readonly customSubagent: GeminiCustomSubagentEvidence;
	readonly fanout: GeminiFanoutEvidence;
	readonly failureHandling: GeminiDelegatedFailureEvidence;
	readonly acknowledgement: GeminiAcknowledgementEvidence;
	readonly workflowClasses: readonly GeminiWorkflowSupportClassification[];
	readonly overallStatus: GeminiDelegationEvidenceStatus;
}

export const GEMINI_DEFAULT_WORKFLOW_CLASSIFICATIONS: readonly GeminiWorkflowSupportClassification[] =
	GEMINI_HEAVYWEIGHT_WORKFLOW_CLASSES.map((workflowClass) => ({
		workflowClass,
		status: "needs_attention",
		reason: GEMINI_DELEGATION_EVIDENCE_REQUIRED_REASON,
		evidenceStatus: "not_run",
	}));

export interface GeminiPaths {
	readonly commandFile: string;
	readonly commandDisplayPath: string;
}

export interface GeminiInstallResult {
	readonly commandPath: string;
	readonly commandDisplayPath: string;
	readonly commandWritten: boolean;
	readonly assetCount: number;
	readonly assets: readonly import("./lifecycle.js").GeminiAssetManifestEntry[];
	readonly extensionDisplayDirs: readonly string[];
	readonly warnings: readonly string[];
}

export interface GeminiVerificationResult {
	readonly status: GeminiSmokeStatus;
	readonly verified: boolean;
	readonly geminiInstalled: boolean;
	readonly geminiVersion: string | null;
	readonly commandInstalled: boolean;
	readonly commandPath: string;
	readonly commandDisplayPath: string;
	readonly bundleAssetCount: number;
	readonly issues: readonly string[];
	readonly remediation: readonly string[];
}

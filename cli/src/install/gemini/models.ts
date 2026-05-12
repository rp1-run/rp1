export const GEMINI_EXPERIMENTAL_GUIDANCE =
	"Gemini CLI support is experimental and smoke-only.";

export const GEMINI_AUTO_INSTALL_SKIP_GUIDANCE =
	"Gemini CLI is experimental and skipped by automatic install. Run `rp1 install gemini` to install only the /rp1:smoke command.";

export const GEMINI_SMOKE_COMMAND_INVOCATION =
	"/rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>";

export type GeminiSmokeStatus =
	| "experimental_ready"
	| "degraded_missing_binary"
	| "degraded_missing_command"
	| "degraded_trust_or_approval"
	| "registration_failed";

export interface GeminiSmokeStatusDetail {
	readonly label: string;
	readonly issue: string | null;
	readonly remediation: string;
}

export const GEMINI_SMOKE_STATUS_DETAILS = {
	experimental_ready: {
		label: "experimental smoke path ready",
		issue: null,
		remediation: `Run ${GEMINI_SMOKE_COMMAND_INVOCATION} from Gemini CLI to collect smoke evidence.`,
	},
	degraded_missing_binary: {
		label: "degraded: Gemini CLI binary missing",
		issue: "Gemini CLI not found in PATH.",
		remediation:
			"Install Gemini CLI, then confirm `gemini --version` succeeds.",
	},
	degraded_missing_command: {
		label: "degraded: smoke command missing",
		issue: "Gemini smoke command is not installed.",
		remediation: "Install the smoke command with `rp1 install gemini`.",
	},
	degraded_trust_or_approval: {
		label: "degraded: Gemini trust or approval required",
		issue: "Gemini blocked shell execution until trust or approval is granted.",
		remediation:
			"Approve Gemini shell execution or trust this project, then retry the smoke command.",
	},
	registration_failed: {
		label: "degraded: artifact registration failed",
		issue:
			"The smoke artifact was written, but rp1 artifact registration failed.",
		remediation:
			"Inspect the smoke artifact Registration Output, fix the rp1 emit failure, then rerun the smoke command.",
	},
} as const satisfies Record<GeminiSmokeStatus, GeminiSmokeStatusDetail>;

export const getGeminiSmokeStatusDetail = (
	status: GeminiSmokeStatus,
): GeminiSmokeStatusDetail => GEMINI_SMOKE_STATUS_DETAILS[status];

export interface GeminiPaths {
	readonly commandFile: string;
	readonly commandDisplayPath: string;
}

export interface GeminiInstallResult {
	readonly commandPath: string;
	readonly commandDisplayPath: string;
	readonly commandWritten: boolean;
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
	readonly issues: readonly string[];
	readonly remediation: readonly string[];
}

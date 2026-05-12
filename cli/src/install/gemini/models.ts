export const GEMINI_EXPERIMENTAL_GUIDANCE =
	"Gemini CLI support is experimental and smoke-only.";

export const GEMINI_AUTO_INSTALL_SKIP_GUIDANCE =
	"Gemini CLI is experimental and skipped by automatic install. Run `rp1 install gemini` to install only the /rp1:smoke command.";

export const GEMINI_SMOKE_COMMAND_INVOCATION =
	"/rp1:smoke FEATURE_ID=<feature-id> RUN_CONTEXT=<label>";

export type GeminiSmokeStatus =
	| "experimental_ready"
	| "degraded_missing_binary"
	| "degraded_missing_command";

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

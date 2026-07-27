/**
 * Type definitions for the eval attestation system.
 * Provides content-addressable tracking of prompt files to ensure changes
 * are validated by evaluation suites before merge.
 */

/**
 * Supported eval platforms.
 * Skills can have different rendered content per platform due to LiquidJS conditionals.
 */
export type EvalPlatform = "claude-code" | "opencode" | "codex";

/**
 * Root attestation manifest structure.
 */
export interface AttestationManifest {
	readonly schema_version: string;
	readonly skills: Record<string, SkillAttestation>;
	readonly files: Record<string, string>; // path -> hash
}

/**
 * Attestation record for a single skill.
 */
export interface SkillAttestation {
	readonly platform: EvalPlatform;
	readonly prompt_hash: string;
	readonly deps_hash: string;
	readonly version: string;
	readonly last_eval: EvalRecord;
}

/**
 * Record of the last successful evaluation.
 */
export interface EvalRecord {
	readonly passed: boolean;
	readonly timestamp: string; // ISO 8601
	readonly git_commit: string;
	readonly result_file: string;
}

/**
 * Dependency graph for a skill.
 */
export interface DependencyGraph {
	readonly skill: string;
	readonly skillPath: string;
	readonly platform: EvalPlatform;
	readonly agents: readonly string[];
	readonly skills: readonly string[];
	/**
	 * Reference companions belonging to the skills in this graph. Progressive
	 * disclosure moves whole phases out of SKILL.md, so a companion's content
	 * and the agents it dispatches are part of the attested surface.
	 */
	readonly companions: readonly string[];
}

/**
 * Hash computation result.
 */
export interface HashResult {
	readonly path: string;
	readonly hash: string;
	readonly content_length: number;
}

/**
 * Verification result for a single skill.
 */
export interface VerificationResult {
	readonly skill: string;
	readonly status: "current" | "stale" | "missing";
	readonly reason?: string;
	readonly expected_hash?: string;
	readonly actual_hash?: string;
}

/**
 * Overall verification summary.
 */
export interface VerificationSummary {
	readonly passed: boolean;
	readonly total: number;
	readonly current: number;
	readonly stale: number;
	readonly missing: number;
	readonly results: readonly VerificationResult[];
}

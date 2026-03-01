/**
 * Type definitions for the eval attestation system.
 * Provides content-addressable tracking of prompt files to ensure changes
 * are validated by evaluation suites before merge.
 */

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
	readonly agents: readonly string[];
	readonly skills: readonly string[];
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

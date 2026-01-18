/**
 * Eval Attestation System
 *
 * Content-addressable tracking of prompt files to ensure changes
 * are validated by evaluation suites before merge.
 *
 * @module attestation
 */

// Command logic
export { attestCommand, getStatus, verifyAttestations } from "./commands.js";
// Dependency graph
export {
	buildDependencyGraph,
	parseAgentRefs,
	parseSkillRefs,
} from "./deps-graph.js";
// Manifest operations
export {
	emptyManifest,
	loadManifest,
	saveManifest,
	updateManifest,
} from "./manifest.js";
// Hash computation
export {
	computeDepsHash,
	computePromptHash,
	stripFrontmatter,
} from "./prompt-hash.js";
// Type definitions
export type {
	AttestationManifest,
	CommandAttestation,
	DependencyGraph,
	EvalRecord,
	HashResult,
	VerificationResult,
	VerificationSummary,
} from "./types.js";

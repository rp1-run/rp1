/**
 * Eval Attestation System
 *
 * Content-addressable tracking of prompt files to ensure changes
 * are validated by evaluation suites before merge.
 *
 * @module attestation
 */

export {
	attestCommand,
	attestFromOutput,
	verifyAttestations,
} from "./commands.js";
export {
	buildDependencyGraph,
	parseAgentRefs,
	parseSkillRefs,
} from "./deps-graph.js";
export {
	emptyManifest,
	loadManifest,
	saveManifest,
	updateManifest,
} from "./manifest.js";
export {
	computeDepsHash,
	computePromptHash,
	stripFrontmatter,
} from "./prompt-hash.js";
export type {
	AttestationManifest,
	DependencyGraph,
	EvalRecord,
	HashResult,
	SkillAttestation,
	VerificationResult,
	VerificationSummary,
} from "./types.js";

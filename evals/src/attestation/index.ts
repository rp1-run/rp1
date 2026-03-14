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
	getDistPluginPath,
	parseAgentRefs,
	parseSkillRefs,
} from "./deps-graph.js";
export {
	emptyManifest,
	loadManifest,
	migrateV1ToV2,
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
	EvalPlatform,
	EvalRecord,
	HashResult,
	SkillAttestation,
	VerificationResult,
	VerificationSummary,
} from "./types.js";

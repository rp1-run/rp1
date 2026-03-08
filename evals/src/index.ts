/**
 * Eval system entry point.
 * Exports attestation API for programmatic use.
 */

export {
	attestCommand,
	attestFromOutput,
	verifyAttestations,
} from "./attestation/commands.js";
export type {
	AttestationManifest,
	DependencyGraph,
	HashResult,
	SkillAttestation,
	VerificationResult,
	VerificationSummary,
} from "./attestation/types.js";

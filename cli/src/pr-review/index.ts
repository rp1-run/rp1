/**
 * PR review module barrel export.
 * Provides configuration loading and CI environment detection.
 */

// CI Detection
export {
	detectCIMode,
	extractContext,
	extractGitHubContext,
	isCI,
	isGenericCIContext,
	isGitHubContext,
	isLocalContext,
} from "./ci-detector.js";
// Configuration
export {
	getDefaultConfig,
	isValidAIHarness,
	isValidVerdict,
	loadPRReviewConfig,
} from "./config.js";

// Models
export type {
	AIHarness,
	CIModeResult,
	CIPlatform,
	ConfigSource,
	ContextExtractionResult,
	ExecutionContext,
	GenericCIContext,
	GitHubCIContext,
	GitHubEventPayload,
	LocalContext,
	PRReviewConfig,
	PRReviewConfigResult,
	Verdict,
} from "./models.js";

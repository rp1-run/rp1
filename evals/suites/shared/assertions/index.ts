/**
 * Barrel export for all eval assertion functions.
 * Import from here in evals.yaml via file:// references.
 */

export {
	// Types
	type AssertionFunction,
	assertArtifactDetectorFirst,
	assertArtifactRegistration,
	assertAskUserCheckpoint,
	assertBuildProhibited,
	assertCanonicalToolCall,
	assertDefaultProhibited,
	assertFileExists,
	assertFirstSubagent,
	// Pre-built git assertions
	assertGitCommitToolCall,
	assertGitPushToolCall,
	assertNoArtifactRegistration,
	assertNoAskUser,
	assertNoCanonicalToolCall,
	assertNoGitCommitToolCall,
	assertNoGitPushToolCall,
	assertNoProhibitedCommands,
	assertNoToolCall,
	assertNoWriteEdit,
	// Output assertions
	assertOutputContains,
	assertPostImplCheckpoint,
	assertSubagentSpawned,
	// Pre-built instances for YAML file:// references
	assertTaskBuilderSpawned,
	assertTaskReviewerSpawned,
	// Generic tool call assertions
	assertToolCall,
	assertToolCallCount,
	// rp1 domain assertions
	assertWorkStatusUpdate,
	assertWorktreeCleanupToolCall,
	assertWorktreeCreateToolCall,
	type Matcher,
	type ProviderMetadata,
	type ToolCall,
	type ToolCallEvalContext,
	type ToolName,
} from "./tool-calls.js";

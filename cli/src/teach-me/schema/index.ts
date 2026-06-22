/**
 * Public API for the teach-me lesson schema module.
 *
 * Exposes the version constants, the `block.type` allowlist, the `parseLesson`
 * contract boundary, and the inferred lesson data-model types.
 */

export { parseLesson } from "./lesson-schema.js";
export type {
	Block,
	BlockType,
	CheckItem,
	DecisionBranch,
	DecisionNode,
	DecisionTerminal,
	GlossaryEntry,
	Learner,
	LessonModel,
	Meta,
	Reference,
	RepoReference,
	Section,
	WebReference,
} from "./types.js";
export { BLOCK_TYPES, LIBRARY_VERSION, SCHEMA_VERSION } from "./versions.js";

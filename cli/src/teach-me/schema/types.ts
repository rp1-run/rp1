/**
 * Public type surface for the teach-me lesson data model.
 *
 * Types are inferred from the zod schemas in `lesson-schema.ts` (the single
 * source of truth) and re-exported here so consumers can depend on the lesson
 * contract types without importing the schema internals.
 */

export type {
	Block,
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
} from "./lesson-schema.js";
export type { BlockType } from "./versions.js";

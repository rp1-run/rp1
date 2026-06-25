/**
 * Versioned lesson contract constants.
 *
 * The data-model `schemaVersion` and the widget `libraryVersion` are paired and
 * released as a set: a `lesson.json` is only assembled against the bundled
 * widget library when both versions match these constants (REQ-003). Bumping
 * either constant signals an incompatible contract; older data is rejected with
 * an actionable version-mismatch error rather than rendered against a library it
 * does not match.
 */

/** Lesson data-model contract version (`lesson.schemaVersion`). */
export const SCHEMA_VERSION = "1.0" as const;

/** Bundled widget-library version (`lesson.meta.libraryVersion`). */
export const LIBRARY_VERSION = "1.0" as const;

/**
 * Allowlist of permitted `block.type` values (the §22 MVP widget set).
 *
 * This is the fixed surface that guarantees consistent quality: a producer may
 * only instantiate widgets from this list, and any `block.type` outside it is
 * rejected by the schema (REQ-002). The first seven render as static markup;
 * the remaining eight are interactive and hydrate from co-located JSON islands.
 */
export const BLOCK_TYPES = [
	// Static blocks (rendered server-side from inline fields).
	"prose",
	"callout",
	"code",
	"table",
	"key-insight",
	"glossary",
	"diagram",
	"math",
	// Interactive blocks (hydrated from a co-located `data` payload).
	"timeline",
	"decision-tree",
	"stepper",
	"state-explorer",
	"layer-explorer",
	"compare-cards",
	"code-walkthrough",
	"quiz",
] as const;

/** A permitted `block.type` value. */
export type BlockType = (typeof BLOCK_TYPES)[number];

/**
 * Versioned lesson data-model schema and the `parseLesson` contract boundary.
 *
 * This module is the single most important reliability mechanism in the
 * teach-me tooling (PRD §10): it turns a hand-authored `lesson.json` into a
 * typed `LessonModel` or an actionable error, so a producer can never assemble
 * an artifact from improvised markup. It enforces three guarantees:
 *
 * - REQ-001: every required top-level field and section structure is present.
 * - REQ-002: every `block.type` is drawn from the {@link BLOCK_TYPES} allowlist.
 * - REQ-003: `schemaVersion`/`libraryVersion` are paired against the bundled
 *   library; unknown versions are rejected.
 *
 * Structural validation runs first via zod; version pairing is a second,
 * semantic gate so version mismatches surface a dedicated, actionable message
 * rather than a generic literal-mismatch error.
 */

import * as E from "fp-ts/lib/Either.js";
import { z } from "zod";
import { type CLIError, validationError } from "../../../shared/errors.js";
import { BLOCK_TYPES, LIBRARY_VERSION, SCHEMA_VERSION } from "./versions.js";

/** Allowlist of `learner.familiarity` values (PRD §9). */
export const FAMILIARITY_LEVELS = [
	"basic",
	"intermediate",
	"advanced",
	"adjacent",
] as const;

/** Allowlist of `learner.desiredDepth` values (PRD §9). */
export const DESIRED_DEPTHS = [
	"intuitive",
	"practical",
	"implementation",
	"mathematical",
	"research",
] as const;

/** Allowlist of `meta.primarySpine` values (PRD §11). */
export const PRIMARY_SPINES = [
	"step-through-mechanism",
	"state-machine-explorer",
	"layer-explorer",
	"timeline-sequence",
	"compare-contrast",
	"code-path-explorer",
	"decision-tree",
] as const;

// ---------------------------------------------------------------------------
// Shared leaf schemas
// ---------------------------------------------------------------------------

/**
 * A comprehension check / quiz question. Shared by the top-level `checks` list
 * and the interactive `quiz` block. The `answer` is an index into `choices`;
 * the refinement makes an out-of-range answer unrepresentable.
 */
const checkItemSchema = z
	.object({
		q: z.string().min(1),
		choices: z.array(z.string().min(1)).min(2),
		answer: z.number().int().nonnegative(),
		explanation: z.string().min(1),
	})
	.refine((check) => check.answer < check.choices.length, {
		message: "answer index must reference one of the provided choices",
		path: ["answer"],
	});

const glossaryEntrySchema = z.object({
	term: z.string().min(1),
	def: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Decision-tree (recursive interactive shape, PRD §11)
// ---------------------------------------------------------------------------

/** Typed terminal verdict reached by walking a decision tree. */
export type DecisionTerminal = {
	verdict: "yes" | "no" | "maybe";
	text: string;
};

/** One labeled branch out of a decision-tree node. */
export type DecisionBranch = {
	label: string;
	terminal?: DecisionTerminal;
	node?: DecisionNode;
};

/** A decision-tree question node with one or more branches. */
export type DecisionNode = {
	question: string;
	branches: DecisionBranch[];
};

const decisionTerminalSchema = z.object({
	verdict: z.enum(["yes", "no", "maybe"]),
	text: z.string().min(1),
});

/**
 * Recursive decision-tree schema. A branch must resolve to exactly one of a
 * `terminal` verdict or a nested `node`, so a branch can neither dead-end nor
 * fork ambiguously.
 */
const decisionNodeSchema: z.ZodType<DecisionNode> = z.lazy(() =>
	z.object({
		question: z.string().min(1),
		branches: z
			.array(
				z
					.object({
						label: z.string().min(1),
						terminal: decisionTerminalSchema.optional(),
						node: decisionNodeSchema.optional(),
					})
					.refine(
						(branch) =>
							(branch.terminal === undefined) !== (branch.node === undefined),
						{
							message:
								"decision-tree branch must have exactly one of `terminal` or `node`",
						},
					),
			)
			.min(1),
	}),
);

// ---------------------------------------------------------------------------
// Static blocks (rendered server-side from inline fields)
// ---------------------------------------------------------------------------

const proseBlockSchema = z.object({
	type: z.literal("prose"),
	md: z.string().min(1),
});

const calloutBlockSchema = z.object({
	type: z.literal("callout"),
	variant: z.enum(["info", "warn", "danger", "success"]),
	title: z.string().min(1).optional(),
	md: z.string().min(1),
});

const codeBlockSchema = z.object({
	type: z.literal("code"),
	lang: z.string().min(1),
	code: z.string().min(1),
	filename: z.string().min(1).optional(),
});

const tableBlockSchema = z.object({
	type: z.literal("table"),
	headers: z.array(z.string()).min(1),
	rows: z.array(z.array(z.string())).min(1),
	caption: z.string().min(1).optional(),
});

const keyInsightBlockSchema = z.object({
	type: z.literal("key-insight"),
	md: z.string().min(1),
	title: z.string().min(1).optional(),
});

const glossaryBlockSchema = z.object({
	type: z.literal("glossary"),
	terms: z.array(glossaryEntrySchema).min(1),
});

const diagramBlockSchema = z.object({
	type: z.literal("diagram"),
	// Mermaid source; pre-rendered to static SVG at assembly time.
	source: z.string().min(1),
	// Text equivalent for the diagram (accessibility, REQ-005).
	alt: z.string().min(1),
	title: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// Interactive blocks (hydrated from a co-located `data` payload)
// ---------------------------------------------------------------------------

const timelineBlockSchema = z.object({
	type: z.literal("timeline"),
	data: z.object({
		controls: z.enum(["step", "scrub"]),
		actors: z.array(z.string()),
		steps: z
			.array(
				z.object({
					title: z.string().min(1),
					desc: z.string().min(1),
					state: z.record(z.string()).optional(),
					annotations: z.array(z.string()).optional(),
				}),
			)
			.min(1),
	}),
});

const decisionTreeBlockSchema = z.object({
	type: z.literal("decision-tree"),
	data: z.object({ root: decisionNodeSchema }),
});

const stepperBlockSchema = z.object({
	type: z.literal("stepper"),
	data: z.object({
		steps: z
			.array(z.object({ title: z.string().min(1), md: z.string().min(1) }))
			.min(1),
	}),
});

const stateExplorerBlockSchema = z.object({
	type: z.literal("state-explorer"),
	data: z
		.object({
			initial: z.string().min(1).optional(),
			states: z
				.array(
					z.object({
						id: z.string().min(1),
						label: z.string().min(1),
						description: z.string().min(1).optional(),
					}),
				)
				.min(1),
			transitions: z.array(
				z.object({
					from: z.string().min(1),
					to: z.string().min(1),
					label: z.string().min(1).optional(),
				}),
			),
		})
		.refine(
			(data) => {
				const stateIds = new Set(data.states.map((s) => s.id));
				return data.transitions.every(
					(t) => stateIds.has(t.from) && stateIds.has(t.to),
				);
			},
			{
				message:
					"state-explorer transition references a state ID not present in the states array",
				path: ["transitions"],
			},
		),
});

const layerExplorerBlockSchema = z.object({
	type: z.literal("layer-explorer"),
	data: z.object({
		layers: z
			.array(
				z.object({
					id: z.string().min(1),
					name: z.string().min(1),
					responsibilities: z.array(z.string()).min(1),
				}),
			)
			.min(1),
	}),
});

const compareCardsBlockSchema = z.object({
	type: z.literal("compare-cards"),
	data: z.object({
		cards: z
			.array(
				z.object({
					title: z.string().min(1),
					points: z.array(z.string()).min(1),
				}),
			)
			.min(1),
	}),
});

const codeWalkthroughBlockSchema = z.object({
	type: z.literal("code-walkthrough"),
	data: z.object({
		lang: z.string().min(1),
		code: z.string().min(1),
		steps: z
			.array(z.object({ lines: z.string().min(1), md: z.string().min(1) }))
			.min(1),
	}),
});

const quizBlockSchema = z.object({
	type: z.literal("quiz"),
	data: z.object({ questions: z.array(checkItemSchema).min(1) }),
});

/**
 * Discriminated union over `block.type`. The {@link BLOCK_TYPES} allowlist is
 * the closed set of permitted widgets (REQ-002); an unknown `type` is rejected
 * with a message that names the offending value and lists the allowed types.
 */
const blockSchema = z.discriminatedUnion(
	"type",
	[
		proseBlockSchema,
		calloutBlockSchema,
		codeBlockSchema,
		tableBlockSchema,
		keyInsightBlockSchema,
		glossaryBlockSchema,
		diagramBlockSchema,
		timelineBlockSchema,
		decisionTreeBlockSchema,
		stepperBlockSchema,
		stateExplorerBlockSchema,
		layerExplorerBlockSchema,
		compareCardsBlockSchema,
		codeWalkthroughBlockSchema,
		quizBlockSchema,
	],
	{
		errorMap: (issue, ctx) => {
			if (issue.code === z.ZodIssueCode.invalid_union_discriminator) {
				const received = (ctx.data as { type?: unknown } | null)?.type;
				return {
					message: `Unknown block.type "${String(received)}"; allowed types: ${BLOCK_TYPES.join(", ")}`,
				};
			}
			return { message: ctx.defaultError };
		},
	},
);

// ---------------------------------------------------------------------------
// References (repo / web), meta, sections, lesson
// ---------------------------------------------------------------------------

const repoReferenceSchema = z.object({
	kind: z.literal("repo"),
	path: z.string().min(1),
	symbol: z.string().min(1).optional(),
	lines: z.string().min(1).optional(),
	why: z.string().min(1),
});

const webReferenceSchema = z.object({
	kind: z.literal("web"),
	title: z.string().min(1),
	org: z.string().min(1).optional(),
	url: z.string().url(),
	usedFor: z.string().min(1),
});

const referenceSchema = z.discriminatedUnion("kind", [
	repoReferenceSchema,
	webReferenceSchema,
]);

const learnerSchema = z.object({
	familiarity: z.enum(FAMILIARITY_LEVELS),
	desiredDepth: z.enum(DESIRED_DEPTHS),
	targetOutcome: z.string().min(1),
	constraints: z.array(z.string()),
});

const metaSchema = z.object({
	title: z.string().min(1),
	topicType: z.string().min(1),
	learnerPromise: z.string().min(1),
	coreMentalModel: z.string().min(1),
	primarySpine: z.enum(PRIMARY_SPINES),
	learner: learnerSchema,
	theme: z.enum(["auto", "light", "dark"]),
	libraryVersion: z.string().min(1),
});

const sectionSchema = z.object({
	id: z.string().min(1),
	heading: z.string().min(1),
	intent: z.string().min(1),
	blocks: z.array(blockSchema).min(1),
});

const lessonSchema = z.object({
	schemaVersion: z.string().min(1),
	meta: metaSchema,
	sections: z.array(sectionSchema).min(1),
	checks: z.array(checkItemSchema).min(3),
	glossary: z.array(glossaryEntrySchema).min(1),
	misconceptions: z.array(z.string().min(1)).min(1),
	next: z.array(z.string().min(1)).min(1),
	references: z.array(referenceSchema),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

/** A fully validated lesson data model. */
export type LessonModel = z.infer<typeof lessonSchema>;
/** Lesson metadata (`lesson.meta`). */
export type Meta = z.infer<typeof metaSchema>;
/** Learner model (`lesson.meta.learner`). */
export type Learner = z.infer<typeof learnerSchema>;
/** A lesson section. */
export type Section = z.infer<typeof sectionSchema>;
/** Any allowlisted block. */
export type Block = z.infer<typeof blockSchema>;
/** A comprehension check / quiz question. */
export type CheckItem = z.infer<typeof checkItemSchema>;
/** A glossary entry. */
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
/** A repo or web reference. */
export type Reference = z.infer<typeof referenceSchema>;
/** A repo reference. */
export type RepoReference = z.infer<typeof repoReferenceSchema>;
/** A web reference. */
export type WebReference = z.infer<typeof webReferenceSchema>;

// ---------------------------------------------------------------------------
// Contract boundary
// ---------------------------------------------------------------------------

/** Render a {@link z.ZodError} into a single actionable, path-qualified string. */
function formatZodIssues(error: z.ZodError): string {
	return error.issues
		.map((issue) => {
			const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
			return `${path}${issue.message}`;
		})
		.join("; ");
}

/**
 * Validate a parsed `lesson.json` value into a {@link LessonModel}.
 *
 * Returns `Left(ValidationError)` with an actionable message on any structural
 * problem (REQ-001/REQ-002) or a version mismatch (REQ-003); otherwise
 * `Right(LessonModel)`. The input is expected to be already-parsed JSON; callers
 * that read from disk own JSON syntax errors.
 *
 * @param input - The parsed lesson value to validate.
 * @param source - Label used in error messages (typically the file path).
 */
export function parseLesson(
	input: unknown,
	source = "lesson.json",
): E.Either<CLIError, LessonModel> {
	const result = lessonSchema.safeParse(input);
	if (!result.success) {
		return E.left(validationError(source, "L2", formatZodIssues(result.error)));
	}

	const lesson = result.data;

	if (lesson.schemaVersion !== SCHEMA_VERSION) {
		return E.left(
			validationError(
				source,
				"L2",
				`Unsupported schemaVersion "${lesson.schemaVersion}": this tooling supports schemaVersion "${SCHEMA_VERSION}" paired with libraryVersion "${LIBRARY_VERSION}"`,
			),
		);
	}

	if (lesson.meta.libraryVersion !== LIBRARY_VERSION) {
		return E.left(
			validationError(
				source,
				"L2",
				`Unsupported libraryVersion "${lesson.meta.libraryVersion}": this tooling supports libraryVersion "${LIBRARY_VERSION}" paired with schemaVersion "${SCHEMA_VERSION}"`,
			),
		);
	}

	return E.right(lesson);
}

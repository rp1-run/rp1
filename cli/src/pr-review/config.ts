/**
 * PR review configuration loader.
 * Loads and validates configuration from `.rp1/config/pr-review.yaml`
 * with sensible defaults and environment variable overrides.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import {
	type CLIError,
	configError,
	runtimeError,
} from "../../shared/errors.js";
import type {
	AIHarness,
	PRReviewConfig,
	PRReviewConfigResult,
	Verdict,
} from "./models.js";

/** Default configuration values per design spec */
const DEFAULT_CONFIG: PRReviewConfig = {
	enabled: false,
	review_drafts: true,
	ai_harness: "claude-code",
	add_comments: true,
	collapse_summary: false,
	verdict: "auto",
	max_comments: 25,
	bot_marker: "<!-- rp1-review -->",
	visualize: false,
};

/**
 * Environment variable mapping documentation.
 * These variables override config file values:
 * - RP1_PR_REVIEW_ENABLED -> enabled
 * - RP1_PR_REVIEW_VERDICT -> verdict
 * - RP1_PR_REVIEW_ADD_COMMENTS -> add_comments
 * - RP1_PR_REVIEW_VISUALIZE -> visualize
 */

/**
 * Valid values for verdict field.
 */
const VALID_VERDICTS: readonly Verdict[] = [
	"approve",
	"request_changes",
	"comment",
	"auto",
];

/**
 * Valid values for ai_harness field.
 */
const VALID_AI_HARNESSES: readonly AIHarness[] = ["claude-code", "opencode"];

/**
 * Parse a boolean from string or boolean value.
 */
const parseBoolean = (value: unknown): boolean | undefined => {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.toLowerCase();
		if (lower === "true" || lower === "1" || lower === "yes") return true;
		if (lower === "false" || lower === "0" || lower === "no") return false;
	}
	return undefined;
};

/** Mutable version of PRReviewConfig for validation building */
type MutableConfig = {
	-readonly [K in keyof PRReviewConfig]?: PRReviewConfig[K];
};

/**
 * Validate the raw config object from YAML.
 * Returns Either with validated config or validation error.
 */
const validateConfig = (
	raw: unknown,
	configPath: string,
): E.Either<CLIError, Partial<PRReviewConfig>> => {
	if (raw === null || raw === undefined) {
		return E.right({});
	}

	if (typeof raw !== "object" || Array.isArray(raw)) {
		return E.left(
			configError(
				`Invalid config format in ${configPath}: expected object, got ${Array.isArray(raw) ? "array" : typeof raw}`,
			),
		);
	}

	const obj = raw as Record<string, unknown>;
	const validated: MutableConfig = {};
	const errors: string[] = [];

	// Validate enabled
	if ("enabled" in obj) {
		const val = parseBoolean(obj.enabled);
		if (val === undefined) {
			errors.push(`'enabled' must be a boolean, got: ${typeof obj.enabled}`);
		} else {
			validated.enabled = val;
		}
	}

	// Validate review_drafts
	if ("review_drafts" in obj) {
		const val = parseBoolean(obj.review_drafts);
		if (val === undefined) {
			errors.push(
				`'review_drafts' must be a boolean, got: ${typeof obj.review_drafts}`,
			);
		} else {
			validated.review_drafts = val;
		}
	}

	// Validate ai_harness
	if ("ai_harness" in obj) {
		const val = obj.ai_harness;
		if (
			typeof val !== "string" ||
			!VALID_AI_HARNESSES.includes(val as AIHarness)
		) {
			errors.push(
				`'ai_harness' must be one of: ${VALID_AI_HARNESSES.join(", ")}; got: ${val}`,
			);
		} else {
			validated.ai_harness = val as AIHarness;
		}
	}

	// Validate add_comments
	if ("add_comments" in obj) {
		const val = parseBoolean(obj.add_comments);
		if (val === undefined) {
			errors.push(
				`'add_comments' must be a boolean, got: ${typeof obj.add_comments}`,
			);
		} else {
			validated.add_comments = val;
		}
	}

	// Validate collapse_summary
	if ("collapse_summary" in obj) {
		const val = parseBoolean(obj.collapse_summary);
		if (val === undefined) {
			errors.push(
				`'collapse_summary' must be a boolean, got: ${typeof obj.collapse_summary}`,
			);
		} else {
			validated.collapse_summary = val;
		}
	}

	// Validate verdict
	if ("verdict" in obj) {
		const val = obj.verdict;
		if (typeof val !== "string" || !VALID_VERDICTS.includes(val as Verdict)) {
			errors.push(
				`'verdict' must be one of: ${VALID_VERDICTS.join(", ")}; got: ${val}`,
			);
		} else {
			validated.verdict = val as Verdict;
		}
	}

	// Validate max_comments
	if ("max_comments" in obj) {
		const val = obj.max_comments;
		if (typeof val !== "number" || !Number.isInteger(val) || val < 0) {
			errors.push(`'max_comments' must be a non-negative integer, got: ${val}`);
		} else {
			validated.max_comments = val;
		}
	}

	// Validate bot_marker
	if ("bot_marker" in obj) {
		const val = obj.bot_marker;
		if (typeof val !== "string") {
			errors.push(`'bot_marker' must be a string, got: ${typeof val}`);
		} else {
			validated.bot_marker = val;
		}
	}

	// Validate visualize
	if ("visualize" in obj) {
		const val = parseBoolean(obj.visualize);
		if (val === undefined) {
			errors.push(
				`'visualize' must be a boolean, got: ${typeof obj.visualize}`,
			);
		} else {
			validated.visualize = val;
		}
	}

	if (errors.length > 0) {
		return E.left(
			configError(
				`Invalid PR review config in ${configPath}:\n  - ${errors.join("\n  - ")}`,
			),
		);
	}

	return E.right(validated);
};

/**
 * Apply environment variable overrides to configuration.
 * Returns the merged config and list of applied overrides.
 */
const applyEnvOverrides = (
	config: PRReviewConfig,
): { config: PRReviewConfig; overrides: string[] } => {
	const overrides: string[] = [];
	let result = { ...config };

	// RP1_PR_REVIEW_ENABLED
	const enabledEnv = process.env.RP1_PR_REVIEW_ENABLED;
	if (enabledEnv !== undefined) {
		const val = parseBoolean(enabledEnv);
		if (val !== undefined) {
			result = { ...result, enabled: val };
			overrides.push("RP1_PR_REVIEW_ENABLED");
		}
	}

	// RP1_PR_REVIEW_VERDICT
	const verdictEnv = process.env.RP1_PR_REVIEW_VERDICT;
	if (verdictEnv !== undefined) {
		if (VALID_VERDICTS.includes(verdictEnv as Verdict)) {
			result = { ...result, verdict: verdictEnv as Verdict };
			overrides.push("RP1_PR_REVIEW_VERDICT");
		}
	}

	// RP1_PR_REVIEW_ADD_COMMENTS
	const addCommentsEnv = process.env.RP1_PR_REVIEW_ADD_COMMENTS;
	if (addCommentsEnv !== undefined) {
		const val = parseBoolean(addCommentsEnv);
		if (val !== undefined) {
			result = { ...result, add_comments: val };
			overrides.push("RP1_PR_REVIEW_ADD_COMMENTS");
		}
	}

	// RP1_PR_REVIEW_VISUALIZE
	const visualizeEnv = process.env.RP1_PR_REVIEW_VISUALIZE;
	if (visualizeEnv !== undefined) {
		const val = parseBoolean(visualizeEnv);
		if (val !== undefined) {
			result = { ...result, visualize: val };
			overrides.push("RP1_PR_REVIEW_VISUALIZE");
		}
	}

	return { config: result, overrides };
};

/**
 * Read and parse YAML config file.
 * Returns Right with parsed content or Left if file doesn't exist or parse fails.
 */
const readYamlConfig = (
	configPath: string,
): TE.TaskEither<CLIError | "not-found", unknown> =>
	pipe(
		TE.tryCatch(
			async () => {
				const content = await readFile(configPath, "utf-8");
				return parseYaml(content);
			},
			(error): CLIError | "not-found" => {
				if (
					error instanceof Error &&
					"code" in error &&
					error.code === "ENOENT"
				) {
					return "not-found";
				}
				return runtimeError(
					`Failed to read config file: ${error instanceof Error ? error.message : String(error)}`,
				);
			},
		),
	);

/**
 * Load PR review configuration from `.rp1/config/pr-review.yaml`.
 *
 * Loading algorithm:
 * 1. Check if config file exists at rp1Root/config/pr-review.yaml
 * 2. If exists: parse YAML, validate schema, merge with defaults
 * 3. If not exists: use all defaults
 * 4. Apply environment variable overrides
 *
 * @param rp1Root - Path to the .rp1 directory
 * @returns TaskEither with PRReviewConfigResult or CLIError
 */
export const loadPRReviewConfig = (
	rp1Root: string,
): TE.TaskEither<CLIError, PRReviewConfigResult> => {
	const configPath = path.join(rp1Root, "config", "pr-review.yaml");

	return pipe(
		readYamlConfig(configPath),
		TE.fold(
			(errorOrNotFound) => {
				if (errorOrNotFound === "not-found") {
					// Config file missing - use defaults (not an error)
					const { config, overrides } = applyEnvOverrides(DEFAULT_CONFIG);
					return TE.right<CLIError, PRReviewConfigResult>({
						config,
						source: "defaults",
						envOverrides: overrides,
					});
				}
				// Real error reading file
				return TE.left<CLIError, PRReviewConfigResult>(errorOrNotFound);
			},
			(rawConfig) =>
				pipe(
					validateConfig(rawConfig, configPath),
					E.map((partialConfig): PRReviewConfigResult => {
						const mergedConfig: PRReviewConfig = {
							...DEFAULT_CONFIG,
							...partialConfig,
						};
						const { config, overrides } = applyEnvOverrides(mergedConfig);
						return {
							config,
							source: "file",
							configPath,
							envOverrides: overrides,
						};
					}),
					TE.fromEither,
				),
		),
	);
};

/**
 * Get the default PR review configuration.
 * Useful for testing or when you need defaults without file loading.
 */
export const getDefaultConfig = (): PRReviewConfig => ({ ...DEFAULT_CONFIG });

/**
 * Check if a value is a valid verdict.
 */
export const isValidVerdict = (value: string): value is Verdict =>
	VALID_VERDICTS.includes(value as Verdict);

/**
 * Check if a value is a valid AI harness.
 */
export const isValidAIHarness = (value: string): value is AIHarness =>
	VALID_AI_HARNESSES.includes(value as AIHarness);

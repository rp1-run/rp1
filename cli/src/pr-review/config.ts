/**
 * PR review configuration loader.
 * Loads and validates configuration from `.rp1/config/pr-review.yaml`
 * with sensible defaults and environment variable overrides.
 * Uses Zod for schema validation.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import {
	type CLIError,
	configError,
	runtimeError,
} from "../../shared/errors.js";
import type {
	AIHarness,
	CIPlatformConfig,
	PRReviewConfig,
	PRReviewConfigResult,
	Verdict,
} from "./models.js";

/**
 * Zod schema for boolean values that can be string or boolean.
 * Accepts: true, false, "true", "false", "1", "0", "yes", "no"
 */
const booleanSchema = z.union([
	z.boolean(),
	z
		.string()
		.transform((val) => {
			const lower = val.toLowerCase();
			if (lower === "true" || lower === "1" || lower === "yes") return true;
			if (lower === "false" || lower === "0" || lower === "no") return false;
			return undefined;
		})
		.refine((val) => val !== undefined, {
			message: "Must be a boolean value (true/false, 1/0, yes/no)",
		}),
]);

/**
 * Zod schema for PR review configuration.
 */
const PRReviewConfigSchema = z
	.object({
		enabled: booleanSchema.optional(),
		review_drafts: booleanSchema.optional(),
		ai_harness: z.enum(["claude-code", "opencode"]).optional(),
		add_comments: booleanSchema.optional(),
		collapse_summary: booleanSchema.optional(),
		verdict: z
			.enum(["approve", "request_changes", "comment", "auto"])
			.optional(),
		max_comments: z.number().int().nonnegative().optional(),
		bot_marker: z.string().optional(),
		visualize: booleanSchema.optional(),
		ci_platform: z.enum(["github", "buildkite", "gitlab", "auto"]).optional(),
	})
	.strict();

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
	ci_platform: "auto",
};

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
 * Valid values for ci_platform field.
 */
const VALID_CI_PLATFORMS: readonly CIPlatformConfig[] = [
	"github",
	"buildkite",
	"gitlab",
	"auto",
];

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

/**
 * Format Zod errors into a human-readable string.
 */
const formatZodErrors = (error: z.ZodError, configPath: string): string => {
	const issues = error.issues.map((issue) => {
		const path = issue.path.length > 0 ? `'${issue.path.join(".")}'` : "config";
		return `${path}: ${issue.message}`;
	});
	return `Invalid PR review config in ${configPath}:\n  - ${issues.join("\n  - ")}`;
};

/**
 * Validate the raw config object from YAML using Zod.
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

	const result = PRReviewConfigSchema.safeParse(raw);

	if (!result.success) {
		return E.left(configError(formatZodErrors(result.error, configPath)));
	}

	// Transform the validated data to PRReviewConfig partial
	const validated: Partial<PRReviewConfig> = {};
	const data = result.data;

	if (data.enabled !== undefined) validated.enabled = data.enabled as boolean;
	if (data.review_drafts !== undefined)
		validated.review_drafts = data.review_drafts as boolean;
	if (data.ai_harness !== undefined)
		validated.ai_harness = data.ai_harness as AIHarness;
	if (data.add_comments !== undefined)
		validated.add_comments = data.add_comments as boolean;
	if (data.collapse_summary !== undefined)
		validated.collapse_summary = data.collapse_summary as boolean;
	if (data.verdict !== undefined) validated.verdict = data.verdict as Verdict;
	if (data.max_comments !== undefined)
		validated.max_comments = data.max_comments;
	if (data.bot_marker !== undefined) validated.bot_marker = data.bot_marker;
	if (data.visualize !== undefined)
		validated.visualize = data.visualize as boolean;
	if (data.ci_platform !== undefined)
		validated.ci_platform = data.ci_platform as CIPlatformConfig;

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

	const enabledEnv = process.env.RP1_PR_REVIEW_ENABLED;
	if (enabledEnv !== undefined) {
		const val = parseBoolean(enabledEnv);
		if (val !== undefined) {
			result = { ...result, enabled: val };
			overrides.push("RP1_PR_REVIEW_ENABLED");
		}
	}

	const verdictEnv = process.env.RP1_PR_REVIEW_VERDICT;
	if (verdictEnv !== undefined) {
		if (VALID_VERDICTS.includes(verdictEnv as Verdict)) {
			result = { ...result, verdict: verdictEnv as Verdict };
			overrides.push("RP1_PR_REVIEW_VERDICT");
		}
	}

	const addCommentsEnv = process.env.RP1_PR_REVIEW_ADD_COMMENTS;
	if (addCommentsEnv !== undefined) {
		const val = parseBoolean(addCommentsEnv);
		if (val !== undefined) {
			result = { ...result, add_comments: val };
			overrides.push("RP1_PR_REVIEW_ADD_COMMENTS");
		}
	}

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

/**
 * Check if a value is a valid CI platform config.
 */
export const isValidCIPlatform = (value: string): value is CIPlatformConfig =>
	VALID_CI_PLATFORMS.includes(value as CIPlatformConfig);

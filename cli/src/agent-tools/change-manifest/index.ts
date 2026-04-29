import { stat } from "node:fs/promises";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { parseError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import {
	createBaselineSnapshot,
	generateChangeManifest,
	parseUnifiedDiffHunks,
} from "./generator.js";
import {
	CHANGE_MANIFEST_SOURCES,
	type ChangeManifestSource,
	type GenerateChangeManifestOptions,
	type GenerateChangeManifestResult,
	type SnapshotOptions,
	type SnapshotResult,
} from "./models.js";

const TOOL_NAME = "change-manifest";

type ChangeManifestToolData =
	| SnapshotResult
	| GenerateChangeManifestResult
	| null;

type ChangeManifestToolResult = ToolResult<ChangeManifestToolData>;

interface SnapshotCommandInput {
	readonly codeRoot?: unknown;
	readonly out?: unknown;
}

interface GenerateCommandInput {
	readonly codeRoot?: unknown;
	readonly out?: unknown;
	readonly statusOut?: unknown;
	readonly source?: unknown;
	readonly baseline?: unknown;
	readonly scope?: unknown;
}

interface RegistryCommandInput
	extends SnapshotCommandInput,
		GenerateCommandInput {
	readonly command?: unknown;
	readonly action?: unknown;
}

const validationError = (message: string): ChangeManifestToolResult =>
	errorResult(TOOL_NAME, null, [{ message }]);

const isNonEmptyString = (value: unknown): value is string =>
	typeof value === "string" && value.trim().length > 0;

const requiredString = (
	value: unknown,
	flag: string,
): E.Either<ChangeManifestToolResult, string> => {
	if (!isNonEmptyString(value)) {
		return E.left(validationError(`${flag} is required`));
	}
	return E.right(value.trim());
};

const normalizeCodeRoot = async (
	value: unknown,
): Promise<E.Either<ChangeManifestToolResult, string>> => {
	const parsed = requiredString(value, "--code-root");
	if (E.isLeft(parsed)) {
		return parsed;
	}

	const codeRoot = path.resolve(parsed.right);
	try {
		const codeRootStat = await stat(codeRoot);
		if (!codeRootStat.isDirectory()) {
			return E.left(
				validationError(`--code-root must be a directory: ${codeRoot}`),
			);
		}
		return E.right(codeRoot);
	} catch {
		return E.left(validationError(`--code-root does not exist: ${codeRoot}`));
	}
};

const normalizeOutputPath = (
	value: unknown,
	flag: string,
): E.Either<ChangeManifestToolResult, string> => {
	const parsed = requiredString(value, flag);
	if (E.isLeft(parsed)) {
		return parsed;
	}
	return E.right(path.resolve(parsed.right));
};

const isChangeManifestSource = (value: string): value is ChangeManifestSource =>
	(CHANGE_MANIFEST_SOURCES as readonly string[]).includes(value);

const normalizeSource = (
	value: unknown,
): E.Either<ChangeManifestToolResult, ChangeManifestSource> => {
	const parsed = requiredString(value, "--source");
	if (E.isLeft(parsed)) {
		return parsed;
	}
	if (!isChangeManifestSource(parsed.right)) {
		return E.left(
			validationError(
				`--source must be one of: ${CHANGE_MANIFEST_SOURCES.join(", ")}`,
			),
		);
	}
	return E.right(parsed.right);
};

const optionalString = (value: unknown): string | undefined =>
	isNonEmptyString(value) ? value.trim() : undefined;

const normalizeSnapshotInput = async (
	input: SnapshotCommandInput,
): Promise<E.Either<ChangeManifestToolResult, SnapshotOptions>> => {
	const codeRoot = await normalizeCodeRoot(input.codeRoot);
	if (E.isLeft(codeRoot)) {
		return codeRoot;
	}
	const out = normalizeOutputPath(input.out, "--out");
	if (E.isLeft(out)) {
		return out;
	}
	return E.right({ codeRoot: codeRoot.right, out: out.right });
};

const normalizeGenerateInput = async (
	input: GenerateCommandInput,
): Promise<
	E.Either<ChangeManifestToolResult, GenerateChangeManifestOptions>
> => {
	const codeRoot = await normalizeCodeRoot(input.codeRoot);
	if (E.isLeft(codeRoot)) {
		return codeRoot;
	}
	const out = normalizeOutputPath(input.out, "--out");
	if (E.isLeft(out)) {
		return out;
	}
	const statusOut = normalizeOutputPath(input.statusOut, "--status-out");
	if (E.isLeft(statusOut)) {
		return statusOut;
	}
	const source = normalizeSource(input.source);
	if (E.isLeft(source)) {
		return source;
	}

	const baseline = optionalString(input.baseline);
	const scope = optionalString(input.scope);
	if ((baseline === undefined) === (scope === undefined)) {
		return E.left(validationError("Use exactly one of --baseline or --scope"));
	}
	if (source.right === "code-clean-comments" && scope === undefined) {
		return E.left(
			validationError("--scope is required for source code-clean-comments"),
		);
	}
	if (source.right !== "code-clean-comments" && baseline === undefined) {
		return E.left(
			validationError(`--baseline is required for source ${source.right}`),
		);
	}

	return E.right({
		codeRoot: codeRoot.right,
		out: out.right,
		statusOut: statusOut.right,
		source: source.right,
		...(baseline ? { baseline: path.resolve(baseline) } : {}),
		...(scope ? { scope } : {}),
	});
};

export const executeChangeManifestSnapshot =
	(
		input: SnapshotCommandInput,
	): TE.TaskEither<CLIError, ChangeManifestToolResult> =>
	async () => {
		const normalized = await normalizeSnapshotInput(input);
		if (E.isLeft(normalized)) {
			return E.right(normalized.left);
		}

		const result = await createBaselineSnapshot(normalized.right)();
		if (E.isLeft(result)) {
			return result;
		}

		return E.right(successResult(TOOL_NAME, result.right));
	};

export const executeGenerateChangeManifest =
	(
		input: GenerateCommandInput,
	): TE.TaskEither<CLIError, ChangeManifestToolResult> =>
	async () => {
		const normalized = await normalizeGenerateInput(input);
		if (E.isLeft(normalized)) {
			return E.right(normalized.left);
		}

		const result = await generateChangeManifest(normalized.right)();
		if (E.isLeft(result)) {
			return result;
		}

		return E.right(successResult(TOOL_NAME, result.right));
	};

const parseInput = (
	input: string,
): E.Either<CLIError, RegistryCommandInput> => {
	let parsed: unknown;
	try {
		parsed = input.trim() ? JSON.parse(input) : {};
	} catch {
		return E.left(parseError("stdin", "Invalid JSON input"));
	}

	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		return E.left(parseError("stdin", "Input must be a JSON object"));
	}

	return E.right(parsed as RegistryCommandInput);
};

const execute =
	(
		input: string,
		_options: ToolOptions,
	): TE.TaskEither<CLIError, ChangeManifestToolResult> =>
	async () => {
		const parsed = parseInput(input);
		if (E.isLeft(parsed)) {
			return parsed;
		}

		const command =
			optionalString(parsed.right.command) ??
			optionalString(parsed.right.action);
		if (command === "snapshot") {
			return executeChangeManifestSnapshot(parsed.right)();
		}
		if (command === "generate") {
			return executeGenerateChangeManifest(parsed.right)();
		}

		return E.right(
			validationError("command must be one of: snapshot, generate"),
		);
	};

registerTool({
	name: TOOL_NAME,
	description: "Create cleanup change manifests from repository evidence",
	execute,
});

export {
	CHANGE_MANIFEST_SOURCES,
	createBaselineSnapshot,
	generateChangeManifest,
	parseUnifiedDiffHunks,
	TOOL_NAME,
};
export type {
	BaselineSnapshot,
	ChangeManifest,
	ChangeManifestFile,
	ChangeManifestHunk,
	ChangeManifestSource,
	GenerateChangeManifestOptions,
	GenerateChangeManifestResult,
	ManifestSkipReason,
	ManifestStatus,
	SnapshotOptions,
	SnapshotResult,
} from "./models.js";

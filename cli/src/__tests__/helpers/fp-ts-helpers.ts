/**
 * fp-ts testing helpers for Either and TaskEither assertions.
 * Simplifies testing fp-ts result types with clear error messages.
 */

import * as E from "fp-ts/lib/Either.js";
import type * as TE from "fp-ts/lib/TaskEither.js";

/**
 * Assert that an Either is Right and return its value.
 * Throws with a descriptive error if the result is Left.
 * @param result - Either to unwrap
 * @returns The Right value
 */
export function expectRight<L, R>(result: E.Either<L, R>): R {
	if (E.isLeft(result)) {
		throw new Error(
			`Expected Right, got Left: ${JSON.stringify(result.left, null, 2)}`,
		);
	}
	return result.right;
}

/**
 * Assert that an Either is Left and return its error.
 * Throws with a descriptive error if the result is Right.
 * @param result - Either to unwrap
 * @returns The Left value
 */
export function expectLeft<L, R>(result: E.Either<L, R>): L {
	if (E.isRight(result)) {
		throw new Error(
			`Expected Left, got Right: ${JSON.stringify(result.right, null, 2)}`,
		);
	}
	return result.left;
}

/**
 * Assert that a TaskEither resolves to Right and return its value.
 * Throws with a descriptive error if the result is Left.
 * @param task - TaskEither to execute and unwrap
 * @returns Promise resolving to the Right value
 */
export async function expectTaskRight<L, R>(
	task: TE.TaskEither<L, R>,
): Promise<R> {
	const result = await task();
	return expectRight(result);
}

/**
 * Assert that a TaskEither resolves to Left and return its error.
 * Throws with a descriptive error if the result is Right.
 * @param task - TaskEither to execute and unwrap
 * @returns Promise resolving to the Left value
 */
export async function expectTaskLeft<L, R>(
	task: TE.TaskEither<L, R>,
): Promise<L> {
	const result = await task();
	return expectLeft(result);
}

/**
 * CLIError type definition (matches cli/shared/errors.ts).
 * Used for type-safe error message extraction.
 */
type CLIError =
	| { _tag: "UsageError"; message: string; suggestion?: string }
	| { _tag: "NotFoundError"; resource: string; suggestion?: string }
	| { _tag: "ConfigError"; message: string; suggestion?: string }
	| { _tag: "RuntimeError"; message: string; cause?: unknown }
	| { _tag: "PortInUseError"; port: number }
	| { _tag: "ParseError"; file: string; message: string }
	| { _tag: "TransformError"; file: string; message: string }
	| {
			_tag: "ValidationError";
			file: string;
			level: "L1" | "L2";
			message: string;
	  }
	| { _tag: "GenerationError"; file: string; message: string }
	| {
			_tag: "PrerequisiteError";
			check: string;
			message: string;
			suggestion?: string;
	  }
	| { _tag: "InstallError"; operation: string; message: string }
	| { _tag: "BackupError"; message: string }
	| { _tag: "VerificationError"; message: string; issues: string[] };

/**
 * Extract a displayable message from any CLIError variant.
 * Useful in tests where we need to check error messages across
 * different error types in the discriminated union.
 * @param error - Any CLIError variant
 * @returns A string representation of the error message
 */
export function getErrorMessage(error: CLIError): string {
	switch (error._tag) {
		case "NotFoundError":
			return `${error.resource} not found`;
		case "PortInUseError":
			return `Port ${error.port} is already in use`;
		default:
			return (error as { message: string }).message;
	}
}

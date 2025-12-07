/**
 * fp-ts testing helpers for Either and TaskEither assertions.
 * Simplifies testing fp-ts result types with clear error messages.
 */

import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";

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

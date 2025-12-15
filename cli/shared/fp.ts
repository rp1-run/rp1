import * as A from "fp-ts/lib/Array.js";
import * as E from "fp-ts/lib/Either.js";
import { flow, identity, pipe } from "fp-ts/lib/function.js";
import * as O from "fp-ts/lib/Option.js";
import type * as T from "fp-ts/lib/Task.js";
import * as TE from "fp-ts/lib/TaskEither.js";

export { pipe, flow, identity };

export type Either<E, A> = E.Either<E, A>;
export const left = E.left;
export const right = E.right;
export const isLeft = E.isLeft;
export const isRight = E.isRight;
export const fold = E.fold;
export const map = E.map;
export const mapLeft = E.mapLeft;
export const chain = E.chain;
export const getOrElse = E.getOrElse;
export const fromPredicate = E.fromPredicate;
export const fromOption = E.fromOption;

export type TaskEither<E, A> = TE.TaskEither<E, A>;
export const tryCatch = TE.tryCatch;
export const mapTE = TE.map;
export const chainTE = TE.chain;
export const foldTE = TE.fold;
export const fromEither = TE.fromEither;
export const rightTE = TE.right;
export const leftTE = TE.left;
export const chainFirstTE = TE.chainFirst;
export const bindTE = TE.bind;
export const DoTE = TE.Do;

export type Option<A> = O.Option<A>;
export const some = O.some;
export const none = O.none;
export const fromNullable = O.fromNullable;
export const isSome = O.isSome;
export const isNone = O.isNone;
export const fromPredicateO = O.fromPredicate;
export const altO = O.alt;
export const mapO = O.map;
export const getOrElseO = O.getOrElse;
export const foldO = O.fold;

export const findFirst = A.findFirst;
export const mapA = A.map;

export type Task<A> = T.Task<A>;

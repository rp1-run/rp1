import { pipe, flow, identity } from "fp-ts/function";
import * as E from "fp-ts/Either";
import * as TE from "fp-ts/TaskEither";
import * as O from "fp-ts/Option";

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

export type TaskEither<E, A> = TE.TaskEither<E, A>;
export const tryCatch = TE.tryCatch;
export const mapTE = TE.map;
export const chainTE = TE.chain;
export const foldTE = TE.fold;

export type Option<A> = O.Option<A>;
export const some = O.some;
export const none = O.none;
export const fromNullable = O.fromNullable;
export const isSome = O.isSome;
export const isNone = O.isNone;

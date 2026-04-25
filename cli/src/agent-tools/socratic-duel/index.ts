import { constants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import { registerTool, type ToolOptions } from "../index.js";
import type { ToolResult } from "../models.js";
import { errorResult, successResult } from "../output.js";
import {
	type ClaimLockDecision,
	claimLock,
	type DuelSnapshot,
	getActiveDuelSnapshotByTargetKey,
	getDuelSnapshot,
	isLeaseExpired,
	joinDuel,
	type RefreshLockDecision,
	type ReleaseLockDecision,
	refreshLock,
	releaseLock,
} from "./database.js";
import type {
	ClaimLockInput,
	ClaimLockResult,
	JoinInput,
	JoinResult,
	RefreshLockInput,
	RefreshLockResult,
	ReleaseLockInput,
	ReleaseLockResult,
	StatusResult,
	ValidationIssue,
} from "./models.js";

const TOOL_NAME = "socratic-duel";

interface StatusInput {
	readonly duelId?: string;
	readonly targetPath?: string;
}

const isCLIError = (error: unknown): error is CLIError =>
	typeof error === "object" && error !== null && "_tag" in error;

const toCLIError =
	(message: string) =>
	(error: unknown): CLIError =>
		isCLIError(error)
			? error
			: runtimeError(
					`${message}: ${error instanceof Error ? error.message : String(error)}`,
				);

const issueResult = <T>(
	issues: readonly ValidationIssue[],
	data: T,
): ToolResult<T> =>
	errorResult(
		TOOL_NAME,
		data,
		issues.map((issue) => ({
			message: issue.message,
			context: issue.context,
		})),
	);

const validateTargetPath = async (
	targetPath: string,
): Promise<{ readonly targetPath: string; readonly targetKey: string }> => {
	if (!isAbsolute(targetPath)) {
		throw new Error(`Target path must be absolute: ${targetPath}`);
	}

	const extension = extname(targetPath).toLowerCase();
	if (extension !== ".md" && extension !== ".markdown") {
		throw new Error(`Target path must be a Markdown file: ${targetPath}`);
	}

	await access(targetPath, constants.R_OK | constants.W_OK);

	const fileStat = await stat(targetPath);
	if (!fileStat.isFile()) {
		throw new Error(`Target path must be a file: ${targetPath}`);
	}

	const canonicalPath = await realpath(targetPath);
	return {
		targetPath: canonicalPath,
		targetKey: canonicalPath,
	};
};

const validateParticipantFields = (
	participantName: string,
	harness: string,
	modelId: string,
): readonly ValidationIssue[] => {
	const issues: ValidationIssue[] = [];

	if (participantName.trim().length === 0) {
		issues.push({ message: "Participant name must be non-empty" });
	}
	if (harness.trim().length === 0) {
		issues.push({ message: "Harness must be non-empty" });
	}
	if (modelId.trim().length === 0) {
		issues.push({ message: "Model ID must be non-empty" });
	}

	return issues;
};

const nextStepForSnapshot = (
	snapshot: DuelSnapshot,
): StatusResult["next_step"] => {
	if (snapshot.duel.status === "CLOSED") {
		return "closed";
	}
	if (snapshot.participants.length < 2) {
		return "wait_peer";
	}
	if (snapshot.duel.currentOwnerId) {
		return "wait_turn";
	}
	return "claim_lock";
};

const joinNextStep = (
	status: JoinResult["status"],
	participantCount: number,
): JoinResult["next_step"] => {
	if (status === "CLOSED") {
		return "closed";
	}
	return participantCount < 2 ? "wait_peer" : "claim_lock";
};

const claimNextStep = (
	decision: ClaimLockDecision,
): ClaimLockResult["next_step"] => {
	if (decision.duel.status === "CLOSED") {
		return "closed";
	}
	if (decision.acquired) {
		return "compose_turn";
	}
	return decision.participants.length < 2 ? "wait_peer" : "wait_turn";
};

const refreshNextStep = (
	decision: RefreshLockDecision,
): RefreshLockResult["next_step"] => {
	if (decision.duel.status === "CLOSED") {
		return "closed";
	}
	return decision.refreshed ? "compose_turn" : "wait_turn";
};

const releaseNextStep = (
	decision: ReleaseLockDecision,
): ReleaseLockResult["next_step"] => {
	if (decision.duel.status === "CLOSED") {
		return "closed";
	}
	return decision.released ? "wait_turn" : "claim_lock";
};

const redactedDuel = (snapshot: DuelSnapshot): DuelSnapshot["duel"] => ({
	...snapshot.duel,
	leaseToken: null,
});

const lockStatus = (snapshot: DuelSnapshot): StatusResult["lock"] => ({
	owner_participant_id: snapshot.duel.currentOwnerId,
	lease_token: null,
	lease_expires_at: snapshot.duel.leaseExpiresAt,
	expired:
		snapshot.duel.currentOwnerId !== null &&
		isLeaseExpired(snapshot.duel.leaseExpiresAt),
});

const loadStatusSnapshot = async (
	input: StatusInput,
	dbPath?: string,
): Promise<DuelSnapshot> => {
	if (input.duelId) {
		const result = await getDuelSnapshot(input.duelId, dbPath)();
		if (E.isLeft(result)) {
			throw result.left;
		}
		return result.right;
	}

	if (!input.targetPath) {
		throw new Error("Either duelId or targetPath is required");
	}

	const target = await validateTargetPath(input.targetPath);
	const result = await getActiveDuelSnapshotByTargetKey(
		target.targetKey,
		dbPath,
	)();
	if (E.isLeft(result)) {
		throw result.left;
	}
	return result.right;
};

export const executeJoin = (
	input: JoinInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<JoinResult>> =>
	TE.tryCatch(async () => {
		const participantIssues = validateParticipantFields(
			input.participantName,
			input.harness,
			input.modelId,
		);
		if (participantIssues.length > 0) {
			return issueResult(participantIssues, null as unknown as JoinResult);
		}

		const target = await validateTargetPath(input.targetPath);
		const dbResult = await joinDuel(
			input,
			target.targetKey,
			target.targetPath,
			dbPath,
		)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}

		const { duel, participant, participantCount } = dbResult.right;
		return successResult(TOOL_NAME, {
			duel_id: duel.id,
			participant_id: participant.id,
			participant_count: participantCount,
			status: duel.status,
			target_path: duel.targetPath,
			target_key: duel.targetKey,
			next_step: joinNextStep(duel.status, participantCount),
		});
	}, toCLIError("Failed to join Socratic Duel lock context"));

export const executeStatus = (
	input: StatusInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<StatusResult>> =>
	TE.tryCatch(async () => {
		const snapshot = await loadStatusSnapshot(input, dbPath);
		return successResult(TOOL_NAME, {
			duel: redactedDuel(snapshot),
			participants: snapshot.participants,
			participant_count: snapshot.participants.length,
			lock: lockStatus(snapshot),
			next_step: nextStepForSnapshot(snapshot),
		});
	}, toCLIError("Failed to read Socratic Duel lock status"));

export const executeClaimLock = (
	input: ClaimLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<ClaimLockResult>> =>
	TE.tryCatch(async () => {
		const dbResult = await claimLock(input, dbPath)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}
		const decision = dbResult.right;

		return successResult(TOOL_NAME, {
			duel_id: decision.duel.id,
			participant_id: input.participantId,
			acquired: decision.acquired,
			lease_token: decision.acquired ? decision.duel.leaseToken : null,
			lease_expires_at: decision.duel.leaseExpiresAt,
			owner_participant_id: decision.duel.currentOwnerId,
			retry_after_seconds: decision.retryAfterSeconds,
			wait_until: decision.waitUntil,
			reason: decision.reason,
			next_step: claimNextStep(decision),
		});
	}, toCLIError("Failed to claim Socratic Duel lock"));

export const executeRefreshLock = (
	input: RefreshLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<RefreshLockResult>> =>
	TE.tryCatch(async () => {
		const dbResult = await refreshLock(input, dbPath)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}
		const decision = dbResult.right;

		return successResult(TOOL_NAME, {
			duel_id: decision.duel.id,
			participant_id: input.participantId,
			refreshed: decision.refreshed,
			lease_token: decision.refreshed ? decision.duel.leaseToken : null,
			lease_expires_at: decision.duel.leaseExpiresAt,
			reason: decision.reason,
			next_step: refreshNextStep(decision),
		});
	}, toCLIError("Failed to refresh Socratic Duel lock"));

export const executeReleaseLock = (
	input: ReleaseLockInput,
	dbPath?: string,
): TE.TaskEither<CLIError, ToolResult<ReleaseLockResult>> =>
	TE.tryCatch(async () => {
		const dbResult = await releaseLock(input, dbPath)();
		if (E.isLeft(dbResult)) {
			throw dbResult.left;
		}
		const decision = dbResult.right;

		return successResult(TOOL_NAME, {
			duel_id: decision.duel.id,
			participant_id: input.participantId,
			released: decision.released,
			closed: decision.closed,
			status: decision.duel.status,
			owner_participant_id: decision.duel.currentOwnerId,
			reason: decision.reason,
			next_step: releaseNextStep(decision),
		});
	}, toCLIError("Failed to release Socratic Duel lock"));

const execute = (
	_input: string,
	_options: ToolOptions,
): TE.TaskEither<CLIError, ToolResult<{ message: string }>> =>
	TE.right(
		successResult(TOOL_NAME, {
			message:
				"Use subcommands: join, status, claim-lock, refresh-lock, release-lock. See --help for details.",
		}),
	);

registerTool({
	name: TOOL_NAME,
	description:
		"Coordinate Socratic Duel participant registration and lock leases only",
	execute,
});

export { TOOL_NAME };

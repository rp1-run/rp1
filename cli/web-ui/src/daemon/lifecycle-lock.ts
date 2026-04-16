/**
 * Cross-process lifecycle lock for serializing daemon mutations.
 * Uses atomic mkdir semantics with owner metadata and stale-lock recovery.
 * The lock is held only around lifecycle operations, not for the daemon lifetime.
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { getConfigDir, getLifecycleLockPath } from "./config-dir";
import { logDaemonEvent } from "./diagnostics";
import { isProcessRunning } from "./manager";

/**
 * Metadata written inside the lock directory to identify the current owner.
 */
export interface LockMetadata {
	readonly ownerPid: number;
	readonly operation: string;
	readonly port: number;
	readonly cliVersion: string;
	readonly acquiredAt: string;
}

/**
 * Options for lock acquisition behavior.
 */
export interface LockAcquireOptions {
	/** The lifecycle operation being performed (e.g., "ensureDaemon", "stopDaemon"). */
	readonly operation: string;
	/** The port involved in this lifecycle operation. */
	readonly port: number;
	/** The CLI version performing the operation. */
	readonly cliVersion: string;
	/** Maximum time in milliseconds to wait for a held lock before giving up. Default: 10000. */
	readonly waitTimeoutMs?: number;
	/** Interval in milliseconds between lock acquisition polls. Default: 200. */
	readonly pollIntervalMs?: number;
	/** Maximum age in milliseconds before a held lock is considered stale. Default: 30000. */
	readonly staleLockTimeoutMs?: number;
}

/**
 * Default timeout for waiting to acquire the lock.
 * Must exceed the worst-case lifecycle operation time (~10s for stop +
 * health-wait) so a second caller waiting on a legitimately-held lock
 * does not time out spuriously.
 */
const DEFAULT_WAIT_TIMEOUT_MS = 30_000;

/**
 * Default polling interval when waiting for the lock.
 */
const DEFAULT_POLL_INTERVAL_MS = 200;

/**
 * Default age threshold beyond which a held lock is considered stale.
 */
const DEFAULT_STALE_LOCK_TIMEOUT_MS = 30_000;

/**
 * Grace period (ms) for a newly-created lock dir before treating missing
 * metadata as corruption.  Covers the brief window between the winning
 * process's mkdir and its owner.json write.
 */
const LOCK_METADATA_GRACE_MS = 2_000;

/**
 * Name of the metadata file written inside the lock directory.
 */
const LOCK_METADATA_FILE = "owner.json";

/**
 * Read lock metadata from the lock directory.
 * Returns null if the metadata cannot be read or parsed.
 */
function readLockMetadata(lockPath: string): LockMetadata | null {
	try {
		const metadataPath = join(lockPath, LOCK_METADATA_FILE);
		const content = readFileSync(metadataPath, "utf-8");
		const parsed = JSON.parse(content) as Record<string, unknown>;

		if (
			typeof parsed.ownerPid === "number" &&
			typeof parsed.operation === "string" &&
			typeof parsed.port === "number" &&
			typeof parsed.cliVersion === "string" &&
			typeof parsed.acquiredAt === "string"
		) {
			return {
				ownerPid: parsed.ownerPid,
				operation: parsed.operation,
				port: parsed.port,
				cliVersion: parsed.cliVersion,
				acquiredAt: parsed.acquiredAt,
			};
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * Write lock metadata into the lock directory.
 */
function writeLockMetadata(lockPath: string, metadata: LockMetadata): void {
	const metadataPath = join(lockPath, LOCK_METADATA_FILE);
	writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), {
		mode: 0o600,
	});
}

/**
 * Check whether a held lock is stale based on owner liveness and age.
 */
function isLockStale(
	metadata: LockMetadata,
	staleLockTimeoutMs: number,
): boolean {
	if (!isProcessRunning(metadata.ownerPid)) {
		return true;
	}

	const acquiredAt = new Date(metadata.acquiredAt).getTime();
	if (Number.isNaN(acquiredAt)) {
		return true;
	}

	return Date.now() - acquiredAt > staleLockTimeoutMs;
}

/**
 * Remove a lock directory and its contents.
 * Handles partial cleanup gracefully.
 */
function removeLockDir(lockPath: string): void {
	try {
		rmSync(lockPath, { recursive: true, force: true });
	} catch {
		// Best-effort cleanup; the next caller will retry recovery.
	}
}

/**
 * Try to acquire the lock directory atomically via mkdir.
 * Returns true if the lock was acquired, false if it already exists.
 * Throws on unexpected filesystem errors.
 */
function tryAcquireLockDir(lockPath: string): boolean {
	try {
		mkdirSync(lockPath, { recursive: false, mode: 0o700 });
		return true;
	} catch (err: unknown) {
		if (
			err instanceof Error &&
			"code" in err &&
			(err as NodeJS.ErrnoException).code === "EEXIST"
		) {
			return false;
		}
		throw err;
	}
}

/**
 * Acquire the lifecycle lock, blocking with polling until available or timeout.
 * Automatically recovers stale locks left by dead or timed-out owners.
 *
 * @returns A release function that must be called when the lifecycle operation completes.
 * @throws Error if the lock cannot be acquired within the wait timeout.
 */
export async function acquireLifecycleLock(
	options: LockAcquireOptions,
): Promise<() => void> {
	const lockPath = getLifecycleLockPath();
	const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const staleLockTimeoutMs =
		options.staleLockTimeoutMs ?? DEFAULT_STALE_LOCK_TIMEOUT_MS;

	const metadata: LockMetadata = {
		ownerPid: process.pid,
		operation: options.operation,
		port: options.port,
		cliVersion: options.cliVersion,
		acquiredAt: new Date().toISOString(),
	};

	const startTime = Date.now();

	while (true) {
		// Ensure the parent config directory exists before attempting to create the lock.
		const configDir = getConfigDir();
		if (!existsSync(configDir)) {
			mkdirSync(configDir, { recursive: true, mode: 0o700 });
		}

		if (tryAcquireLockDir(lockPath)) {
			writeLockMetadata(lockPath, metadata);
			logDaemonEvent("lifecycle_lock_acquired", {
				operation: options.operation,
				port: options.port,
				cliVersion: options.cliVersion,
			});

			let released = false;
			return () => {
				if (released) return;
				released = true;
				removeLockDir(lockPath);
				logDaemonEvent("lifecycle_lock_released", {
					operation: options.operation,
					port: options.port,
				});
			};
		}

		// Lock already exists -- check for staleness.
		const existing = readLockMetadata(lockPath);

		if (existing && isLockStale(existing, staleLockTimeoutMs)) {
			logDaemonEvent("lifecycle_lock_recovered", {
				stalePid: existing.ownerPid,
				staleOperation: existing.operation,
				staleAcquiredAt: existing.acquiredAt,
				reason: isProcessRunning(existing.ownerPid) ? "timeout" : "dead_owner",
			});
			removeLockDir(lockPath);
			// Retry immediately after recovery rather than sleeping.
			continue;
		}

		if (!existing && existsSync(lockPath)) {
			// Lock directory exists but metadata is missing or unreadable.
			// Check whether the directory was just created — the winning
			// process may still be writing owner.json.
			try {
				const stat = statSync(lockPath);
				const ageMs = Date.now() - (stat.birthtimeMs ?? stat.ctimeMs);
				if (ageMs < LOCK_METADATA_GRACE_MS) {
					// Recently created — wait for metadata rather than stealing.
					await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
					continue;
				}
			} catch {
				// Lock dir removed between existsSync and statSync — retry.
				continue;
			}
			// Old and still no metadata — genuinely corrupted.
			logDaemonEvent("lifecycle_lock_recovered", {
				reason: "missing_metadata",
			});
			removeLockDir(lockPath);
			continue;
		}

		// Check wait timeout.
		if (Date.now() - startTime >= waitTimeoutMs) {
			logDaemonEvent("lifecycle_lock_timeout", {
				waitedMs: Date.now() - startTime,
				heldBy: existing
					? {
							ownerPid: existing.ownerPid,
							operation: existing.operation,
						}
					: null,
			});
			const holderInfo = existing
				? ` (held by PID ${existing.ownerPid} for "${existing.operation}")`
				: "";
			throw new Error(
				`Timed out waiting for daemon lifecycle lock${holderInfo}. ` +
					"Another rp1 lifecycle operation may be in progress. " +
					`If this persists, remove ${lockPath} manually.`,
			);
		}

		logDaemonEvent("lifecycle_lock_wait", {
			heldBy: existing?.ownerPid,
			heldForOperation: existing?.operation,
			waitedMs: Date.now() - startTime,
		});

		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

/**
 * Execute a function while holding the lifecycle lock.
 * The lock is always released when the function completes or throws.
 */
export async function withLifecycleLock<T>(
	options: LockAcquireOptions,
	fn: () => Promise<T>,
): Promise<T> {
	const release = await acquireLifecycleLock(options);
	try {
		return await fn();
	} finally {
		release();
	}
}

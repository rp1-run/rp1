/**
 * Signal handler module for installation operations.
 * Provides signal management utilities for graceful cleanup on SIGINT/SIGTERM.
 * Supports REQ-004 (SIGINT) and REQ-005 (SIGTERM) requirements.
 */

import type { Logger } from "../../shared/logger.js";

/**
 * Options for creating a signal manager.
 */
export interface SignalHandlerOptions {
	readonly onCleanup: () => Promise<void>;
	readonly timeoutMs?: number;
	readonly logger?: Logger;
}

/**
 * Signal manager interface for controlling signal handlers.
 */
export interface SignalManager {
	readonly register: () => void;
	readonly unregister: () => void;
	readonly isRegistered: () => boolean;
}

/**
 * Default cleanup timeout in milliseconds.
 * Enforces BR-003: Signal handlers must not block for more than 5 seconds.
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Create a signal manager for the current operation.
 * Registers handlers for SIGINT and SIGTERM that trigger cleanup on interruption.
 *
 * Key behaviors:
 * - Cleanup function called once even if multiple signals received
 * - Timeout prevents blocking indefinitely (5s default per BR-003)
 * - Logs warning about interrupted operation
 * - Unregister removes handlers to prevent memory leaks
 * - Cleanup initiated within 100ms of signal receipt
 *
 * @param options - Configuration for the signal handler
 * @returns SignalManager interface with register/unregister/isRegistered
 */
export const createSignalManager = (
	options: SignalHandlerOptions,
): SignalManager => {
	const { onCleanup, timeoutMs = DEFAULT_TIMEOUT_MS, logger } = options;

	let registered = false;
	let cleanupInProgress = false;
	let cleanupCompleted = false;

	const handleSignal = async (signal: string): Promise<void> => {
		if (cleanupInProgress || cleanupCompleted) {
			logger?.debug(
				`Signal ${signal} received but cleanup already ${cleanupInProgress ? "in progress" : "completed"}`,
			);
			return;
		}

		cleanupInProgress = true;
		logger?.warn(`Operation interrupted by ${signal}. Attempting cleanup...`);

		const timeoutPromise = new Promise<void>((_, reject) => {
			setTimeout(() => {
				reject(new Error(`Cleanup timed out after ${timeoutMs}ms`));
			}, timeoutMs);
		});

		try {
			await Promise.race([onCleanup(), timeoutPromise]);
			cleanupCompleted = true;
			logger?.warn(
				"Cleanup completed. Previous state restored where possible.",
			);
		} catch (e) {
			cleanupCompleted = true;
			if (e instanceof Error && e.message.includes("timed out")) {
				logger?.error(
					`Cleanup timed out after ${timeoutMs}ms. Some resources may be in an inconsistent state.`,
				);
			} else {
				logger?.error(
					`Cleanup failed: ${e}. Some resources may be in an inconsistent state.`,
				);
			}
		} finally {
			process.exit(130);
		}
	};

	const sigintHandler = (): void => {
		void handleSignal("SIGINT");
	};

	const sigtermHandler = (): void => {
		void handleSignal("SIGTERM");
	};

	return {
		register: (): void => {
			if (registered) {
				logger?.debug("Signal handlers already registered");
				return;
			}
			process.on("SIGINT", sigintHandler);
			process.on("SIGTERM", sigtermHandler);
			registered = true;
			logger?.debug("Signal handlers registered for SIGINT and SIGTERM");
		},

		unregister: (): void => {
			if (!registered) {
				logger?.debug("Signal handlers not registered, nothing to unregister");
				return;
			}
			process.off("SIGINT", sigintHandler);
			process.off("SIGTERM", sigtermHandler);
			registered = false;
			logger?.debug("Signal handlers unregistered");
		},

		isRegistered: (): boolean => registered,
	};
};

/**
 * Wrap an async operation with signal handling.
 * Automatically registers signal handlers before the operation and unregisters
 * them after completion (success or failure).
 *
 * @param operation - The async operation to wrap
 * @param cleanupFn - Cleanup function to call on signal interruption
 * @param options - Optional signal handler options
 * @returns Promise resolving to the operation result
 */
export const withSignalHandling = async <T>(
	operation: () => Promise<T>,
	cleanupFn: () => Promise<void>,
	options?: Omit<SignalHandlerOptions, "onCleanup">,
): Promise<T> => {
	const manager = createSignalManager({
		onCleanup: cleanupFn,
		...options,
	});

	manager.register();

	try {
		return await operation();
	} finally {
		manager.unregister();
	}
};

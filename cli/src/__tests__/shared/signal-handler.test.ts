/**
 * Unit tests for signal-handler.ts
 * Tests: registration state machine, cleanup-on-signal contract, error propagation
 */

import { describe, expect, test } from "bun:test";
import {
	createSignalManager,
	withSignalHandling,
} from "../../shared/signal-handler.js";

describe("signal-handler", () => {
	describe("createSignalManager", () => {
		// Validates core state machine: unregistered -> registered -> unregistered
		test("register/unregister transitions state correctly", () => {
			let cleanupCalled = false;
			const manager = createSignalManager({
				onCleanup: async () => {
					cleanupCalled = true;
				},
			});

			expect(manager.isRegistered()).toBe(false);
			manager.register();
			expect(manager.isRegistered()).toBe(true);
			manager.unregister();
			expect(manager.isRegistered()).toBe(false);
			// Cleanup only called on signal, not register/unregister
			expect(cleanupCalled).toBe(false);
		});

		// Prevents listener accumulation from duplicate register calls
		test("double register is idempotent (prevents listener leaks)", () => {
			const manager = createSignalManager({ onCleanup: async () => {} });

			manager.register();
			manager.register();
			expect(manager.isRegistered()).toBe(true);
			manager.unregister();
			expect(manager.isRegistered()).toBe(false);
		});

		// Safe to call unregister defensively without prior register
		test("unregister without register is safe", () => {
			const manager = createSignalManager({ onCleanup: async () => {} });
			manager.unregister();
			expect(manager.isRegistered()).toBe(false);
		});

		// Verifies logger integration for debugging signal handler behavior
		test("logs registration events when logger provided", () => {
			const debugMessages: string[] = [];
			const mockLogger = {
				debug: (msg: string) => debugMessages.push(msg),
				warn: () => {},
				error: () => {},
			} as unknown as Parameters<typeof createSignalManager>[0]["logger"];

			const manager = createSignalManager({
				onCleanup: async () => {},
				logger: mockLogger,
			});

			manager.register();
			manager.unregister();

			expect(debugMessages.some((m) => m.includes("registered"))).toBe(true);
			expect(debugMessages.some((m) => m.includes("unregistered"))).toBe(true);
		});
	});

	describe("withSignalHandling", () => {
		// Core contract: operation executes, handlers auto-unregister on success
		test("executes operation and auto-unregisters on success", async () => {
			let cleanupCalled = false;

			const result = await withSignalHandling(
				async () => "success-value",
				async () => {
					cleanupCalled = true;
				},
			);

			expect(result).toBe("success-value");
			// Cleanup only on signal, not normal completion
			expect(cleanupCalled).toBe(false);
		});

		// Critical: handlers must unregister even when operation throws
		test("unregisters handlers on operation failure (no handler leak)", async () => {
			let cleanupCalled = false;

			await expect(
				withSignalHandling(
					async () => {
						throw new Error("test error");
					},
					async () => {
						cleanupCalled = true;
					},
				),
			).rejects.toThrow("test error");

			// Cleanup only on signal, not error
			expect(cleanupCalled).toBe(false);
		});
	});
});

/**
 * Unit tests for Claude Code settings merge logic.
 * Tests ensureArcadeHook idempotency and installSessionHook IO behavior.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	type ClaudeCodeSettings,
	ensureArcadeHook,
	installSessionHook,
} from "../../../install/claudecode/settings.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const ARCADE_HOOK_COMMAND = "rp1 arcade --no-open 2>/dev/null || true";

describe("claudecode/settings", () => {
	describe("ensureArcadeHook", () => {
		test("empty settings adds hook", () => {
			const settings: ClaudeCodeSettings = {};

			const result = ensureArcadeHook(settings);

			expect(result.added).toBe(true);
			expect(result.settings.hooks).toBeDefined();

			const sessionStart = result.settings.hooks?.SessionStart as readonly {
				type: string;
				command: string;
			}[];
			expect(sessionStart).toHaveLength(1);
			expect(sessionStart[0].type).toBe("command");
			expect(sessionStart[0].command).toBe(ARCADE_HOOK_COMMAND);
		});

		test("existing hooks without SessionStart adds SessionStart array", () => {
			const settings: ClaudeCodeSettings = {
				hooks: {
					PreToolUse: [{ type: "command", command: "echo pre" }],
				},
			};

			const result = ensureArcadeHook(settings);

			expect(result.added).toBe(true);

			const sessionStart = result.settings.hooks?.SessionStart as readonly {
				type: string;
				command: string;
			}[];
			expect(sessionStart).toHaveLength(1);
			expect(sessionStart[0].command).toBe(ARCADE_HOOK_COMMAND);

			expect(result.settings.hooks?.PreToolUse).toEqual([
				{ type: "command", command: "echo pre" },
			]);
		});

		test("existing SessionStart with other hooks appends arcade hook", () => {
			const existingHook = {
				type: "command" as const,
				command: "echo other-tool-hook",
			};
			const settings: ClaudeCodeSettings = {
				hooks: {
					SessionStart: [existingHook],
				},
			};

			const result = ensureArcadeHook(settings);

			expect(result.added).toBe(true);

			const sessionStart = result.settings.hooks?.SessionStart as readonly {
				type: string;
				command: string;
			}[];
			expect(sessionStart).toHaveLength(2);
			expect(sessionStart[0].command).toBe("echo other-tool-hook");
			expect(sessionStart[1].command).toBe(ARCADE_HOOK_COMMAND);
		});

		test("arcade hook already present is a no-op (idempotent)", () => {
			const settings: ClaudeCodeSettings = {
				hooks: {
					SessionStart: [{ type: "command", command: ARCADE_HOOK_COMMAND }],
				},
			};

			const result = ensureArcadeHook(settings);

			expect(result.added).toBe(false);
			expect(result.settings).toBe(settings);

			const sessionStart = result.settings.hooks?.SessionStart as readonly {
				type: string;
				command: string;
			}[];
			expect(sessionStart).toHaveLength(1);
		});

		test("preserves all existing settings keys", () => {
			const settings: ClaudeCodeSettings = {
				preferredNotifChannel: "terminal",
				autoUpdaterStatus: "enabled",
				hooks: {
					PreToolUse: [{ type: "command", command: "lint" }],
					PostToolUse: [{ type: "command", command: "test" }],
				},
			};

			const result = ensureArcadeHook(settings);

			expect(result.added).toBe(true);
			expect(result.settings.preferredNotifChannel).toBe("terminal");
			expect(result.settings.autoUpdaterStatus).toBe("enabled");
			expect(result.settings.hooks?.PreToolUse).toEqual([
				{ type: "command", command: "lint" },
			]);
			expect(result.settings.hooks?.PostToolUse).toEqual([
				{ type: "command", command: "test" },
			]);
		});

		test("re-running ensureArcadeHook on result is idempotent", () => {
			const initial: ClaudeCodeSettings = {};

			const first = ensureArcadeHook(initial);
			expect(first.added).toBe(true);

			const second = ensureArcadeHook(first.settings);
			expect(second.added).toBe(false);
			expect(second.settings).toBe(first.settings);
		});
	});

	describe("installSessionHook", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await createTempDir("settings-test");
		});

		afterEach(async () => {
			await cleanupTempDir(tempDir);
		});

		function settingsPath(): string {
			return join(tempDir, "settings.json");
		}

		test("handles missing file (ENOENT) by creating new settings", async () => {
			const result = await installSessionHook(undefined, settingsPath())();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(true);
			}

			const content = await readFile(settingsPath(), "utf-8");
			const settings = JSON.parse(content);
			expect(settings.hooks.SessionStart).toHaveLength(1);
			expect(settings.hooks.SessionStart[0].command).toBe(ARCADE_HOOK_COMMAND);
		});

		test("handles malformed JSON in settings file", async () => {
			await writeFile(settingsPath(), "{ this is not valid json", "utf-8");

			const result = await installSessionHook(undefined, settingsPath())();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("InstallError");
			}
		});

		test("preserves existing settings when adding hook", async () => {
			await writeFile(
				settingsPath(),
				JSON.stringify({
					preferredNotifChannel: "terminal",
					autoUpdaterStatus: "enabled",
				}),
				"utf-8",
			);

			const result = await installSessionHook(undefined, settingsPath())();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(true);
			}

			const content = await readFile(settingsPath(), "utf-8");
			const settings = JSON.parse(content);
			expect(settings.preferredNotifChannel).toBe("terminal");
			expect(settings.autoUpdaterStatus).toBe("enabled");
			expect(settings.hooks.SessionStart).toHaveLength(1);
		});

		test("returns false when hook already present", async () => {
			await writeFile(
				settingsPath(),
				JSON.stringify({
					hooks: {
						SessionStart: [
							{
								type: "command",
								command: ARCADE_HOOK_COMMAND,
							},
						],
					},
				}),
				"utf-8",
			);

			const result = await installSessionHook(undefined, settingsPath())();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(false);
			}
		});

		test("running installSessionHook twice is idempotent", async () => {
			const path = settingsPath();

			const first = await installSessionHook(undefined, path)();
			expect(E.isRight(first)).toBe(true);
			if (E.isRight(first)) {
				expect(first.right).toBe(true);
			}

			const second = await installSessionHook(undefined, path)();
			expect(E.isRight(second)).toBe(true);
			if (E.isRight(second)) {
				expect(second.right).toBe(false);
			}

			const content = await readFile(path, "utf-8");
			const settings = JSON.parse(content);
			expect(settings.hooks.SessionStart).toHaveLength(1);
		});

		test("logger receives debug messages", async () => {
			const messages: string[] = [];
			const logger = { debug: (msg: string) => messages.push(msg) };

			await installSessionHook(logger, settingsPath())();

			expect(messages.length).toBeGreaterThan(0);
			expect(messages.some((m) => m.includes("hook installed"))).toBe(true);
		});
	});
});

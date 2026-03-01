import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";

export interface SessionStartHook {
	readonly type: "command";
	readonly command: string;
}

export interface ClaudeCodeSettings {
	readonly hooks?: {
		readonly SessionStart?: readonly SessionStartHook[];
		readonly [key: string]: unknown;
	};
	readonly [key: string]: unknown;
}

const ARCADE_HOOK_COMMAND = "rp1 arcade --no-open 2>/dev/null || true";

export const getClaudeSettingsPath = (): string =>
	join(homedir(), ".claude", "settings.json");

const readSettings = (
	settingsPath: string,
): TE.TaskEither<CLIError, ClaudeCodeSettings> =>
	pipe(
		TE.tryCatch(
			async () => {
				const content = await readFile(settingsPath, "utf-8");
				return JSON.parse(content) as ClaudeCodeSettings;
			},
			(e) => {
				const error = e as NodeJS.ErrnoException;
				if (error.code === "ENOENT") {
					return null;
				}
				return installError(
					"settings-read",
					`Failed to read Claude Code settings at ${settingsPath}: ${error.message}`,
				);
			},
		),
		TE.orElse((error) => {
			if (error === null) {
				return TE.right({} as ClaudeCodeSettings);
			}
			return TE.left(error as CLIError);
		}),
	);

const hasArcadeHook = (hooks: readonly SessionStartHook[]): boolean =>
	hooks.some(
		(hook) => hook.type === "command" && hook.command === ARCADE_HOOK_COMMAND,
	);

export const ensureArcadeHook = (
	settings: ClaudeCodeSettings,
): { readonly settings: ClaudeCodeSettings; readonly added: boolean } => {
	const existingHooks = settings.hooks ?? {};
	const existingSessionStart = (existingHooks.SessionStart ??
		[]) as readonly SessionStartHook[];

	if (hasArcadeHook(existingSessionStart)) {
		return { settings, added: false };
	}

	const newHook: SessionStartHook = {
		type: "command",
		command: ARCADE_HOOK_COMMAND,
	};

	const updatedSettings: ClaudeCodeSettings = {
		...settings,
		hooks: {
			...existingHooks,
			SessionStart: [...existingSessionStart, newHook],
		},
	};

	return { settings: updatedSettings, added: true };
};

const writeSettings = (
	settingsPath: string,
	settings: ClaudeCodeSettings,
): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			await mkdir(dirname(settingsPath), { recursive: true });
			await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
		},
		(e) => {
			const error = e as Error;
			return installError(
				"settings-write",
				`Failed to write Claude Code settings at ${settingsPath}: ${error.message}`,
			);
		},
	);

export const installSessionHook = (logger?: {
	debug: (msg: string) => void;
}): TE.TaskEither<CLIError, boolean> => {
	const settingsPath = getClaudeSettingsPath();

	return pipe(
		readSettings(settingsPath),
		TE.chain((currentSettings) => {
			const { settings: updatedSettings, added } =
				ensureArcadeHook(currentSettings);

			if (!added) {
				logger?.debug("SessionStart hook already present, skipping");
				return TE.right(false);
			}

			return pipe(
				writeSettings(settingsPath, updatedSettings),
				TE.map(() => {
					logger?.debug("SessionStart hook installed");
					return true;
				}),
			);
		}),
	);
};

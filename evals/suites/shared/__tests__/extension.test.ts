import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { extensionHook } from "../extension.ts";

interface HookContext {
	test: {
		vars: Record<string, string>;
		description?: string;
		options?: Record<string, unknown>;
	};
	result?: {
		success: boolean;
	};
}

const ORIGINAL_ENV = {
	RP1_DB: process.env.RP1_DB,
	RP1_EVAL_MODE: process.env.RP1_EVAL_MODE,
	RP1_EVAL_DOCKER: process.env.RP1_EVAL_DOCKER,
	PRESERVE_EVAL_WORKSPACES: process.env.PRESERVE_EVAL_WORKSPACES,
};

function restoreEnv(): void {
	for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
		if (value === undefined) {
			delete process.env[key];
			continue;
		}

		process.env[key] = value;
	}
}

function createContext(description: string): HookContext {
	return {
		test: {
			description,
			vars: {},
		},
		result: {
			success: true,
		},
	};
}

async function cleanupContext(context: HookContext): Promise<void> {
	if (!context.test.vars.EVAL_BASE_DIR) {
		return;
	}

	await extensionHook("afterEach", context);
}

beforeEach(() => {
	restoreEnv();
});

afterEach(() => {
	restoreEnv();
});

describe("extensionHook", () => {
	test("uses eval env overrides outside docker mode", async () => {
		delete process.env.RP1_EVAL_DOCKER;
		delete process.env.RP1_DB;
		delete process.env.RP1_EVAL_MODE;

		const context = createContext("host eval");

		try {
			const result = await extensionHook("beforeEach", context);

			expect(result).toBe(context);
			expect(process.env.RP1_DB ?? "").toBe("/tmp/rp1-evals/rp1.db");
			expect(process.env.RP1_EVAL_MODE ?? "").toBe("true");
			expect(context.test.options?.working_dir).toBe(
				context.test.vars.WORKSPACE_DIR,
			);
			expect(existsSync(context.test.vars.WORKSPACE_DIR)).toBe(true);
			expect(existsSync(context.test.vars.REMOTE_DIR)).toBe(true);
		} finally {
			await cleanupContext(context);
		}
	});

	test("clears eval env overrides in docker mode", async () => {
		process.env.RP1_EVAL_DOCKER = "1";
		process.env.RP1_DB = "/tmp/stale-rp1.db";
		process.env.RP1_EVAL_MODE = "true";

		const context = createContext("docker eval");

		try {
			const result = await extensionHook("beforeEach", context);

			expect(result).toBe(context);
			expect(process.env.RP1_DB).toBeUndefined();
			expect(process.env.RP1_EVAL_MODE).toBeUndefined();
			expect(context.test.options?.working_dir).toBe(
				context.test.vars.WORKSPACE_DIR,
			);
			expect(existsSync(context.test.vars.WORKSPACE_DIR)).toBe(true);
			expect(existsSync(context.test.vars.REMOTE_DIR)).toBe(true);
		} finally {
			await cleanupContext(context);
		}
	});

	test("preserves failed workspaces when debug preservation is enabled", async () => {
		process.env.PRESERVE_EVAL_WORKSPACES = "true";

		const context = createContext("preserved failed eval");
		context.result = {
			success: false,
		};

		try {
			await extensionHook("beforeEach", context);

			const baseDir = context.test.vars.EVAL_BASE_DIR;

			expect(existsSync(baseDir)).toBe(true);

			await extensionHook("afterEach", context);

			expect(existsSync(baseDir)).toBe(true);
		} finally {
			if (context.test.vars.EVAL_BASE_DIR) {
				rmSync(context.test.vars.EVAL_BASE_DIR, {
					recursive: true,
					force: true,
				});
			}
		}
	});
});

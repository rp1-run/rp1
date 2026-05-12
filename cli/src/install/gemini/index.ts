import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { installError } from "../../../shared/errors.js";
import {
	GEMINI_EXPERIMENTAL_GUIDANCE,
	type GeminiInstallResult,
	type GeminiPaths,
	type GeminiVerificationResult,
	getGeminiSmokeStatusDetail,
} from "./models.js";
import {
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
} from "./smoke-command.js";

export interface GeminiInstallOptions {
	readonly dryRun: boolean;
	readonly homeDir?: string;
	readonly getGeminiBinaryPath?: () => string | null;
}

export interface GeminiVerifyDeps {
	readonly paths?: GeminiPaths;
	readonly getGeminiBinaryPath?: () => string | null;
	readonly getGeminiVersion?: () => Promise<string | null>;
	readonly pathExists?: (path: string) => Promise<boolean>;
}

export const getGeminiPaths = (
	homeDir = process.env.HOME ?? homedir(),
): GeminiPaths => ({
	commandFile: join(homeDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH),
	commandDisplayPath: GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
});

const defaultPathExists = async (targetPath: string): Promise<boolean> => {
	try {
		await stat(targetPath);
		return true;
	} catch {
		return false;
	}
};

const defaultGeminiVersion = async (): Promise<string | null> => {
	const binaryPath = Bun.which("gemini");
	if (!binaryPath) return null;

	const proc = Bun.spawn([binaryPath, "--version"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) return "unknown";

	const version = (await new Response(proc.stdout).text()).trim();
	return version.length > 0 ? version : "unknown";
};

export const installGeminiSmokeCommand = (
	options: GeminiInstallOptions,
): TE.TaskEither<CLIError, GeminiInstallResult> =>
	TE.tryCatch(
		async () => {
			const paths = getGeminiPaths(options.homeDir);
			const warnings: string[] = [GEMINI_EXPERIMENTAL_GUIDANCE];
			const binaryPath = options.getGeminiBinaryPath?.() ?? Bun.which("gemini");

			if (!binaryPath) {
				warnings.push(
					"Gemini CLI was not found in PATH. Install Gemini CLI before running the smoke command.",
				);
			}

			if (options.dryRun) {
				return {
					commandPath: paths.commandFile,
					commandDisplayPath: paths.commandDisplayPath,
					commandWritten: false,
					warnings,
				};
			}

			await mkdir(dirname(paths.commandFile), { recursive: true });
			await writeFile(paths.commandFile, GEMINI_SMOKE_COMMAND_TOML, "utf-8");

			return {
				commandPath: paths.commandFile,
				commandDisplayPath: paths.commandDisplayPath,
				commandWritten: true,
				warnings,
			};
		},
		(error) =>
			installError(
				"gemini-smoke-command",
				error instanceof Error
					? error.message
					: "Failed to install Gemini smoke command",
			),
	);

export const verifyGeminiSmokeSetup = async (
	deps: GeminiVerifyDeps = {},
): Promise<GeminiVerificationResult> => {
	const paths = deps.paths ?? getGeminiPaths();
	const getGeminiBinaryPath =
		deps.getGeminiBinaryPath ?? (() => Bun.which("gemini"));
	const pathExists = deps.pathExists ?? defaultPathExists;
	const geminiBinaryPath = getGeminiBinaryPath();
	const geminiInstalled = Boolean(geminiBinaryPath);
	const geminiVersion = geminiInstalled
		? await (deps.getGeminiVersion?.() ?? defaultGeminiVersion())
		: null;
	const commandInstalled = await pathExists(paths.commandFile);

	const issues: string[] = [];
	const remediation: string[] = [];

	if (!geminiInstalled) {
		const detail = getGeminiSmokeStatusDetail("degraded_missing_binary");
		if (detail.issue) issues.push(detail.issue);
		remediation.push(detail.remediation);
	}

	if (!commandInstalled) {
		issues.push(`Gemini smoke command missing: ${paths.commandDisplayPath}.`);
		remediation.push(
			getGeminiSmokeStatusDetail("degraded_missing_command").remediation,
		);
	}

	const status = !geminiInstalled
		? "degraded_missing_binary"
		: commandInstalled
			? "experimental_ready"
			: "degraded_missing_command";

	if (status === "experimental_ready") {
		remediation.push(getGeminiSmokeStatusDetail(status).remediation);
	}

	return {
		status,
		verified: status === "experimental_ready",
		geminiInstalled,
		geminiVersion,
		commandInstalled,
		commandPath: paths.commandFile,
		commandDisplayPath: paths.commandDisplayPath,
		issues,
		remediation,
	};
};

export type {
	GeminiInstallResult,
	GeminiPaths,
	GeminiSmokeStatus,
	GeminiVerificationResult,
} from "./models.js";
export {
	GEMINI_AUTO_INSTALL_SKIP_GUIDANCE,
	GEMINI_EXPERIMENTAL_GUIDANCE,
	GEMINI_SMOKE_COMMAND_INVOCATION,
	GEMINI_SMOKE_STATUS_DETAILS,
	getGeminiSmokeStatusDetail,
} from "./models.js";
export {
	GEMINI_SMOKE_COMMAND_DISPLAY_PATH,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
} from "./smoke-command.js";

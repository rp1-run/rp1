import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, runtimeError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import {
	appendFencedContent,
	hasFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
} from "./comment-fence.js";
import { AGENTS_TEMPLATE, CLAUDE_CODE_TEMPLATE } from "./templates/index.js";

export interface InitOptions {
	cwd?: string;
}

interface InitResult {
	action: "created" | "updated" | "appended";
	filePath: string;
	linesInjected: number;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function readFileContent(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function writeFileContent(
	filePath: string,
	content: string,
): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
}

function countLines(content: string): number {
	return content.split("\n").length;
}

/**
 * Detect which file to use: CLAUDE.md or AGENTS.md
 * Returns the path and appropriate template
 */
async function detectTarget(
	cwd: string,
): Promise<{ filePath: string; template: string }> {
	const claudePath = path.resolve(cwd, "CLAUDE.md");
	const agentsPath = path.resolve(cwd, "AGENTS.md");

	// Prefer CLAUDE.md if it exists
	if (await fileExists(claudePath)) {
		return { filePath: claudePath, template: CLAUDE_CODE_TEMPLATE };
	}

	// Use AGENTS.md if it exists
	if (await fileExists(agentsPath)) {
		return { filePath: agentsPath, template: AGENTS_TEMPLATE };
	}

	// Default to CLAUDE.md for new projects
	return { filePath: claudePath, template: CLAUDE_CODE_TEMPLATE };
}

export function executeInit(
	options: InitOptions,
	logger: Logger,
): TE.TaskEither<CLIError, InitResult> {
	return pipe(
		TE.tryCatch(
			async (): Promise<InitResult> => {
				const cwd = options.cwd || process.cwd();
				const { filePath, template } = await detectTarget(cwd);
				const linesInjected = countLines(template);

				logger.debug(`Target file: ${filePath}`);

				const exists = await fileExists(filePath);

				if (!exists) {
					logger.info(`Creating: ${filePath}`);
					const content = `${wrapWithFence(template)}\n`;
					await writeFileContent(filePath, content);
					return { action: "created", filePath, linesInjected };
				}

				const existingContent = await readFileContent(filePath);
				if (existingContent === null) {
					throw new Error(`Failed to read file: ${filePath}`);
				}

				const validation = validateFencing(existingContent);
				if (!validation.valid) {
					throw new Error(
						`Invalid fencing in ${filePath}: ${validation.error}`,
					);
				}

				if (hasFencedContent(existingContent)) {
					logger.info(`Updating: ${filePath}`);
					const newContent = replaceFencedContent(existingContent, template);
					await writeFileContent(filePath, newContent);
					return { action: "updated", filePath, linesInjected };
				}

				logger.info(`Appending to: ${filePath}`);
				const newContent = appendFencedContent(existingContent, template);
				await writeFileContent(filePath, newContent);
				return { action: "appended", filePath, linesInjected };
			},
			(error): CLIError => {
				const message = error instanceof Error ? error.message : String(error);
				return runtimeError(message, error);
			},
		),
	);
}

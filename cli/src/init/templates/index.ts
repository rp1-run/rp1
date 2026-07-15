import type { DetectedTool } from "../tool-detector.js";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
	CODEX_TEMPLATE,
} from "./generated.js";

export { AGENTS_TEMPLATE, CLAUDE_CODE_TEMPLATE, CODEX_TEMPLATE };

export type InstructionFile = "CLAUDE.md" | "AGENTS.md";

interface ResolveInstructionTemplateOptions {
	readonly detectedTool?: DetectedTool | null;
	readonly existingContent?: string | null;
}

interface InstructionTemplateTarget {
	readonly file: InstructionFile;
	readonly template: string;
}

/**
 * Template content used in CLAUDE.md's fence when AGENTS.md holds the full stanza.
 * Claude Code's `@FILE` directive imports the referenced file automatically.
 */
export const AGENTS_REFERENCE_TEMPLATE = "@AGENTS.md";

const DEFAULT_INSTRUCTION_FILE: InstructionFile = "CLAUDE.md";

const INSTRUCTION_FILES: readonly InstructionFile[] = [
	"CLAUDE.md",
	"AGENTS.md",
] as const;

const isInstructionFile = (file: string): file is InstructionFile =>
	file === "CLAUDE.md" || file === "AGENTS.md";

const looksLikeCodexInstructions = (
	content: string | null | undefined,
): boolean => content?.includes("## Codex agent conventions") === true;

export const resolveInstructionTemplate = (
	file: InstructionFile,
	options: ResolveInstructionTemplateOptions = {},
): string => {
	if (file === "CLAUDE.md") {
		return CLAUDE_CODE_TEMPLATE;
	}

	if (
		looksLikeCodexInstructions(options.existingContent) ||
		options.detectedTool?.tool.id === "codex"
	) {
		return CODEX_TEMPLATE;
	}

	return AGENTS_TEMPLATE;
};

export const getPrimaryInstructionTemplateTarget = (
	detectedTool: DetectedTool | null,
): InstructionTemplateTarget => {
	const file =
		detectedTool && isInstructionFile(detectedTool.tool.instruction_file)
			? detectedTool.tool.instruction_file
			: DEFAULT_INSTRUCTION_FILE;

	return {
		file,
		template: resolveInstructionTemplate(file, { detectedTool }),
	};
};

export const getInstructionFiles = (): readonly InstructionFile[] =>
	INSTRUCTION_FILES;

/**
 * Helpers for identifying rendered `rp1 agent-tools emit` event commands.
 */

const EMIT_EVENT_TOKEN = "rp1 agent-tools emit";
const EMIT_EVENT_PATTERN = /rp1 agent-tools emit(?= (?:--|\\)| *$)/gm;

export interface EmitEventCommandMatch {
	readonly index: number;
	readonly command: string;
}

const findCommandEnd = (content: string, start: number): number => {
	let cursor = start;

	while (true) {
		const lineEnd = content.indexOf("\n", cursor);
		const end = lineEnd === -1 ? content.length : lineEnd;
		const line = content.slice(cursor, end);

		if (line.trimEnd().endsWith("\\") && lineEnd !== -1) {
			cursor = lineEnd + 1;
			continue;
		}

		return end;
	}
};

export const findEmitEventCommands = (
	content: string,
): readonly EmitEventCommandMatch[] => {
	const matches: EmitEventCommandMatch[] = [];

	EMIT_EVENT_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = EMIT_EVENT_PATTERN.exec(content)) !== null) {
		const index = match.index;
		const end = findCommandEnd(content, index);
		matches.push({
			index,
			command: content.slice(index, end),
		});
	}

	return matches;
};

export const emitCommandHasHarness = (command: string): boolean =>
	command.includes("--harness");

export const getEmitEventToken = (): string => EMIT_EVENT_TOKEN;

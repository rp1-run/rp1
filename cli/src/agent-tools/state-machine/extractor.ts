/**
 * Extract mermaid stateDiagram-v2 content from a ## STATE-MACHINE section.
 *
 * Parsing strategy: string-based section/fence detection.
 * 1. Find line matching /^## STATE-MACHINE\s*$/
 * 2. Scan forward until next ## header or EOF
 * 3. Within that range, find ```mermaid ... ``` fence
 * 4. Validate fence content contains "stateDiagram-v2"
 * 5. Return raw content (without fences) or null
 */

/**
 * Extract mermaid stateDiagram-v2 content from a ## STATE-MACHINE section
 * in a markdown file.
 *
 * @param markdownContent - Full markdown file content
 * @returns Raw mermaid content string, or null if no valid block found
 */
export const extractStateMachineMermaid = (
	markdownContent: string,
): string | null => {
	const lines = markdownContent.split("\n");

	const sectionStart = lines.findIndex((line) =>
		/^## STATE-MACHINE\s*$/.test(line),
	);
	if (sectionStart === -1) return null;

	let sectionEnd = lines.length;
	for (let i = sectionStart + 1; i < lines.length; i++) {
		if (/^## /.test(lines[i])) {
			sectionEnd = i;
			break;
		}
	}

	const sectionLines = lines.slice(sectionStart + 1, sectionEnd);

	let fenceStart = -1;
	let fenceEnd = -1;

	for (let i = 0; i < sectionLines.length; i++) {
		if (fenceStart === -1) {
			if (/^```mermaid\s*$/.test(sectionLines[i].trim())) {
				fenceStart = i;
			}
			continue;
		}

		if (/^```\s*$/.test(sectionLines[i].trim())) {
			fenceEnd = i;
			const content = sectionLines.slice(fenceStart + 1, fenceEnd).join("\n");
			if (content.includes("stateDiagram-v2")) {
				return content.endsWith("\n") ? content : `${content}\n`;
			}
			// Not a stateDiagram-v2 block, keep scanning for another
			fenceStart = -1;
			fenceEnd = -1;
		}
	}

	return null;
};

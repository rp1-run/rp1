/**
 * Collect text nodes from a container, skipping non-editable UI chrome
 * (e.g., mermaid tab bars, action buttons) inside contentEditable="false" elements.
 */
export function getEditableTextNodes(container: HTMLElement): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
		acceptNode(node) {
			const el = node.parentElement;
			if (el?.closest('[contenteditable="false"]')) {
				return NodeFilter.FILTER_REJECT;
			}
			return NodeFilter.FILTER_ACCEPT;
		},
	});
	let n = walker.nextNode() as Text | null;
	while (n) {
		nodes.push(n);
		n = walker.nextNode() as Text | null;
	}
	return nodes;
}

/**
 * Get the concatenated text content of only editable text nodes.
 */
export function getEditableText(container: HTMLElement): string {
	return getEditableTextNodes(container)
		.map((t) => t.textContent ?? "")
		.join("");
}

/**
 * Find start/end text nodes and offsets for a character range within editable text.
 */
export function findTextRange(
	nodes: Text[],
	startIndex: number,
	endIndex: number,
): {
	startNode: Text;
	startOffset: number;
	endNode: Text;
	endOffset: number;
} | null {
	let currentOffset = 0;
	let startNode: Text | null = null;
	let startOffset = 0;
	let endNode: Text | null = null;
	let endOffset = 0;

	for (const node of nodes) {
		const nodeLength = node.textContent?.length ?? 0;
		const nodeEnd = currentOffset + nodeLength;

		if (!startNode && startIndex < nodeEnd) {
			startNode = node;
			startOffset = startIndex - currentOffset;
		}

		if (!endNode && endIndex <= nodeEnd) {
			endNode = node;
			endOffset = endIndex - currentOffset;
			break;
		}

		currentOffset = nodeEnd;
	}

	if (!startNode || !endNode) return null;
	return { startNode, startOffset, endNode, endOffset };
}

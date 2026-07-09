/**
 * Business logic for the harness-selection wizard step.
 *
 * Builds the multi-select items from detected tools, resolves default
 * selections (from persisted settings or stable-harness defaults), and
 * delegates persistence to the harness-writer.
 */

import { getToolSupportLevel } from "../../config/supported-tools.js";
import { loadEnabledHarnesses } from "../../settings/loader.js";
import type { DetectedTool } from "../tool-detector.js";
import type { MultiSelectItem } from "../ui/components/MultiSelectPrompt.js";

/**
 * Extended multi-select item carrying stability metadata.
 */
export interface HarnessItem extends MultiSelectItem {
	readonly isStable: boolean;
}

/**
 * Build the multi-select items list from detected tools.
 * Each item maps to one detected harness; stable harnesses are flagged.
 */
export function buildHarnessItems(
	detected: readonly DetectedTool[],
): readonly HarnessItem[] {
	return detected
		.filter((d) => d.tool.enabled !== false)
		.map((d) => {
			const supportLevel = getToolSupportLevel(d.tool);
			const isStable = supportLevel === "stable";
			const parts: string[] = [];
			if (d.version !== "unknown") parts.push(`v${d.version}`);
			if (!isStable) parts.push(`(${supportLevel})`);
			const description = parts.join(" ") || undefined;

			return {
				value: d.tool.id,
				label: d.tool.name,
				description,
				isStable,
			};
		});
}

/**
 * Resolve which harnesses should be pre-checked in the multi-select.
 *
 * On re-init: returns previously persisted selection, filtered to currently
 * detected harnesses. On fresh init: returns all stable-level harnesses.
 */
export function resolveDefaultSelection(
	items: readonly HarnessItem[],
	globalSettingsPath?: string,
): string[] {
	const persisted = loadEnabledHarnesses(globalSettingsPath);
	if (persisted !== undefined) {
		const detectedIds = new Set(items.map((i) => i.value));
		return persisted.filter((h) => detectedIds.has(h));
	}
	return getStableDefaults(items);
}

/**
 * Return all stable harness IDs from the items list.
 */
export function getStableDefaults(items: readonly HarnessItem[]): string[] {
	return items.filter((i) => i.isStable).map((i) => i.value);
}

export { writeHarnessSelection } from "../../settings/harness-writer.js";

import type { CatalogRegistryEntry } from "./registry.js";
import { collectCatalogRegistry } from "./registry.js";

export const GEMINI_SUPPORT_MATRIX_UPDATED_AT = "2026-05-19";

const GEMINI_VALIDATION_WORKFLOW_IDS = new Set([
	"dev:gemini-harness-smoke",
	"dev:gemini-harness-subagents",
	"dev:gemini-harness-boundaries",
]);

export type GeminiWorkflowSupportStatus = "supported" | "unsupported";

export type GeminiWorkflowClass =
	| "development_workflow"
	| "investigation_workflow"
	| "quality_workflow"
	| "review_workflow"
	| "documentation_workflow"
	| "knowledge_workflow"
	| "strategy_workflow"
	| "planning_workflow"
	| "prompt_workflow";

export type GeminiWorkflowSupportExclusionReason =
	| "internal_only"
	| "template_only"
	| "not_workflow"
	| "validation_only";

interface GeminiWorkflowSupportEntryBase {
	readonly workflowId: string;
	readonly name: string;
	readonly userFacingName: string;
	readonly plugin: CatalogRegistryEntry["plugin"];
	readonly category: CatalogRegistryEntry["category"];
	readonly workflowClass: GeminiWorkflowClass;
	readonly userAction: string;
	readonly updatedAt: string;
	readonly sourcePath: string;
	readonly argumentNames: readonly string[];
	readonly runPolicy?: CatalogRegistryEntry["runPolicy"];
	readonly identityArgs?: readonly string[];
}

export interface GeminiSupportedWorkflowEntry
	extends GeminiWorkflowSupportEntryBase {
	readonly status: "supported";
	readonly evidenceSource: string;
	readonly unsupportedRationale: null;
	readonly exceptionOwner: null;
}

export interface GeminiUnsupportedWorkflowEntry
	extends GeminiWorkflowSupportEntryBase {
	readonly status: "unsupported";
	readonly evidenceSource: null;
	readonly unsupportedRationale: string;
	readonly exceptionOwner: string;
}

export type GeminiWorkflowSupportEntry =
	| GeminiSupportedWorkflowEntry
	| GeminiUnsupportedWorkflowEntry;

export interface GeminiWorkflowSupportExclusion {
	readonly workflowId: string;
	readonly name: string;
	readonly userFacingName: string;
	readonly plugin: CatalogRegistryEntry["plugin"];
	readonly reason: GeminiWorkflowSupportExclusionReason;
	readonly rationale: string;
	readonly updatedAt: string;
	readonly sourcePath: string;
}

export interface GeminiWorkflowSupportMatrix {
	readonly updatedAt: string;
	readonly entries: readonly GeminiWorkflowSupportEntry[];
	readonly excludedEntries: readonly GeminiWorkflowSupportExclusion[];
}

export interface CollectedGeminiWorkflowSupportMatrix {
	readonly matrix: GeminiWorkflowSupportMatrix;
	readonly errors: readonly string[];
}

export interface BuildGeminiWorkflowSupportMatrixOptions {
	readonly updatedAt?: string;
}

const GEMINI_WORKFLOW_CLASS_BY_CATEGORY: Record<
	CatalogRegistryEntry["category"],
	GeminiWorkflowClass
> = {
	development: "development_workflow",
	investigation: "investigation_workflow",
	quality: "quality_workflow",
	review: "review_workflow",
	documentation: "documentation_workflow",
	knowledge: "knowledge_workflow",
	strategy: "strategy_workflow",
	planning: "planning_workflow",
	prompt: "prompt_workflow",
};

const toWorkflowClass = (entry: CatalogRegistryEntry): GeminiWorkflowClass =>
	GEMINI_WORKFLOW_CLASS_BY_CATEGORY[entry.category];

const getExclusionReason = (
	entry: CatalogRegistryEntry,
): GeminiWorkflowSupportExclusionReason | null => {
	if (GEMINI_VALIDATION_WORKFLOW_IDS.has(entry.canonicalName)) {
		return "validation_only";
	}

	if (entry.distributionScope !== "distributable") {
		return "internal_only";
	}

	if (!entry.userInvocable) {
		return "template_only";
	}

	if (!entry.isWorkflow) {
		return "not_workflow";
	}

	return null;
};

const exclusionRationale = (
	reason: GeminiWorkflowSupportExclusionReason,
): string => {
	switch (reason) {
		case "internal_only":
			return "Internal-only catalog entries are not user-facing Gemini workflow support claims.";
		case "template_only":
			return "Template-only catalog entries are not directly invocable user workflows.";
		case "not_workflow":
			return "Catalog skills that are not workflows are outside the Gemini workflow support matrix.";
		case "validation_only":
			return "Gemini validation workflows collect release evidence and are not shipped product workflow support claims.";
	}
};

const displaySourcePath = (sourcePath: string): string => {
	const marker = "/plugins/";
	const markerIndex = sourcePath.indexOf(marker);
	return markerIndex >= 0 ? sourcePath.slice(markerIndex + 1) : sourcePath;
};

const geminiExtensionEvidenceSource = (entry: CatalogRegistryEntry): string =>
	`Gemini CLI extension assets: ${displaySourcePath(entry.sourcePath)}`;

const supportedUserAction = (): string =>
	"Install Gemini CLI extension assets with `rp1 install gemini`, restart Gemini CLI, and run the rp1 workflow command from Gemini.";

const toSupportEntry = (
	entry: CatalogRegistryEntry,
	updatedAt: string,
): GeminiWorkflowSupportEntry => ({
	workflowId: entry.canonicalName,
	name: entry.name,
	userFacingName: entry.userFacingName,
	plugin: entry.plugin,
	category: entry.category,
	workflowClass: toWorkflowClass(entry),
	status: "supported",
	evidenceSource: geminiExtensionEvidenceSource(entry),
	unsupportedRationale: null,
	userAction: supportedUserAction(),
	exceptionOwner: null,
	updatedAt,
	sourcePath: displaySourcePath(entry.sourcePath),
	argumentNames: entry.argumentDefs.map((argument) => argument.name),
	...(entry.runPolicy !== undefined && { runPolicy: entry.runPolicy }),
	...(entry.identityArgs !== undefined && { identityArgs: entry.identityArgs }),
});

const toExcludedEntry = (
	entry: CatalogRegistryEntry,
	reason: GeminiWorkflowSupportExclusionReason,
	updatedAt: string,
): GeminiWorkflowSupportExclusion => ({
	workflowId: entry.canonicalName,
	name: entry.name,
	userFacingName: entry.userFacingName,
	plugin: entry.plugin,
	reason,
	rationale: exclusionRationale(reason),
	updatedAt,
	sourcePath: displaySourcePath(entry.sourcePath),
});

export const buildGeminiWorkflowSupportMatrix = (
	entries: readonly CatalogRegistryEntry[],
	options: BuildGeminiWorkflowSupportMatrixOptions = {},
): GeminiWorkflowSupportMatrix => {
	const updatedAt = options.updatedAt ?? GEMINI_SUPPORT_MATRIX_UPDATED_AT;
	const supportEntries: GeminiWorkflowSupportEntry[] = [];
	const excludedEntries: GeminiWorkflowSupportExclusion[] = [];

	for (const entry of entries) {
		const reason = getExclusionReason(entry);
		if (reason !== null) {
			excludedEntries.push(toExcludedEntry(entry, reason, updatedAt));
			continue;
		}

		supportEntries.push(toSupportEntry(entry, updatedAt));
	}

	return {
		updatedAt,
		entries: supportEntries,
		excludedEntries,
	};
};

export const collectGeminiWorkflowSupportMatrix = async (
	projectRoot: string,
	options: BuildGeminiWorkflowSupportMatrixOptions = {},
): Promise<CollectedGeminiWorkflowSupportMatrix> => {
	const { entries, errors } = await collectCatalogRegistry(projectRoot);

	return {
		matrix: buildGeminiWorkflowSupportMatrix(entries, options),
		errors,
	};
};

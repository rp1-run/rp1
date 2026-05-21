import type { CatalogRegistryEntry } from "./registry.js";
import { collectCatalogRegistry } from "./registry.js";

export const ANTIGRAVITY_SUPPORT_MATRIX_UPDATED_AT = "2026-05-20";

const HARNESS_VALIDATION_WORKFLOW_IDS = new Set([
	"dev:antigravity-harness-smoke",
	"dev:antigravity-harness-subagents",
	"dev:antigravity-harness-boundaries",
]);

export type AntigravityWorkflowSupportStatus =
	| "supported"
	| "limited"
	| "unsupported";

export type AntigravityWorkflowClass =
	| "development_workflow"
	| "investigation_workflow"
	| "quality_workflow"
	| "review_workflow"
	| "documentation_workflow"
	| "knowledge_workflow"
	| "strategy_workflow"
	| "planning_workflow"
	| "prompt_workflow";

export type AntigravityWorkflowSupportExclusionReason =
	| "internal_only"
	| "template_only"
	| "not_workflow"
	| "validation_only";

export type AntigravityWorkflowDelegation =
	| {
			readonly mode: "none";
			readonly requiredSubAgents: readonly [];
			readonly runtimeContract: null;
			readonly staticAgentsDiscovery: "not_used";
	  }
	| {
			readonly mode: "dynamic_session_subagents";
			readonly requiredSubAgents: readonly string[];
			readonly runtimeContract: "define_once_invoke_many";
			readonly staticAgentsDiscovery: "not_used";
	  };

interface AntigravityWorkflowSupportEntryBase {
	readonly workflowId: string;
	readonly name: string;
	readonly userFacingName: string;
	readonly plugin: CatalogRegistryEntry["plugin"];
	readonly category: CatalogRegistryEntry["category"];
	readonly workflowClass: AntigravityWorkflowClass;
	readonly delegation: AntigravityWorkflowDelegation;
	readonly userAction: string;
	readonly updatedAt: string;
	readonly sourcePath: string;
	readonly argumentNames: readonly string[];
	readonly runPolicy?: CatalogRegistryEntry["runPolicy"];
	readonly identityArgs?: readonly string[];
}

export interface AntigravitySupportedWorkflowEntry
	extends AntigravityWorkflowSupportEntryBase {
	readonly status: "supported";
	readonly evidenceSource: string;
	readonly supportRationale: string;
	readonly limitation: null;
	readonly exceptionOwner: null;
}

export interface AntigravityLimitedWorkflowEntry
	extends AntigravityWorkflowSupportEntryBase {
	readonly status: "limited";
	readonly evidenceSource: string;
	readonly supportRationale: string;
	readonly limitation: string;
	readonly exceptionOwner: string;
}

export interface AntigravityUnsupportedWorkflowEntry
	extends AntigravityWorkflowSupportEntryBase {
	readonly status: "unsupported";
	readonly evidenceSource: null;
	readonly supportRationale: string;
	readonly limitation: string;
	readonly exceptionOwner: string;
}

export type AntigravityWorkflowSupportEntry =
	| AntigravitySupportedWorkflowEntry
	| AntigravityLimitedWorkflowEntry
	| AntigravityUnsupportedWorkflowEntry;

export interface AntigravityWorkflowSupportExclusion {
	readonly workflowId: string;
	readonly name: string;
	readonly userFacingName: string;
	readonly plugin: CatalogRegistryEntry["plugin"];
	readonly reason: AntigravityWorkflowSupportExclusionReason;
	readonly rationale: string;
	readonly updatedAt: string;
	readonly sourcePath: string;
}

export interface AntigravityWorkflowSupportMatrix {
	readonly updatedAt: string;
	readonly entries: readonly AntigravityWorkflowSupportEntry[];
	readonly excludedEntries: readonly AntigravityWorkflowSupportExclusion[];
}

export interface CollectedAntigravityWorkflowSupportMatrix {
	readonly matrix: AntigravityWorkflowSupportMatrix;
	readonly errors: readonly string[];
}

export interface BuildAntigravityWorkflowSupportMatrixOptions {
	readonly updatedAt?: string;
}

const ANTIGRAVITY_WORKFLOW_CLASS_BY_CATEGORY: Record<
	CatalogRegistryEntry["category"],
	AntigravityWorkflowClass
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

const toWorkflowClass = (
	entry: CatalogRegistryEntry,
): AntigravityWorkflowClass =>
	ANTIGRAVITY_WORKFLOW_CLASS_BY_CATEGORY[entry.category];

const getExclusionReason = (
	entry: CatalogRegistryEntry,
): AntigravityWorkflowSupportExclusionReason | null => {
	if (HARNESS_VALIDATION_WORKFLOW_IDS.has(entry.canonicalName)) {
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
	reason: AntigravityWorkflowSupportExclusionReason,
): string => {
	switch (reason) {
		case "internal_only":
			return "Internal-only catalog entries are not user-facing Antigravity workflow support claims.";
		case "template_only":
			return "Template-only catalog entries are not directly invocable user workflows.";
		case "not_workflow":
			return "Catalog skills that are not workflows are outside the Antigravity workflow support matrix.";
		case "validation_only":
			return "Harness validation workflows collect release evidence and are not shipped product workflow support claims.";
	}
};

const displaySourcePath = (sourcePath: string): string => {
	const marker = "/plugins/";
	const markerIndex = sourcePath.indexOf(marker);
	return markerIndex >= 0 ? sourcePath.slice(markerIndex + 1) : sourcePath;
};

const sourceEvidence = (entry: CatalogRegistryEntry): string =>
	`Antigravity workflow assets: ${displaySourcePath(entry.sourcePath)}`;

const supportedUserAction = (): string =>
	"Install Antigravity CLI plugin assets with `rp1 install antigravity`, restart Antigravity CLI, and run the rp1 workflow command from `agy`.";

const limitedDelegationUserAction = (): string =>
	"Install Antigravity CLI plugin assets with `rp1 install antigravity`, restart Antigravity CLI, and run from `agy`; delegated work must define each rp1 subagent type once with `define_subagent` before reusing the cached `TypeName` with `invoke_subagent`.";

const noDelegation = (): AntigravityWorkflowDelegation => ({
	mode: "none",
	requiredSubAgents: [],
	runtimeContract: null,
	staticAgentsDiscovery: "not_used",
});

const dynamicDelegation = (
	subAgents: readonly string[],
): AntigravityWorkflowDelegation => ({
	mode: "dynamic_session_subagents",
	requiredSubAgents: subAgents,
	runtimeContract: "define_once_invoke_many",
	staticAgentsDiscovery: "not_used",
});

const baseEntry = (
	entry: CatalogRegistryEntry,
	updatedAt: string,
	delegation: AntigravityWorkflowDelegation,
) => ({
	workflowId: entry.canonicalName,
	name: entry.name,
	userFacingName: entry.userFacingName,
	plugin: entry.plugin,
	category: entry.category,
	workflowClass: toWorkflowClass(entry),
	delegation,
	updatedAt,
	sourcePath: displaySourcePath(entry.sourcePath),
	argumentNames: entry.argumentDefs.map((argument) => argument.name),
	...(entry.runPolicy !== undefined && { runPolicy: entry.runPolicy }),
	...(entry.identityArgs !== undefined && { identityArgs: entry.identityArgs }),
});

const toSupportEntry = (
	entry: CatalogRegistryEntry,
	updatedAt: string,
): AntigravityWorkflowSupportEntry => {
	const subAgents = entry.subAgents ?? [];
	if (subAgents.length > 0) {
		return {
			...baseEntry(entry, updatedAt, dynamicDelegation(subAgents)),
			status: "limited",
			evidenceSource: sourceEvidence(entry),
			supportRationale:
				"Delegated workflow support uses Antigravity dynamic session subagents: define each required rp1-derived type once, then invoke the cached TypeName for task and fanout units.",
			limitation:
				"Requires the per-session dynamic `define_subagent` plus cached `invoke_subagent` contract; static `/agents` discovery is not support evidence.",
			userAction: limitedDelegationUserAction(),
			exceptionOwner: "rp1 product",
		};
	}

	return {
		...baseEntry(entry, updatedAt, noDelegation()),
		status: "supported",
		evidenceSource: sourceEvidence(entry),
		supportRationale:
			"Workflow is distributable, user-invocable, and does not require delegated Antigravity subagent orchestration.",
		limitation: null,
		userAction: supportedUserAction(),
		exceptionOwner: null,
	};
};

const toExcludedEntry = (
	entry: CatalogRegistryEntry,
	reason: AntigravityWorkflowSupportExclusionReason,
	updatedAt: string,
): AntigravityWorkflowSupportExclusion => ({
	workflowId: entry.canonicalName,
	name: entry.name,
	userFacingName: entry.userFacingName,
	plugin: entry.plugin,
	reason,
	rationale: exclusionRationale(reason),
	updatedAt,
	sourcePath: displaySourcePath(entry.sourcePath),
});

export const buildAntigravityWorkflowSupportMatrix = (
	entries: readonly CatalogRegistryEntry[],
	options: BuildAntigravityWorkflowSupportMatrixOptions = {},
): AntigravityWorkflowSupportMatrix => {
	const updatedAt = options.updatedAt ?? ANTIGRAVITY_SUPPORT_MATRIX_UPDATED_AT;
	const supportEntries: AntigravityWorkflowSupportEntry[] = [];
	const excludedEntries: AntigravityWorkflowSupportExclusion[] = [];

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

export const collectAntigravityWorkflowSupportMatrix = async (
	projectRoot: string,
	options: BuildAntigravityWorkflowSupportMatrixOptions = {},
): Promise<CollectedAntigravityWorkflowSupportMatrix> => {
	const { entries, errors } = await collectCatalogRegistry(projectRoot);

	return {
		matrix: buildAntigravityWorkflowSupportMatrix(entries, options),
		errors,
	};
};

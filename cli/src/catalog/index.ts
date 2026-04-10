export type {
	CatalogArtifact,
	CatalogValidationIssue,
	CatalogValidationResult,
} from "./maintenance.js";
export {
	AGENT_CATALOG_RELATIVE_PATH,
	checkCatalogArtifacts,
	GUIDE_CATALOG_RELATIVE_PATH,
	SKILL_CATALOG_RELATIVE_PATH,
	writeCatalogArtifacts,
} from "./maintenance.js";
export type {
	CatalogDistributionScope,
	CatalogRegistryEntry,
	CatalogRenderableEntry,
	CatalogScope,
	CollectedCatalogRegistry,
} from "./registry.js";
export {
	buildCatalogLookup,
	CATEGORY_LABELS,
	CATEGORY_ORDER,
	CATEGORY_TRIGGERS,
	collectCatalogRegistry,
	collectScopedCatalogRegistry,
	filterCatalogEntriesByScope,
	findCatalogEntryByCanonicalName,
	getCatalogDistributionScope,
	getCatalogPluginsForScope,
	groupCatalogEntriesByCategory,
	renderCatalogMarkdown,
	renderInitSkillAwarenessBlock,
	selectCatalogEntriesByCanonicalNames,
} from "./registry.js";

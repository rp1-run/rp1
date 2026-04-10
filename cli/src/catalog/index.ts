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

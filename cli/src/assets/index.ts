/**
 * Assets module - provides access to bundled assets in release builds.
 *
 * This module exposes APIs for:
 * - Detecting if bundled assets are available (hasBundledAssets)
 * - Reading the bundled manifest (getBundledAssets)
 * - Extracting plugins to OpenCode directory (extractPlugins)
 * - Extracting web-ui to cache (extractWebUI, getWebUIDir)
 */

// Re-export extractor functions
export {
	type ExtractionResult,
	extractPlugins,
	extractWebUI,
	getWebUICacheDir,
	getWebUIDir,
} from "./extractor.js";
// Re-export reader functions
export {
	ALL_PLUGIN_KEYS,
	type AssetEntry,
	type BundledAssets,
	type BundledPlatform,
	type BundledPlugin,
	collectPlatformPlugins,
	getBundledAssets,
	getBundledVersion,
	hasBundledAssets,
	OPTIONAL_PLUGINS,
	type PluginKey,
	REQUIRED_PLUGINS,
	readEmbeddedFile,
	readEmbeddedFileBytes,
} from "./reader.js";

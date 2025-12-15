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
	type AssetEntry,
	type BundledAssets,
	type BundledPlugin,
	getBundledAssets,
	getBundledVersion,
	hasBundledAssets,
	readEmbeddedFile,
	readEmbeddedFileBytes,
} from "./reader.js";

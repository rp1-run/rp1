/**
 * Assets module - provides access to bundled assets in release builds.
 *
 * This module exposes APIs for:
 * - Detecting if bundled assets are available (hasBundledAssets)
 * - Reading the bundled manifest (getBundledAssets)
 * - Extracting plugins to OpenCode directory (extractPlugins)
 * - Extracting web-ui to cache (extractWebUI, getWebUIDir)
 */

// Re-export reader functions
export {
  hasBundledAssets,
  getBundledAssets,
  getBundledVersion,
  readEmbeddedFile,
  readEmbeddedFileBytes,
  type AssetEntry,
  type BundledPlugin,
  type BundledAssets,
} from "./reader.js";

// Re-export extractor functions
export {
  extractPlugins,
  extractWebUI,
  getWebUIDir,
  getWebUICacheDir,
  type ExtractionResult,
} from "./extractor.js";

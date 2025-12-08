/**
 * Asset reading API for accessing bundled assets at runtime.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import { usageError, runtimeError } from "../../shared/errors.js";

/**
 * Single embedded asset entry.
 */
export interface AssetEntry {
  name: string;
  path: string;
}

/**
 * Plugin asset structure.
 */
export interface BundledPlugin {
  name: string;
  commands: AssetEntry[];
  agents: AssetEntry[];
  skills: AssetEntry[];
}

/**
 * Complete manifest of all bundled assets.
 */
export interface BundledAssets {
  plugins: {
    base: BundledPlugin;
    dev: BundledPlugin;
  };
  webui: AssetEntry[];
  version: string;
  buildTimestamp: string;
}

/**
 * Check if running from a bundled binary with embedded assets.
 * Returns true only when embedded.ts contains actual asset imports (IS_BUNDLED === true).
 */
export const hasBundledAssets = (): boolean => {
  try {
    // The embedded module is statically imported to ensure it's included in bundle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const embedded = require("./embedded.js");
    return embedded.IS_BUNDLED === true && embedded.EMBEDDED_MANIFEST !== null;
  } catch {
    return false;
  }
};

/**
 * Get bundled assets manifest.
 * Returns Left with error if assets are not bundled (dev build).
 */
export const getBundledAssets = (): E.Either<CLIError, BundledAssets> => {
  if (!hasBundledAssets()) {
    return E.left(
      usageError(
        "Bundled assets not found",
        "This binary was built without bundled assets.\n\n" +
          "Options:\n" +
          "  1. Install a release binary from: https://github.com/rp1-run/rp1/releases\n" +
          "  2. Build artifacts first: rp1 build:opencode\n" +
          "  3. Specify path: rp1 install:opencode --artifacts-dir <path>\n\n" +
          "For development, use --artifacts-dir to specify the path to built artifacts.",
      ),
    );
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EMBEDDED_MANIFEST } = require("./embedded.js");
    return E.right(EMBEDDED_MANIFEST as BundledAssets);
  } catch (e) {
    return E.left(runtimeError(`Failed to load embedded manifest: ${e}`));
  }
};

/**
 * Read content of an embedded file as text.
 * The path parameter is the Blob path from the embedded manifest.
 */
export const readEmbeddedFile = async (
  path: string,
): Promise<E.Either<CLIError, string>> => {
  try {
    const content = await Bun.file(path).text();
    return E.right(content);
  } catch (e) {
    return E.left(
      runtimeError(`Failed to read embedded file: ${path}`, e),
    );
  }
};

/**
 * Read content of an embedded file as bytes (for binary files).
 * The path parameter is the Blob path from the embedded manifest.
 */
export const readEmbeddedFileBytes = async (
  path: string,
): Promise<E.Either<CLIError, ArrayBuffer>> => {
  try {
    const content = await Bun.file(path).arrayBuffer();
    return E.right(content);
  } catch (e) {
    return E.left(
      runtimeError(`Failed to read embedded file: ${path}`, e),
    );
  }
};

/**
 * Get the bundled version string, or null if not bundled.
 */
export const getBundledVersion = (): string | null => {
  if (!hasBundledAssets()) {
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { EMBEDDED_MANIFEST } = require("./embedded.js");
    return EMBEDDED_MANIFEST?.version ?? null;
  } catch {
    return null;
  }
};

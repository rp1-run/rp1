/**
 * Runtime reader for the embedded teach-me widget bundle (T3).
 *
 * The `render` command (T5) inlines the compiled widget JS + base CSS into a
 * single self-contained `lesson.html` (REQ-004). This module is the seam that
 * yields those two assets, resolving from one of two sources:
 *
 * - **Bundled binary**: `generate-asset-imports.ts` embeds the build outputs
 *   under `EMBEDDED_MANIFEST.teachMe` via `import ... with { type: "file" }`, so
 *   the assets are available with no writable source tree at runtime (the AC4
 *   single-executable case). They are read back through the shared
 *   `readEmbeddedFile` Blob reader.
 * - **Dev / source build**: when the binary is not bundled (the `embedded.stub`
 *   path, `IS_BUNDLED === false`), the bundle is read from the repo-root
 *   `dist/teach-me/` directory produced by `bun run build:teach-me-widgets`.
 *
 * Both paths funnel through `readWidgetBundleFromDir`/`readBundleFile`, which
 * surface an actionable `prerequisiteError` when an asset is missing rather than
 * letting a raw I/O error escape into the render.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, prerequisiteError } from "../../shared/errors.js";
import type { AssetEntry } from "../assets/reader.js";
import {
	type BundledAssets,
	getBundledAssets,
	hasBundledAssets,
	readEmbeddedFile,
} from "../assets/reader.js";

/** File name of the compiled widget bundle written by `build:teach-me-widgets`. */
export const WIDGET_BUNDLE_JS = "tm-widgets.js";

/** File name of the compiled base stylesheet written by `build:teach-me-widgets`. */
export const WIDGET_BUNDLE_CSS = "tm-base.css";

/** Suggestion shown when the widget bundle has not been built. */
const BUILD_SUGGESTION =
	"Build the widget bundle first: `bun run build:teach-me-widgets` (from cli/).";

/**
 * The inlinable widget bundle: the self-registering widget script and its base
 * stylesheet, both as UTF-8 strings ready for the T5 inliner to embed.
 */
export interface WidgetBundle {
	readonly js: string;
	readonly css: string;
}

/**
 * Read a single bundle file from a directory, mapping any read failure to an
 * actionable `prerequisiteError` that names the missing asset.
 */
const readBundleFile = (
	dir: string,
	name: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		() => Bun.file(join(dir, name)).text(),
		(): CLIError =>
			prerequisiteError(
				"teach-me-widgets",
				`Widget bundle asset "${name}" was not found in ${dir}.`,
				BUILD_SUGGESTION,
			),
	);

/**
 * Read the widget bundle (`tm-widgets.js` + `tm-base.css`) from a directory.
 * Backs both the embedded extraction directory and the dev `dist/teach-me/`
 * fallback. A missing asset yields a `prerequisiteError` naming the file.
 */
export const readWidgetBundleFromDir = (
	dir: string,
): TE.TaskEither<CLIError, WidgetBundle> =>
	pipe(
		TE.Do,
		TE.apS("js", readBundleFile(dir, WIDGET_BUNDLE_JS)),
		TE.apS("css", readBundleFile(dir, WIDGET_BUNDLE_CSS)),
	);

/**
 * Repo-root `dist/teach-me/` resolved relative to this module's source location.
 * Only used on the dev/source path, where `import.meta` points at the real file
 * tree; the bundled path never reaches here.
 */
const devBundleDir = (): string =>
	join(
		dirname(fileURLToPath(import.meta.url)),
		"..",
		"..",
		"..",
		"dist",
		"teach-me",
	);

/**
 * Locate an embedded `teachMe` asset entry by its file name and read its content
 * through the shared Blob reader, or fail with an actionable error.
 */
const readEmbeddedBundleFile = (
	assets: BundledAssets,
	name: string,
): TE.TaskEither<CLIError, string> => {
	const entry = (assets.teachMe ?? []).find(
		(e: AssetEntry) => e.name === name || e.name.endsWith(`/${name}`),
	);
	if (!entry) {
		return TE.left(
			prerequisiteError(
				"teach-me-widgets",
				`Embedded widget bundle is missing asset "${name}".`,
				BUILD_SUGGESTION,
			),
		);
	}
	return () => readEmbeddedFile(entry.path);
};

/**
 * Resolve the widget bundle for inlining: from the embedded manifest on a
 * bundled binary, otherwise from the dev `dist/teach-me/` build output.
 */
export const getWidgetBundle = (): TE.TaskEither<CLIError, WidgetBundle> => {
	if (!hasBundledAssets()) {
		return readWidgetBundleFromDir(devBundleDir());
	}

	return pipe(
		TE.fromEither(getBundledAssets()),
		TE.chain((assets) =>
			pipe(
				TE.Do,
				TE.apS("js", readEmbeddedBundleFile(assets, WIDGET_BUNDLE_JS)),
				TE.apS("css", readEmbeddedBundleFile(assets, WIDGET_BUNDLE_CSS)),
			),
		),
	);
};

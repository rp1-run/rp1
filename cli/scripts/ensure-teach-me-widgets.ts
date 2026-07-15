/**
 * Bun test preload: guarantee the teach-me widget bundle exists before any
 * test runs.
 *
 * The teach-me render/validate/export/fixture suites inline the compiled widget
 * bundle (`tm-widgets.js` + `tm-base.css`) into a self-contained `lesson.html`.
 * On the dev/source path those assets are read from the repo-root
 * `dist/teach-me/` directory produced by `bun run build:teach-me-widgets`
 * (see `src/teach-me/assets.ts`). That directory is gitignored, so it is absent
 * from a fresh clone and from a clean CI checkout — where CI runs `bun test`
 * without a prior build step. Missing assets make `teach-me render` fail with
 * `Widget bundle asset "tm-widgets.js" was not found in <repo>/dist/teach-me`,
 * cascading through every render-backed test.
 *
 * Registered via `[test] preload` in `bunfig.toml`, this module runs once
 * before any test file. It is a no-op when the bundle already exists (the
 * common dev case, so the inner loop stays fast) and otherwise builds it
 * through the canonical `build:teach-me-widgets` package script — the single
 * source of truth for the build flags — making `bun test` self-sufficient on a
 * fresh clone and in CI alike.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	devBundleDir,
	WIDGET_BUNDLE_CSS,
	WIDGET_BUNDLE_JS,
} from "../src/teach-me/assets.js";

/** The `cli/` package directory, where the build script must run. */
const CLI_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

/** True only when both compiled bundle files are present on disk. */
function widgetBundleExists(): boolean {
	const dir = devBundleDir();
	return (
		existsSync(join(dir, WIDGET_BUNDLE_JS)) &&
		existsSync(join(dir, WIDGET_BUNDLE_CSS))
	);
}

/** Build the widget bundle via the canonical package script, run from `cli/`. */
function buildWidgetBundle(): void {
	const result = spawnSync("bun", ["run", "build:teach-me-widgets"], {
		cwd: CLI_DIR,
		stdio: "inherit",
	});
	if (result.status !== 0) {
		throw new Error(
			`Failed to build teach-me widget bundle (exit ${result.status ?? "signal"}). ` +
				"Run `bun run build:teach-me-widgets` from cli/ to reproduce.",
		);
	}
	if (!widgetBundleExists()) {
		throw new Error(
			`build:teach-me-widgets completed but ${WIDGET_BUNDLE_JS}/${WIDGET_BUNDLE_CSS} ` +
				`are still missing from ${devBundleDir()}.`,
		);
	}
}

if (!widgetBundleExists()) {
	buildWidgetBundle();
}

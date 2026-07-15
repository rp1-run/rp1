/**
 * Tests for the teach-me widget-bundle reader (T3).
 *
 * The reader is the runtime seam between the embedded asset pipeline and the T5
 * inliner: it returns the compiled `tm-widgets.js` + `tm-base.css` so a render
 * can inline them into a single self-contained `lesson.html` (REQ-004's embedded
 * bundle). The two load-bearing regressions worth pinning are:
 *
 * 1. Filename drift — the reader must read exactly the file names the
 *    `build:teach-me-widgets` step writes (`tm-widgets.js`, `tm-base.css`). If
 *    either side renames an asset, render silently loses its widgets, so the
 *    directory read is asserted against fixture files with those exact names.
 * 2. Missing-asset error contract — a build that never ran (no writable source
 *    tree, dev box without the bundle) must surface an actionable `Left` naming
 *    the missing asset rather than crashing the render with a raw I/O error.
 *
 * Both are exercised through `readWidgetBundleFromDir`, the directory-scoped
 * read that backs both the embedded and dev-fallback resolution paths. The
 * embedded path itself (reading from `EMBEDDED_MANIFEST.teachMe`) is only
 * reachable from a compiled binary and is proven by the T8 end-to-end fixture.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	readWidgetBundleFromDir,
	WIDGET_BUNDLE_CSS,
	WIDGET_BUNDLE_JS,
} from "../../teach-me/assets.js";

describe("readWidgetBundleFromDir", () => {
	let dir: string;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "tm-assets-"));
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("reads the JS and CSS bundle from a directory by their built file names", async () => {
		await writeFile(
			join(dir, WIDGET_BUNDLE_JS),
			"/* widgets */ customElements;",
		);
		await writeFile(join(dir, WIDGET_BUNDLE_CSS), ":root{--tm-bg:#fff}");

		const result = await readWidgetBundleFromDir(dir)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;
		expect(result.right.js).toBe("/* widgets */ customElements;");
		expect(result.right.css).toBe(":root{--tm-bg:#fff}");
	});

	it("returns an actionable Left naming the missing asset when the bundle is absent", async () => {
		// Only the JS is present; the CSS is missing (e.g. a partial/failed build).
		await writeFile(join(dir, WIDGET_BUNDLE_JS), "/* widgets */");

		const result = await readWidgetBundleFromDir(dir)();

		expect(E.isLeft(result)).toBe(true);
		if (!E.isLeft(result)) return;
		// Surfaces a clear error rather than a raw crash, and names the asset and
		// the build step that produces it.
		expect(result.left._tag).toBe("PrerequisiteError");
		if (result.left._tag !== "PrerequisiteError") return;
		expect(result.left.message).toContain(WIDGET_BUNDLE_CSS);
		expect(result.left.suggestion ?? "").toContain("build:teach-me-widgets");
	});
});

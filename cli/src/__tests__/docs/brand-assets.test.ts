import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../../../..");

const readRepoFile = (relativePath: string) =>
	readFileSync(join(repoRoot, relativePath), "utf8");

const readRepoBuffer = (relativePath: string) =>
	readFileSync(join(repoRoot, relativePath));

const expectRepoAsset = (relativePath: string) => {
	expect(existsSync(join(repoRoot, relativePath))).toBe(true);
};

const expectRepoAssetCopy = (sourcePath: string, copyPath: string) => {
	expect(readRepoBuffer(copyPath).equals(readRepoBuffer(sourcePath))).toBe(
		true,
	);
};

const readPngDimensions = (relativePath: string) => {
	const png = readRepoBuffer(relativePath);
	expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

	return {
		width: png.readUInt32BE(16),
		height: png.readUInt32BE(20),
	};
};

const colorChannels = (hexColor: string) => {
	const value = hexColor.replace("#", "");

	return {
		red: Number.parseInt(value.slice(0, 2), 16) / 255,
		green: Number.parseInt(value.slice(2, 4), 16) / 255,
		blue: Number.parseInt(value.slice(4, 6), 16) / 255,
	};
};

const relativeLuminance = (hexColor: string) => {
	const channel = (value: number) =>
		value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	const { red, green, blue } = colorChannels(hexColor);

	return (
		0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue)
	);
};

const contrastRatio = (foreground: string, background: string) => {
	const foregroundLuminance = relativeLuminance(foreground);
	const backgroundLuminance = relativeLuminance(background);
	const lighter = Math.max(foregroundLuminance, backgroundLuminance);
	const darker = Math.min(foregroundLuminance, backgroundLuminance);

	return (lighter + 0.05) / (darker + 0.05);
};

const cssBlockForScheme = (stylesheet: string, scheme: "default" | "slate") => {
	const match = stylesheet.match(
		new RegExp(`\\[data-md-color-scheme="${scheme}"\\] \\{([\\s\\S]*?)\\n\\}`),
	);

	expect(match).not.toBeNull();

	return match?.[1] ?? "";
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const cssBlockForSelector = (stylesheet: string, selector: string) => {
	const match = stylesheet.match(
		new RegExp(
			`(?:^|\\n)([^{}]*${escapeRegExp(selector)}[^{}]*)\\s*\\{([\\s\\S]*?)\\n\\}`,
		),
	);

	expect(match).not.toBeNull();

	return match?.[2] ?? "";
};

const cssDeclarationsForSelector = (stylesheet: string, selector: string) =>
	Object.fromEntries(
		[
			...cssBlockForSelector(stylesheet, selector).matchAll(
				/^\s*([\w-]+):\s*([^;]+);/gm,
			),
		].map(([, property, value]) => [property, value.trim()]),
	);

const rp1ColorVariables = (stylesheet: string) =>
	Object.fromEntries(
		[...stylesheet.matchAll(/(--rp1-[\w-]+):\s*(#[0-9a-fA-F]{6});/g)].map(
			([, variable, value]) => [variable, value],
		),
	);

const resolveCssColor = (value: string, variables: Record<string, string>) => {
	const variable = value.match(/^var\((--rp1-[\w-]+)\)$/)?.[1];

	if (variable) {
		expect(variables[variable]).toBeDefined();
		return variables[variable] ?? "#000000";
	}

	expect(value).toMatch(/^#[0-9a-fA-F]{6}$/);
	return value;
};

describe("documentation brand assets", () => {
	test("README header uses current light and dark lockups", () => {
		const readme = readRepoFile("README.md");

		expect(readme).toContain('srcset="docs/assets/rp1-lockup-light.svg"');
		expect(readme).toContain('srcset="docs/assets/rp1-lockup-dark.svg"');
		expect(readme).toContain('src="docs/assets/rp1-lockup-dark.svg"');
		expect(readme.slice(0, readme.indexOf("</picture>"))).not.toContain(
			"docs/assets/logo-",
		);

		expectRepoAsset("docs/assets/rp1-lockup-light.svg");
		expectRepoAsset("docs/assets/rp1-lockup-dark.svg");
	});

	test("MkDocs uses distinct navbar and favicon assets", () => {
		const mkdocs = readRepoFile("mkdocs.yml");
		const logo = mkdocs.match(/^\s+logo: (.+)$/m)?.[1];
		const favicon = mkdocs.match(/^\s+favicon: (.+)$/m)?.[1];

		expect(logo).toBe("assets/rp1-mark.svg");
		expect(favicon).toBe("assets/favicon.svg");
		expect(logo).not.toBe(favicon);

		expectRepoAsset(`docs/${logo}`);
		expectRepoAsset(`docs/${favicon}`);
	});

	test("social metadata references an existing preview image", () => {
		const override = readRepoFile("docs/overrides/main.html");
		const metadataImagePaths = [
			...override.matchAll(
				/content="https:\/\/rp1\.run\/assets\/social-preview\.png"/g,
			),
		];

		expect(metadataImagePaths).toHaveLength(4);
		expectRepoAsset("docs/assets/social-preview.png");
	});

	test("docs stylesheet exposes the approved RP1 palette", () => {
		const stylesheet = readRepoFile("docs/stylesheets/extra.css");
		const manifest = JSON.parse(readRepoFile("assets/brand/manifest.json")) as {
			palette: Record<string, string>;
		};
		const variables = rp1ColorVariables(stylesheet);

		for (const color of Object.values(manifest.palette)) {
			expect(stylesheet).toContain(color);
		}

		expect(variables).toEqual({
			"--rp1-amber": manifest.palette.amber,
			"--rp1-charcoal": manifest.palette.charcoal,
			"--rp1-green": manifest.palette.green,
			"--rp1-off-white": manifest.palette.offWhite,
		});
		expect(stylesheet).not.toContain("--rp1-nav-green");
		expect(stylesheet).not.toContain("#073b2a");
		expect(stylesheet).not.toContain("#162B49");
		expect(stylesheet).not.toContain("#FDBE5D");
		expect(stylesheet).not.toContain("#7c3aed");
		expect(stylesheet).not.toContain("#06b6d4");
	});

	test("docs stylesheet keeps light and dark chrome visually distinct", () => {
		const stylesheet = readRepoFile("docs/stylesheets/extra.css");
		const lightScheme = cssBlockForScheme(stylesheet, "default");
		const darkScheme = cssBlockForScheme(stylesheet, "slate");

		expect(lightScheme).toContain(
			"--md-primary-fg-color: var(--rp1-charcoal);",
		);
		expect(darkScheme).toContain("--md-primary-fg-color: var(--rp1-charcoal);");
		expect(lightScheme).not.toEqual(darkScheme);
		const lightHeader = cssDeclarationsForSelector(
			stylesheet,
			'[data-md-color-scheme="default"] .md-header',
		);
		const darkHeader = cssDeclarationsForSelector(
			stylesheet,
			'[data-md-color-scheme="slate"] .md-header',
		);
		const darkTabs = cssDeclarationsForSelector(
			stylesheet,
			'[data-md-color-scheme="slate"] .md-tabs',
		);

		expect(lightHeader["background-color"]).toBe("var(--rp1-charcoal)");
		expect(lightHeader["border-bottom"]).toBeUndefined();
		expect(darkHeader["background-color"]).toBe("var(--rp1-charcoal)");
		expect(darkHeader["border-bottom"]).toBe("1px solid var(--rp1-off-white)");
		expect(darkTabs["background-color"]).toBe("var(--rp1-charcoal)");
		expect(darkTabs["border-bottom"]).toBe("1px solid var(--rp1-off-white)");

		expect(contrastRatio("#f6f4ef", "#0f1113")).toBeGreaterThanOrEqual(4.5);
	});

	test("docs stylesheet keeps CTA buttons accessible in dark mode", () => {
		const stylesheet = readRepoFile("docs/stylesheets/extra.css");
		const variables = rp1ColorVariables(stylesheet);

		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button--primary',
		);
		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button--github',
		);
		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button:hover',
		);
		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button--discord',
		);
		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button--discord:hover',
		);
		expect(stylesheet).toContain(
			'[data-md-color-scheme="slate"] .md-typeset .md-button--discord:focus',
		);

		expect(contrastRatio("#0f1113", "#23d188")).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio("#f6f4ef", "#0f1113")).toBeGreaterThanOrEqual(4.5);
		expect(contrastRatio("#0f1113", "#f6f4ef")).toBeGreaterThanOrEqual(4.5);

		for (const state of [
			{
				selector:
					'[data-md-color-scheme="slate"] .md-typeset .md-button--discord',
				background: variables["--rp1-charcoal"],
			},
			{
				selector:
					'[data-md-color-scheme="slate"] .md-typeset .md-button--discord:hover',
			},
			{
				selector:
					'[data-md-color-scheme="slate"] .md-typeset .md-button--discord:focus',
			},
		]) {
			const declarations = cssDeclarationsForSelector(
				stylesheet,
				state.selector,
			);
			const foreground = resolveCssColor(declarations.color ?? "", variables);
			const background =
				declarations["background-color"] === "transparent"
					? state.background
					: resolveCssColor(declarations["background-color"] ?? "", variables);

			expect(background).toBeDefined();
			expect(
				contrastRatio(foreground, background ?? "#000000"),
			).toBeGreaterThanOrEqual(4.5);
		}
	});

	test("mark-only roles derive from the authoritative mark-only SVG", () => {
		const manifest = JSON.parse(readRepoFile("assets/brand/manifest.json")) as {
			roles: Record<string, { source: string; assets: string[] }>;
			sources: Record<string, string>;
		};
		const source = readRepoFile("assets/brand/rp1-mark-only.svg");
		const darkVariant = readRepoFile("assets/brand/rp1-mark-only-dark.svg");
		const lightVariant = readRepoFile("assets/brand/rp1-mark-only-light.svg");

		expect(manifest.sources["rp1-mark-only.svg"]).toBe("rp1-mark-only.svg");

		for (const role of [
			"compactMark",
			"favicon",
			"emptyState",
			"nativeAppIcon",
		]) {
			expect(manifest.roles[role]?.source).toBe("rp1-mark-only.svg");
		}

		expect(darkVariant).toBe(source);
		expect(lightVariant).toContain("#f6f4ef");
		expect(lightVariant).toContain("#23d188");
		expect(lightVariant).not.toContain("#0f1113");
		expect(readRepoFile("assets/brand/app-icon.svg")).toContain(
			'viewBox="0 -46.087715 165.30204 165.30204"',
		);
	});

	test("SVG-derived raster assets have fixed dimensions and matching consumer copies", () => {
		const expectedPngDimensions = [
			["assets/brand/rp1-mark-32.png", 32, 32],
			["assets/brand/social-preview.png", 1200, 630],
			["docs/assets/social-preview.png", 1200, 630],
			["assets/brand/native/icon.png", 512, 512],
			["native-app/assets/icon.png", 512, 512],
		] as const;

		for (const [assetPath, width, height] of expectedPngDimensions) {
			expect(readPngDimensions(assetPath)).toEqual({ width, height });
		}

		expectRepoAssetCopy(
			"assets/brand/social-preview.png",
			"docs/assets/social-preview.png",
		);
		expectRepoAssetCopy(
			"assets/brand/native/icon.png",
			"native-app/assets/icon.png",
		);
		expectRepoAssetCopy(
			"assets/brand/native/icon.ico",
			"native-app/assets/icon.ico",
		);
		expectRepoAssetCopy("assets/brand/favicon.svg", "docs/assets/favicon.svg");
		expectRepoAssetCopy(
			"assets/brand/favicon.svg",
			"cli/web-ui/public/favicon.svg",
		);
		expectRepoAssetCopy(
			"assets/brand/rp1-mark-only-light.svg",
			"docs/assets/rp1-mark.svg",
		);
		expectRepoAssetCopy(
			"assets/brand/rp1-mark-only-dark.svg",
			"cli/web-ui/public/rp1-mark-only-dark.svg",
		);
		expectRepoAssetCopy(
			"assets/brand/rp1-mark-only-light.svg",
			"cli/web-ui/public/rp1-mark-only-light.svg",
		);
		expectRepoAssetCopy(
			"assets/brand/rp1-empty-state-dark.svg",
			"cli/web-ui/public/rp1-empty-state-dark.svg",
		);
		expectRepoAssetCopy(
			"assets/brand/rp1-empty-state-light.svg",
			"cli/web-ui/public/rp1-empty-state-light.svg",
		);

		const iconsetFiles = readdirSync(
			join(repoRoot, "assets/brand/native/icon.iconset"),
		).filter((fileName) => fileName.endsWith(".png"));

		for (const fileName of iconsetFiles) {
			expectRepoAssetCopy(
				`assets/brand/native/icon.iconset/${fileName}`,
				`native-app/assets/icon.iconset/${fileName}`,
			);
		}
	});
});

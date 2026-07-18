export const PROBE_POINT_NAMES = [
	"git-commit",
	"package-manifest",
	"source-entry",
	"test-file",
] as const;

export type ProbePointName = (typeof PROBE_POINT_NAMES)[number];

export interface ProbePoint {
	readonly name: ProbePointName;
	readonly pass: boolean;
	readonly detail: string;
}

export interface ProbeResult {
	readonly pass: boolean;
	readonly points: readonly ProbePoint[];
}

export const PACKAGE_MANIFESTS: readonly string[] = [
	"package.json",
	"Cargo.toml",
	"pyproject.toml",
	"go.mod",
	"Gemfile",
	"pom.xml",
	"build.gradle",
	"build.gradle.kts",
	"setup.py",
	"setup.cfg",
	"composer.json",
	"mix.exs",
	"Makefile.PL",
	"deno.json",
	"deno.jsonc",
];

export const SOURCE_ENTRY_DIRS: readonly string[] = [
	"src",
	"lib",
	"app",
	"cmd",
	"pkg",
	"internal",
];

export const SOURCE_ENTRY_FILES: readonly string[] = [
	"main.ts",
	"main.js",
	"index.ts",
	"index.js",
	"app.ts",
	"app.js",
	"mod.ts",
	"mod.rs",
	"main.go",
	"main.py",
	"__init__.py",
	"main.rs",
	"lib.rs",
];

export const TEST_PATTERNS: readonly RegExp[] = [
	/\.test\.\w+$/,
	/\.spec\.\w+$/,
	/^test_\w+\.\w+$/,
	/_test\.\w+$/,
];

export const TEST_DIRS: readonly string[] = [
	"test",
	"tests",
	"__tests__",
	"spec",
	"specs",
];

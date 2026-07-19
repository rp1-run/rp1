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

// Map a package manifest to its language ecosystem. Test-file conventions are
// language-specific: Rust integration tests are any `.rs` file under `tests/`
// (arbitrary names), whereas JS/TS require a `.test.`/`.spec.` naming pattern.
// The probe uses this so `tests/integration.rs` is accepted while a non-test
// helper like `tests/helper.ts` is rejected (review H2).
export const MANIFEST_LANGUAGE: Readonly<Record<string, string>> = {
	"package.json": "js",
	"deno.json": "js",
	"deno.jsonc": "js",
	"Cargo.toml": "rust",
	"go.mod": "go",
	"pyproject.toml": "python",
	"setup.py": "python",
	"setup.cfg": "python",
	Gemfile: "ruby",
	"pom.xml": "jvm",
	"build.gradle": "jvm",
	"build.gradle.kts": "jvm",
	"composer.json": "php",
	"mix.exs": "elixir",
	"Makefile.PL": "perl",
};

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

// Recognized source-code file extensions. A file inside a source directory only
// counts as a source entry when its name is a known entry file OR its extension
// is a real source extension — this rejects docs/config masquerading as source
// (e.g. `src/README.md`) that any-regular-file detection accepted (review H2).
export const SOURCE_ENTRY_EXTENSIONS: readonly string[] = [
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	".py",
	".go",
	".rs",
	".rb",
	".java",
	".kt",
	".kts",
	".scala",
	".ex",
	".exs",
	".php",
	".c",
	".cc",
	".cpp",
	".cxx",
	".h",
	".hpp",
	".hh",
	".cs",
	".swift",
	".clj",
	".cljs",
	".dart",
	".zig",
	".ml",
	".hs",
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

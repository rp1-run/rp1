#!/usr/bin/env bun

/**
 * Generates embedded.ts with all asset imports for bundling.
 * Run before `bun build --compile` to include assets in binary.
 *
 * Discovers platforms dynamically by scanning dist/ subdirectories for
 * bundle-manifest.json files. Each subdirectory with a manifest is treated
 * as a platform. The generated EMBEDDED_MANIFEST uses a platform-keyed
 * structure: EMBEDDED_MANIFEST.platforms.<platform>.plugins.<plugin>.
 *
 * Usage:
 *   From repo root: bun run cli/scripts/generate-asset-imports.ts
 *   From cli/:      bun run scripts/generate-asset-imports.ts
 */

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { BundleManifest } from "../src/build/models.js";
import {
	collectScopedCatalogRegistry,
	renderInitSkillAwarenessBlock,
} from "../src/catalog/index.js";
import {
	buildGeneratedInitTemplatesFile,
	readInitInstructionTemplate,
	writeGeneratedInitTemplatesFile,
} from "../src/init/templates/generator.js";

// Determine ROOT and CLI_DIR based on file structure detection
function findRootDir(): { root: string; cli: string } {
	const cwd = process.cwd();

	// Check if cwd is the cli directory (has package.json with @rp1-run/rp1)
	const cwdPkg = join(cwd, "package.json");
	if (existsSync(cwdPkg)) {
		try {
			const pkg = require(cwdPkg);
			if (pkg.name === "@rp1-run/rp1") {
				// We're in cli directory
				return { root: resolve(cwd, ".."), cli: cwd };
			}
		} catch {
			// Not the cli package
		}
	}

	// Check if cwd has both plugins/ and cli/ directories (repo root)
	if (existsSync(join(cwd, "plugins")) && existsSync(join(cwd, "cli"))) {
		return { root: cwd, cli: join(cwd, "cli") };
	}

	// Fallback: assume repo root structure
	return { root: cwd, cli: join(cwd, "cli") };
}

const { root: ROOT_DIR, cli: CLI_DIR } = findRootDir();

const DIST_DIR = join(ROOT_DIR, "dist");
const WEBUI_DIST = join(CLI_DIR, "web-ui/dist");
const OUTPUT_FILE = join(CLI_DIR, "src/assets/embedded.ts");
const TOOLS_YAML = join(CLI_DIR, "src/config/supported-tools.yaml");
const TOOLS_GENERATED = join(
	CLI_DIR,
	"src/config/supported-tools.generated.ts",
);
const INIT_GENERATED = join(CLI_DIR, "src/init/templates/generated.ts");

interface DiscoveredPlatform {
	name: string;
	distDir: string;
	manifest: BundleManifest;
}

interface AssetImport {
	varName: string;
	importPath: string;
	outputName: string;
	category:
		| "agent"
		| "skill"
		| "state-machine"
		| "webui"
		| "opencode-plugin"
		| "verbatim-file";
	plugin?: "base" | "dev" | "utils";
	platform?: string;
	inlineContent?: string;
}

/**
 * Calculate relative import path from OUTPUT_FILE location to the asset.
 */
function getImportPath(assetPath: string): string {
	const outputDir = dirname(OUTPUT_FILE);
	return relative(outputDir, assetPath);
}

/**
 * Create a valid TypeScript variable name from a path/name.
 */
function toVarName(prefix: string, name: string): string {
	return `${prefix}_${name.replace(/[-./\\[\]@]/g, "_")}`;
}

/**
 * Discover platforms by scanning dist/ subdirectories for bundle-manifest.json.
 */
async function discoverPlatforms(): Promise<DiscoveredPlatform[]> {
	const platforms: DiscoveredPlatform[] = [];

	try {
		const entries = await readdir(DIST_DIR, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const platformDir = join(DIST_DIR, entry.name);
			const manifestPath = join(platformDir, "bundle-manifest.json");
			if (existsSync(manifestPath)) {
				try {
					const content = await readFile(manifestPath, "utf-8");
					const manifest = JSON.parse(content) as BundleManifest;
					platforms.push({
						name: entry.name,
						distDir: platformDir,
						manifest,
					});
				} catch (e) {
					console.error(`Warning: Failed to parse ${manifestPath}: ${e}`);
				}
			}
		}
	} catch {
		// dist/ directory doesn't exist
	}

	if (platforms.length === 0) {
		console.error(
			"Error: No platforms with bundle-manifest.json found in dist/. Run 'bun run build' first.",
		);
		process.exit(1);
	}

	return platforms;
}

/**
 * Collect plugin assets from a single platform's bundle manifest.
 */
function collectPlatformAssets(platform: DiscoveredPlatform): AssetImport[] {
	const imports: AssetImport[] = [];
	const platformPrefix = platform.name.replace(/-/g, "_");

	for (const [pluginKey, plugin] of Object.entries(platform.manifest.plugins)) {
		const pluginName = pluginKey as "base" | "dev" | "utils";

		// Agents
		for (const agent of plugin.agents) {
			const fullPath = join(platform.distDir, agent.path);
			imports.push({
				varName: toVarName(`${platformPrefix}_${pluginName}_agent`, agent.name),
				importPath: getImportPath(fullPath),
				outputName: agent.name,
				category: "agent",
				plugin: pluginName,
				platform: platform.name,
			});
		}

		// Skills
		for (const skill of plugin.skills) {
			const fullPath = join(platform.distDir, skill.path);
			imports.push({
				varName: toVarName(`${platformPrefix}_${pluginName}_skill`, skill.name),
				importPath: getImportPath(fullPath),
				outputName: skill.name,
				category: "skill",
				plugin: pluginName,
				platform: platform.name,
			});
		}

		if (plugin.stateMachines) {
			for (const sm of plugin.stateMachines) {
				const smEntry: AssetImport = {
					varName: toVarName(
						`${platformPrefix}_${pluginName}_statemachine`,
						sm.name,
					),
					importPath: "",
					outputName: sm.name,
					category: "state-machine",
					plugin: pluginName,
					platform: platform.name,
				};

				if ((sm as { content?: string }).content) {
					smEntry.inlineContent = (sm as { content?: string }).content;
				} else if (sm.path) {
					const fullPath = join(platform.distDir, sm.path);
					smEntry.importPath = getImportPath(fullPath);
				}

				imports.push(smEntry);
			}
		}

		for (const file of plugin.verbatimFiles ?? []) {
			const fullPath = join(platform.distDir, file.path);
			imports.push({
				varName: toVarName(`${platformPrefix}_${pluginName}_file`, file.name),
				importPath: getImportPath(fullPath),
				outputName: file.name,
				category: "verbatim-file",
				plugin: pluginName,
				platform: platform.name,
			});
		}

		// OpenCode Plugin (TypeScript plugin responding to OpenCode events)
		if (plugin.openCodePlugin) {
			for (const file of plugin.openCodePlugin.files) {
				const fullPath = join(platform.distDir, file.path);
				imports.push({
					varName: toVarName(
						`${platformPrefix}_${pluginName}_plugin`,
						file.name,
					),
					importPath: getImportPath(fullPath),
					outputName: file.name,
					category: "opencode-plugin",
					plugin: pluginName,
					platform: platform.name,
				});
			}
		}
	}

	return imports;
}

/**
 * Collect web-ui files by walking the directory.
 * Web-ui doesn't have a manifest, so we still walk the directory.
 */
async function collectWebUIAssets(): Promise<AssetImport[]> {
	const imports: AssetImport[] = [];

	async function walk(dir: string): Promise<void> {
		try {
			const items = await readdir(dir, { withFileTypes: true });
			for (const item of items) {
				const fullPath = join(dir, item.name);
				if (item.isDirectory()) {
					await walk(fullPath);
				} else {
					const relPath = relative(WEBUI_DIST, fullPath);
					imports.push({
						varName: toVarName("webui", relPath),
						importPath: getImportPath(fullPath),
						outputName: relPath,
						category: "webui",
					});
				}
			}
		} catch {
			// Directory doesn't exist
		}
	}

	try {
		await stat(WEBUI_DIST);
		await walk(WEBUI_DIST);
	} catch {
		console.warn(
			"Warning: web-ui/dist not found. Run 'bun run build:web-ui' first.",
		);
	}

	return imports;
}

/**
 * Generate supported-tools.generated.ts from supported-tools.yaml.
 */
async function generateToolsRegistry(): Promise<void> {
	try {
		const yamlContent = await readFile(TOOLS_YAML, "utf-8");
		const registry = parseYaml(yamlContent);

		const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by: bun run scripts/generate-asset-imports.ts
// Source: src/config/supported-tools.yaml
// Timestamp: ${new Date().toISOString()}

export const TOOLS_REGISTRY = ${JSON.stringify(registry, null, "\t")} as const;
`;

		await writeFile(TOOLS_GENERATED, content);
		console.log(`Generated ${TOOLS_GENERATED}`);
		console.log(`  Tools: ${registry.tools?.length ?? 0} entries`);
	} catch (e) {
		console.error("Failed to generate tools registry:", e);
		throw e;
	}
}

/**
 * Pre-render the init instruction-file template for each platform
 * and write the results as string constants to a generated TypeScript file.
 * This ensures LiquidJS is not needed at runtime.
 */
async function generateInitTemplates(): Promise<void> {
	const templateSource = await readInitInstructionTemplate(ROOT_DIR);
	const { entries, errors } = await collectScopedCatalogRegistry(
		ROOT_DIR,
		"distributable",
	);

	for (const error of errors) {
		console.warn(`Warning: ${error}`);
	}

	const skillAwarenessBlock = renderInitSkillAwarenessBlock(entries);
	const content = await buildGeneratedInitTemplatesFile(
		templateSource,
		skillAwarenessBlock,
	);

	await writeGeneratedInitTemplatesFile(ROOT_DIR, content);
	console.log(`Generated ${INIT_GENERATED}`);
	console.log("  Platforms: claude-code, opencode, codex");
}

/**
 * Generate the platform block for a single discovered platform.
 */
function generatePlatformBlock(
	platform: DiscoveredPlatform,
	platformAssets: AssetImport[],
): string {
	const formatEntry = (a: AssetImport): string =>
		`{ name: "${a.outputName}", path: ${a.varName} }`;

	const formatStateMachineEntry = (a: AssetImport): string =>
		a.inlineContent
			? `{ name: "${a.outputName}", path: "", content: ${a.varName} }`
			: `{ name: "${a.outputName}", path: ${a.varName} }`;

	const baseAgents = platformAssets
		.filter((a) => a.category === "agent" && a.plugin === "base")
		.map(formatEntry);

	const baseSkills = platformAssets
		.filter((a) => a.category === "skill" && a.plugin === "base")
		.map(formatEntry);

	const devAgents = platformAssets
		.filter((a) => a.category === "agent" && a.plugin === "dev")
		.map(formatEntry);

	const devSkills = platformAssets
		.filter((a) => a.category === "skill" && a.plugin === "dev")
		.map(formatEntry);

	const utilsAgents = platformAssets
		.filter((a) => a.category === "agent" && a.plugin === "utils")
		.map(formatEntry);

	const utilsSkills = platformAssets
		.filter((a) => a.category === "skill" && a.plugin === "utils")
		.map(formatEntry);

	const baseStateMachines = platformAssets
		.filter((a) => a.category === "state-machine" && a.plugin === "base")
		.map(formatStateMachineEntry);

	const baseVerbatimFiles = platformAssets
		.filter((a) => a.category === "verbatim-file" && a.plugin === "base")
		.map(formatEntry);

	const devStateMachines = platformAssets
		.filter((a) => a.category === "state-machine" && a.plugin === "dev")
		.map(formatStateMachineEntry);

	const devVerbatimFiles = platformAssets
		.filter((a) => a.category === "verbatim-file" && a.plugin === "dev")
		.map(formatEntry);

	const utilsStateMachines = platformAssets
		.filter((a) => a.category === "state-machine" && a.plugin === "utils")
		.map(formatStateMachineEntry);

	const utilsVerbatimFiles = platformAssets
		.filter((a) => a.category === "verbatim-file" && a.plugin === "utils")
		.map(formatEntry);

	// OpenCode plugin files (only base plugin has this currently)
	const basePluginFiles = platformAssets
		.filter((a) => a.category === "opencode-plugin" && a.plugin === "base")
		.map(formatEntry);

	const baseOpenCodePlugin = platform.manifest.plugins.base.openCodePlugin
		? `openCodePlugin: {
          name: "${platform.manifest.plugins.base.openCodePlugin.name}",
          files: [${basePluginFiles.join(", ")}],
        },`
		: "";

	const utilsBlock =
		utilsAgents.length > 0 || utilsSkills.length > 0
			? `      utils: {
        name: "rp1-utils",
        commands: [],
        agents: [${utilsAgents.join(", ")}],
        skills: [${utilsSkills.join(", ")}],
        stateMachines: [${utilsStateMachines.join(", ")}],
        verbatimFiles: [${utilsVerbatimFiles.join(", ")}],
      },`
			: "      // utils excluded from distribution (internal-only plugin)";

	// Use quoted key if platform name contains hyphens
	const key = platform.name.includes("-")
		? `"${platform.name}"`
		: platform.name;

	return `    ${key}: {
      plugins: {
        base: {
          name: "rp1-base",
          commands: [],
          agents: [${baseAgents.join(", ")}],
          skills: [${baseSkills.join(", ")}],
          stateMachines: [${baseStateMachines.join(", ")}],
          verbatimFiles: [${baseVerbatimFiles.join(", ")}],
          ${baseOpenCodePlugin}
        },
        dev: {
          name: "rp1-dev",
          commands: [],
          agents: [${devAgents.join(", ")}],
          skills: [${devSkills.join(", ")}],
          stateMachines: [${devStateMachines.join(", ")}],
          verbatimFiles: [${devVerbatimFiles.join(", ")}],
        },
${utilsBlock}
      },
    }`;
}

async function generate(): Promise<void> {
	console.log("Generating asset imports from bundle manifests...");

	const platforms = await discoverPlatforms();
	console.log(
		`  Discovered ${platforms.length} platform(s): ${platforms.map((p) => p.name).join(", ")}`,
	);

	// Collect assets for all platforms
	const allPlatformAssets: AssetImport[] = [];
	for (const platform of platforms) {
		const assets = collectPlatformAssets(platform);
		allPlatformAssets.push(...assets);
	}

	const webuiAssets = await collectWebUIAssets();

	const allAssets = [...allPlatformAssets, ...webuiAssets];
	const fileImports = allAssets
		.filter((a) => !a.inlineContent)
		.map(
			(a) =>
				`import ${a.varName} from "${a.importPath}" with { type: "file" };`,
		)
		.join("\n");

	const inlineDeclarations = allAssets
		.filter((a) => a.inlineContent)
		.map((a) => `const ${a.varName} = ${JSON.stringify(a.inlineContent)};`)
		.join("\n");

	const imports = [fileImports, inlineDeclarations]
		.filter(Boolean)
		.join("\n\n");

	// Generate per-platform blocks
	const platformBlocks = platforms.map((platform) => {
		const platformAssets = allPlatformAssets.filter(
			(a) => a.platform === platform.name,
		);
		return generatePlatformBlock(platform, platformAssets);
	});

	const webuiEntries = webuiAssets.map(
		(a) => `{ name: "${a.outputName}", path: ${a.varName} }`,
	);

	// Use version from first platform (all share same version per version lockstep)
	const version = platforms[0].manifest.version;

	const platformSourceList = platforms
		.map((p) => `dist/${p.name}/bundle-manifest.json`)
		.join(", ");

	const content = `// AUTO-GENERATED FILE - DO NOT EDIT
// Generated by: bun run scripts/generate-asset-imports.ts
// Source: ${platformSourceList}
// Timestamp: ${new Date().toISOString()}

${imports}

export const EMBEDDED_MANIFEST = {
  platforms: {
${platformBlocks.join(",\n")}
  },
  webui: [${webuiEntries.join(", ")}],
  version: "${version}",
  buildTimestamp: "${new Date().toISOString()}",
} as const;

export const IS_BUNDLED = true;
`;

	await writeFile(OUTPUT_FILE, content);
	console.log(`Generated ${OUTPUT_FILE}`);

	for (const platform of platforms) {
		const platformAssets = allPlatformAssets.filter(
			(a) => a.platform === platform.name,
		);
		const agents = platformAssets.filter((a) => a.category === "agent");
		const skills = platformAssets.filter((a) => a.category === "skill");
		const stateMachines = platformAssets.filter(
			(a) => a.category === "state-machine",
		);
		const pluginFiles = platformAssets.filter(
			(a) => a.category === "opencode-plugin",
		);
		const verbatimFiles = platformAssets.filter(
			(a) => a.category === "verbatim-file",
		);

		console.log(`  ${platform.name}:`);
		console.log(`    ${agents.length} agents, ${skills.length} skills`);
		if (stateMachines.length > 0) {
			console.log(`    ${stateMachines.length} state machines`);
		}
		if (verbatimFiles.length > 0) {
			console.log(`    ${verbatimFiles.length} verbatim plugin files`);
		}
		if (pluginFiles.length > 0) {
			console.log(`    ${pluginFiles.length} plugin files`);
		}
	}

	console.log(`  Web-UI: ${webuiAssets.length} files`);
	console.log(`  Version: ${version}`);

	// Generate tools registry from YAML
	await generateToolsRegistry();

	// Pre-render init instruction-file templates
	await generateInitTemplates();

	// Run biome to fix formatting/linting on generated files
	console.log("Running biome fix on generated files...");
	try {
		execSync(
			`bunx biome check --write "${OUTPUT_FILE}" "${TOOLS_GENERATED}" "${INIT_GENERATED}"`,
			{
				cwd: CLI_DIR,
				stdio: "inherit",
			},
		);
		console.log("Biome fix completed.");
	} catch {
		// Biome may exit with non-zero if it finds unfixable issues, but we still want to continue
		console.warn(
			"Warning: Biome reported issues that could not be auto-fixed.",
		);
	}
}

generate().catch((e) => {
	console.error("Failed to generate asset imports:", e);
	process.exit(1);
});

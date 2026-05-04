import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import {
	ARCADE_RUNTIME_MANIFEST_FILENAME,
	type ArcadeRuntimeManifest,
} from "./src/types/runtime";
import { RP1_VERSION } from "./src/version";

const getGitCommit = (): string => {
	try {
		return execSync("git rev-parse --short HEAD", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
	} catch {
		return "Unknown";
	}
};

interface RuntimeManifestInput {
	readonly version: string;
	readonly gitCommit: string;
	readonly buildTime: string;
}

export interface RuntimeManifestAsset {
	readonly type: "asset";
	readonly fileName: typeof ARCADE_RUNTIME_MANIFEST_FILENAME;
	readonly source: string;
}

export function createRuntimeBuildId(
	input: Pick<RuntimeManifestInput, "version" | "gitCommit">,
): string {
	return createHash("sha256")
		.update(`${input.version}:${input.gitCommit}`)
		.digest("hex")
		.slice(0, 12);
}

export function buildRuntimeManifest(
	input: RuntimeManifestInput,
): ArcadeRuntimeManifest {
	return {
		...input,
		buildId: createRuntimeBuildId(input),
	};
}

export function serializeRuntimeManifest(
	manifest: ArcadeRuntimeManifest,
): string {
	return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function runtimeManifestAsset(
	manifest: ArcadeRuntimeManifest,
): RuntimeManifestAsset {
	return {
		type: "asset",
		fileName: ARCADE_RUNTIME_MANIFEST_FILENAME,
		source: serializeRuntimeManifest(manifest),
	};
}

export function runtimeManifestPlugin(manifest: ArcadeRuntimeManifest): Plugin {
	return {
		name: "rp1-runtime-manifest",
		generateBundle() {
			this.emitFile(runtimeManifestAsset(manifest));
		},
	};
}

const runtimeManifest = buildRuntimeManifest({
	version: RP1_VERSION,
	gitCommit: getGitCommit(),
	buildTime: new Date().toISOString(),
});

export default defineConfig({
	plugins: [react(), runtimeManifestPlugin(runtimeManifest)],
	define: {
		__RP1_WEB_UI_BUILD_TIME__: JSON.stringify(runtimeManifest.buildTime),
		__RP1_WEB_UI_GIT_COMMIT__: JSON.stringify(runtimeManifest.gitCommit),
		__RP1_WEB_UI_VERSION__: JSON.stringify(runtimeManifest.version),
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	build: {
		outDir: "dist/client",
		emptyOutDir: true,
	},
	server: {
		port: 6810,
		strictPort: false,
		hmr: {
			port: 6810,
		},
		proxy: {
			"/api": {
				target: "http://127.0.0.1:6710",
				changeOrigin: true,
			},
			"/ws": {
				target: "ws://127.0.0.1:6710",
				ws: true,
			},
		},
	},
});

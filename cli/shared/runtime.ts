// Runtime detection for cross-runtime compatibility (Bun/Node.js)
// Bun types come from @types/bun in devDependencies

export interface RuntimeInfo {
	runtime: "bun" | "node";
	version: string;
	warning?: string;
}

export function detectRuntime(): RuntimeInfo {
	if (typeof Bun !== "undefined") {
		return {
			runtime: "bun",
			version: Bun.version,
		};
	}

	return {
		runtime: "node",
		version: process.version,
		warning:
			"Running under Node.js. Some features may have reduced performance. Install Bun for best experience: https://bun.sh",
	};
}

export function isBun(): boolean {
	return typeof Bun !== "undefined";
}

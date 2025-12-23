#!/usr/bin/env bun

/**
 * Postinstall script - sets up stub files for development.
 * Run automatically after `bun install`.
 */

import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

const CLI_DIR = dirname(dirname(import.meta.path));

const stubs = [
	{
		target: "src/assets/embedded.ts",
		stub: "src/assets/embedded.stub.ts",
	},
	{
		target: "src/config/supported-tools.generated.ts",
		stub: "src/config/supported-tools.generated.stub.ts",
	},
];

for (const { target, stub } of stubs) {
	const targetPath = join(CLI_DIR, target);
	const stubPath = join(CLI_DIR, stub);

	if (!existsSync(targetPath)) {
		copyFileSync(stubPath, targetPath);
		console.log(`Created ${target} from stub`);
	}
}

// Install web-ui dependencies
const webUiDir = join(CLI_DIR, "web-ui");
if (existsSync(webUiDir)) {
	console.log("Installing web-ui dependencies...");
	execSync("bun install", { cwd: webUiDir, stdio: "inherit" });
}

#!/usr/bin/env bun

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	checkCatalogArtifacts,
	writeCatalogArtifacts,
} from "../src/catalog/index.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const command = process.argv[2];

const fail = (message: string, details: readonly string[]): never => {
	for (const detail of details) {
		console.error(detail);
	}

	console.error("");
	console.error(message);
	process.exit(1);
};

const run = async (): Promise<void> => {
	if (command === "generate") {
		const result = await writeCatalogArtifacts(PROJECT_ROOT);
		if (result.errors.length > 0) {
			fail("ERROR: Failed to generate catalogue artifacts.", result.errors);
		}

		for (const artifact of result.artifacts) {
			console.log(`Updated ${artifact.relativePath}`);
		}

		console.log("");
		console.log("Catalogue artifacts regenerated.");
		return;
	}

	if (command === "check") {
		const result = await checkCatalogArtifacts(PROJECT_ROOT);
		if (result.issues.length > 0) {
			fail(
				`ERROR: Catalogue is out of date (${result.issues.length} issues). Run 'just catalog-generate' and commit the changes.`,
				result.issues.map((issue) => `${issue.relativePath}: ${issue.message}`),
			);
		}

		console.log("Catalogue is up to date.");
		return;
	}

	fail(
		"Usage: bun run cli/scripts/catalog-maintenance.ts <generate|check>",
		[],
	);
};

await run();

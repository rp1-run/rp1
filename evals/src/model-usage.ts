#!/usr/bin/env bun
// Report REAL per-model token usage + cost from promptfoo eval output files.
//
// promptfoo's top-level `tokenUsage` is unreliable for the claude-agent-sdk
// provider: it under-reports input tokens and the agent's true output. The
// authoritative numbers live in `results[].response.metadata.modelUsage`
// (per-model input/output/cache tokens + costUSD) alongside `numTurns`.
//
// Usage:
//   bun run src/model-usage.ts                 # all of evals/output/*.json
//   bun run src/model-usage.ts a.json b.json   # specific files (averages across them)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface ModelUse {
	inputTokens?: number;
	outputTokens?: number;
	cacheReadInputTokens?: number;
	cacheCreationInputTokens?: number;
	costUSD?: number;
}

const num = (n: number | undefined) => (n ?? 0).toLocaleString();
const usd = (n: number | undefined) => `$${(n ?? 0).toFixed(2)}`;
const mean = (xs: number[]) =>
	xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

// Default to evals/output relative to this file, so cwd does not matter.
const defaultDir = join(import.meta.dir, "..", "output");

const args = process.argv.slice(2);
const files =
	args.length > 0
		? args
		: readdirSync(defaultDir)
				.filter((f) => f.endsWith(".json"))
				.map((f) => join(defaultDir, f))
				.sort();

if (files.length === 0) {
	console.error("No eval output files found.");
	process.exit(1);
}

interface RunTotal {
	cost: number;
	output: number;
	cacheRead: number;
	turns: number;
}
const totals: RunTotal[] = [];

for (const file of files) {
	let parsed: { evalId?: string; results?: { results?: unknown[] } };
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch (err) {
		console.error(`! ${file}: ${(err as Error).message}`);
		continue;
	}
	const results = parsed.results?.results ?? [];
	let cost = 0;
	let output = 0;
	let cacheRead = 0;
	let turns = 0;
	console.log(
		`\n=== ${file}  (eval ${parsed.evalId ?? "?"})  ${results.length} test(s) ===`,
	);
	for (const r of results as Array<Record<string, unknown>>) {
		const response = (r.response ?? {}) as Record<string, unknown>;
		const md = (response.metadata ?? {}) as Record<string, unknown>;
		const mu = (md.modelUsage ?? {}) as Record<string, ModelUse>;
		const t = (md.numTurns as number) ?? 0;
		const mins = (
			((r.latencyMs as number) ?? (md.durationMs as number) ?? 0) / 60000
		).toFixed(1);
		turns += t;
		console.log(`  test ${r.testIdx}: ${t} turns, ${mins} min`);
		for (const [model, u] of Object.entries(mu)) {
			cost += u.costUSD ?? 0;
			output += u.outputTokens ?? 0;
			cacheRead += u.cacheReadInputTokens ?? 0;
			console.log(
				`    ${model}: out=${num(u.outputTokens)} in=${num(u.inputTokens)} ` +
					`cacheR=${num(u.cacheReadInputTokens)} cacheC=${num(u.cacheCreationInputTokens)} ${usd(u.costUSD)}`,
			);
		}
	}
	console.log(
		`  TOTAL: ${usd(cost)}  |  output ${num(output)} tok  |  cacheRead ${num(cacheRead)} tok  |  ${turns} turns`,
	);
	totals.push({ cost, output, cacheRead, turns });
}

if (totals.length > 1) {
	const costs = totals.map((x) => x.cost);
	const outs = totals.map((x) => x.output);
	const turns = totals.map((x) => x.turns);
	console.log(`\n=== AVERAGE across ${totals.length} runs ===`);
	console.log(
		`  cost:   mean ${usd(mean(costs))}   (min ${usd(Math.min(...costs))}, max ${usd(Math.max(...costs))})`,
	);
	console.log(
		`  output: mean ${num(Math.round(mean(outs)))} tok   (min ${num(Math.min(...outs))}, max ${num(Math.max(...outs))})`,
	);
	console.log(
		`  turns:  mean ${mean(turns).toFixed(1)}   (min ${Math.min(...turns)}, max ${Math.max(...turns)})`,
	);
}

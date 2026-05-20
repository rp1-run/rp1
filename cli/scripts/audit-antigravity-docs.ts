#!/usr/bin/env bun

import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export interface GeminiAllowlistEntry {
	readonly path: string;
	readonly pattern: string;
	readonly reason: string;
}

export interface GeminiAllowlist {
	readonly entries: readonly GeminiAllowlistEntry[];
}

export interface GeminiReferenceMatch {
	readonly path: string;
	readonly line: number;
	readonly column: number;
	readonly text: string;
	readonly allowed: boolean;
	readonly reason?: string;
}

export interface GeminiAuditResult {
	readonly matches: readonly GeminiReferenceMatch[];
	readonly violations: readonly GeminiReferenceMatch[];
}

export interface GeminiAuditOptions {
	readonly targets?: readonly string[];
	readonly allowlist?: GeminiAllowlist;
	readonly allowlistPath?: string;
}

export const DEFAULT_GEMINI_AUDIT_TARGETS = [
	"docs",
	"plugins/base/skills/guide",
	"mkdocs.yml",
] as const;

export const DEFAULT_GEMINI_ALLOWLIST_PATH =
	"docs/antigravity-gemini-allowlist.json";

const GEMINI_REFERENCE_PATTERN = /\b(?:Gemini|gemini|GEMINI)\b/g;
const AUDIT_FILE_EXTENSIONS = new Set([".md", ".yml", ".yaml"]);

export async function auditGeminiReferences(
	projectRoot: string,
	options: GeminiAuditOptions = {},
): Promise<GeminiAuditResult> {
	const root = resolve(projectRoot);
	const allowlist =
		options.allowlist ??
		(await loadGeminiAllowlist(
			root,
			options.allowlistPath ?? DEFAULT_GEMINI_ALLOWLIST_PATH,
		));
	const files = await collectAuditFiles(
		root,
		options.targets ?? DEFAULT_GEMINI_AUDIT_TARGETS,
	);
	const matches: GeminiReferenceMatch[] = [];

	for (const filePath of files) {
		const relativePath = normalizePath(relative(root, filePath));
		const content = await readFile(filePath, "utf-8");
		const lines = content.split(/\r?\n/);

		for (const [index, lineText] of lines.entries()) {
			GEMINI_REFERENCE_PATTERN.lastIndex = 0;
			for (
				let match = GEMINI_REFERENCE_PATTERN.exec(lineText);
				match !== null;
				match = GEMINI_REFERENCE_PATTERN.exec(lineText)
			) {
				const allowedEntry = findAllowlistEntry(
					allowlist,
					relativePath,
					lineText,
				);
				matches.push({
					path: relativePath,
					line: index + 1,
					column: match.index + 1,
					text: lineText.trim(),
					allowed: allowedEntry !== undefined,
					reason: allowedEntry?.reason,
				});
			}
		}
	}

	return {
		matches,
		violations: matches.filter((match) => !match.allowed),
	};
}

export async function loadGeminiAllowlist(
	projectRoot: string,
	allowlistPath: string = DEFAULT_GEMINI_ALLOWLIST_PATH,
): Promise<GeminiAllowlist> {
	const raw = await readFile(resolve(projectRoot, allowlistPath), "utf-8");
	const parsed = JSON.parse(raw) as GeminiAllowlist;

	for (const entry of parsed.entries) {
		new RegExp(entry.pattern);
	}

	return parsed;
}

export async function collectAuditFiles(
	projectRoot: string,
	targets: readonly string[] = DEFAULT_GEMINI_AUDIT_TARGETS,
): Promise<readonly string[]> {
	const files: string[] = [];

	for (const target of targets) {
		const targetPath = resolve(projectRoot, target);
		await collectFromPath(targetPath, files);
	}

	return files.sort();
}

export function formatGeminiAuditResult(result: GeminiAuditResult): string {
	if (result.violations.length === 0) {
		const allowedCount = result.matches.length;
		return `Gemini leftover audit passed: ${allowedCount} historical or Antigravity-profile references allowlisted.`;
	}

	const lines = result.violations.map(
		(match) => `${match.path}:${match.line}:${match.column}: ${match.text}`,
	);

	return [
		`Gemini leftover audit failed: ${result.violations.length} active reference(s) are not allowlisted.`,
		...lines,
	].join("\n");
}

export async function findProjectRoot(startDir: string): Promise<string> {
	let current = resolve(startDir);

	while (true) {
		if (await pathExists(join(current, "docs"))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) {
			throw new Error(`Could not find project root from ${startDir}`);
		}
		current = parent;
	}
}

async function collectFromPath(path: string, files: string[]): Promise<void> {
	const info = await stat(path);

	if (info.isDirectory()) {
		const entries = await readdir(path, { withFileTypes: true });
		for (const entry of entries) {
			await collectFromPath(join(path, entry.name), files);
		}
		return;
	}

	if (info.isFile() && AUDIT_FILE_EXTENSIONS.has(extensionOf(path))) {
		files.push(path);
	}
}

function findAllowlistEntry(
	allowlist: GeminiAllowlist,
	relativePath: string,
	lineText: string,
): GeminiAllowlistEntry | undefined {
	return allowlist.entries.find((entry) => {
		if (!pathMatches(entry.path, relativePath)) {
			return false;
		}

		return new RegExp(entry.pattern).test(lineText);
	});
}

function pathMatches(pattern: string, relativePath: string): boolean {
	const normalizedPattern = normalizePath(pattern);
	const normalizedPath = normalizePath(relativePath);

	if (normalizedPattern.endsWith("/**")) {
		const prefix = normalizedPattern.slice(0, -3);
		return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
	}

	return normalizedPath === normalizedPattern;
}

function extensionOf(path: string): string {
	const normalized = normalizePath(path);
	const lastDot = normalized.lastIndexOf(".");
	return lastDot === -1 ? "" : normalized.slice(lastDot);
}

function normalizePath(path: string): string {
	return path.replaceAll("\\", "/");
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function main(): Promise<void> {
	const startDir = process.argv[2] ?? process.cwd();
	const projectRoot = await findProjectRoot(startDir);
	const result = await auditGeminiReferences(projectRoot);
	const report = formatGeminiAuditResult(result);

	if (result.violations.length > 0) {
		console.error(report);
		process.exit(1);
	}

	console.log(report);
}

if (import.meta.main) {
	await main();
}

import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	type ResolvedDirectorySet,
	resolveDirectorySet,
} from "../../shared/directory-resolution.js";
import type { CLIError } from "../../shared/errors.js";
import type { GitignorePreset } from "./models.js";

const toPosixPath = (value: string): string => value.split(path.sep).join("/");

const isWithinRoot = (root: string, candidate: string): boolean => {
	const relativePath = path.relative(root, candidate);
	return (
		relativePath.length === 0 ||
		(!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
	);
};

const toRelativePath = (
	root: string,
	candidate: string,
): string | undefined => {
	if (!isWithinRoot(root, candidate)) {
		return undefined;
	}

	const relativePath = path.relative(root, candidate);
	return relativePath.length === 0 ? undefined : toPosixPath(relativePath);
};

const toDirectoryPattern = (
	root: string,
	candidate: string,
): string | undefined => {
	const relativePath = toRelativePath(root, candidate);
	return relativePath ? `${relativePath.replace(/\/+$/, "")}/` : undefined;
};

const appendUnique = (lines: string[], value: string | undefined): void => {
	if (value && !lines.includes(value)) {
		lines.push(value);
	}
};

const resolveProjectSettingsPath = (cwd: string): string =>
	path.resolve(cwd, process.env.RP1_ROOT || ".rp1", "settings.toml");

export const buildManagedGitignoreContent = (
	cwd: string,
	preset: GitignorePreset,
): E.Either<CLIError, string> => {
	const resolvedCwd = path.resolve(cwd);
	return E.map((directories: ResolvedDirectorySet) => {
		const lines: string[] = [];
		const rp1RootDir = toDirectoryPattern(resolvedCwd, directories.rp1Root);
		const kbDir = toDirectoryPattern(resolvedCwd, directories.kbDir);
		const workDir = toDirectoryPattern(resolvedCwd, directories.workDir);
		const settingsAbsolutePath = resolveProjectSettingsPath(resolvedCwd);
		const settingsPath = toRelativePath(resolvedCwd, settingsAbsolutePath);
		const kbMetaPath = toRelativePath(
			resolvedCwd,
			path.join(directories.kbDir, "meta.json"),
		);
		const kbDirWithinRp1Root = isWithinRoot(
			directories.rp1Root,
			directories.kbDir,
		);
		const workDirWithinRp1Root = isWithinRoot(
			directories.rp1Root,
			directories.workDir,
		);
		const settingsWithinRp1Root = isWithinRoot(
			directories.rp1Root,
			settingsAbsolutePath,
		);

		switch (preset) {
			case "recommended":
				if (rp1RootDir !== undefined) {
					appendUnique(lines, `!${rp1RootDir}`);
					appendUnique(lines, `${rp1RootDir}*`);
					appendUnique(lines, `!${rp1RootDir}config/`);
					appendUnique(lines, `!${rp1RootDir}config/**`);
				}
				if (kbDir !== undefined && kbDirWithinRp1Root) {
					appendUnique(lines, `!${kbDir}`);
					appendUnique(lines, `!${kbDir}**`);
				}
				if (workDir !== undefined && !workDirWithinRp1Root) {
					appendUnique(lines, workDir);
				}
				appendUnique(lines, kbMetaPath);
				appendUnique(lines, settingsPath);
				break;
			case "track_all":
				appendUnique(lines, kbMetaPath);
				appendUnique(lines, settingsPath);
				break;
			case "ignore_all":
				appendUnique(lines, rp1RootDir);
				if (kbDir !== undefined && !kbDirWithinRp1Root) {
					appendUnique(lines, kbDir);
				}
				if (workDir !== undefined && !workDirWithinRp1Root) {
					appendUnique(lines, workDir);
				}
				if (settingsPath !== undefined && !settingsWithinRp1Root) {
					appendUnique(lines, settingsPath);
				}
				break;
		}

		return lines.join("\n");
	})(resolveDirectorySet(resolvedCwd));
};

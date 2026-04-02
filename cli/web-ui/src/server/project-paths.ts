import { isAbsolute, join, relative, resolve } from "node:path";
import type { RunRecord } from "../../../shared/events.js";
import type { ArtifactRecord } from "../../../src/agent-tools/emit/database.js";

export interface ProjectDirectories {
	readonly projectRoot: string;
	readonly kbRoot: string;
	readonly workRoot: string;
}

export type ProjectSection = "work" | "kb";

export interface ProjectSectionRoot {
	readonly section: ProjectSection;
	readonly absolutePath: string;
	readonly displayPath: string;
}

interface SectionPath {
	readonly section: ProjectSection;
	readonly relativePath: string;
}

const CANONICAL_SECTION_PREFIXES: Record<ProjectSection, string> = {
	work: ".rp1/work",
	kb: ".rp1/context",
};

const LEGACY_SECTION_PREFIXES: Record<ProjectSection, readonly string[]> = {
	work: ["work"],
	kb: ["kb", "context"],
};

const deriveProjectDirectories = (projectPath: string): ProjectDirectories => {
	const projectRoot = resolve(projectPath);
	const rp1DotDir = join(projectRoot, ".rp1");
	return {
		projectRoot,
		kbRoot: join(rp1DotDir, "context"),
		workRoot: join(rp1DotDir, "work"),
	};
};

const isWithinRoot = (candidatePath: string, rootPath: string): boolean => {
	const relativePath = relative(resolve(rootPath), resolve(candidatePath));
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const trimTrailingSlash = (value: string): string =>
	value.replace(/[\\/]+$/, "");

const ensureSectionPath = (prefix: string, relativePath: string): string =>
	relativePath.length > 0 ? `${prefix}/${relativePath}` : prefix;

const getCanonicalSectionPath = (section: ProjectSection): string =>
	CANONICAL_SECTION_PREFIXES[section];

const matchSectionPrefix = (
	filePath: string,
	prefix: string,
): string | null => {
	if (filePath === prefix) {
		return "";
	}

	if (filePath.startsWith(`${prefix}/`)) {
		return filePath.slice(prefix.length + 1);
	}

	return null;
};

const normalizeStoredWorkRelativePath = (artifactPath: string): string => {
	const normalized = artifactPath.replace(/\\/g, "/").replace(/^\.\/+/, "");

	if (normalized.startsWith(".rp1/work/")) {
		return normalized.slice(".rp1/work/".length);
	}

	if (normalized.startsWith("work/")) {
		return normalized.slice("work/".length);
	}

	return normalized;
};

export const resolveProjectDirectories = (
	projectPath: string,
): ProjectDirectories => {
	return deriveProjectDirectories(projectPath);
};

export const getRunDirectories = (
	run: Pick<RunRecord, "projectPath" | "rp1ProjectRoot">,
): ProjectDirectories => {
	const projectRoot = resolve(run.rp1ProjectRoot ?? run.projectPath);
	return deriveProjectDirectories(projectRoot);
};

export const listProjectSectionRoots = (
	directories: ProjectDirectories,
): readonly ProjectSectionRoot[] => [
	{
		section: "work",
		absolutePath: directories.workRoot,
		displayPath: getCanonicalSectionPath("work"),
	},
	{
		section: "kb",
		absolutePath: directories.kbRoot,
		displayPath: getCanonicalSectionPath("kb"),
	},
];

export const parseProjectSectionPath = (
	filePath: string,
): SectionPath | null => {
	if (filePath.includes("..") || isAbsolute(filePath)) {
		return null;
	}

	const normalizedPath = trimTrailingSlash(filePath.replace(/\\/g, "/"));

	for (const section of ["work", "kb"] as const) {
		for (const prefix of [
			getCanonicalSectionPath(section),
			...LEGACY_SECTION_PREFIXES[section],
		]) {
			const relativePath = matchSectionPrefix(normalizedPath, prefix);
			if (relativePath !== null) {
				return {
					section,
					relativePath,
				};
			}
		}
	}

	return null;
};

export const resolveProjectSectionFilePath = async (
	directories: ProjectDirectories,
	filePath: string,
): Promise<string | null> => {
	const parsed = parseProjectSectionPath(filePath);
	if (!parsed) return null;

	const rootDir =
		parsed.section === "work" ? directories.workRoot : directories.kbRoot;
	const candidate = resolve(rootDir, parsed.relativePath);
	if (!isWithinRoot(candidate, rootDir)) {
		return null;
	}

	if (await Bun.file(candidate).exists()) {
		return candidate;
	}

	if (parsed.section !== "work") {
		return null;
	}

	const archivePrefixes = ["features/", "prds/"] as const;
	for (const prefix of archivePrefixes) {
		if (parsed.relativePath.startsWith(prefix)) {
			const archiveCandidate = resolve(
				rootDir,
				`archives/${parsed.relativePath}`,
			);
			if (
				isWithinRoot(archiveCandidate, rootDir) &&
				(await Bun.file(archiveCandidate).exists())
			) {
				return archiveCandidate;
			}
		}
	}

	return null;
};

export const toProjectSectionPath = (
	directories: ProjectDirectories,
	absolutePath: string,
): string | null => {
	const resolvedPath = resolve(absolutePath);
	if (isWithinRoot(resolvedPath, directories.workRoot)) {
		return ensureSectionPath(
			getCanonicalSectionPath("work"),
			trimTrailingSlash(relative(directories.workRoot, resolvedPath)),
		);
	}

	if (isWithinRoot(resolvedPath, directories.kbRoot)) {
		return ensureSectionPath(
			getCanonicalSectionPath("kb"),
			trimTrailingSlash(relative(directories.kbRoot, resolvedPath)),
		);
	}

	return null;
};

export const resolveArtifactAbsolutePath = (
	directories: ProjectDirectories,
	artifact: Pick<ArtifactRecord, "path" | "storageRoot">,
): string => {
	if (isAbsolute(artifact.path) || artifact.storageRoot === "absolute") {
		return resolve(artifact.path);
	}

	if (artifact.storageRoot === "work_dir") {
		return resolve(
			directories.workRoot,
			normalizeStoredWorkRelativePath(artifact.path),
		);
	}

	return resolve(directories.projectRoot, artifact.path);
};

export const toArtifactDisplayPath = (
	directories: ProjectDirectories,
	artifact: Pick<ArtifactRecord, "path" | "storageRoot">,
): string => {
	if (artifact.storageRoot === "work_dir") {
		return ensureSectionPath(
			getCanonicalSectionPath("work"),
			trimTrailingSlash(normalizeStoredWorkRelativePath(artifact.path)),
		);
	}

	return toArtifactDisplayPathFromAbsolute(
		directories,
		resolveArtifactAbsolutePath(directories, artifact),
	);
};

export const toArtifactDisplayPathFromAbsolute = (
	directories: ProjectDirectories,
	absolutePath: string,
): string => {
	const sectionPath = toProjectSectionPath(directories, absolutePath);
	if (sectionPath) {
		return sectionPath;
	}

	if (isWithinRoot(absolutePath, directories.projectRoot)) {
		return relative(directories.projectRoot, absolutePath);
	}

	return absolutePath;
};

export const matchesArtifactDisplayPath = (
	directories: ProjectDirectories,
	artifact: Pick<ArtifactRecord, "path" | "storageRoot">,
	requestedPath: string,
): boolean =>
	artifact.path === requestedPath ||
	toArtifactDisplayPath(directories, artifact) === requestedPath ||
	(artifact.storageRoot === "work_dir" &&
		ensureSectionPath(
			"work",
			trimTrailingSlash(normalizeStoredWorkRelativePath(artifact.path)),
		) === requestedPath) ||
	(artifact.storageRoot !== "absolute" &&
		resolveProjectSectionFilePathLegacyAlias(
			directories,
			artifact,
			requestedPath,
		));

const resolveProjectSectionFilePathLegacyAlias = (
	directories: ProjectDirectories,
	artifact: Pick<ArtifactRecord, "path" | "storageRoot">,
	requestedPath: string,
): boolean => {
	const absolutePath = resolveArtifactAbsolutePath(directories, artifact);
	const resolvedPath = resolve(absolutePath);

	if (isWithinRoot(resolvedPath, directories.workRoot)) {
		return (
			ensureSectionPath(
				"work",
				trimTrailingSlash(relative(directories.workRoot, resolvedPath)),
			) === requestedPath
		);
	}

	if (isWithinRoot(resolvedPath, directories.kbRoot)) {
		const relativePath = trimTrailingSlash(
			relative(directories.kbRoot, resolvedPath),
		);
		return (
			ensureSectionPath("kb", relativePath) === requestedPath ||
			ensureSectionPath("context", relativePath) === requestedPath
		);
	}

	return false;
};

export const findArtifactByRequestedPath = <
	T extends Pick<ArtifactRecord, "path" | "storageRoot">,
>(
	directories: ProjectDirectories,
	artifacts: readonly T[],
	requestedPath: string,
): T | null => {
	let exactMatch: T | null = null;
	let canonicalMatch: T | null = null;
	let legacyAliasMatch: T | null = null;

	for (const artifact of artifacts) {
		if (artifact.path === requestedPath) {
			exactMatch = artifact;
			break;
		}

		if (
			canonicalMatch === null &&
			toArtifactDisplayPath(directories, artifact) === requestedPath
		) {
			canonicalMatch = artifact;
			continue;
		}

		if (
			legacyAliasMatch === null &&
			matchesArtifactDisplayPath(directories, artifact, requestedPath)
		) {
			legacyAliasMatch = artifact;
		}
	}

	return exactMatch ?? canonicalMatch ?? legacyAliasMatch;
};

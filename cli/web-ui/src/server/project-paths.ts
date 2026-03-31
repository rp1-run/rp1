import { isAbsolute, join, relative, resolve } from "node:path";
import type { RunRecord } from "../../../shared/events.js";
import type { ArtifactRecord } from "../../../src/agent-tools/emit/database.js";

export interface ProjectDirectories {
	readonly projectRoot: string;
	readonly kbRoot: string;
	readonly workRoot: string;
}

export type ProjectSection = "work" | "kb";

interface SectionPath {
	readonly section: ProjectSection;
	readonly relativePath: string;
}

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

const ensureSectionPath = (
	prefix: ProjectSection,
	relativePath: string,
): string => (relativePath.length > 0 ? `${prefix}/${relativePath}` : prefix);

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
): readonly { section: ProjectSection; absolutePath: string }[] => [
	{ section: "work", absolutePath: directories.workRoot },
	{ section: "kb", absolutePath: directories.kbRoot },
];

export const parseProjectSectionPath = (
	filePath: string,
): SectionPath | null => {
	if (filePath.includes("..") || isAbsolute(filePath)) {
		return null;
	}

	if (filePath === "work" || filePath.startsWith("work/")) {
		return {
			section: "work",
			relativePath: filePath === "work" ? "" : filePath.slice("work/".length),
		};
	}

	if (filePath === "kb" || filePath.startsWith("kb/")) {
		return {
			section: "kb",
			relativePath: filePath === "kb" ? "" : filePath.slice("kb/".length),
		};
	}

	if (filePath === "context" || filePath.startsWith("context/")) {
		return {
			section: "kb",
			relativePath:
				filePath === "context" ? "" : filePath.slice("context/".length),
		};
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
			"work",
			trimTrailingSlash(relative(directories.workRoot, resolvedPath)),
		);
	}

	if (isWithinRoot(resolvedPath, directories.kbRoot)) {
		return ensureSectionPath(
			"kb",
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
	if (isAbsolute(artifact.path) || artifact.storageRoot === "absolute") {
		return artifact.path;
	}

	if (artifact.storageRoot === "work_dir") {
		return ensureSectionPath(
			"work",
			trimTrailingSlash(normalizeStoredWorkRelativePath(artifact.path)),
		);
	}

	const absolutePath = resolve(directories.projectRoot, artifact.path);
	const sectionPath = toProjectSectionPath(directories, absolutePath);
	if (sectionPath) {
		return sectionPath;
	}

	return artifact.path;
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
	toArtifactDisplayPath(directories, artifact) === requestedPath;

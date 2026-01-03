import { join } from "node:path";
import { chainTE, pipe, type TaskEither, tryCatch } from "../lib/fp";

export interface Project {
	path: string;
	name: string;
	charterPath: string | null;
	hasWork: boolean;
	hasContext: boolean;
}

export type ProjectError =
	| { _tag: "DirectoryNotFound"; path: string }
	| { _tag: "NotRP1Project"; path: string; reason: string }
	| { _tag: "MissingSubdirectory"; path: string; directory: string }
	| { _tag: "FileSystemError"; path: string; message: string };

async function checkDirectoryExists(dirPath: string): Promise<boolean> {
	try {
		await Array.fromAsync(
			new Bun.Glob("*").scan({ cwd: dirPath, onlyFiles: false, dot: true }),
		);
		return true;
	} catch {
		return false;
	}
}

export function validateProject(
	basePath: string,
): TaskEither<ProjectError, string> {
	return tryCatch(
		async () => {
			const rp1Path = join(basePath, ".rp1");
			const rp1Exists = await checkDirectoryExists(rp1Path);

			if (!rp1Exists) {
				throw {
					_tag: "NotRP1Project" as const,
					path: basePath,
					reason: ".rp1/ directory not found",
				};
			}

			const workPath = join(rp1Path, "work");
			const workExists = await checkDirectoryExists(workPath);

			if (!workExists) {
				throw {
					_tag: "MissingSubdirectory" as const,
					path: basePath,
					directory: "work",
				};
			}

			const contextPath = join(rp1Path, "context");
			const contextExists = await checkDirectoryExists(contextPath);

			if (!contextExists) {
				throw {
					_tag: "MissingSubdirectory" as const,
					path: basePath,
					directory: "context",
				};
			}

			return basePath;
		},
		(error): ProjectError => {
			if (typeof error === "object" && error !== null && "_tag" in error) {
				return error as ProjectError;
			}
			return {
				_tag: "FileSystemError",
				path: basePath,
				message: String(error),
			};
		},
	);
}

export function getProjectMetadata(
	basePath: string,
): TaskEither<ProjectError, Project> {
	return pipe(
		validateProject(basePath),
		chainTE(() =>
			tryCatch(
				async () => {
					// Always use directory name for project display
					const name = basePath.split("/").pop() ?? "unknown";
					const charterPath = join(basePath, ".rp1", "work", "charter.md");

					const charterFile = Bun.file(charterPath);
					const charterExists = await charterFile.exists();

					const project: Project = {
						path: basePath,
						name,
						charterPath: charterExists ? charterPath : null,
						hasWork: true,
						hasContext: true,
					};

					return project;
				},
				(error): ProjectError => ({
					_tag: "FileSystemError",
					path: basePath,
					message: String(error),
				}),
			),
		),
	);
}

export function formatProjectError(error: ProjectError): string {
	switch (error._tag) {
		case "DirectoryNotFound":
			return `Directory not found: ${error.path}`;
		case "NotRP1Project":
			return `Not an rp1 project: ${error.reason}\n  Path: ${error.path}`;
		case "MissingSubdirectory":
			return `Missing required directory: .rp1/${error.directory}/\n  Path: ${error.path}`;
		case "FileSystemError":
			return `File system error: ${error.message}\n  Path: ${error.path}`;
	}
}

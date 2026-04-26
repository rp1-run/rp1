import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, join } from "node:path";
import { parse } from "yaml";
import type {
	WorkSearchHitMetadata,
	WorkSearchProjectScope,
} from "./models.js";

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;

interface ArtifactMetadataRow {
	doc_id: string | null;
	run_id: string | null;
	feature: string | null;
	step: string | null;
	workflow: string | null;
}

export interface WorkSearchMetadataInput {
	readonly project: WorkSearchProjectScope;
	readonly relativePath: string;
	readonly content: string;
	readonly artifactLookup?: CanonicalArtifactMetadataLookup;
}

export interface CanonicalArtifactMetadataLookup {
	readonly lookup: (input: {
		readonly project: WorkSearchProjectScope;
		readonly relativePath: string;
		readonly docId?: string;
	}) => WorkSearchHitMetadata | null;
	readonly close: () => void;
}

const getDefaultEmitDbPath = (): string =>
	process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

const asNonEmptyString = (value: unknown): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
};

const compactMetadata = (
	metadata: WorkSearchHitMetadata,
): WorkSearchHitMetadata => ({
	...(metadata.docId ? { docId: metadata.docId } : {}),
	...(metadata.runId ? { runId: metadata.runId } : {}),
	...(metadata.workflow ? { workflow: metadata.workflow } : {}),
	...(metadata.feature ? { feature: metadata.feature } : {}),
	...(metadata.step ? { step: metadata.step } : {}),
	...(metadata.title ? { title: metadata.title } : {}),
});

const parseFrontmatter = (
	content: string,
): { readonly frontmatter: Record<string, unknown>; readonly body: string } => {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	try {
		return {
			frontmatter: (parse(match[1]) ?? {}) as Record<string, unknown>,
			body: content.slice(match[0].length),
		};
	} catch {
		return { frontmatter: {}, body: content.slice(match[0].length) };
	}
};

const titleFromFirstHeading = (body: string): string | undefined => {
	for (const line of body.split(/\r?\n/)) {
		const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
		if (match) {
			return match[1].trim();
		}
	}

	return undefined;
};

const titleFromPath = (relativePath: string): string | undefined => {
	const filename = basename(relativePath, extname(relativePath));
	const title = filename
		.split(/[-_]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");

	return title.length > 0 ? title : undefined;
};

const metadataFromFrontmatter = (
	frontmatter: Record<string, unknown>,
): WorkSearchHitMetadata =>
	compactMetadata({
		docId:
			asNonEmptyString(frontmatter.rp1_doc_id) ??
			asNonEmptyString(frontmatter.doc_id),
		runId:
			asNonEmptyString(frontmatter.rp1_run_id) ??
			asNonEmptyString(frontmatter.run_id),
		workflow:
			asNonEmptyString(frontmatter.workflow) ??
			asNonEmptyString(frontmatter.flow),
		feature:
			asNonEmptyString(frontmatter.feature) ??
			asNonEmptyString(frontmatter.feature_id),
		step: asNonEmptyString(frontmatter.step),
		title:
			asNonEmptyString(frontmatter.title) ?? asNonEmptyString(frontmatter.name),
	});

const metadataFromPath = (relativePath: string): WorkSearchHitMetadata => {
	const parts = relativePath.split("/");
	const filename = basename(relativePath, extname(relativePath));

	return compactMetadata({
		feature: parts[0] === "features" ? parts[1] : undefined,
		step: filename.length > 0 ? filename : undefined,
		title: titleFromPath(relativePath),
	});
};

const rowToMetadata = (
	row: ArtifactMetadataRow | null,
): WorkSearchHitMetadata =>
	compactMetadata({
		docId: row?.doc_id ?? undefined,
		runId: row?.run_id ?? undefined,
		workflow: row?.workflow ?? undefined,
		feature: row?.feature ?? undefined,
		step: row?.step ?? undefined,
	});

const queryArtifactByPath = (
	db: Database,
	project: WorkSearchProjectScope,
	relativePath: string,
): WorkSearchHitMetadata | null => {
	const row = db
		.prepare(
			`
			SELECT
				a.doc_id,
				a.run_id,
				a.feature,
				a.step,
				r.flow AS workflow
			FROM artifacts a
			LEFT JOIN runs r ON r.id = a.run_id
			WHERE a.storage_root = 'work_dir'
				AND a.path = $relativePath
				AND (a.project_id = $projectId OR a.project_path = $projectRoot)
			ORDER BY a.created_at DESC
			LIMIT 1
			`,
		)
		.get({
			$relativePath: relativePath,
			$projectId: project.projectId,
			$projectRoot: project.projectRoot,
		}) as ArtifactMetadataRow | null;

	return row ? rowToMetadata(row) : null;
};

const queryArtifactByDocId = (
	db: Database,
	project: WorkSearchProjectScope,
	docId: string,
): WorkSearchHitMetadata | null => {
	const row = db
		.prepare(
			`
			SELECT
				a.doc_id,
				a.run_id,
				a.feature,
				a.step,
				r.flow AS workflow
			FROM artifacts a
			LEFT JOIN runs r ON r.id = a.run_id
			WHERE a.doc_id = $docId
				AND (a.project_id = $projectId OR a.project_path = $projectRoot)
			ORDER BY a.created_at DESC
			LIMIT 1
			`,
		)
		.get({
			$docId: docId,
			$projectId: project.projectId,
			$projectRoot: project.projectRoot,
		}) as ArtifactMetadataRow | null;

	return row ? rowToMetadata(row) : null;
};

export const createCanonicalArtifactMetadataLookup = (
	dbPath: string = getDefaultEmitDbPath(),
): CanonicalArtifactMetadataLookup => {
	if (!existsSync(dbPath)) {
		return {
			lookup: () => null,
			close: () => {},
		};
	}

	let db: Database | null = null;

	try {
		db = new Database(dbPath, { readonly: true, create: false });
	} catch {
		return {
			lookup: () => null,
			close: () => {},
		};
	}

	return {
		lookup: (input) => {
			if (!db) {
				return null;
			}

			try {
				return (
					queryArtifactByPath(db, input.project, input.relativePath) ??
					(input.docId
						? queryArtifactByDocId(db, input.project, input.docId)
						: null)
				);
			} catch {
				return null;
			}
		},
		close: () => {
			try {
				db?.close();
			} catch {}
			db = null;
		},
	};
};

export const extractWorkSearchMetadata = (
	input: WorkSearchMetadataInput,
): WorkSearchHitMetadata => {
	const parsed = parseFrontmatter(input.content);
	const frontmatterMetadata = metadataFromFrontmatter(parsed.frontmatter);
	const headingTitle = titleFromFirstHeading(parsed.body);
	const canonicalMetadata =
		input.artifactLookup?.lookup({
			project: input.project,
			relativePath: input.relativePath,
			docId: frontmatterMetadata.docId,
		}) ?? {};
	const pathMetadata = metadataFromPath(input.relativePath);

	return compactMetadata({
		...pathMetadata,
		...canonicalMetadata,
		...frontmatterMetadata,
		title:
			frontmatterMetadata.title ??
			headingTitle ??
			canonicalMetadata.title ??
			pathMetadata.title,
	});
};

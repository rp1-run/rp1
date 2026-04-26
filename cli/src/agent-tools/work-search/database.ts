import { Database } from "bun:sqlite";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type {
	WorkSearchHitMetadata,
	WorkSearchProjectScope,
} from "./models.js";

const WORK_SEARCH_SCHEMA_VERSION = 1;

const dbInstances = new Map<string, Database>();

interface SchemaVersionRow {
	version: number;
}

interface WorkDocumentRow {
	id: number;
	project_id: string;
	relative_path: string;
	display_path: string;
	content_hash: string;
	size_bytes: number;
	mtime_ms: number;
	doc_id: string | null;
	run_id: string | null;
	workflow: string | null;
	feature: string | null;
	step: string | null;
	title: string | null;
	indexed_at: string;
}

interface WorkSearchQueryResultRow extends WorkDocumentRow {
	chunk_id: number;
	chunk_index: number;
	heading: string | null;
	start_line: number;
	end_line: number;
	score: number;
	snippet: string;
}

export interface WorkSearchDocumentInput {
	readonly project: WorkSearchProjectScope;
	readonly relativePath: string;
	readonly displayPath: string;
	readonly contentHash: string;
	readonly sizeBytes: number;
	readonly mtimeMs: number;
	readonly metadata?: WorkSearchHitMetadata;
}

export interface WorkSearchChunkInput {
	readonly chunkIndex: number;
	readonly heading?: string;
	readonly content: string;
	readonly startLine: number;
	readonly endLine: number;
}

export interface WorkSearchDocumentRecord {
	readonly id: number;
	readonly projectId: string;
	readonly relativePath: string;
	readonly displayPath: string;
	readonly contentHash: string;
	readonly sizeBytes: number;
	readonly mtimeMs: number;
	readonly metadata: WorkSearchHitMetadata;
	readonly indexedAt: string;
}

export interface WorkSearchDocumentUpsertResult {
	readonly document: WorkSearchDocumentRecord;
	readonly chunkCount: number;
}

export interface WorkSearchQueryOptions {
	readonly projectId: string;
	readonly ftsQuery: string;
	readonly limit: number;
}

export interface WorkSearchQueryRow {
	readonly documentId: number;
	readonly chunkId: number;
	readonly chunkIndex: number;
	readonly projectId: string;
	readonly relativePath: string;
	readonly displayPath: string;
	readonly score: number;
	readonly snippet: string;
	readonly metadata: WorkSearchHitMetadata;
	readonly chunk: {
		readonly heading?: string;
		readonly startLine: number;
		readonly endLine: number;
	};
}

const WORK_SEARCH_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS schema_version (
	version INTEGER NOT NULL
);

DELETE FROM schema_version;
INSERT INTO schema_version (version) VALUES (${WORK_SEARCH_SCHEMA_VERSION});

CREATE TABLE IF NOT EXISTS project_scope (
	project_id TEXT PRIMARY KEY NOT NULL,
	project_root TEXT NOT NULL,
	work_root TEXT NOT NULL,
	indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS work_documents (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	project_id TEXT NOT NULL REFERENCES project_scope(project_id) ON DELETE CASCADE,
	relative_path TEXT NOT NULL,
	display_path TEXT NOT NULL,
	content_hash TEXT NOT NULL,
	size_bytes INTEGER NOT NULL,
	mtime_ms INTEGER NOT NULL,
	doc_id TEXT DEFAULT NULL,
	run_id TEXT DEFAULT NULL,
	workflow TEXT DEFAULT NULL,
	feature TEXT DEFAULT NULL,
	step TEXT DEFAULT NULL,
	title TEXT DEFAULT NULL,
	indexed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_documents_project_path
	ON work_documents(project_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_work_documents_project_doc_id
	ON work_documents(project_id, doc_id);

CREATE TABLE IF NOT EXISTS work_chunks (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	document_id INTEGER NOT NULL REFERENCES work_documents(id) ON DELETE CASCADE,
	chunk_index INTEGER NOT NULL,
	start_line INTEGER NOT NULL,
	end_line INTEGER NOT NULL,
	title TEXT DEFAULT NULL,
	heading TEXT DEFAULT NULL,
	content TEXT NOT NULL,
	relative_path TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_work_chunks_document_index
	ON work_chunks(document_id, chunk_index);

CREATE VIRTUAL TABLE IF NOT EXISTS work_chunks_fts USING fts5(
	title,
	heading,
	content,
	relative_path,
	content='work_chunks',
	content_rowid='id',
	tokenize='unicode61'
);

CREATE TRIGGER IF NOT EXISTS work_chunks_ai AFTER INSERT ON work_chunks BEGIN
	INSERT INTO work_chunks_fts(rowid, title, heading, content, relative_path)
	VALUES (new.id, new.title, new.heading, new.content, new.relative_path);
END;

CREATE TRIGGER IF NOT EXISTS work_chunks_ad AFTER DELETE ON work_chunks BEGIN
	INSERT INTO work_chunks_fts(work_chunks_fts, rowid, title, heading, content, relative_path)
	VALUES ('delete', old.id, old.title, old.heading, old.content, old.relative_path);
END;

CREATE TRIGGER IF NOT EXISTS work_chunks_au AFTER UPDATE ON work_chunks BEGIN
	INSERT INTO work_chunks_fts(work_chunks_fts, rowid, title, heading, content, relative_path)
	VALUES ('delete', old.id, old.title, old.heading, old.content, old.relative_path);
	INSERT INTO work_chunks_fts(rowid, title, heading, content, relative_path)
	VALUES (new.id, new.title, new.heading, new.content, new.relative_path);
END;
`;

const DROP_WORK_SEARCH_SCHEMA_SQL = `
DROP TRIGGER IF EXISTS work_chunks_ai;
DROP TRIGGER IF EXISTS work_chunks_ad;
DROP TRIGGER IF EXISTS work_chunks_au;
DROP TABLE IF EXISTS work_chunks_fts;
DROP TABLE IF EXISTS work_chunks;
DROP TABLE IF EXISTS work_documents;
DROP TABLE IF EXISTS project_scope;
DROP TABLE IF EXISTS schema_version;
`;

export const getWorkSearchDbPath = (projectRoot: string): string =>
	join(projectRoot, ".rp1", "search.db");

const toRuntimeError = (operation: string, error: unknown): CLIError =>
	runtimeError(
		`${operation}: ${error instanceof Error ? error.message : String(error)}`,
		error,
	);

const transaction = <T>(db: Database, operation: () => T): T => {
	db.exec("BEGIN IMMEDIATE TRANSACTION");
	try {
		const result = operation();
		db.exec("COMMIT");
		return result;
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}
};

const rebuildSchema = (db: Database): void => {
	db.exec("PRAGMA foreign_keys = OFF;");
	try {
		transaction(db, () => {
			db.exec(DROP_WORK_SEARCH_SCHEMA_SQL);
			db.exec(WORK_SEARCH_SCHEMA_SQL);
		});
	} finally {
		db.exec("PRAGMA foreign_keys = ON;");
	}
};

export const migrateWorkSearchSchema = (db: Database): void => {
	const versionTable = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'",
		)
		.get() as { name: string } | null;

	if (!versionTable) {
		rebuildSchema(db);
		return;
	}

	const versionRow = db
		.prepare("SELECT version FROM schema_version LIMIT 1")
		.get() as SchemaVersionRow | null;

	if (versionRow?.version !== WORK_SEARCH_SCHEMA_VERSION) {
		rebuildSchema(db);
		return;
	}

	db.exec(WORK_SEARCH_SCHEMA_SQL);
};

export const getWorkSearchDatabase = (
	projectRoot: string,
	dbPath: string = getWorkSearchDbPath(projectRoot),
): TE.TaskEither<CLIError, Database> =>
	TE.tryCatch(
		async () => {
			const cached = dbInstances.get(dbPath);
			if (cached) {
				return cached;
			}

			await mkdir(dirname(dbPath), { recursive: true });

			const db = new Database(dbPath, { create: true });
			db.exec("PRAGMA journal_mode = WAL;");
			db.exec("PRAGMA busy_timeout = 5000;");
			db.exec("PRAGMA foreign_keys = ON;");
			migrateWorkSearchSchema(db);

			dbInstances.set(dbPath, db);
			return db;
		},
		(error) =>
			toRuntimeError("Failed to initialize work-search database", error),
	);

export const closeWorkSearchDatabase = (dbPath?: string): void => {
	if (dbPath) {
		const db = dbInstances.get(dbPath);
		if (db) {
			db.close();
			dbInstances.delete(dbPath);
		}
		return;
	}

	for (const db of dbInstances.values()) {
		db.close();
	}
	dbInstances.clear();
};

export const withWorkSearchDatabase = <T>(
	projectRoot: string,
	operation: (db: Database) => T,
	dbPath?: string,
): TE.TaskEither<CLIError, T> =>
	pipe(
		getWorkSearchDatabase(projectRoot, dbPath),
		TE.chain((db) =>
			TE.tryCatch(
				async () => operation(db),
				(error) =>
					toRuntimeError("Work-search database operation failed", error),
			),
		),
	);

const metadataParams = (
	metadata: WorkSearchHitMetadata | undefined,
): {
	readonly $docId: string | null;
	readonly $runId: string | null;
	readonly $workflow: string | null;
	readonly $feature: string | null;
	readonly $step: string | null;
	readonly $title: string | null;
} => ({
	$docId: metadata?.docId ?? null,
	$runId: metadata?.runId ?? null,
	$workflow: metadata?.workflow ?? null,
	$feature: metadata?.feature ?? null,
	$step: metadata?.step ?? null,
	$title: metadata?.title ?? null,
});

const rowToDocument = (row: WorkDocumentRow): WorkSearchDocumentRecord => ({
	id: row.id,
	projectId: row.project_id,
	relativePath: row.relative_path,
	displayPath: row.display_path,
	contentHash: row.content_hash,
	sizeBytes: row.size_bytes,
	mtimeMs: row.mtime_ms,
	metadata: {
		...(row.doc_id ? { docId: row.doc_id } : {}),
		...(row.run_id ? { runId: row.run_id } : {}),
		...(row.workflow ? { workflow: row.workflow } : {}),
		...(row.feature ? { feature: row.feature } : {}),
		...(row.step ? { step: row.step } : {}),
		...(row.title ? { title: row.title } : {}),
	},
	indexedAt: row.indexed_at,
});

const rowToQueryResult = (
	row: WorkSearchQueryResultRow,
): WorkSearchQueryRow => ({
	documentId: row.id,
	chunkId: row.chunk_id,
	chunkIndex: row.chunk_index,
	projectId: row.project_id,
	relativePath: row.relative_path,
	displayPath: row.display_path,
	score: row.score,
	snippet: row.snippet,
	metadata: rowToDocument(row).metadata,
	chunk: {
		...(row.heading ? { heading: row.heading } : {}),
		startLine: row.start_line,
		endLine: row.end_line,
	},
});

export const upsertProjectScope = (
	db: Database,
	project: WorkSearchProjectScope,
): void => {
	db.prepare(
		`
		INSERT INTO project_scope (project_id, project_root, work_root, indexed_at)
		VALUES ($projectId, $projectRoot, $workRoot, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
		ON CONFLICT(project_id) DO UPDATE SET
			project_root = excluded.project_root,
			work_root = excluded.work_root,
			indexed_at = excluded.indexed_at
		`,
	).run({
		$projectId: project.projectId,
		$projectRoot: project.projectRoot,
		$workRoot: project.workRoot,
	});
};

export const getWorkDocument = (
	db: Database,
	projectId: string,
	relativePath: string,
): WorkSearchDocumentRecord | null => {
	const row = db
		.prepare(
			`
			SELECT *
			FROM work_documents
			WHERE project_id = $projectId AND relative_path = $relativePath
			`,
		)
		.get({
			$projectId: projectId,
			$relativePath: relativePath,
		}) as WorkDocumentRow | null;

	return row ? rowToDocument(row) : null;
};

export const updateWorkDocumentMetadata = (
	db: Database,
	input: WorkSearchDocumentInput,
): WorkSearchDocumentRecord | null =>
	transaction(db, () => {
		const params = {
			$projectId: input.project.projectId,
			$relativePath: input.relativePath,
			$displayPath: input.displayPath,
			$sizeBytes: input.sizeBytes,
			$mtimeMs: input.mtimeMs,
			...metadataParams(input.metadata),
		};
		const row = db
			.prepare(
				`
				UPDATE work_documents
				SET
					display_path = $displayPath,
					size_bytes = $sizeBytes,
					mtime_ms = $mtimeMs,
					doc_id = $docId,
					run_id = $runId,
					workflow = $workflow,
					feature = $feature,
					step = $step,
					title = $title,
					indexed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
				WHERE project_id = $projectId AND relative_path = $relativePath
				RETURNING *
				`,
			)
			.get(params) as WorkDocumentRow | null;

		if (!row) {
			return null;
		}

		db.prepare(
			`
			UPDATE work_chunks
			SET title = $title,
				relative_path = $relativePath
			WHERE document_id = $documentId
			`,
		).run({
			$documentId: row.id,
			$title: input.metadata?.title ?? null,
			$relativePath: input.relativePath,
		});

		return rowToDocument(row);
	});

export const replaceWorkDocument = (
	db: Database,
	input: WorkSearchDocumentInput,
	chunks: readonly WorkSearchChunkInput[],
): WorkSearchDocumentUpsertResult =>
	transaction(db, () => {
		upsertProjectScope(db, input.project);

		const row = db
			.prepare(
				`
				INSERT INTO work_documents (
					project_id,
					relative_path,
					display_path,
					content_hash,
					size_bytes,
					mtime_ms,
					doc_id,
					run_id,
					workflow,
					feature,
					step,
					title,
					indexed_at
				)
				VALUES (
					$projectId,
					$relativePath,
					$displayPath,
					$contentHash,
					$sizeBytes,
					$mtimeMs,
					$docId,
					$runId,
					$workflow,
					$feature,
					$step,
					$title,
					strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
				)
				ON CONFLICT(project_id, relative_path) DO UPDATE SET
					display_path = excluded.display_path,
					content_hash = excluded.content_hash,
					size_bytes = excluded.size_bytes,
					mtime_ms = excluded.mtime_ms,
					doc_id = excluded.doc_id,
					run_id = excluded.run_id,
					workflow = excluded.workflow,
					feature = excluded.feature,
					step = excluded.step,
					title = excluded.title,
					indexed_at = excluded.indexed_at
				RETURNING *
				`,
			)
			.get({
				$projectId: input.project.projectId,
				$relativePath: input.relativePath,
				$displayPath: input.displayPath,
				$contentHash: input.contentHash,
				$sizeBytes: input.sizeBytes,
				$mtimeMs: input.mtimeMs,
				...metadataParams(input.metadata),
			}) as WorkDocumentRow;

		db.prepare("DELETE FROM work_chunks WHERE document_id = $documentId").run({
			$documentId: row.id,
		});

		const insertChunk = db.prepare(
			`
			INSERT INTO work_chunks (
				document_id,
				chunk_index,
				start_line,
				end_line,
				title,
				heading,
				content,
				relative_path
			)
			VALUES (
				$documentId,
				$chunkIndex,
				$startLine,
				$endLine,
				$title,
				$heading,
				$content,
				$relativePath
			)
			`,
		);

		for (const chunk of chunks) {
			insertChunk.run({
				$documentId: row.id,
				$chunkIndex: chunk.chunkIndex,
				$startLine: chunk.startLine,
				$endLine: chunk.endLine,
				$title: input.metadata?.title ?? null,
				$heading: chunk.heading ?? null,
				$content: chunk.content,
				$relativePath: input.relativePath,
			});
		}

		return {
			document: rowToDocument(row),
			chunkCount: chunks.length,
		};
	});

export const deleteWorkDocument = (
	db: Database,
	projectId: string,
	relativePath: string,
): boolean => {
	const result = db
		.prepare(
			`
			DELETE FROM work_documents
			WHERE project_id = $projectId AND relative_path = $relativePath
			`,
		)
		.run({
			$projectId: projectId,
			$relativePath: relativePath,
		});

	return result.changes > 0;
};

export const deleteMissingWorkDocuments = (
	db: Database,
	projectId: string,
	presentRelativePaths: readonly string[],
): number =>
	transaction(db, () => {
		const rows = db
			.prepare(
				`
				SELECT relative_path
				FROM work_documents
				WHERE project_id = $projectId
				`,
			)
			.all({ $projectId: projectId }) as { relative_path: string }[];

		const present = new Set(presentRelativePaths);
		let deletedCount = 0;

		for (const row of rows) {
			if (!present.has(row.relative_path)) {
				const deleted = deleteWorkDocument(db, projectId, row.relative_path);
				if (deleted) {
					deletedCount += 1;
				}
			}
		}

		return deletedCount;
	});

export const searchWorkChunks = (
	db: Database,
	options: WorkSearchQueryOptions,
): readonly WorkSearchQueryRow[] => {
	const rows = db
		.prepare(
			`
			SELECT
				d.id,
				d.project_id,
				d.relative_path,
				d.display_path,
				d.content_hash,
				d.size_bytes,
				d.mtime_ms,
				d.doc_id,
				d.run_id,
				d.workflow,
				d.feature,
				d.step,
				d.title,
				d.indexed_at,
				c.id AS chunk_id,
				c.chunk_index,
				c.heading,
				c.start_line,
				c.end_line,
				bm25(work_chunks_fts) AS score,
				snippet(work_chunks_fts, 2, '<mark>', '</mark>', '...', 32) AS snippet
			FROM work_chunks_fts
			JOIN work_chunks c ON c.id = work_chunks_fts.rowid
			JOIN work_documents d ON d.id = c.document_id
			WHERE work_chunks_fts MATCH $ftsQuery
				AND d.project_id = $projectId
			ORDER BY score ASC, d.relative_path ASC, c.chunk_index ASC
			LIMIT $limit
			`,
		)
		.all({
			$ftsQuery: options.ftsQuery,
			$projectId: options.projectId,
			$limit: options.limit,
		}) as WorkSearchQueryResultRow[];

	return rows.map(rowToQueryResult);
};

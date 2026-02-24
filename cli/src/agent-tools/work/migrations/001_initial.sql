-- Migration: Initial schema
-- Version: 1
-- Description: Documents the current schema for status_updates table.
-- This migration is for documentation purposes - the schema is created inline in database.ts.

-- Schema created by database.ts getDatabase():
CREATE TABLE IF NOT EXISTS status_updates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    task TEXT,
    status TEXT NOT NULL CHECK(status IN ('started', 'in_progress', 'completed', 'failed')),
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_status_project ON status_updates(project_path);
CREATE INDEX IF NOT EXISTS idx_status_created ON status_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_status_feature ON status_updates(project_path, feature);

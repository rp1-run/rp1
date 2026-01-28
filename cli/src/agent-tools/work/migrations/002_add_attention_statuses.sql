-- Migration: Add waiting-input and needs-review status values
-- Version: 2
-- Description: Extends CHECK constraint to support attention-state statuses

-- SQLite doesn't support ALTER CHECK constraint directly
-- We recreate the table with the new constraint

-- Create new table with extended CHECK constraint
CREATE TABLE status_updates_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_path TEXT NOT NULL,
    feature TEXT NOT NULL,
    task TEXT,
    status TEXT NOT NULL CHECK(status IN ('started', 'in_progress', 'waiting-input', 'needs-review', 'completed', 'failed')),
    message TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Copy existing data
INSERT INTO status_updates_new (id, project_path, feature, task, status, message, metadata, created_at)
SELECT id, project_path, feature, task, status, message, metadata, created_at
FROM status_updates;

-- Drop old table
DROP TABLE status_updates;

-- Rename new table
ALTER TABLE status_updates_new RENAME TO status_updates;

-- Recreate indexes
CREATE INDEX idx_status_project ON status_updates(project_path);
CREATE INDEX idx_status_created ON status_updates(created_at);
CREATE INDEX idx_status_feature ON status_updates(project_path, feature);

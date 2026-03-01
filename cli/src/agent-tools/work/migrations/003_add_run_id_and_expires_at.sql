-- Migration: Add run_id and expires_at columns for workflow run isolation and stale row cleanup
-- Version: 3
-- Description: Adds run_id for per-invocation workflow tracking and expires_at for TTL-based
--   stale row pruning. Both columns are nullable for backward compatibility: NULL run_id uses
--   latest-by-timestamp fallback; NULL expires_at means the row never expires.

ALTER TABLE status_updates ADD COLUMN run_id TEXT;
ALTER TABLE status_updates ADD COLUMN expires_at TEXT;

CREATE INDEX idx_status_run_id ON status_updates(project_path, feature, run_id);
CREATE INDEX idx_status_expires_at ON status_updates(expires_at);

-- Migration: Add workflow column for persisting the state machine / skill name
-- Version: 4
-- Description: Adds nullable workflow TEXT column so the workflow name passed via
--   --workflow is stored alongside each status update row. Previously the value was
--   validated but never written to the database, causing extractCommand() in the
--   web UI to always fall back to "/build".

ALTER TABLE status_updates ADD COLUMN workflow TEXT;

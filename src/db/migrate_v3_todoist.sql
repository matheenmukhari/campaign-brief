-- Migration v3: Todoist integration support
-- Run once on any existing database:
--   psql campaign_brief < src/db/migrate_v3_todoist.sql

-- User Todoist tokens (never returned in API responses)
ALTER TABLE users ADD COLUMN IF NOT EXISTS todoist_token TEXT;

-- tasks.team was NOT NULL — manual task builder doesn't require a team label
ALTER TABLE tasks ALTER COLUMN team DROP NOT NULL;

-- Per-task push error storage for retry flow
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS push_error TEXT;

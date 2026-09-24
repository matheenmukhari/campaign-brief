-- Migration v4: QA checklist support
-- Run once on any existing database:
--   psql campaign_brief < src/db/migrate_v4_qa.sql

-- Per-brief QA checklist state: { item_id: true/false, ... }
ALTER TABLE briefs ADD COLUMN IF NOT EXISTS qa_checklist JSONB NOT NULL DEFAULT '{}'::jsonb;

-- New status value: qa_complete (after all QA items are signed off)
-- No ALTER needed — status is VARCHAR(30), any string value is valid.
-- Adding a comment to the schema for documentation:
COMMENT ON COLUMN briefs.status IS
  'draft, understanding_pending, understanding_confirmed,
   approval_stage_1/2/3, approved,
   review_round_1, review_round_2, review_complete,
   pushed_to_todoist, qa_complete, archived';

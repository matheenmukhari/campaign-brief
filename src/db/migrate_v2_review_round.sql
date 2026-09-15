-- Migration v2: add round column to comments
-- Run once on any existing database:
--   psql campaign_brief < src/db/migrate_v2_review_round.sql

ALTER TABLE comments ADD COLUMN IF NOT EXISTS round INT NOT NULL DEFAULT 1;

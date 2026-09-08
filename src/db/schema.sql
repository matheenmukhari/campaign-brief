-- ============================================================
-- SelectProperty Campaign Briefing App — Database Schema v1
-- ============================================================
-- Load this into PostgreSQL with:
--   psql campaign_brief < src/db/schema.sql

-- Drop existing tables (safe re-runs during development)
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS content_reviews CASCADE;
DROP TABLE IF EXISTS approvals CASCADE;
DROP TABLE IF EXISTS brief_data CASCADE;
DROP TABLE IF EXISTS briefs CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ============================================================
-- USERS — team members with login credentials
-- ============================================================
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(100) NOT NULL,
  initials      VARCHAR(4)   NOT NULL,
  role          VARCHAR(50)  NOT NULL,           -- content_exec, hom, ceo, creative, crm, social, arabic_qa
  region        VARCHAR(20)  NOT NULL,           -- UK, GCC, Global
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================================
-- BRIEFS — main campaign record
-- ============================================================
CREATE TABLE briefs (
  id               SERIAL PRIMARY KEY,
  brief_code       VARCHAR(20) UNIQUE NOT NULL,  -- e.g. SP-CB-2026-042
  name             VARCHAR(200) NOT NULL,
  mode             VARCHAR(10)  NOT NULL,         -- quick, full, custom
  campaign_type    VARCHAR(50),
  priority         VARCHAR(10),                   -- high, medium, low
  status           VARCHAR(30)  NOT NULL DEFAULT 'draft',
                   -- draft, understanding_pending, understanding_confirmed,
                   -- approval_stage_1, approval_stage_2, approval_stage_3,
                   -- review_round_1, review_round_2, approved, pushed_to_todoist, archived
  requester_id     INT REFERENCES users(id) ON DELETE RESTRICT,
  owner_id         INT REFERENCES users(id) ON DELETE RESTRICT,
  development_name VARCHAR(200),
  objective        TEXT,
  key_message      TEXT,
  regions          TEXT[],                        -- ['UK', 'GCC-EN', 'GCC-AR']
  channels         TEXT[],                        -- ['creative', 'email', 'paid']
  asset_type       TEXT,
  notes            TEXT,
  go_live_date     DATE,
  asset_deadline   DATE,
  end_date         DATE,
  requires_ceo     BOOLEAN NOT NULL DEFAULT FALSE,
  requires_arabic  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_briefs_status ON briefs(status);
CREATE INDEX idx_briefs_owner ON briefs(owner_id);
CREATE INDEX idx_briefs_requester ON briefs(requester_id);

-- ============================================================
-- BRIEF_DATA — all the extra section data (Full/Custom fields)
-- Stored as JSON so we don't need dozens of columns for optional fields
-- ============================================================
CREATE TABLE brief_data (
  brief_id   INT PRIMARY KEY REFERENCES briefs(id) ON DELETE CASCADE,
  data       JSONB NOT NULL DEFAULT '{}',       -- objectives, audience, localisation, KPIs, etc.
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- APPROVALS — the multi-stage approval chain
-- One row per approver per brief
-- ============================================================
CREATE TABLE approvals (
  id         SERIAL PRIMARY KEY,
  brief_id   INT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  approver_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  stage      INT NOT NULL,                        -- 1, 2, 3
  status     VARCHAR(20) NOT NULL DEFAULT 'pending',
                    -- pending, approved, revisions_requested, skipped
  comments   TEXT,
  severity   VARCHAR(10),                         -- minor, moderate, major (for revisions)
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_brief ON approvals(brief_id);
CREATE INDEX idx_approvals_approver ON approvals(approver_id);

-- ============================================================
-- CONTENT_REVIEWS — two-round review tracking
-- One row per reviewer per round per brief
-- ============================================================
CREATE TABLE content_reviews (
  id           SERIAL PRIMARY KEY,
  brief_id     INT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  reviewer_id  INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  round        INT NOT NULL,                      -- 1 or 2
  signed_off   BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at    TIMESTAMPTZ,
  UNIQUE(brief_id, reviewer_id, round)
);

CREATE INDEX idx_reviews_brief ON content_reviews(brief_id);

-- ============================================================
-- COMMENTS — feedback threads on briefs
-- ============================================================
CREATE TABLE comments (
  id         SERIAL PRIMARY KEY,
  brief_id   INT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  author_id  INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  section    VARCHAR(50),                          -- general, headline, cta, audience, creative, arabic
  body       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_comments_brief ON comments(brief_id);

-- ============================================================
-- TASKS — generated on approval, pushed to Todoist
-- ============================================================
CREATE TABLE tasks (
  id                 SERIAL PRIMARY KEY,
  brief_id           INT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  assignee_id        INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  team               VARCHAR(30) NOT NULL,          -- creative, crm, paid, social, global
  title              TEXT NOT NULL,
  due_offset_days    INT,                            -- e.g. 4 means "go-live minus 4"
  todoist_task_id    VARCHAR(50),                    -- populated after push
  todoist_project_id VARCHAR(50),
  pushed_at          TIMESTAMPTZ,
  is_selected        BOOLEAN NOT NULL DEFAULT TRUE,  -- included in push?
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_brief ON tasks(brief_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

-- ============================================================
-- AUDIT_LOG — every action on every brief (the revision log)
-- ============================================================
CREATE TABLE audit_log (
  id         SERIAL PRIMARY KEY,
  brief_id   INT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  actor_id   INT REFERENCES users(id) ON DELETE SET NULL,
  action     VARCHAR(50) NOT NULL,                -- created, submitted, approved, rejected, commented, pushed
  detail     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_brief ON audit_log(brief_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- Trigger: auto-update `updated_at` on row changes
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER briefs_updated_at BEFORE UPDATE ON briefs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER brief_data_updated_at BEFORE UPDATE ON brief_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

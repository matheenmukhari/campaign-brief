// ============================================================
// Brief routes — CRUD (Create, Read, Update, Delete) for briefs
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const authRequired = require('../middleware/authRequired');

const router = express.Router();

// All brief endpoints require login
router.use(authRequired);

// ── Helper: generate a unique brief code like SP-CB-2026-042 ──
async function generateBriefCode(client) {
  const year = new Date().getFullYear();
  // Find the highest existing sequence number for this year, then add 1
  // This avoids collisions when briefs have been deleted
  const { rows } = await client.query(
    `SELECT COALESCE(
       MAX(CAST(SUBSTRING(brief_code FROM '\\d+$') AS INT)),
       0
     ) AS max_num
     FROM briefs
     WHERE brief_code LIKE $1`,
    [`SP-CB-${year}-%`]
  );
  const nextNum = String(rows[0].max_num + 1).padStart(3, '0');
  return `SP-CB-${year}-${nextNum}`;
}

// ── Helper: log an action to the audit trail (same transaction client) ──
async function logAction(client, briefId, actorId, action, detail = null) {
  await client.query(
    `INSERT INTO audit_log (brief_id, actor_id, action, detail) VALUES ($1, $2, $3, $4)`,
    [briefId, actorId, action, detail]
  );
}

// ─────────────────────────────────────────────
// POST /api/briefs — create a new brief
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name, mode, campaign_type, priority, owner_id,
      development_name, objective, key_message,
      regions, channels, asset_type, notes,
      go_live_date, asset_deadline, end_date,
      requires_ceo, requires_arabic, data, approvers, reviewers, tasks,
    } = req.body;

    if (!name || !mode) {
      return res.status(400).json({ error: 'Name and mode are required' });
    }
    if (!['quick', 'full', 'custom'].includes(mode)) {
      return res.status(400).json({ error: 'Mode must be quick, full, or custom' });
    }
    if (!approvers || !Array.isArray(approvers) || approvers.length === 0) {
      return res.status(400).json({ error: 'At least one approver is required' });
    }

    await client.query('BEGIN');

    const briefCode = await generateBriefCode(client);

    const briefResult = await client.query(
      `INSERT INTO briefs (
         brief_code, name, mode, campaign_type, priority, status,
         requester_id, owner_id, development_name, objective, key_message,
         regions, channels, asset_type, notes,
         go_live_date, asset_deadline, end_date,
         requires_ceo, requires_arabic
       )
       VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING *`,
      [
        briefCode, name, mode, campaign_type || null, priority || null,
        req.user.id,
        owner_id || req.user.id,
        development_name || null, objective || null, key_message || null,
        regions || [], channels || [],
        asset_type || null, notes || null,
        go_live_date || null, asset_deadline || null, end_date || null,
        !!requires_ceo, !!requires_arabic,
      ]
    );
    const brief = briefResult.rows[0];

    const briefDataPayload = {
      ...(data || {}),
      approval_chain: approvers,
      ...(Array.isArray(reviewers) && reviewers.length ? { reviewers } : {}),
    };
    await client.query(
      `INSERT INTO brief_data (brief_id, data) VALUES ($1, $2)`,
      [brief.id, JSON.stringify(briefDataPayload)]
    );

    if (Array.isArray(tasks) && tasks.length > 0) {
      for (const task of tasks) {
        if (!task.title || !task.assignee_id) continue;
        await client.query(
          `INSERT INTO tasks (brief_id, assignee_id, title, due_offset_days, is_selected)
           VALUES ($1, $2, $3, $4, TRUE)`,
          [brief.id, task.assignee_id, task.title.trim(), task.due_offset_days || null]
        );
      }
    }

    await logAction(client, brief.id, req.user.id, 'created', `Brief created by ${req.user.name}`);

    await client.query('COMMIT');

    res.status(201).json({ brief });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create brief error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// GET /api/briefs/push-ready-count — count briefs at review_complete for the sidebar badge
// ─────────────────────────────────────────────
router.get('/push-ready-count', async (req, res) => {
  try {
    const { rows: [result] } = await pool.query(
      `SELECT COUNT(*)::int AS count FROM briefs WHERE status = 'review_complete'`
    );
    res.json({ count: result.count });
  } catch (err) {
    console.error('Push ready count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/briefs — list briefs
// Query params:
//   ?mine=true              — only briefs I own or requested
//   ?status=xxx             — filter by status
//   ?include_archived=true  — include archived briefs (hidden by default)
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { mine, status } = req.query;

    const where = [];
    const params = [];

    // Always hide archived briefs unless explicitly requested
    const showArchived = req.query.include_archived === 'true';
    if (!showArchived) {
      where.push(`b.status != 'archived'`);
    }

    if (mine === 'true') {
      where.push(`(b.requester_id = $${params.length + 1} OR b.owner_id = $${params.length + 1})`);
      params.push(req.user.id);
    }
    if (status) {
      where.push(`b.status = $${params.length + 1}`);
      params.push(status);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         b.*,
         r.name AS requester_name, r.initials AS requester_initials,
         o.name AS owner_name, o.initials AS owner_initials
       FROM briefs b
       LEFT JOIN users r ON r.id = b.requester_id
       LEFT JOIN users o ON o.id = b.owner_id
       ${whereClause}
       ORDER BY b.updated_at DESC
       LIMIT 100`,
      params
    );

    res.json({ briefs: rows });
  } catch (err) {
    console.error('List briefs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/briefs/:id — get one brief with all details
// ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
         b.*,
         r.name AS requester_name, r.initials AS requester_initials, r.email AS requester_email,
         o.name AS owner_name, o.initials AS owner_initials, o.email AS owner_email,
         bd.data AS extra_data
       FROM briefs b
       LEFT JOIN users r ON r.id = b.requester_id
       LEFT JOIN users o ON o.id = b.owner_id
       LEFT JOIN brief_data bd ON bd.brief_id = b.id
       WHERE b.id = $1`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: 'Brief not found' });
    }

    res.json({ brief: rows[0] });
  } catch (err) {
    console.error('Get brief error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// PATCH /api/briefs/:id — update a brief
// Only requester or owner can edit, only while draft or understanding_pending
// ─────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const existing = await client.query(
      `SELECT requester_id, owner_id, status FROM briefs WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Brief not found' });
    }
    const b = existing.rows[0];
    if (b.requester_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to edit this brief' });
    }

    if (b.status !== 'draft' && b.status !== 'understanding_pending') {
      return res.status(409).json({ error: 'Brief is locked — cannot edit at this stage' });
    }

    await client.query('BEGIN');

    const allowed = [
      'name', 'campaign_type', 'priority', 'owner_id',
      'development_name', 'objective', 'key_message',
      'regions', 'channels', 'asset_type', 'notes',
      'go_live_date', 'asset_deadline', 'end_date',
      'requires_ceo', 'requires_arabic',
    ];
    const updates = [];
    const params = [];
    for (const field of allowed) {
      if (field in req.body) {
        updates.push(`${field} = $${params.length + 1}`);
        params.push(req.body[field]);
      }
    }

    if (updates.length) {
      params.push(id);
      await client.query(
        `UPDATE briefs SET ${updates.join(', ')} WHERE id = $${params.length}`,
        params
      );
    }

    if (req.body.data) {
      await client.query(
        `INSERT INTO brief_data (brief_id, data) VALUES ($1, $2)
         ON CONFLICT (brief_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [id, JSON.stringify(req.body.data)]
      );
    }

    if (req.body.approvers !== undefined) {
      await client.query(
        `INSERT INTO brief_data (brief_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (brief_id) DO UPDATE
         SET data = brief_data.data || $2::jsonb, updated_at = NOW()`,
        [id, JSON.stringify({ approval_chain: req.body.approvers })]
      );
    }

    await logAction(client, id, req.user.id, 'updated', `Brief updated by ${req.user.name}`);

    await client.query('COMMIT');

    const { rows } = await pool.query(`SELECT * FROM briefs WHERE id = $1`, [id]);
    res.json({ brief: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update brief error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/briefs/:id/submit — draft → understanding_pending
// ─────────────────────────────────────────────
router.post('/:id/submit', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const existing = await client.query(
      `SELECT requester_id, status FROM briefs WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Brief not found' });
    }
    if (existing.rows[0].requester_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the requester can submit' });
    }
    if (existing.rows[0].status !== 'draft') {
      return res.status(409).json({ error: `Cannot submit — brief is ${existing.rows[0].status}` });
    }

    // Detect re-submission: prior approval records exist from a previous round
    const { rows: priorApprovals } = await client.query(
      `SELECT id FROM approvals WHERE brief_id = $1 LIMIT 1`,
      [id]
    );
    const isResubmission = priorApprovals.length > 0;

    await client.query('BEGIN');

    if (isResubmission) {
      // Load stored chain
      const { rows: [bd] } = await client.query(
        `SELECT data FROM brief_data WHERE brief_id = $1`,
        [id]
      );
      const chain = bd && bd.data && bd.data.approval_chain;
      if (!chain || !chain.length) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No approval chain defined for this brief' });
      }

      // Clear old approval records — clean slate for new round
      await client.query(`DELETE FROM approvals WHERE brief_id = $1`, [id]);

      // Jump straight to approval_stage_1
      await client.query(`UPDATE briefs SET status = 'approval_stage_1' WHERE id = $1`, [id]);

      for (let i = 0; i < chain.length; i++) {
        await client.query(
          `INSERT INTO approvals (brief_id, approver_id, stage, status) VALUES ($1, $2, $3, 'pending')`,
          [id, chain[i], i + 1]
        );
      }

      // Flag in brief_data so the UI can suppress the understanding block
      await client.query(
        `INSERT INTO brief_data (brief_id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (brief_id) DO UPDATE
         SET data = brief_data.data || $2::jsonb, updated_at = NOW()`,
        [id, JSON.stringify({ resubmitted: true })]
      );

      await logAction(client, id, req.user.id, 'resubmitted',
        `Brief resubmitted after revisions — approval chain restarted from stage 1`);

      await client.query('COMMIT');
      return res.json({ ok: true, message: 'Brief resubmitted — approval chain restarted' });
    }

    // First submission — go through understanding confirmation as normal
    await client.query(
      `UPDATE briefs SET status = 'understanding_pending' WHERE id = $1`,
      [id]
    );

    await logAction(client, id, req.user.id, 'submitted', 'Brief submitted for understanding confirmation');

    await client.query('COMMIT');

    res.json({ ok: true, message: 'Brief submitted' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Submit brief error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// DELETE /api/briefs/:id — hard delete (drafts only)
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await pool.query(
      `SELECT requester_id, owner_id, status FROM briefs WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Brief not found' });
    }
    const b = existing.rows[0];

    if (b.requester_id !== req.user.id && b.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have permission to delete this brief' });
    }

    if (b.status !== 'draft') {
      return res.status(409).json({
        error: 'Cannot delete — brief is not a draft. Archive it instead.',
      });
    }

    // Cascade delete removes related brief_data, approvals, comments, tasks, audit_log
    await pool.query(`DELETE FROM briefs WHERE id = $1`, [id]);

    res.json({ ok: true, message: 'Brief deleted' });
  } catch (err) {
    console.error('Delete brief error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/briefs/:id/mark-pushed — advance a brief with no tasks to pushed_to_todoist
// ─────────────────────────────────────────────
router.post('/:id/mark-pushed', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { rows: [brief] } = await client.query(
      `SELECT requester_id, owner_id, status FROM briefs WHERE id = $1`, [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });
    if (brief.requester_id !== req.user.id && brief.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the brief owner or requester can do this' });
    }
    if (brief.status !== 'review_complete') {
      return res.status(409).json({ error: `Brief must be at review_complete (currently ${brief.status})` });
    }
    const { rows: [taskCount] } = await client.query(
      `SELECT COUNT(*)::int AS n FROM tasks WHERE brief_id = $1`, [id]
    );
    if (taskCount.n > 0) {
      return res.status(409).json({ error: 'Brief has tasks — use the push endpoint instead' });
    }
    await client.query('BEGIN');
    await client.query(`UPDATE briefs SET status = 'pushed_to_todoist' WHERE id = $1`, [id]);
    await logAction(client, id, req.user.id, 'pushed_to_todoist', 'Brief marked as pushed (no tasks)');
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mark pushed error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/briefs/:id/archive — soft delete (any status past draft)
// ─────────────────────────────────────────────
router.post('/:id/archive', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const existing = await client.query(
      `SELECT requester_id, owner_id, status FROM briefs WHERE id = $1`,
      [id]
    );
    if (!existing.rows[0]) {
      return res.status(404).json({ error: 'Brief not found' });
    }
    const b = existing.rows[0];

    const isOwnerOrRequester = b.requester_id === req.user.id || b.owner_id === req.user.id;
    const isHigherRole = ['hom', 'ceo'].includes(req.user.role);
    if (!isOwnerOrRequester && !isHigherRole) {
      return res.status(403).json({ error: 'You do not have permission to archive this brief' });
    }

    if (b.status === 'archived') {
      return res.status(409).json({ error: 'Brief already archived' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE briefs SET status = 'archived' WHERE id = $1`,
      [id]
    );

    await logAction(client, id, req.user.id, 'archived', `Brief archived by ${req.user.name}`);

    await client.query('COMMIT');

    res.json({ ok: true, message: 'Brief archived' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Archive brief error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;

// ============================================================
// Approval routes
// - Understanding confirmation flow
// - Approval chain (Stage 1 → 2 → 3 → 4)
// - Approve / Request revisions
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const authRequired = require('../middleware/authRequired');

const router = express.Router();
router.use(authRequired);

async function logAction(client, briefId, actorId, action, detail = null) {
  await client.query(
    `INSERT INTO audit_log (brief_id, actor_id, action, detail) VALUES ($1, $2, $3, $4)`,
    [briefId, actorId, action, detail]
  );
}


// ─────────────────────────────────────────────
// POST /api/approvals/brief/:id/start-understanding
// ─────────────────────────────────────────────
router.post('/brief/:id/start-understanding', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { summary } = req.body;

    if (!summary || !summary.trim()) {
      return res.status(400).json({ error: 'Summary is required' });
    }

    const { rows: [brief] } = await client.query(
      `SELECT id, requester_id, owner_id, status FROM briefs WHERE id = $1`,
      [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    if (brief.owner_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the brief owner can send understanding confirmation' });
    }
    if (brief.status !== 'understanding_pending') {
      return res.status(409).json({ error: `Cannot send understanding — brief status is ${brief.status}` });
    }

    await client.query('BEGIN');

    await client.query(
      `INSERT INTO brief_data (brief_id, data) VALUES ($1, $2::jsonb)
       ON CONFLICT (brief_id) DO UPDATE
       SET data = brief_data.data || $2::jsonb, updated_at = NOW()`,
      [id, JSON.stringify({ understanding_summary: summary.trim() })]
    );

    await logAction(client, id, req.user.id, 'understanding_sent',
      `Understanding sent to requester by ${req.user.name}`);

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Understanding sent to requester' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Start understanding error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/approvals/brief/:id/confirm-understanding
// ─────────────────────────────────────────────
router.post('/brief/:id/confirm-understanding', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const { rows: [brief] } = await client.query(
      `SELECT b.*, bd.data AS extra_data FROM briefs b
       LEFT JOIN brief_data bd ON bd.brief_id = b.id
       WHERE b.id = $1`,
      [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    if (brief.requester_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the requester can confirm understanding' });
    }
    if (brief.status !== 'understanding_pending') {
      return res.status(409).json({ error: `Cannot confirm — brief status is ${brief.status}` });
    }
    if (!brief.extra_data || !brief.extra_data.understanding_summary) {
      return res.status(409).json({ error: 'Author has not sent an understanding summary yet' });
    }

    const chain = brief.extra_data && brief.extra_data.approval_chain;
    if (!chain || !Array.isArray(chain) || chain.length === 0) {
      return res.status(409).json({ error: 'No approval chain has been set for this brief' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE briefs SET status = 'approval_stage_1' WHERE id = $1`,
      [id]
    );

    for (let i = 0; i < chain.length; i++) {
      await client.query(
        `INSERT INTO approvals (brief_id, approver_id, stage, status)
         VALUES ($1, $2, $3, 'pending')`,
        [id, chain[i], i + 1]
      );
    }

    await logAction(client, id, req.user.id, 'understanding_confirmed',
      `Understanding confirmed — approval chain started (${chain.length} stage${chain.length > 1 ? 's' : ''})`);

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Understanding confirmed — approval chain started' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Confirm understanding error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// GET /api/approvals/brief/:id
// ─────────────────────────────────────────────
router.get('/brief/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await pool.query(
      `SELECT
         a.id, a.stage, a.status, a.comments, a.severity, a.decided_at,
         u.id AS approver_id, u.name AS approver_name, u.initials AS approver_initials, u.role AS approver_role
       FROM approvals a
       JOIN users u ON u.id = a.approver_id
       WHERE a.brief_id = $1
       ORDER BY a.stage ASC, a.id ASC`,
      [id]
    );
    res.json({ approvals: rows });
  } catch (err) {
    console.error('Get approvals error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/approvals/pending
// ─────────────────────────────────────────────
router.get('/pending', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         a.id, a.stage, a.status, a.created_at,
         b.id AS brief_id, b.brief_code, b.name AS brief_name,
         b.mode, b.status AS brief_status, b.regions, b.campaign_type,
         b.go_live_date, b.requires_arabic
       FROM approvals a
       JOIN briefs b ON b.id = a.brief_id
       WHERE a.approver_id = $1
         AND a.status = 'pending'
         AND b.status LIKE 'approval_stage_%'
         AND b.status = CONCAT('approval_stage_', a.stage)
       ORDER BY b.go_live_date NULLS LAST, a.created_at`,
      [req.user.id]
    );
    res.json({ pending: rows });
  } catch (err) {
    console.error('Get pending error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/approvals/:approvalId/approve
// ─────────────────────────────────────────────
router.post('/:approvalId/approve', async (req, res) => {
  const client = await pool.connect();
  try {
    const { approvalId } = req.params;
    const { comments } = req.body;

    const { rows: [approval] } = await client.query(
      `SELECT a.*, b.status AS brief_status
       FROM approvals a
       JOIN briefs b ON b.id = a.brief_id
       WHERE a.id = $1`,
      [approvalId]
    );

    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    if (approval.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'This approval is not assigned to you' });
    }
    if (approval.status !== 'pending') {
      return res.status(409).json({ error: `Already ${approval.status}` });
    }

    const expectedStatus = `approval_stage_${approval.stage}`;
    if (approval.brief_status !== expectedStatus) {
      return res.status(409).json({
        error: `Brief is at ${approval.brief_status}, cannot approve stage ${approval.stage}`,
      });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE approvals SET status = 'approved', comments = $1, decided_at = NOW() WHERE id = $2`,
      [comments || null, approvalId]
    );

    await logAction(client, approval.brief_id, req.user.id, 'approved',
      `Stage ${approval.stage} approved by ${req.user.name}`);

    // Check if all approvers at this stage are done
    const { rows: [stageStatus] } = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM approvals
       WHERE brief_id = $1 AND stage = $2`,
      [approval.brief_id, approval.stage]
    );

    if (stageStatus.pending === 0 && stageStatus.approved === stageStatus.total) {
      const { rows: nextStages } = await client.query(
        `SELECT DISTINCT stage FROM approvals
         WHERE brief_id = $1 AND stage > $2
         ORDER BY stage ASC LIMIT 1`,
        [approval.brief_id, approval.stage]
      );

      if (nextStages.length) {
        const nextStage = nextStages[0].stage;
        await client.query(
          `UPDATE briefs SET status = $1 WHERE id = $2`,
          [`approval_stage_${nextStage}`, approval.brief_id]
        );
        await logAction(client, approval.brief_id, req.user.id, 'stage_advanced',
          `Advanced to Stage ${nextStage}`);
      } else {
        await client.query(
          `UPDATE briefs SET status = 'approved' WHERE id = $1`,
          [approval.brief_id]
        );
        await logAction(client, approval.brief_id, req.user.id, 'fully_approved',
          `Brief fully approved`);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Approved' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/approvals/:approvalId/request-revisions
// ─────────────────────────────────────────────
router.post('/:approvalId/request-revisions', async (req, res) => {
  const client = await pool.connect();
  try {
    const { approvalId } = req.params;
    const { comments, severity } = req.body;

    if (!comments || !comments.trim()) {
      return res.status(400).json({ error: 'Revision comments are required' });
    }
    if (!['minor', 'moderate', 'major'].includes(severity)) {
      return res.status(400).json({ error: 'Severity must be minor, moderate, or major' });
    }

    const { rows: [approval] } = await client.query(
      `SELECT a.*, b.status AS brief_status
       FROM approvals a
       JOIN briefs b ON b.id = a.brief_id
       WHERE a.id = $1`,
      [approvalId]
    );

    if (!approval) return res.status(404).json({ error: 'Approval not found' });
    if (approval.approver_id !== req.user.id) {
      return res.status(403).json({ error: 'This approval is not assigned to you' });
    }
    if (approval.status !== 'pending') {
      return res.status(409).json({ error: `Already ${approval.status}` });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE approvals SET status = 'revisions_requested',
         comments = $1, severity = $2, decided_at = NOW()
       WHERE id = $3`,
      [comments.trim(), severity, approvalId]
    );

    await client.query(
      `DELETE FROM approvals WHERE brief_id = $1 AND status = 'pending'`,
      [approval.brief_id]
    );

    await client.query(
      `UPDATE briefs SET status = 'draft' WHERE id = $1`,
      [approval.brief_id]
    );

    await logAction(client, approval.brief_id, req.user.id, 'revisions_requested',
      `${severity} revisions requested by ${req.user.name}: ${comments.trim()}`);

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Revisions requested — brief returned to draft' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Request revisions error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;

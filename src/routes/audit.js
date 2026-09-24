// ============================================================
// Audit log routes — revision log viewer
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const authRequired = require('../middleware/authRequired');

const router = express.Router();
router.use(authRequired);

// GET /api/audit-log
// Optional query params: brief_id, actor_id, action, from_date, to_date, limit (default 100)
router.get('/', async (req, res) => {
  try {
    const { brief_id, actor_id, action, from_date, to_date } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);

    const where  = [];
    const params = [];

    if (brief_id) {
      params.push(parseInt(brief_id, 10));
      where.push(`al.brief_id = $${params.length}`);
    }
    if (actor_id) {
      params.push(parseInt(actor_id, 10));
      where.push(`al.actor_id = $${params.length}`);
    }
    if (action) {
      params.push(action);
      where.push(`al.action = $${params.length}`);
    }
    if (from_date) {
      params.push(from_date);
      where.push(`al.created_at >= $${params.length}::date`);
    }
    if (to_date) {
      params.push(to_date);
      where.push(`al.created_at < ($${params.length}::date + interval '1 day')`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);

    const { rows } = await pool.query(
      `SELECT
         al.id, al.action, al.detail, al.created_at,
         al.brief_id,
         b.name        AS brief_name,
         b.brief_code,
         al.actor_id,
         u.name        AS actor_name,
         u.initials    AS actor_initials,
         u.role        AS actor_role
       FROM audit_log al
       LEFT JOIN briefs b ON b.id = al.brief_id
       LEFT JOIN users  u ON u.id = al.actor_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${params.length}`,
      params
    );

    res.json({ entries: rows });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/audit-log/actions — distinct action values for the filter dropdown
router.get('/actions', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT action FROM audit_log ORDER BY action`
    );
    res.json({ actions: rows.map(r => r.action) });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

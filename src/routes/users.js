// ============================================================
// Users routes — team directory
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const authRequired = require('../middleware/authRequired');

const router = express.Router();
router.use(authRequired);

// GET /api/users — all team members (active + inactive), sorted by name
// Returns has_todoist_token boolean — never returns the token itself
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, initials, email, role, region, is_active,
              todoist_token IS NOT NULL AND todoist_token != '' AS has_todoist_token
       FROM users
       ORDER BY name`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

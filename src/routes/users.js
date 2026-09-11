// ============================================================
// Users routes — team directory for dropdowns and chain builder
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const authRequired = require('../middleware/authRequired');

const router = express.Router();
router.use(authRequired);

// GET /api/users — all active team members, sorted by name
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, initials, role, region FROM users WHERE is_active = TRUE ORDER BY name`
    );
    res.json({ users: rows });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

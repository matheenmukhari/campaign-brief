// ============================================================
// Auth routes — /api/auth/login, /api/auth/me
// ============================================================
const express = require('express');
const pool = require('../db/connection');
const { verifyPassword, createToken } = require('../utils/auth');
const authRequired = require('../middleware/authRequired');

const router = express.Router();

// ── POST /api/auth/login ──
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Look up user by email
    const result = await pool.query(
      'SELECT id, email, password_hash, name, initials, role, region, is_active FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );

    const user = result.rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password
    const passwordOk = await verifyPassword(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Success — generate a token
    const token = createToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        initials: user.initials,
        role: user.role,
        region: user.region,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/auth/me ── (returns current user info if logged in)
router.get('/me', authRequired, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, initials, role, region FROM users WHERE id = $1',
      [req.user.id]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
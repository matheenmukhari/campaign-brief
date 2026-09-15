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

// ── GET /api/auth/todoist-status ──
router.get('/todoist-status', authRequired, async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT todoist_token IS NOT NULL AND todoist_token != '' AS connected
       FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json({ connected: user ? user.connected : false });
  } catch (err) {
    console.error('Todoist status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/auth/connect-todoist ──
// Validates the token against Todoist /user, then saves it.
// The token is never echoed back in any response.
router.post('/connect-todoist', authRequired, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ error: 'Token is required' });
    }
    const trimmed = token.trim();

    // Validate by calling Todoist — if the token is wrong this 401s
    let todoistUser;
    try {
      const response = await fetch('https://api.todoist.com/api/v1/projects', {
        headers: { Authorization: `Bearer ${trimmed}` },
      });
      if (!response.ok) {
        return res.status(400).json({ error: 'Todoist rejected that token — check it and try again' });
      }
      todoistUser = await response.json();
    } catch (fetchErr) {
      return res.status(502).json({ error: 'Could not reach Todoist to validate the token' });
    }

    await pool.query(
      `UPDATE users SET todoist_token = $1 WHERE id = $2`,
      [trimmed, req.user.id]
    );

    res.json({ ok: true, message: 'Todoist connected' });
  } catch (err) {
    console.error('Connect Todoist error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── DELETE /api/auth/disconnect-todoist ──
router.delete('/disconnect-todoist', authRequired, async (req, res) => {
  try {
    await pool.query(
      `UPDATE users SET todoist_token = NULL WHERE id = $1`,
      [req.user.id]
    );
    res.json({ ok: true, message: 'Todoist disconnected' });
  } catch (err) {
    console.error('Disconnect Todoist error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
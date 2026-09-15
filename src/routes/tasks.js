// ============================================================
// Task routes — Todoist push workflow
// Tasks are created at brief creation and pushed manually after
// content review completes.
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
// GET /api/tasks/brief/:id
// Returns all tasks for a brief with assignee info and computed due date.
// ─────────────────────────────────────────────
router.get('/brief/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT
         t.id, t.title, t.team, t.due_offset_days, t.is_selected,
         t.todoist_task_id, t.todoist_project_id, t.pushed_at, t.push_error,
         t.created_at,
         u.id AS assignee_id, u.name AS assignee_name,
         u.initials AS assignee_initials, u.role AS assignee_role,
         u.todoist_token IS NOT NULL AND u.todoist_token != '' AS assignee_connected,
         b.go_live_date,
         CASE
           WHEN b.go_live_date IS NOT NULL AND t.due_offset_days IS NOT NULL
           THEN (b.go_live_date - (t.due_offset_days || ' days')::INTERVAL)::DATE
           ELSE NULL
         END AS due_date
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       JOIN briefs b ON b.id = t.brief_id
       WHERE t.brief_id = $1
       ORDER BY t.created_at ASC`,
      [id]
    );

    res.json({ tasks: rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// GET /api/tasks/todoist/projects
// Proxies GET /projects from Todoist using the current user's token.
// Returns 409 if the user hasn't connected Todoist.
// ─────────────────────────────────────────────
router.get('/todoist/projects', async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT todoist_token FROM users WHERE id = $1`,
      [req.user.id]
    );

    if (!user || !user.todoist_token) {
      return res.status(409).json({ error: 'You have not connected your Todoist account' });
    }

    const response = await fetch('https://api.todoist.com/rest/v2/projects', {
      headers: { Authorization: `Bearer ${user.todoist_token}` },
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'Todoist returned an error — your token may have expired' });
    }

    const projects = await response.json();
    res.json({ projects });
  } catch (err) {
    console.error('Todoist projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/tasks/brief/:id/push
// Push selected tasks to Todoist.
//
// Body: { selections: [{ task_id, todoist_project_id, use_briefer_token? }] }
//
// Per-task logic:
//   1. Use assignee's token by default.
//   2. If assignee has no token and use_briefer_token is true, use briefer's token.
//   3. If no usable token, mark push_error and skip.
//
// After all attempts:
//   - 0 successes → do NOT advance brief; return error summary.
//   - ≥1 success  → advance brief to pushed_to_todoist, audit log.
// ─────────────────────────────────────────────
router.post('/brief/:id/push', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { selections } = req.body;

    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'selections must be a non-empty array' });
    }

    const { rows: [brief] } = await client.query(
      `SELECT b.id, b.status, b.go_live_date, b.name AS brief_name
       FROM briefs b WHERE b.id = $1`,
      [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    const allowedStatuses = ['review_complete', 'pushed_to_todoist'];
    if (!allowedStatuses.includes(brief.status)) {
      return res.status(409).json({
        error: `Brief must be at review_complete or pushed_to_todoist to push tasks (currently ${brief.status})`,
      });
    }

    // Load briefer's token for fallback use
    const { rows: [brieferRow] } = await client.query(
      `SELECT todoist_token FROM users WHERE id = $1`,
      [req.user.id]
    );
    const brieferToken = brieferRow && brieferRow.todoist_token;

    // Load all tasks + their assignee tokens in one query
    const taskIds = selections.map(s => s.task_id);
    const { rows: taskRows } = await client.query(
      `SELECT
         t.id, t.title, t.due_offset_days,
         u.todoist_token AS assignee_token,
         CASE
           WHEN b.go_live_date IS NOT NULL AND t.due_offset_days IS NOT NULL
           THEN (b.go_live_date - (t.due_offset_days || ' days')::INTERVAL)::DATE
           ELSE NULL
         END AS due_date
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       JOIN briefs b ON b.id = t.brief_id
       WHERE t.id = ANY($1) AND t.brief_id = $2`,
      [taskIds, id]
    );

    const taskMap = {};
    taskRows.forEach(r => { taskMap[r.id] = r; });

    const results = [];
    let successCount = 0;

    for (const sel of selections) {
      const task = taskMap[sel.task_id];
      if (!task) {
        results.push({ task_id: sel.task_id, ok: false, error: 'Task not found' });
        continue;
      }

      const token = task.assignee_token || (sel.use_briefer_token ? brieferToken : null);
      if (!token) {
        await client.query(
          `UPDATE tasks SET push_error = 'No Todoist token — assignee not connected', pushed_at = NULL WHERE id = $1`,
          [sel.task_id]
        );
        results.push({ task_id: sel.task_id, ok: false, error: 'No Todoist token' });
        continue;
      }

      const payload = {
        content: task.title,
        project_id: sel.todoist_project_id || undefined,
        due_date: task.due_date ? task.due_date.toISOString().split('T')[0] : undefined,
        description: `Campaign brief: ${brief.brief_name}`,
      };
      // Remove undefined keys
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      try {
        // Small delay between requests to stay well within Todoist rate limits
        if (results.length > 0) await new Promise(r => setTimeout(r, 100));

        const response = await fetch('https://api.todoist.com/rest/v2/tasks', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          await client.query(
            `UPDATE tasks SET push_error = $1, pushed_at = NULL WHERE id = $2`,
            [`Todoist error ${response.status}: ${errText.substring(0, 200)}`, sel.task_id]
          );
          results.push({ task_id: sel.task_id, ok: false, error: `Todoist ${response.status}` });
          continue;
        }

        const created = await response.json();
        await client.query(
          `UPDATE tasks
           SET todoist_task_id = $1,
               todoist_project_id = $2,
               pushed_at = NOW(),
               push_error = NULL,
               is_selected = TRUE
           WHERE id = $3`,
          [created.id, created.project_id || sel.todoist_project_id, sel.task_id]
        );
        results.push({ task_id: sel.task_id, ok: true, todoist_task_id: created.id });
        successCount++;
      } catch (fetchErr) {
        await client.query(
          `UPDATE tasks SET push_error = $1, pushed_at = NULL WHERE id = $2`,
          [`Network error: ${fetchErr.message.substring(0, 200)}`, sel.task_id]
        );
        results.push({ task_id: sel.task_id, ok: false, error: fetchErr.message });
      }
    }

    // 0 successes — do not advance brief
    if (successCount === 0) {
      return res.status(502).json({
        ok: false,
        allFailed: true,
        message: 'Push failed — no tasks were created. Fix the errors below and retry.',
        results,
      });
    }

    // At least one success — advance brief if not already pushed
    await client.query('BEGIN');
    if (brief.status === 'review_complete') {
      await client.query(
        `UPDATE briefs SET status = 'pushed_to_todoist' WHERE id = $1`,
        [id]
      );
    }
    await logAction(client, id, req.user.id, 'pushed_to_todoist',
      `${successCount} of ${selections.length} task${selections.length > 1 ? 's' : ''} pushed to Todoist by ${req.user.name}`
    );
    await client.query('COMMIT');

    res.json({ ok: true, successCount, totalCount: selections.length, results });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Push tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;

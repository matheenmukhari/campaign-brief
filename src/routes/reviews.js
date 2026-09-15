// ============================================================
// Content review routes
// Two-round review flow that begins after full approval.
// Round 1: reviewers leave section-tagged comments, tick R1 done.
// Round 2: sign-off only — no new comments accepted.
// Any reviewer can reject and return the brief to draft at any round.
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
// POST /api/reviews/brief/:id/start
// Creates R1 content_review rows for each reviewer and advances brief
// to review_round_1. Called automatically from approvals.js inside a
// transaction, but also exposed here so it can be triggered manually.
// ─────────────────────────────────────────────
router.post('/brief/:id/start', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    const { rows: [brief] } = await client.query(
      `SELECT b.id, b.status, bd.data AS extra_data
       FROM briefs b
       LEFT JOIN brief_data bd ON bd.brief_id = b.id
       WHERE b.id = $1`,
      [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });
    if (brief.status !== 'approved') {
      return res.status(409).json({ error: `Brief must be approved to start review (currently ${brief.status})` });
    }

    const reviewers = brief.extra_data && brief.extra_data.reviewers;
    if (!Array.isArray(reviewers) || reviewers.length === 0) {
      return res.status(409).json({ error: 'No reviewers assigned to this brief' });
    }

    await client.query('BEGIN');
    await startReview(client, id, reviewers, req.user.id);
    await client.query('COMMIT');

    res.json({ ok: true, message: 'Content review started' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Start review error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// Shared helper — called from this route AND from approvals.js
// Must be called inside an open transaction.
async function startReview(client, briefId, reviewerIds, actorId) {
  await client.query(`UPDATE briefs SET status = 'review_round_1' WHERE id = $1`, [briefId]);

  for (const reviewerId of reviewerIds) {
    await client.query(
      `INSERT INTO content_reviews (brief_id, reviewer_id, round, signed_off)
       VALUES ($1, $2, 1, false)
       ON CONFLICT (brief_id, reviewer_id, round) DO NOTHING`,
      [briefId, reviewerId]
    );
  }

  await logAction(client, briefId, actorId, 'review_started',
    `Content review (Round 1) started with ${reviewerIds.length} reviewer${reviewerIds.length > 1 ? 's' : ''}`);
}

module.exports.startReview = startReview;

// ─────────────────────────────────────────────
// GET /api/reviews/brief/:id
// Returns all content_reviews rows (with user info) and all comments.
// ─────────────────────────────────────────────
router.get('/brief/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [reviewsRes, commentsRes] = await Promise.all([
      pool.query(
        `SELECT
           cr.id, cr.round, cr.signed_off, cr.signed_at,
           u.id AS reviewer_id, u.name AS reviewer_name,
           u.initials AS reviewer_initials, u.role AS reviewer_role
         FROM content_reviews cr
         JOIN users u ON u.id = cr.reviewer_id
         WHERE cr.brief_id = $1
         ORDER BY cr.round ASC, cr.id ASC`,
        [id]
      ),
      pool.query(
        `SELECT
           c.id, c.section, c.round, c.body, c.created_at,
           u.id AS author_id, u.name AS author_name, u.initials AS author_initials
         FROM comments c
         JOIN users u ON u.id = c.author_id
         WHERE c.brief_id = $1
         ORDER BY c.created_at ASC`,
        [id]
      ),
    ]);

    res.json({ reviews: reviewsRes.rows, comments: commentsRes.rows });
  } catch (err) {
    console.error('Get reviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────
// POST /api/reviews/:reviewId/mark-done
// Reviewer ticks their R1 or R2 checkbox.
// When all reviewers at the current round are done:
//   - R1 complete → create R2 rows, advance to review_round_2
//   - R2 complete → advance to review_complete
// ─────────────────────────────────────────────
router.post('/:reviewId/mark-done', async (req, res) => {
  const client = await pool.connect();
  try {
    const { reviewId } = req.params;

    const { rows: [review] } = await client.query(
      `SELECT cr.*, b.status AS brief_status
       FROM content_reviews cr
       JOIN briefs b ON b.id = cr.brief_id
       WHERE cr.id = $1`,
      [reviewId]
    );
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.reviewer_id !== req.user.id) {
      return res.status(403).json({ error: 'This review is not assigned to you' });
    }
    if (review.signed_off) {
      return res.status(409).json({ error: 'Already signed off' });
    }

    const expectedStatus = `review_round_${review.round}`;
    if (review.brief_status !== expectedStatus) {
      return res.status(409).json({
        error: `Brief is at ${review.brief_status}, cannot sign off round ${review.round}`,
      });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE content_reviews SET signed_off = true, signed_at = NOW() WHERE id = $1`,
      [reviewId]
    );

    await logAction(client, review.brief_id, req.user.id, 'review_signed_off',
      `Round ${review.round} signed off by ${req.user.name}`);

    // Check if all reviewers at this round are now done
    const { rows: [roundStatus] } = await client.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE signed_off = true)::int AS done
       FROM content_reviews
       WHERE brief_id = $1 AND round = $2`,
      [review.brief_id, review.round]
    );

    if (roundStatus.done === roundStatus.total) {
      if (review.round === 1) {
        // Advance to R2 — create sign-off rows for each R1 reviewer
        const { rows: r1Reviewers } = await client.query(
          `SELECT reviewer_id FROM content_reviews WHERE brief_id = $1 AND round = 1`,
          [review.brief_id]
        );
        for (const r of r1Reviewers) {
          await client.query(
            `INSERT INTO content_reviews (brief_id, reviewer_id, round, signed_off)
             VALUES ($1, $2, 2, false)
             ON CONFLICT (brief_id, reviewer_id, round) DO NOTHING`,
            [review.brief_id, r.reviewer_id]
          );
        }
        await client.query(
          `UPDATE briefs SET status = 'review_round_2' WHERE id = $1`,
          [review.brief_id]
        );
        await logAction(client, review.brief_id, req.user.id, 'review_advanced',
          `All Round 1 feedback complete — advanced to Round 2 sign-off`);
      } else {
        await client.query(
          `UPDATE briefs SET status = 'review_complete' WHERE id = $1`,
          [review.brief_id]
        );
        await logAction(client, review.brief_id, req.user.id, 'review_complete',
          `All Round 2 sign-offs complete — content review finished`);
      }
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: `Round ${review.round} signed off` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Mark done error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/reviews/brief/:id/comment
// Add a section-tagged comment. Blocked during Round 2.
// ─────────────────────────────────────────────
router.post('/brief/:id/comment', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { section, body } = req.body;

    if (!body || !body.trim()) {
      return res.status(400).json({ error: 'Comment body is required' });
    }

    const validSections = ['general', 'headline', 'cta', 'audience', 'creative', 'arabic'];
    if (section && !validSections.includes(section)) {
      return res.status(400).json({ error: `Section must be one of: ${validSections.join(', ')}` });
    }

    const { rows: [brief] } = await client.query(
      `SELECT id, status FROM briefs WHERE id = $1`, [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });
    if (brief.status === 'review_round_2') {
      return res.status(409).json({ error: 'Round 2 is sign-off only — no new comments accepted' });
    }
    if (brief.status !== 'review_round_1') {
      return res.status(409).json({ error: `Brief is not in review (currently ${brief.status})` });
    }

    // Only assigned reviewers can comment
    const { rows: [assignment] } = await client.query(
      `SELECT id FROM content_reviews
       WHERE brief_id = $1 AND reviewer_id = $2 AND round = 1`,
      [id, req.user.id]
    );
    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned as a reviewer for this brief' });
    }

    await client.query('BEGIN');

    const { rows: [comment] } = await client.query(
      `INSERT INTO comments (brief_id, author_id, section, round, body)
       VALUES ($1, $2, $3, 1, $4)
       RETURNING id`,
      [id, req.user.id, section || 'general', body.trim()]
    );

    await logAction(client, id, req.user.id, 'commented',
      `${req.user.name} commented on ${section || 'general'}: ${body.trim().substring(0, 80)}`);

    await client.query('COMMIT');
    res.status(201).json({ ok: true, commentId: comment.id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Add comment error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// POST /api/reviews/brief/:id/reject
// Any assigned reviewer can reject and return the brief to draft.
// Logs to audit_log. Does not delete review or comment history.
// ─────────────────────────────────────────────
router.post('/brief/:id/reject', async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const { rows: [brief] } = await client.query(
      `SELECT id, status FROM briefs WHERE id = $1`, [id]
    );
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    if (!['review_round_1', 'review_round_2'].includes(brief.status)) {
      return res.status(409).json({ error: `Brief is not in review (currently ${brief.status})` });
    }

    // Any reviewer assigned to any round of this brief can reject
    const { rows: [assignment] } = await client.query(
      `SELECT id FROM content_reviews WHERE brief_id = $1 AND reviewer_id = $2 LIMIT 1`,
      [id, req.user.id]
    );
    if (!assignment) {
      return res.status(403).json({ error: 'You are not assigned as a reviewer for this brief' });
    }

    await client.query('BEGIN');

    await client.query(`UPDATE briefs SET status = 'draft' WHERE id = $1`, [id]);

    await logAction(client, id, req.user.id, 'review_rejected',
      `Brief rejected in ${brief.status} by ${req.user.name}: ${reason.trim()}`);

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Brief returned to draft' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reject review error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
// GET /api/reviews/pending-count
// Number of content_reviews where the current user hasn't signed off
// and the brief is at the matching round.
// ─────────────────────────────────────────────
router.get('/pending-count', async (req, res) => {
  try {
    const { rows: [result] } = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM content_reviews cr
       JOIN briefs b ON b.id = cr.brief_id
       WHERE cr.reviewer_id = $1
         AND cr.signed_off = false
         AND b.status = CONCAT('review_round_', cr.round)`,
      [req.user.id]
    );
    res.json({ count: result.count });
  } catch (err) {
    console.error('Pending count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
module.exports.startReview = startReview;

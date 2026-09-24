# Operations & Deployment Guide

Living document — update as things change. Last updated: 24 Sept 2026 (initial deploy day).

---

## Production URLs

- **Live app:** https://campaign-brief.onrender.com
- **Login page:** https://campaign-brief.onrender.com/login.html
- **Health check:** https://campaign-brief.onrender.com/api/health

---

## Infrastructure

Three services power the app. All are free tier as of Sept 2026.

### Database — Neon
- **Provider:** Neon (neon.tech)
- **Project name:** sp-campaign-brief
- **Project ID:** tiny-union-35081452
- **Branch:** production
- **Region:** Frankfurt (eu-central-1)
- **Postgres version:** 16
- **Free tier:** 0.5 GB storage forever, auto-pauses when inactive
- **Connection URL:** stored as DATABASE_URL in `.env` locally and in Render env vars for production

### Backend + Frontend — Render
- **Provider:** Render (render.com)
- **Service name:** campaign-brief
- **Type:** Web Service
- **Region:** Frankfurt (matches Neon for low latency)
- **Instance:** Free (0.1 CPU, 512 MB RAM)
- **Repo:** selectpropertyglobal-cloud/sp-campaign-brief (main branch)
- **Auto-deploys:** on every push to main
- **Build command:** `npm install`
- **Start command:** `node src/server.js`
- **Free tier caveat:** spins down after 15 min inactivity; first request after that takes 30-60 sec to wake

### Code — GitHub
- **Repo:** https://github.com/selectpropertyglobal-cloud/sp-campaign-brief
- **Visibility:** private
- **Branch policy:** main is auto-deployed. Consider adding a dev/staging branch later.

### External API — Todoist
- Personal token per user (stored in users.todoist_token)
- Currently faked: all users share Matheen's token for testing
- Uses Todoist REST API v1 (`https://api.todoist.com/api/v1/`)

---

## Environment variables (Render)

Set in Render dashboard → service → Environment tab:

- `DATABASE_URL` — Neon connection string (pooled)
- `JWT_SECRET` — 64-char hex string for signing login tokens
- `NODE_ENV` — `production`

Never commit these. Never share. To rotate: change in Render, restart service.

---

## Deployment workflow

Standard flow for any change:Edit code locally in VS Code / Claude Code
Test at http://localhost:3001 (npm run dev)
git add .
git commit -m "descriptive message"
git push
Render auto-deploys — check dashboard for status
Verify on https://campaign-brief.onrender.com

Deploys take 2-3 minutes. Watch Render's Logs tab for progress.

---

## Rollback procedure

If a deploy breaks production:

1. Render dashboard → campaign-brief service
2. Deploys tab (left sidebar)
3. Find the last known-good deploy
4. Click "..." → "Redeploy this commit"
5. Old version live in 2 minutes

For code rollback:

```bash
git log --oneline               # find good commit
git revert <commit-hash>        # creates a revert commit
git push                        # auto-deploys the revert
```

---

## Common operations

### Update the database schema

Schema changes need to happen in TWO places — the SQL file (for future setups) AND the live Neon database (for existing data).

1. Edit `src/db/schema.sql` with the change
2. Run the migration against Neon:
```bash
   psql "$(grep '^DATABASE_URL=' .env | cut -d '=' -f2-)" -c "ALTER TABLE ..."
```
3. Commit and push the schema.sql change
4. Test the migrated feature works both locally and on production

### Reset all test data on production

Danger — deletes everything. Only for pre-launch cleanup.

```bash
psql "$(grep '^DATABASE_URL=' .env | cut -d '=' -f2-)" -c "TRUNCATE briefs, brief_data, approvals, content_reviews, comments, tasks, audit_log RESTART IDENTITY CASCADE;"
```

Users are preserved. Briefs and all workflow data wiped.

### Add a real team member

For real onboarding (post-testing):

```bash
psql "$(grep '^DATABASE_URL=' .env | cut -d '=' -f2-)" -c "INSERT INTO users (name, initials, email, password_hash, role, region, is_active) VALUES ('Name', 'NN', 'email@company.com', '<bcrypt-hash>', 'role', 'region', TRUE);"
```

Generate the password hash with a small Node script or through the seed logic.

### Rotate Todoist token (when moving from test to production)

```bash
psql "$(grep '^DATABASE_URL=' .env | cut -d '=' -f2-)" -c "UPDATE users SET todoist_token = NULL;"
```

Then each user connects their real token via Settings page.

### Force a Render redeploy (without a code change)

Render dashboard → service → Manual Deploy → Deploy latest commit.

Useful if an env var changed or Render is being weird.

---

## Monitoring

**Check the app is up:**
- Hit https://campaign-brief.onrender.com/api/health
- Should return `{"status":"ok"}`

**Watch server logs live:**
- Render dashboard → service → Logs tab
- Streams in real-time

**Database health:**
- Neon dashboard → project → Monitoring tab
- Shows storage, connections, query performance

**Keep app awake (prevent spin-down):**
- Optional: set up UptimeRobot (uptimerobot.com) to ping /api/health every 5 min
- Free tier allows 50 monitors
- URL to monitor: https://campaign-brief.onrender.com/api/health

---

## Known limitations (current state)

Documented so we don't forget:

- **Sleep after 15 min idle** — Render free tier limit. First request after sleep = 30-60 sec wait.
- **Neon connection pool** — free tier allows limited connections; pooled URL used to mitigate.
- **All Todoist tokens are Matheen's for now** — real per-user tokens to be set up during team onboarding.
- **No file attachments on briefs yet** — planned but not built.
- **No email notifications yet** — Session 9 will add this using Resend or Postmark.
- **QA checklist state hardcoded** — planned to make configurable later.

---

## Upgrade path

When free tier limits become a problem:

| Bottleneck | Fix | Cost |
|---|---|---|
| Sleep on inactivity | Render Starter tier | +$7/mo |
| Neon 0.5 GB storage full | Neon Launch tier | +$19/mo |
| Need staging environment | Duplicate Render service + Neon branch | Free-ish |
| Custom domain (campaigns.selectproperty.com) | Render + DNS setup | Free |
| Email notifications | Resend or Postmark | Free tier / $10-20/mo |

Total to make it "properly production" for a small team: roughly $20-30/mo.

---

## Contact / handoff

**Owner:** Matheen Bukhari (bukhari.matheen@gmail.com)
**GitHub:** selectpropertyglobal-cloud
**Neon account:** selectpropertyglobal@gmail.com
**Render account:** selectpropertyglobal@gmail.com

If handing this off to a developer, share:
1. GitHub repo access
2. Access to selectpropertyglobal@gmail.com for Neon + Render
3. This OPERATIONS.md file
4. README.md file

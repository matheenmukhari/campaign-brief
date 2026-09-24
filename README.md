# SelectProperty Campaign Briefing App

Internal web app for SelectProperty's global marketing team to create, review, approve, and track campaign briefs across UK, GCC, and Asia regions.

Replaces the ad-hoc process of briefs flowing over email, Slack, and WhatsApp with a structured, audited workflow that pushes approved tasks straight into Todoist.

**Live at:** https://campaign-brief.onrender.com

---

## Status: LIVE (24 Sept 2026)

- ✅ Deployed to production (Render + Neon)
- ✅ End-to-end workflow: create → understand → approve → review → push
- 🚧 Team onboarding pending (still using test accounts)
- 🚧 Sessions 8 and 9 (reference pages + email notifications) not yet built

See OPERATIONS.md for deployment, monitoring, and update procedures.

---

## The team using this

Marketing team across UK, GCC (Dubai), and global remote:

| Name | Role | Region |
|---|---|---|
| Joey | Content executive | GCC |
| Hannah | Global head of marketing | Global |
| Amber | Head of marketing | GCC |
| Beth | Head of marketing | UK |
| Chris | Creative lead | Global |
| Matheen | Digital design manager | Global |
| Alex | Social media exec | Global |
| Rhiannon | CRM manager | Global |
| Adam Price | CEO | Global |
| Mohammed | Marketing head — Arabic QA | GCC |

Anyone on the team can brief anyone else. Approval chains, content reviewers, and task assignees are all picked manually per-brief by the briefer.

---

## Core workflow

Every brief moves through these stages:

1. **Draft** — briefer fills form (Quick / Full / Custom mode), picks approval chain, reviewers, and tasks
2. **Understanding pending** — brief author sends interpretation summary to requester
3. **Understanding confirmed** — requester confirms; approval chain begins
4. **Approval stages 1..N** — each approver picked by briefer approves in order (any user, any stage, chains can loop)
5. **Approved** — all approvers signed off
6. **Review round 1** — reviewers add feedback comments; tick R1 done when each is done
7. **Review round 2** — sign-off only, no new comments accepted
8. **Review complete** — ready to push to Todoist
9. **Pushed to Todoist** — tasks live in team members' Todoist projects

At any approval or review stage, revisions can be requested → brief returns to draft with severity + comments.

---

## Tech stack

- **Backend:** Node.js + Express + PostgreSQL (`pg`), JWT auth, bcrypt for passwords
- **Frontend:** Vanilla HTML/CSS/JS — no framework
- **Database:** Neon Postgres (production), local PostgreSQL 16 (dev)
- **Hosting:** Render (Frankfurt region), auto-deploy from GitHub main branch
- **External:** Todoist REST API v1 for task push
- **Design system:** Amie-inspired, Helvetica Neue, warm stone `#f8f6f3`, 5px max radius
- **Dev tooling:** nodemon for local auto-reload

### Why vanilla frontend (not React/Vue)

Deliberate — Matheen is building this hands-on and prefers to understand every line. Framework overhead not justified for team of 15. Migration to React possible later.

---

## Project structure

Campaign Brief/
├── src/
│ ├── server.js # Express entry point
│ ├── db/
│ │ ├── connection.js # PostgreSQL pool
│ │ ├── schema.sql # 8 tables + triggers
│ │ └── seed.js # Seeds 11 team members (password: password123)
│ ├── middleware/
│ │ └── authRequired.js # JWT validation
│ ├── routes/
│ │ ├── auth.js # login, me, todoist connect/disconnect
│ │ ├── briefs.js # brief CRUD + submit + archive
│ │ ├── approvals.js # approval chain + understanding flow
│ │ ├── reviews.js # two-round content review
│ │ └── tasks.js # Todoist push, projects proxy
│ └── utils/
│ └── auth.js # bcrypt + JWT helpers
├── public/
│ ├── css/app.css # Design system (one file, all pages)
│ ├── js/
│ │ ├── api.js # apiCall() + token storage
│ │ ├── app.js # Sidebar, greeting, toast, initShell()
│ │ ├── auth.js # Login form
│ │ ├── dashboard.js # Brief list + stats
│ │ ├── new-brief.js # Brief creation with approver + reviewer + task pickers
│ │ ├── brief.js # Brief detail — pipeline, approvals, reviews
│ │ ├── approvals.js # "What needs my sign-off" inbox
│ │ ├── review.js # Content review inbox + panel
│ │ ├── todoist.js # Todoist push cockpit (inbox + task cockpit)
│ │ └── settings.js # Todoist token connect flow
│ └── *.html # One HTML file per page
├── Mockup/ # Original HTML prototype
├── .env # Local secrets (never committed)
├── .gitignore
├── package.json
├── README.md # This file
└── OPERATIONS.md # Deployment + ops reference


---

## Database schema (see src/db/schema.sql)

- **users** — team members with login credentials, role, region, todoist_token
- **briefs** — main record (name, mode, status, requester, owner, regions, channels, dates)
- **brief_data** — JSONB blob for Full/Custom section fields, understanding_summary, approvers, reviewers arrays
- **approvals** — one row per approver per brief per stage
- **content_reviews** — R1/R2 done tracking per reviewer
- **comments** — feedback comments with `round` and `section` columns
- **tasks** — task list per brief, with todoist_task_id and push_error after push
- **audit_log** — every action on every brief (auto-populated)

Auto-updating `updated_at` triggers on users, briefs, brief_data.

---

## Current state (as of 24 Sept 2026)

### ✅ Complete
- Login + JWT auth + protected routes
- Team seeded (11 users, password `password123`)
- Brief CRUD (create, list, get, edit, submit, delete drafts, archive submitted)
- Manual approver picker at brief creation (any user, any stage, chains can loop)
- Understanding confirmation flow (owner sends summary → requester confirms)
- Multi-stage approval chain with auto-progression
- Revision requests kick brief back to draft with severity + comments
- Content review two-round tracking with section-tagged comments
- Content reviewer picker at brief creation
- Task list picker at brief creation (title, assignee, due offset days)
- Todoist token connection via Settings page
- Todoist push cockpit at /todoist.html — inbox on left, task push controls on right
- Per-task push with Todoist project dropdown, partial success handling, retry for failed tasks
- Sidebar counts for Approvals, Content review, Todoist push (pending items)
- Full audit trail on every action
- Design system applied consistently across all pages
- **Deployed to production at https://campaign-brief.onrender.com**

### 🚧 Not yet built (planned)
- Team directory page (/team.html — sidebar link exists, page needs building)
- QA checklist page (/qa.html — pre-launch checks per brief)
- Revision log page (/log.html — audit_log viewer with filters)
- Email notifications (approval requests, review requests, revision alerts)
- File attachments on briefs
- Real per-user Todoist tokens (currently all users share Matheen's for testing)

### 🐛 Known issues / tech debt
- All Todoist tokens are Matheen's (faked for testing) — real per-user setup pending team onboarding
- No test suite — manual testing only
- Render free tier spins down after 15 min idle (first request takes 30-60 sec to wake)
- Neon free tier is 0.5 GB storage; auto-pauses when inactive

---

## Design conventions

### Backend
- All routes use `authRequired` middleware except `/api/auth/login`
- Transactions via `pool.connect()` + explicit BEGIN/COMMIT/ROLLBACK for multi-write operations
- Audit log uses the transaction client — never a separate connection
- Errors return `{ error: 'message' }` with appropriate HTTP status (400/403/404/409/500)
- Brief code format: `SP-CB-YYYY-NNN`
- Todoist tokens NEVER returned in API responses

### Frontend
- Every page loads api.js then app.js then its page-specific JS
- `initShell(activePage)` sets up sidebar and validates login
- `apiCall(method, path, body)` handles auth token attachment
- `toast(msg)` shows a brief notification
- `escapeHtml()` / `escapeAttr()` used for all user-supplied strings in innerHTML
- Never store secrets in frontend

### Design system (in public/css/app.css)
- CSS variables for all colours
- Radius max 5px — no rounded blobs
- Font: Helvetica Neue, letter-spacing -0.005em to -0.02em
- Weight: 400 and 500 only
- Warm stone background, muted amber/blue/green/red tints (Amie-inspired)

### Git conventions
- Repo: `selectpropertyglobal-cloud/sp-campaign-brief` (private)
- Author: `selectpropertyglobal@gmail.com`
- Commit messages: descriptive, present tense — "Add task push cockpit", "Fix Todoist v1 endpoint"
- Commit + push frequently — Render auto-deploys on main branch push
- No branch protection yet; consider adding for production stability

---

## Environment (.env, local)

PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://... (Neon connection string, pooled)
DATABASE_URL_UNPOOLED=postgresql://... (from Neon CLI)
NEON_BRANCH=production
JWT_SECRET=<64-char hex string>


Never commit — `.gitignore` excludes.

Production env vars live in Render → service → Environment tab.

---

## Running locally

One-time setup:
npm install
psql campaign_brief < src/db/schema.sql
node src/db/seed.js

Every session:
npm run dev # nodemon on src/server.js at http://localhost:3001

Browse to `http://localhost:3001/login.html`

Test accounts (all password `password123`):
- `joey@test.com` — Content exec (GCC)
- `hannah@test.com` — Global HoM
- `amber@test.com` — GCC HoM
- `beth@test.com` — UK HoM
- `mohammed@test.com` — GCC Arabic QA
- `adam@test.com` — CEO
- Plus Chris, Matheen, Alex, Rhiannon

---

## Deployment

See **OPERATIONS.md** for full details. TL;DR:

- Push to GitHub main → Render auto-deploys in 2-3 min
- Live at https://campaign-brief.onrender.com
- Database on Neon (project: sp-campaign-brief, region: Frankfurt)
- No manual steps needed for standard deploys

---

## Roadmap

| Session | Focus | Status |
|---|---|---|
| 1 | Setup (Node, Postgres, project structure) | ✅ |
| 2 | Database schema + seed team | ✅ |
| 3 | Login + JWT auth | ✅ |
| 4 | Brief CRUD + list + detail | ✅ |
| 5 | Approval chain + understanding confirmation | ✅ |
| 5.5 | Refactor: manual approval chain builder | ✅ |
| 6 | Content review (two rounds) | ✅ |
| 7 | Todoist push integration | ✅ |
| — | **DEPLOY TO PRODUCTION** | ✅ (24 Sept 2026) |
| 8 | Team directory, QA checklist, revision log pages | Coming |
| 9 | Email notifications | Coming |
| 10 | Team onboarding + real Todoist tokens | Coming |
| 11 | Custom domain (campaigns.selectproperty.com) | Coming |
| 12 | Polish + file attachments + optional features | Coming |

---

## Who's building this

Matheen Bukhari — Creative Manager at SelectProperty. Building hands-on with Claude web (product decisions + guidance) and Claude Code (implementation). Not a professional developer but comfortable following technical instructions and testing carefully.

Preferences:
- Explain WHY not just WHAT
- Simple, readable code over clever abstractions
- Vanilla JS/HTML/CSS — no framework
- Clean UX + design consistency
- Proper Git hygiene (commit + push after meaningful changes)

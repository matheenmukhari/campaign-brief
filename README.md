# SelectProperty Campaign Briefing App

Internal web app for SelectProperty's global marketing team to create, review, approve, and track campaign briefs across UK, GCC, and Asia regions.

Replaces the ad-hoc process of briefs flowing over email, Slack, and WhatsApp with a structured, audited workflow.

---

## The team using this

~15 marketing people across UK, GCC (Dubai), and global remote:

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

Anyone on the team can brief anyone else. Approval chains are picked per-brief, not fixed by hierarchy.

---

## Core workflow

Every brief moves through these stages:

1. **Draft** — briefer fills out the form (Quick / Full / Custom mode)
2. **Understanding pending** — brief author sends interpretation summary to requester
3. **Understanding confirmed** — requester confirms the interpretation is accurate; approval chain begins
4. **Approval stages 1..N** — each approver picked at brief creation approves in order
5. **Approved** — brief is signed off, tasks push to Todoist
6. **(Later) Content review** — two-round content review with reviewer sign-off tracking
7. **(Later) Todoist push** — approved brief creates tasks in team members' Todoist projects

At any stage, an approver can **request revisions** → brief returns to draft with severity + comments.

---

## Tech stack

- **Backend:** Node.js + Express + PostgreSQL (pg), JWT auth (jsonwebtoken), bcrypt for passwords
- **Frontend:** Vanilla HTML/CSS/JS — no framework (deliberately kept simple)
- **Database:** PostgreSQL 16 (local), production plan is Node.js on the SelectProperty VPS
- **Design system:** Amie-inspired, Helvetica Neue, warm stone (#f8f6f3) background, 5px max radius
- **Dev tooling:** nodemon for auto-reload

### Why vanilla frontend (not React/Vue)

Deliberate choice — the app owner (Matheen) is building this hands-on and prefers to understand every line. Framework overhead not justified for team of 15. Migration to React possible later.

---

## Project structure

Backend in src/ (server.js entry point; db/ for connection.js, schema.sql, seed.js; middleware/authRequired.js; routes/ for auth.js, briefs.js, approvals.js; utils/auth.js for bcrypt+JWT helpers). Frontend in public/ (css/app.css, js/ for api.js, app.js, auth.js, dashboard.js, new-brief.js, brief.js, approvals.js, plus one HTML file per page). Mockup/ holds the original HTML prototype. .env is local secrets (never committed). package.json + README.md at root.

---

## Database schema (see src/db/schema.sql)

- **users** — team members with login credentials, role, region
- **briefs** — main record (name, mode, status, requester, owner, regions, channels, dates)
- **brief_data** — JSONB blob for Full/Custom section fields + understanding_summary
- **approvals** — one row per approver per brief per stage (stage number, status, comments)
- **content_reviews** — two-round review tracking (schema exists, not yet used by frontend)
- **comments** — feedback threads (schema exists, not yet used)
- **tasks** — generated on approval, pushed to Todoist (schema exists, not yet used)
- **audit_log** — every action on every brief (auto-populated via logAction helper)

Auto-updating updated_at triggers on users, briefs, brief_data.

---

## Current state (as of this handover)

### Complete
- Login + JWT auth + protected routes
- Team directory seeded (10 users, password: password123)
- Brief CRUD (create, list, get, edit, submit, delete drafts, archive submitted)
- Understanding confirmation flow (owner sends summary → requester confirms)
- Multi-stage approval chain with auto-progression
- Approval detail page with pipeline visual
- Revision modal (severity + comments)
- Approvals inbox with pending count in sidebar
- Design system fully applied across all pages
- Full audit trail via audit_log table

### KNOWN DESIGN FLAW — MUST FIX FIRST

The current approval chain logic auto-assigns approvers based on region — this is wrong.

Correct model: the briefer manually picks the approval chain when creating a brief. Any user can be an approver at any stage. Chains can loop (e.g. Hannah briefs → Amber reviews → Beth reviews → Hannah signs off).

This affects:
- src/routes/approvals.js — determineApprovers() function is currently hardcoded logic; should be replaced with using an approvers array passed in at brief creation
- public/new-brief.html + public/js/new-brief.js — need an approval chain builder UI (pick users in order, drag-to-reorder, allow same person twice for loops)
- src/routes/briefs.js — accept approvers: [userId, userId, ...] in POST /api/briefs body, save intended chain (perhaps in brief_data)
- Approvals get created after understanding is confirmed (same as now), but from the stored chain, not by calling determineApprovers

Preserve: pipeline visual (already stage-agnostic), understanding confirmation flow (unchanged), approve/request-revisions (unchanged), revision returns brief to draft (unchanged), audit log format (unchanged).

### Not yet built
- Content review (two-round tracking) — schema exists, no UI
- Todoist push — schema exists, no integration yet
- Team directory page (/team.html) — sidebar link exists but page doesn't
- QA checklist page — same
- Revision log page — same
- Email notifications — not yet wired (use Resend or Postmark when needed)
- File attachments on briefs

---

## Design conventions

### Backend
- All routes use authRequired middleware
- Transactions via pool.connect() + explicit BEGIN/COMMIT/ROLLBACK for multi-write operations
- Audit log uses the transaction client — never a separate connection
- Errors return { error: 'message' } with appropriate HTTP status (400/403/404/409/500)
- Brief code format: SP-CB-YYYY-NNN (year + zero-padded number)

### Frontend
- Every page loads api.js then app.js then its page-specific JS
- initShell(activePage) sets up the sidebar and validates login
- apiCall(method, path, body) handles auth token attachment automatically
- toast(msg) shows a brief notification
- escapeHtml() / escapeAttr() used for all user-supplied strings in innerHTML
- Never trust .env values in frontend — everything sensitive stays server-side

### Design system (in public/css/app.css)
- CSS variables for all colours (--bg, --text, --tint-*, etc.)
- Radius max 5px — no rounded blobs
- Font: Helvetica Neue, letter-spacing -0.005em to -0.02em
- Weight: only 400 and 500 (no bold shouting)
- Colours: warm stone background, muted amber/blue/green/red accents (Amie-inspired)

### Git conventions
- Repo: selectpropertyglobal-cloud/sp-campaign-brief on GitHub (private)
- Commit messages: "Session X — what was done" or descriptive short message
- Author: selectpropertyglobal@gmail.com
- Commit frequently, push after each meaningful feature

---

## Environment (.env)

PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres@localhost:5432/campaign_brief
JWT_SECRET=change-me-to-a-random-string-later-when-we-deploy

Never commit. .gitignore excludes it.

---

## Running locally

One-time setup:
- npm install
- psql campaign_brief < src/db/schema.sql
- node src/db/seed.js

Every session:
- npm run dev (nodemon on src/server.js at http://localhost:3000)

Then browse to http://localhost:3000 — redirects to /login.html.

Test accounts (all password password123):
- joey@test.com — Content exec (GCC)
- hannah@test.com — Global HoM
- amber@test.com — GCC HoM
- beth@test.com — UK HoM
- mohammed@test.com — GCC Arabic QA
- adam@test.com — CEO

---

## Deployment (planned)

Target: SelectProperty VPS (~40GB storage, Ubuntu). Stack:
- Node.js + PM2 process manager
- Nginx reverse proxy
- Let's Encrypt SSL
- PostgreSQL 16 on same box (or managed service)
- Resend or Postmark for transactional email (~$20/mo at scale, free tier for now)

No third-party app host needed (Vercel/Railway/Render not used) — everything on the SelectProperty VPS.

---

## Roadmap

- Session 1: Setup (Node, Postgres, project structure) — DONE
- Session 2: Database schema + seed team — DONE
- Session 3: Login + JWT auth — DONE
- Session 4: Brief CRUD + list + detail — DONE
- Session 5: Approval chain + understanding confirmation — DONE (needs refactor)
- **Session 5.5: Refactor approval chain to manual builder — NEXT**
- Session 6: Content review (two rounds)
- Session 7: Todoist push integration
- Session 8: Team directory, QA checklist, revision log pages
- Session 9: Email notifications, polish
- Session 10: Deploy to SelectProperty VPS

---

## Who's building this

Matheen Bukhari — Creative Manager at SelectProperty. Building this hands-on with AI assistance (started with Claude web, moved to Claude Code for the heavier phases). Not a professional developer, but comfortable following technical instructions and testing changes carefully.

Preferences:
- Wants to understand what's being built (explain WHY not just WHAT)
- Prefers simple, readable code over clever abstractions
- OK with vanilla JS/HTML/CSS — no framework overhead
- Values clean UX and design consistency
- Wants proper Git hygiene (commit + push after meaningful changes)

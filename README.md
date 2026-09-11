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

- **Backend:** Node.js + Express + PostgreSQL (`pg`), JWT auth (`jsonwebtoken`), bcrypt for passwords
- **Frontend:** Vanilla HTML/CSS/JS — no framework (deliberately kept simple)
- **Database:** PostgreSQL 16 (local), production plan is Node.js on the SelectProperty VPS
- **Design system:** Amie-inspired, Helvetica Neue, warm stone (`#f8f6f3`) background, 5px max radius
- **Dev tooling:** nodemon for auto-reload

### Why vanilla frontend (not React/Vue)

Deliberate choice — the app owner (Matheen) is building this hands-on and prefers to understand every line. Framework overhead not justified for team of 15. Migration to React possible later.

---

## Project structure

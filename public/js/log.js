// ============================================================
// Revision log — audit trail viewer
// ============================================================

const ACTION_LABELS = {
  created:                 'Brief created',
  submitted:               'Submitted for approval',
  understanding_sent:      'Understanding sent',
  understanding_confirmed: 'Understanding confirmed',
  approved:                'Approved',
  revisions_requested:     'Revisions requested',
  resubmitted:             'Resubmitted',
  review_round_1_opened:   'Review R1 opened',
  review_complete:         'Review complete',
  pushed_to_todoist:       'Pushed to Todoist',
  qa_item_checked:         'QA item checked',
  qa_item_unchecked:       'QA item unchecked',
  qa_complete:             'QA complete',
  archived:                'Brief archived',
  mark_pushed:             'Marked as pushed',
};

const ACTION_COLOR = {
  created:                 'var(--gray)',
  submitted:               'var(--blue)',
  understanding_sent:      'var(--blue)',
  understanding_confirmed: 'var(--blue)',
  approved:                'var(--green)',
  revisions_requested:     'var(--rose)',
  resubmitted:             'var(--amber)',
  review_round_1_opened:   'var(--blue)',
  review_complete:         'var(--green)',
  pushed_to_todoist:       'var(--violet)',
  qa_item_checked:         'var(--violet)',
  qa_item_unchecked:       'var(--gray)',
  qa_complete:             'var(--green)',
  archived:                'var(--gray)',
};

const AVATAR_PALETTES = [
  { bg: 'var(--tint-amber)',  fg: 'var(--tint-amber-t)'  },
  { bg: 'var(--tint-blue)',   fg: 'var(--tint-blue-t)'   },
  { bg: 'var(--tint-green)',  fg: 'var(--tint-green-t)'  },
  { bg: 'var(--tint-purple)', fg: 'var(--tint-purple-t)' },
  { bg: 'var(--tint-pink)',   fg: 'var(--tint-pink-t)'   },
];

// ── State ──────────────────────────────────────────────────

let cachedEntries = [];

// ── Boot ───────────────────────────────────────────────────

(async function () {
  if (!initShell('log')) return;
  setTopbar('Revision log');

  try {
    const [usersRes, actionsRes] = await Promise.all([
      apiCall('GET', '/api/users'),
      apiCall('GET', '/api/audit-log/actions'),
    ]);
    populateFilterDropdowns(usersRes.users || [], actionsRes.actions || []);
  } catch (_) { /* filters stay empty — non-fatal */ }

  await loadLog();

  document.getElementById('log-apply').addEventListener('click', loadLog);
  document.getElementById('log-reset').addEventListener('click', resetFilters);
  document.getElementById('log-brief-search').addEventListener('input', () => renderTimeline(cachedEntries));
})();

// ── Filters ────────────────────────────────────────────────

function populateFilterDropdowns(users, actions) {
  const actorSel  = document.getElementById('log-actor');
  const actionSel = document.getElementById('log-action');
  users.forEach(u => {
    const o = document.createElement('option');
    o.value = u.id; o.textContent = u.name;
    actorSel.appendChild(o);
  });
  actions.forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = ACTION_LABELS[a] || prettifyAction(a);
    actionSel.appendChild(o);
  });
}

function resetFilters() {
  ['log-actor','log-action','log-from','log-to','log-brief-search'].forEach(id => {
    document.getElementById(id).value = '';
  });
  loadLog();
}

// ── Data ───────────────────────────────────────────────────

async function loadLog() {
  const p = new URLSearchParams();
  const actor  = document.getElementById('log-actor').value;
  const action = document.getElementById('log-action').value;
  const from   = document.getElementById('log-from').value;
  const to     = document.getElementById('log-to').value;
  if (actor)  p.set('actor_id',  actor);
  if (action) p.set('action',    action);
  if (from)   p.set('from_date', from);
  if (to)     p.set('to_date',   to);
  p.set('limit', '200');

  document.getElementById('log-timeline').innerHTML = '<div class="empty-state">Loading…</div>';

  try {
    const { entries } = await apiCall('GET', `/api/audit-log?${p}`);
    cachedEntries = entries;
    renderTimeline(entries);
    const filtered = p.size > 1; // limit param always present, so >1 means real filter
    document.getElementById('log-sub').textContent =
      `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}${filtered ? ' (filtered)' : ''}`;
  } catch (err) {
    document.getElementById('log-timeline').innerHTML =
      `<div class="empty-state">Could not load: ${escapeHtml(err.message)}</div>`;
  }
}

// ── Render ─────────────────────────────────────────────────

function renderTimeline(entries) {
  const briefQ   = (document.getElementById('log-brief-search').value || '').toLowerCase().trim();
  const filtered = briefQ
    ? entries.filter(e =>
        (e.brief_name || '').toLowerCase().includes(briefQ) ||
        (e.brief_code || '').toLowerCase().includes(briefQ))
    : entries;

  const tl = document.getElementById('log-timeline');
  if (!filtered.length) {
    tl.innerHTML = `<div class="empty-state">No entries match.</div>`;
    return;
  }

  tl.innerHTML = filtered.map(e => {
    const color   = ACTION_COLOR[e.action] || 'var(--gray)';
    const label   = ACTION_LABELS[e.action] || prettifyAction(e.action);
    const palette = AVATAR_PALETTES[(e.actor_id || 0) % AVATAR_PALETTES.length];

    const actorHtml = e.actor_name
      ? `<div class="log-actor">
           <div class="log-av" style="background:${palette.bg};color:${palette.fg}">${escapeHtml(e.actor_initials)}</div>
           ${escapeHtml(e.actor_name)}
         </div>`
      : `<span class="log-actor">System</span>`;

    const briefHtml = e.brief_name
      ? `<a href="/brief.html?id=${e.brief_id}" class="log-brief-link">${escapeHtml(e.brief_name)}</a>`
      : '';

    return `
      <div class="log-entry">
        <span class="log-dot" style="background:${color}"></span>
        <div class="log-body">
          <div class="log-action">${escapeHtml(label)}</div>
          ${e.detail ? `<div class="log-detail">${escapeHtml(e.detail)}</div>` : ''}
          <div class="log-meta">
            ${actorHtml}
            ${briefHtml}
            <span class="log-time">${relativeTime(e.created_at)}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ── Helpers ────────────────────────────────────────────────

function prettifyAction(a) {
  return (a || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function relativeTime(iso) {
  if (!iso) return '';
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  <  1) return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  === 1) return 'yesterday';
  if (days  < 30)  return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// Dashboard page
// ============================================================
(async function () {
  if (!initShell('dashboard')) return;

  setTopbar('Dashboard');

  const user = getCurrentUser();
  document.getElementById('greet').textContent = `${timeGreeting()}, ${user.name}`;

  try {
    const { briefs } = await apiCall('GET', '/api/briefs');
    renderStats(briefs);
    renderBriefList(briefs);
    document.getElementById('sub').textContent =
      briefs.length
        ? `${briefs.length} brief${briefs.length === 1 ? '' : 's'} across the team.`
        : 'No briefs yet — click "New brief" to create the first one.';
  } catch (err) {
    document.getElementById('brief-list').innerHTML =
      `<div class="empty-state">Could not load briefs: ${err.message}</div>`;
  }
})();

function renderStats(briefs) {
  const counts = {
    active: briefs.filter(b => !['approved', 'pushed_to_todoist', 'archived'].includes(b.status)).length,
    pending: briefs.filter(b => b.status && b.status.startsWith('approval_')).length,
    review: briefs.filter(b => b.status && b.status.startsWith('review_')).length,
    approved: briefs.filter(b => ['approved', 'pushed_to_todoist'].includes(b.status)).length,
  };
  document.getElementById('stat-active').innerHTML = `${counts.active} <span class="stat-dot" style="background: var(--text)"></span>`;
  document.getElementById('stat-pending').innerHTML = `${counts.pending} <span class="stat-dot" style="background: var(--amber)"></span>`;
  document.getElementById('stat-review').innerHTML = `${counts.review} <span class="stat-dot" style="background: var(--blue)"></span>`;
  document.getElementById('stat-approved').innerHTML = `${counts.approved} <span class="stat-dot" style="background: var(--green)"></span>`;
}

function renderBriefList(briefs) {
  const list = document.getElementById('brief-list');
  if (!briefs.length) {
    list.innerHTML = `<div class="empty-state">No briefs yet.</div>`;
    return;
  }

  list.innerHTML = briefs.map(b => {
    const color = colorForMode(b.mode);
    const modeTag = tagForMode(b.mode);
    const statusTag = tagForStatus(b.status);
    const meta = [
      (b.regions || []).join(' · ') || 'No region',
      b.campaign_type || '',
      b.go_live_date ? `Go-live ${formatDate(b.go_live_date)}` : '',
    ].filter(Boolean).join(' · ');

    return `
      <a href="/brief.html?id=${b.id}" class="brief-row" data-id="${b.id}">
        <div class="brief-color" style="background: ${color}"></div>
        <div class="brief-main">
          <div class="brief-title">${escapeHtml(b.name)}</div>
          <div class="brief-meta">${escapeHtml(meta)}</div>
        </div>
        <span class="tag ${modeTag.cls}">${modeTag.label}</span>
        <span class="tag ${statusTag.cls}">${statusTag.label}</span>
        <div class="brief-owner">
          <div class="brief-av" style="background: var(--surface-alt)">${b.owner_initials || '??'}</div>
          ${b.owner_name || 'Unassigned'}
        </div>
      </a>`;
  }).join('');
}

function colorForMode(mode) {
  return mode === 'full' ? 'var(--blue)' : mode === 'custom' ? 'var(--violet)' : 'var(--amber)';
}
function tagForMode(mode) {
  if (mode === 'full') return { cls: 'tag-blue', label: 'Full' };
  if (mode === 'custom') return { cls: 'tag-purple', label: 'Custom' };
  return { cls: 'tag-amber', label: 'Quick' };
}
function tagForStatus(s) {
  const map = {
    'draft':                  { cls: 'tag-gray',  label: 'Draft' },
    'understanding_pending':  { cls: 'tag-blue',  label: 'Understanding' },
    'understanding_confirmed':{ cls: 'tag-blue',  label: 'Confirmed' },
    'approval_stage_1':       { cls: 'tag-amber', label: 'Approval 1' },
    'approval_stage_2':       { cls: 'tag-amber', label: 'Approval 2' },
    'approval_stage_3':       { cls: 'tag-amber', label: 'Approval 3' },
    'review_round_1':         { cls: 'tag-blue',  label: 'Review R1' },
    'review_round_2':         { cls: 'tag-blue',  label: 'Review R2' },
    'approved':               { cls: 'tag-green', label: 'Approved' },
    'pushed_to_todoist':      { cls: 'tag-green', label: 'Pushed' },
    'archived':               { cls: 'tag-gray',  label: 'Archived' },
  };
  return map[s] || { cls: 'tag-gray', label: s || 'Unknown' };
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function escapeHtml(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
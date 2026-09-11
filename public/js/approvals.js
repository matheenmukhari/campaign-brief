// ============================================================
// Approvals inbox — briefs waiting on the current user
// ============================================================
(async function () {
  if (!initShell('approvals')) return;
  setTopbar('Approvals');

  try {
    const { pending } = await apiCall('GET', '/api/approvals/pending');
    renderInbox(pending);
  } catch (err) {
    document.getElementById('approvals-list').innerHTML =
      `<div class="empty-state">Could not load: ${err.message}</div>`;
  }
})();

function renderInbox(pending) {
  const sub = document.getElementById('approvals-sub');
  const list = document.getElementById('approvals-list');

  if (!pending.length) {
    sub.textContent = 'You are all caught up.';
    list.innerHTML = `
      <div class="inbox-empty">
        <strong>Nothing waiting</strong>
        No briefs need your sign-off right now.
      </div>`;
    return;
  }

  sub.textContent = `${pending.length} brief${pending.length === 1 ? '' : 's'} waiting on you.`;

  list.innerHTML = `
    <div class="brief-list">
      ${pending.map(p => `
        <a href="/brief.html?id=${p.brief_id}" class="brief-row">
          <div class="brief-color" style="background: var(--amber)"></div>
          <div class="brief-main">
            <div class="brief-title">${escapeHtml(p.brief_name)}</div>
            <div class="brief-meta">${escapeHtml((p.regions || []).join(' · '))} · Stage ${p.stage} · ${p.campaign_type || 'Campaign'}${p.go_live_date ? ' · Go-live ' + formatDate(p.go_live_date) : ''}</div>
          </div>
          <span class="tag tag-amber">Stage ${p.stage}</span>
          <span class="tag tag-blue">Review</span>
        </a>
      `).join('')}
    </div>`;
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

// ============================================================
// Content review inbox — briefs waiting on the current user
// ============================================================
(async function () {
  if (!initShell('review')) return;
  setTopbar('Content review');

  try {
    const { pending } = await apiCall('GET', '/api/reviews/pending');
    renderInbox(pending);
  } catch (err) {
    document.getElementById('review-list').innerHTML =
      `<div class="empty-state">Could not load: ${escapeHtml(err.message)}</div>`;
  }
})();

function renderInbox(pending) {
  const sub = document.getElementById('review-sub');
  const list = document.getElementById('review-list');

  if (!pending.length) {
    sub.textContent = 'You are all caught up.';
    list.innerHTML = `
      <div class="inbox-empty">
        <strong>Nothing waiting</strong>
        No briefs need your review right now.
      </div>`;
    return;
  }

  sub.textContent = `${pending.length} brief${pending.length === 1 ? '' : 's'} waiting on you.`;

  list.innerHTML = `
    <div class="brief-list">
      ${pending.map(p => {
        const roundLabel = p.round === 1 ? 'Round 1 — Feedback' : 'Round 2 — Sign-off';
        const tagCls = p.round === 1 ? 'tag-blue' : 'tag-amber';
        return `
          <a href="/brief.html?id=${p.brief_id}" class="brief-row">
            <div class="brief-color" style="background: var(--blue)"></div>
            <div class="brief-main">
              <div class="brief-title">${escapeHtml(p.brief_name)}</div>
              <div class="brief-meta">${escapeHtml((p.regions || []).join(' · '))}${p.campaign_type ? ' · ' + escapeHtml(p.campaign_type) : ''}${p.go_live_date ? ' · Go-live ' + formatDate(p.go_live_date) : ''}</div>
            </div>
            <span class="tag ${tagCls}">${roundLabel}</span>
          </a>`;
      }).join('')}
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

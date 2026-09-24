// ============================================================
// QA checklist — split-pane inbox + checklist cockpit
// ============================================================

// ── QA item definitions ────────────────────────────────────

const QA_GROUPS = [
  {
    id: 'core',
    label: 'Core',
    items: [
      { id: 'brand_guidelines', label: 'Brand guidelines check completed' },
      { id: 'legal_compliance',  label: 'Legal / compliance sign-off completed' },
      { id: 'tracking_qa',       label: 'Tracking QA — UTM, pixel, conversion events verified' },
      { id: 'landing_page_qa',   label: 'Landing page QA — links, forms, load speed tested' },
      { id: 'crm_rendering',     label: 'CRM rendering + link check across email clients' },
    ],
  },
  {
    id: 'regional',
    label: 'Regional',
    items: [
      { id: 'arabic_qa',    label: 'Arabic language QA — RTL layout, copy reviewed',  condition: b => b.requires_arabic },
      { id: 'uk_approval',  label: 'UK regional approval completed',                   condition: b => (b.regions || []).some(r => /uk/i.test(r)) },
      { id: 'gcc_approval', label: 'GCC regional approval completed',                  condition: b => (b.regions || []).some(r => /gcc|uae|dubai/i.test(r)) },
    ],
  },
  {
    id: 'post_launch',
    label: 'Post-launch',
    items: [
      { id: 'tasks_confirmed', label: 'Todoist tasks pushed and confirmed by all team leads' },
      { id: 'review_date',     label: 'Post-campaign review date booked in shared calendar' },
      { id: 'asset_archive',   label: 'Asset archive uploaded to shared folder' },
      { id: 'attribution',     label: 'Attribution model confirmed and dashboard live' },
    ],
  },
];

function applicableItems(brief) {
  return QA_GROUPS.flatMap(g =>
    g.items.filter(item => !item.condition || item.condition(brief))
  );
}

function isQaComplete(brief) {
  const checklist = brief.qa_checklist || {};
  return applicableItems(brief).every(item => checklist[item.id] === true);
}

// ── State ──────────────────────────────────────────────────

let allBriefs = [];
let selectedBriefId = null;
let selectedBrief   = null;

// ── Boot ───────────────────────────────────────────────────

(async function () {
  if (!initShell('qa')) return;
  setTopbar('QA checklist');

  try {
    const [pendingRes, doneRes] = await Promise.all([
      apiCall('GET', '/api/briefs?status=pushed_to_todoist'),
      apiCall('GET', '/api/briefs?status=qa_complete'),
    ]);
    allBriefs = [
      ...(pendingRes.briefs || []),
      ...(doneRes.briefs    || []),
    ];
    renderInbox();

    const urlBriefId = new URLSearchParams(window.location.search).get('brief');
    const preselect  = urlBriefId
      ? allBriefs.find(b => String(b.id) === urlBriefId)
      : allBriefs.find(b => b.status === 'pushed_to_todoist') || allBriefs[0];

    if (preselect) selectBrief(preselect.id);

  } catch (err) {
    document.getElementById('qa-cockpit').innerHTML =
      `<div class="pc-empty">Could not load: ${escapeHtml(err.message)}</div>`;
  }
})();

// ── Inbox ──────────────────────────────────────────────────

function renderInbox() {
  const inbox       = document.getElementById('qa-inbox');
  const pendingList = allBriefs.filter(b => b.status === 'pushed_to_todoist');
  const doneList    = allBriefs.filter(b => b.status === 'qa_complete');

  const subText = pendingList.length
    ? `${pendingList.length} awaiting QA`
    : 'All QA complete';

  if (!allBriefs.length) {
    inbox.innerHTML = `
      <div class="push-inbox-hd">
        <div class="push-inbox-title">QA checklist</div>
        <div class="push-inbox-sub">Nothing to QA</div>
      </div>
      <div class="inbox-empty">
        <strong>No briefs</strong>
        No briefs have been pushed to Todoist yet.
      </div>`;
    return;
  }

  const pendingHtml = pendingList.length ? `
    <div class="push-inbox-section">Awaiting QA</div>
    ${pendingList.map(b => inboxRow(b, false)).join('')}
  ` : '';

  const doneHtml = doneList.length ? `
    <div class="push-inbox-section">QA complete</div>
    ${doneList.map(b => inboxRow(b, true)).join('')}
  ` : '';

  inbox.innerHTML = `
    <div class="push-inbox-hd">
      <div class="push-inbox-title">QA checklist</div>
      <div class="push-inbox-sub">${subText}</div>
    </div>
    ${pendingHtml}${doneHtml}`;

  if (selectedBriefId) {
    const row = document.querySelector(`.push-inbox-row[data-id="${selectedBriefId}"]`);
    if (row) row.classList.add('selected');
  }
}

function inboxRow(b, done) {
  const dotColor = done ? 'var(--green)' : 'var(--violet)';
  const goLive   = b.go_live_date ? 'Go-live ' + formatDate(b.go_live_date) : '';
  const meta     = [b.brief_code, (b.regions || []).join(', '), goLive].filter(Boolean).join(' · ');
  return `
    <div class="push-inbox-row" data-id="${b.id}" onclick="selectBrief(${b.id})">
      <span class="pi-dot" style="background:${dotColor}"></span>
      <div class="pi-main">
        <div class="pi-name">${escapeHtml(b.name)}</div>
        <div class="pi-meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
}

// ── Cockpit ────────────────────────────────────────────────

async function selectBrief(id) {
  selectedBriefId = id;

  document.querySelectorAll('.push-inbox-row').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector(`.push-inbox-row[data-id="${id}"]`);
  if (row) row.classList.add('selected');

  const brief = allBriefs.find(b => b.id === id);
  if (!brief) return;

  // Re-fetch so we have up-to-date qa_checklist
  try {
    const { brief: fresh } = await apiCall('GET', `/api/briefs/${id}`);
    selectedBrief = fresh;
    const idx = allBriefs.findIndex(b => b.id === id);
    if (idx !== -1) allBriefs[idx] = fresh;
    renderCockpit(fresh);
  } catch (err) {
    document.getElementById('qa-cockpit').innerHTML =
      `<div class="pc-empty">Could not load brief: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCockpit(brief) {
  const checklist  = brief.qa_checklist || {};
  const isDone     = brief.status === 'qa_complete';
  const complete   = isQaComplete(brief);

  const completeBanner = (complete || isDone) ? `
    <div class="qa-complete-banner">
      <span class="qa-complete-banner-text">✓ QA complete — brief is launch-ready</span>
      ${!isDone ? `<button type="button" class="btn btn-ok btn-sm" id="qa-complete-btn">Mark QA complete</button>` : ''}
    </div>` : '';

  const groupsHtml = QA_GROUPS.map(group => {
    const applicable = group.items.filter(item => !item.condition || item.condition(brief));
    if (!applicable.length) return '';
    return `
      <div class="qa-group-label">${escapeHtml(group.label)}</div>
      ${applicable.map(item => {
        const checked = checklist[item.id] === true;
        return `
          <div class="qa-item${checked ? ' checked' : ''}" id="qa-row-${item.id}">
            <input type="checkbox" id="qa-cb-${item.id}" ${checked ? 'checked' : ''} ${isDone ? 'disabled' : ''}>
            <label class="qa-item-label" for="qa-cb-${item.id}">${escapeHtml(item.label)}</label>
          </div>`;
      }).join('')}`;
  }).join('');

  document.getElementById('qa-cockpit').innerHTML = `
    <div class="pc-hd">
      <div class="pc-hd-name">${escapeHtml(brief.name)}</div>
      <div class="pc-hd-meta">
        <span>${escapeHtml(brief.brief_code)}</span>
        ${brief.go_live_date ? `<span>·</span><span>Go-live ${formatDate(brief.go_live_date)}</span>` : ''}
      </div>
    </div>
    ${completeBanner}
    <div id="qa-error" style="display:none" class="pc-banner pc-banner-error"></div>
    ${groupsHtml}`;

  // Attach checkbox listeners
  applicableItems(brief).forEach(item => {
    const cb = document.getElementById(`qa-cb-${item.id}`);
    if (!cb || isDone) return;
    cb.addEventListener('change', () => toggleItem(brief.id, item.id, cb.checked));
  });

  // Attach complete button
  const completeBtn = document.getElementById('qa-complete-btn');
  if (completeBtn) {
    completeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      markQaComplete(brief.id);
    });
  }
}

async function toggleItem(briefId, itemId, checked) {
  // Optimistic UI update
  const row = document.getElementById(`qa-row-${itemId}`);
  if (row) row.classList.toggle('checked', checked);

  try {
    const { qa_checklist } = await apiCall('POST', `/api/briefs/${briefId}/qa-item`, {
      item_id: itemId,
      checked,
    });
    // Update local state and re-check completion without full re-render
    const brief = allBriefs.find(b => b.id === briefId);
    if (brief) {
      brief.qa_checklist = qa_checklist;
      selectedBrief = brief;
    }
    // If now complete, insert/update the complete banner without re-rendering whole cockpit
    if (brief && isQaComplete(brief) && brief.status !== 'qa_complete') {
      let banner = document.querySelector('.qa-complete-banner');
      if (!banner) {
        const cockpit = document.getElementById('qa-cockpit');
        const hd = cockpit.querySelector('.pc-hd');
        const bannerEl = document.createElement('div');
        bannerEl.className = 'qa-complete-banner';
        bannerEl.innerHTML = `
          <span class="qa-complete-banner-text">✓ QA complete — brief is launch-ready</span>
          <button type="button" class="btn btn-ok btn-sm" id="qa-complete-btn">Mark QA complete</button>`;
        hd.insertAdjacentElement('afterend', bannerEl);
        document.getElementById('qa-complete-btn').addEventListener('click', e => {
          e.preventDefault();
          markQaComplete(briefId);
        });
      }
    } else {
      const banner = document.querySelector('.qa-complete-banner');
      if (banner && brief && !isQaComplete(brief)) banner.remove();
    }
  } catch (err) {
    // Roll back optimistic update
    const cb = document.getElementById(`qa-cb-${itemId}`);
    if (cb) cb.checked = !checked;
    if (row) row.classList.toggle('checked', !checked);
    const errEl = document.getElementById('qa-error');
    if (errEl) { errEl.textContent = err.message || 'Could not save'; errEl.style.display = 'block'; }
  }
}

async function markQaComplete(briefId) {
  try {
    await apiCall('POST', `/api/briefs/${briefId}/mark-qa-complete`);
    toast('QA complete — brief marked as launch-ready');
    // Reload brief and refresh both panes
    const { brief: fresh } = await apiCall('GET', `/api/briefs/${briefId}`);
    const idx = allBriefs.findIndex(b => b.id === briefId);
    if (idx !== -1) allBriefs[idx] = fresh;
    selectedBrief = fresh;
    renderInbox();
    renderCockpit(fresh);
    // Re-apply selection highlight
    const row = document.querySelector(`.push-inbox-row[data-id="${briefId}"]`);
    if (row) row.classList.add('selected');
  } catch (err) {
    toast(err.message || 'Could not mark QA complete');
  }
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
// New brief page
// ============================================================
let currentMode = 'quick';
let activeCustomSections = new Set(['audience', 'localisation']);
let _teamUsers = [];
let approvalChain = []; // [{id, name, initials, role}]

(async function () {
  if (!initShell('new-brief')) return;
  setTopbar('New brief');

  // Load team members for owner dropdowns
  await loadTeamOptions();

  // Wire up mode selector
  document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', () => selectMode(card.dataset.mode));
  });

// Wire up custom section pills
document.querySelectorAll('#custom-pills .pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    pill.classList.toggle('on');
    const section = pill.dataset.section;
    if (pill.classList.contains('on')) activeCustomSections.add(section);
    else activeCustomSections.delete(section);
    if (currentMode === 'custom') applyMode('custom');
  });
});

// Wire up regions & channels pills
document.querySelectorAll('#regions-pills .pill, #channels-pills .pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    e.preventDefault();
    pill.classList.toggle('on');
  });
});

  // Wire up region tabs in Localisation section
  document.querySelectorAll('#loc-tabs .rtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#loc-tabs .rtab').forEach(t => t.classList.remove('on'));
      tab.classList.add('on');
      document.querySelectorAll('[data-panel]').forEach(p => p.classList.remove('on'));
      document.querySelector(`[data-panel="${tab.dataset.loc}"]`).classList.add('on');
    });
  });

  // Save + Submit buttons
  document.getElementById('save-btn').addEventListener('click', () => submitForm(false));
  document.getElementById('submit-btn').addEventListener('click', () => submitForm(true));

  // Start in Quick mode
  applyMode('quick');
})();

async function loadTeamOptions() {
  try {
    const { users } = await apiCall('GET', '/api/users');
    _teamUsers = users;

    const chainSel = document.getElementById('chain-select');
    users.forEach(u => {
      chainSel.insertAdjacentHTML('beforeend',
        `<option value="${escapeAttr(u.id)}">${escapeHtml(u.name)}</option>`);
    });

    // Owner dropdown uses real IDs
    const ownerEl = document.getElementById('f-owner');
    if (ownerEl) users.forEach(u => ownerEl.insertAdjacentHTML('beforeend',
      `<option value="${escapeAttr(u.id)}">${escapeHtml(u.name)}</option>`));

    // Informational dropdowns store names (displayed as-is in the data blob)
    ['d-dash-owner', 'd-compliance'].forEach(id => {
      const el = document.getElementById(id);
      if (el) users.forEach(u => el.insertAdjacentHTML('beforeend',
        `<option value="${escapeAttr(u.name)}">${escapeHtml(u.name)}</option>`));
    });
  } catch (err) {
    console.error('Could not load team:', err);
  }
}

// ── Approval chain builder ──

function renderChain() {
  const list = document.getElementById('chain-list');
  if (!approvalChain.length) {
    list.innerHTML = '<div class="chain-empty">No approvers added yet — add at least one above.</div>';
    return;
  }
  list.innerHTML = approvalChain.map((u, i) => `
    <div class="appr-card">
      <div class="appr-info">
        <div class="appr-av" style="background:var(--tint-blue);color:var(--tint-blue-t)">${escapeHtml(u.initials)}</div>
        <div>
          <div class="appr-name">${escapeHtml(u.name)}</div>
          <div class="appr-role">Stage ${i + 1}</div>
        </div>
      </div>
      <div class="appr-acts">
        ${i > 0 ? `<button type="button" class="btn btn-ghost btn-xs" onclick="moveApprover(${i}, -1)">↑</button>` : ''}
        ${i < approvalChain.length - 1 ? `<button type="button" class="btn btn-ghost btn-xs" onclick="moveApprover(${i}, 1)">↓</button>` : ''}
        <button type="button" class="btn btn-ghost btn-xs" style="color:var(--rose)" onclick="removeApprover(${i})">Remove</button>
      </div>
    </div>
  `).join('');
}

function addApprover() {
  const sel = document.getElementById('chain-select');
  const userId = sel.value;
  if (!userId) return;
  const user = _teamUsers.find(u => String(u.id) === userId);
  if (!user) return;
  approvalChain.push({ id: user.id, name: user.name, initials: user.initials, role: user.role });
  sel.value = '';
  renderChain();
}

function removeApprover(i) {
  approvalChain.splice(i, 1);
  renderChain();
}

function moveApprover(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= approvalChain.length) return;
  [approvalChain[i], approvalChain[j]] = [approvalChain[j], approvalChain[i]];
  renderChain();
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeAttr(s) { return escapeHtml(s); }

function selectMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.mode === mode);
  });
  document.getElementById('custom-picker').style.display = mode === 'custom' ? 'block' : 'none';
  applyMode(mode);
}

function applyMode(mode) {
  const sections = ['objectives', 'audience', 'localisation', 'messaging', 'channels', 'kpis', 'risk'];
  sections.forEach(s => {
    const el = document.querySelector(`.section-${s}`);
    if (!el) return;
    if (mode === 'quick') el.style.display = 'none';
    else if (mode === 'full') el.style.display = '';
    else el.style.display = activeCustomSections.has(s) ? '' : 'none';
  });
}

function toggleCard(head) {
  const body = head.nextElementSibling;
  const chev = head.querySelector('.card-chevron');
  const open = body.classList.toggle('open');
  if (chev) chev.classList.toggle('open', open);
}

function collectPills(containerId) {
  return [...document.querySelectorAll(`#${containerId} .pill.on`)].map(p => p.dataset.value);
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function collectExtraData() {
  // Everything with a `d-` prefix goes into the JSON data blob
  const data = {};
  document.querySelectorAll('[id^="d-"]').forEach(el => {
    if (el.value && el.value.trim()) data[el.id.substring(2)] = el.value.trim();
  });
  return data;
}

async function submitForm(alsoSubmit) {
  const btn = alsoSubmit ? document.getElementById('submit-btn') : document.getElementById('save-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';

  // Required fields for Quick brief
  const name = val('f-name');
  const objective = val('f-obj1');
  const priority = val('f-priority');
  const type = val('f-type');
  const message = val('f-msg');
  const asset = val('f-asset');
  const golive = val('f-launch');
  const deadline = val('f-deadline');
  const regions = collectPills('regions-pills');
  const channels = collectPills('channels-pills');

  const missing = [];
  if (!name) missing.push('Campaign name');
  if (!objective) missing.push('Objective');
  if (!priority) missing.push('Priority');
  if (!type) missing.push('Campaign type');
  if (!message) missing.push('Key message / CTA');
  if (!asset) missing.push('Asset type');
  if (!golive) missing.push('Go-live date');
  if (!deadline) missing.push('Asset deadline');
  if (!regions.length) missing.push('At least one region');
  if (!channels.length) missing.push('At least one channel');

  if (!approvalChain.length) missing.push('At least one approver');

  if (missing.length) {
    toast('Missing: ' + missing.join(', '));
    btn.disabled = false;
    btn.textContent = originalText;
    return;
  }

  const requiresArabic = regions.includes('GCC-AR');

  const payload = {
    name,
    mode: currentMode,
    campaign_type: type,
    priority,
    objective,
    key_message: message,
    regions,
    channels,
    asset_type: asset,
    notes: val('f-notes') || null,
    development_name: val('f-dev') || null,
    go_live_date: golive,
    asset_deadline: deadline,
    end_date: val('f-end') || null,
    requires_arabic: requiresArabic,
    data: collectExtraData(),
    approvers: approvalChain.map(u => u.id),
  };

  try {
    const { brief } = await apiCall('POST', '/api/briefs', payload);

    if (alsoSubmit) {
      await apiCall('POST', `/api/briefs/${brief.id}/submit`);
      toast('Brief saved and submitted');
    } else {
      toast('Draft saved');
    }

    setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
  } catch (err) {
    toast(err.message || 'Could not save brief');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}
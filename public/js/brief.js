// ============================================================
// Brief detail page — view, edit, delete, archive
// ============================================================
let brief = null;
let currentUser = null;
let isEditMode = false;

(async function () {
  if (!initShell('dashboard')) return;
  currentUser = getCurrentUser();

  const urlParams = new URLSearchParams(window.location.search);
  const briefId = urlParams.get('id');
  if (!briefId) {
    document.getElementById('brief-content').innerHTML =
      `<div class="empty-state">No brief ID in URL. <a href="/dashboard.html">Back to dashboard</a></div>`;
    return;
  }

  await loadBrief(briefId);
})();

async function loadBrief(id) {
  try {
    const res = await apiCall('GET', `/api/briefs/${id}`);
    brief = res.brief;
    setTopbar('Dashboard', brief.name);
    render();
  } catch (err) {
    document.getElementById('brief-content').innerHTML =
      `<div class="empty-state">Could not load brief: ${err.message}. <a href="/dashboard.html">Back</a></div>`;
  }
}

function render() {
  if (isEditMode) renderEditMode();
  else renderViewMode();
}

function renderViewMode() {
  const modeTag = tagForMode(brief.mode);
  const statusTag = tagForStatus(brief.status);
  const canEdit = canUserEdit();
  const canDelete = brief.status === 'draft' && canUserEdit();
  const canArchive = brief.status !== 'archived' && brief.status !== 'draft' && canUserArchive();

  const actionButtons = [];
  if (canEdit) actionButtons.push(`<button class="btn btn-ghost btn-sm" onclick="toggleEdit()">Edit</button>`);
  if (brief.status === 'draft' && canEdit) actionButtons.push(`<button class="btn btn-primary btn-sm" onclick="submitBrief()">Submit for approval</button>`);

  const extra = brief.extra_data || {};

  document.getElementById('brief-content').innerHTML = `
    <div class="brief-detail-head">
      <div>
        <h1>${escapeHtml(brief.name)}</h1>
        <div class="brief-detail-meta">
          <span class="tag ${modeTag.cls}">${modeTag.label}</span>
          <span class="tag ${statusTag.cls}">${statusTag.label}</span>
          <span class="sep">·</span>
          <span>${brief.brief_code}</span>
        </div>
      </div>
      <div class="brief-detail-actions">${actionButtons.join('')}</div>
    </div>

    <div class="card" style="margin-bottom: 14px;">
      <div class="card-body open">
        ${row('Requester', brief.requester_name)}
        ${row('Owner', brief.owner_name)}
        ${row('Campaign type', brief.campaign_type)}
        ${row('Priority', brief.priority)}
        ${row('Development', brief.development_name)}
        ${row('Objective', brief.objective)}
        ${row('Key message', brief.key_message)}
        ${row('Regions', (brief.regions || []).join(', '))}
        ${row('Channels', (brief.channels || []).join(', '))}
        ${row('Asset type', brief.asset_type)}
        ${row('Notes', brief.notes)}
        ${row('Go-live date', formatDate(brief.go_live_date))}
        ${row('Asset deadline', formatDate(brief.asset_deadline))}
        ${row('Campaign end', formatDate(brief.end_date))}
        ${row('Requires Arabic QA', brief.requires_arabic ? 'Yes' : 'No')}
        ${row('Requires CEO', brief.requires_ceo ? 'Yes' : 'No')}
      </div>
    </div>

    ${renderExtraData(extra)}

    ${(canDelete || canArchive) ? `
      <div class="danger-zone">
        <h3>Danger zone</h3>
        ${canDelete
          ? `<p>This brief is a draft. Deleting it is permanent and cannot be undone.</p>
             <button class="btn btn-danger btn-sm" onclick="deleteBrief()">Delete brief</button>`
          : ''}
        ${canArchive
          ? `<p>This brief has been submitted or is beyond draft stage. Archiving hides it from lists but preserves the full record and audit trail.</p>
             <button class="btn btn-danger btn-sm" onclick="archiveBrief()">Archive brief</button>`
          : ''}
      </div>
    ` : ''}

    <div style="margin-top: 24px;">
      <a href="/dashboard.html" class="btn btn-ghost btn-sm">← Back to dashboard</a>
    </div>
  `;
}

function row(key, val) {
  const cls = val ? 'detail-val' : 'detail-val empty';
  const display = val ? escapeHtml(String(val)) : '—';
  return `<div class="detail-row"><div class="detail-key">${key}</div><div class="${cls}">${display}</div></div>`;
}

function renderExtraData(extra) {
  const entries = Object.entries(extra).filter(([, v]) => v);
  if (!entries.length) return '';
  return `
    <div class="card" style="margin-bottom: 14px;">
      <div class="card-head" style="cursor: default;"><div class="card-title">Additional details</div></div>
      <div class="card-body open">
        ${entries.map(([k, v]) => row(prettifyKey(k), v)).join('')}
      </div>
    </div>
  `;
}

function prettifyKey(k) {
  return k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function renderEditMode() {
  document.getElementById('brief-content').innerHTML = `
    <div class="brief-detail-head">
      <div>
        <h1>Edit: ${escapeHtml(brief.name)}</h1>
        <div class="brief-detail-meta"><span>${brief.brief_code}</span></div>
      </div>
      <div class="brief-detail-actions">
        <button class="btn btn-ghost btn-sm" onclick="cancelEdit()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="saveEdit()">Save changes</button>
      </div>
    </div>

    <div class="edit-hint">
      Only editable while brief is a <strong>draft</strong> or <strong>awaiting understanding confirmation</strong>.
      Once approvals begin, brief locks.
    </div>

    <div class="card" style="margin-bottom: 14px;">
      <div class="card-body open">
        <div class="fg fg-2">
          <div><label class="lbl">Campaign name</label><input type="text" id="e-name" value="${escapeAttr(brief.name)}"></div>
          <div><label class="lbl">Priority</label>
            <select id="e-priority">
              <option value="">Select…</option>
              <option value="high"${brief.priority === 'high' ? ' selected' : ''}>High</option>
              <option value="medium"${brief.priority === 'medium' ? ' selected' : ''}>Medium</option>
              <option value="low"${brief.priority === 'low' ? ' selected' : ''}>Low</option>
            </select></div>
        </div>
        <div class="fl"><label class="lbl">Campaign type</label>
          <input type="text" id="e-type" value="${escapeAttr(brief.campaign_type)}"></div>
        <div class="fl"><label class="lbl">Development / property</label>
          <input type="text" id="e-dev" value="${escapeAttr(brief.development_name)}"></div>
        <div class="fl"><label class="lbl">Objective</label>
          <input type="text" id="e-obj" value="${escapeAttr(brief.objective)}"></div>
        <div class="fl"><label class="lbl">Key message / CTA</label>
          <input type="text" id="e-msg" value="${escapeAttr(brief.key_message)}"></div>
        <div class="fl"><label class="lbl">Asset type</label>
          <input type="text" id="e-asset" value="${escapeAttr(brief.asset_type)}"></div>
        <div class="fl"><label class="lbl">Notes</label>
          <input type="text" id="e-notes" value="${escapeAttr(brief.notes)}"></div>
        <div class="fg fg-3">
          <div><label class="lbl">Go-live date</label>
            <input type="date" id="e-launch" value="${dateInputValue(brief.go_live_date)}"></div>
          <div><label class="lbl">Asset deadline</label>
            <input type="date" id="e-deadline" value="${dateInputValue(brief.asset_deadline)}"></div>
          <div><label class="lbl">Campaign end</label>
            <input type="date" id="e-end" value="${dateInputValue(brief.end_date)}"></div>
        </div>
      </div>
    </div>
  `;
}

async function saveEdit() {
  const payload = {
    name: document.getElementById('e-name').value.trim(),
    priority: document.getElementById('e-priority').value || null,
    campaign_type: document.getElementById('e-type').value.trim() || null,
    development_name: document.getElementById('e-dev').value.trim() || null,
    objective: document.getElementById('e-obj').value.trim() || null,
    key_message: document.getElementById('e-msg').value.trim() || null,
    asset_type: document.getElementById('e-asset').value.trim() || null,
    notes: document.getElementById('e-notes').value.trim() || null,
    go_live_date: document.getElementById('e-launch').value || null,
    asset_deadline: document.getElementById('e-deadline').value || null,
    end_date: document.getElementById('e-end').value || null,
  };

  try {
    await apiCall('PATCH', `/api/briefs/${brief.id}`, payload);
    toast('Changes saved');
    isEditMode = false;
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Save failed');
  }
}

function toggleEdit() { isEditMode = true; render(); }
function cancelEdit() { isEditMode = false; render(); }

async function submitBrief() {
  if (!confirm('Submit this brief for approval? It will lock for further edits after understanding is confirmed.')) return;
  try {
    await apiCall('POST', `/api/briefs/${brief.id}/submit`);
    toast('Brief submitted for approval');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Submit failed');
  }
}

async function deleteBrief() {
  if (!confirm(`Delete "${brief.name}" permanently? This cannot be undone.`)) return;
  try {
    await apiCall('DELETE', `/api/briefs/${brief.id}`);
    toast('Brief deleted');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
  } catch (err) {
    toast(err.message || 'Delete failed');
  }
}

async function archiveBrief() {
  if (!confirm(`Archive "${brief.name}"? It will be hidden from lists but the record is preserved.`)) return;
  try {
    await apiCall('POST', `/api/briefs/${brief.id}/archive`);
    toast('Brief archived');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
  } catch (err) {
    toast(err.message || 'Archive failed');
  }
}

function canUserEdit() {
  if (!currentUser || !brief) return false;
  const isMine = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  const editableStatus = ['draft', 'understanding_pending'].includes(brief.status);
  return isMine && editableStatus;
}

function canUserArchive() {
  if (!currentUser || !brief) return false;
  const isMine = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  const isHigherRole = ['hom', 'ceo'].includes(currentUser.role);
  return isMine || isHigherRole;
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
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateInputValue(iso) {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

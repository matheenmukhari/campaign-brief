// ============================================================
// Brief detail page — view, edit, delete, archive,
// understanding confirmation, approval pipeline
// ============================================================
let brief = null;
let approvals = [];
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
    const [briefRes, apprRes] = await Promise.all([
      apiCall('GET', `/api/briefs/${id}`),
      apiCall('GET', `/api/approvals/brief/${id}`),
    ]);
    brief = briefRes.brief;
    approvals = apprRes.approvals || [];
    setTopbar('Dashboard', brief.name);
    render();
  } catch (err) {
    document.getElementById('brief-content').innerHTML =
      `<div class="empty-state">Could not load brief: ${err.message}. <a href="/dashboard.html">Back</a></div>`;
  }
}

function render() {
  if (isEditMode) return renderEditMode();
  renderViewMode();
}

// ─────────────────── VIEW MODE ───────────────────
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

    ${renderPipeline()}
    ${renderUnderstandingBlock(extra)}
    ${renderApprovalChain()}

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

// ─────────────────── PIPELINE VISUAL ───────────────────
function renderPipeline() {
  const stages = [
    { key: 'draft', label: 'Draft' },
    { key: 'understanding_pending', label: 'Understanding' },
    { key: 'approval_stage_1', label: 'Marketing exec' },
    { key: 'approval_stage_2', label: 'Regional HoM' },
    { key: 'approval_stage_3', label: 'Global HoM' },
    { key: 'approval_stage_4', label: 'CEO' },
    { key: 'approved', label: 'Approved' },
  ];

    // Only show stages that have approvers assigned
  const activeStages = new Set(approvals.map(a => `approval_stage_${a.stage}`));
  const displayStages = stages.filter(s => {
    if (s.key.startsWith('approval_stage_')) return activeStages.has(s.key);
    return true;
  });

  const stageOrder = displayStages.map(s => s.key);
  const currentIdx = stageOrder.indexOf(brief.status);

  const html = displayStages.map((s, i) => {
    let cls = '';
    if (currentIdx > i) cls = 'done';
    else if (currentIdx === i) cls = 'active';
    if (brief.status === 'approved' && s.key === 'approved') cls = 'done';

    const num = i + 1;
    const dot = cls === 'done' ? '✓' : num;
    return `
      <div class="pipe-step ${cls}">
        <div class="pipe-dot">${dot}</div>
        <div class="pipe-label">${s.label}</div>
      </div>`;
  }).join('');

  return `<div class="pipeline">${html}</div>`;
}

// ─────────────────── UNDERSTANDING BLOCK ───────────────────
function renderUnderstandingBlock(extra) {
  const status = brief.status;
  const summary = extra.understanding_summary;
  const isOwner = brief.owner_id === currentUser.id;
  const isRequester = brief.requester_id === currentUser.id;

  // Case A — brief is understanding_pending, no summary yet, owner needs to send
  if (status === 'understanding_pending' && !summary && isOwner) {
    return `
      <div class="confirm-card">
        <div class="confirm-title">Send understanding summary</div>
        <div class="confirm-sub">Write a short interpretation of the brief and send it to the requester (${brief.requester_name}) for confirmation. Approval chain begins once they confirm.</div>
        <textarea id="understanding-input" placeholder="e.g. Objective: Generate 50 GCC leads. Message: Register interest in One Port Street — from £350K. Audience: GCC HNW investors. Go-live: 15 June." style="min-height: 100px;"></textarea>
        <div style="margin-top: 12px;"><button class="btn btn-primary btn-sm" onclick="sendUnderstanding()">Send to requester</button></div>
      </div>`;
  }

  // Case B — understanding sent, requester needs to confirm
  if (status === 'understanding_pending' && summary && isRequester) {
    return `
      <div class="confirm-card">
        <div class="confirm-title">Confirm understanding</div>
        <div class="confirm-sub">${escapeHtml(brief.owner_name)} sent this interpretation. Confirm it accurately captures your intent to start the approval chain.</div>
        <div class="confirm-body-box">${escapeHtml(summary)}</div>
        <div style="display:flex;gap:8px"><button class="btn btn-primary btn-sm" onclick="confirmUnderstanding()">Confirm — start approvals</button><button class="btn btn-ghost btn-sm" onclick="toast('Reply to the author via comments to request changes')">Not quite right</button></div>
      </div>`;
  }

  // Case C — understanding sent, waiting for the other party
  if (status === 'understanding_pending' && summary) {
    return `
      <div class="confirm-card">
        <div class="confirm-title">Awaiting confirmation from ${escapeHtml(brief.requester_name)}</div>
        <div class="confirm-body-box">${escapeHtml(summary)}</div>
      </div>`;
  }

  // Case D — beyond understanding, show what was confirmed
  if (['approval_stage_1', 'approval_stage_2', 'approval_stage_3', 'approved'].includes(status) && summary) {
    return `
      <div class="confirm-card">
        <div class="confirm-title">Confirmed understanding</div>
        <div class="confirm-sub">Interpretation confirmed by ${escapeHtml(brief.requester_name)} before content work began.</div>
        <div class="confirm-body-box">${escapeHtml(summary)}</div>
      </div>`;
  }

  // Case E — draft or archived — no understanding block
  return '';
}

// ─────────────────── APPROVAL CHAIN ───────────────────
function renderApprovalChain() {
  if (!approvals.length) return '';
  if (['draft', 'understanding_pending'].includes(brief.status)) return '';

  // Group by stage
  const stages = {};
  approvals.forEach(a => {
    if (!stages[a.stage]) stages[a.stage] = [];
    stages[a.stage].push(a);
  });

  const currentStageNum = parseInt((brief.status.match(/approval_stage_(\d+)/) || [])[1], 10);
  const isApproved = brief.status === 'approved';

  const stageBlocks = Object.entries(stages).map(([stage, apprs]) => {
    const stageNum = parseInt(stage, 10);
    return `
      <div class="stage-block">
        <div class="stage-label">Stage ${stageNum} · ${stageLabelFor(stageNum)}</div>
        ${apprs.map(a => renderApprovalCard(a, stageNum, currentStageNum, isApproved)).join('')}
      </div>`;
  }).join('');

  return `<div style="margin-bottom: 20px;">${stageBlocks}</div>`;
}

function renderApprovalCard(a, stageNum, currentStageNum, isApproved) {
  const isMine = a.approver_id === currentUser.id;
  const isCurrentStage = stageNum === currentStageNum;
  const isPending = a.status === 'pending';
  const showActions = isMine && isCurrentStage && isPending && !isApproved;

  // Status label + colour
  let statusTag = '';
  if (a.status === 'approved') statusTag = `<span class="tag tag-green">Approved</span>`;
  else if (a.status === 'revisions_requested') statusTag = `<span class="tag tag-red">Revisions requested</span>`;
  else if (isPending && isCurrentStage) statusTag = `<span class="tag tag-amber">Pending review</span>`;
  else if (isPending) statusTag = `<span class="tag tag-gray">Awaiting stage ${currentStageNum}</span>`;

  const actionButtons = showActions ? `
    <button class="btn btn-ok btn-xs" onclick="approve(${a.id})">Approve</button>
    <button class="btn btn-ghost btn-xs" data-approver-name="${escapeAttr(a.approver_name)}" onclick="openRevisionModal(${a.id}, this.dataset.approverName)">Request revisions</button>  ` : '';

  const commentBlock =
    a.status === 'approved' && a.comments ? `<div class="appr-comment approved">${escapeHtml(a.comments)}</div>` :
    a.status === 'revisions_requested' && a.comments ? `<div class="appr-comment revisions"><strong>${a.severity || ''}:</strong> ${escapeHtml(a.comments)}</div>` : '';

  return `
    <div class="appr-card">
      <div style="width:100%">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div class="appr-info">
            <div class="appr-av" style="background: var(--tint-blue); color: var(--tint-blue-t);">${a.approver_initials}</div>
            <div>
              <div class="appr-name">${escapeHtml(a.approver_name)}</div>
              <div class="appr-role">${a.approver_role.replace(/_/g, ' ')}</div>
            </div>
          </div>
          <div class="appr-acts">
            ${statusTag}
            ${actionButtons}
          </div>
        </div>
        ${commentBlock}
      </div>
    </div>`;
}

function stageLabelFor(n) {
  if (n === 1) return 'Marketing executive';
  if (n === 2) return 'Regional head of marketing';
  if (n === 3) return 'Global head of marketing';
  if (n === 4) return 'CEO';
  return `Stage ${n}`;
}

// ─────────────────── ACTIONS ───────────────────
async function sendUnderstanding() {
  const summary = document.getElementById('understanding-input').value.trim();
  if (!summary) { toast('Write a summary first'); return; }
  try {
    await apiCall('POST', `/api/approvals/brief/${brief.id}/start-understanding`, { summary });
    toast('Sent to requester');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not send');
  }
}

async function confirmUnderstanding() {
  if (!confirm('Confirm this interpretation? Approval chain will start immediately.')) return;
  try {
    await apiCall('POST', `/api/approvals/brief/${brief.id}/confirm-understanding`);
    toast('Confirmed — approval chain started');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not confirm');
  }
}

async function approve(approvalId) {
  const comments = prompt('Optional comments (press OK to approve, Cancel to abort):', '');
  if (comments === null) return;
  try {
    await apiCall('POST', `/api/approvals/${approvalId}/approve`, { comments: comments.trim() || null });
    toast('Approved');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not approve');
  }
}

// ─────────────────── REVISION MODAL ───────────────────
let currentRevisionApprovalId = null;

function openRevisionModal(approvalId, approverName) {
  currentRevisionApprovalId = approvalId;
  const modal = document.getElementById('revision-modal') || createRevisionModal();
  const nameInput = document.getElementById('rev-approver-name');
  nameInput.value = approverName || currentUser.name;
  document.getElementById('rev-comments').value = '';
  document.getElementById('rev-severity').value = 'minor';
  modal.classList.add('open');
}

function closeRevisionModal() {
  const modal = document.getElementById('revision-modal');
  if (modal) modal.classList.remove('open');
  currentRevisionApprovalId = null;
}

function createRevisionModal() {
  const html = `
    <div class="overlay" id="revision-modal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-ttl">Request revisions</div>
          <button class="modal-x" onclick="closeRevisionModal()">×</button>
        </div>
        <div class="modal-body">
            <div class="fl">
            <label class="lbl">Requesting reviewer</label>
            <input type="text" id="rev-approver-name" readonly>
          </div>
          <div class="fl">
            <label class="lbl">Severity</label>
            <select id="rev-severity">
              <option value="minor">Minor — small fixes</option>
              <option value="moderate">Moderate — section rework</option>
              <option value="major">Major — significant revision</option>
            </select>
          </div>
          <div class="fl">
            <label class="lbl">Comments <span class="req">*</span></label>
            <textarea id="rev-comments" placeholder="Describe what needs to change…" style="min-height: 90px;"></textarea>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost btn-sm" onclick="closeRevisionModal()">Cancel</button>
          <button class="btn btn-danger btn-sm" onclick="submitRevision()">Return for revision</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML('beforeend', html);
  return document.getElementById('revision-modal');
}

async function submitRevision() {
  const comments = document.getElementById('rev-comments').value.trim();
  const severity = document.getElementById('rev-severity').value;
  if (!comments) { toast('Comments are required'); return; }
  try {
    await apiCall('POST', `/api/approvals/${currentRevisionApprovalId}/request-revisions`, { comments, severity });
    toast('Brief returned to draft with revisions');
    closeRevisionModal();
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not return brief');
  }
}

// ─────────────────── EDIT MODE (unchanged from before) ───────────────────
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
    <div class="edit-hint">Only editable while <strong>draft</strong> or <strong>understanding pending</strong>. Locks once approvals begin.</div>
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
        <div class="fl"><label class="lbl">Campaign type</label><input type="text" id="e-type" value="${escapeAttr(brief.campaign_type)}"></div>
        <div class="fl"><label class="lbl">Development / property</label><input type="text" id="e-dev" value="${escapeAttr(brief.development_name)}"></div>
        <div class="fl"><label class="lbl">Objective</label><input type="text" id="e-obj" value="${escapeAttr(brief.objective)}"></div>
        <div class="fl"><label class="lbl">Key message / CTA</label><input type="text" id="e-msg" value="${escapeAttr(brief.key_message)}"></div>
        <div class="fl"><label class="lbl">Asset type</label><input type="text" id="e-asset" value="${escapeAttr(brief.asset_type)}"></div>
        <div class="fl"><label class="lbl">Notes</label><input type="text" id="e-notes" value="${escapeAttr(brief.notes)}"></div>
        <div class="fg fg-3">
          <div><label class="lbl">Go-live date</label><input type="date" id="e-launch" value="${dateInputValue(brief.go_live_date)}"></div>
          <div><label class="lbl">Asset deadline</label><input type="date" id="e-deadline" value="${dateInputValue(brief.asset_deadline)}"></div>
          <div><label class="lbl">Campaign end</label><input type="date" id="e-end" value="${dateInputValue(brief.end_date)}"></div>
        </div>
      </div>
    </div>`;
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
  } catch (err) { toast(err.message || 'Save failed'); }
}

function toggleEdit() { isEditMode = true; render(); }
function cancelEdit() { isEditMode = false; render(); }

async function submitBrief() {
  if (!confirm('Submit this brief for approval?')) return;
  try {
    await apiCall('POST', `/api/briefs/${brief.id}/submit`);
    toast('Brief submitted');
    await loadBrief(brief.id);
  } catch (err) { toast(err.message || 'Submit failed'); }
}

async function deleteBrief() {
  if (!confirm(`Delete "${brief.name}" permanently?`)) return;
  try {
    await apiCall('DELETE', `/api/briefs/${brief.id}`);
    toast('Brief deleted');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
  } catch (err) { toast(err.message || 'Delete failed'); }
}

async function archiveBrief() {
  if (!confirm(`Archive "${brief.name}"?`)) return;
  try {
    await apiCall('POST', `/api/briefs/${brief.id}/archive`);
    toast('Brief archived');
    setTimeout(() => { window.location.href = '/dashboard.html'; }, 800);
  } catch (err) { toast(err.message || 'Archive failed'); }
}

// ─────────────────── HELPERS ───────────────────
function canUserEdit() {
  if (!currentUser || !brief) return false;
  const isMine = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  return isMine && ['draft', 'understanding_pending'].includes(brief.status);
}
function canUserArchive() {
  if (!currentUser || !brief) return false;
  const isMine = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  const isHigherRole = ['hom', 'ceo'].includes(currentUser.role);
  return isMine || isHigherRole;
}
function row(key, val) {
  const cls = val ? 'detail-val' : 'detail-val empty';
  const display = val ? escapeHtml(String(val)) : '—';
  return `<div class="detail-row"><div class="detail-key">${key}</div><div class="${cls}">${display}</div></div>`;
}
function renderExtraData(extra) {
  const entries = Object.entries(extra).filter(([k, v]) => v && k !== 'understanding_summary');
  if (!entries.length) return '';
  return `<div class="card" style="margin-bottom: 14px;">
    <div class="card-head" style="cursor: default;"><div class="card-title">Additional details</div></div>
    <div class="card-body open">${entries.map(([k, v]) => row(prettifyKey(k), v)).join('')}</div>
  </div>`;
}
function prettifyKey(k) { return k.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
function tagForMode(mode) {
  if (mode === 'full') return { cls: 'tag-blue', label: 'Full' };
  if (mode === 'custom') return { cls: 'tag-purple', label: 'Custom' };
  return { cls: 'tag-amber', label: 'Quick' };
}
function tagForStatus(s) {
  const map = {
    'draft':{cls:'tag-gray',label:'Draft'},
    'understanding_pending':{cls:'tag-blue',label:'Understanding'},
    'understanding_confirmed':{cls:'tag-blue',label:'Confirmed'},
    'approval_stage_1':{cls:'tag-amber',label:'Approval 1'},
    'approval_stage_2':{cls:'tag-amber',label:'Approval 2'},
    'approval_stage_3':{cls:'tag-amber',label:'Approval 3'},
    'review_round_1':{cls:'tag-blue',label:'Review R1'},
    'review_round_2':{cls:'tag-blue',label:'Review R2'},
    'approved':{cls:'tag-green',label:'Approved'},
    'pushed_to_todoist':{cls:'tag-green',label:'Pushed'},
    'archived':{cls:'tag-gray',label:'Archived'},
  };
  return map[s] || { cls: 'tag-gray', label: s || 'Unknown' };
}
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateInputValue(iso) { return iso ? new Date(iso).toISOString().split('T')[0] : ''; }
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

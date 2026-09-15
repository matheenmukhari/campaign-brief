// ============================================================
// Brief detail page — view, edit, delete, archive,
// understanding confirmation, approval pipeline
// ============================================================
let brief = null;
let approvals = [];
let reviews = [];
let reviewComments = [];
let briefTasks = [];
let _todoistProjects = null; // cached after first fetch
let currentUser = null;
let isEditMode = false;
let _chainUsers = [];
let _chainEditorChain = [];

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
    const [briefRes, apprRes, usersRes, reviewRes, tasksRes] = await Promise.all([
      apiCall('GET', `/api/briefs/${id}`),
      apiCall('GET', `/api/approvals/brief/${id}`),
      apiCall('GET', '/api/users').catch(() => ({ users: [] })),
      apiCall('GET', `/api/reviews/brief/${id}`).catch(() => ({ reviews: [], comments: [] })),
      apiCall('GET', `/api/tasks/brief/${id}`).catch(() => ({ tasks: [] })),
    ]);
    brief = briefRes.brief;
    approvals = apprRes.approvals || [];
    _chainUsers = usersRes.users || [];
    reviews = reviewRes.reviews || [];
    reviewComments = reviewRes.comments || [];
    briefTasks = tasksRes.tasks || [];
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
  // Populate Todoist project dropdowns if push panel is visible
  if (['review_complete', 'pushed_to_todoist'].includes(brief.status) && briefTasks.length) {
    loadProjectDropdowns('[id^="task-proj-"], [id^="retry-proj-"]');
  }
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
    ${renderRevisionBanner()}
    ${renderUnderstandingBlock(extra)}
    ${renderApprovalChain()}
    ${renderReviewPanel()}
    ${renderPushPanel()}

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
  // Build approval stage labels dynamically from whoever is assigned
  const stageNames = {};
  approvals.forEach(a => {
    if (!stageNames[a.stage]) stageNames[a.stage] = [];
    stageNames[a.stage].push(a.approver_name.split(' ')[0]);
  });

  const fixedStart = [
    { key: 'draft', label: 'Draft' },
    { key: 'understanding_pending', label: 'Understanding' },
  ];
  const approvalStages = [...new Set(approvals.map(a => a.stage))].sort((a, b) => a - b)
    .map(n => ({ key: `approval_stage_${n}`, label: stageNames[n].join(' + ') }));
  const hasReviewers = reviews.length > 0 ||
    ((brief.extra_data || {}).reviewers || []).length > 0;

  const hasTasks = briefTasks.length > 0;
  let fixedEnd;
  if (hasReviewers && hasTasks) {
    fixedEnd = [
      { key: 'approved',          label: 'Approved' },
      { key: 'review_round_1',    label: 'Review R1' },
      { key: 'review_round_2',    label: 'Review R2' },
      { key: 'review_complete',   label: 'Complete' },
      { key: 'pushed_to_todoist', label: 'Pushed' },
    ];
  } else if (hasReviewers) {
    fixedEnd = [
      { key: 'approved',        label: 'Approved' },
      { key: 'review_round_1',  label: 'Review R1' },
      { key: 'review_round_2',  label: 'Review R2' },
      { key: 'review_complete', label: 'Complete' },
    ];
  } else if (hasTasks) {
    fixedEnd = [
      { key: 'approved',          label: 'Approved' },
      { key: 'review_complete',   label: 'Review complete' },
      { key: 'pushed_to_todoist', label: 'Pushed' },
    ];
  } else {
    fixedEnd = [{ key: 'approved', label: 'Approved' }];
  }

  const displayStages = [...fixedStart, ...approvalStages, ...fixedEnd];
  const stageOrder = displayStages.map(s => s.key);
  const currentIdx = stageOrder.indexOf(brief.status);

  const html = displayStages.map((s, i) => {
    let cls = '';
    if (currentIdx > i) cls = 'done';
    else if (currentIdx === i) cls = 'active';
    const pastApproved = ['review_round_1', 'review_round_2', 'review_complete', 'pushed_to_todoist'];
    if (pastApproved.includes(brief.status) && s.key === 'approved') cls = 'done';
    const dot = cls === 'done' ? '✓' : i + 1;
    return `<div class="pipe-step ${cls}">
      <div class="pipe-dot">${dot}</div>
      <div class="pipe-label">${s.label}</div>
    </div>`;
  }).join('');

  return `<div class="pipeline">${html}</div>`;
}

// ─────────────────── UNDERSTANDING BLOCK ───────────────────
function renderUnderstandingBlock(extra) {
  // Re-submitted briefs skip the understanding step — don't show the block
  if (extra.resubmitted) return '';
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
  const beyondUnderstanding = [
    'approval_stage_1', 'approval_stage_2', 'approval_stage_3',
    'approved', 'review_round_1', 'review_round_2', 'review_complete', 'pushed_to_todoist',
  ];
  if (beyondUnderstanding.includes(status) && summary) {
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

// ─────────────────── REVISION BANNER ───────────────────
function renderRevisionBanner() {
  if (brief.status !== 'draft') return '';
  const latest = [...approvals]
    .filter(a => a.status === 'revisions_requested')
    .sort((a, b) => new Date(b.decided_at) - new Date(a.decided_at))[0];
  if (!latest) return '';

  const severityColour = { minor: 'var(--amber)', moderate: 'var(--rose)', major: 'var(--rose)' }[latest.severity] || 'var(--rose)';

  return `
    <div style="background:var(--tint-red);border:0.5px solid #E8B8B0;border-radius:var(--r);padding:18px 20px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <span style="font-size:14px;font-weight:500;color:var(--tint-red-t)">Revisions requested</span>
        ${latest.severity ? `<span class="tag" style="background:${severityColour};color:#fff;border:none;text-transform:capitalize">${latest.severity}</span>` : ''}
      </div>
      <div style="font-size:12.5px;color:var(--tint-red-t);margin-bottom:10px;opacity:0.85">
        ${escapeHtml(latest.approver_name)} returned this brief at stage ${latest.stage}. Address the feedback below, then re-submit.
      </div>
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px;font-size:13px;line-height:1.55;color:var(--text-2);margin-bottom:14px">
        ${escapeHtml(latest.comments)}
      </div>
      ${canUserEdit() ? `<button class="btn btn-primary btn-sm" onclick="toggleEdit()">Edit this brief</button>` : ''}
    </div>`;
}

// ─────────────────── APPROVAL CHAIN ───────────────────
function renderApprovalChain() {
  const canEdit = canEditChain();
  const editBtn = canEdit
    ? `<button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="openChainEditor()">Edit chain</button>`
    : '';

  // Draft / understanding_pending — show the planned chain from brief_data
  if (['draft', 'understanding_pending'].includes(brief.status)) {
    const chain = (brief.extra_data || {}).approval_chain || [];
    const userMap = {};
    _chainUsers.forEach(u => { userMap[String(u.id)] = u; });

    // Prior round history (from a previous approval attempt that was sent back)
    const priorApprovals = approvals.filter(a => a.status !== 'pending');
    const priorHtml = priorApprovals.length ? `
      <div style="margin-bottom:16px">
        <div class="stage-label" style="margin-top:0">Previous round</div>
        ${priorApprovals.map(a => {
          const tag = a.status === 'approved'
            ? `<span class="tag tag-green">Approved</span>`
            : `<span class="tag tag-red">Revisions requested</span>`;
          const comment = a.comments
            ? `<div class="appr-comment ${a.status === 'approved' ? 'approved' : 'revisions'}" style="margin-top:8px">
                ${a.status === 'revisions_requested' && a.severity ? `<strong style="text-transform:capitalize">${a.severity}:</strong> ` : ''}${escapeHtml(a.comments)}
               </div>` : '';
          return `<div class="appr-card"><div style="width:100%">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
              <div class="appr-info">
                <div class="appr-av" style="background:var(--surface-alt);color:var(--text-2)">${escapeHtml(a.approver_initials)}</div>
                <div>
                  <div class="appr-name">${escapeHtml(a.approver_name)}</div>
                  <div class="appr-role">Stage ${a.stage}</div>
                </div>
              </div>
              <div class="appr-acts">${tag}</div>
            </div>
            ${comment}
          </div></div>`;
        }).join('')}
      </div>` : '';

    const cards = chain.map((uid, i) => {
      const u = userMap[String(uid)];
      if (!u) return '';
      return `<div class="appr-card">
        <div class="appr-info">
          <div class="appr-av" style="background:var(--tint-blue);color:var(--tint-blue-t)">${escapeHtml(u.initials)}</div>
          <div>
            <div class="appr-name">${escapeHtml(u.name)}</div>
            <div class="appr-role">Stage ${i + 1}</div>
          </div>
        </div>
        <div class="appr-acts"><span class="tag tag-gray">Planned</span></div>
      </div>`;
    }).filter(Boolean).join('');

    if (!chain.length && !canEdit && !priorApprovals.length) return '';
    return `<div style="margin-bottom:20px">
      ${priorHtml}
      <div class="stage-label">Approval chain ${editBtn}</div>
      ${cards || '<div style="font-size:13px;color:var(--text-3);padding:8px 0">No chain set yet.</div>'}
    </div>`;
  }

  // In approval — show actual approval records grouped by stage
  if (!approvals.length) return '';

  const stages = {};
  approvals.forEach(a => {
    if (!stages[a.stage]) stages[a.stage] = [];
    stages[a.stage].push(a);
  });

  const currentStageNum = parseInt((brief.status.match(/approval_stage_(\d+)/) || [])[1], 10);
  const isApproved = brief.status === 'approved';

  const stageBlocks = Object.entries(stages).map(([stage, apprs]) => {
    const stageNum = parseInt(stage, 10);
    return `<div class="stage-block">
      <div class="stage-label">Stage ${stageNum}</div>
      ${apprs.map(a => renderApprovalCard(a, stageNum, currentStageNum, isApproved)).join('')}
    </div>`;
  }).join('');

  const chainHeader = `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
    <span style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase">Approval chain</span>
    ${!isApproved ? editBtn : ''}
  </div>`;

  return `<div style="margin-bottom:20px">${chainHeader}${stageBlocks}</div>`;
}

// ─────────────────── PUSH PANEL ───────────────────
function renderPushPanel() {
  const showAt = ['review_complete', 'pushed_to_todoist'];
  if (!showAt.includes(brief.status)) return '';

  const isPushed = brief.status === 'pushed_to_todoist';
  const isOwnerOrRequester = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;

  if (!briefTasks.length) {
    if (!isPushed && isOwnerOrRequester) {
      return `
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase;margin-bottom:12px">Push to Todoist</div>
          <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:18px 20px">
            <div style="font-size:13px;color:var(--text-2);margin-bottom:14px">No tasks were defined for this brief. Nothing to push.</div>
            <button class="btn btn-primary btn-sm" onclick="markPushedWithNoTasks()">Mark as pushed and complete</button>
          </div>
        </div>`;
    }
    return '';
  }

  // Separate tasks into categories for display
  const failedTasks = briefTasks.filter(t => t.push_error && !t.pushed_at);
  const pushedTasks = briefTasks.filter(t => t.pushed_at);
  const unpushedTasks = briefTasks.filter(t => !t.pushed_at && !t.push_error);

  // Retry panel — shown when pushed_to_todoist but some tasks still have errors
  if (isPushed && failedTasks.length > 0) {
    return renderRetryPanel(pushedTasks, failedTasks);
  }

  // Success summary — all pushed, no errors
  if (isPushed && failedTasks.length === 0) {
    return renderPushSuccessPanel(pushedTasks);
  }

  // Push panel — review_complete, shown to owner/requester
  if (!isOwnerOrRequester) return '';

  return renderActivePushPanel();
}

function renderActivePushPanel() {
  const projectSelects = briefTasks.map(t => {
    const noToken = !t.assignee_connected;
    const dueTxt = t.due_date
      ? `due ${formatDate(t.due_date)}`
      : t.due_offset_days
      ? `${t.due_offset_days} days before go-live`
      : 'no due date';

    return `
      <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:14px 16px;margin-bottom:8px" id="task-push-row-${t.id}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <input type="checkbox" id="task-sel-${t.id}" checked style="margin-top:3px;flex-shrink:0">
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:3px">${escapeHtml(t.title)}</div>
            <div style="font-size:12px;color:var(--text-3);margin-bottom:8px">
              ${escapeHtml(t.assignee_name)} · ${dueTxt}
            </div>
            ${noToken ? `
              <div style="font-size:12px;color:var(--amber);margin-bottom:8px">
                ⚠ ${escapeHtml(t.assignee_name)} hasn't connected Todoist.
                <label style="display:inline-flex;align-items:center;gap:4px;margin-left:8px;cursor:pointer">
                  <input type="checkbox" id="task-briefer-${t.id}">
                  <span>Push under my token instead</span>
                </label>
              </div>` : ''}
            <div>
              <select id="task-proj-${t.id}" style="width:100%;max-width:320px">
                <option value="">Loading projects…</option>
              </select>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:20px" id="push-panel">
      <div style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase;margin-bottom:12px">Push to Todoist</div>
      <div id="push-error-banner" style="display:none;background:var(--tint-red);border:0.5px solid #E8B8B0;border-radius:var(--r);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--tint-red-t)"></div>
      ${projectSelects}
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="executePush()">Push selected tasks</button>
    </div>`;
}

function renderRetryPanel(pushedTasks, failedTasks) {
  const successHtml = pushedTasks.length
    ? `<div style="font-size:13px;color:var(--tint-green-t);margin-bottom:10px">${pushedTasks.length} task${pushedTasks.length > 1 ? 's' : ''} pushed successfully.</div>`
    : '';

  const failedHtml = failedTasks.map(t => `
    <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:8px">
      <div style="display:flex;align-items:flex-start;gap:10px">
        <input type="checkbox" id="retry-sel-${t.id}" checked style="margin-top:3px;flex-shrink:0">
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:3px">${escapeHtml(t.title)}</div>
          <div style="font-size:12px;color:var(--rose);margin-bottom:8px">Error: ${escapeHtml(t.push_error)}</div>
          ${!t.assignee_connected ? `
            <label style="display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--amber);cursor:pointer;margin-bottom:8px">
              <input type="checkbox" id="retry-briefer-${t.id}">
              Push under my token instead
            </label><br>` : ''}
          <select id="retry-proj-${t.id}" style="width:100%;max-width:320px">
            <option value="">Loading projects…</option>
          </select>
        </div>
      </div>
    </div>`).join('');

  return `
    <div style="margin-bottom:20px" id="push-panel">
      <div style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase;margin-bottom:12px">Push to Todoist</div>
      <div id="push-error-banner" style="display:none;background:var(--tint-red);border:0.5px solid #E8B8B0;border-radius:var(--r);padding:14px 16px;margin-bottom:14px;font-size:13px;color:var(--tint-red-t)"></div>
      ${successHtml}
      <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:10px">${failedTasks.length} task${failedTasks.length > 1 ? 's' : ''} failed — retry below:</div>
      ${failedHtml}
      <button class="btn btn-primary btn-sm" style="margin-top:8px" onclick="executeRetry()">Retry failed tasks</button>
    </div>`;
}

function renderPushSuccessPanel(pushedTasks) {
  const taskLinks = pushedTasks
    .filter(t => t.todoist_task_id)
    .map(t => `<div style="font-size:13px;color:var(--text-2);padding:4px 0">${escapeHtml(t.title)} — <a href="https://todoist.com/app/task/${escapeAttr(t.todoist_task_id)}" target="_blank" rel="noopener" style="color:var(--blue)">View in Todoist</a></div>`)
    .join('');

  return `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase;margin-bottom:12px">Todoist</div>
      <div style="background:var(--tint-green);border:0.5px solid #b0d9b0;border-radius:var(--r);padding:16px 18px">
        <div style="font-size:13px;font-weight:500;color:var(--tint-green-t);margin-bottom:10px">${pushedTasks.length} task${pushedTasks.length > 1 ? 's' : ''} pushed to Todoist.</div>
        ${taskLinks}
      </div>
    </div>`;
}

// Load Todoist projects into all project dropdowns in the push panel
async function loadProjectDropdowns(selector = '[id^="task-proj-"]') {
  if (!_todoistProjects) {
    try {
      const { projects } = await apiCall('GET', '/api/tasks/todoist/projects');
      _todoistProjects = projects;
    } catch (err) {
      // User not connected or token expired — leave dropdowns empty
      document.querySelectorAll(selector).forEach(sel => {
        sel.innerHTML = '<option value="">— Connect Todoist in Settings —</option>';
      });
      return;
    }
  }
  document.querySelectorAll(selector).forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">Select project…</option>' +
      _todoistProjects.map(p => `<option value="${escapeAttr(p.id)}"${p.id === current ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('');
  });
}

async function executePush() {
  const btn = document.querySelector('#push-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Pushing…'; }

  const selections = briefTasks
    .filter(t => {
      const cb = document.getElementById(`task-sel-${t.id}`);
      return cb && cb.checked;
    })
    .map(t => ({
      task_id: t.id,
      todoist_project_id: (document.getElementById(`task-proj-${t.id}`) || {}).value || null,
      use_briefer_token: !!(document.getElementById(`task-briefer-${t.id}`) || {}).checked,
    }));

  if (!selections.length) {
    toast('Select at least one task to push');
    if (btn) { btn.disabled = false; btn.textContent = 'Push selected tasks'; }
    return;
  }

  try {
    await apiCall('POST', `/api/tasks/brief/${brief.id}/push`, { selections });
    toast('Tasks pushed to Todoist');
    await loadBrief(brief.id);
  } catch (err) {
    const banner = document.getElementById('push-error-banner');
    if (banner) {
      banner.textContent = err.message || 'Push failed — check errors below and retry';
      banner.style.display = 'block';
    } else {
      toast(err.message || 'Push failed');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Push selected tasks'; }
    // Reload to show updated per-task errors from the server
    await loadBrief(brief.id);
  }
}

async function executeRetry() {
  const btn = document.querySelector('#push-panel .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Retrying…'; }

  const failedTasks = briefTasks.filter(t => t.push_error && !t.pushed_at);
  const selections = failedTasks
    .filter(t => {
      const cb = document.getElementById(`retry-sel-${t.id}`);
      return cb && cb.checked;
    })
    .map(t => ({
      task_id: t.id,
      todoist_project_id: (document.getElementById(`retry-proj-${t.id}`) || {}).value || null,
      use_briefer_token: !!(document.getElementById(`retry-briefer-${t.id}`) || {}).checked,
    }));

  if (!selections.length) {
    toast('Select at least one task to retry');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry failed tasks'; }
    return;
  }

  try {
    await apiCall('POST', `/api/tasks/brief/${brief.id}/push`, { selections });
    toast('Retry complete');
    await loadBrief(brief.id);
  } catch (err) {
    const banner = document.getElementById('push-error-banner');
    if (banner) {
      banner.textContent = err.message || 'Retry failed — check errors below';
      banner.style.display = 'block';
    } else {
      toast(err.message || 'Retry failed');
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Retry failed tasks'; }
    await loadBrief(brief.id);
  }
}

async function markPushedWithNoTasks() {
  try {
    await apiCall('POST', `/api/tasks/brief/${brief.id}/push`, { selections: [] });
  } catch (_) { /* ignore — we handle this edge case differently below */ }
  // Since there are no tasks, directly hit a dedicated endpoint
  try {
    await apiCall('POST', `/api/briefs/${brief.id}/mark-pushed`);
    toast('Marked as pushed');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not advance brief');
  }
}

// ─────────────────── REVIEW PANEL ───────────────────
function renderReviewPanel() {
  const inReview = ['review_round_1', 'review_round_2'].includes(brief.status);
  const reviewDone = brief.status === 'review_complete';

  if (!inReview && !reviewDone) return '';

  const round = brief.status === 'review_round_2' ? 2 : (reviewDone ? 2 : 1);
  const currentRoundReviews = reviews.filter(r => r.round === round);
  const isR2 = brief.status === 'review_round_2';
  const roundLabel = reviewDone
    ? 'Review complete'
    : isR2
    ? 'Round 2 — Sign-off'
    : 'Round 1 — Feedback';

  const roundBadgeCls = reviewDone ? 'tag-green' : isR2 ? 'tag-amber' : 'tag-blue';

  const reviewerCards = currentRoundReviews.map(r => {
    const isMine = r.reviewer_id === currentUser.id;
    const canSignOff = isMine && !r.signed_off && inReview;
    const statusTag = r.signed_off
      ? `<span class="tag tag-green">${isR2 ? 'Signed off' : 'R1 Done'}</span>`
      : inReview && brief.status === `review_round_${r.round}`
      ? `<span class="tag tag-amber">Pending</span>`
      : `<span class="tag tag-gray">Waiting</span>`;

    const actionBtn = canSignOff
      ? `<button class="btn btn-ok btn-xs" onclick="markReviewDone(${r.id})">${isR2 ? 'Sign off' : 'Mark R1 done'}</button>`
      : '';

    return `
      <div class="appr-card">
        <div style="width:100%">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <div class="appr-info">
              <div class="appr-av" style="background:var(--tint-green);color:var(--tint-green-t)">${escapeHtml(r.reviewer_initials)}</div>
              <div>
                <div class="appr-name">${escapeHtml(r.reviewer_name)}</div>
                <div class="appr-role">${escapeHtml(r.reviewer_role.replace(/_/g, ' '))}</div>
              </div>
            </div>
            <div class="appr-acts">${statusTag}${actionBtn}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Comment thread — R1 only
  const commentSection = !isR2 && !reviewDone ? renderCommentThread() : '';

  // Reject button — any assigned reviewer during active review
  const isAssigned = reviews.some(r => r.reviewer_id === currentUser.id);
  const rejectBtn = inReview && isAssigned
    ? `<div style="margin-top:16px;padding-top:16px;border-top:0.5px solid var(--border)">
        <button class="btn btn-danger btn-sm" onclick="openRejectModal()">Reject and return to draft</button>
       </div>`
    : '';

  return `
    <div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
        <span style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase">Content review</span>
        <span class="tag ${roundBadgeCls}" style="font-size:10px">${roundLabel}</span>
      </div>
      ${reviewerCards}
      ${commentSection}
      ${rejectBtn}
    </div>`;
}

function renderCommentThread() {
  const sections = ['all', 'general', 'headline', 'cta', 'audience', 'creative', 'arabic'];
  const activeFilter = window._reviewSectionFilter || 'all';
  const filtered = activeFilter === 'all'
    ? reviewComments
    : reviewComments.filter(c => c.section === activeFilter);

  const isAssigned = reviews.some(r => r.reviewer_id === currentUser.id && r.round === 1);

  const filterBar = `
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:12px;flex-wrap:wrap">
      ${sections.map(s => `
        <button class="btn btn-ghost btn-xs${activeFilter === s ? ' btn-active' : ''}"
          onclick="setCommentFilter('${s}')" style="${activeFilter === s ? 'background:var(--tint-blue);color:var(--tint-blue-t);border-color:transparent' : ''}">
          ${s.charAt(0).toUpperCase() + s.slice(1)}
        </button>`).join('')}
    </div>`;

  const commentList = filtered.length
    ? filtered.map(c => `
        <div style="background:var(--surface);border:0.5px solid var(--border);border-radius:var(--r);padding:12px 14px;margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <div class="appr-av" style="width:22px;height:22px;font-size:10px;background:var(--tint-green);color:var(--tint-green-t)">${escapeHtml(c.author_initials)}</div>
            <span style="font-size:12.5px;font-weight:500;color:var(--text)">${escapeHtml(c.author_name)}</span>
            <span class="tag tag-gray" style="font-size:10px">${escapeHtml(c.section || 'general')}</span>
            <span style="font-size:11px;color:var(--text-3);margin-left:auto">${formatDate(c.created_at)}</span>
          </div>
          <div style="font-size:13px;color:var(--text-2);line-height:1.55">${escapeHtml(c.body)}</div>
        </div>`).join('')
    : `<div style="font-size:13px;color:var(--text-3);padding:8px 0">No comments yet${activeFilter !== 'all' ? ` in ${activeFilter}` : ''}.</div>`;

  const addForm = isAssigned ? `
    <div style="display:flex;gap:8px;margin-top:12px;align-items:flex-start">
      <select id="comment-section-sel" style="width:130px;flex-shrink:0">
        <option value="general">General</option>
        <option value="headline">Headline</option>
        <option value="cta">CTA</option>
        <option value="audience">Audience</option>
        <option value="creative">Creative</option>
        <option value="arabic">Arabic</option>
      </select>
      <input type="text" id="comment-input" placeholder="Add feedback…" style="flex:1">
      <button class="btn btn-ghost btn-sm" onclick="submitReviewComment()">Add</button>
    </div>` : '';

  return `
    <div style="margin-top:16px;padding-top:16px;border-top:0.5px solid var(--border)">
      <div style="font-size:11px;font-weight:500;color:var(--text-3);letter-spacing:0.02em;text-transform:uppercase;margin-bottom:10px">Round 1 feedback</div>
      ${filterBar}
      ${commentList}
      ${addForm}
    </div>`;
}

function setCommentFilter(section) {
  window._reviewSectionFilter = section;
  render();
}

// ─────────────────── REVIEW ACTIONS ───────────────────
async function markReviewDone(reviewId) {
  try {
    await apiCall('POST', `/api/reviews/${reviewId}/mark-done`);
    toast('Signed off');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not sign off');
  }
}

async function submitReviewComment() {
  const body = (document.getElementById('comment-input') || {}).value || '';
  const section = (document.getElementById('comment-section-sel') || {}).value || 'general';
  if (!body.trim()) { toast('Write a comment first'); return; }
  try {
    await apiCall('POST', `/api/reviews/brief/${brief.id}/comment`, { section, body: body.trim() });
    toast('Comment added');
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not add comment');
  }
}

// ─────────────────── REJECT MODAL ───────────────────
function openRejectModal() {
  const modal = document.getElementById('reject-review-modal') || createRejectModal();
  document.getElementById('reject-reason').value = '';
  modal.classList.add('open');
}

function closeRejectModal() {
  const modal = document.getElementById('reject-review-modal');
  if (modal) modal.classList.remove('open');
}

function createRejectModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="overlay" id="reject-review-modal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-ttl">Reject and return to draft</div>
          <button class="modal-x" onclick="closeRejectModal()">×</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.55">This will return the brief to draft. The author will need to revise it and re-submit for approvals before content review can begin again.</p>
          <div class="fl">
            <label class="lbl">Reason <span class="req">*</span></label>
            <textarea id="reject-reason" placeholder="Describe what needs to change before this brief is ready for review…" style="min-height:90px"></textarea>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost btn-sm" onclick="closeRejectModal()">Cancel</button>
          <button class="btn btn-danger btn-sm" onclick="submitReject()">Reject and return</button>
        </div>
      </div>
    </div>`);
  return document.getElementById('reject-review-modal');
}

async function submitReject() {
  const reason = (document.getElementById('reject-reason') || {}).value || '';
  if (!reason.trim()) { toast('Reason is required'); return; }
  try {
    await apiCall('POST', `/api/reviews/brief/${brief.id}/reject`, { reason: reason.trim() });
    toast('Brief returned to draft');
    closeRejectModal();
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not reject');
  }
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

function canEditChain() {
  if (!currentUser || !brief) return false;
  if (['approved', 'archived'].includes(brief.status)) return false;
  const isOwnerOrRequester = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  if (isOwnerOrRequester) return true;
  // Any pending approver in the chain can edit stages after their own slot
  return approvals.some(a => a.approver_id === currentUser.id && a.status === 'pending');
}

// Returns the cutoff stage for the current user:
// briefer → currentStage; approver → their own highest pending stage
function myChainCutoff() {
  const currentStage = parseInt((brief.status.match(/approval_stage_(\d+)/) || [])[1], 10) || 0;
  const isOwnerOrRequester = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
  if (isOwnerOrRequester) return currentStage;
  const myStages = approvals
    .filter(a => a.approver_id === currentUser.id && a.status === 'pending')
    .map(a => a.stage);
  return myStages.length ? Math.max(...myStages) : currentStage;
}

// ─────────────────── CHAIN EDITOR MODAL ───────────────────
function openChainEditor() {
  const cutoff = myChainCutoff();
  const userMap = {};
  _chainUsers.forEach(u => { userMap[String(u.id)] = u; });

  if (cutoff === 0) {
    // Draft / understanding_pending — full chain is editable
    const chain = (brief.extra_data || {}).approval_chain || [];
    _chainEditorChain = chain.map(uid => userMap[String(uid)]).filter(Boolean);
  } else {
    // Editable = pending stages after the caller's own highest stage
    _chainEditorChain = approvals
      .filter(a => a.stage > cutoff && a.status === 'pending')
      .sort((a, b) => a.stage - b.stage)
      .map(a => userMap[String(a.approver_id)])
      .filter(Boolean);
  }

  const modal = document.getElementById('chain-editor-modal') || createChainEditorModal();
  const sel = document.getElementById('ce-chain-select');
  if (sel && sel.options.length <= 1) {
    _chainUsers.forEach(u => sel.insertAdjacentHTML('beforeend',
      `<option value="${escapeAttr(String(u.id))}">${escapeHtml(u.name)}</option>`));
  }
  const note = document.getElementById('ce-context-note');
  if (note) {
    const isOwnerOrRequester = brief.requester_id === currentUser.id || brief.owner_id === currentUser.id;
    note.textContent = isOwnerOrRequester
      ? 'Add or reorder approvers. Approved and in-progress stages cannot be changed.'
      : `You can configure who comes after your own stage. Stages before yours are locked.`;
  }
  renderChainEditorList();
  modal.classList.add('open');
}

function createChainEditorModal() {
  document.body.insertAdjacentHTML('beforeend', `
    <div class="overlay" id="chain-editor-modal">
      <div class="modal">
        <div class="modal-head">
          <div class="modal-ttl">Edit approval chain</div>
          <button class="modal-x" onclick="closeChainEditor()">×</button>
        </div>
        <div class="modal-body">
          <p style="font-size:13px;color:var(--text-2);margin-bottom:14px;line-height:1.55" id="ce-context-note">
            Add or reorder approvers for the stages after your own.
          </p>
          <div class="chain-add">
            <select id="ce-chain-select"><option value="">Select a team member…</option></select>
            <button type="button" class="btn btn-ghost" onclick="addToEditorChain()">Add</button>
          </div>
          <div id="ce-chain-list" class="chain-list"></div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost btn-sm" onclick="closeChainEditor()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveChain()">Save chain</button>
        </div>
      </div>
    </div>`);
  return document.getElementById('chain-editor-modal');
}

function closeChainEditor() {
  const modal = document.getElementById('chain-editor-modal');
  if (modal) modal.classList.remove('open');
}

function renderChainEditorList() {
  const list = document.getElementById('ce-chain-list');
  if (!list) return;
  const cutoff = myChainCutoff();
  if (!_chainEditorChain.length) {
    list.innerHTML = '<div class="chain-empty">No approvers in the remaining chain.</div>';
    return;
  }
  list.innerHTML = _chainEditorChain.map((u, i) => `
    <div class="appr-card">
      <div class="appr-info">
        <div class="appr-av" style="background:var(--tint-blue);color:var(--tint-blue-t)">${escapeHtml(u.initials)}</div>
        <div>
          <div class="appr-name">${escapeHtml(u.name)}</div>
          <div class="appr-role">Stage ${cutoff + 1 + i}</div>
        </div>
      </div>
      <div class="appr-acts">
        ${i > 0 ? `<button type="button" class="btn btn-ghost btn-xs" onclick="moveInEditorChain(${i},-1)">↑</button>` : ''}
        ${i < _chainEditorChain.length - 1 ? `<button type="button" class="btn btn-ghost btn-xs" onclick="moveInEditorChain(${i},1)">↓</button>` : ''}
        <button type="button" class="btn btn-ghost btn-xs" style="color:var(--rose)" onclick="removeFromEditorChain(${i})">Remove</button>
      </div>
    </div>`).join('');
}

function addToEditorChain() {
  const sel = document.getElementById('ce-chain-select');
  const userId = sel.value;
  if (!userId) return;
  const user = _chainUsers.find(u => String(u.id) === userId);
  if (!user) return;
  if (_chainEditorChain.some(u => String(u.id) === userId)) {
    toast(`${user.name} is already in the chain`);
    return;
  }
  _chainEditorChain.push({ id: user.id, name: user.name, initials: user.initials, role: user.role });
  sel.value = '';
  renderChainEditorList();
}

function removeFromEditorChain(i) {
  _chainEditorChain.splice(i, 1);
  renderChainEditorList();
}

function moveInEditorChain(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= _chainEditorChain.length) return;
  [_chainEditorChain[i], _chainEditorChain[j]] = [_chainEditorChain[j], _chainEditorChain[i]];
  renderChainEditorList();
}

async function saveChain() {
  try {
    await apiCall('PUT', `/api/approvals/brief/${brief.id}/chain`, {
      approvers: _chainEditorChain.map(u => u.id),
    });
    toast('Chain saved');
    closeChainEditor();
    await loadBrief(brief.id);
  } catch (err) {
    toast(err.message || 'Could not save chain');
  }
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
    <div class="edit-hint">${approvals.some(a => a.status === 'revisions_requested') ? 'Address the revision feedback, then save and re-submit.' : 'Only editable while draft or understanding pending. Locks once approvals begin.'}</div>
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
  const entries = Object.entries(extra).filter(([k, v]) => v && !['understanding_summary', 'approval_chain', 'resubmitted'].includes(k));
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

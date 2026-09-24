// ============================================================
// Todoist push — split-pane inbox + cockpit
// ============================================================

let allBriefs = [];
let selectedBriefId = null;
let briefTasks = [];
let todoistProjects = null; // cached after first successful fetch

(async function () {
  if (!initShell('todoist')) return;
  setTopbar('Todoist push');

  try {
    const [readyRes, pushedRes] = await Promise.all([
      apiCall('GET', '/api/briefs?status=review_complete&mine=true'),
      apiCall('GET', '/api/briefs?status=pushed_to_todoist&mine=true'),
    ]);
    allBriefs = [
      ...(readyRes.briefs  || []),
      ...(pushedRes.briefs || []),
    ];
    renderInbox();

    const urlParams  = new URLSearchParams(window.location.search);
    const urlBriefId = urlParams.get('brief');
    const preselect  = urlBriefId
      ? allBriefs.find(b => String(b.id) === urlBriefId)
      : allBriefs[0];

    if (preselect) selectBrief(preselect.id);
    else renderEmptyCockpit();

  } catch (err) {
    document.getElementById('push-cockpit').innerHTML =
      `<div class="pc-empty">Could not load: ${escapeHtml(err.message)}</div>`;
  }
})();

// ── INBOX ──────────────────────────────────────────────────

function renderInbox() {
  const inbox      = document.getElementById('push-inbox');
  const readyBriefs  = allBriefs.filter(b => b.status === 'review_complete');
  const pushedBriefs = allBriefs.filter(b => b.status === 'pushed_to_todoist');

  const subText = readyBriefs.length
    ? `${readyBriefs.length} ready to push`
    : 'All caught up';

  if (!allBriefs.length) {
    inbox.innerHTML = `
      <div class="push-inbox-hd">
        <div class="push-inbox-title">Todoist push</div>
        <div class="push-inbox-sub">All caught up</div>
      </div>
      <div class="inbox-empty">
        <strong>Nothing to push</strong>
        No briefs are waiting.
      </div>`;
    return;
  }

  const readyHtml = readyBriefs.length ? `
    <div class="push-inbox-section">Ready to push</div>
    ${readyBriefs.map(inboxRow).join('')}
  ` : '';

  const pushedHtml = pushedBriefs.length ? `
    <div class="push-inbox-section">Already pushed</div>
    ${pushedBriefs.map(inboxRow).join('')}
  ` : '';

  inbox.innerHTML = `
    <div class="push-inbox-hd">
      <div class="push-inbox-title">Todoist push</div>
      <div class="push-inbox-sub">${subText}</div>
    </div>
    ${readyHtml}${pushedHtml}`;

  // Restore selected highlight after re-render
  if (selectedBriefId) {
    const row = document.querySelector(`.push-inbox-row[data-id="${selectedBriefId}"]`);
    if (row) row.classList.add('selected');
  }
}

function inboxRow(b) {
  const isReady   = b.status === 'review_complete';
  const dotColor  = isReady ? 'var(--amber)' : 'var(--green)';
  const region    = (b.regions || []).join(', ');
  const goLive    = b.go_live_date ? 'Go-live ' + formatDate(b.go_live_date) : '';
  const meta      = [b.brief_code, region, goLive].filter(Boolean).join(' · ');
  return `
    <div class="push-inbox-row" data-id="${b.id}" onclick="selectBrief(${b.id})">
      <span class="pi-dot" style="background:${dotColor}"></span>
      <div class="pi-main">
        <div class="pi-name">${escapeHtml(b.name)}</div>
        <div class="pi-meta">${escapeHtml(meta)}</div>
      </div>
    </div>`;
}

function renderEmptyCockpit() {
  document.getElementById('push-cockpit').innerHTML =
    `<div class="pc-empty">Select a brief to see its tasks.</div>`;
}

// ── COCKPIT LOAD ───────────────────────────────────────────

async function selectBrief(id) {
  selectedBriefId = id;
  briefTasks      = [];

  document.querySelectorAll('.push-inbox-row').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector(`.push-inbox-row[data-id="${id}"]`);
  if (row) row.classList.add('selected');

  const brief = allBriefs.find(b => b.id === id);
  if (!brief) return;

  document.getElementById('push-cockpit').innerHTML = `<div class="pc-empty">Loading tasks…</div>`;

  try {
    const { tasks } = await apiCall('GET', `/api/tasks/brief/${id}`);
    briefTasks = tasks || [];
    renderCockpit(brief);
    await ensureProjects();
    populateProjectDropdowns();
  } catch (err) {
    document.getElementById('push-cockpit').innerHTML =
      `<div class="pc-empty">Could not load tasks: ${escapeHtml(err.message)}</div>`;
  }
}

// ── COCKPIT RENDER ─────────────────────────────────────────

function renderCockpit(brief) {
  const isReady  = brief.status === 'review_complete';
  const isPushed = brief.status === 'pushed_to_todoist';

  const headerHtml = `
    <div class="pc-hd">
      <div class="pc-hd-name">${escapeHtml(brief.name)}</div>
      <div class="pc-hd-meta">
        <span>${escapeHtml(brief.brief_code)}</span>
        ${brief.go_live_date ? `<span>·</span><span>Go-live ${formatDate(brief.go_live_date)}</span>` : ''}
      </div>
    </div>`;

  // ── 0-task edge case ──
  if (!briefTasks.length) {
    const noTaskBody = isReady
      ? `<div style="font-size:13px;color:var(--text-2);margin-bottom:16px">No tasks are defined for this brief.</div>
         <button type="button" class="btn btn-primary btn-sm" id="no-task-btn">Advance to pushed (no tasks)</button>`
      : `<div style="font-size:13px;color:var(--text-3)">No tasks were defined for this brief.</div>`;

    document.getElementById('push-cockpit').innerHTML = `
      ${headerHtml}
      <div id="pc-banner" style="display:none" class="pc-banner pc-banner-error"></div>
      ${noTaskBody}`;

    const noTaskBtn = document.getElementById('no-task-btn');
    if (noTaskBtn) {
      noTaskBtn.addEventListener('click', function (e) {
        e.preventDefault();
        console.log('No-task advance button clicked', { briefId: brief.id });
        markPushedNoTasks(brief.id);
      });
    }
    return;
  }

  const failedTasks = briefTasks.filter(t => t.push_error && !t.pushed_at);
  const btnText = (isPushed && failedTasks.length) ? 'Retry failed tasks' : 'Push selected tasks';

  document.getElementById('push-cockpit').innerHTML = `
    ${headerHtml}
    <div id="pc-banner" style="display:none" class="pc-banner pc-banner-error"></div>
    <table class="pc-task-table">
      <thead>
        <tr>
          <th></th>
          <th>Task</th>
          <th>Assignee</th>
          <th>Due</th>
          <th>Project</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${briefTasks.map(taskRow).join('')}
      </tbody>
    </table>
    <div class="pc-footer">
      <button type="button" class="btn btn-primary" id="push-btn">${btnText}</button>
    </div>`;

  document.getElementById('push-btn').addEventListener('click', function (e) {
    e.preventDefault();
    const unpushedTasks = briefTasks.filter(t => !t.pushed_at);
    const selections = unpushedTasks
      .filter(t => {
        const cb = document.getElementById(`sel-${t.id}`);
        return cb && cb.checked;
      })
      .map(t => ({
        task_id:            t.id,
        todoist_project_id: (document.getElementById(`proj-${t.id}`) || {}).value || null,
        use_briefer_token:  !!(document.getElementById(`fb-${t.id}`) || {}).checked,
      }));
    console.log('Push button clicked', { briefId: brief.id, selections });
    executePush(brief.id, selections);
  });
}

function taskRow(t) {
  const isPushed   = !!t.pushed_at;
  const hasError   = !!t.push_error && !isPushed;
  // Default checked: unpushed tasks (including errored ones for retry)
  // Default unchecked: already-pushed tasks
  const checked    = !isPushed;
  const disabled   = isPushed ? 'disabled' : '';

  const dueTxt = t.due_date
    ? formatDate(t.due_date)
    : t.due_offset_days != null
    ? `${t.due_offset_days}d before go-live`
    : '—';

  const connDot = t.assignee_connected
    ? `<span class="pc-conn-dot connected" title="Todoist connected"></span>`
    : `<span class="pc-conn-dot disconnected" title="Not connected to Todoist"></span>`;

  // "Use my token" fallback — only for unpushed tasks with disconnected assignees
  const fallbackHtml = (!t.assignee_connected && !isPushed) ? `
    <label class="pc-fallback">
      <input type="checkbox" id="fb-${t.id}">
      Use my token
    </label>` : '';

  let statusHtml;
  if (isPushed && t.todoist_task_id) {
    statusHtml = `<span class="pc-status-pushed">✓ <a href="https://todoist.com/app/task/${escapeAttr(t.todoist_task_id)}" target="_blank" rel="noopener">Pushed</a></span>`;
  } else if (isPushed) {
    statusHtml = `<span class="pc-status-pushed">✓ Pushed</span>`;
  } else if (hasError) {
    statusHtml = `<span class="pc-status-error">Error: ${escapeHtml(t.push_error)}</span>`;
  } else {
    statusHtml = `<span class="pc-status-ready">Ready</span>`;
  }

  return `
    <tr id="task-row-${t.id}">
      <td><input type="checkbox" id="sel-${t.id}" ${checked ? 'checked' : ''} ${disabled}></td>
      <td>
        <div class="pc-task-title">${escapeHtml(t.title)}</div>
        ${t.team ? `<div class="pc-task-sub">${escapeHtml(t.team)}</div>` : ''}
      </td>
      <td>
        <div class="pc-assignee">
          ${connDot}
          <span>${escapeHtml(t.assignee_name)}</span>
        </div>
        ${fallbackHtml}
      </td>
      <td><span class="pc-task-sub">${escapeHtml(dueTxt)}</span></td>
      <td>
        ${!isPushed
          ? `<select id="proj-${t.id}" style="min-width:150px"><option value="">Loading…</option></select>`
          : `<span style="font-size:12px;color:var(--text-3)">—</span>`}
      </td>
      <td>${statusHtml}</td>
    </tr>`;
}

// ── TODOIST PROJECTS ───────────────────────────────────────

async function ensureProjects() {
  if (todoistProjects !== null) return;
  try {
    const { projects } = await apiCall('GET', '/api/tasks/todoist/projects');
    todoistProjects = projects || [];
  } catch (_) {
    todoistProjects = null; // stay null — dropdowns will show fallback
  }
}

function populateProjectDropdowns() {
  document.querySelectorAll('[id^="proj-"]').forEach(sel => {
    if (!todoistProjects) {
      sel.innerHTML = '<option value="">— Connect Todoist in Settings —</option>';
      return;
    }
    sel.innerHTML = '<option value="">Select project…</option>' +
      todoistProjects.map(p =>
        `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)}</option>`
      ).join('');
  });
}

// ── PUSH ───────────────────────────────────────────────────

async function executePush(briefId, selections) {
  const btn    = document.getElementById('push-btn');
  const banner = document.getElementById('pc-banner');
  if (banner) banner.style.display = 'none';

  if (!selections.length) {
    toast('Select at least one task to push');
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Pushing…'; }

  try {
    await apiCall('POST', `/api/tasks/brief/${briefId}/push`, { selections });
    toast('Tasks pushed to Todoist');
    await refreshAfterPush(briefId);

  } catch (err) {
    // Reload tasks to show per-task errors, then restore button
    await refreshAfterPush(briefId, /* keepBanner */ true);
    const b = document.getElementById('pc-banner');
    if (b) {
      b.textContent = err.message || 'Push failed — see per-task errors below';
      b.style.display = 'block';
    }
  }
}

async function refreshAfterPush(briefId, keepBanner = false) {
  try {
    const [tasksRes, briefRes] = await Promise.all([
      apiCall('GET', `/api/tasks/brief/${briefId}`),
      apiCall('GET', `/api/briefs/${briefId}`),
    ]);
    briefTasks = tasksRes.tasks || [];

    const updatedBrief = briefRes.brief;
    const idx = allBriefs.findIndex(b => b.id === briefId);
    if (idx !== -1) allBriefs[idx] = updatedBrief;

    renderInbox();
    renderCockpit(updatedBrief);
    await ensureProjects();
    populateProjectDropdowns();

    if (keepBanner) {
      const b = document.getElementById('pc-banner');
      if (b) b.style.display = 'none'; // will be shown by caller
    }
  } catch (_) { /* best-effort */ }
}

async function markPushedNoTasks(briefId) {
  try {
    await apiCall('POST', `/api/briefs/${briefId}/mark-pushed`);
    toast('Marked as pushed');
    const briefRes = await apiCall('GET', `/api/briefs/${briefId}`);
    const updatedBrief = briefRes.brief;
    const idx = allBriefs.findIndex(b => b.id === briefId);
    if (idx !== -1) allBriefs[idx] = updatedBrief;
    renderInbox();
    renderCockpit(updatedBrief);
  } catch (err) {
    toast(err.message || 'Could not advance brief');
  }
}

// ── HELPERS ────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

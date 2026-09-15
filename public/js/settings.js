// ============================================================
// Settings page — Todoist connection
// ============================================================
(async function () {
  if (!initShell('settings')) return;
  setTopbar('Settings');
  await renderSettings();
})();

async function renderSettings() {
  const el = document.getElementById('settings-content');
  try {
    const { connected } = await apiCall('GET', '/api/auth/todoist-status');
    el.innerHTML = buildSettingsHtml(connected);
  } catch (err) {
    el.innerHTML = `<div class="empty-state">Could not load settings: ${escapeHtml(err.message)}</div>`;
  }
}

function buildSettingsHtml(connected) {
  const statusDot = connected
    ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--tint-green-t)"><span style="width:8px;height:8px;border-radius:50%;background:var(--tint-green-t);display:inline-block"></span>Connected</span>`
    : `<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--text-3)"><span style="width:8px;height:8px;border-radius:50%;background:var(--text-3);display:inline-block"></span>Not connected</span>`;

  const tokenField = connected
    ? `<div class="fl">
         <label class="lbl">API token</label>
         <input type="text" value="••••••••••••••••••••••••••••••••••••••••" disabled style="font-family:monospace;color:var(--text-3)">
         <div class="field-hint">Token saved. Disconnect to replace it.</div>
       </div>`
    : `<div class="fl">
         <label class="lbl">API token <span class="req">*</span></label>
         <input type="password" id="todoist-token-input" placeholder="Paste your Todoist API token here" autocomplete="off">
         <div class="field-hint">Find it in Todoist → Settings → Integrations → Developer → API token</div>
       </div>`;

  const actionBtn = connected
    ? `<button class="btn btn-danger btn-sm" onclick="disconnectTodoist()">Disconnect Todoist</button>`
    : `<button class="btn btn-primary btn-sm" onclick="connectTodoist()">Connect Todoist</button>`;

  return `
    <div class="card" style="max-width:520px">
      <div class="card-head" style="cursor:default">
        <div class="card-title">Todoist</div>
        ${statusDot}
      </div>
      <div class="card-body open">
        <p style="font-size:13px;color:var(--text-2);margin-bottom:16px;line-height:1.55">
          Connect your personal Todoist account so tasks from approved briefs can be pushed directly to your Todoist projects.
          Each team member connects their own account — tasks are pushed to the assignee's Todoist, not the briefer's.
        </p>
        ${tokenField}
        <div style="margin-top:14px">${actionBtn}</div>
      </div>
    </div>`;
}

async function connectTodoist() {
  const input = document.getElementById('todoist-token-input');
  const token = (input && input.value || '').trim();
  if (!token) { toast('Paste your Todoist API token first'); return; }

  const btn = document.querySelector('#settings-content .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }

  try {
    await apiCall('POST', '/api/auth/connect-todoist', { token });
    toast('Todoist connected');
    await renderSettings();
  } catch (err) {
    toast(err.message || 'Could not connect');
    if (btn) { btn.disabled = false; btn.textContent = 'Connect Todoist'; }
  }
}

async function disconnectTodoist() {
  if (!confirm('Disconnect Todoist? You will not be able to push tasks until you reconnect.')) return;
  try {
    await apiCall('DELETE', '/api/auth/disconnect-todoist');
    toast('Todoist disconnected');
    await renderSettings();
  } catch (err) {
    toast(err.message || 'Could not disconnect');
  }
}

function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

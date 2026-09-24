// ============================================================
// Team directory
// ============================================================
let allUsers = [];

(async function () {
  if (!initShell('team')) return;
  setTopbar('Team');

  try {
    const { users } = await apiCall('GET', '/api/users');
    allUsers = users;
    populateRegionFilter(users);
    renderGrid(users);
    document.getElementById('team-sub').textContent =
      `${users.length} team member${users.length === 1 ? '' : 's'}`;
  } catch (err) {
    document.getElementById('team-grid').innerHTML =
      `<div class="empty-state">Could not load team: ${escapeHtml(err.message)}</div>`;
  }

  document.getElementById('team-search').addEventListener('input',  applyFilters);
  document.getElementById('team-region').addEventListener('change', applyFilters);
})();

function populateRegionFilter(users) {
  const regions = [...new Set(users.map(u => u.region).filter(Boolean))].sort();
  const sel = document.getElementById('team-region');
  regions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const q      = document.getElementById('team-search').value.toLowerCase().trim();
  const region = document.getElementById('team-region').value;
  const filtered = allUsers.filter(u => {
    const matchQ = !q ||
      (u.name  || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q);
    const matchR = !region || u.region === region;
    return matchQ && matchR;
  });
  renderGrid(filtered);
  document.getElementById('team-sub').textContent =
    filtered.length === allUsers.length
      ? `${allUsers.length} team member${allUsers.length === 1 ? '' : 's'}`
      : `${filtered.length} of ${allUsers.length} members`;
}

function renderGrid(users) {
  const grid = document.getElementById('team-grid');
  if (!users.length) {
    grid.innerHTML = `<div class="empty-state">No team members match.</div>`;
    return;
  }
  grid.innerHTML = `<div class="team-grid">${users.map(userCard).join('')}</div>`;
}

function userCard(u) {
  const roleLabel = (u.role || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const connHtml = u.has_todoist_token
    ? `<span class="pc-conn-dot connected" style="display:inline-block"></span> Connected`
    : `<span class="pc-conn-dot disconnected" style="display:inline-block"></span> Not connected`;
  const activeTag = u.is_active
    ? `<span class="tag tag-green" style="flex-shrink:0">Active</span>`
    : `<span class="tag tag-gray"  style="flex-shrink:0">Inactive</span>`;

  return `
    <div class="team-card">
      <div class="team-card-head">
        <div class="team-av" style="background:var(--tint-amber);color:var(--tint-amber-t)">
          ${escapeHtml(u.initials)}
        </div>
        <div style="flex:1;min-width:0">
          <div class="team-name">${escapeHtml(u.name)}</div>
          <div class="team-role">${escapeHtml(roleLabel)}</div>
        </div>
        ${activeTag}
      </div>
      <div class="team-details">
        <div class="team-detail-row">
          <span class="team-detail-lbl">Region</span>
          <span>${escapeHtml(u.region || '—')}</span>
        </div>
        <div class="team-detail-row">
          <span class="team-detail-lbl">Email</span>
          <a href="mailto:${escapeAttr(u.email)}" style="color:var(--blue)">${escapeHtml(u.email)}</a>
        </div>
        <div class="team-detail-row">
          <span class="team-detail-lbl">Todoist</span>
          <span style="display:inline-flex;align-items:center;gap:5px;font-size:12.5px">${connHtml}</span>
        </div>
      </div>
    </div>`;
}

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

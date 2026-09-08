// ============================================================
// Shared app logic — sidebar, greeting, layout, toast
// Every page loads this after api.js
// ============================================================

// ── Toast notification ──
function toast(msg) {
  let el = document.getElementById('toast-el');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast-el';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ── Time-based greeting ──
function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ── Render the sidebar (called by every page) ──
function renderSidebar(activePage) {
  const user = getCurrentUser();
  if (!user) return '';

  const links = [
    { group: 'Workspace' },
    { page: 'dashboard',  label: 'Dashboard',      dot: 'var(--text)',   href: '/dashboard.html' },
    { page: 'new-brief',  label: 'New brief',       dot: 'var(--rose)',   href: '/new-brief.html' },
    { group: 'Active' },
    { page: 'approvals',  label: 'Approvals',       dot: 'var(--amber)',  href: '/approvals.html', count: '' },
    { page: 'review',     label: 'Content review',  dot: 'var(--blue)',   href: '/review.html',    count: '' },
    { page: 'todoist',    label: 'Todoist push',    dot: 'var(--green)',  href: '/todoist.html' },
    { group: 'Reference' },
    { page: 'team',       label: 'Team',            dot: 'var(--pink)',   href: '/team.html' },
    { page: 'qa',         label: 'QA checklist',    dot: 'var(--violet)', href: '/qa.html' },
    { page: 'log',        label: 'Revision log',    dot: 'var(--gray)',   href: '/log.html' },
  ];

  const linksHtml = links.map(l => {
    if (l.group) return `<div class="sb-group">${l.group}</div>`;
    const isActive = l.page === activePage ? 'on' : '';
    const count = l.count ? `<span class="sb-count">${l.count}</span>` : '';
    return `<a href="${l.href}" class="sb-link ${isActive}" data-page="${l.page}">
      <span class="sb-dot" style="background: ${l.dot}"></span>${l.label}${count}
    </a>`;
  }).join('');

  return `
    <div class="sb-brand">
      <div class="sb-logo">SelectProperty</div>
      <div class="sb-sub">Campaign briefing</div>
    </div>
    ${linksHtml}
    <div class="sb-me">
      <div class="sb-av">${user.initials}</div>
      <div>
        <div class="sb-me-name">${user.name}</div>
        <div class="sb-me-role">${(user.region || '')} · ${(user.role || '').replace(/_/g, ' ')}</div>
      </div>
      <button class="sb-signout" onclick="signOut()" title="Sign out">↪</button>
    </div>
  `;
}

// ── Render topbar breadcrumb ──
function setTopbar(sectionLabel, campaign = null, actions = '') {
  const trail = document.getElementById('tb-trail');
  const actionsEl = document.getElementById('tb-actions');
  if (trail) {
    if (campaign) {
      trail.innerHTML = `<span>${sectionLabel}</span><span class="sep">›</span><strong>${campaign}</strong>`;
    } else {
      trail.innerHTML = `<span>${sectionLabel}</span>`;
    }
  }
  if (actionsEl) actionsEl.innerHTML = actions;
}

// ── Sign out ──
function signOut() {
  clearToken();
  window.location.href = '/login.html';
}

// ── Guard: if not logged in, redirect to login ──
function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// ── Initialise shell on any page ──
function initShell(activePage) {
  if (!requireAuth()) return false;

  // Refresh user from server (validates token still works)
  apiCall('GET', '/api/auth/me')
    .then(({ user }) => {
      setCurrentUser(user);
      const sb = document.getElementById('sidebar');
      if (sb) sb.innerHTML = renderSidebar(activePage);
    })
    .catch(() => {
      clearToken();
      window.location.href = '/login.html';
    });

  // Render initial sidebar from cached user (fast render)
  const sb = document.getElementById('sidebar');
  if (sb) sb.innerHTML = renderSidebar(activePage);
  return true;
}
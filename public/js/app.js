// ============================================================
// Shared app logic — sidebar, greeting, layout, toast
// ============================================================

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

function timeGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function renderSidebar(activePage, pendingCount = null, reviewCount = null, pushCount = null, qaCount = null) {
  const user = getCurrentUser();
  if (!user) return '';

  const links = [
    { group: 'Workspace' },
    { page: 'dashboard',  label: 'Dashboard',      dot: 'var(--text)',   href: '/dashboard.html' },
    { page: 'new-brief',  label: 'New brief',      dot: 'var(--rose)',   href: '/new-brief.html' },
    { group: 'Active' },
    { page: 'approvals',  label: 'Approvals',      dot: 'var(--amber)',  href: '/approvals.html', count: pendingCount },
    { page: 'review',     label: 'Content review', dot: 'var(--blue)',   href: '/review.html',    count: reviewCount },
    { page: 'todoist',    label: 'Todoist push',   dot: 'var(--green)',  href: '/todoist.html',   count: pushCount },
    { group: 'Reference' },
    { page: 'team',       label: 'Team',           dot: 'var(--pink)',   href: '/team.html' },
    { page: 'qa',         label: 'QA checklist',   dot: 'var(--violet)', href: '/qa.html',         count: qaCount },
    { page: 'log',        label: 'Revision log',   dot: 'var(--gray)',   href: '/log.html' },
    { page: 'settings',   label: 'Settings',       dot: 'var(--text-3)', href: '/settings.html' },
  ];

  const linksHtml = links.map(l => {
    if (l.group) return `<div class="sb-group">${l.group}</div>`;
    const isActive = l.page === activePage ? 'on' : '';
    const count = (l.count !== null && l.count !== undefined && l.count > 0) ? `<span class="sb-count">${l.count}</span>` : '';
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

function setTopbar(sectionLabel, campaign = null, actions = '') {
  const trail = document.getElementById('tb-trail');
  const actionsEl = document.getElementById('tb-actions');
  if (trail) {
    trail.innerHTML = campaign
      ? `<span>${sectionLabel}</span><span class="sep">›</span><strong>${campaign}</strong>`
      : `<span>${sectionLabel}</span>`;
  }
  if (actionsEl) actionsEl.innerHTML = actions;
}

function signOut() {
  clearToken();
  window.location.href = '/login.html';
}

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function initShell(activePage) {
  if (!requireAuth()) return false;

  const sb = document.getElementById('sidebar');
  if (sb) sb.innerHTML = renderSidebar(activePage);

  // Refresh in the background: user info + pending approval count
  Promise.all([
    apiCall('GET', '/api/auth/me').catch(() => null),
    apiCall('GET', '/api/approvals/pending').catch(() => ({ pending: [] })),
    apiCall('GET', '/api/reviews/pending-count').catch(() => ({ count: 0 })),
    apiCall('GET', '/api/briefs/push-ready-count').catch(() => ({ count: 0 })),
    apiCall('GET', '/api/briefs/qa-incomplete-count').catch(() => ({ count: 0 })),
  ]).then(([meRes, penRes, revRes, pushRes, qaRes]) => {
    if (!meRes) {
      clearToken();
      window.location.href = '/login.html';
      return;
    }
    setCurrentUser(meRes.user);
    const count       = (penRes.pending || []).length;
    const reviewCount = revRes.count  || 0;
    const pushCount   = pushRes.count || 0;
    const qaCount     = qaRes.count   || 0;
    if (sb) sb.innerHTML = renderSidebar(activePage, count, reviewCount, pushCount, qaCount);
  });

  return true;
}

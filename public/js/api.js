// ============================================================
// API helper — talks to the backend
// ============================================================

// Get the login token from browser storage
function getToken() {
  return localStorage.getItem('sp_token');
}

// Save the login token after a successful login
function setToken(token) {
  localStorage.setItem('sp_token', token);
}

// Clear the token (logout)
function clearToken() {
  localStorage.removeItem('sp_token');
  localStorage.removeItem('sp_user');
}

// Get the current user info from browser storage
function getCurrentUser() {
  const raw = localStorage.getItem('sp_user');
  return raw ? JSON.parse(raw) : null;
}

// Save the current user info
function setCurrentUser(user) {
  localStorage.setItem('sp_user', JSON.stringify(user));
}

// The main function — calls any API endpoint with the token attached
async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  const token = getToken();
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}
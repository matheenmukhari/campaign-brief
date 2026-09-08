// ============================================================
// Auth flow — handles the login form
// ============================================================

async function handleLogin(event) {
  event.preventDefault(); // stop the form from reloading the page

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-btn');

  errorEl.textContent = '';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  try {
    const data = await apiCall('POST', '/api/auth/login', { email, password });

    // Save token + user info to browser storage
    setToken(data.token);
    setCurrentUser(data.user);

    // Redirect to the dashboard
    window.location.href = '/dashboard.html';
  } catch (err) {
    errorEl.textContent = err.message;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
}

// If user is already logged in, skip login and go straight to dashboard
window.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    window.location.href = '/dashboard.html';
  }
  document.getElementById('login-form').addEventListener('submit', handleLogin);
});
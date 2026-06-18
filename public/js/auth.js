// auth.js - Shared authentication helpers
// CAGEwrx Ops

const SESSION_KEY = 'cw_session';

/**
 * Get the current session from localStorage
 * Returns session object or null
 */
function getSession() {
  try {
    var s = localStorage.getItem(SESSION_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

/**
 * Save session to localStorage
 */
function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
  catch (e) {}
}

/**
 * Clear session and redirect to login
 */
function signOut() {
  localStorage.removeItem(SESSION_KEY);
  window.location.href = 'index.html';
}

/**
 * Require a valid session or redirect to login
 * Returns the session object if valid
 */
function requireAuth() {
  var sess = getSession();
  if (!sess || !sess.access_token) {
    window.location.href = 'index.html';
    return null;
  }
  return sess;
}

/**
 * Fetch the user's profile from Supabase
 * Updates session with role and full_name
 */
function fetchProfile(sess, callback) {
  fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + sess.user.id + '&select=role,full_name', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + sess.access_token
    }
  })
  .then(function (r) { return r.json(); })
  .then(function (rows) {
    if (Array.isArray(rows) && rows.length) {
      sess.role = rows[0].role || 'user';
      sess.full_name = rows[0].full_name || '';
      saveSession(sess);
    }
    callback(sess);
  })
  .catch(function () { callback(sess); });
}

/**
 * Render avatar UI elements from session data
 */
function renderAvatar(sess) {
  var name = (sess && sess.full_name) || (sess && sess.user && sess.user.email) || '';
  var role = (sess && sess.role) || 'user';

  var av = document.getElementById('user-avatar');
  if (av && name) {
    var parts = name.trim().split(' ');
    av.textContent = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  var nameEl = document.getElementById('avatar-name');
  if (nameEl) nameEl.textContent = name;

  var emailEl = document.getElementById('avatar-email');
  if (emailEl) emailEl.textContent = (sess && sess.user && sess.user.email) || '';

  var roleEl = document.getElementById('avatar-role-badge');
  if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  var adminBtn = document.getElementById('admin-btn');
  if (adminBtn) adminBtn.style.display = role === 'admin' ? 'inline-flex' : 'none';
}

/**
 * Set up avatar dropdown toggle
 */
function initAvatarDropdown() {
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (!e.target.closest('#user-avatar') && !e.target.closest('#av-dd')) {
      var dd = document.getElementById('av-dd');
      if (dd) dd.style.display = 'none';
    }
  });

  var av = document.getElementById('user-avatar');
  if (av) {
    av.addEventListener('click', function () {
      var dd = document.getElementById('av-dd');
      if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
    });
  }
}

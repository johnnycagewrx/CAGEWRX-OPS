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
  fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + sess.user.id + '&select=role,full_name,must_change_password', {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + sess.access_token
    }
  })
  .then(function (r) { return r.json(); })
  .then(function (rows) {
    if (Array.isArray(rows) && rows.length) {
      sess.role = rows[0].role || 'user';
      // Use profile full_name, fall back to Auth metadata name
      var profileName = rows[0].full_name || '';
      var metaName = (sess.user && sess.user.user_metadata && sess.user.user_metadata.full_name) || '';
      sess.full_name = profileName || metaName || '';
      sess.must_change_password = !!rows[0].must_change_password;
      saveSession(sess);
    }
    callback(sess);
    checkForcePasswordChange(sess);
  })
  .catch(function () { callback(sess); });
}

/**
 * Render avatar UI elements from session data
 */
function renderAvatar(sess) {
  var fullName = (sess && sess.full_name) || '';
  var email    = (sess && sess.user && sess.user.email) || '';
  var name     = fullName || email;
  var role     = (sess && sess.role) || 'user';

  // Avatar circle initials
  var av = document.getElementById('user-avatar');
  if (av && name) {
    var parts = name.trim().split(' ');
    av.textContent = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  // Name label next to avatar (shows first name or email prefix)
  var nameLabel = document.getElementById('avatar-name-label');
  if (nameLabel) {
    var displayName = fullName
      ? fullName.split(' ')[0]
      : email.split('@')[0];
    nameLabel.textContent = displayName;
  }

  // Dropdown profile details
  var nameEl = document.getElementById('avatar-name');
  if (nameEl) nameEl.textContent = fullName || email;

  var emailEl = document.getElementById('avatar-email');
  if (emailEl) emailEl.textContent = email;

  var roleEl = document.getElementById('avatar-role-badge');
  if (roleEl) roleEl.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  var adminBtn = document.getElementById('admin-btn');
  if (adminBtn) adminBtn.style.display = role === 'admin' ? 'inline-flex' : 'none';
}

/**
 * Set up avatar dropdown toggle
 */
function initAvatarDropdown() {
  // Close dropdown when clicking outside
  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    if (!e.target.closest('.avatar-trigger') && !e.target.closest('#av-dd')) {
      var dd = document.getElementById('av-dd');
      if (dd) dd.style.display = 'none';
    }
  });

  // Open/close when clicking the trigger (avatar + name label)
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('.avatar-trigger');
    if (trigger) {
      var dd = document.getElementById('av-dd');
      if (dd) dd.style.display = dd.style.display === 'none' || !dd.style.display ? 'block' : 'none';
    }
  });
}

/**
 * Global ESC-to-close for modals, the avatar dropdown, and the briefing
 * customize panel. Runs on every page since this file is loaded everywhere.
 * Closes by toggling the same classes/styles each popup's own close
 * function uses, so no page-specific wiring is needed.
 */
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;

  var avDd = document.getElementById('av-dd');
  if (avDd && avDd.style.display === 'block') { avDd.style.display = 'none'; return; }

  // The date picker can stack on top of another modal (e.g. Add Order) -
  // close just the picker first so the form underneath isn't lost too.
  var datePicker = document.getElementById('date-picker-modal');
  if (datePicker && datePicker.classList.contains('open')) {
    datePicker.classList.remove('open');
    return;
  }

  // The forced password-change modal isn't dismissable via ESC - it has
  // to actually be completed (or the user signs out) before continuing.
  var openOverlays = Array.prototype.filter.call(
    document.querySelectorAll('.modal-overlay.open, .move-overlay.open'),
    function (el) { return el.id !== 'force-pw-modal'; }
  );
  if (openOverlays.length) {
    openOverlays.forEach(function (el) { el.classList.remove('open'); });
    return;
  }

  var briefingPanel = document.getElementById('briefing-panel');
  if (briefingPanel && briefingPanel.classList.contains('open')) {
    briefingPanel.classList.remove('open');
    var scrim = document.getElementById('briefing-scrim');
    if (scrim) scrim.classList.remove('open');
  }
});

/**
 * Forced password-change flow. Triggered from fetchProfile() (and
 * docs.js's own profile load, which doesn't go through fetchProfile)
 * whenever profiles.must_change_password is true - e.g. after an admin
 * resets someone's password via the admin API. Blocks the rest of the
 * app until they set a new one; no way to dismiss except signing out.
 */
function checkForcePasswordChange(sess) {
  if (!sess || !sess.must_change_password) return;
  if (document.getElementById('force-pw-modal')) return;

  var wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="modal-overlay open" id="force-pw-modal" style="z-index:5000;">' +
      '<div class="modal" style="max-width:380px;">' +
        '<div class="modal-title">Set a New Password</div>' +
        '<p style="font-size:12px;color:#888;margin-bottom:16px;line-height:1.5;">' +
          'Your password was reset. Choose a new one to continue.' +
        '</p>' +
        '<label>New Password</label>' +
        '<input type="password" id="force-pw-new" placeholder="At least 8 characters">' +
        '<label>Confirm Password</label>' +
        '<input type="password" id="force-pw-confirm" placeholder="Re-enter password">' +
        '<div class="modal-btns">' +
          '<button class="modal-btn modal-btn-cancel" onclick="signOut()">Sign Out</button>' +
          '<button class="modal-btn modal-btn-save" onclick="submitForcePasswordChange()">Save &amp; Continue</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstElementChild);
}

function submitForcePasswordChange() {
  var pw = (document.getElementById('force-pw-new').value || '');
  var confirmPw = (document.getElementById('force-pw-confirm').value || '');
  if (pw.length < 8) { showBanner('Password must be at least 8 characters', 'error'); return; }
  if (pw !== confirmPw) { showBanner('Passwords do not match', 'error'); return; }

  var sess = getSession();
  if (!sess || !sess.access_token) return;

  fetch(SUPABASE_URL + '/auth/v1/user', {
    method: 'PUT',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + sess.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ password: pw })
  })
  .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
  .then(function (res) {
    if (!res.ok) throw new Error(res.data.msg || res.data.error_description || res.data.error || 'Could not update password');
    return fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + sess.user.id, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + sess.access_token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ must_change_password: false })
    });
  })
  .then(function () {
    sess.must_change_password = false;
    saveSession(sess);
    var m = document.getElementById('force-pw-modal');
    if (m) m.remove();
    showBanner('Password updated!', 'success');
  })
  .catch(function (e) {
    showBanner('Error: ' + (e.message || 'could not update password'), 'error');
  });
}
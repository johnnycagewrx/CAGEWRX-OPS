// docs.js - CAGEwrx Ops Document Center logic

'use strict';

// ---- State ----
var currentUser  = null;
var currentProfile = null;
var allDocs      = [];
var selectedFile = null;
var activeCategory = 'all';

// ---- Auth ----
function doSignIn() {
  var email    = document.getElementById('login-email').value.trim();
  var password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthError('Please enter email and password'); return; }

  document.getElementById('auth-error').style.display = 'none';

  fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: password })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (!data.access_token) {
      showAuthError(data.error_description || data.error || 'Invalid credentials');
      return;
    }
    currentUser = { access_token: data.access_token, user: data.user };
    saveSession({ access_token: data.access_token, user: data.user, role: 'pending' });
    loadProfile();
  })
  .catch(function () { showAuthError('Network error - check connection'); });
}

function showAuthError(msg) {
  var el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function doSignOut() {
  localStorage.removeItem('cw_session');
  currentUser = null;
  currentProfile = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// ---- Profile ----
function loadProfile() {
  fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + currentUser.user.id + '&select=*', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + currentUser.access_token }
  })
  .then(function (r) { return r.json(); })
  .then(function (rows) {
    currentProfile = Array.isArray(rows) && rows.length ? rows[0] : { role: 'user' };
    // Update stored session with real role
    var sess = getSession() || {};
    sess.role = currentProfile.role || 'user';
    sess.full_name = currentProfile.full_name || '';
    saveSession(sess);
    showApp();
  })
  .catch(function () {
    currentProfile = { role: 'user' };
    showApp();
  });
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  var isAdmin = currentProfile && currentProfile.role === 'admin';
  var tabsWrap  = document.getElementById('admin-tabs-wrap');
  var uploadBtn = document.getElementById('upload-btn');
  if (tabsWrap)  tabsWrap.style.display  = isAdmin ? 'block' : 'none';
  if (uploadBtn) uploadBtn.style.display = isAdmin ? 'inline-flex' : 'none';

  // Render avatar
  var name = (currentProfile && currentProfile.full_name) || currentUser.user.email || '';
  var role = (currentProfile && currentProfile.role) || 'user';
  var av = document.getElementById('user-avatar');
  if (av && name) {
    var parts = name.trim().split(' ');
    av.textContent = parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }
  var nameEl  = document.getElementById('avatar-name');
  var emailEl = document.getElementById('avatar-email');
  var roleEl  = document.getElementById('avatar-role-badge');
  if (nameEl)  nameEl.textContent  = name;
  if (emailEl) emailEl.textContent = currentUser.user.email || '';
  if (roleEl)  roleEl.textContent  = role.charAt(0).toUpperCase() + role.slice(1);

  loadDocs();
  if (isAdmin) loadUsers();
}

// ---- Session restore ----
(function () {
  var sess = getSession();
  if (sess && sess.access_token && sess.user) {
    currentUser = { access_token: sess.access_token, user: sess.user };
    loadProfile();
    return;
  }
  // Show login form
  var pw = document.getElementById('login-password');
  if (pw) pw.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
  var em = document.getElementById('login-email');
  if (em) em.addEventListener('keydown', function (e) { if (e.key === 'Enter') doSignIn(); });
})();

// ---- Documents ----
function loadDocs() {
  var grid = document.getElementById('docs-grid');
  if (grid) grid.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

  fetch(SUPABASE_URL + '/rest/v1/documents?select=*&order=created_at.desc', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + currentUser.access_token }
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    allDocs = Array.isArray(data) ? data : [];
    filterDocs();
  })
  .catch(function () {
    if (grid) grid.innerHTML = '<div class="empty-state"><div class="empty-text">Could not load documents</div></div>';
  });
}

function setCategory(cat, el) {
  activeCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(function (t) { t.classList.remove('active'); });
  if (el) el.classList.add('active');
  filterDocs();
}

function filterDocs() {
  var searchEl = document.getElementById('doc-search');
  var sortEl   = document.getElementById('doc-sort');
  var search   = searchEl ? searchEl.value.toLowerCase() : '';
  var sort     = sortEl   ? sortEl.value   : 'newest';

  var filtered = allDocs.filter(function (d) {
    var matchCat    = activeCategory === 'all' || d.category === activeCategory;
    var matchSearch = !search ||
      (d.name        || '').toLowerCase().indexOf(search) !== -1 ||
      (d.sku         || '').toLowerCase().indexOf(search) !== -1 ||
      (d.description || '').toLowerCase().indexOf(search) !== -1;
    return matchCat && matchSearch;
  });

  filtered.sort(function (a, b) {
    if (sort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (sort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (sort === 'name')   return (a.name || '').localeCompare(b.name || '');
    if (sort === 'sku')    return (a.sku  || '').localeCompare(b.sku  || '');
    return 0;
  });

  renderDocs(filtered);
}

function renderDocs(list) {
  var grid    = document.getElementById('docs-grid');
  var isAdmin = currentProfile && currentProfile.role === 'admin';

  if (!list || !list.length) {
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon">&#x1F4C2;</div><div class="empty-text">No documents found</div></div>';
    return;
  }

  grid.innerHTML = list.map(function (d) {
    var ext       = (d.file_type || '').toLowerCase();
    var iconClass = ext === 'pdf' ? 'pdf' : (ext.match(/png|jpg|jpeg|webp/) ? 'img' : 'other');
    var iconEmoji = ext === 'pdf' ? '&#x1F4C4;' : (ext.match(/png|jpg|jpeg|webp/) ? '&#x1F5BC;' : '&#x1F4CB;');
    var date      = d.created_at
      ? new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : '';
    var delBtn = isAdmin
      ? '<button class="doc-btn doc-btn-del" onclick="deleteDoc(\'' + d.id + '\',\'' + d.file_path + '\')">Delete</button>'
      : '';

    return '<div class="doc-card">' +
      '<div class="doc-top">' +
        '<div class="doc-icon ' + iconClass + '">' + iconEmoji + '</div>' +
        '<div class="doc-info">' +
          '<div class="doc-name" title="' + d.name + '">' + d.name + '</div>' +
          (d.sku  ? '<div class="doc-sku">SKU: ' + d.sku + '</div>' : '') +
          (d.description ? '<div class="doc-desc">' + d.description + '</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="doc-meta">' +
        '<span class="doc-cat">' + (d.category || '') + '</span>' +
        '<span class="doc-date">' + date + '</span>' +
      '</div>' +
      '<div class="doc-actions">' +
        '<button class="doc-btn doc-btn-view" onclick="viewDoc(\'' + d.file_path + '\')">&#x1F441; View</button>' +
        delBtn +
      '</div>' +
    '</div>';
  }).join('');
}

function viewDoc(filePath) {
  fetch(SUPABASE_URL + '/storage/v1/object/sign/cagewrx-docs/' + filePath, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + currentUser.access_token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expiresIn: 300 })
  })
  .then(function (r) { return r.json(); })
  .then(function (data) {
    if (data.signedURL) window.open(SUPABASE_URL + data.signedURL, '_blank');
    else showBanner('Could not open file', 'error');
  });
}

function deleteDoc(id, filePath) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  fetch(SUPABASE_URL + '/storage/v1/object/cagewrx-docs/' + filePath, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + currentUser.access_token }
  })
  .then(function () {
    return fetch(SUPABASE_URL + '/rest/v1/documents?id=eq.' + id, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + currentUser.access_token, 'Prefer': 'return=minimal' }
    });
  })
  .then(function () { showBanner('Document deleted', 'success'); loadDocs(); })
  .catch(function () { showBanner('Delete failed', 'error'); });
}

// ---- Upload ----
function openUploadModal() {
  var m = document.getElementById('upload-modal');
  if (m) m.classList.add('open');
  selectedFile = null;
  var prev = document.getElementById('upload-preview');
  var fi   = document.getElementById('file-input');
  if (prev) prev.textContent = '';
  if (fi)   fi.value = '';
}

function closeUploadModal() {
  var m = document.getElementById('upload-modal');
  if (m) m.classList.remove('open');
  selectedFile = null;
}

function onUploadDragOver(e) { e.preventDefault(); document.getElementById('upload-area').classList.add('drag-over'); }
function onUploadDragLeave()  { document.getElementById('upload-area').classList.remove('drag-over'); }
function onUploadDrop(e) {
  e.preventDefault();
  document.getElementById('upload-area').classList.remove('drag-over');
  var f = e.dataTransfer.files[0];
  if (f) setUploadFile(f);
}
function onFileSelect(e) { var f = e.target.files[0]; if (f) setUploadFile(f); }
function setUploadFile(file) {
  selectedFile = file;
  var prev = document.getElementById('upload-preview');
  if (prev) prev.textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(2) + 'MB)';
}

function uploadFile() {
  var nameEl = document.getElementById('up-name');
  var name   = nameEl ? nameEl.value.trim() : '';
  if (!name)         { showBanner('Document name is required', 'error'); return; }
  if (!selectedFile) { showBanner('Please select a file', 'error'); return; }

  var ext      = selectedFile.name.split('.').pop().toLowerCase();
  var filePath = Date.now() + '_' + selectedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');

  showBanner('Uploading...', 'success');

  fetch(SUPABASE_URL + '/storage/v1/object/cagewrx-docs/' + filePath, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + currentUser.access_token,
      'Content-Type': selectedFile.type || 'application/octet-stream'
    },
    body: selectedFile
  })
  .then(function (r) { return r.json(); })
  .then(function (storageData) {
    if (storageData.error) { showBanner('Upload failed: ' + storageData.error, 'error'); return Promise.reject(); }
    var skuEl  = document.getElementById('up-sku');
    var catEl  = document.getElementById('up-category');
    var descEl = document.getElementById('up-desc');
    return fetch(SUPABASE_URL + '/rest/v1/documents', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + currentUser.access_token,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        name:        name,
        sku:         skuEl  ? skuEl.value.trim()  : '',
        category:    catEl  ? catEl.value          : 'Other',
        description: descEl ? descEl.value.trim()  : '',
        file_path:   filePath,
        file_type:   ext,
        file_size:   selectedFile.size,
        uploaded_by: currentUser.user.id
      })
    });
  })
  .then(function () { showBanner('Document uploaded!', 'success'); closeUploadModal(); loadDocs(); })
  .catch(function (e) { if (e) showBanner('Upload error', 'error'); });
}

// ---- User management ----
function loadUsers() {
  var tbody = document.getElementById('user-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#333;padding:20px;">Loading...</td></tr>';

  fetch(SUPABASE_URL + '/rest/v1/profiles?select=*&order=created_at.asc', {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + currentUser.access_token }
  })
  .then(function (r) { return r.json(); })
  .then(function (users) {
    users = Array.isArray(users) ? users : [];
    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#333;padding:20px;">No users yet</td></tr>';
      return;
    }
    tbody.innerHTML = users.map(function (u) {
      var date   = u.created_at
        ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '';
      var isSelf = u.id === currentUser.user.id;
      var roleEl = isSelf
        ? '<span class="role-badge role-' + u.role + '">' + u.role + '</span>'
        : '<select class="role-select" onchange="updateRole(\'' + u.id + '\',this.value)">' +
            '<option value="user"'  + (u.role === 'user'  ? ' selected' : '') + '>user</option>' +
            '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option>' +
          '</select>';
      var actions = isSelf
        ? '<span style="color:#333;font-size:11px;">You</span>'
        : '<button class="doc-btn doc-btn-del" onclick="removeUser(\'' + u.id + '\')">Remove</button>';

      return '<tr>' +
        '<td>' + (u.full_name || '-') + '</td>' +
        '<td style="color:#555;">' + u.email + '</td>' +
        '<td>' + roleEl + '</td>' +
        '<td style="color:#333;">' + date + '</td>' +
        '<td>' + actions + '</td>' +
      '</tr>';
    }).join('');
  })
  .catch(function () {
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef5350;padding:20px;">Could not load users</td></tr>';
  });
}

function updateRole(userId, role) {
  fetch(SUPABASE_URL + '/rest/v1/profiles?id=eq.' + userId, {
    method: 'PATCH',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + currentUser.access_token,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ role: role })
  })
  .then(function () { showBanner('Role updated', 'success'); })
  .catch(function () { showBanner('Could not update role', 'error'); });
}

function removeUser(userId) {
  if (!confirm('Remove this user? They will no longer be able to log in.')) return;
  fetch('/.netlify/functions/admin-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'delete_user', user_id: userId })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.success) { showBanner('User removed', 'success'); loadUsers(); }
    else showBanner('Could not remove user', 'error');
  })
  .catch(function () { showBanner('Error removing user', 'error'); });
}

function inviteUser() {
  var emailEl = document.getElementById('invite-email');
  var nameEl  = document.getElementById('invite-name');
  var roleEl  = document.getElementById('invite-role');
  var email   = emailEl ? emailEl.value.trim() : '';
  var name    = nameEl  ? nameEl.value.trim()  : '';
  var role    = roleEl  ? roleEl.value          : 'user';
  if (!email) { showBanner('Email is required', 'error'); return; }

  fetch('/.netlify/functions/admin-api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'create_user', email: email, full_name: name, role: role })
  })
  .then(function (r) { return r.json(); })
  .then(function (d) {
    if (d.success) {
      showBanner('User created! Temp password: CageWrx2024!', 'success');
      if (emailEl) emailEl.value = '';
      if (nameEl)  nameEl.value  = '';
      loadUsers();
    } else {
      showBanner('Could not create user: ' + (d.error || 'unknown'), 'error');
    }
  })
  .catch(function (e) { showBanner('Error: ' + e.message, 'error'); });
}

// ---- Tab switching ----
function switchTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(function (t, i) {
    t.classList.toggle('active', (i === 0 && tab === 'docs') || (i === 1 && tab === 'users'));
  });
  var docsSection  = document.getElementById('tab-docs');
  var usersSection = document.getElementById('tab-users');
  if (docsSection)  docsSection.classList.toggle('active',  tab === 'docs');
  if (usersSection) usersSection.classList.toggle('active', tab === 'users');
}

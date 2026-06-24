// sidebar.js - Shared sidebar navigation
// CAGEwrx Ops

function renderSidebar(activePage) {
  var isOnAdminPage = activePage === 'docs' || activePage === 'users';
  var isMobileSidebar = window.innerWidth <= 768;

  var adminSubLinks = '';
  if (isOnAdminPage && !isMobileSidebar) {
    var docActive  = activePage === 'docs'  ? ' active' : '';
    var userActive = activePage === 'users' ? ' active' : '';
    adminSubLinks =
      '<a class="sidebar-link sidebar-sublink' + docActive + '" data-page="docs" href="#" onclick="event.preventDefault();switchTab(\'docs\')">'
      + '<span class="sidebar-link-icon">&#x1F4C4;</span><span class="sidebar-link-label">Documents</span></a>'
      + '<a class="sidebar-link sidebar-sublink' + userActive + '" data-page="users" href="#" onclick="event.preventDefault();switchTab(\'users\')">'
      + '<span class="sidebar-link-icon">&#x1F465;</span><span class="sidebar-link-label">User Management</span></a>';
  }

  var adminActive = isOnAdminPage ? ' active' : '';
  var adminClick  = isMobileSidebar
    ? 'href="#" onclick="event.preventDefault();toggleAdminSubmenu()"'
    : 'href="docs.html"';

  var popupDocActive  = activePage === 'docs'  ? ' active' : '';
  var popupUserActive = activePage === 'users' ? ' active' : '';

  var html = ''
    + '<div class="sidebar" id="app-sidebar">'
    + '<div class="sidebar-logo-wrap">'
    + '<img class="sidebar-logo" src="img/favicon.png" alt="CW">'
    + '<span class="sidebar-brand">CAGEWRX OPS</span>'
    + '</div>'
    + '<div class="sidebar-nav">'
    + navLink('orders',     'ops.html',        '&#x1F6CE;', 'Orders',       activePage)
    + navLink('production', 'production.html', '&#x1F527;', 'Production',   activePage)
    + navLink('faq',        'faq.html',        '&#x2753;',  'FAQ',          activePage)
    + navLink('activity',   'activity.html',   '&#x1F4DC;', 'Activity Log', activePage)
    + '<a class="sidebar-link' + adminActive + '" ' + adminClick + '>'
    + '<span class="sidebar-link-icon">&#x1F512;</span>'
    + '<span class="sidebar-link-label">Admin Panel</span></a>'
    + adminSubLinks
    + '</div>'
    + '<div class="sidebar-footer">'
    + '<button class="sidebar-pin" onclick="toggleSidebarPin()" title="Pin sidebar open">'
    + '<span class="sidebar-link-icon" id="pin-icon">&#x1F4CC;</span>'
    + '<span class="sidebar-pin-label" id="pin-label">Pin open</span>'
    + '</button></div></div>'
    + '<div class="admin-submenu-backdrop" id="admin-submenu-backdrop" onclick="closeAdminSubmenu()"></div>'
    + '<div class="admin-submenu-popup" id="admin-submenu-popup">'
    + '<a class="admin-submenu-item' + popupDocActive  + '" href="docs.html" onclick="closeAdminSubmenu()">'
    + '<span class="admin-submenu-item-icon">&#x1F4C4;</span>Documents</a>'
    + '<a class="admin-submenu-item' + popupUserActive + '" href="docs.html?tab=users" onclick="closeAdminSubmenu()">'
    + '<span class="admin-submenu-item-icon">&#x1F465;</span>User Management</a>'
    + '</div>';

  var mount = document.getElementById('sidebar-mount');
  if (mount) mount.outerHTML = html;

  if (localStorage.getItem('cw_sidebar_pinned') === 'true') {
    var sb = document.getElementById('app-sidebar');
    if (sb) sb.classList.add('expanded');
    var lbl = document.getElementById('pin-label');
    if (lbl) lbl.textContent = 'Unpin';
  }
}

function toggleAdminSubmenu() {
  var popup    = document.getElementById('admin-submenu-popup');
  var backdrop = document.getElementById('admin-submenu-backdrop');
  if (!popup) return;
  var isOpen = popup.classList.contains('open');
  popup.classList.toggle('open', !isOpen);
  if (backdrop) backdrop.classList.toggle('open', !isOpen);
}

function closeAdminSubmenu() {
  var popup    = document.getElementById('admin-submenu-popup');
  var backdrop = document.getElementById('admin-submenu-backdrop');
  if (popup)    popup.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}


function navLink(key, href, icon, label, activePage) {
  var isActive = key === activePage;
  return '<a class="sidebar-link' + (isActive ? ' active' : '') + '" href="' + href + '">'
    + '<span class="sidebar-link-icon">' + icon + '</span>'
    + '<span class="sidebar-link-label">' + label + '</span>'
    + '</a>';
}

function toggleSidebarPin() {
  var sb = document.getElementById('app-sidebar');
  if (!sb) return;
  var isPinned = sb.classList.toggle('expanded');
  localStorage.setItem('cw_sidebar_pinned', isPinned ? 'true' : 'false');
  var label = document.getElementById('pin-label');
  if (label) label.textContent = isPinned ? 'Unpin' : 'Pin open';
}

/**
 * Render the shared page header.
 * @param {object} config
 *   label:     string  - page label e.g. "CAGEwrx Operations"
 *   title:     string  - page title e.g. "ORDERS"
 *   mountId:   string  - id of element to replace (default "header-mount")
 *   buttons:   string  - HTML string of action buttons to inject in header-right
 */
function renderHeader(config) {
  config = config || {};
  var label   = config.label   || 'CAGEwrx Operations';
  var title   = config.title   || '';
  var buttons = config.buttons || '';
  var mountId = config.mountId || 'header-mount';

  var html = ''
    + '<div class="shared-header">'
    + '  <div class="shared-header-left">'
    + '    <img class="shared-header-logo" src="img/cagewrx_logo.png" alt="CAGEWRX OPS">'
    + '    <div>'
    + '      <div class="shared-header-label">' + label + '</div>'
    + '      <div class="shared-header-title">' + title + '</div>'
    + '    </div>'
    + '  </div>'
    + '  <div class="shared-header-right">'
    + buttons
    + '    <button class="btn" id="theme-btn" onclick="toggleTheme()" title="Toggle light/dark mode">&#x263C;</button>'
    + '    <div class="avatar-wrap">'
    + '      <div class="avatar-trigger" id="avatar-trigger">'
    + '        <div id="user-avatar">?</div>'
    + '        <span class="avatar-name-label" id="avatar-name-label"></span>'
    + '        <span style="font-size:10px;color:#444;">&#x25BE;</span>'
    + '      </div>'
    + '      <div id="av-dd">'
    + '        <div class="av-profile">'
    + '          <div class="av-profile-name" id="avatar-name">Loading...</div>'
    + '          <div class="av-profile-email" id="avatar-email"></div>'
    + '          <span id="avatar-role-badge">User</span>'
    + '        </div>'
    + '        <button class="av-menu-item" onclick="openChangePasswordModal()">&#x1F511; Change Password</button>'
    + '        <button class="av-menu-item danger" onclick="signOut()">&#x2192; Sign Out</button>'
    + '      </div>'
    + '    </div>'
    + '  </div>'
    + '</div>';

  var mount = document.getElementById(mountId);
  if (mount) mount.outerHTML = html;
}


// ---- Change Password Modal ----
function openChangePasswordModal() {
  // Close avatar dropdown
  var dd = document.getElementById('av-dd');
  if (dd) dd.style.display = 'none';

  // Create modal if it doesn't exist
  if (!document.getElementById('change-pw-modal')) {
    var modal = document.createElement('div');
    modal.id = 'change-pw-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = ''
      + '<div class="modal" style="max-width:380px;">'
      + '  <div class="modal-title">&#x1F511; Change Password</div>'
      + '  <label>New Password</label>'
      + '  <input type="password" id="cp-new" placeholder="Min. 8 characters" style="margin-bottom:4px;">'
      + '  <div style="height:4px;background:#1a1a1a;border-radius:2px;margin-bottom:12px;overflow:hidden;">'
      + '    <div id="cp-strength-bar" style="height:100%;width:0;border-radius:2px;transition:all 0.3s;"></div>'
      + '  </div>'
      + '  <label>Confirm Password</label>'
      + '  <input type="password" id="cp-confirm" placeholder="Repeat new password">'
      + '  <div id="cp-error" style="display:none;background:#2a0d0d;border:1px solid #c62828;color:#ff8a80;border-radius:6px;padding:8px 12px;font-size:12px;margin-top:8px;"></div>'
      + '  <div id="cp-success" style="display:none;background:#0d2a0d;border:1px solid #2e7d32;color:#81c784;border-radius:6px;padding:8px 12px;font-size:12px;margin-top:8px;"></div>'
      + '  <div class="modal-btns" style="margin-top:16px;">'
      + '    <button class="modal-btn modal-btn-cancel" onclick="closeChangePasswordModal()">Cancel</button>'
      + '    <button class="modal-btn modal-btn-save" onclick="submitChangePassword()">Update Password</button>'
      + '  </div>'
      + '</div>';
    document.body.appendChild(modal);

    // Strength meter
    document.getElementById('cp-new').addEventListener('input', function() {
      var pw = this.value;
      var score = 0;
      if (pw.length >= 8) score++;
      if (/[A-Z]/.test(pw)) score++;
      if (/[0-9]/.test(pw)) score++;
      if (/[^A-Za-z0-9]/.test(pw)) score++;
      var bar = document.getElementById('cp-strength-bar');
      var colors = ['#ef5350','#ff9800','#ffca28','#4caf50'];
      bar.style.width = (score * 25) + '%';
      bar.style.background = colors[score - 1] || '#1a1a1a';
    });
  }

  document.getElementById('cp-new').value = '';
  document.getElementById('cp-confirm').value = '';
  document.getElementById('cp-error').style.display = 'none';
  document.getElementById('cp-success').style.display = 'none';
  document.getElementById('cp-strength-bar').style.width = '0';
  document.getElementById('change-pw-modal').classList.add('open');
}

function closeChangePasswordModal() {
  var m = document.getElementById('change-pw-modal');
  if (m) m.classList.remove('open');
}

function submitChangePassword() {
  var pw  = document.getElementById('cp-new').value;
  var pw2 = document.getElementById('cp-confirm').value;
  var err = document.getElementById('cp-error');
  var ok  = document.getElementById('cp-success');
  err.style.display = 'none';
  ok.style.display  = 'none';

  if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters'; err.style.display = 'block'; return; }
  if (pw !== pw2)    { err.textContent = 'Passwords do not match'; err.style.display = 'block'; return; }

  var sess = typeof getSession === 'function' ? getSession() : null;
  if (!sess || !sess.access_token) { err.textContent = 'Not logged in'; err.style.display = 'block'; return; }

  var btn = document.querySelector('#change-pw-modal .modal-btn-save');
  if (btn) { btn.disabled = true; btn.textContent = 'Updating...'; }

  fetch('https://jkgftyxavjppgmquueqx.supabase.co/auth/v1/user', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZ2Z0eXhhdmpwcGdtcXV1ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU2MDQsImV4cCI6MjA5NzIxMTYwNH0.bkmtBbDvHPwqDMJnwtF9Bml3B7cs_t579c7FOqstvUo',
      'Authorization': 'Bearer ' + sess.access_token
    },
    body: JSON.stringify({ password: pw })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    if (data.error || data.msg) {
      err.textContent = data.msg || data.error || 'Update failed';
      err.style.display = 'block';
    } else {
      ok.textContent = 'Password updated successfully!';
      ok.style.display = 'block';
      setTimeout(function() { closeChangePasswordModal(); }, 2000);
    }
  })
  .catch(function() {
    if (btn) { btn.disabled = false; btn.textContent = 'Update Password'; }
    err.textContent = 'Something went wrong. Please try again.';
    err.style.display = 'block';
  });
}
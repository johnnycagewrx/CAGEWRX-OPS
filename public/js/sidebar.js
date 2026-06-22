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
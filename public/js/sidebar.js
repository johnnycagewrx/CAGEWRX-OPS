// sidebar.js - Shared sidebar navigation
// CAGEwrx Ops

function renderSidebar(activePage) {
  var html = ''
    + '<div class="sidebar" id="app-sidebar">'
    + '  <div class="sidebar-logo-wrap">'
    + '    <img class="sidebar-logo" src="img/favicon.png" alt="CW">'
    + '    <span class="sidebar-brand">CAGEWRX OPS</span>'
    + '  </div>'
    + '  <div class="sidebar-nav">'
    + navLink('orders', 'ops.html', '&#x1F6CE;', 'Orders', activePage)
    + navLink('production', 'production.html', '&#x1F527;', 'Production', activePage)
    + navLink('faq', 'faq.html', '&#x2753;', 'FAQ', activePage)
    + '  </div>'
    + '  <div class="sidebar-footer">'
    + '    <button class="sidebar-pin" onclick="toggleSidebarPin()" title="Pin sidebar open">'
    + '      <span class="sidebar-link-icon" id="pin-icon">&#x1F4CC;</span>'
    + '      <span class="sidebar-pin-label" id="pin-label">Pin open</span>'
    + '    </button>'
    + '  </div>'
    + '</div>';

  var mount = document.getElementById('sidebar-mount');
  if (mount) mount.outerHTML = html;

  // Restore pinned state
  if (localStorage.getItem('cw_sidebar_pinned') === 'true') {
    var sb = document.getElementById('app-sidebar');
    if (sb) sb.classList.add('expanded');
    var label = document.getElementById('pin-label');
    if (label) label.textContent = 'Unpin';
  }
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

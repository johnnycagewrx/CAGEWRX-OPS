// activity-page.js - Activity Log page logic

'use strict';

var allLogEntries = [];
var logPageSize = 50;
var logLoaded = 0;
var logFilterTable = 'all';
var logFilterAction = 'all';

var ACTION_ICONS = {
  create: '&#x2795;',
  update: '&#x270E;',
  move:   '&#x2194;',
  delete: '&#x2715;'
};

var ACTION_LABELS = {
  create: 'Created',
  update: 'Edited',
  move:   'Moved',
  delete: 'Deleted'
};

var TABLE_LABELS = {
  orders: 'Orders',
  tasks: 'Production',
  faq_items: 'FAQ'
};

function loadActivityLog(append) {
  var list = document.getElementById('act-list');
  if (!append) {
    logLoaded = 0;
    allLogEntries = [];
    if (list) list.innerHTML = '<div style="padding:40px;text-align:center;"><div class="spinner"></div></div>';
  }

  var offset = logLoaded;
  sbFetch('GET', '/rest/v1/activity_log?select=*&order=created_at.desc&limit=' + logPageSize + '&offset=' + offset, null, function (err, data) {
    var rows = (err || !Array.isArray(data)) ? [] : data;
    allLogEntries = allLogEntries.concat(rows);
    logLoaded += rows.length;
    renderActivityList();

    var loadMoreBtn = document.getElementById('act-load-more');
    if (loadMoreBtn) loadMoreBtn.style.display = rows.length === logPageSize ? 'block' : 'none';
  });
}

function loadMoreActivity() {
  loadActivityLog(true);
}

function setLogFilterTable(val) {
  logFilterTable = val;
  renderActivityList();
}

function setLogFilterAction(val) {
  logFilterAction = val;
  renderActivityList();
}

function filterActivityEntries() {
  var searchEl = document.getElementById('act-search');
  var search = searchEl ? searchEl.value.toLowerCase().trim() : '';

  return allLogEntries.filter(function (e) {
    var matchTable = logFilterTable === 'all' || e.table_name === logFilterTable;
    var matchAction = logFilterAction === 'all' || e.action === logFilterAction;
    var matchSearch = !search ||
      (e.summary || '').toLowerCase().indexOf(search) !== -1 ||
      (e.user_email || '').toLowerCase().indexOf(search) !== -1 ||
      (e.user_name || '').toLowerCase().indexOf(search) !== -1;
    return matchTable && matchAction && matchSearch;
  });
}

function renderActivityList() {
  var list = document.getElementById('act-list');
  if (!list) return;

  var filtered = filterActivityEntries();

  if (!filtered.length) {
    list.innerHTML = '<div class="act-empty"><div class="act-empty-icon">&#x1F4DC;</div><div>No activity found</div></div>';
    return;
  }

  list.innerHTML = filtered.map(buildLogEntryHTML).join('');
}

function timeAgo(dateStr) {
  var d = new Date(dateStr);
  var diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function buildLogEntryHTML(e) {
  var icon = ACTION_ICONS[e.action] || '&#x2022;';
  var iconClass = 'act-icon-' + e.action;
  var who = e.user_name || e.user_email || 'Unknown';
  var when = timeAgo(e.created_at);
  var tableLabel = TABLE_LABELS[e.table_name] || e.table_name;

  var changesHTML = '';
  if (e.field_changes && Object.keys(e.field_changes).length) {
    var rows = Object.keys(e.field_changes).map(function (field) {
      var c = e.field_changes[field];
      var oldVal = (c.old === null || c.old === undefined || c.old === '') ? '(empty)' : c.old;
      var newVal = (c.new === null || c.new === undefined || c.new === '') ? '(empty)' : c.new;
      return '<div class="act-change-row">' +
        '<span class="act-change-field">' + field.replace(/_/g, ' ') + '</span>' +
        '<span class="act-change-old">' + oldVal + '</span>' +
        '<span style="color:#444;">&#x2192;</span>' +
        '<span class="act-change-new">' + newVal + '</span>' +
      '</div>';
    }).join('');
    changesHTML = '<div class="act-changes">' + rows + '</div>';
  }

  var actionBtn = e.undone
    ? '<span class="act-undone-label">Undone</span>'
    : '<button class="act-undo-btn" onclick="handleUndo(\'' + e.id + '\', this)">&#x21A9; Undo</button>';

  return '<div class="act-entry' + (e.undone ? ' undone' : '') + '">' +
    '<div class="act-action-icon ' + iconClass + '">' + icon + '</div>' +
    '<div class="act-entry-body">' +
      '<div class="act-summary">' + (e.summary || (ACTION_LABELS[e.action] + ' in ' + tableLabel)) + '</div>' +
      '<div class="act-meta">' +
        '<span class="act-meta-user">' + who + '</span>' +
        '<span>' + tableLabel + '</span>' +
        '<span>' + when + '</span>' +
      '</div>' +
      changesHTML +
    '</div>' +
    '<div class="act-entry-actions">' + actionBtn + '</div>' +
  '</div>';
}

function handleUndo(logId, btnEl) {
  if (!confirm('Undo this action? This will restore the previous state.')) return;
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = 'Undoing...'; }
  undoActivity(logId, function (err) {
    if (err) {
      showBanner('Undo failed: ' + err, 'error');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = '↩ Undo'; }
    } else {
      showBanner('Action undone', 'success');
      loadActivityLog(false);
    }
  });
}

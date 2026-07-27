// briefing.js - Morning Briefing page logic
// CAGEwrx Ops

var today = new Date();
var isMonday = today.getDay() === 1;

// ---------------------------------------------------------------------
// STILL MOCK - swap these two blocks out once the Cloudflare Worker cron
// jobs are writing into briefing_report_cache (see integration notes).
// ---------------------------------------------------------------------
var MOCK_ADS_WEEKEND = { spend: 412.18, clicks: 289, conv: 6, ctr: 3.8, cpa: 68.70, roas: 2.9 };
var MOCK_ADS_WTD      = { spend: 918.44, clicks: 671, conv: 15, ctr: 4.1, cpa: 61.23, roas: 3.4 };
var MOCK_SHOPIFY_MTD  = { revenue: 48210, orders: 96, aov: 502.19, conv: 2.1, topProduct: 'RZR Pro R Super Shorty Cage' };

// Live data, filled in by fetchDeadlines() before the first render.
// Starts empty so an empty state shows correctly if the fetch is slow.
var LIVE = { deadlines: [] };

var _sess = null;

// ---------------------------------------------------------------------
// UPSERT HELPER
// sbFetch() (from supabase.js) always sends Prefer: return=representation
// on POST, which isn't enough for an upsert - we also need
// resolution=merge-duplicates and an on_conflict target. Written here
// rather than editing the shared supabase.js so other pages are untouched.
// ---------------------------------------------------------------------
function sbUpsert(path, onConflictCols, rows, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open('POST', SUPABASE_URL + path + '?on_conflict=' + onConflictCols, true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.setRequestHeader('Prefer', 'resolution=merge-duplicates,return=minimal');
  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) { cb(null); }
    else {
      var msg = xhr.responseText;
      try { var p = JSON.parse(msg); msg = p.message || p.error || msg; } catch (e) {}
      cb('Error ' + xhr.status + ': ' + msg);
    }
  };
  xhr.onerror = function () { cb('Network error'); };
  xhr.send(JSON.stringify(rows));
}

// ---------------------------------------------------------------------
// DEADLINES - real data from briefing_deadlines_view
// ---------------------------------------------------------------------
function formatDueDate(dueDateStr) {
  var due = new Date(dueDateStr + 'T00:00:00');
  var diffDays = Math.round((due - new Date(today.toDateString())) / 86400000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return 'in ' + diffDays + ' days';
}

function fetchDeadlines(cb) {
  sbFetch('GET', '/rest/v1/briefing_deadlines_view?select=title,due_date,urgency&order=due_date.asc', null, function (err, rows) {
    if (err || !rows) {
      console.error('Could not load deadlines:', err);
      LIVE.deadlines = [];
      cb();
      return;
    }
    LIVE.deadlines = rows.map(function (row) {
      return { name: row.title, due: formatDueDate(row.due_date), tag: row.urgency };
    });
    cb();
  });
}

// ---------------------------------------------------------------------
// WIDGET REGISTRY
// ---------------------------------------------------------------------
var WIDGET_DEFS = [
  {
    id: 'deadlines', title: 'Upcoming deadlines', accent: '#ffa726',
    meta: function () { return LIVE.deadlines.length + ' tracked'; },
    render: function () {
      if (!LIVE.deadlines.length) return '<p class="briefing-empty">Nothing on the calendar right now.</p>';
      var html = '<div>';
      LIVE.deadlines.forEach(function (d) {
        html += '<div class="briefing-row">'
          + '<div><p class="briefing-row-title">' + d.name + '</p></div>'
          + '<span class="briefing-tag ' + d.tag + '">' + d.due + '</span>'
          + '</div>';
      });
      html += '</div>';
      return html;
    }
  },
  {
    id: 'googleads', title: 'Google Ads', accent: '#42a5f5',
    meta: function () { return isMonday ? 'Weekend + week-to-date' : 'Week-to-date'; },
    render: function () {
      var d = isMonday ? MOCK_ADS_WEEKEND : MOCK_ADS_WTD;
      var label = isMonday ? 'Weekend recap (Sat-Sun)' : 'Week-to-date (Mon-today)';
      var note = isMonday ? '<p class="briefing-row-sub" style="margin-top:10px;">Week-to-date resets today.</p>' : '';
      return '<p class="briefing-row-sub" style="margin-bottom:10px;">' + label + '</p>'
        + '<div class="briefing-stat-grid">'
        + stat('Spend', '$' + d.spend.toFixed(2))
        + stat('Clicks', d.clicks)
        + stat('Conversions', d.conv)
        + '</div>'
        + '<div class="briefing-stat-grid">'
        + stat('CTR', d.ctr + '%')
        + stat('Cost / conv', '$' + d.cpa.toFixed(2))
        + stat('ROAS', d.roas + 'x')
        + '</div>' + note;
    }
  },
  {
    id: 'shopify', title: 'Shopify - month to date', accent: '#4caf50',
    meta: function () { return today.toLocaleString('default', { month: 'long' }); },
    render: function () {
      var d = MOCK_SHOPIFY_MTD;
      return '<div class="briefing-stat-grid">'
        + stat('Revenue', '$' + d.revenue.toLocaleString())
        + stat('Orders', d.orders)
        + stat('AOV', '$' + d.aov.toFixed(2))
        + '</div>'
        + '<p class="briefing-row-sub" style="margin-top:10px;">Top seller: ' + d.topProduct + ' &middot; conversion ' + d.conv + '%</p>';
    }
  }
];

function stat(label, value) {
  return '<div class="briefing-stat">'
    + '<div class="briefing-stat-label">' + label + '</div>'
    + '<div class="briefing-stat-value">' + value + '</div>'
    + '</div>';
}

var DEFAULT_CONFIG = WIDGET_DEFS.map(function (w) { return { id: w.id, enabled: true }; });
var currentConfig = DEFAULT_CONFIG.map(function (c) { return { id: c.id, enabled: c.enabled }; });

// ---------------------------------------------------------------------
// WIDGET CONFIG - per-user, stored in briefing_widget_config
// ---------------------------------------------------------------------
function loadConfig(cb) {
  sbFetch('GET', '/rest/v1/briefing_widget_config?user_id=eq.' + _sess.user.id
    + '&select=widget_id,enabled,sort_order&order=sort_order.asc', null, function (err, rows) {
    if (err || !rows || !rows.length) {
      currentConfig = DEFAULT_CONFIG.map(function (c) { return { id: c.id, enabled: c.enabled }; });
      cb();
      return;
    }
    var savedIds = rows.map(function (r) { return r.widget_id; });
    var merged = rows
      .filter(function (r) { return WIDGET_DEFS.some(function (w) { return w.id === r.widget_id; }); })
      .map(function (r) { return { id: r.widget_id, enabled: r.enabled }; });
    WIDGET_DEFS.forEach(function (w) {
      if (savedIds.indexOf(w.id) === -1) merged.push({ id: w.id, enabled: true });
    });
    currentConfig = merged;
    cb();
  });
}

function saveConfig() {
  var status = document.getElementById('briefing-save-status');
  var rows = currentConfig.map(function (c, idx) {
    return { user_id: _sess.user.id, widget_id: c.id, enabled: c.enabled, sort_order: idx };
  });
  sbUpsert('/rest/v1/briefing_widget_config', 'user_id,widget_id', rows, function (err) {
    if (err) {
      console.error(err);
      status.textContent = 'Could not save - try again.';
      status.style.color = '#ef5350';
    } else {
      status.textContent = 'Layout saved.';
      status.style.color = '#4caf50';
    }
    setTimeout(function () { status.textContent = ''; }, 2200);
  });
}

// ---------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------
function renderWidgets() {
  var grid = document.getElementById('briefing-grid');
  var html = currentConfig
    .filter(function (c) { return c.enabled; })
    .map(function (c) { return WIDGET_DEFS.filter(function (w) { return w.id === c.id; })[0]; })
    .filter(Boolean)
    .map(function (w) {
      return '<div class="briefing-card" style="border-top:2px solid ' + w.accent + '">'
        + '<div class="briefing-card-head"><h3>' + w.title + '</h3>'
        + '<span class="briefing-card-meta">' + w.meta() + '</span></div>'
        + '<div class="briefing-card-body">' + w.render() + '</div>'
        + '</div>';
    }).join('');
  grid.innerHTML = html || '<p class="briefing-empty">Nothing turned on - open Customize to add widgets.</p>';
}

function renderConfigList() {
  var list = document.getElementById('briefing-cfg-list');
  var html = currentConfig.map(function (c, idx) {
    var def = WIDGET_DEFS.filter(function (w) { return w.id === c.id; })[0];
    if (!def) return '';
    return '<div class="briefing-cfg-item">'
      + '<label class="name"><input type="checkbox" data-id="' + c.id + '" ' + (c.enabled ? 'checked' : '') + '/>' + def.title + '</label>'
      + '<div class="order-btns">'
      + '<button data-move="up" data-id="' + c.id + '" ' + (idx === 0 ? 'disabled' : '') + '>&uarr;</button>'
      + '<button data-move="down" data-id="' + c.id + '" ' + (idx === currentConfig.length - 1 ? 'disabled' : '') + '>&darr;</button>'
      + '</div></div>';
  }).join('');
  list.innerHTML = html;

  var checkboxes = list.querySelectorAll('input[type="checkbox"]');
  for (var i = 0; i < checkboxes.length; i++) {
    checkboxes[i].addEventListener('change', function (e) {
      var item = currentConfig.filter(function (c) { return c.id === e.target.dataset.id; })[0];
      item.enabled = e.target.checked;
      renderWidgets();
    });
  }
  var buttons = list.querySelectorAll('button[data-move]');
  for (var j = 0; j < buttons.length; j++) {
    buttons[j].addEventListener('click', function (e) {
      var idx = currentConfig.findIndex(function (c) { return c.id === e.target.dataset.id; });
      var dir = e.target.dataset.move === 'up' ? -1 : 1;
      var swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= currentConfig.length) return;
      var tmp = currentConfig[idx];
      currentConfig[idx] = currentConfig[swapIdx];
      currentConfig[swapIdx] = tmp;
      renderConfigList();
      renderWidgets();
    });
  }
}

// ---------------------------------------------------------------------
// BOOT
// ---------------------------------------------------------------------
_sess = requireAuth();
initAvatarDropdown();
renderAvatar(_sess);
fetchProfile(_sess, function (sess) { _sess = sess; renderAvatar(_sess); });
renderSidebar('briefing');

(function () {
  var hour = today.getHours();
  document.getElementById('briefing-greeting').textContent =
    (hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening')
    + (_sess.full_name ? ', ' + _sess.full_name.split(' ')[0] : '');
  document.getElementById('briefing-dateline').textContent =
    today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    + ' - here\'s what needs your attention';
})();

loadConfig(function () {
  fetchDeadlines(function () {
    renderWidgets();
    renderConfigList();
  });
});

document.getElementById('briefing-customize-btn').addEventListener('click', function () {
  document.getElementById('briefing-panel').classList.add('open');
  document.getElementById('briefing-scrim').classList.add('open');
});
document.getElementById('briefing-close-btn').addEventListener('click', closeBriefingPanel);
document.getElementById('briefing-scrim').addEventListener('click', closeBriefingPanel);
function closeBriefingPanel() {
  document.getElementById('briefing-panel').classList.remove('open');
  document.getElementById('briefing-scrim').classList.remove('open');
}
document.getElementById('briefing-save-btn').addEventListener('click', saveConfig);

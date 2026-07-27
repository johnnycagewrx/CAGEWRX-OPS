// briefing.js - Morning Briefing page logic
// CAGEwrx Ops

var today = new Date();
var isMonday = today.getDay() === 1;

// Live data. shopify and googleAds start null so widgets can show a
// loading/empty state correctly until their fetches resolve.
var LIVE = {
  deadlines: [],
  shopify: null, shopifyPrev: null,
  googleAdsWeekend: null, googleAdsWtd: null,
  googleAdsMtd: null, googleAdsMtdPrev: null
};

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
// DEADLINES - merges manual entries (briefing_deadlines) with Production
// tasks (tasks table) that have a due date set. Sorted soonest-first.
// Color rule: red <= 2 days out (incl. overdue), yellow 3-5 days, green > 5.
// ---------------------------------------------------------------------
function parseDateFlexible(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return new Date(str.slice(0, 10) + 'T00:00:00');
  var mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return new Date(mdy[3] + '-' + mdy[1].padStart(2, '0') + '-' + mdy[2].padStart(2, '0') + 'T00:00:00');
  var d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function computeUrgencyTag(dueDate) {
  var diffDays = Math.round((dueDate - new Date(today.toDateString())) / 86400000);
  if (diffDays <= 2) return 'urgent';
  if (diffDays <= 5) return 'soon';
  return 'ok';
}

function formatDueDate(dueDate) {
  var diffDays = Math.round((dueDate - new Date(today.toDateString())) / 86400000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return 'in ' + diffDays + ' days';
}

function fetchDeadlines(cb) {
  sbFetch('GET', '/rest/v1/briefing_deadlines?select=title,due_date', null, function (err1, manualRows) {
    sbFetch('GET', '/rest/v1/tasks?select=title,due_date,assigned_to', null, function (err2, taskRows) {
      var combined = [];

      (err1 || !manualRows ? [] : manualRows).forEach(function (row) {
        var d = parseDateFlexible(row.due_date);
        if (!d) return;
        combined.push({ name: row.title, dateObj: d, tag: computeUrgencyTag(d), due: formatDueDate(d) });
      });

      (err2 || !taskRows ? [] : taskRows).forEach(function (row) {
        if (!row.due_date) return; // only tasks with a due date belong on the briefing
        var d = parseDateFlexible(row.due_date);
        if (!d) return;
        var label = row.title + (row.assigned_to ? ' \u2014 ' + row.assigned_to : '');
        combined.push({ name: label, dateObj: d, tag: computeUrgencyTag(d), due: formatDueDate(d) });
      });

      combined.sort(function (a, b) { return a.dateObj - b.dateObj; });
      LIVE.deadlines = combined;
      cb();
    });
  });
}

// ---------------------------------------------------------------------
// SHOPIFY MTD - real data from briefing_report_cache, written by the
// shopify-briefing-worker Cloudflare Worker on a schedule.
// ---------------------------------------------------------------------
function fetchShopifyMTD(cb) {
  sbFetch('GET', '/rest/v1/briefing_report_cache?report_type=in.(shopify_mtd,shopify_mtd_prev)'
    + '&select=report_type,payload&order=fetched_at.desc&limit=2', null, function (err, rows) {
    if (err || !rows) {
      console.error('Could not load Shopify MTD data:', err);
      cb();
      return;
    }
    rows.forEach(function (row) {
      if (row.report_type === 'shopify_mtd') LIVE.shopify = row.payload;
      if (row.report_type === 'shopify_mtd_prev') LIVE.shopifyPrev = row.payload;
    });
    cb();
  });
}

// ---------------------------------------------------------------------
// GOOGLE ADS - real data from briefing_report_cache, written by the
// google-ads-briefing-worker Cloudflare Worker on a schedule.
// ---------------------------------------------------------------------
function fetchGoogleAds(cb) {
  sbFetch('GET', '/rest/v1/briefing_report_cache?report_type=in.(google_ads_weekend,google_ads_wtd,google_ads_mtd,google_ads_mtd_prev)'
    + '&select=report_type,payload&order=fetched_at.desc&limit=4', null, function (err, rows) {
    if (err || !rows) {
      console.error('Could not load Google Ads data:', err);
      cb();
      return;
    }
    rows.forEach(function (row) {
      if (row.report_type === 'google_ads_weekend') LIVE.googleAdsWeekend = row.payload;
      if (row.report_type === 'google_ads_wtd') LIVE.googleAdsWtd = row.payload;
      if (row.report_type === 'google_ads_mtd') LIVE.googleAdsMtd = row.payload;
      if (row.report_type === 'google_ads_mtd_prev') LIVE.googleAdsMtdPrev = row.payload;
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
      var d = isMonday ? LIVE.googleAdsWeekend : LIVE.googleAdsWtd;
      if (!d) return '<p class="briefing-empty">No Google Ads data yet - the sync job may not have run.</p>';
      var label = isMonday ? 'Weekend recap (Sat-Sun)' : 'Week-to-date (Mon-today)';
      var note = isMonday ? '<p class="briefing-row-sub" style="margin-top:10px;">Week-to-date resets today.</p>' : '';
      var campaignsHtml = '';
      if (d.topCampaigns && d.topCampaigns.length) {
        campaignsHtml = '<p class="briefing-top-title">Top campaigns</p><div>'
          + d.topCampaigns.map(function (c, i) {
            return '<div class="briefing-row">'
              + '<div><p class="briefing-top-product">' + (i + 1) + '. ' + c.name + '</p>'
              + '<p class="briefing-row-sub">' + c.impressions.toLocaleString() + ' impressions &middot; '
              + c.clicks.toLocaleString() + ' clicks &middot; ' + c.conversions + ' conversions</p></div>'
              + '</div>';
          }).join('') + '</div>';
      }
      return '<p class="briefing-row-sub" style="margin-bottom:10px;">' + label + '</p>'
        + '<div class="briefing-stat-grid">'
        + stat('Spend', '$' + d.spend.toFixed(2))
        + stat('Clicks', d.clicks)
        + stat('Conversions', d.conversions)
        + '</div>'
        + '<div class="briefing-stat-grid">'
        + stat('CTR', d.ctr + '%')
        + stat('Cost / conv', '$' + d.cpa.toFixed(2))
        + stat('ROAS', d.roas + 'x')
        + '</div>' + note + campaignsHtml;
    }
  },
  {
    id: 'shopify', title: 'Shopify - month to date', accent: '#4caf50',
    meta: function () { return today.toLocaleString('default', { month: 'long' }); },
    render: function () {
      var d = LIVE.shopify;
      if (!d) return '<p class="briefing-empty">No Shopify data yet - the sync job may not have run.</p>';
      var topHtml = '';
      if (d.topProducts && d.topProducts.length) {
        topHtml = '<p class="briefing-top-title">Top 3 sellers this month</p><div>'
          + d.topProducts.map(function (p, i) {
            return '<div class="briefing-row briefing-top-row">'
              + '<p class="briefing-top-product">' + (i + 1) + '. ' + p.title + '</p>'
              + '<span class="briefing-top-qty">Qty: ' + p.quantity + '</span>'
              + '<span class="briefing-top-value">$' + p.revenue.toLocaleString() + '</span>'
              + '</div>';
          }).join('') + '</div>';
      }
      return '<div class="briefing-stat-grid">'
        + stat('Revenue', '$' + d.revenue.toLocaleString())
        + stat('Orders', d.orders)
        + stat('AOV', '$' + d.aov.toFixed(2))
        + '</div>' + topHtml;
    }
  },
  {
    id: 'googleads_trend', title: 'Google Ads - month over month', accent: '#42a5f5', fullWidth: true,
    meta: function () { return 'vs. same period last month'; },
    render: function () {
      var cur = LIVE.googleAdsMtd, prev = LIVE.googleAdsMtdPrev;
      if (!cur || !prev) return '<p class="briefing-empty">Not enough data yet for a month-over-month comparison.</p>';
      return '<div class="briefing-trend-grid">'
        + trendMetric('Impressions', cur.impressions, prev.impressions, function (v) { return v.toLocaleString(); })
        + trendMetric('Clicks', cur.clicks, prev.clicks, function (v) { return v.toLocaleString(); })
        + trendMetric('Conversions', cur.conversions, prev.conversions, function (v) { return v.toLocaleString(); })
        + trendMetric('ROAS', cur.roas, prev.roas, function (v) { return v.toFixed(1) + 'x'; })
        + '</div>';
    }
  },
  {
    id: 'shopify_trend', title: 'Shopify - month over month', accent: '#4caf50', fullWidth: true,
    meta: function () { return 'vs. same period last month'; },
    render: function () {
      var cur = LIVE.shopify, prev = LIVE.shopifyPrev;
      if (!cur || !prev) return '<p class="briefing-empty">Not enough data yet for a month-over-month comparison.</p>';
      return '<div class="briefing-trend-grid">'
        + trendMetric('Revenue', cur.revenue, prev.revenue, function (v) { return '$' + v.toLocaleString(); })
        + trendMetric('Orders', cur.orders, prev.orders, function (v) { return v.toLocaleString(); })
        + trendMetric('AOV', cur.aov, prev.aov, function (v) { return '$' + v.toFixed(2); })
        + '</div>';
    }
  }
];

function trendMetric(label, current, previous, formatFn) {
  var max = Math.max(current, previous, 1);
  var curPct = Math.round((current / max) * 100);
  var prevPct = Math.round((previous / max) * 100);
  var deltaLabel;
  if (previous === 0) {
    deltaLabel = current === 0 ? '0%' : 'New';
  } else {
    var deltaPct = ((current - previous) / previous) * 100;
    deltaLabel = (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%';
  }
  var deltaClass = current >= previous ? 'up' : 'down';

  return '<div class="briefing-trend-metric">'
    + '<div class="briefing-trend-label-row">'
    + '<span class="briefing-trend-label">' + label + '</span>'
    + '<span class="briefing-trend-delta ' + deltaClass + '">' + deltaLabel + '</span>'
    + '</div>'
    + '<div class="briefing-trend-bar-row">'
    + '<div class="briefing-trend-bar-track"><div class="briefing-trend-bar current" style="width:' + curPct + '%"></div></div>'
    + '<span class="briefing-trend-value">' + formatFn(current) + '</span>'
    + '</div>'
    + '<div class="briefing-trend-bar-row">'
    + '<div class="briefing-trend-bar-track"><div class="briefing-trend-bar previous" style="width:' + prevPct + '%"></div></div>'
    + '<span class="briefing-trend-value muted">' + formatFn(previous) + ' last month</span>'
    + '</div>'
    + '</div>';
}

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
      var spanStyle = w.fullWidth ? 'grid-column:1/-1;' : '';
      return '<div class="briefing-card" style="' + spanStyle + 'border-top:2px solid ' + w.accent + '">'
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
    fetchShopifyMTD(function () {
      fetchGoogleAds(function () {
        renderWidgets();
        renderConfigList();
      });
    });
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

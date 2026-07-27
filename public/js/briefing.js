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

function isAssignedToCurrentUser(assignedTo) {
  if (!assignedTo || !_sess) return false;
  var a = assignedTo.trim().toLowerCase();
  var fullName = (_sess.full_name || '').trim().toLowerCase();
  var firstName = fullName.split(' ')[0];
  if (!a || !fullName) return false;
  return a === fullName || a === firstName || a.indexOf(firstName) !== -1;
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
        if (!isAssignedToCurrentUser(row.assigned_to)) return; // only this user's tasks
        var d = parseDateFlexible(row.due_date);
        if (!d) return;
        combined.push({ name: row.title, dateObj: d, tag: computeUrgencyTag(d), due: formatDueDate(d) });
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
      if (!cur || !prev || !cur.dailySeries || !prev.dailySeries) {
        return '<p class="briefing-empty">Not enough data yet for a month-over-month comparison.</p>';
      }
      return buildOverlappingChart('googleads', [
        { key: 'impressions', label: 'Impressions', color: '#42a5f5', current: cur.dailySeries.impressions, previous: prev.dailySeries.impressions, format: function (v) { return Math.round(v).toLocaleString(); } },
        { key: 'clicks', label: 'Clicks', color: '#4db6ac', current: cur.dailySeries.clicks, previous: prev.dailySeries.clicks, format: function (v) { return Math.round(v).toLocaleString(); } },
        { key: 'conversions', label: 'Conversions', color: '#ffa726', current: cur.dailySeries.conversions, previous: prev.dailySeries.conversions, format: function (v) { return v.toFixed(1); } },
        { key: 'roas', label: 'ROAS', color: '#b39ddb', current: cur.dailySeries.roas, previous: prev.dailySeries.roas, format: function (v) { return v.toFixed(1) + 'x'; } }
      ]);
    }
  },
  {
    id: 'shopify_trend', title: 'Shopify - month over month', accent: '#4caf50', fullWidth: true,
    meta: function () { return 'vs. same period last month'; },
    render: function () {
      var cur = LIVE.shopify, prev = LIVE.shopifyPrev;
      if (!cur || !prev || !cur.dailySeries || !prev.dailySeries) {
        return '<p class="briefing-empty">Not enough data yet for a month-over-month comparison.</p>';
      }
      return buildOverlappingChart('shopify', [
        { key: 'revenue', label: 'Revenue', color: '#4caf50', current: cur.dailySeries.revenue, previous: prev.dailySeries.revenue, format: function (v) { return '$' + Math.round(v).toLocaleString(); } },
        { key: 'orders', label: 'Orders', color: '#42a5f5', current: cur.dailySeries.orders, previous: prev.dailySeries.orders, format: function (v) { return Math.round(v).toLocaleString(); } },
        { key: 'aov', label: 'AOV', color: '#ffa726', current: cur.dailySeries.aov, previous: prev.dailySeries.aov, format: function (v) { return '$' + v.toFixed(2); } }
      ]);
    }
  }
];

// ---------------------------------------------------------------------
// COMBINED INTERACTIVE CHART
// One chart per platform, every metric overlapping on a shared axis.
// Since metrics differ wildly in scale (impressions vs. ROAS), each
// metric is normalized to its own 0-100% range just for line SHAPE -
// the tooltip and hover always show the real, un-normalized numbers.
// Hovering a legend item dims every other line; hovering the chart
// itself shows exact values at that day via crosshair + tooltip.
// ---------------------------------------------------------------------
var CHART_REGISTRY = {};

function buildOverlappingChart(chartId, metrics) {
  var w = 860, h = 240, padL = 8, padR = 8, padT = 10, padB = 10;
  var n = metrics[0].current.length;

  var series = metrics.map(function (m) {
    var max = Math.max.apply(null, m.current.concat(m.previous).concat([1]));
    return {
      key: m.key, label: m.label, color: m.color, format: m.format,
      current: m.current, previous: m.previous,
      normCurrent: m.current.map(function (v) { return max ? v / max : 0; }),
      normPrevious: m.previous.map(function (v) { return max ? v / max : 0; })
    };
  });
  CHART_REGISTRY[chartId] = { series: series, n: n, w: w, h: h, padL: padL, padR: padR };

  function toPath(norm) {
    if (norm.length < 2) return '';
    return norm.map(function (v, i) {
      var x = padL + (i / (norm.length - 1)) * (w - padL - padR);
      var y = padT + (1 - v) * (h - padT - padB);
      return (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
  }

  var svg = '<svg class="briefing-chart-svg" id="svg-' + chartId + '" viewBox="0 0 ' + w + ' ' + h
    + '" width="100%" height="260" preserveAspectRatio="none">';
  series.forEach(function (s) {
    svg += '<g class="chart-series" data-key="' + s.key + '">'
      + '<path d="' + toPath(s.normPrevious) + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-dasharray="5,4" opacity="0.4"/>'
      + '<path d="' + toPath(s.normCurrent) + '" fill="none" stroke="' + s.color + '" stroke-width="2.5"/>'
      + '</g>';
  });
  svg += '<line class="chart-crosshair" id="crosshair-' + chartId + '" x1="0" x2="0" y1="' + padT
    + '" y2="' + (h - padB) + '" stroke="#555" stroke-width="1" style="display:none;" />';
  svg += '<rect class="chart-overlay" data-chart="' + chartId + '" x="0" y="0" width="' + w + '" height="' + h + '" fill="transparent" />';
  svg += '</svg>';

  var legend = '<div class="briefing-chart-legend">'
    + '<span class="briefing-chart-legend-note">'
    + '<span class="swatch-line"></span> This month&nbsp;&nbsp;<span class="swatch-line dashed"></span> Last month'
    + '</span>'
    + series.map(function (s) {
      return '<span class="briefing-chart-legend-item" data-chart="' + chartId + '" data-key="' + s.key + '">'
        + '<span class="dot" style="background:' + s.color + '"></span>' + s.label + '</span>';
    }).join('') + '</div>';

  var tooltip = '<div class="briefing-chart-tooltip" id="tooltip-' + chartId + '" style="display:none;"></div>';

  return '<div class="briefing-chart-wrap" id="wrap-' + chartId + '">' + legend + svg + tooltip + '</div>';
}

function initTrendCharts() {
  Object.keys(CHART_REGISTRY).forEach(function (chartId) {
    var data = CHART_REGISTRY[chartId];
    var wrap = document.getElementById('wrap-' + chartId);
    if (!wrap) return;
    var svg = document.getElementById('svg-' + chartId);
    var crosshair = document.getElementById('crosshair-' + chartId);
    var tooltip = document.getElementById('tooltip-' + chartId);
    var seriesGroups = svg.querySelectorAll('.chart-series');
    var legendItems = wrap.querySelectorAll('.briefing-chart-legend-item');

    legendItems.forEach(function (item) {
      item.addEventListener('mouseenter', function () {
        var key = item.getAttribute('data-key');
        seriesGroups.forEach(function (g) {
          g.style.opacity = (g.getAttribute('data-key') === key) ? '1' : '0.1';
        });
      });
      item.addEventListener('mouseleave', function () {
        seriesGroups.forEach(function (g) { g.style.opacity = '1'; });
      });
    });

    var overlay = svg.querySelector('.chart-overlay');
    overlay.addEventListener('mousemove', function (e) {
      var rect = svg.getBoundingClientRect();
      var scaleX = data.w / rect.width;
      var xSvg = (e.clientX - rect.left) * scaleX;
      var idx = Math.round(((xSvg - data.padL) / (data.w - data.padL - data.padR)) * (data.n - 1));
      idx = Math.max(0, Math.min(data.n - 1, idx));

      var xPos = data.padL + (idx / (data.n - 1)) * (data.w - data.padL - data.padR);
      crosshair.setAttribute('x1', xPos);
      crosshair.setAttribute('x2', xPos);
      crosshair.style.display = 'block';

      var html = '<div class="tooltip-day">Day ' + (idx + 1) + '</div>';
      data.series.forEach(function (s) {
        html += '<div class="tooltip-row">'
          + '<span class="tooltip-dot" style="background:' + s.color + '"></span>'
          + s.label + ': <b>' + s.format(s.current[idx]) + '</b>'
          + '<span class="tooltip-prev">' + s.format(s.previous[idx]) + ' last mo.</span>'
          + '</div>';
      });
      tooltip.innerHTML = html;
      tooltip.style.display = 'block';

      var wrapRect = wrap.getBoundingClientRect();
      var left = e.clientX - wrapRect.left + 14;
      if (left + 170 > wrapRect.width) left = e.clientX - wrapRect.left - 184;
      tooltip.style.left = left + 'px';
      tooltip.style.top = (e.clientY - wrapRect.top - 10) + 'px';
    });

    overlay.addEventListener('mouseleave', function () {
      crosshair.style.display = 'none';
      tooltip.style.display = 'none';
    });
  });
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
  CHART_REGISTRY = {};
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
  initTrendCharts();
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

function openBriefingCustomize() {
  var dd = document.getElementById('av-dd');
  if (dd) dd.style.display = 'none';
  document.getElementById('briefing-panel').classList.add('open');
  document.getElementById('briefing-scrim').classList.add('open');
}
document.getElementById('briefing-close-btn').addEventListener('click', closeBriefingPanel);
document.getElementById('briefing-scrim').addEventListener('click', closeBriefingPanel);
function closeBriefingPanel() {
  document.getElementById('briefing-panel').classList.remove('open');
  document.getElementById('briefing-scrim').classList.remove('open');
}
document.getElementById('briefing-save-btn').addEventListener('click', saveConfig);

// ---------------------------------------------------------------------
// ADD DEADLINE MODAL
// ---------------------------------------------------------------------
function openAddDeadlineModal() {
  document.getElementById('deadline-title').value = '';
  document.getElementById('deadline-due').value = '';
  document.getElementById('add-deadline-modal').classList.add('open');
}
function closeAddDeadlineModal() {
  document.getElementById('add-deadline-modal').classList.remove('open');
}
function confirmAddDeadline() {
  var title = document.getElementById('deadline-title').value.trim();
  var due = document.getElementById('deadline-due').value;
  if (!title || !due) { showBanner('Title and due date are required', 'error'); return; }

  sbFetch('POST', '/rest/v1/briefing_deadlines', { title: title, due_date: due }, function (err) {
    if (err) { showBanner('Could not add deadline: ' + err, 'error'); return; }
    closeAddDeadlineModal();
    showBanner('Deadline added', 'success');
    fetchDeadlines(function () { renderWidgets(); });
  });
}

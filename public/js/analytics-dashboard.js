// analytics-dashboard.js - Admin Panel analytics

'use strict';

var analyticsMode = 'last_month'; // 'last_month' | 'last_year'
var analyticsData = null;

function loadAnalytics(mode) {
  analyticsMode = mode || analyticsMode;
  var wrap = document.getElementById('analytics-content');
  if (wrap) wrap.innerHTML = '<div class="analytics-loading"><div class="spinner"></div><div style="margin-top:12px;">Loading analytics...</div></div>';

  // Update toggle buttons
  document.querySelectorAll('.toggle-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-mode') === analyticsMode);
  });

  fetch('/.netlify/functions/analytics?mode=' + (analyticsMode === 'last_year' ? 'last_year' : 'mtd'))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      analyticsData = data;
      renderAnalytics(data);
    })
    .catch(function(e) {
      console.error('Analytics fetch error:', e);
      // Still render page with empty data so CSV import is always visible
      renderAnalytics({
        current: { revenue: 0, count: 0, topProducts: [], daily: {} },
        compare: { revenue: 0, count: 0, topProducts: [], daily: {} },
        labels: { current: 'Month to Date', compare: analyticsMode === 'last_year' ? 'Same Period Last Year' : 'Last Month' },
        error: e.message
      });
    });
}

function renderAnalytics(data) {
  var wrap = document.getElementById('analytics-content');
  if (!wrap) return;

  var errorNotice = '';
  if (data.error) {
    errorNotice = '<div style="background:#1f0808;border:1px solid #4a1010;color:#ff8a80;border-radius:8px;padding:10px 14px;font-size:12px;margin-bottom:16px;">⚠ Could not load revenue data: ' + data.error + '<br>Import your Shopify CSV below to populate data.</div>';
  }

  var cur  = data.current  || {};
  var comp = data.compare  || {};
  var lbl  = data.labels   || {};

  var curRev  = cur.revenue  || 0;
  var compRev = comp.revenue || 0;
  var curCnt  = cur.count    || 0;
  var compCnt = comp.count   || 0;

  var revDiff  = compRev  ? ((curRev  - compRev)  / compRev  * 100).toFixed(1) : null;
  var cntDiff  = compCnt  ? ((curCnt  - compCnt)  / compCnt  * 100).toFixed(1) : null;

  var avgOrder    = curCnt  ? curRev  / curCnt  : 0;
  var avgOrderCmp = compCnt ? compRev / compCnt : 0;
  var avgDiff = avgOrderCmp ? ((avgOrder - avgOrderCmp) / avgOrderCmp * 100).toFixed(1) : null;

  function diffBadge(pct) {
    if (pct === null) return '<span class="kpi-flat">— no prior data</span>';
    var cls = pct > 0 ? 'kpi-up' : pct < 0 ? 'kpi-down' : 'kpi-flat';
    var arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '—';
    return '<span class="' + cls + '">' + arrow + ' ' + Math.abs(pct) + '%</span> vs ' + lbl.compare;
  }

  function fmtMoney(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---- KPI cards ----
  var kpiHTML = '<div class="kpi-row">' +
    kpiCard('MTD Revenue', fmtMoney(curRev), diffBadge(revDiff)) +
    kpiCard('Orders', curCnt, diffBadge(cntDiff)) +
    kpiCard('Avg Order Value', fmtMoney(avgOrder), diffBadge(avgDiff)) +
    kpiCard('Compare Period', fmtMoney(compRev), '<span class="kpi-flat">' + (comp.count || 0) + ' orders</span>') +
  '</div>';

  // ---- Daily revenue bar chart ----
  var curDaily  = cur.daily  || {};
  var compDaily = comp.daily || {};

  // Get last 14 days worth of current period dates
  var allDates = Object.keys(curDaily).sort();
  if (!allDates.length) {
    // Generate date range for current period
    var d = new Date(); d.setDate(1);
    var today = new Date();
    while (d <= today) {
      allDates.push(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() + 1);
    }
  }
  var maxVal = 0;
  allDates.forEach(function(dt) {
    maxVal = Math.max(maxVal, curDaily[dt] || 0, compDaily[dt] || 0);
  });
  if (!maxVal) maxVal = 1;

  var barsHTML = '<div class="bar-chart">';
  allDates.forEach(function(dt) {
    var cv = curDaily[dt]  || 0;
    var pv = compDaily[dt] || 0;
    var cPct = Math.round((cv / maxVal) * 100);
    var pPct = Math.round((pv / maxVal) * 100);
    var dayLabel = dt.slice(5); // MM-DD
    barsHTML += '<div class="bar-wrap">' +
      '<div class="bar bar-compare" style="height:' + pPct + '%" data-tip="' + lbl.compare + ': ' + fmtMoney(pv) + '"></div>' +
      '<div class="bar bar-current" style="height:' + cPct + '%" data-tip="MTD: ' + fmtMoney(cv) + '"></div>' +
      '<div class="bar-label">' + dayLabel + '</div>' +
    '</div>';
  });
  barsHTML += '</div>';
  barsHTML += '<div class="chart-legend">' +
    '<div class="chart-legend-item"><div class="legend-dot" style="background:#e53935;"></div>' + (lbl.current || 'Current') + '</div>' +
    '<div class="chart-legend-item"><div class="legend-dot" style="background:#1565c0;"></div>' + (lbl.compare || 'Compare') + '</div>' +
  '</div>';

  var chartHTML = '<div class="chart-section"><div class="chart-title">Daily Revenue</div>' + barsHTML + '</div>';

  // ---- Top products ----
  var prods = (cur.topProducts || []);
  var maxProdRev = prods.length ? prods[0].revenue : 1;
  var prodRows = prods.map(function(p, i) {
    var pct = maxProdRev ? Math.round((p.revenue / maxProdRev) * 100) : 0;
    return '<tr>' +
      '<td style="color:#888;width:24px;">' + (i + 1) + '</td>' +
      '<td>' + p.name + '</td>' +
      '<td style="text-align:right;color:#4caf50;font-weight:700;">' + fmtMoney(p.revenue) + '</td>' +
      '<td style="text-align:right;color:#888;">' + p.count + '</td>' +
      '<td><div class="product-bar-bg"><div class="product-bar-fill" style="width:' + pct + '%;"></div></div></td>' +
    '</tr>';
  }).join('');

  var productsHTML = '<div class="products-section">' +
    '<div class="chart-title">Top Products — MTD Revenue</div>' +
    (prods.length
      ? '<table class="products-table"><thead><tr><th>#</th><th>Product</th><th style="text-align:right;">Revenue</th><th style="text-align:right;">Orders</th><th></th></tr></thead><tbody>' + prodRows + '</tbody></table>'
      : '<div style="color:#333;font-size:13px;padding:20px 0;">No product data yet. Import historical orders below or wait for new webhook orders.</div>') +
  '</div>';

  // ---- CSV import section ----
  var importHTML = '<div class="import-section">' +
    '<div class="chart-title">&#x1F4C5; Backfill Historical Revenue</div>' +
    '<p class="import-hint">Import your Shopify order history to populate revenue charts. Only orders not already in the system will be added.</p>' +
    '<ol class="import-steps">' +
      '<li>In Shopify Admin → Orders → Export → All time → Plain CSV</li>' +
      '<li>Select the exported file below</li>' +
      '<li>Click Import — only new orders with prices will be added</li>' +
    '</ol>' +
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">' +
      '<input type="file" id="analytics-csv-file" accept=".csv" style="font-size:12px;color:#666;">' +
      '<button class="btn btn-green" onclick="importAnalyticsCSV()">Import CSV</button>' +
    '</div>' +
    '<div id="analytics-import-status" style="margin-top:10px;font-size:12px;color:#555;"></div>' +
  '</div>';

  wrap.innerHTML = errorNotice + kpiHTML + chartHTML + productsHTML + importHTML;
}

function kpiCard(label, value, compareHTML) {
  return '<div class="kpi-card">' +
    '<div class="kpi-label">' + label + '</div>' +
    '<div class="kpi-value">' + value + '</div>' +
    '<div class="kpi-compare">' + compareHTML + '</div>' +
  '</div>';
}

// ---- CSV import for historical revenue ----
function importAnalyticsCSV() {
  var fileEl = document.getElementById('analytics-csv-file');
  var statusEl = document.getElementById('analytics-import-status');
  if (!fileEl || !fileEl.files.length) { if (statusEl) statusEl.textContent = 'Please select a CSV file first.'; return; }

  var reader = new FileReader();
  reader.onload = function(e) {
    var rows = parseCSVText(e.target.result);
    if (!rows.length) { if (statusEl) statusEl.textContent = 'No data found in CSV.'; return; }

    // Group by order number, grab price from "Total" column
    var orders = {};
    rows.forEach(function(r) {
      var name = (r['Name'] || r['Order'] || '').replace('#', '').trim();
      if (!name) return;
      if (!orders[name]) {
        orders[name] = {
          order_num:   name,
          item:        '',
          sku:         '',
          total_price: parseFloat(r['Total'] || r['Subtotal'] || r['total_price'] || 0),
          order_date:  r['Created at'] ? new Date(r['Created at']).toLocaleDateString('en-US') : '',
          shipping:    r['Shipping Method'] || r['Lineitem fulfillment status'] || '',
          color:       '',
          tab:         'new'
        };
      }
      if (r['Lineitem name'] && !orders[name].item) orders[name].item = r['Lineitem name'];
      if (r['Lineitem sku']  && !orders[name].sku)  orders[name].sku  = r['Lineitem sku'];
    });

    var list = Object.values(orders).filter(function(o) { return o.total_price > 0 && o.order_date; });
    if (!list.length) { if (statusEl) statusEl.textContent = 'No orders with valid prices found in CSV.'; return; }

    if (statusEl) statusEl.textContent = 'Checking ' + list.length + ' orders...';

    // Fetch existing order numbers to avoid duplicates
    sbFetch('GET', '/rest/v1/orders?select=order_num', null, function(err, existing) {
      var ex = {};
      (existing || []).forEach(function(o) { ex[o.order_num] = true; });
      var toImport = list.filter(function(o) { return !ex[o.order_num]; });
      var skipped = list.length - toImport.length;

      if (!toImport.length) {
        if (statusEl) statusEl.textContent = 'All ' + skipped + ' orders already exist. Nothing to import.';
        return;
      }

      if (statusEl) statusEl.textContent = 'Importing ' + toImport.length + ' orders (' + skipped + ' already exist)...';

      var done = 0, errors = 0, idx = 0;
      function next() {
        if (idx >= toImport.length) {
          if (statusEl) statusEl.textContent = '✓ Imported ' + done + ' orders' + (errors ? ', ' + errors + ' errors' : '') + '. Refreshing analytics...';
          setTimeout(function() { loadAnalytics(); }, 1000);
          return;
        }
        var o = toImport[idx++];
        sbFetch('POST', '/rest/v1/orders', o, function(err) {
          if (err) errors++;
          else done++;
          next();
        });
      }
      next();
    });
  };
  reader.readAsText(fileEl.files[0]);
}

function parseCSVText(text) {
  var lines = text.split('\n');
  if (!lines.length) return [];
  var headers = lines[0].split(',').map(function(h) { return h.replace(/"/g, '').trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var vals = lines[i].split(',').map(function(v) { return v.replace(/"/g, '').trim(); });
    if (vals.length < 2) continue;
    var row = {};
    headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
    rows.push(row);
  }
  return rows;
}
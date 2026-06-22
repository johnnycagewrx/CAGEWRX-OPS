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
      console.log('[Analytics] debug:', data.debug);
      console.log('[Analytics] current revenue:', data.current && data.current.revenue);
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
    '<p class="import-hint">Update revenue prices on your existing pipeline orders using a Shopify CSV export. <strong style="color:#ef5350;">This will never create new orders</strong> — it only adds price data to orders already in your pipeline.</p>' +
    '<ol class="import-steps">' +
      '<li>In Shopify Admin → Orders → Export → All time → Plain CSV for Excel</li>' +
      '<li>Select the exported file below</li>' +
      '<li>Click Import — only existing pipeline orders will have their price updated</li>' +
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
  if (!fileEl) { console.error('No file input found'); return; }
  if (!fileEl.files || !fileEl.files.length) {
    if (statusEl) statusEl.textContent = 'Please select a CSV file first.';
    showBanner('Please select a CSV file first', 'error');
    return;
  }
  if (statusEl) statusEl.textContent = 'Reading file...';
  showBanner('Reading CSV...', 'success');

  var reader = new FileReader();
  reader.onerror = function() { showBanner('Could not read file', 'error'); };
  reader.onload = function(e) {
    console.log('[CSV] File loaded, length:', e.target.result.length);
    var rows = parseCSVText(e.target.result);
    if (!rows.length) { if (statusEl) statusEl.textContent = 'No data found in CSV.'; return; }

    // Group by order number, grab price from "Total" column
    var orders = {};
    // Log first row keys so we can see what columns Shopify exports
    if (rows.length > 0) console.log('[CSV] Columns found:', Object.keys(rows[0]).join(', '));

    rows.forEach(function(r) {
      var name = (r['Name'] || r['Order'] || r['order_number'] || '').replace('#', '').trim();
      if (!name) return;
      // Try multiple column names for total price
      var price = parseFloat(
        r['Total'] || r['Subtotal'] || r['total_price'] ||
        r['Total Price'] || r['Gross Sales'] || r['Net Sales'] || 0
      );
      if (!orders[name]) {
        var rawDate = r['Created at'] || r['Created At'] || r['created_at'] || '';
        var orderDate = '';
        if (rawDate) {
          try { orderDate = new Date(rawDate).toLocaleDateString('en-US'); } catch(e) {}
        }
        orders[name] = {
          order_num:   name,
          item:        '',
          sku:         '',
          total_price: price,
          order_date:  orderDate,
          shipping:    r['Shipping Method'] || r['Lineitem fulfillment status'] || '',
          color:       '',
          tab:         'new'
        };
      } else if (price > 0 && !orders[name].total_price) {
        orders[name].total_price = price;
      }
      if (r['Lineitem name'] && !orders[name].item) orders[name].item = r['Lineitem name'];
      if (r['Lineitem sku']  && !orders[name].sku)  orders[name].sku  = r['Lineitem sku'];
    });

    var list = Object.values(orders).filter(function(o) { return o.order_num; });
    var withPrice = list.filter(function(o) { return o.total_price > 0; });
    console.log('[CSV] Total orders parsed:', list.length, 'with price:', withPrice.length);
    if (!withPrice.length) {
      if (statusEl) statusEl.textContent = 'No orders with valid prices found in CSV. Columns seen: ' + Object.keys(rows[0] || {}).join(', ');
      return;
    }
    var list = withPrice;

    if (statusEl) statusEl.textContent = 'Matching ' + list.length + ' orders to existing pipeline...';

    // Only update total_price on orders that ALREADY EXIST in the pipeline
    // Never create new orders from the CSV
    sbFetch('GET', '/rest/v1/orders?select=id,order_num,total_price', null, function(err, existing) {
      var exMap = {};
      (existing || []).forEach(function(o) { exMap[o.order_num] = o; });

      var toUpdate = list.filter(function(o) {
        return exMap[o.order_num] && o.total_price > 0 && !exMap[o.order_num].total_price;
      });
      var notFound = list.length - toUpdate.length;

      if (!toUpdate.length) {
        if (statusEl) statusEl.textContent = notFound + ' orders in CSV not found in pipeline (or already have prices). Nothing to update.';
        showBanner('No matching orders to update', 'error');
        return;
      }

      if (statusEl) statusEl.textContent = 'Updating prices on ' + toUpdate.length + ' existing orders...';

      var done = 0, errors = 0, idx = 0;
      function next() {
        if (idx >= toUpdate.length) {
          if (statusEl) statusEl.textContent = '✓ Updated prices on ' + done + ' orders' + (errors ? ', ' + errors + ' errors' : '') + '. Refreshing analytics...';
          showBanner('✓ ' + done + ' order prices updated!', 'success');
          setTimeout(function() { loadAnalytics(); }, 1000);
          return;
        }
        var o = toUpdate[idx++];
        var existingOrder = exMap[o.order_num];
        sbFetch('PATCH', '/rest/v1/orders?id=eq.' + existingOrder.id, { total_price: o.total_price }, function(err) {
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
  // Proper CSV parser that handles quoted fields with commas inside
  function parseLine(line) {
    var result = [], cur = '', inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  }

  // Split on newlines but respect quoted newlines
  var rows = [];
  var cur = '', inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];
    if (ch === '"') { inQuotes = !inQuotes; cur += ch; }
    else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (cur.trim()) rows.push(cur);
      cur = '';
      if (ch === '\r' && text[i+1] === '\n') i++;
    } else { cur += ch; }
  }
  if (cur.trim()) rows.push(cur);

  if (!rows.length) return [];
  var headers = parseLine(rows[0]);
  var result = [];
  for (var r = 1; r < rows.length; r++) {
    var vals = parseLine(rows[r]);
    if (vals.length < 2) continue;
    var row = {};
    headers.forEach(function(h, idx) { row[h] = vals[idx] || ''; });
    result.push(row);
  }
  return result;
}
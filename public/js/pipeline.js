// pipeline.js - CAGEwrx Ops pipeline logic

'use strict';

// ---- State ----
var AUTO_REFRESH_MS = 60000;
var autoRefreshTimer = null;
var dragData = null;
var dragFromTab = null;
var pendingMove = null;
var editingOrder = null;
var editingTab = null;
var orderCache = {};

// ---- Tab config ----
var TAB_LABELS = {
  new:        'New Orders',
  ready:      'Ready to Ship',
  backorder:  'Backordered / Drop Ship',
  assembled:  'Assembled Cage Orders',
  powdercoat: 'At Powder Coating',
  pickup:     'Ready for Pickup',
  cagekits:   'Cage Kits'
};

// ---- Helpers ----
function pill(t, c) {
  if (!t) return '';
  return '<span class="pill ' + c + '">' + t + '</span>';
}

function shipLabel(s) {
  s = (s || '').toLowerCase();
  return s.indexOf('pick') !== -1 ? 'PICKUP' : s ? 'SHIP' : '';
}

function doneBtn(tab, id) {
  return '<button class="done-btn" title="Mark complete" onclick="markDone(\'' + tab + '\',\'' + id + '\')">&#x2713;</button>';
}

function sortByOrderNum(items) {
  return items.slice().sort(function (a, b) {
    return parseInt(a.order_num || 0, 10) - parseInt(b.order_num || 0, 10);
  });
}

// ---- UI feedback ----
function showIndicator(msg) {
  var el = document.getElementById('refresh-indicator');
  var m = document.getElementById('refresh-msg');
  if (m) m.textContent = msg || 'Refreshing...';
  if (el) el.classList.add('visible');
}

function hideIndicator() {
  var el = document.getElementById('refresh-indicator');
  if (el) el.classList.remove('visible');
}

function spinnerHTML() {
  return '<div style="padding:18px 8px;text-align:center;"><div class="spinner"></div></div>';
}

// ---- Card builder ----
function buildCard(o, tab, metaHTML) {
  // Store in cache for edit lookup
  orderCache[o.id] = o;

  // Broken card (no ID) - show delete only
  if (!o.id) {
    return '<div class="order-card" style="border-color:#1a1a1a;">' +
      '<div class="order-top">' +
        '<span class="order-num" style="color:#444;">' + (o.order_num || '?') + '</span>' +
        '<div class="order-actions">' +
          '<button class="done-btn" style="color:#ef5350;" onclick="deleteByOrderNum(\'' + tab + '\',\'' + o.order_num + '\')">&#x2715;</button>' +
        '</div>' +
      '</div>' +
      '<div class="order-item" style="color:#333;">' + (o.sku || o.item || '') + '</div>' +
    '</div>';
  }

  var link = 'https://admin.shopify.com/store/ccee09-8a/orders?query=' + o.order_num;
  var safeJson = JSON.stringify(o)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');

  return '<div class="order-card" draggable="true"' +
    ' data-id="' + o.id + '" data-tab="' + tab + '"' +
    ' ondragstart="onDragStart(event,\'' + tab + '\',\'' + safeJson + '\')"' +
    ' ondragend="onDragEnd()">' +
    '<div class="order-top">' +
      '<a class="order-num" href="' + link + '" target="_blank">#' + o.order_num + '</a>' +
      '<div class="order-actions">' +
        '<span class="order-ship">' + shipLabel(o.shipping) + '</span>' +
        '<button class="edit-btn" title="Edit" onclick="editFromCard(this.closest(\'.order-card\'))">&#x270E;</button>' +
        doneBtn(tab, o.id) +
      '</div>' +
    '</div>' +
    '<div class="order-item" style="cursor:pointer;" onclick="editFromCard(this.closest(\'.order-card\'))">' +
      (o.sku || o.item || '') +
    '</div>' +
    '<div class="order-meta">' + metaHTML + '</div>' +
  '</div>';
}

// ---- Stage rendering ----
function fillStage(bodyId, cntId, statId, tab, items, metaFn) {
  items = sortByOrderNum(items);
  var cnt = items.length;
  document.getElementById(cntId).textContent = cnt;
  if (statId) document.getElementById(statId).textContent = cnt;
  var el = document.getElementById(bodyId);
  if (!items.length) { el.innerHTML = '<div class="empty">No items</div>'; return; }
  var h = '';
  for (var i = 0; i < items.length; i++) h += buildCard(items[i], tab, metaFn(items[i]));
  el.innerHTML = h;
}

function renderKits(items) {
  items = sortByOrderNum(items);
  document.getElementById('cnt-kits').textContent = items.length;
  document.getElementById('stat-kits').textContent = items.length;
  var el = document.getElementById('col-kits');
  if (!items.length) { el.innerHTML = '<div class="empty">No active kit orders</div>'; return; }
  var h = '';
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    orderCache[o.id] = o;
    var link = 'https://admin.shopify.com/store/ccee09-8a/orders?query=' + o.order_num;
    var safeJson = JSON.stringify(o).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    h += '<div class="order-card" draggable="true"' +
      ' data-id="' + o.id + '" data-tab="cagekits"' +
      ' ondragstart="onDragStart(event,\'cagekits\',\'' + safeJson + '\')"' +
      ' ondragend="onDragEnd()">' +
      '<div class="order-top">' +
        '<a class="order-num" href="' + link + '" target="_blank">#' + o.order_num + '</a>' +
        '<div class="order-actions">' +
          '<span class="order-ship">' + shipLabel(o.shipping) + '</span>' +
          '<button class="edit-btn" title="Edit" onclick="editFromCard(this.closest(\'.order-card\'))">&#x270E;</button>' +
          doneBtn('cagekits', o.id) +
        '</div>' +
      '</div>' +
      '<div class="order-item" style="cursor:pointer;" onclick="editFromCard(this.closest(\'.order-card\'))">' +
        (o.sku || o.item || '') +
      '</div>' +
      '<div class="order-meta">' + pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') + '</div>' +
    '</div>';
  }
  el.innerHTML = h;
}

function renderData(data) {
  orderCache = {};
  var grouped = { new: [], ready: [], backorder: [], assembled: [], powdercoat: [], pickup: [] };
  (data.orders || []).forEach(function (o) { if (grouped[o.tab]) grouped[o.tab].push(o); });

  fillStage('col-new', 'cnt-new', 'stat-new', 'new', grouped.new, function (o) {
    return pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
  });
  fillStage('col-ready', 'cnt-ready', 'stat-ready', 'ready', grouped.ready, function (o) {
    return pill(o.color, 'pill-color') + pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
  });
  fillStage('col-back', 'cnt-back', 'stat-back', 'backorder', grouped.backorder, function (o) {
    return pill(o.color, 'pill-color') +
      pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') +
      pill(o.po_num ? 'PO: ' + o.po_num : '', 'pill-po') +
      pill(o.eta ? 'ETA: ' + fmtDate(o.eta) : '', 'pill-eta');
  });
  fillStage('col-assembled', 'cnt-assembled', 'stat-assembled', 'assembled', grouped.assembled, function (o) {
    return pill(o.color, 'pill-color') +
      pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') +
      pill(o.build_date ? 'Build: ' + fmtDate(o.build_date) : '', 'pill-date') +
      pill(o.eta ? 'ETA: ' + fmtDate(o.eta) : '', 'pill-date');
  });
  fillStage('col-powder', 'cnt-powder', 'stat-powder', 'powdercoat', grouped.powdercoat, function (o) {
    return pill(o.color, 'pill-color') +
      pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') +
      pill(o.sent_to_powder ? 'Sent: ' + fmtDate(o.sent_to_powder) : '', 'pill-date') +
      pill(o.eta ? 'ETA: ' + fmtDate(o.eta) : '', 'pill-date');
  });
  fillStage('col-pickup', 'cnt-pickup', 'stat-pickup', 'pickup', grouped.pickup, function (o) {
    return pill(o.color, 'pill-color') + pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
  });

  renderKits(data.kits || []);

  var now = new Date();
  var lu = document.getElementById('last-updated');
  if (lu) lu.textContent = 'Last updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function setLoadingSpinners() {
  var ids = ['col-new', 'col-ready', 'col-back', 'col-assembled', 'col-powder', 'col-pickup', 'col-kits'];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = spinnerHTML();
  });
  var cids = ['stat-new', 'stat-ready', 'stat-back', 'stat-assembled', 'stat-powder', 'stat-pickup', 'stat-kits',
              'cnt-new', 'cnt-ready', 'cnt-back', 'cnt-assembled', 'cnt-powder', 'cnt-pickup', 'cnt-kits'];
  cids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '-';
  });
}

// ---- Data loading ----
function loadData(background) {
  var banner = document.getElementById('banner');
  if (banner) banner.style.display = 'none';
  if (background) showIndicator('Refreshing...');
  else setLoadingSpinners();

  var results = { orders: null, kits: null };

  function tryRender() {
    if (results.orders !== null && results.kits !== null) {
      hideIndicator();
      renderData(results);
      scheduleAutoRefresh();
    }
  }

  sbFetch('GET', '/rest/v1/orders?select=*&order=order_num.asc', null, function (err, data) {
    var all = (err || !Array.isArray(data)) ? [] : data;
    results.orders = all.filter(function(o){ return o.tab !== 'cagekits'; });
    results.kits   = all.filter(function(o){ return o.tab === 'cagekits'; });
    tryRender();
  });
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  autoRefreshTimer = setTimeout(function () { loadData(true); }, AUTO_REFRESH_MS);
}

// ---- Drag and drop ----
function onDragStart(e, tab, oJson) {
  dragFromTab = tab;
  try { dragData = JSON.parse(oJson.replace(/&quot;/g, '"')); }
  catch (err) { dragData = null; }
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  document.querySelectorAll('.order-card').forEach(function (c) { c.classList.remove('dragging'); });
  document.querySelectorAll('.stage').forEach(function (s) { s.classList.remove('drag-over'); });
}

function onDragOver(e, stageId) {
  e.preventDefault();
  var el = document.getElementById('stage-' + stageId);
  if (el) el.classList.add('drag-over');
}

function onDragLeave(stageId) {
  var el = document.getElementById('stage-' + stageId);
  if (el) el.classList.remove('drag-over');
}

function onDrop(e, toTab) {
  e.preventDefault();
  document.querySelectorAll('.stage').forEach(function (s) { s.classList.remove('drag-over'); });
  if (!dragData || dragFromTab === toTab) return;
  pendingMove = { from: dragFromTab, to: toTab, order: dragData };
  showMoveModal(dragFromTab, toTab, dragData);
}

// ---- Move modal ----
function labelHTML(t) {
  return '<label style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.07em;display:block;margin-top:12px;margin-bottom:4px;">' + t + '</label>';
}

function dateInputHTML(id, val) {
  return '<input type="text" id="' + id + '" maxlength="10" value="' + (val || '') + '"' +
    ' placeholder="MM/DD/YYYY"' +
    ' style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;"' +
    ' oninput="autoSlashDate(this)">';
}

function inputHTML(id, val) {
  return '<input type="text" id="' + id + '" value="' + (val || '') + '"' +
    ' style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;">';
}

function showMoveModal(from, to, o) {
  var title = document.getElementById('move-title');
  if (title) title.textContent = 'Move #' + o.order_num + ' to ' + (TAB_LABELS[to] || to);
  var fields = '';
  if (to === 'powdercoat') {
    fields += labelHTML('Sent to Powder Date') + dateInputHTML('move-sent', todayStr());
  } else if (to === 'assembled') {
    fields += '<p style="font-size:13px;color:#888;margin-top:12px;">Move <b style="color:#fff">#' + o.order_num + '</b> back to <b style="color:#fff">Assembled Cage Orders</b>?</p>';
    if (o.build_date) fields += '<p style="font-size:11px;color:#444;margin-top:8px;">Build date: <span style="color:#90caf9">' + o.build_date + '</span></p>';
  } else {
    fields += '<p style="font-size:13px;color:#888;margin-top:12px;">Move <b style="color:#fff">#' + o.order_num + '</b> to <b style="color:#fff">' + (TAB_LABELS[to] || to) + '</b>?</p>';
  }
  var mf = document.getElementById('move-fields');
  if (mf) mf.innerHTML = fields;
  var mm = document.getElementById('move-modal');
  if (mm) mm.classList.add('open');
  setTimeout(function () {
    var s = document.getElementById('move-sent');
    if (s) { s.focus(); s.setSelectionRange(0, 0); }
  }, 50);
}

function closeMoveModal() {
  var mm = document.getElementById('move-modal');
  if (mm) mm.classList.remove('open');
  pendingMove = null;
}

function confirmMove() {
  if (!pendingMove) return;
  var o = pendingMove.order;
  var fromTab = pendingMove.from;
  var toTab = pendingMove.to;
  var toLabel = TAB_LABELS[toTab] || toTab;
  pendingMove = null;
  var mm = document.getElementById('move-modal');
  if (mm) mm.classList.remove('open');



  var updates = { tab: toTab };
  var sentEl = document.getElementById('move-sent');
  if (sentEl && sentEl.value) updates.sent_to_powder = sentEl.value;

  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + o.id, updates, function (err) {
    if (err) { showBanner('Move failed: ' + err, 'error'); loadData(false); }
    else { showBanner('Order #' + o.order_num + ' moved to ' + toLabel, 'success'); loadData(true); }
  });
}

// ---- Mark done ----
function markDone(tab, id) {
  if (!confirm('Mark this order as complete and remove it?')) return;
  sbFetch('DELETE', '/rest/v1/orders?id=eq.' + id, null, function (err) {
    if (err) { showBanner('Error: ' + err, 'error'); }
    else { showBanner('Order completed!', 'success'); loadData(true); }
  });
}

function deleteByOrderNum(tab, orderNum) {
  if (!confirm('Delete order ' + orderNum + '?')) return;
  sbFetch('DELETE', '/rest/v1/orders?order_num=eq.' + orderNum, null, function (err) {
    if (err) showBanner('Delete failed: ' + err, 'error');
    else { showBanner('Deleted', 'success'); loadData(true); }
  });
}

// ---- Edit modal ----
function gv(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function editFromCard(cardEl) {
  var id = cardEl.getAttribute('data-id');
  var tab = cardEl.getAttribute('data-tab');
  var o = orderCache[id];
  if (o) openEditModal(tab, o);
  else showBanner('Order data not found - refresh and try again', 'error');
}

function openEditModal(tab, o) {
  if (typeof o === 'string') {
    try { o = JSON.parse(o); } catch (e) { showBanner('Edit error', 'error'); return; }
  }
  editingOrder = o;
  editingTab = tab;
  var isKit = tab === 'cagekits';
  var f = '';
  f += labelHTML('Order #') + inputHTML('edit-order', o.order_num);
  f += labelHTML('SKU') + inputHTML('edit-sku', o.sku);
  f += labelHTML('Item Description') + inputHTML('edit-item', o.item);
  if (!isKit) {
    f += labelHTML('Color') + inputHTML('edit-color', o.color);
    if (tab === 'backorder') {
      f += labelHTML('PO #') + inputHTML('edit-po', o.po_num);
      f += labelHTML('ETA') + dateInputHTML('edit-eta', o.eta);
    }
    if (tab === 'assembled') {
      f += labelHTML('Build Date') + dateInputHTML('edit-build', o.build_date);
      f += labelHTML('ETA') + dateInputHTML('edit-eta', o.eta);
    }
    if (tab === 'powdercoat') {
      f += labelHTML('Sent to Powder') + dateInputHTML('edit-sent', o.sent_to_powder);
      f += labelHTML('ETA') + dateInputHTML('edit-eta', o.eta);
    }
    if (tab === 'new' || tab === 'ready' || tab === 'pickup') {
      f += labelHTML('ETA') + dateInputHTML('edit-eta', o.eta);
    }
  }
  f += labelHTML('Order Date') + dateInputHTML('edit-orderdate', o.order_date);
  f += labelHTML('Shipping');
  var sv = (o.shipping || '').toLowerCase().indexOf('pick') !== -1 ? 'pickup' : 'ship';
  f += '<select id="edit-shipping" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;margin-top:4px;">';
  f += '<option value="Pick Up"' + (sv === 'pickup' ? ' selected' : '') + '>PICKUP</option>';
  f += '<option value="Ship"' + (sv === 'ship' ? ' selected' : '') + '>SHIP</option>';
  f += '</select>';
  var ef = document.getElementById('edit-fields');
  if (ef) ef.innerHTML = f;
  var em = document.getElementById('edit-modal');
  if (em) em.classList.add('open');
}

function closeEditModal() {
  var em = document.getElementById('edit-modal');
  if (em) em.classList.remove('open');
  editingOrder = null;
  editingTab = null;
}

function confirmEdit() {
  if (!editingOrder) { showBanner('No order selected', 'error'); return; }
  var isKit = editingTab === 'cagekits';
  var updates = {
    order_num: gv('edit-order'),
    sku:       gv('edit-sku'),
    item:      gv('edit-item'),
    order_date: gv('edit-orderdate'),
    shipping:  gv('edit-shipping')
  };
  if (!isKit) {
    updates.color = gv('edit-color') || '';
    if (document.getElementById('edit-po'))    updates.po_num        = gv('edit-po');
    if (document.getElementById('edit-eta'))   updates.eta           = gv('edit-eta');
    if (document.getElementById('edit-build')) updates.build_date    = gv('edit-build');
    if (document.getElementById('edit-sent'))  updates.sent_to_powder = gv('edit-sent');
  }
  var oid = editingOrder.id;
  closeEditModal();
  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + oid, updates, function (err) {
    if (err) showBanner('Save failed: ' + err, 'error');
    else { showBanner('Order updated!', 'success'); loadData(true); }
  });
}

// ---- Add order modal ----
function openAddModal() {
  var m = document.getElementById('add-modal');
  if (m) m.classList.add('open');
  var od = document.getElementById('add-orderdate');
  if (od) od.value = todayStr();
  var fields = ['add-order', 'add-sku', 'add-item', 'add-color', 'add-shipping', 'add-po', 'add-eta', 'add-build', 'add-sent'];
  fields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el && id !== 'add-orderdate') el.value = '';
  });
  updateAddFields();
}

function closeAddModal() {
  var m = document.getElementById('add-modal');
  if (m) m.classList.remove('open');
}

function updateAddFields() {
  var tab = document.getElementById('add-tab');
  if (!tab) return;
  var t = tab.value;
  var show = function (id, visible) {
    var el = document.getElementById(id);
    if (el) el.style.display = visible ? 'block' : 'none';
  };
  show('add-color-wrap',  t !== 'cagekits');
  show('add-po-wrap',     t === 'backorder');
  show('add-eta-wrap',    t === 'backorder' || t === 'powdercoat' || t === 'assembled');
  show('add-build-wrap',  t === 'assembled');
  show('add-sent-wrap',   t === 'powdercoat');
}

function submitAdd() {
  var tab = document.getElementById('add-tab');
  var orderNum = document.getElementById('add-order');
  if (!tab || !orderNum) return;
  var t = tab.value;
  var num = orderNum.value.trim();
  if (!num) { showBanner('Order # is required', 'error'); return; }

  var isKit = t === 'cagekits';
  var body = {
    order_num:  num,
    sku:        (document.getElementById('add-sku') || {}).value || '',
    item:       (document.getElementById('add-item') || {}).value || '',
    order_date: (document.getElementById('add-orderdate') || {}).value || '',
    shipping:   (document.getElementById('add-shipping') || {}).value || ''
  };
  if (!isKit) {
    body.tab   = t;
    body.color = (document.getElementById('add-color') || {}).value || '';
    body.po_num = (document.getElementById('add-po') || {}).value || '';
    body.eta    = (document.getElementById('add-eta') || {}).value || '';
    body.build_date = (document.getElementById('add-build') || {}).value || '';
    body.sent_to_powder = (document.getElementById('add-sent') || {}).value || '';
  }

  closeAddModal();
  showBanner('Adding order #' + num + '...', 'success');
  sbFetch('POST', '/rest/v1/orders', body, function (err) {
    if (err) showBanner('Add failed: ' + err, 'error');
    else { showBanner('Order #' + num + ' added!', 'success'); loadData(false); }
  });
}

// ---- Search ----
function doSearch(val) {
  val = val.trim();
  var clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  var cards = document.querySelectorAll('.order-card');
  if (!val) { cards.forEach(function (c) { c.classList.remove('highlight', 'dimmed'); }); return; }
  var found = false;
  cards.forEach(function (c) {
    var num = c.querySelector('.order-num');
    var txt = num ? num.textContent.replace('#', '').trim() : '';
    if (txt.indexOf(val) !== -1) {
      c.classList.add('highlight'); c.classList.remove('dimmed');
      if (!found) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); found = true; }
    } else {
      c.classList.add('dimmed'); c.classList.remove('highlight');
    }
  });
}

function clearSearch() {
  var inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  var clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  document.querySelectorAll('.order-card').forEach(function (c) {
    c.classList.remove('highlight', 'dimmed');
  });
  if (inp) inp.focus();
}

// ---- CSV Import ----
function openImportModal() {
  var csv = document.getElementById('import-csv');
  var preview = document.getElementById('import-preview');
  if (csv) csv.value = '';
  if (preview) preview.textContent = '';
  var m = document.getElementById('import-modal');
  if (m) m.classList.add('open');
}

function closeImportModal() {
  var m = document.getElementById('import-modal');
  if (m) m.classList.remove('open');
}

function parseCSVLine(line) {
  var res = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === ',' && !inQ) {
      res.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  res.push(cur);
  return res;
}

function parseCSV(text) {
  var lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  var headers = parseCSVLine(lines[0]), rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var vals = parseCSVLine(lines[i]), row = {};
    for (var j = 0; j < headers.length; j++) row[headers[j].trim()] = (vals[j] || '').trim();
    rows.push(row);
  }
  return rows;
}

function runImport() {
  var csv = document.getElementById('import-csv');
  if (!csv || !csv.value.trim()) { showBanner('Please paste CSV content first', 'error'); return; }
  var rows = parseCSV(csv.value.trim());
  var orders = {};
  rows.forEach(function (r) {
    var name = (r['Name'] || '').replace('#', '').trim();
    if (!name) return;
    if (!orders[name]) orders[name] = {
      order_num: name,
      items: [], skus: [],
      shipping: r['Shipping Method'] || '',
      order_date: r['Created at'] ? new Date(r['Created at']).toLocaleDateString('en-US') : ''
    };
    if (r['Lineitem name']) orders[name].items.push(r['Lineitem name']);
    if (r['Lineitem sku'])  orders[name].skus.push(r['Lineitem sku']);
  });

  var orderList = Object.values(orders);
  var preview = document.getElementById('import-preview');
  if (preview) preview.textContent = 'Found ' + orderList.length + ' orders. Checking...';

  sbFetch('GET', '/rest/v1/orders?select=order_num', null, function (err, existing) {
    var ex = {};
    (existing || []).forEach(function (o) { ex[o.order_num] = true; });
    var toImport = orderList.filter(function (o) { return !ex[o.order_num]; });
    var skipped = orderList.length - toImport.length;

    if (!toImport.length) {
      if (preview) preview.textContent = 'All ' + skipped + ' orders already exist.';
      return;
    }
    if (preview) preview.textContent = 'Importing ' + toImport.length + ' orders...';

    var done = 0, errors = 0, idx = 0;
    function next() {
      if (idx >= toImport.length) {
        showBanner(done + ' orders imported!', 'success');
        closeImportModal();
        loadData(false);
        return;
      }
      var o = toImport[idx++];
      sbFetch('POST', '/rest/v1/orders', {
        tab: 'new',
        order_num: o.order_num,
        sku:  (o.skus || []).join(', ') || '',
        item: o.items.join(', '),
        color: '',
        order_date: o.order_date,
        shipping: o.shipping,
        po_num: '', eta: '', build_date: '', sent_to_powder: ''
      }, function (err) {
        if (err) errors++; else done++;
        if (preview) preview.textContent = 'Importing... ' + (done + errors) + ' of ' + toImport.length;
        next();
      });
    }
    next();
  });
}
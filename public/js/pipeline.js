// ---- Collapsible kits-style sections (Tag+Pull, Backorder) ----
var openKitsSections = {};

function initKitsSections() {
  var sections = ['tagpull', 'back'];
  sections.forEach(function(sec) {
    var body = document.getElementById('col-' + sec);
    var chv  = document.getElementById('chv-' + sec);
    var startOpen = !isMobile;
    if (body) body.style.display = startOpen ? 'grid' : 'none';
    if (chv) chv.classList.toggle('open', startOpen);
    openKitsSections[sec] = startOpen;
  });
}

function toggleKitsSection(sec) {
  var body = document.getElementById('col-' + sec);
  var chv  = document.getElementById('chv-' + sec);
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'grid';
  if (chv) chv.classList.toggle('open', !isOpen);
  openKitsSections[sec] = !isOpen;
}


// ---- Collapsible stages ----
var openStages = {};
var isMobile = window.innerWidth <= 768;

// Map tab names to their actual DOM IDs
var STAGE_IDS = {
  new:        'col-new',
  ready:      'col-ready',
  dropship:   'col-dropship',
  assembled:  'col-assembled',
  powdercoat: 'col-powder',
  pickup:     'col-pickup'
};
var CHEV_IDS = {
  new:        'chv-new',
  ready:      'chv-ready',
  dropship:   'chv-dropship',
  assembled:  'chv-assembled',
  powdercoat: 'chv-powder',
  pickup:     'chv-pickup'
};

function initStages() {
  Object.keys(STAGE_IDS).forEach(function(tab) {
    var body = document.getElementById(STAGE_IDS[tab]);
    var chv  = document.getElementById(CHEV_IDS[tab]);
    var startOpen = !isMobile;
    if (body) body.style.display = startOpen ? 'block' : 'none';
    if (chv) chv.classList.toggle('open', startOpen);
    openStages[tab] = startOpen;
  });
}

function toggleStage(tab) {
  var bodyId = STAGE_IDS[tab] || ('col-' + tab);
  var chevId = CHEV_IDS[tab] || ('chv-' + tab);
  var body = document.getElementById(bodyId);
  var chv  = document.getElementById(chevId);
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chv) chv.classList.toggle('open', !isOpen);
  openStages[tab] = !isOpen;
}

function expandAllStages() {
  Object.keys(STAGE_IDS).forEach(function(tab) {
    var body = document.getElementById(STAGE_IDS[tab]);
    var chv  = document.getElementById(CHEV_IDS[tab]);
    if (body) body.style.display = 'block';
    if (chv) chv.classList.add('open');
    openStages[tab] = true;
  });
}

function collapseAllStages() {
  // Only collapse on mobile - desktop keeps stages open
  if (!isMobile) return;
  Object.keys(STAGE_IDS).forEach(function(tab) {
    var body = document.getElementById(STAGE_IDS[tab]);
    var chv  = document.getElementById(CHEV_IDS[tab]);
    if (body) body.style.display = 'none';
    if (chv) chv.classList.remove('open');
    openStages[tab] = false;
  });
}


// ---- Undo ----
function pushUndo(action, data) {
  undoStack.push({ action: action, data: data });
  if (undoStack.length > 10) undoStack.shift();
  var btn = document.getElementById('undo-btn');
  if (btn) btn.disabled = false;
}

function undoLast() {
  if (!undoStack.length) return;
  var last = undoStack.pop();
  if (!undoStack.length) {
    var btn = document.getElementById('undo-btn');
    if (btn) btn.disabled = true;
  }

  if (last.action === 'delete') {
    // Re-insert the deleted order
    var o = last.data;
    var table = o.tab === 'cagekits' ? 'cagekits' : 'orders';
    delete o.id; // let Supabase assign new id
    sbFetch('POST', '/rest/v1/orders', o, function(err) {
      if (err) showBanner('Undo failed: ' + err, 'error');
      else { showBanner('Undo: order restored', 'success'); loadData(true); }
    });
  } else if (last.action === 'move') {
    // Move back to previous tab
    sbFetch('PATCH', '/rest/v1/orders?id=eq.' + last.data.id, { tab: last.data.fromTab }, function(err) {
      if (err) showBanner('Undo failed: ' + err, 'error');
      else { showBanner('Undo: order moved back', 'success'); loadData(true); }
    });
  } else if (last.action === 'edit') {
    // Restore previous values
    var prev = last.data;
    sbFetch('PATCH', '/rest/v1/orders?id=eq.' + prev.id, prev, function(err) {
      if (err) showBanner('Undo failed: ' + err, 'error');
      else { showBanner('Undo: order restored', 'success'); loadData(true); }
    });
  }
}

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
var undoStack = []; // { action, data } - last 10 actions

// ---- Tab config ----
var TAB_LABELS = {
  new:        'New Orders',
  ready:      'Ready to Ship',
  backorder:  'Backordered',
  dropship:   'Drop Shipping',
  assembled:  'Assembled Cage Orders',
  powdercoat: 'At Powder Coating',
  pickup:     'Ready for Pickup',
  cagekits:   'Cage Kits',
  tagpull:    'Tag and Pull from Inventory'
};

// ---- Helpers ----
function pill(t, c) {
  if (!t) return '';
  return '<span class="pill ' + c + '">' + t + '</span>';
}

function shipLabel(s) {
  s = (s || '').toLowerCase();
  if (s.indexOf('pick') !== -1) return 'PICKUP';
  if (s.indexOf('drop') !== -1) return 'DROP SHIP';
  return s ? 'SHIP' : '';
}

function doneBtn(tab, id) {
  return '<button class="done-btn" title="Mark complete" onclick="event.stopPropagation();markDone(event,\'' + tab + '\',\'' + id + '\')">&#x2713;</button>';
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
// ---- Split order ----
function splitBtn(o) {
  // Only show split button if item has multiple comma-separated items or multiple SKUs
  var items = (o.item || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var skus  = (o.sku  || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  if (items.length < 2 && skus.length < 2) return '';
  return '<button class="split-btn" title="Split items" onclick="event.stopPropagation();openSplitModal(\'' + o.id + '\')" >&#x2702;</button>';
}

function parseSplitColors(colorStr) {
  // Parse "Cage: Gloss Black, Roof: Raw" into { cage: 'Gloss Black', roof: 'Raw' }
  // Also handles plain single color "Gloss Black"
  var map = {};
  if (!colorStr) return map;
  if (colorStr.indexOf(':') === -1) {
    map['_default'] = colorStr.trim();
    return map;
  }
  colorStr.split(',').forEach(function(part) {
    var colon = part.indexOf(':');
    if (colon === -1) return;
    var key = part.slice(0, colon).trim().toLowerCase();
    var val = part.slice(colon + 1).trim();
    map[key] = val;
  });
  return map;
}

function guessColorForItem(itemName, colorMap) {
  // Try to match item name keywords to color map keys
  var name = itemName.toLowerCase();
  var keywords = [
    { test: 'cage',        key: 'cage' },
    { test: 'roof',        key: 'roof' },
    { test: 'bumper',      key: 'bumper' },
    { test: 'skid',        key: 'skid plate' },
    { test: 'windshield',  key: 'windshield frame' },
    { test: 'grille mesh', key: 'grille mesh' },
    { test: 'grille',      key: 'grille frame' },
    { test: 'rack bezel',  key: 'roof rack bezel' },
    { test: 'rack',        key: 'roof rack frame' },
    { test: 'enclosure',   key: 'enclosure' }
  ];
  for (var i = 0; i < keywords.length; i++) {
    if (name.indexOf(keywords[i].test) !== -1 && colorMap[keywords[i].key]) {
      return colorMap[keywords[i].key];
    }
  }
  return colorMap['_default'] || '';
}

function openSplitModal(id) {
  var o = orderCache[id];
  if (!o) return;
  var items = (o.item || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var skus  = (o.sku  || '').split(',').map(function(s){ return s.trim(); }).filter(Boolean);
  var colorMap = parseSplitColors(o.color || '');

  // Build all available color values for the dropdown
  var colorValues = [''];
  Object.values(colorMap).forEach(function(v) {
    if (colorValues.indexOf(v) === -1) colorValues.push(v);
  });
  // Also allow manual entry option
  colorValues.push('__custom__');

  var rows = items.map(function(item, i) {
    var sku = skus[i] || '';
    var guessedColor = guessColorForItem(item, colorMap);
    var opts = colorValues.map(function(c) {
      if (c === '__custom__') return '<option value="__custom__">Enter manually...</option>';
      return '<option value="' + c + '"' + (c === guessedColor ? ' selected' : '') + '>' + (c || '— No color —') + '</option>';
    }).join('');

    return '<div class="split-item-row" data-index="' + i + '">' +
      '<input type="checkbox" class="split-checkbox" checked style="flex-shrink:0;width:16px;height:16px;accent-color:#e53935;cursor:pointer;"' +
        ' data-item="' + item.replace(/"/g,'&quot;') + '"' +
        ' data-sku="' + sku.replace(/"/g,'&quot;') + '">' +
      '<div class="split-item-info">' +
        '<div class="split-item-name">' + item + '</div>' +
        (sku ? '<div class="split-item-sku">' + sku + '</div>' : '') +
        '<div style="margin-top:6px;display:flex;gap:6px;align-items:center;">' +
          '<select class="split-color-select" style="flex:1;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:5px 8px;font-size:12px;color:#e0e0e0;font-family:inherit;outline:none;" onchange="onSplitColorChange(this)">' +
            opts +
          '</select>' +
          '<input type="text" class="split-color-custom" placeholder="Custom color..." style="display:none;flex:1;background:#0d0d0d;border:1px solid #2a2a2a;border-radius:6px;padding:5px 8px;font-size:12px;color:#e0e0e0;font-family:inherit;outline:none;">' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  document.getElementById('split-order-num').textContent = '#' + o.order_num;
  document.getElementById('split-items-list').innerHTML = rows;
  document.getElementById('split-modal').dataset.orderId = id;
  document.getElementById('split-modal').classList.add('open');
}

function onSplitColorChange(sel) {
  var row = sel.closest('.split-item-row');
  var custom = row ? row.querySelector('.split-color-custom') : null;
  if (custom) custom.style.display = sel.value === '__custom__' ? 'block' : 'none';
}

function closeSplitModal() {
  document.getElementById('split-modal').classList.remove('open');
}

function confirmSplit() {
  var modal = document.getElementById('split-modal');
  var id = modal.dataset.orderId;
  if (!id) return;

  var checked   = Array.from(document.querySelectorAll('.split-checkbox:checked'));
  var unchecked = Array.from(document.querySelectorAll('.split-checkbox:not(:checked)'));
  if (!checked.length)   { showBanner('Select at least one item to split off', 'error'); return; }
  if (!unchecked.length) { showBanner('Leave at least one item on the original card', 'error'); return; }

  function getRowColor(row) {
    var sel    = row ? row.querySelector('.split-color-select') : null;
    var custom = row ? row.querySelector('.split-color-custom') : null;
    if (!sel) return '';
    return sel.value === '__custom__' ? (custom ? custom.value.trim() : '') : sel.value;
  }

  // Build split cards from checked rows
  var splitCards = checked.map(function(cb) {
    var row = cb.closest('.split-item-row');
    return {
      item:  cb.getAttribute('data-item'),
      sku:   cb.getAttribute('data-sku'),
      color: getRowColor(row)
    };
  });

  // Build what stays on original from unchecked rows
  var remainItems  = unchecked.map(function(cb){ return cb.getAttribute('data-item'); }).filter(Boolean);
  var remainSkus   = unchecked.map(function(cb){ return cb.getAttribute('data-sku');  }).filter(Boolean);
  var remainColors = unchecked.map(function(cb){
    return getRowColor(cb.closest('.split-item-row'));
  }).filter(Boolean);

  closeSplitModal();

  // Re-fetch the CURRENT state of the original order from Supabase
  // so we don't overwrite changes from a previous split in the same session
  sbFetch('GET', '/rest/v1/orders?id=eq.' + id + '&select=*', null, function(err, rows) {
    var o = (rows && rows[0]) || orderCache[id];
    if (!o) { showBanner('Could not fetch order', 'error'); return; }

    var done = 0;
    var total = splitCards.length + 1;

    function finish() {
      done++;
      if (done === total) {
        showBanner('Split into ' + total + ' cards!', 'success');
        logActivity('orders', 'update', {
          recordId: id,
          summary: 'Order #' + o.order_num + ' split: ' + splitCards.map(function(s){ return s.item; }).join(', ') + ' moved to new cards'
        });
        loadData(true);
      }
    }

    // PATCH original card to only contain remaining items
    sbFetch('PATCH', '/rest/v1/orders?id=eq.' + id, {
      item:  remainItems.join(', '),
      sku:   remainSkus.join(', '),
      color: remainColors.join(', ')
    }, function(pErr) {
      if (pErr) showBanner('Error updating original card: ' + pErr, 'error');
      finish();
    });

    // POST new card for each split item
    splitCards.forEach(function(sc) {
      var newOrder = Object.assign({}, o);
      delete newOrder.id;
      delete newOrder.created_at;
      newOrder.item  = sc.item;
      newOrder.sku   = sc.sku;
      newOrder.color = sc.color;
      sbFetch('POST', '/rest/v1/orders', newOrder, function(pErr) {
        if (pErr) showBanner('Error creating split card: ' + pErr, 'error');
        finish();
      });
    });
  });
}


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
        splitBtn(o) +
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

function buildStatusSelect(id, currentTab) {
  var tabs = [
    { val: 'new',        label: '&#x1F6CE; New Order' },
    { val: 'backorder',  label: '&#x23F8; Backordered' },
    { val: 'dropship',   label: '&#x1F69A; Drop Shipping' },
    { val: 'assembled',  label: '&#x1F4E6; Assembled' },
    { val: 'powdercoat', label: '&#x1F3A8; At Powder Coat' },
    { val: 'ready',      label: '&#x1F4EC; Ready to Ship' },
    { val: 'pickup',     label: '&#x1F3E0; Ready for Pickup' },
    { val: 'tagpull',    label: '&#x1F3F7; Tag & Pull' },
    { val: 'cagekits',   label: '&#x1F4E6; Cage Kit' }
  ];
  var opts = tabs.map(function(t) {
    return '<option value="' + t.val + '"' + (t.val === currentTab ? ' selected' : '') + '>' + t.label + '</option>';
  }).join('');
  return '<select class="status-select" data-id="' + id + '" data-current="' + currentTab + '" onclick="event.stopPropagation()" onchange="moveOrderToTab(this)">' + opts + '</select>';
}

// ---- Status select move ----
function moveOrderToTab(selectEl) {
  var id      = selectEl.getAttribute('data-id');
  var fromTab = selectEl.getAttribute('data-current');
  var toTab   = selectEl.value;
  if (!id || toTab === fromTab) return;

  var o = orderCache[id];
  if (!o) return;

  // Use existing move modal for tabs that need extra info
  if (toTab === 'powdercoat' || toTab === 'assembled') {
    selectEl.value = fromTab; // reset select - modal will handle it
    showMoveModal(fromTab, toTab, o);
    return;
  }

  var updates = { tab: toTab };
  // Clear sent_to_powder if leaving powdercoat
  if (fromTab === 'powdercoat') updates.sent_to_powder = '';

  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + id, updates, function(err) {
    if (err) { showBanner('Move failed: ' + err, 'error'); loadData(false); }
    else {
      showBanner('Order #' + o.order_num + ' moved to ' + (TAB_LABELS[toTab] || toTab), 'success');
      logActivity('orders', 'move', {
        recordId: id,
        fieldChanges: { tab: { old: fromTab, new: toTab } },
        summary: 'Order #' + o.order_num + ' moved from ' + (TAB_LABELS[fromTab]||fromTab) + ' to ' + (TAB_LABELS[toTab]||toTab)
      });
      loadData(true);
    }
  });
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

function renderPowderCoat(items) {
  var cnt = items.length;
  document.getElementById('cnt-powder').textContent = cnt;
  document.getElementById('stat-powder').textContent = cnt;
  var el = document.getElementById('col-powder');
  if (!cnt) { el.innerHTML = '<div class="empty">No items</div>'; return; }

  // Group by sent_to_powder date
  var groups = {};
  items.forEach(function(o) {
    var key = o.sent_to_powder || '__none__';
    if (!groups[key]) groups[key] = [];
    groups[key].push(o);
  });

  // Sort group keys chronologically (earliest first), __none__ at end
  var today = new Date();
  today.setHours(0,0,0,0);

  var sortedKeys = Object.keys(groups).sort(function(a, b) {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    var da = parseMMDDYYYY(a);
    var db = parseMMDDYYYY(b);
    return da - db;
  });

  var h = '';
  sortedKeys.forEach(function(key) {
    // Sort orders within each group by order number ascending
    var group = groups[key].slice().sort(function(a, b) {
      return parseInt(a.order_num || 0, 10) - parseInt(b.order_num || 0, 10);
    });

    var isFuture = key !== '__none__' && parseMMDDYYYY(key) > today;
    var isToday  = key !== '__none__' && parseMMDDYYYY(key).toDateString() === today.toDateString();
    var dateLabel = key === '__none__'
      ? 'No date set'
      : isFuture
        ? 'SEND TO PC ON ' + fmtDate(key)
        : isToday
          ? 'SENDING TODAY - ' + fmtDate(key)
          : 'Sent: ' + fmtDate(key);

    h += '<div class="powder-group">';
    h += '<div class="powder-group-label">' + dateLabel + ' <span style="color:#555;font-size:10px;">(' + group.length + ')</span></div>';
    group.forEach(function(o) {
      var metaHTML = pill(o.color, 'pill-color') +
        pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') +
        pill(o.eta ? 'ETA: ' + fmtDate(o.eta) : '', 'pill-date');
      h += buildCard(o, 'powdercoat', metaHTML);
    });
    h += '</div>';
  });

  el.innerHTML = h;
}

function parseMMDDYYYY(s) {
  if (!s) return new Date(0);
  var p = s.split('/');
  if (p.length === 3) return new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
  return new Date(s);
}


function renderTagPull(items) {
  items = sortByOrderNum(items);
  document.getElementById('cnt-tagpull').textContent = items.length;
  var el = document.getElementById('col-tagpull');
  if (!items.length) { el.innerHTML = '<div class="empty">No items to tag and pull</div>'; return; }
  var h = '';
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    orderCache[o.id] = o;
    var link = 'https://admin.shopify.com/store/ccee09-8a/orders?query=' + o.order_num;
    var safeJson = JSON.stringify(o).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    h += '<div class="order-card" draggable="true"' +
      ' data-id="' + o.id + '" data-tab="tagpull"' +
      ' ondragstart="onDragStart(event,\'tagpull\',\'' + safeJson + '\')"' +
      ' ondragend="onDragEnd()">' +
      '<div class="order-top">' +
        '<a class="order-num" href="' + link + '" target="_blank">#' + o.order_num + '</a>' +
        '<div class="order-actions">' +
          splitBtn(o) +
          '<button class="edit-btn" title="Edit" onclick="editFromCard(this.closest(\'.order-card\'))">&#x270E;</button>' +
          doneBtn('tagpull', o.id) +
        '</div>' +
      '</div>' +
      '<div class="order-item" style="cursor:pointer;" onclick="editFromCard(this.closest(\'.order-card\'))">' +
        (o.item || '') +
      '</div>' +
      '<div class="order-meta">' +
        pill(o.color, 'pill-color') +
        pill((o.company || o.customer_name) ? (o.company ? o.company + (o.customer_name ? ' — ' + o.customer_name : '') : o.customer_name) : '', 'pill-order') +
        (o.notes ? '<div style="font-size:11px;color:#888;margin-top:4px;width:100%;">' + o.notes + '</div>' : '') +
      '</div>' +
    '</div>';
  }
  el.innerHTML = h;
}


function renderBackorder(items) {
  items = sortByOrderNum(items);
  document.getElementById('cnt-back').textContent = items.length;
  var statEl = document.getElementById('stat-back');
  if (statEl) statEl.textContent = items.length;
  var el = document.getElementById('col-back');
  if (!items.length) { el.innerHTML = '<div class="empty">No backordered items</div>'; return; }
  var h = '';
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    orderCache[o.id] = o;
    var link = 'https://admin.shopify.com/store/ccee09-8a/orders?query=' + o.order_num;
    var safeJson = JSON.stringify(o).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var metaHTML = pill(o.color, 'pill-color') +
      pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order') +
      pill(o.po_num ? 'PO: ' + o.po_num : '', 'pill-po') +
      pill(o.eta ? 'ETA: ' + fmtDate(o.eta) : '', 'pill-eta');
    h += '<div class="order-card" draggable="true"' +
      ' data-id="' + o.id + '" data-tab="backorder"' +
      ' ondragstart="onDragStart(event,\'backorder\',\'' + safeJson + '\')"' +
      ' ondragend="onDragEnd()">' +
      '<div class="order-top">' +
        '<a class="order-num" href="' + link + '" target="_blank">#' + o.order_num + '</a>' +
        '<div class="order-actions">' +
          '<span class="order-ship">' + shipLabel(o.shipping) + '</span>' +
          splitBtn(o) +
          '<button class="edit-btn" title="Edit" onclick="editFromCard(this.closest(\'.order-card\'))">&#x270E;</button>' +
          doneBtn('backorder', o.id) +
        '</div>' +
      '</div>' +
      '<div class="order-item" style="cursor:pointer;" onclick="editFromCard(this.closest(\'.order-card\'))">' + (o.sku || o.item || '') + '</div>' +
      '<div class="order-meta">' + metaHTML + '</div>' +
    '</div>';
  }
  el.innerHTML = h;
}


// ---- Cascade build date modal ----
var _cascadeDelta = 0;
var _cascadePivot = '';
var _cascadeExcludeId = null;

function showCascadeModal(days, direction, delta, pivotDate, excludeId) {
  _cascadeDelta = delta;
  _cascadePivot = pivotDate;
  _cascadeExcludeId = excludeId || null;
  var el = document.getElementById('cascade-modal');
  var msg = document.getElementById('cascade-msg');
  var allBtn = document.getElementById('cascade-all-btn');
  if (msg) msg.textContent = 'Build date changed by ' + days + ' weekday' + (days === 1 ? '' : 's') + '.';
  if (allBtn) allBtn.textContent = (direction === 'push back' ? 'Push' : 'Move') + ' all orders back by ' + days + ' day' + (days === 1 ? '' : 's');
  if (el) el.classList.add('open');
}

function closeCascadeModal() {
  var el = document.getElementById('cascade-modal');
  if (el) el.classList.remove('open');
}

function cascadeThisOnly() {
  closeCascadeModal();
  loadData(true);
}

function cascadeAll() {
  closeCascadeModal();
  showBanner('Adjusting build schedule...', 'success');
  cascadeBuildDates(_cascadePivot, _cascadeDelta, function() { loadData(true); }, _cascadeExcludeId);
}


function renderReadyToShip(items) {
  items = items.slice().sort(function(a, b) {
    if (a.priority === 'high' && b.priority !== 'high') return -1;
    if (b.priority === 'high' && a.priority !== 'high') return 1;
    return parseInt(a.order_num || 0, 10) - parseInt(b.order_num || 0, 10);
  });

  var cnt = items.length;
  document.getElementById('cnt-ready').textContent = cnt;
  var statEl = document.getElementById('stat-ready');
  if (statEl) statEl.textContent = cnt;
  var el = document.getElementById('col-ready');
  if (!items.length) { el.innerHTML = '<div class="empty">No items</div>'; return; }

  var h = '';
  for (var i = 0; i < items.length; i++) {
    var o = items[i];
    orderCache[o.id] = o;
    var isHigh = o.priority === 'high';
    var link = 'https://admin.shopify.com/store/ccee09-8a/orders?query=' + o.order_num;
    var safeJson = JSON.stringify(o).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    var metaHTML = pill(o.color, 'pill-color') + pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
    var newPriority = isHigh ? '' : 'high';
    var starBtn = '<button class="' + (isHigh ? 'priority-btn-active' : 'priority-btn-inactive') + '"' +
      ' title="' + (isHigh ? 'Remove high priority' : 'Mark high priority') + '"' +
      ' data-priority-id="' + o.id + '" data-priority-val="' + newPriority + '">' +
      (isHigh ? '&#x2605;' : '&#x2606;') + '</button>';
    var shipSpan = isHigh
      ? '<span class="order-ship ship-now">&#x1F6A8; SHIP NOW</span>'
      : '<span class="order-ship">' + shipLabel(o.shipping) + '</span>';

    h += '<div class="order-card' + (isHigh ? ' priority-high' : '') + '" draggable="true"' +
      ' data-id="' + o.id + '" data-tab="ready"' +
      ' ondragstart="onDragStart(event,\'ready\',\'' + safeJson + '\')"' +
      ' ondragend="onDragEnd()">' +
      '<div class="order-top">' +
        '<a class="order-num" href="' + link + '" target="_blank"' + (isHigh ? ' style="color:#69f0ae;"' : '') + '>#' + o.order_num + '</a>' +
        '<div class="order-actions">' + shipSpan + starBtn +
          splitBtn(o) +
          '<button class="edit-btn" title="Edit" onclick="editFromCard(this.closest(\'.order-card\'))">&#x270E;</button>' +
          doneBtn('ready', o.id) +
        '</div>' +
      '</div>' +
      '<div class="order-item" style="cursor:pointer;' + (isHigh ? 'color:#fff;font-weight:600;' : '') + '" onclick="editFromCard(this.closest(\'.order-card\'))">' + (o.sku || o.item || '') + '</div>' +
      '<div class="order-meta">' + metaHTML + '</div>' +
    '</div>';
  }
  el.innerHTML = h;

  // Wire up priority buttons via event delegation
  el.querySelectorAll('[data-priority-id]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      togglePriority(btn.getAttribute('data-priority-id'), btn.getAttribute('data-priority-val'));
    });
  });
}


function togglePriority(id, priority) {
  var o = orderCache[id];
  if (!o) return;
  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + id, { priority: priority }, function(err) {
    if (err) showBanner('Could not update priority', 'error');
    else {
      showBanner(priority === 'high' ? '&#x1F6A8; Marked HIGH PRIORITY' : 'Priority removed', 'success');
      loadData(true);
    }
  });
}


// ============================================
// OUT OF STOCK section
// ============================================
var oosCache = {};
var editingOos = null;
var oosOpen = true;

function toggleOosSection() {
  var body = document.getElementById('col-oos');
  var chv  = document.getElementById('chv-oos');
  if (!body) return;
  oosOpen = body.style.display === 'none';
  body.style.display = oosOpen ? 'block' : 'none';
  if (chv) chv.classList.toggle('open', oosOpen);
}

function loadOos() {
  sbFetch('GET', '/rest/v1/out_of_stock?select=*&order=created_at.asc', null, function(err, data) {
    var items = (err || !Array.isArray(data)) ? [] : data;
    items.forEach(function(o) { oosCache[o.id] = o; });
    renderOos(items);
  });
}

function renderOos(items) {
  var el = document.getElementById('col-oos');
  var cnt = document.getElementById('cnt-oos');
  if (cnt) cnt.textContent = items.length;
  if (!el) return;
  // Keep open state
  el.style.display = oosOpen ? 'block' : 'none';
  var chv = document.getElementById('chv-oos');
  if (chv) chv.classList.toggle('open', oosOpen);

  var h = '';

  items.forEach(function(o) {
    var etaLabel = o.eta ? 'ETA: ' + fmtDate(o.eta) : 'Set ETA';
    h += '<div class="oos-pill">' +
      '<div>' +
        '<div class="oos-pill-sku">' + (o.sku || '') + '</div>' +
        (o.title ? '<div class="oos-pill-title">' + o.title + '</div>' : '') +
      '</div>' +
      '<span class="oos-pill-eta" onclick="editOosEta(\'' + o.id + '\')">' + etaLabel + '</span>' +
      '<button class="oos-pill-del" onclick="deleteOos(\'' + o.id + '\')" title="Remove">&#x2715;</button>' +
    '</div>';
  });

  // Add item button
  h += '<button class="oos-add-btn" onclick="openOosModal(null)">&#x2B; ADD OUT OF STOCK ITEM</button>';

  el.innerHTML = h;
}

function openOosModal(item) {
  editingOos = item || null;
  var titleEl = document.getElementById('oos-modal-title');
  if (titleEl) titleEl.textContent = item ? '⚠ Edit Out of Stock Item' : '⚠ Add Out of Stock Item';
  document.getElementById('oos-sku').value   = (item && item.sku)   || '';
  document.getElementById('oos-title').value = (item && item.title) || '';
  resetDateBtn('oos-eta', (item && item.eta) || '');
  document.getElementById('oos-modal').classList.add('open');
  setTimeout(function(){ document.getElementById('oos-sku').focus(); }, 50);
}

function closeOosModal() {
  document.getElementById('oos-modal').classList.remove('open');
  editingOos = null;
}

function confirmOosSave() {
  var sku = (document.getElementById('oos-sku').value || '').trim();
  if (!sku) { showBanner('SKU is required', 'error'); return; }
  var body = {
    sku:   sku,
    title: (document.getElementById('oos-title').value || '').trim(),
    eta:   (document.getElementById('oos-eta').value || '').trim()
  };
  if (editingOos) {
    var id = editingOos.id;
    closeOosModal();
    sbFetch('PATCH', '/rest/v1/out_of_stock?id=eq.' + id, body, function(err) {
      if (err) showBanner('Save failed', 'error');
      else { showBanner('Updated!', 'success'); loadOos(); }
    });
  } else {
    closeOosModal();
    sbFetch('POST', '/rest/v1/out_of_stock', body, function(err) {
      if (err) showBanner('Add failed', 'error');
      else { showBanner('Item added!', 'success'); loadOos(); }
    });
  }
}

function editOosEta(id) {
  var item = oosCache[id];
  if (item) openOosModal(item);
}

function deleteOos(id) {
  if (!confirm('Remove this out of stock item?')) return;
  sbFetch('DELETE', '/rest/v1/out_of_stock?id=eq.' + id, null, function(err) {
    if (err) showBanner('Delete failed', 'error');
    else { showBanner('Removed', 'success'); loadOos(); }
  });
}


function renderData(data) {
  orderCache = {};
  var grouped = { new: [], ready: [], backorder: [], dropship: [], assembled: [], powdercoat: [], pickup: [], tagpull: [] };
  (data.orders || []).forEach(function (o) { if (grouped[o.tab]) grouped[o.tab].push(o); });

  fillStage('col-new', 'cnt-new', 'stat-new', 'new', grouped.new, function (o) {
    return pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
  });
  renderReadyToShip(grouped.ready);
  renderBackorder(grouped.backorder);
  fillStage('col-dropship', 'cnt-dropship', 'stat-dropship', 'dropship', grouped.dropship, function (o) {
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
  renderPowderCoat(grouped.powdercoat);
  fillStage('col-pickup', 'cnt-pickup', 'stat-pickup', 'pickup', grouped.pickup, function (o) {
    return pill(o.color, 'pill-color') + pill(o.order_date ? 'Ordered: ' + o.order_date : '', 'pill-order');
  });

  renderKits(data.kits || []);
  renderTagPull(grouped.tagpull);

  var now = new Date();
  var lu = document.getElementById('last-updated');
  if (lu) lu.textContent = 'Last updated ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Update calendar with all orders
  try {
    if (typeof renderCalendar === 'function') {
      renderCalendar(data.orders.concat(data.kits));
    }
  } catch(calErr) {
    console.error('Calendar render error:', calErr);
  }
}

function setLoadingSpinners() {
  var ids = ['col-new', 'col-ready', 'col-back', 'col-dropship', 'col-assembled', 'col-powder', 'col-pickup', 'col-kits'];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = spinnerHTML();
  });
  var cids = ['stat-new', 'stat-ready', 'stat-back', 'stat-dropship', 'stat-assembled', 'stat-powder', 'stat-pickup', 'stat-kits',
              'cnt-new', 'cnt-ready', 'cnt-back', 'cnt-dropship', 'cnt-assembled', 'cnt-powder', 'cnt-pickup', 'cnt-kits'];
  cids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.textContent = '-';
  });
}

// ---- Data loading ----
function loadData(background) {
  var banner = document.getElementById('banner');
  if (banner) banner.classList.remove('show');
  if (background) showIndicator('Refreshing...');
  else setLoadingSpinners();

  var results = { orders: null, kits: null };

  function tryRender() {
    if (results.orders !== null && results.kits !== null) {
      hideIndicator();
      renderData(results);
      loadOos();
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

// ---- Build date scheduling helpers ----

function isWeekday(d) {
  var day = d.getDay();
  return day !== 0 && day !== 6;
}

function addWeekdays(d, n) {
  var result = new Date(d);
  if (n >= 0) {
    var added = 0;
    while (added < n) {
      result.setDate(result.getDate() + 1);
      if (isWeekday(result)) added++;
    }
  } else {
    var removed = 0;
    var abs = Math.abs(n);
    while (removed < abs) {
      result.setDate(result.getDate() - 1);
      if (isWeekday(result)) removed++;
    }
  }
  return result;
}

function countWeekdays(from, to) {
  if (to <= from) return 0;
  var count = 0;
  var cur = new Date(from);
  cur.setDate(cur.getDate() + 1);
  while (cur <= to) {
    if (isWeekday(cur)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function parseBuildDate(str) {
  if (!str) return null;
  var p = str.split('/');
  if (p.length !== 3) return null;
  var d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function formatBuildDate(d) {
  var m = d.getMonth() + 1, dd = d.getDate(), y = d.getFullYear();
  return (m < 10 ? '0' + m : m) + '/' + (dd < 10 ? '0' + dd : dd) + '/' + y;
}

function getNextBuildDate(cb) {
  sbFetch('GET', '/rest/v1/orders?select=build_date&build_date=neq.&order=build_date.asc', null, function(err, rows) {
    var dates = [];
    (rows || []).forEach(function(r) {
      if (r.build_date) {
        var d = parseBuildDate(r.build_date);
        if (d) dates.push(d);
      }
    });
    var base = dates.length ? new Date(Math.max.apply(null, dates)) : new Date();
    base.setHours(0, 0, 0, 0);
    var next = new Date(base);
    do { next.setDate(next.getDate() + 1); } while (!isWeekday(next));
    cb(formatBuildDate(next));
  });
}

function cascadeBuildDates(pivotDateStr, weekdayDelta, cb, excludeId) {
  if (!weekdayDelta) { if (cb) cb(); return; }
  sbFetch('GET', '/rest/v1/orders?select=id,order_num,build_date&build_date=neq.&order=build_date.asc', null, function(err, rows) {
    if (err || !rows || !rows.length) { if (cb) cb(); return; }
    var pivotDate = parseBuildDate(pivotDateStr);
    if (!pivotDate) { if (cb) cb(); return; }
    var toUpdate = rows.filter(function(r) {
      if (excludeId && r.id === excludeId) return false; // skip the edited order
      var d = parseBuildDate(r.build_date);
      return d && d > pivotDate;
    });
    if (!toUpdate.length) {
      showBanner('No orders after this date to update', 'success');
      if (cb) cb();
      return;
    }
    var done = 0;
    toUpdate.forEach(function(r) {
      var d = parseBuildDate(r.build_date);
      var newDate = addWeekdays(d, weekdayDelta);
      sbFetch('PATCH', '/rest/v1/orders?id=eq.' + r.id, { build_date: formatBuildDate(newDate) }, function() {
        done++;
        if (done === toUpdate.length) {
          showBanner(toUpdate.length + ' build dates updated', 'success');
          if (cb) cb();
        }
      });
    });
  });
}


// ---- Move modal ----
function labelHTML(t) {
  return '<label style="font-size:11px;color:#555;text-transform:uppercase;letter-spacing:.07em;display:block;margin-top:12px;margin-bottom:4px;">' + t + '</label>';
}

function dateInputHTML(id, val) {
  var display = val || '';
  var label = display || 'Select date...';
  var clr = display ? '#e0e0e0' : '#333';
  return '<input type="hidden" id="' + id + '" value="' + display + '">' +
    '<button type="button" class="date-input-btn" data-picker-target="' + id + '">' +
      '<span style="color:' + clr + ';">' + label + '</span>' +
      '<span style="color:#555;font-size:12px;"> &#x1F4C5;</span>' +
    '</button>';
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
  var sentEl  = document.getElementById('move-sent');
  var buildEl = document.getElementById('move-build');
  if (sentEl  && sentEl.value)  updates.sent_to_powder = sentEl.value;
  if (buildEl && buildEl.value) updates.build_date     = buildEl.value;

  // Clear sent_to_powder when pulling OUT of powdercoat
  if (fromTab === 'powdercoat' && toTab !== 'powdercoat') {
    updates.sent_to_powder = '';
  }

  // Save to undo stack before moving
  pushUndo('move', { id: o.id, fromTab: fromTab });

  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + o.id, updates, function (err) {
    if (err) { showBanner('Move failed: ' + err, 'error'); loadData(false); }
    else {
      showBanner('Order #' + o.order_num + ' moved to ' + toLabel, 'success');
      logActivity('orders', 'move', {
        recordId: o.id,
        fieldChanges: diffFields(o, updates),
        summary: 'Order #' + o.order_num + ' moved from ' + (TAB_LABELS[fromTab]||fromTab) + ' to ' + toLabel
      });
      loadData(true);
    }
  });
}

// ---- Mark done ----
function markDone(e, tab, id) {
  e.stopPropagation();
  if (!confirm('Mark this order as complete and remove it?')) return;
  // Save to undo stack before deleting
  var o = orderCache[id];
  if (o) pushUndo('delete', JSON.parse(JSON.stringify(o)));
  sbFetch('DELETE', '/rest/v1/orders?id=eq.' + id, null, function (err) {
    if (err) { showBanner('Error: ' + err, 'error'); }
    else {
      showBanner('Order completed!', 'success');
      logActivity('orders', 'delete', {
        recordId: id,
        fullBefore: o || null,
        summary: 'Order #' + ((o && o.order_num) || id) + ' marked complete and removed'
      });
      loadData(true);
    }
  });
}

function deleteByOrderNum(tab, orderNum) {
  if (!confirm('Delete order ' + orderNum + '?')) return;
  sbFetch('DELETE', '/rest/v1/orders?order_num=eq.' + orderNum, null, function (err) {
    if (err) showBanner('Delete failed: ' + err, 'error');
    else {
      showBanner('Deleted', 'success');
      logActivity('orders', 'delete', {
        summary: 'Order #' + orderNum + ' deleted (broken/duplicate entry)'
      });
      loadData(true);
    }
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
  var f = '';

  // Status / Move To
  var allTabs = [
    { val: 'new',        label: 'New Order' },
    { val: 'backorder',  label: 'Backordered' },
    { val: 'dropship',   label: 'Drop Shipping' },
    { val: 'assembled',  label: 'Assembled' },
    { val: 'powdercoat', label: 'At Powder Coat' },
    { val: 'ready',      label: 'Ready to Ship' },
    { val: 'pickup',     label: 'Ready for Pickup' },
    { val: 'tagpull',    label: 'Tag & Pull' },
    { val: 'cagekits',   label: 'Cage Kit' }
  ];
  var tabOpts = allTabs.map(function(t) {
    return '<option value="' + t.val + '"' + (t.val === tab ? ' selected' : '') + '>' + t.label + '</option>';
  }).join('');
  f += labelHTML('Status / Move To');
  f += '<select id="edit-tab-select" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;font-family:inherit;margin-bottom:4px;">' + tabOpts + '</select>';

  // Universal fields - same for every section
  f += labelHTML('Order #') + inputHTML('edit-order', o.order_num);
  f += labelHTML('SKU') + inputHTML('edit-sku', o.sku);
  f += labelHTML('Item Description') + inputHTML('edit-item', o.item);
  f += labelHTML('Color') + inputHTML('edit-color', o.color);

  // Customer info
  f += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:6px;">'
     + '<div>' + labelHTML('First Name') + inputHTML('edit-first-name', o.first_name || '') + '</div>'
     + '<div>' + labelHTML('Last Name')  + inputHTML('edit-last-name',  o.last_name  || '') + '</div>'
     + '</div>';
  f += labelHTML('Company') + inputHTML('edit-company', o.company || '');

  // All date fields - always shown, leave blank if not applicable
  f += labelHTML('Order Date') + dateInputHTML('edit-orderdate', o.order_date);
  f += labelHTML('ETA') + dateInputHTML('edit-eta', o.eta);
  f += labelHTML('Build Date') + dateInputHTML('edit-build', o.build_date);
  f += labelHTML('Sent to Powder') + dateInputHTML('edit-sent', o.sent_to_powder);

  // PO # and shipping always shown
  f += labelHTML('PO #') + inputHTML('edit-po', o.po_num);
  f += labelHTML('Shipping');
  var _sl = (o.shipping || '').toLowerCase();
  var sv = _sl.indexOf('pick') !== -1 ? 'pickup' : _sl.indexOf('drop') !== -1 ? 'dropship' : 'ship';
  f += '<select id="edit-shipping" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;margin-top:4px;">';
  f += '<option value="Pick Up"'  + (sv === 'pickup'   ? ' selected' : '') + '>PICKUP</option>';
  f += '<option value="Ship"'     + (sv === 'ship'     ? ' selected' : '') + '>SHIP</option>';
  f += '<option value="Drop Ship"'+ (sv === 'dropship' ? ' selected' : '') + '>DROP SHIP</option>';
  f += '</select>';

  // Notes always shown
  f += labelHTML('Notes');
  f += '<textarea id="edit-notes" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;min-height:60px;font-family:inherit;">' + (o.notes||'') + '</textarea>';

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

  // Handle tab/status change first
  var tabSelectEl = document.getElementById('edit-tab-select');
  var newTab = tabSelectEl ? tabSelectEl.value : editingTab;
  if (newTab && newTab !== editingTab) {
    if (newTab === 'powdercoat' || newTab === 'assembled') {
      closeEditModal();
      showMoveModal(editingTab, newTab, editingOrder);
      return;
    }
    var tabUpdates = { tab: newTab };
    if (editingTab === 'powdercoat') tabUpdates.sent_to_powder = '';
    var o = editingOrder;
    var fromTab = editingTab;
    closeEditModal();
    sbFetch('PATCH', '/rest/v1/orders?id=eq.' + o.id, tabUpdates, function(err) {
      if (err) showBanner('Move failed: ' + err, 'error');
      else {
        showBanner('Order #' + o.order_num + ' moved to ' + (TAB_LABELS[newTab]||newTab), 'success');
        logActivity('orders', 'move', {
          recordId: o.id,
          fieldChanges: { tab: { old: fromTab, new: newTab } },
          summary: 'Order #' + o.order_num + ' moved from ' + (TAB_LABELS[fromTab]||fromTab) + ' to ' + (TAB_LABELS[newTab]||newTab)
        });
        loadData(true);
      }
    });
    return;
  }

  // Universal updates - all fields always saved
  var updates = {
    order_num:      gv('edit-order'),
    sku:            gv('edit-sku'),
    item:           gv('edit-item'),
    color:          gv('edit-color'),
    order_date:     gv('edit-orderdate'),
    eta:            gv('edit-eta'),
    build_date:     gv('edit-build'),
    sent_to_powder: gv('edit-sent'),
    po_num:         gv('edit-po'),
    shipping:       gv('edit-shipping'),
    first_name:     gv('edit-first-name'),
    last_name:      gv('edit-last-name'),
    company:        gv('edit-company'),
    customer_name:  [gv('edit-first-name'), gv('edit-last-name')].filter(Boolean).join(' ')
  };
  var notesEl = document.getElementById('edit-notes');
  if (notesEl) updates.notes = notesEl.value.trim();
  var oid = editingOrder.id;
  var prev = JSON.parse(JSON.stringify(editingOrder));
  var oldBuildDate = prev.build_date || '';
  var newBuildDate = updates.build_date || '';
  closeEditModal();
  pushUndo('edit', prev);
  sbFetch('PATCH', '/rest/v1/orders?id=eq.' + oid, updates, function (err) {
    if (err) showBanner('Save failed: ' + err, 'error');
    else {
      showBanner('Order updated!', 'success');
      logActivity('orders', 'update', {
        recordId: oid,
        fieldChanges: diffFields(prev, updates),
        summary: 'Order #' + (prev.order_num || oid) + ' edited'
      });
      // Cascade build date push if build_date changed
      var finalNewDate = updates.build_date || '';
      if (finalNewDate && oldBuildDate && finalNewDate !== oldBuildDate) {
        var oldD = parseBuildDate(oldBuildDate);
        var newD = parseBuildDate(finalNewDate);
        if (oldD && newD) {
          var delta = newD > oldD ? countWeekdays(oldD, newD) : -countWeekdays(newD, oldD);
          if (delta !== 0) {
            var direction = delta > 0 ? 'push back' : 'move forward';
            var days = Math.abs(delta);
            showCascadeModal(days, direction, delta, oldBuildDate, oid);
            return; // loadData called inside modal handlers
          }
        }
      }
      loadData(true);
    }
  });
}

// ---- Add order modal ----

function openAddModal() {
  var m = document.getElementById('add-modal');
  if (m) m.classList.add('open');
  var fields = ['add-order', 'add-sku', 'add-item', 'add-color', 'add-shipping', 'add-po', 'add-first-name', 'add-last-name', 'add-company', 'add-notes'];
  fields.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  resetDateBtn('add-orderdate', todayStr());
  resetDateBtn('add-eta', '');
  resetDateBtn('add-sent', '');
  resetDateBtn('add-build', '');
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
  show('add-color-wrap',    t !== 'cagekits' && t !== 'tagpull');
  show('add-po-wrap',       t === 'backorder');
  show('add-eta-wrap',      t === 'backorder' || t === 'dropship' || t === 'powdercoat' || t === 'assembled');
  show('add-build-wrap',    t === 'assembled');
  show('add-sent-wrap',     t === 'powdercoat');
  show('add-customer-wrap', true); // show on all tabs
  show('add-notes-wrap',    true); // show on all tabs
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
    var addFirst   = (document.getElementById('add-first-name') || {}).value || '';
    var addLast    = (document.getElementById('add-last-name')  || {}).value || '';
    var addCompany = (document.getElementById('add-company')    || {}).value || '';
    body.first_name    = addFirst;
    body.last_name     = addLast;
    body.company       = addCompany;
    body.customer_name = [addFirst, addLast].filter(Boolean).join(' ');
    body.notes = (document.getElementById('add-notes') || {}).value || '';
  }

  closeAddModal();
  showBanner('Adding order #' + num + '...', 'success');
  sbFetch('POST', '/rest/v1/orders', body, function (err, data) {
    if (err) showBanner('Add failed: ' + err, 'error');
    else {
      showBanner('Order #' + num + ' added!', 'success');
      var newId = (Array.isArray(data) && data[0] && data[0].id) || null;
      logActivity('orders', 'create', {
        recordId: newId,
        fullAfter: body,
        summary: 'Order #' + num + ' added to ' + (TAB_LABELS[t] || t)
      });
      loadData(false);
    }
  });
}

// ---- Search ----
// ---- Calendar search highlight ----
function highlightCalendarOrders(orderNums) {
  var events = document.querySelectorAll('.cal-event');
  if (!orderNums || !orderNums.length) {
    events.forEach(function(el) { el.classList.remove('cal-event-highlight', 'cal-event-dimmed'); });
    return;
  }
  events.forEach(function(el) {
    var text = el.textContent || '';
    var matched = orderNums.some(function(num) { return text.indexOf('#' + num) !== -1; });
    el.classList.toggle('cal-event-highlight', matched);
    el.classList.toggle('cal-event-dimmed', !matched);
  });
}


function doSearch(val) {
  val = val.trim();
  var clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';
  var cards = document.querySelectorAll('.order-card');
  if (!val) {
    cards.forEach(function (c) { c.classList.remove('highlight', 'dimmed'); });
    collapseAllStages();
    return;
  }
  expandAllStages();
  var found = false;
  var valLower = val.toLowerCase();
  var matchedOrderNums = [];
  cards.forEach(function (c) {
    var id = c.getAttribute('data-id');
    var o = id ? orderCache[id] : null;
    var numEl = c.querySelector('.order-num');
    var orderNum = numEl ? numEl.textContent.replace('#', '').trim() : '';
    var customerName = o ? ((o.customer_name || '') + ' ' + (o.first_name || '') + ' ' + (o.last_name || '') + ' ' + (o.company || '')).toLowerCase() : '';
    var skuItem = o ? ((o.sku || '') + ' ' + (o.item || '')).toLowerCase() : '';
    var matches = orderNum.toLowerCase().indexOf(valLower) !== -1
               || customerName.indexOf(valLower) !== -1
               || skuItem.indexOf(valLower) !== -1;
    if (matches) {
      c.classList.add('highlight'); c.classList.remove('dimmed');
      matchedOrderNums.push(orderNum);
      if (!found) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); found = true; }
    } else {
      c.classList.add('dimmed'); c.classList.remove('highlight');
    }
  });
  // Highlight matching order numbers in calendar
  highlightCalendarOrders(matchedOrderNums);
}

function clearSearch() {
  var inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  var clearBtn = document.getElementById('search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  document.querySelectorAll('.order-card').forEach(function (c) {
    c.classList.remove('highlight', 'dimmed');
  });
  highlightCalendarOrders([]);
  collapseAllStages();
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
      items: [], skus: [], colors: [],
      shipping: r['Shipping Method'] || '',
      order_date: r['Created at'] ? new Date(r['Created at']).toLocaleDateString('en-US') : ''
    };
    if (r['Lineitem name']) orders[name].items.push(r['Lineitem name']);
    if (r['Lineitem sku'])  orders[name].skus.push(r['Lineitem sku']);
    // Color from line item properties columns
    // Shopify CSV exports property names as "Property: <name>" columns
    var colorFields = [
      'cage color','roof color','bumper color','skid plate color',
      'windshield frame color','grille frame color','grille mesh color',
      'roof rack frame color','roof rack bezel color','enclosure color',
      'color','colour','powder color','finish'
    ];
    var colorParts = [];
    Object.keys(r).forEach(function(col) {
      var colLower = col.toLowerCase().replace(/^property:\s*/,'').trim();
      if (colorFields.indexOf(colLower) !== -1 && r[col] && r[col].trim()) {
        colorParts.push(col.replace(/^Property:\s*/i,'').replace(/ Color$/i,'') + ': ' + r[col].trim());
      }
    });
    if (colorParts.length) {
      // If all same value, just store that value; otherwise store full breakdown
      var uniqueVals = colorParts.map(function(p){ return p.split(': ')[1]; })
        .filter(function(v,i,a){ return a.indexOf(v) === i; });
      orders[name].colors.push(uniqueVals.length === 1 ? uniqueVals[0] : colorParts.join(', '));
    } else {
      // Fallback: variant title
      var variant = r['Lineitem variant'] || r['Variant Title'] || '';
      if (variant && variant.toLowerCase() !== 'default title') {
        var colorVal = variant.split('/')[0].trim();
        if (colorVal) orders[name].colors.push(colorVal);
      }
    }
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
        color: (o.colors && o.colors[0]) || '',
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
}var isTagPull = tab === 'tagpull';
  // Show first/last name on ALL order types
  f += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
     + '<div>' + labelHTML('First Name') + inputHTML('edit-first-name', o.first_name || '') + '</div>'
     + '<div>' + labelHTML('Last Name')  + inputHTML('edit-last-name',  o.last_name  || '') + '</div>'
     + '</div>';
  if (isTagPull) {
    f += labelHTML('Notes');
    f += '<textarea id="edit-notes" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;min-height:70px;font-family:inherit;">' + (o.notes||'') + '</textarea>';
  }
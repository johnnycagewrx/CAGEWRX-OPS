// calendar.js - CAGEwrx Ops Calendar + Date Picker

'use strict';

// ---- State ----
var calYear  = new Date().getFullYear();
var calMonth = new Date().getMonth(); // 0-indexed
var calOrders = [];
var datePickerTarget = null; // input id that the picker will fill

// ---- Calendar rendering ----
var MONTH_NAMES = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Color coding by event type
var CAL_COLORS = {
  build_date:      { bg: '#0d47a1', border: '#1565c0', text: '#e3f2fd', label: 'BUILD'      },
  eta:             { bg: '#1b5e20', border: '#2e7d32', text: '#e8f5e9', label: 'ETA'        },
  sent_to_powder:  { bg: '#bf360c', border: '#e64a19', text: '#fbe9e7', label: 'SENT TO PC' },
  send_to_powder:  { bg: '#4a148c', border: '#7b1fa2', text: '#f3e5f5', label: 'SEND TO PC' },
  order_date:      { bg: '#1a237e', border: '#283593', text: '#e8eaf6', label: 'ORDER'      }
};

function parseDate(str) {
  if (!str) return null;
  // Handle MM/DD/YYYY
  var parts = str.split('/');
  if (parts.length === 3) {
    var d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Handle ISO
  var d2 = new Date(str);
  return isNaN(d2.getTime()) ? null : d2;
}

function formatDateKey(d) {
  // Returns YYYY-MM-DD key
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function buildCalEvents(orders) {
  var map = {};

  orders.forEach(function(o) {
    // build_date only shows for assembled stage
    if (o.build_date && o.tab === 'assembled') {
      var d = parseDate(o.build_date);
      if (d) {
        var key = formatDateKey(d);
        if (!map[key]) map[key] = [];
        map[key].push({ order: o, type: 'build_date' });
      }
    }
    // sent_to_powder only shows for powdercoat stage
    if (o.sent_to_powder && o.tab === 'powdercoat') {
      var d = parseDate(o.sent_to_powder);
      if (d) {
        var key = formatDateKey(d);
        if (!map[key]) map[key] = [];
        // Use different type/color if date is in the future
        var now = new Date(); now.setHours(0,0,0,0);
        var eventType = d > now ? 'send_to_powder' : 'sent_to_powder';
        map[key].push({ order: o, type: eventType });
      }
    }
    // eta shows for all active stages (not completed)
    if (o.eta) {
      var d = parseDate(o.eta);
      if (d) {
        var key = formatDateKey(d);
        if (!map[key]) map[key] = [];
        map[key].push({ order: o, type: 'eta' });
      }
    }
  });
  return map;
}

function renderCalendar(orders) {
  calOrders = orders || calOrders;
  var events = buildCalEvents(calOrders);

  var firstDay = new Date(calYear, calMonth, 1).getDay();
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var today = new Date();
  var todayKey = formatDateKey(today);

  var html = '';

  // Header
  html += '<div class="cal-header">';
  html += '<button class="cal-nav" onclick="calPrev()">&#x276E;</button>';
  html += '<div class="cal-title">' + MONTH_NAMES[calMonth] + ' ' + calYear + '</div>';
  html += '<button class="cal-nav" onclick="calNext()">&#x276F;</button>';
  html += '</div>';

  // Day name row
  html += '<div class="cal-grid">';
  DAY_NAMES.forEach(function(d) {
    html += '<div class="cal-dayname">' + d + '</div>';
  });

  // Empty cells before first day
  for (var i = 0; i < firstDay; i++) {
    html += '<div class="cal-cell cal-empty"></div>';
  }

  // Day cells
  for (var day = 1; day <= daysInMonth; day++) {
    var key = calYear + '-' +
      String(calMonth + 1).padStart(2, '0') + '-' +
      String(day).padStart(2, '0');
    var isToday = key === todayKey;
    var dayEvents = events[key] || [];

    html += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '">';
    html += '<div class="cal-date">' + day + '</div>';

    // Show all events - cell stretches to fit
        dayEvents.forEach(function(ev) {
      var c = CAL_COLORS[ev.type];
      var num = ev.order.order_num || '?';
      var oid = ev.order.id;
      var otab = ev.order.tab;
      html += '<div class="cal-event"' +
        ' style="background:' + c.bg + ';border-left:2px solid ' + c.border + ';color:' + c.text + ';"' +
        ' title="#' + num + ' - ' + (ev.order.sku || ev.order.item || '') + '"' +
        ' data-id="' + oid + '" data-tab="' + otab + '">' +
        '#' + num + ' &mdash; ' + c.label +
      '</div>';
    });

    html += '</div>';
  }

  // Fill remaining cells to complete last row
  var totalCells = firstDay + daysInMonth;
  var remainder = totalCells % 7;
  if (remainder > 0) {
    for (var j = 0; j < (7 - remainder); j++) {
      html += '<div class="cal-cell cal-empty"></div>';
    }
  }

  html += '</div>'; // end cal-grid

  // Legend
  html += '<div class="cal-legend">';
  // Show legend items (skip order_date as it's rarely used)
  var legendTypes = ['build_date', 'eta', 'send_to_powder', 'sent_to_powder'];
  legendTypes.forEach(function(type) {
    var c = CAL_COLORS[type];
    if (!c) return;
    html += '<div class="cal-legend-item">' +
      '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c.bg + ';border:1px solid ' + c.border + ';margin-right:4px;"></span>' +
      '<span style="color:' + c.text + ';">' + c.label + '</span>' +
    '</div>';
  });
  html += '</div>';

  var el = document.getElementById('calendar-body');
  if (el) el.innerHTML = html;
}

function editFromId(id, tab) {
  var o = orderCache[id];
  if (o) openEditModal(tab, o);
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar();
}

// ---- Date Picker ----
var pickerYear  = new Date().getFullYear();
var pickerMonth = new Date().getMonth();

function openDatePicker(inputId) {
  datePickerTarget = inputId;
  // Pre-set picker to current value of the input if valid
  var el = document.getElementById(inputId);
  if (el && el.value) {
    var d = parseDate(el.value);
    if (d) { pickerYear = d.getFullYear(); pickerMonth = d.getMonth(); }
  } else {
    pickerYear  = new Date().getFullYear();
    pickerMonth = new Date().getMonth();
  }
  renderPicker();
  var dp = document.getElementById('date-picker-modal');
  if (dp) dp.classList.add('open');
}

function closeDatePicker() {
  var dp = document.getElementById('date-picker-modal');
  if (dp) dp.classList.remove('open');
  datePickerTarget = null;
}

function renderPicker() {
  var firstDay = new Date(pickerYear, pickerMonth, 1).getDay();
  var daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
  var today = new Date();
  var todayKey = formatDateKey(today);

  // Get currently selected value
  var selectedKey = null;
  if (datePickerTarget) {
    var el = document.getElementById(datePickerTarget);
    if (el && el.value) {
      var d = parseDate(el.value);
      if (d) selectedKey = formatDateKey(d);
    }
  }

  var html = '';
  html += '<div class="picker-header">';
  html += '<button class="cal-nav" onclick="pickerPrev()">&#x276E;</button>';
  html += '<div class="cal-title">' + MONTH_NAMES[pickerMonth] + ' ' + pickerYear + '</div>';
  html += '<button class="cal-nav" onclick="pickerNext()">&#x276F;</button>';
  html += '</div>';

  html += '<div class="picker-grid">';
  DAY_NAMES.forEach(function(d) {
    html += '<div class="cal-dayname">' + d + '</div>';
  });

  for (var i = 0; i < firstDay; i++) {
    html += '<div class="picker-cell picker-empty"></div>';
  }

  for (var day = 1; day <= daysInMonth; day++) {
    var key = pickerYear + '-' +
      String(pickerMonth + 1).padStart(2, '0') + '-' +
      String(day).padStart(2, '0');
    var isToday    = key === todayKey;
    var isSelected = key === selectedKey;
    var cls = 'picker-cell' +
      (isToday    ? ' picker-today'    : '') +
      (isSelected ? ' picker-selected' : '');
    var m = String(pickerMonth + 1).padStart(2, '0');
    var dd = String(day).padStart(2, '0');
    var val = m + '/' + dd + '/' + pickerYear;
    html += '<div class="' + cls + '" onclick="selectDate(\'' + val + '\')">' + day + '</div>';
  }

  html += '</div>';

  var pb = document.getElementById('picker-body');
  if (pb) pb.innerHTML = html;
}

function selectDate(val) {
  if (datePickerTarget) {
    // Update hidden input
    var el = document.getElementById(datePickerTarget);
    if (el) el.value = val;
    // Update the button display text
    var btn = document.querySelector('[data-picker-target="' + datePickerTarget + '"]');
    if (btn) {
      btn.innerHTML = '<span style="color:#e0e0e0;">' + val + '</span>' +
        '<span style="color:#555;font-size:12px;"> &#x1F4C5;</span>';
    }
  }
  closeDatePicker();
}

function pickerPrev() {
  pickerMonth--;
  if (pickerMonth < 0) { pickerMonth = 11; pickerYear--; }
  renderPicker();
}

function pickerNext() {
  pickerMonth++;
  if (pickerMonth > 11) { pickerMonth = 0; pickerYear++; }
  renderPicker();
}

// ---- Event delegation for date picker buttons and calendar events ----
// Called once after DOM is ready
function initDatePickers() {
  document.addEventListener('click', function(e) {
    // Date picker buttons
    var btn = e.target.closest('[data-picker-target]');
    if (btn) {
      var targetId = btn.getAttribute('data-picker-target');
      if (targetId) openDatePicker(targetId);
    }
    // Calendar event clicks
    var ev = e.target.closest('[data-id][data-tab]');
    if (ev) {
      var id  = ev.getAttribute('data-id');
      var tab = ev.getAttribute('data-tab');
      if (id && tab) editFromId(id, tab);
    }
  });
}

function resetDateBtn(inputId, val) {
  var el = document.getElementById(inputId);
  if (el) el.value = val || '';
  var btn = document.querySelector('[data-picker-target="' + inputId + '"]');
  if (btn) {
    var span = btn.querySelector('span');
    if (span) {
      span.textContent = val || 'Select date...';
      span.style.color = val ? '#e0e0e0' : '#333';
    }
  }
}
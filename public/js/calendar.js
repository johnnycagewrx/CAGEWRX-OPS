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
  build_date:     { bg: '#0a1525', border: '#1565c0', text: '#42a5f5', label: 'BUILD'      },
  eta:            { bg: '#0a1f0a', border: '#1a4a1a', text: '#4caf50', label: 'ETA'        },
  sent_to_powder: { bg: '#1a1000', border: '#3a2200', text: '#ffa726', label: 'SENT TO PC' },
  order_date:     { bg: '#12080a', border: '#3a1020', text: '#f48fb1', label: 'ORDER'      }
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
  // Build a map of date -> [{order, type}]
  var map = {};
  var dateFields = ['build_date', 'eta', 'sent_to_powder'];

  orders.forEach(function(o) {
    dateFields.forEach(function(field) {
      if (!o[field]) return;
      var d = parseDate(o[field]);
      if (!d) return;
      var key = formatDateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push({ order: o, type: field });
    });
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

    // Show up to 3 events, then "+N more"
    var shown = dayEvents.slice(0, 3);
    var extra = dayEvents.length - shown.length;

    shown.forEach(function(ev) {
      var c = CAL_COLORS[ev.type];
      var label = ev.order.sku || ev.order.order_num || '';
      html += '<div class="cal-event" style="background:' + c.bg + ';border-left:2px solid ' + c.border + ';color:' + c.text + ';"' +
        ' title="#' + ev.order.order_num + ' - ' + (ev.order.sku || ev.order.item || '') + '"' +
        ' onclick="editFromId(\'' + ev.order.id + '\',\'' + ev.order.tab + '\')">' +
        '<span class="cal-event-badge">' + c.label + '</span> ' +
        '<span class="cal-event-label">#' + label + '</span>' +
      '</div>';
    });

    if (extra > 0) {
      html += '<div class="cal-more">+' + extra + ' more</div>';
    }

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
  Object.keys(CAL_COLORS).forEach(function(type) {
    var c = CAL_COLORS[type];
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

// ---- Event delegation for date picker buttons ----
// Called once after DOM is ready
function initDatePickers() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-picker-target]');
    if (btn) {
      var targetId = btn.getAttribute('data-picker-target');
      if (targetId) openDatePicker(targetId);
    }
  });
}
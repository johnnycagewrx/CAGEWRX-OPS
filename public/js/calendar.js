// calendar.js - CAGEwrx Ops Calendar (vertical infinite scroll)

'use strict';

// ---- State ----
var calOrders = [];
var calStartDate = null;    // Monday of the week shown at top
var calWeeksLoaded = 0;     // how many weeks rendered below start
var calWeeksBefore = 0;     // how many weeks rendered above start
var CAL_WEEK_CHUNK = 8;     // weeks loaded per scroll trigger

var CAL_COLORS = {
  build_date:      { bg: '#0d47a1', border: '#1565c0', text: '#e3f2fd', label: 'BUILD'      },
  sent_to_powder:  { bg: '#bf360c', border: '#e64a19', text: '#fbe9e7', label: 'SENT TO PC' },
  send_to_powder:  { bg: '#4a148c', border: '#7b1fa2', text: '#f3e5f5', label: 'SEND TO PC' }
};

var DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
var MONTH_NAMES = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];

// ---- Date helpers ----
function parseDate(str) {
  if (!str) return null;
  var p = str.split('/');
  if (p.length === 3) {
    var d = new Date(parseInt(p[2]), parseInt(p[0]) - 1, parseInt(p[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatDateKey(d) {
  var m = d.getMonth() + 1;
  var dd = d.getDate();
  return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (dd < 10 ? '0' + dd : dd);
}

function startOfWeek(d) {
  // Returns Sunday of the week containing d
  var r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d, n) {
  var r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ---- Event map ----
function buildCalEvents(orders) {
  var map = {};
  orders.forEach(function(o) {
    if (o.build_date && o.tab === 'assembled') {
      var d = parseDate(o.build_date);
      if (d) {
        var key = formatDateKey(d);
        if (!map[key]) map[key] = [];
        map[key].push({ order: o, type: 'build_date' });
      }
    }
    if (o.sent_to_powder && o.tab === 'powdercoat') {
      var d2 = parseDate(o.sent_to_powder);
      if (d2) {
        var key2 = formatDateKey(d2);
        if (!map[key2]) map[key2] = [];
        var now = new Date(); now.setHours(0, 0, 0, 0);
        map[key2].push({ order: o, type: d2 > now ? 'send_to_powder' : 'sent_to_powder' });
      }
    }
  });
  return map;
}

// ---- Render ----
function renderCalendar(orders) {
  calOrders = orders || calOrders;

  // Start from previous Sunday (so current week is at top)
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  calStartDate = startOfWeek(today);
  // Go back one more week so "previous week" is visible at top
  calStartDate = addDays(calStartDate, -7);

  calWeeksLoaded = 0;
  calWeeksBefore = 1; // we already placed 1 week before current

  var container = document.getElementById('calendar-body');
  if (!container) return;

  container.innerHTML =
    buildLegendHTML() +
    buildDayNamesHTML() +
    '<div id="cal-scroll-area" class="cal-scroll-area">' +
      '<div id="cal-load-past" class="cal-load-more-btn" onclick="loadMorePast()">&#x2191; Load earlier weeks</div>' +
      '<div id="cal-weeks"></div>' +
      '<div id="cal-load-future" class="cal-load-more-btn" onclick="loadMoreFuture()">&#x2193; Load more weeks</div>' +
    '</div>';

  renderWeeks(CAL_WEEK_CHUNK);

  // Scroll so current week is visible (skip the "previous week" row)
  setTimeout(function() {
    var scrollArea = document.getElementById('cal-scroll-area');
    var firstWeekRow = document.querySelector('.cal-week-row');
    if (scrollArea && firstWeekRow) {
      // Scroll past the first (past) week row
      scrollArea.scrollTop = firstWeekRow.offsetHeight + 4;
    }
  }, 50);
}

function buildLegendHTML() {
  var h = '<div class="cal-legend">';
  var types = ['build_date', 'send_to_powder', 'sent_to_powder'];
  types.forEach(function(type) {
    var c = CAL_COLORS[type];
    if (!c) return;
    h += '<div class="cal-legend-item">' +
      '<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:' + c.bg + ';border:1px solid ' + c.border + ';margin-right:4px;"></span>' +
      '<span style="color:' + c.text + ';">' + c.label + '</span>' +
    '</div>';
  });
  h += '</div>';
  return h;
}

function buildDayNamesHTML() {
  var h = '<div class="cal-daynames-row">';
  DAY_NAMES.forEach(function(d) {
    h += '<div class="cal-dayname">' + d + '</div>';
  });
  h += '</div>';
  return h;
}

function renderWeeks(count) {
  var events = buildCalEvents(calOrders);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayKey = formatDateKey(today);

  var weeksEl = document.getElementById('cal-weeks');
  if (!weeksEl) return;

  var html = weeksEl.innerHTML;

  for (var w = 0; w < count; w++) {
    var weekStart = addDays(calStartDate, calWeeksLoaded * 7);
    var monthLabel = '';
    // Show month label when a new month starts in this week
    for (var d = 0; d < 7; d++) {
      var day = addDays(weekStart, d);
      if (day.getDate() <= 7 && d === 0) {
        monthLabel = MONTH_NAMES[day.getMonth()] + ' ' + day.getFullYear();
      }
    }

    html += buildWeekRowHTML(weekStart, events, todayKey, monthLabel);
    calWeeksLoaded++;
  }

  weeksEl.innerHTML = html;
}

function buildWeekRowHTML(weekStart, events, todayKey, monthLabel) {
  var h = '<div class="cal-week-row">';
  if (monthLabel) {
    h += '<div class="cal-month-label" style="grid-column:1/-1;">' + monthLabel + '</div>';
  }
  for (var d = 0; d < 7; d++) {
    var day = addDays(weekStart, d);
    var key = formatDateKey(day);
    var isToday = key === todayKey;
    var dayEvents = events[key] || [];

    h += '<div class="cal-cell' + (isToday ? ' cal-today' : '') + '">';
    h += '<div class="cal-date">' + day.getDate() + '</div>';

    dayEvents.forEach(function(ev) {
      var c = CAL_COLORS[ev.type];
      if (!c) return;
      var num = ev.order.order_num || '?';
      h += '<div class="cal-event"' +
        ' style="background:' + c.bg + ';border-left:2px solid ' + c.border + ';color:' + c.text + ';"' +
        ' data-id="' + ev.order.id + '" data-tab="' + ev.order.tab + '">' +
        '#' + num + ' &mdash; ' + c.label +
      '</div>';
    });

    h += '</div>';
  }
  h += '</div>';
  return h;
}

function loadMoreFuture() {
  renderWeeks(CAL_WEEK_CHUNK);
}

function loadMorePast() {
  var events = buildCalEvents(calOrders);
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var todayKey = formatDateKey(today);
  var weeksEl = document.getElementById('cal-weeks');
  if (!weeksEl) return;

  var html = '';
  for (var w = 0; w < CAL_WEEK_CHUNK; w++) {
    calWeeksBefore++;
    var weekStart = addDays(calStartDate, -((calWeeksBefore - 1) * 7));
    var monthLabel = '';
    if (weekStart.getDate() <= 7) {
      monthLabel = MONTH_NAMES[weekStart.getMonth()] + ' ' + weekStart.getFullYear();
    }
    html = buildWeekRowHTML(weekStart, events, todayKey, monthLabel) + html;
  }

  var scrollArea = document.getElementById('cal-scroll-area');
  var prevScrollHeight = scrollArea ? scrollArea.scrollHeight : 0;
  var prevScrollTop = scrollArea ? scrollArea.scrollTop : 0;

  weeksEl.innerHTML = html + weeksEl.innerHTML;

  // Preserve scroll position so it doesn't jump
  if (scrollArea) {
    var newScrollHeight = scrollArea.scrollHeight;
    scrollArea.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
  }
}

// ---- Date Picker (unchanged) ----
var datePickerTarget = null;
var pickerYear  = new Date().getFullYear();
var pickerMonth = new Date().getMonth();

function openDatePicker(inputId) {
  datePickerTarget = inputId;
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
  var selectedKey = null;
  if (datePickerTarget) {
    var el = document.getElementById(datePickerTarget);
    if (el && el.value) {
      var d = parseDate(el.value);
      if (d) selectedKey = formatDateKey(d);
    }
  }
  var MONTH_NAMES_PICK = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  var html = '<div class="picker-header">';
  html += '<button class="cal-nav" onclick="pickerPrev()">&#x276E;</button>';
  html += '<div class="cal-title">' + MONTH_NAMES_PICK[pickerMonth] + ' ' + pickerYear + '</div>';
  html += '<button class="cal-nav" onclick="pickerNext()">&#x276F;</button>';
  html += '</div>';
  html += '<div class="picker-grid">';
  DAY_NAMES.forEach(function(d) { html += '<div class="cal-dayname">' + d + '</div>'; });
  for (var i = 0; i < firstDay; i++) html += '<div class="picker-cell picker-empty"></div>';
  for (var day = 1; day <= daysInMonth; day++) {
    var key = pickerYear + '-' + pickerMonth + 1 < 10 ? '0' + (pickerMonth + 1) : '' + (pickerMonth + 1) + '-' + day < 10 ? '0' + day : '' + day;
    var cls = 'picker-cell' + (key === todayKey ? ' picker-today' : '') + (key === selectedKey ? ' picker-selected' : '');
    var m = pickerMonth + 1 < 10 ? '0' + (pickerMonth + 1) : '' + (pickerMonth + 1);
    var dd = day < 10 ? '0' + day : '' + day;
    var val = m + '/' + dd + '/' + pickerYear;
    html += '<div class="' + cls + '" onclick="selectDate(\'' + val + '\')">' + day + '</div>';
  }
  html += '</div>';
  var pb = document.getElementById('picker-body');
  if (pb) pb.innerHTML = html;
}

function selectDate(val) {
  if (datePickerTarget) {
    var el = document.getElementById(datePickerTarget);
    if (el) el.value = val;
    var btn = document.querySelector('[data-picker-target="' + datePickerTarget + '"]');
    if (btn) {
      var span = btn.querySelector('span');
      if (span) { span.textContent = val; span.style.color = '#e0e0e0'; }
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

function resetDateBtn(inputId, val) {
  var el = document.getElementById(inputId);
  if (el) el.value = val || '';
  var btn = document.querySelector('[data-picker-target="' + inputId + '"]');
  if (btn) {
    var span = btn.querySelector('span');
    if (span) { span.textContent = val || 'Select date...'; span.style.color = val ? '#e0e0e0' : '#333'; }
  }
}

function editFromId(id, tab) {
  var o = orderCache[id];
  if (o) openEditModal(tab, o);
}

// ---- Event delegation ----
function initDatePickers() {
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-picker-target]');
    if (btn) { var targetId = btn.getAttribute('data-picker-target'); if (targetId) openDatePicker(targetId); }
    var ev = e.target.closest('[data-id][data-tab]');
    if (ev && !e.target.closest('[data-priority-id]') && !e.target.closest('.edit-btn') && !e.target.closest('.done-btn')) {
      var id = ev.getAttribute('data-id');
      var tab = ev.getAttribute('data-tab');
      if (id && tab) editFromId(id, tab);
    }
  });
}
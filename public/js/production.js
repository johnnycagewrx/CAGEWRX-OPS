// production.js - CAGEwrx Ops Production board logic

'use strict';

var taskCache = {};
var dragTaskData = null;
var dragTaskFromSection = null;
var editingTask = null;
var activeAssigneeFilter = null;

var SECTION_LABELS = {
  shipping:    'Shipping',
  shop:        'Shop',
  sme:         'Sales / Marketing',
  engineering: 'Engineering',
  needtomake:  'Need to Make'
};

var PRIORITY_LABELS = { low: 'Low', medium: 'Medium', high: 'High' };

// ---- Stage open/close ----
var openSections = {};
var isMobileProd = window.innerWidth <= 768;

function initProdSections() {
  Object.keys(SECTION_LABELS).forEach(function (sec) {
    var body = document.getElementById('pcol-' + sec);
    var chv  = document.getElementById('pchv-' + sec);
    var startOpen = !isMobileProd;
    if (body) body.style.display = startOpen ? 'block' : 'none';
    if (chv) chv.classList.toggle('open', startOpen);
    openSections[sec] = startOpen;
  });
}

function toggleProdSection(sec) {
  var body = document.getElementById('pcol-' + sec);
  var chv  = document.getElementById('pchv-' + sec);
  if (!body) return;
  var isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chv) chv.classList.toggle('open', !isOpen);
  openSections[sec] = !isOpen;
}

// ---- Data load ----
function renderAssigneeFilters(tasks) {
  var wrap = document.getElementById('assignee-filter-wrap');
  if (!wrap) return;
  var seen = {};
  var assignees = [];
  tasks.forEach(function(t) {
    var fullName = (t.assigned_to || '').trim();
    if (!fullName) return;
    // Use first name only for display, but track by first name to avoid dupes
    var firstName = fullName.split(' ')[0];
    if (!seen[firstName.toLowerCase()]) {
      seen[firstName.toLowerCase()] = true;
      assignees.push(firstName);
    }
  });
  assignees.sort();
  if (!assignees.length) { wrap.innerHTML = '<span style="font-size:11px;color:#333;">No assigned tasks yet — assign tasks to see filter buttons here</span>'; return; }
  var html = '<span style="font-size:11px;color:#555;margin-right:8px;">Filter:</span>';
  html += '<button class="assignee-btn' + (!activeAssigneeFilter ? ' active' : '') + '" data-name="__all__">All</button>';
  assignees.forEach(function(name) {
    var isActive = activeAssigneeFilter && activeAssigneeFilter.toLowerCase() === name.toLowerCase();
    var cls = 'assignee-btn' + (isActive ? ' active' : '');
    html += '<button class="' + cls + '" data-name="' + name + '">' + name + '</button>';
  });
  wrap.innerHTML = html;
}


function setAssigneeFilter(name) {
  activeAssigneeFilter = name;
  loadTasks();
}


// ---- Load users for assigned-to dropdown ----
var _prodUsers = [];

function loadProdUsers(callback) {
  sbFetch('GET', '/rest/v1/profiles?select=full_name,email&order=full_name.asc', null, function(err, data) {
    _prodUsers = (data || []).filter(function(u) { return u.full_name || u.email; });
    if (callback) callback();
  });
}

function buildAssignedDropdown(currentVal) {
  var opts = '<option value="">— Unassigned —</option>';
  _prodUsers.forEach(function(u) {
    var name = u.full_name || u.email.split('@')[0];
    var selected = name === currentVal ? ' selected' : '';
    opts += '<option value="' + name + '"' + selected + '>' + name + '</option>';
  });
  // If current value not in list, add it
  if (currentVal && !_prodUsers.find(function(u){ return (u.full_name || u.email.split('@')[0]) === currentVal; })) {
    opts += '<option value="' + currentVal + '" selected>' + currentVal + '</option>';
  }
  return '<select id="task-assigned" style="width:100%;background:#0a0a0a;border:1px solid #2a2a2a;border-radius:8px;padding:8px 12px;font-size:13px;color:#e0e0e0;outline:none;font-family:inherit;margin-top:4px;">' + opts + '</select>';
}


function loadTasks() {
  var ids = ['pcol-shipping', 'pcol-shop', 'pcol-sme', 'pcol-needtomake'];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="padding:18px;text-align:center;"><div class="spinner"></div></div>';
  });

  sbFetch('GET', '/rest/v1/tasks?select=*&order=sort_order.asc,created_at.asc', null, function (err, data) {
    var tasks = (err || !Array.isArray(data)) ? [] : data;
    renderTasks(tasks);
  });
}

function initAssigneeFilter() {
  var wrap = document.getElementById('assignee-filter-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-name]');
    if (!btn) return;
    var name = btn.getAttribute('data-name');
    setAssigneeFilter(name === '__all__' ? null : name);
  });
}

function renderTasks(tasks) {
  taskCache = {};
  var grouped = { shipping: [], shop: [], sme: [], engineering: [], needtomake: [] };
  tasks.forEach(function (t) {
    taskCache[t.id] = t;
    if (grouped[t.section]) grouped[t.section].push(t);
  });

  Object.keys(SECTION_LABELS).forEach(function (sec) {
    var items = grouped[sec];
    if (activeAssigneeFilter) {
      items = items.filter(function(t) {
        return (t.assigned_to || '').toLowerCase() === activeAssigneeFilter.toLowerCase();
      });
    }
    fillProdSection(sec, items);
  });
  renderAssigneeFilters(tasks);
}

function fillProdSection(sec, items) {
  var bodyId = 'pcol-' + sec;
  var cntId  = 'pcnt-' + sec;
  var el = document.getElementById(bodyId);
  var cntEl = document.getElementById(cntId);
  if (cntEl) cntEl.textContent = items.length;
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="task-empty">No tasks</div>'; return; }

  // Sort by priority: high → medium → low → none
  var priorityOrder = { high: 0, medium: 1, low: 2, '': 3 };
  items = items.slice().sort(function(a, b) {
    var pa = priorityOrder[a.priority || ''];
    var pb = priorityOrder[b.priority || ''];
    if (pa !== pb) return pa - pb;
    return new Date(a.created_at) - new Date(b.created_at);
  });

  var h = '';
  items.forEach(function (t) {
    h += buildTaskCard(t);
  });
  el.innerHTML = h;
}

function buildTaskCard(t) {
  var safeJson = JSON.stringify(t)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');

  var pills = '';
  if (t.assigned_to) pills += '<span class="task-pill task-pill-assigned">' + t.assigned_to.split(' ')[0] + '</span>';
  if (t.due_date)    pills += '<span class="task-pill task-pill-due">Due: ' + t.due_date + '</span>';
  if (t.priority)    pills += '<span class="task-pill task-pill-priority-' + t.priority + '">' + (PRIORITY_LABELS[t.priority] || t.priority) + '</span>';

  return '<div class="task-card" draggable="true"' +
    ' data-id="' + t.id + '" data-section="' + t.section + '" data-priority="' + (t.priority || '') + '"' +
    ' ondragstart="onTaskDragStart(event,\'' + t.section + '\',\'' + safeJson + '\')"' +
    ' ondragend="onTaskDragEnd()"' +
    ' ondragover="onTaskCardDragOver(event)"' +
    ' ondragleave="onTaskCardDragLeave(event)"' +
    ' ondrop="onTaskCardDrop(event)">' +
    '<div class="task-top">' +
      '<div class="task-title" onclick="editTaskFromCard(this.closest(\'.task-card\'))">' + (t.title || '') + '</div>' +
      '<div class="task-actions">' +
        '<button class="task-edit-btn" title="Edit" onclick="editTaskFromCard(this.closest(\'.task-card\'))">&#x270E;</button>' +
        '<button class="task-done-btn" title="Mark complete" onclick="event.stopPropagation();markTaskDone(event,\'' + t.id + '\')">&#x2713;</button>' +
      '</div>' +
    '</div>' +
    (t.description ? '<div class="task-desc">' + t.description + '</div>' : '') +
    '<div class="task-meta">' + pills + '</div>' +
  '</div>';
}

// ---- Drag and drop ----
function onTaskDragStart(e, section, tJson) {
  dragTaskFromSection = section;
  try { dragTaskData = JSON.parse(tJson.replace(/&quot;/g, '"')); }
  catch (err) { dragTaskData = null; }
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onTaskDragEnd() {
  document.querySelectorAll('.task-card').forEach(function (c) { c.classList.remove('dragging'); });
  document.querySelectorAll('.prod-stage').forEach(function (s) { s.classList.remove('drag-over'); });
}

function onTaskDragOver(e, sec) {
  e.preventDefault();
  var el = document.getElementById('pstage-' + sec);
  if (el) el.classList.add('drag-over');
}

function onTaskDragLeave(sec) {
  var el = document.getElementById('pstage-' + sec);
  if (el) el.classList.remove('drag-over');
}

function onTaskDrop(e, toSection) {
  e.preventDefault();
  document.querySelectorAll('.prod-stage').forEach(function (s) { s.classList.remove('drag-over'); });
  if (!dragTaskData || dragTaskFromSection === toSection) return;
  var taskId = dragTaskData.id;
  var fromSection = dragTaskFromSection;
  sbFetch('PATCH', '/rest/v1/tasks?id=eq.' + taskId, { section: toSection }, function (err) {
    if (err) showBanner('Move failed: ' + err, 'error');
    else {
      showBanner('Task moved to ' + SECTION_LABELS[toSection], 'success');
      logActivity('tasks', 'move', {
        recordId: taskId,
        fieldChanges: { section: { old: fromSection, new: toSection } },
        summary: 'Task "' + (dragTaskData.title||'') + '" moved from ' + SECTION_LABELS[fromSection] + ' to ' + SECTION_LABELS[toSection]
      });
      loadTasks();
    }
  });
}

// ---- Drag to reorder within section ----
function onTaskCardDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  var card = e.currentTarget;
  var rect = card.getBoundingClientRect();
  var midY = rect.top + rect.height / 2;
  card.classList.remove('drag-above', 'drag-below');
  card.classList.add(e.clientY < midY ? 'drag-above' : 'drag-below');
}

function onTaskCardDragLeave(e) {
  e.currentTarget.classList.remove('drag-above', 'drag-below');
}

function onTaskCardDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  var targetCard = e.currentTarget;
  targetCard.classList.remove('drag-above', 'drag-below');

  if (!dragTaskData) return;
  var dragId = dragTaskData.id;
  var targetId = targetCard.getAttribute('data-id');
  if (!targetId || dragId === targetId) return;

  var rect = targetCard.getBoundingClientRect();
  var isAbove = e.clientY < (rect.top + rect.height / 2);
  var section = targetCard.getAttribute('data-section');
  var body = document.getElementById('pcol-' + section);
  if (!body) return;

  // Get all current cards in DOM order
  var cards = Array.from(body.querySelectorAll('.task-card'));
  var dragCard = body.querySelector('[data-id="' + dragId + '"]');
  if (!dragCard) return;

  // Move card in DOM immediately for visual feedback
  if (isAbove) {
    body.insertBefore(dragCard, targetCard);
  } else {
    var next = targetCard.nextElementSibling;
    if (next) body.insertBefore(dragCard, next);
    else body.appendChild(dragCard);
  }

  // Determine new priority based on neighbors after DOM move
  var allCards = Array.from(body.querySelectorAll('.task-card'));
  var newIdx = allCards.indexOf(dragCard);
  var priorityOrder = ['high', 'medium', 'low', ''];

  // Find the priority of surrounding cards to determine new priority
  var prevCard = allCards[newIdx - 1];
  var nextCard = allCards[newIdx + 1];
  var prevPriority = prevCard ? (prevCard.getAttribute('data-priority') || '') : '';
  var nextPriority = nextCard ? (nextCard.getAttribute('data-priority') || '') : '';

  // New priority = higher of the two neighbors (or target card's priority)
  var targetPriority = targetCard.getAttribute('data-priority') || '';
  var newPriority = targetPriority; // inherit from what we dropped near

  // If dropped above target, take target's priority
  // If dropped below target, take target's priority (same section)
  // But upgrade if neighbor above is higher priority
  if (prevCard) {
    var prevRank = priorityOrder.indexOf(prevPriority);
    var newRank  = priorityOrder.indexOf(newPriority);
    // Lower index = higher priority
    if (prevRank < newRank) newPriority = prevPriority;
  }

  var draggedTask = taskCache[dragId];
  if (!draggedTask) { loadTasks(); return; }

  // Update data-priority on moved card
  dragCard.setAttribute('data-priority', newPriority);

  if (draggedTask.priority !== newPriority) {
    sbFetch('PATCH', '/rest/v1/tasks?id=eq.' + dragId, { priority: newPriority }, function(err) {
      if (err) showBanner('Error updating priority', 'error');
      else showBanner('Task moved — priority set to ' + (newPriority || 'none'), 'success');
      loadTasks(); // reload to persist sort
    });
  }
  // Save new sort order for all cards in section
  var finalCards = Array.from(body.querySelectorAll('.task-card'));
  var updates = [];
  finalCards.forEach(function(c, idx) {
    var cid = c.getAttribute('data-id');
    if (cid) updates.push({ id: cid, sort_order: (idx + 1) * 10 });
  });
  var saved = 0;
  updates.forEach(function(u) {
    sbFetch('PATCH', '/rest/v1/tasks?id=eq.' + u.id, { sort_order: u.sort_order }, function() {
      saved++;
      if (saved === updates.length && draggedTask.priority === newPriority) {
        showBanner('Task reordered', 'success');
      }
    });
  });
}


// ---- Mark done ----
function markTaskDone(e, id) {
  if (!confirm('Mark this task as complete and remove it?')) return;
  var t = taskCache[id];
  sbFetch('DELETE', '/rest/v1/tasks?id=eq.' + id, null, function (err) {
    if (err) showBanner('Error: ' + err, 'error');
    else {
      showBanner('Task completed!', 'success');
      logActivity('tasks', 'delete', {
        recordId: id,
        fullBefore: t || null,
        summary: 'Task "' + ((t && t.title) || id) + '" marked complete and removed'
      });
      loadTasks();
    }
  });
}

// ---- Edit modal ----
function tgv(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function editTaskFromCard(cardEl) {
  var id = cardEl.getAttribute('data-id');
  var t = taskCache[id];
  if (t) openTaskModal(t);
  else showBanner('Task data not found - refresh and try again', 'error');
}

function openTaskModal(t) {
  editingTask = t || null;
  var isEdit = !!t;
  document.getElementById('task-modal-title').textContent = isEdit ? 'Edit Task' : 'New Task';

  document.getElementById('task-section').value = (t && t.section) || 'shipping';
  document.getElementById('task-title').value = (t && t.title) || '';
  document.getElementById('task-desc').value = (t && t.description) || '';
  resetDateBtn('task-due', (t && t.due_date) || '');
  setPriority((t && t.priority) || '');

  // Replace assigned field with dropdown
  var assignedWrap = document.getElementById('task-assigned-wrap');
  if (assignedWrap) {
    assignedWrap.innerHTML = buildAssignedDropdown((t && t.assigned_to) || '');
  }

  document.getElementById('task-modal').classList.add('open');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('open');
  editingTask = null;
}

function setPriority(p) {
  document.getElementById('task-priority').value = p;
  document.querySelectorAll('.priority-btn').forEach(function (btn) {
    btn.classList.remove('active-low', 'active-medium', 'active-high');
    if (btn.getAttribute('data-priority') === p && p) {
      btn.classList.add('active-' + p);
    }
  });
}

function confirmTaskSave() {
  var title = tgv('task-title');
  if (!title) { showBanner('Task title is required', 'error'); return; }

  var assignedEl = document.getElementById('task-assigned');
  var assignedVal = assignedEl ? assignedEl.value : '';

  var body = {
    section: tgv('task-section'),
    title: title,
    description: tgv('task-desc'),
    assigned_to: assignedVal,
    due_date: tgv('task-due'),
    priority: tgv('task-priority')
  };

  if (editingTask) {
    var id = editingTask.id;
    var prevSnapshot = JSON.parse(JSON.stringify(editingTask));
    closeTaskModal();
    sbFetch('PATCH', '/rest/v1/tasks?id=eq.' + id, body, function (err) {
      if (err) showBanner('Save failed: ' + err, 'error');
      else {
        showBanner('Task updated!', 'success');
        logActivity('tasks', 'update', {
          recordId: id,
          fieldChanges: diffFields(prevSnapshot, body),
          summary: 'Task "' + (body.title||prevSnapshot.title) + '" edited'
        });
        loadTasks();
      }
    });
  } else {
    closeTaskModal();
    sbFetch('POST', '/rest/v1/tasks', body, function (err, data) {
      if (err) showBanner('Add failed: ' + err, 'error');
      else {
        showBanner('Task added!', 'success');
        var newId = (Array.isArray(data) && data[0] && data[0].id) || null;
        logActivity('tasks', 'create', {
          recordId: newId,
          fullAfter: body,
          summary: 'Task "' + body.title + '" added to ' + SECTION_LABELS[body.section]
        });
        loadTasks();
      }
    });
  }
}

function openAddTaskModal(section) {
  openTaskModal(null);
  if (section) document.getElementById('task-section').value = section;
}
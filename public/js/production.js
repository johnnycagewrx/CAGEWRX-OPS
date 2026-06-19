// production.js - CAGEwrx Ops Production board logic

'use strict';

var taskCache = {};
var dragTaskData = null;
var dragTaskFromSection = null;
var editingTask = null;

var SECTION_LABELS = {
  shipping:   'Shipping',
  shop:       'Shop',
  sme:        'Sales / Marketing / Engineering',
  needtomake: 'Need to Make'
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
function loadTasks() {
  var ids = ['pcol-shipping', 'pcol-shop', 'pcol-sme', 'pcol-needtomake'];
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = '<div style="padding:18px;text-align:center;"><div class="spinner"></div></div>';
  });

  sbFetch('GET', '/rest/v1/tasks?select=*&order=created_at.asc', null, function (err, data) {
    var tasks = (err || !Array.isArray(data)) ? [] : data;
    renderTasks(tasks);
  });
}

function renderTasks(tasks) {
  taskCache = {};
  var grouped = { shipping: [], shop: [], sme: [], needtomake: [] };
  tasks.forEach(function (t) {
    taskCache[t.id] = t;
    if (grouped[t.section]) grouped[t.section].push(t);
  });

  Object.keys(SECTION_LABELS).forEach(function (sec) {
    fillProdSection(sec, grouped[sec]);
  });
}

function fillProdSection(sec, items) {
  var bodyId = 'pcol-' + sec;
  var cntId  = 'pcnt-' + sec;
  var el = document.getElementById(bodyId);
  var cntEl = document.getElementById(cntId);
  if (cntEl) cntEl.textContent = items.length;
  if (!el) return;
  if (!items.length) { el.innerHTML = '<div class="task-empty">No tasks</div>'; return; }

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
  if (t.assigned_to) pills += '<span class="task-pill task-pill-assigned">' + t.assigned_to + '</span>';
  if (t.due_date)    pills += '<span class="task-pill task-pill-due">Due: ' + t.due_date + '</span>';
  if (t.priority)    pills += '<span class="task-pill task-pill-priority-' + t.priority + '">' + (PRIORITY_LABELS[t.priority] || t.priority) + '</span>';

  return '<div class="task-card" draggable="true"' +
    ' data-id="' + t.id + '" data-section="' + t.section + '"' +
    ' ondragstart="onTaskDragStart(event,\'' + t.section + '\',\'' + safeJson + '\')"' +
    ' ondragend="onTaskDragEnd()">' +
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
  document.getElementById('task-assigned').value = (t && t.assigned_to) || '';
  resetDateBtn('task-due', (t && t.due_date) || '');
  setPriority((t && t.priority) || '');

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

  var body = {
    section: tgv('task-section'),
    title: title,
    description: tgv('task-desc'),
    assigned_to: tgv('task-assigned'),
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
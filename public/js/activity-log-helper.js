// activity.js - Shared activity logging + undo helpers
// CAGEwrx Ops

/**
 * Log an action to the activity_log table.
 * @param {string} tableName - 'orders' | 'tasks' | 'faq_items'
 * @param {string} action - 'create' | 'update' | 'move' | 'delete'
 * @param {object} opts - { recordId, fullBefore, fullAfter, summary, fieldChanges }
 */
function logActivity(tableName, action, opts) {
  opts = opts || {};
  var sess = getSession();
  var entry = {
    table_name: tableName,
    record_id: opts.recordId || null,
    action: action,
    field_changes: opts.fieldChanges || null,
    full_before: opts.fullBefore || null,
    full_after: opts.fullAfter || null,
    summary: opts.summary || '',
    user_email: (sess && sess.user && sess.user.email) || 'unknown',
    user_name: (sess && sess.full_name) || ''
  };
  sbFetch('POST', '/rest/v1/activity_log', entry, function (err) {
    if (err) console.error('Activity log failed:', err);
  });
}

/**
 * Build a field_changes object by diffing two flat objects.
 * Only includes fields that actually differ.
 */
function diffFields(before, after) {
  var changes = {};
  var keys = {};
  Object.keys(before || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(after || {}).forEach(function (k) { keys[k] = true; });
  Object.keys(keys).forEach(function (k) {
    if (k === 'id' || k === 'created_at') return;
    var a = (before || {})[k];
    var b = (after || {})[k];
    if (a !== b) changes[k] = { old: a, new: b };
  });
  return changes;
}

/**
 * Undo a single activity log entry.
 * Restores the table to its pre-change state for that entry, then marks it undone.
 */
function undoActivity(logId, cb) {
  sbFetch('GET', '/rest/v1/activity_log?id=eq.' + logId + '&select=*', null, function (err, rows) {
    if (err || !rows || !rows.length) { cb && cb('Log entry not found'); return; }
    var entry = rows[0];
    if (entry.undone) { cb && cb('Already undone'); return; }

    var table = entry.table_name;

    function markUndone() {
      sbFetch('PATCH', '/rest/v1/activity_log?id=eq.' + logId, { undone: true }, function () {
        cb && cb(null);
      });
    }

    if (entry.action === 'create') {
      // Undo a create = delete the record
      if (!entry.record_id) { cb && cb('No record id to delete'); return; }
      sbFetch('DELETE', '/rest/v1/' + table + '?id=eq.' + entry.record_id, null, function (err2) {
        if (err2) { cb && cb(err2); return; }
        markUndone();
      });
    } else if (entry.action === 'delete') {
      // Undo a delete = re-insert the full_before snapshot
      if (!entry.full_before) { cb && cb('No snapshot to restore'); return; }
      var restore = Object.assign({}, entry.full_before);
      delete restore.id; // let DB assign a fresh id
      sbFetch('POST', '/rest/v1/' + table, restore, function (err2) {
        if (err2) { cb && cb(err2); return; }
        markUndone();
      });
    } else if (entry.action === 'update' || entry.action === 'move') {
      // Undo an update/move = patch back the old values from field_changes
      if (!entry.record_id || !entry.field_changes) { cb && cb('Nothing to restore'); return; }
      var patch = {};
      Object.keys(entry.field_changes).forEach(function (k) {
        patch[k] = entry.field_changes[k].old;
      });
      sbFetch('PATCH', '/rest/v1/' + table + '?id=eq.' + entry.record_id, patch, function (err2) {
        if (err2) { cb && cb(err2); return; }
        markUndone();
      });
    } else {
      cb && cb('Unknown action type');
    }
  });
}

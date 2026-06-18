// supabase.js - Shared Supabase helpers
// CAGEwrx Ops

const SUPABASE_URL = 'https://jkgftyxavjppgmquueqx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImprZ2Z0eXhhdmpwcGdtcXV1ZXF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzU2MDQsImV4cCI6MjA5NzIxMTYwNH0.bkmtBbDvHPwqDMJnwtF9Bml3B7cs_t579c7FOqstvUo';

/**
 * Make an authenticated request to Supabase REST API
 * @param {string} method - HTTP method (GET, POST, PATCH, DELETE)
 * @param {string} path - API path e.g. '/rest/v1/orders'
 * @param {object|null} body - Request body for POST/PATCH
 * @param {function} cb - Callback(error, data)
 */
function sbFetch(method, path, body, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open(method, SUPABASE_URL + path, true);
  xhr.setRequestHeader('apikey', SUPABASE_KEY);
  xhr.setRequestHeader('Authorization', 'Bearer ' + SUPABASE_KEY);
  xhr.setRequestHeader('Content-Type', 'application/json');

  if (method === 'PATCH' || method === 'DELETE') {
    xhr.setRequestHeader('Prefer', 'return=minimal');
  } else if (method === 'POST') {
    xhr.setRequestHeader('Prefer', 'return=representation');
  }

  xhr.onload = function () {
    if (xhr.status >= 200 && xhr.status < 300) {
      try { cb(null, xhr.responseText ? JSON.parse(xhr.responseText) : {}); }
      catch (e) { cb(null, {}); }
    } else {
      var msg = xhr.responseText;
      try { var p = JSON.parse(msg); msg = p.message || p.error || msg; } catch (e) {}
      cb('Error ' + xhr.status + ': ' + msg, null);
    }
  };

  xhr.onerror = function () { cb('Network error', null); };
  xhr.send(body ? JSON.stringify(body) : null);
}

/**
 * Format a date string to MM/DD/YYYY
 */
function fmtDate(s) {
  if (!s) return '';
  var d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
}

/**
 * Get today as MM/DD/YYYY
 */
function todayStr() {
  var d = new Date();
  var m = d.getMonth() + 1, dd = d.getDate(), y = d.getFullYear();
  return (m < 10 ? '0' + m : m) + '/' + (dd < 10 ? '0' + dd : dd) + '/' + y;
}

/**
 * Auto-format date input as MM/DD/YYYY while typing
 */
function autoSlashDate(input) {
  var v = input.value.replace(/[^0-9]/g, '');
  if (v.length >= 5) v = v.slice(0, 2) + '/' + v.slice(2, 4) + '/' + v.slice(4, 8);
  else if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
  input.value = v;
}

/**
 * Show a banner notification
 */
function showBanner(msg, type) {
  var b = document.getElementById('banner');
  if (!b) return;
  b.textContent = msg;
  b.className = 'banner ' + type;
  b.style.display = 'block';
  setTimeout(function () { b.style.display = 'none'; }, 4000);
}

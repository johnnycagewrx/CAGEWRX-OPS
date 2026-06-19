// faq.js - CAGEwrx Ops FAQ page logic

'use strict';

var allFaqs = [];
var activeFaqCategory = 'all';
var editingFaq = null;
var isAdmin = false;

function loadFaqs() {
  var list = document.getElementById('faq-list');
  if (list) list.innerHTML = '<div style="padding:40px;text-align:center;"><div class="spinner"></div></div>';

  sbFetch('GET', '/rest/v1/faq_items?select=*&order=sort_order.asc,created_at.asc', null, function (err, data) {
    allFaqs = (err || !Array.isArray(data)) ? [] : data;
    renderCategoryTabs();
    filterFaqs();
  });
}

function renderCategoryTabs() {
  var cats = {};
  allFaqs.forEach(function (f) { cats[f.category || 'General'] = true; });
  var catList = Object.keys(cats).sort();

  var wrap = document.getElementById('faq-cat-tabs');
  if (!wrap) return;

  var h = '<button class="faq-cat-tab' + (activeFaqCategory === 'all' ? ' active' : '') + '" onclick="setFaqCategory(\'all\')">All</button>';
  catList.forEach(function (c) {
    h += '<button class="faq-cat-tab' + (activeFaqCategory === c ? ' active' : '') + '" onclick="setFaqCategory(\'' + c.replace(/'/g, "\\'") + '\')">' + c + '</button>';
  });
  wrap.innerHTML = h;
}

function setFaqCategory(cat) {
  activeFaqCategory = cat;
  renderCategoryTabs();
  filterFaqs();
}

function filterFaqs() {
  var searchEl = document.getElementById('faq-search');
  var search = searchEl ? searchEl.value.toLowerCase().trim() : '';

  var filtered = allFaqs.filter(function (f) {
    var matchCat = activeFaqCategory === 'all' || (f.category || 'General') === activeFaqCategory;
    var matchSearch = !search ||
      (f.question || '').toLowerCase().indexOf(search) !== -1 ||
      (f.answer || '').toLowerCase().indexOf(search) !== -1;
    return matchCat && matchSearch;
  });

  renderFaqList(filtered);
}

function renderFaqList(list) {
  var el = document.getElementById('faq-list');
  if (!el) return;

  if (!list.length) {
    el.innerHTML = '<div class="faq-empty"><div class="faq-empty-icon">&#x2753;</div><div class="faq-empty-text">No matching questions found</div></div>';
    return;
  }

  el.innerHTML = list.map(function (f) {
    var adminBtns = isAdmin
      ? '<button class="faq-edit-btn" title="Edit" onclick="event.stopPropagation();editFaq(\'' + f.id + '\')">&#x270E;</button>' +
        '<button class="faq-del-btn" title="Delete" onclick="event.stopPropagation();deleteFaq(\'' + f.id + '\')">&#x2715;</button>'
      : '';

    return '<div class="faq-item" id="faq-' + f.id + '">' +
      '<div class="faq-question" onclick="toggleFaq(\'' + f.id + '\')">' +
        '<div class="faq-question-text">' + f.question + '</div>' +
        '<div class="faq-question-actions">' + adminBtns + '<span class="faq-chevron">&#x25BE;</span></div>' +
      '</div>' +
      '<div class="faq-answer">' +
        '<div class="faq-answer-text">' + f.answer + '</div>' +
        (f.category ? '<div class="faq-cat-badge">' + f.category + '</div>' : '') +
      '</div>' +
    '</div>';
  }).join('');
}

function toggleFaq(id) {
  var el = document.getElementById('faq-' + id);
  if (el) el.classList.toggle('open');
}

// ---- Admin: add/edit/delete ----
function fgv(id) {
  var el = document.getElementById(id);
  return el ? el.value.trim() : '';
}

function openFaqModal(faq) {
  editingFaq = faq || null;
  document.getElementById('faq-modal-title').textContent = faq ? 'Edit Question' : 'New Question';
  document.getElementById('faq-question-input').value = (faq && faq.question) || '';
  document.getElementById('faq-answer-input').value = (faq && faq.answer) || '';
  document.getElementById('faq-category-input').value = (faq && faq.category) || '';
  document.getElementById('faq-modal').classList.add('open');
}

function closeFaqModal() {
  document.getElementById('faq-modal').classList.remove('open');
  editingFaq = null;
}

function editFaq(id) {
  var f = allFaqs.find(function (x) { return x.id === id; });
  if (f) openFaqModal(f);
}

function confirmFaqSave() {
  var question = fgv('faq-question-input');
  var answer = fgv('faq-answer-input');
  if (!question || !answer) { showBanner('Question and answer are both required', 'error'); return; }

  var body = {
    question: question,
    answer: answer,
    category: fgv('faq-category-input') || 'General'
  };

  if (editingFaq) {
    var id = editingFaq.id;
    var prevSnapshot = JSON.parse(JSON.stringify(editingFaq));
    closeFaqModal();
    sbFetch('PATCH', '/rest/v1/faq_items?id=eq.' + id, body, function (err) {
      if (err) showBanner('Save failed: ' + err, 'error');
      else {
        showBanner('Question updated!', 'success');
        logActivity('faq_items', 'update', {
          recordId: id,
          fieldChanges: diffFields(prevSnapshot, body),
          summary: 'FAQ "' + (body.question||prevSnapshot.question) + '" edited'
        });
        loadFaqs();
      }
    });
  } else {
    closeFaqModal();
    sbFetch('POST', '/rest/v1/faq_items', body, function (err, data) {
      if (err) showBanner('Add failed: ' + err, 'error');
      else {
        showBanner('Question added!', 'success');
        var newId = (Array.isArray(data) && data[0] && data[0].id) || null;
        logActivity('faq_items', 'create', {
          recordId: newId,
          fullAfter: body,
          summary: 'FAQ "' + body.question + '" added'
        });
        loadFaqs();
      }
    });
  }
}

function deleteFaq(id) {
  if (!confirm('Delete this question?')) return;
  var f = allFaqs.find(function(x){ return x.id === id; });
  sbFetch('DELETE', '/rest/v1/faq_items?id=eq.' + id, null, function (err) {
    if (err) showBanner('Delete failed: ' + err, 'error');
    else {
      showBanner('Question deleted', 'success');
      logActivity('faq_items', 'delete', {
        recordId: id,
        fullBefore: f || null,
        summary: 'FAQ "' + ((f && f.question) || id) + '" deleted'
      });
      loadFaqs();
    }
  });
}
/* ============================================
   个人内容收藏库 - 核心逻辑
   ============================================ */

// --- 分类配色映射 ---
const CATEGORY_STYLES = {
  'AI/技术':     { color: '#2a7a9a', bg: '#e8f4f8' },
  '投资/财经':   { color: '#5a7a2a', bg: '#f0f4e8' },
  '效率/工具':   { color: '#9a6a2a', bg: '#f8eee8' },
  '阅读/文化':   { color: '#6a4a9a', bg: '#f0eaf8' },
  '个人成长':    { color: '#9a4a6a', bg: '#f8eaf0' },
  '设计/创意':   { color: '#2a7a6a', bg: '#e8f4f0' },
  '生活/随笔':   { color: '#7a7a4a', bg: '#f4f4e8' },
  '资讯/热点':   { color: '#9a5a2a', bg: '#f8f0e8' }
};

const STATUS_LABEL = { unread: '未读', read: '已读' };
const STATUS_CLASS = { unread: 'status-unread', read: 'status-read' };

const SORT_OPTIONS = [
  { key: 'dateAdded', label: '最新' },
  { key: 'title', label: '标题' },
  { key: 'rating', label: '评分' },
  { key: 'readTime', label: '阅读时长' }
];

const FONT_SIZES = [
  { label: '小', scale: 0.9 },
  { label: '中', scale: 1 },
  { label: '大', scale: 1.15 }
];

// --- 状态 ---
let state = {
  articles: [],
  filterCategory: '全部',
  searchQuery: '',
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  fontSizeIndex: 1,
  currentView: 'home',
  currentArticle: null
};

const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => [...(p || document).querySelectorAll(s)];

function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  var d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- Toast ---
var toastTimer;
function showToast(msg) {
  var el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = 'toast';
  el.textContent = msg;
  clearTimeout(toastTimer);
  requestAnimationFrame(function () {
    el.classList.add('show');
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  });
}

// --- 搜索高亮 ---
function highlightText(text, query) {
  var escaped = escapeHtml(text);
  if (!query || !query.trim()) return escaped;
  var q = escapeRegex(query.trim());
  var parts = escaped.split(new RegExp('(' + q + ')', 'gi'));
  return parts.join('').replace(new RegExp(q, 'gi'), function (m) { return '<mark>' + m + '</mark>'; });
}

// --- 复制全文 ---
function copyFullText() {
  if (!state.currentArticle) return;
  navigator.clipboard.writeText(state.currentArticle.content).then(function () {
    showToast('全文已复制到剪贴板');
  }).catch(function () {
    showToast('复制失败，请手动选择复制');
  });
}

// --- 随机一篇 ---
function randomArticle() {
  var list = state.articles;
  if (!list.length) return showToast('还没有收藏文章');
  renderDetail(list[Math.floor(Math.random() * list.length)]);
}

var STORAGE_KEY = 'my-collection-overrides';
var DELETED_KEY = 'my-collection-deleted';

// --- localStorage 持久化 ---
function loadOverrides() {
  try {
    var raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}

function loadDeleted() {
  try {
    var raw = localStorage.getItem(DELETED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveOverrides() {
  var map = {};
  state.articles.forEach(function (a) {
    var now = new Date().toISOString().slice(0, 10);
    var ov = {};
    if (a.notes) ov.notes = a.notes;
    if (a.status !== 'unread') ov.status = a.status;
    if (a.starred) ov.starred = true;
    if (a.updatedAt !== now) ov.updatedAt = now;
    if (Object.keys(ov).length) map[a.id] = ov;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

function applyOverrides(articles) {
  var overrides = loadOverrides();
  var deleted = loadDeleted();
  articles = articles.filter(function (a) { return deleted.indexOf(a.id) === -1; });
  articles.forEach(function (a) {
    var ov = overrides[a.id];
    if (ov) {
      if (ov.notes !== undefined) a.notes = ov.notes;
      if (ov.status !== undefined) a.status = ov.status;
      if (ov.starred !== undefined) a.starred = ov.starred;
      if (ov.updatedAt) a.updatedAt = ov.updatedAt;
    }
  });
  return articles;
}

function deleteArticle(id) {
  showConfirmModal(
    '确定删除这篇文章吗？删除后不可恢复。',
    function () {
      var deleted = loadDeleted();
      if (deleted.indexOf(id) === -1) deleted.push(id);
      localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
      state.articles = state.articles.filter(function (a) { return a.id !== id; });
      showToast('已删除');
      renderHome();
    }
  );
}

// --- 确认弹窗 ---
function showConfirmModal(desc, onConfirm) {
  var existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<div class="modal-icon">' + '⚠' + '</div>' +
      '<div class="modal-title">确认操作</div>' +
      '<div class="modal-desc">' + escapeHtml(desc) + '</div>' +
      '<div class="modal-actions">' +
        '<button class="modal-btn modal-btn-cancel" id="modalCancel">取消</button>' +
        '<button class="modal-btn modal-btn-confirm" id="modalConfirm">确认</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('show'); });

  var close = function () {
    overlay.classList.remove('show');
    setTimeout(function () { overlay.remove(); }, 200);
  };
  overlay.querySelector('#modalCancel').addEventListener('click', close);
  overlay.querySelector('#modalConfirm').addEventListener('click', function () {
    close();
    if (onConfirm) onConfirm();
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });
  var escHandler = function (e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
}

// --- 数据加载 ---
async function loadData() {
  try {
    var res = await fetch('data.json?' + Date.now());
    var data = await res.json();
    state.articles = applyOverrides(data.articles);
    renderHome();
  } catch (e) {
    console.error('数据加载失败:', e);
    $('#app').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>数据加载失败</h3><p style="margin-top:8px;color:#999">请确保 data.json 文件存在且格式正确</p></div>';
  }
}

// --- 渲染首页 ---
function renderHome() {
  state.currentView = 'home';
  state.currentArticle = null;
  window.history.pushState({ view: 'home' }, '', '#home');
  document.title = '收藏库';

  var app = $('#app');
  var articles = getFilteredArticles();

  var html = '';
  html += '<div class="home-toolbar">';
  html +=   '<div class="category-nav" id="categoryNav"></div>';
  html +=   '<div class="toolbar-right">';
  html +=     '<div class="sort-group">';
  html +=       '<span class="sort-label">排序</span>';
  html +=       '<select class="sort-select" id="sortSelect"></select>';
  html +=       '<button class="sort-order-btn" id="sortOrderBtn">' + (state.sortOrder === 'desc' ? '↓' : '↑') + '</button>';
  html +=     '</div>';
  html +=     '<button class="btn btn-secondary" onclick="randomArticle()">🎲 随机</button>';
  html +=   '</div>';
  html += '</div>';

  html += '<div id="cardGrid">';
  if (articles.length === 0) {
    html += '<div class="empty-state"><div class="icon">📭</div><h3>暂无内容</h3><p style="margin-top:8px;color:#999">还没有收藏任何文章</p></div>';
  } else {
    var gridHtml = '';
    for (var i = 0; i < articles.length; i++) {
      gridHtml += renderCard(articles[i]);
    }
    html += '<div class="card-grid">' + gridHtml + '</div>';
  }
  html += '</div>';

  html += '<div class="stats-bar" id="statsBar"></div>';

  app.innerHTML = html;
  renderCategoryNav();
  renderSortSelect();
  renderStats();
  bindCardClicks();
  bindTagClicks();
}

function renderSortSelect() {
  var sel = $('#sortSelect');
  if (!sel) return;
  var opts = '';
  for (var i = 0; i < SORT_OPTIONS.length; i++) {
    var o = SORT_OPTIONS[i];
    opts += '<option value="' + o.key + '" ' + (state.sortBy === o.key ? 'selected' : '') + '>' + o.label + '</option>';
  }
  sel.innerHTML = opts;
  sel.onchange = function () { state.sortBy = sel.value; renderHome(); };
  var orderBtn = $('#sortOrderBtn');
  if (orderBtn) {
    orderBtn.onclick = function () {
      state.sortOrder = state.sortOrder === 'desc' ? 'asc' : 'desc';
      renderHome();
    };
  }
}

function getFilteredArticles() {
  var list = state.articles;
  if (state.filterCategory !== '全部') {
    list = list.filter(function (a) { return a.category === state.filterCategory; });
  }
  if (state.searchQuery.trim()) {
    var q = state.searchQuery.trim().toLowerCase();
    list = list.filter(function (a) {
      return a.title.toLowerCase().indexOf(q) !== -1 ||
        a.tags.some(function (t) { return t.toLowerCase().indexOf(q) !== -1; }) ||
        a.summary.toLowerCase().indexOf(q) !== -1;
    });
  }
  var sortBy = state.sortBy;
  var sortOrder = state.sortOrder;
  list = list.slice().sort(function (a, b) {
    var va, vb;
    if (sortBy === 'title') {
      va = a.title || '';
      vb = b.title || '';
      return sortOrder === 'asc' ? va.localeCompare(vb, 'zh') : vb.localeCompare(va, 'zh');
    }
    if (sortBy === 'rating') { va = a.rating || 0; vb = b.rating || 0; }
    if (sortBy === 'readTime') { va = a.readTime || 0; vb = b.readTime || 0; }
    if (sortBy === 'dateAdded') { va = a.dateAdded || ''; vb = b.dateAdded || ''; }
    return sortOrder === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  });
  return list;
}

function renderCategoryNav() {
  var nav = $('#categoryNav');
  if (!nav) return;
  var counts = {};
  state.articles.forEach(function (a) { counts[a.category] = (counts[a.category] || 0) + 1; });
  var cats = ['全部'].concat(Object.keys(CATEGORY_STYLES));
  var html = '';
  for (var i = 0; i < cats.length; i++) {
    var cat = cats[i];
    var count = cat === '全部' ? state.articles.length : (counts[cat] || 0);
    var active = cat === state.filterCategory ? 'active' : '';
    html += '<button class="cat-btn ' + active + '" data-category="' + cat + '">' + cat + ' (' + count + ')</button>';
  }
  nav.innerHTML = html;
  nav.addEventListener('click', function (e) {
    var btn = e.target.closest('.cat-btn');
    if (!btn) return;
    state.filterCategory = btn.dataset.category;
    renderHome();
  });
}

function renderCard(article) {
  var catStyle = CATEGORY_STYLES[article.category] || { color: '#666', bg: '#eee' };
  var statusLabel = article.starred ? '精读' : (STATUS_LABEL[article.status] || '未读');
  var statusCls = article.starred ? 'status-starred' : (STATUS_CLASS[article.status] || 'status-unread');
  var q = state.searchQuery.trim();
  var starredCls = article.starred ? ' card-starred' : '';

  var html = '';
  html += '<div class="card' + starredCls + '" data-id="' + article.id + '">';
  html +=   '<div class="card-header">';
  html +=     '<span class="card-badge" style="background:' + catStyle.bg + ';color:' + catStyle.color + '">' + escapeHtml(article.category) + '</span>';
  html +=     '<span class="card-date">' + article.dateAdded + '</span>';
  html +=   '</div>';
  if (article.starred) {
    html += '<div class="card-starred-badge">★ 精读</div>';
  }
  html +=   '<div class="card-title">' + highlightText(article.title, q) + '</div>';
  html +=   '<div class="card-summary">' + highlightText(article.summary, q) + '</div>';
  html +=   '<div class="card-tags">';
  for (var i = 0; i < article.tags.length; i++) {
    html += '<span class="card-tag" data-tag="' + escapeHtml(article.tags[i]) + '">#' + escapeHtml(article.tags[i]) + '</span>';
  }
  html +=   '</div>';
  html +=   '<div class="card-footer">';
  html +=     '<span>📌 ' + escapeHtml(article.source) + ' · ' + article.readTime + 'min</span>';
  html +=     '<span class="' + statusCls + '">● ' + statusLabel + '</span>';
  html +=   '</div>';
  html += '</div>';
  return html;
}

function bindCardClicks() {
  var cards = $$('.card');
  for (var i = 0; i < cards.length; i++) {
    (function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('.card-tag')) return;
        var article = state.articles.find(function (a) { return a.id === card.dataset.id; });
        if (article) renderDetail(article);
      });
    })(cards[i]);
  }
}

function bindTagClicks() {
  var tags = $$('.card-tag');
  for (var i = 0; i < tags.length; i++) {
    tags[i].addEventListener('click', function (e) {
      e.stopPropagation();
      var t = this.dataset.tag;
      if (!t) return;
      state.filterCategory = '全部';
      state.searchQuery = t;
      var input = document.getElementById('searchInput');
      if (input) input.value = t;
      renderHome();
    });
  }
}

function renderStats() {
  var bar = $('#statsBar');
  if (!bar) return;
  var total = state.articles.length;
  var unread = 0;
  var starred = 0;
  var cats = new Set();
  var tags = new Set();
  state.articles.forEach(function (a) {
    if (a.status === 'unread') unread++;
    if (a.starred) starred++;
    cats.add(a.category);
    a.tags.forEach(function (t) { tags.add(t); });
  });
  bar.innerHTML = '<span><strong>' + total + '</strong> 篇收藏</span>' +
    '<span><strong>' + unread + '</strong> 篇未读</span>' +
    '<span><strong>' + starred + '</strong> 篇精读</span>' +
    '<span><strong>' + cats.size + '</strong> 个分类</span>' +
    '<span><strong>' + tags.size + '</strong> 个标签</span>';
}

// --- 阅读进度条 ---
var progressBar = null;
function initProgressBar() {
  if (!progressBar) {
    progressBar = document.createElement('div');
    progressBar.className = 'reading-progress';
    document.body.insertBefore(progressBar, document.body.firstChild);
  }
  progressBar.style.width = '0%';
}

function updateProgress() {
  if (!progressBar) return;
  var scrollTop = window.scrollY;
  var docHeight = document.documentElement.scrollHeight - window.innerHeight;
  var pct = docHeight > 0 ? Math.min(scrollTop / docHeight * 100, 100) : 0;
  progressBar.style.width = pct + '%';
}

// --- 渲染详情页 ---
function renderDetail(article) {
  state.currentView = 'detail';
  state.currentArticle = article;
  window.history.pushState({ view: 'detail', id: article.id }, '', '#article-' + article.id);

  initProgressBar();
  updateProgress();

  var catStyle = CATEGORY_STYLES[article.category] || { color: '#666', bg: '#eee' };

  var paras = article.content.split('\n').filter(function (p) { return p.trim(); });
  var contentHtml = '';
  for (var i = 0; i < paras.length; i++) {
    contentHtml += '<p>' + escapeHtml(paras[i].trim()) + '</p>';
  }

  var extHtml = '';
  if (article.relatedLinks && article.relatedLinks.length > 0) {
    extHtml += '<div class="ai-section"><div class="section-label">🔗 拓展阅读</div><div class="ext-list">';
    for (var ei = 0; ei < article.relatedLinks.length; ei++) {
      var l = article.relatedLinks[ei];
      extHtml += '<div class="ext-item"><span>📄 ' + escapeHtml(l.title) + '</span><span class="type-tag">' + (l.type === 'internal' ? '站内' : '外部') + '</span></div>';
    }
    extHtml += '</div></div>';
  }

  // 上下篇
  var idx = -1;
  for (var si = 0; si < state.articles.length; si++) {
    if (state.articles[si].id === article.id) { idx = si; break; }
  }
  var prevArt = idx > 0 ? state.articles[idx - 1] : null;
  var nextArt = idx < state.articles.length - 1 ? state.articles[idx + 1] : null;
  var prevHtml = prevArt ? '<button class="prev-next-btn" data-id="' + prevArt.id + '">← ' + escapeHtml(prevArt.title) + '</button>' : '<div></div>';
  var nextHtml = nextArt ? '<button class="prev-next-btn next" data-id="' + nextArt.id + '">' + escapeHtml(nextArt.title) + ' →</button>' : '<div></div>';

  var fs = FONT_SIZES[state.fontSizeIndex];
  var fsStyle = 'font-size:' + Math.round(15 * fs.scale) + 'px;line-height:' + (1.8 / fs.scale).toFixed(1);

  var html = '';
  html += '<div class="detail-page">';
  html +=   '<button class="back-btn" id="backBtn">← 返回全部</button>';
  html +=   '<div class="detail-container" id="detailContainer">';

  // 元数据
  html += '<div class="detail-meta">';
  html +=   '<span style="color:' + catStyle.color + '">' + escapeHtml(article.category) + '</span>';
  html +=   '<span class="sep">·</span>';
  html +=   '<span>';
  for (var ti = 0; ti < article.tags.length; ti++) {
    html += (ti > 0 ? ' ' : '') + '#' + escapeHtml(article.tags[ti]);
  }
  html +=   '</span>';
  if (article.starred) {
    html += '<span class="sep">·</span><span style="color:#d4a030">★ 精读</span>';
  }
  html += '</div>';

  html += '<div class="detail-title">' + escapeHtml(article.title) + '</div>';

  html += '<div class="detail-sub">';
  html +=   '📌 ' + escapeHtml(article.source);
  if (article.author) html += ' · ' + escapeHtml(article.author);
  html += ' · 收藏于 ' + article.dateAdded + ' · ' + article.readTime + ' 分钟阅读';
  if (article.rating) {
    html += ' · ';
    for (var ri = 0; ri < 5; ri++) {
      html += ri < article.rating ? '★' : '☆';
    }
  }
  html += '</div>';

  // 字号
  html += '<div class="font-size-bar">';
  html +=   '<span class="font-size-label">字号</span>';
  for (var fi = 0; fi < FONT_SIZES.length; fi++) {
    html += '<button class="font-size-btn' + (fi === state.fontSizeIndex ? ' active' : '') + '" data-fs="' + fi + '">' + FONT_SIZES[fi].label + '</button>';
  }
  html += '</div>';

  html += '<div class="detail-content" style="' + fsStyle + '">' + contentHtml + '</div>';

  // 操作栏
  html += '<div class="detail-actions">';
  html +=   '<button class="btn btn-primary" onclick="copyFullText()">📋 复制全文</button>';
  html +=   '<button class="btn btn-secondary" onclick="window.open(\'' + escapeHtml(article.url) + '\',\'_blank\')">🔗 查看原文</button>';
  html +=   '<button class="btn btn-secondary" onclick="toggleStatus(\'' + article.id + '\')">';
  html +=     article.starred ? '☆ 取消精读' : (article.status === 'read' ? '○ 标记未读' : '✓ 标记已读');
  html +=   '</button>';
  html +=   '<button class="btn btn-danger" onclick="deleteArticle(\'' + article.id + '\')">🗑 删除</button>';
  html += '</div>';

  // AI 点评
  if (article.aiReview) {
    html += '<div class="ai-section">';
    html +=   '<div class="section-label">💡 AI 点评</div>';
    html +=   '<div class="ai-review">' + article.aiReview.replace(/\n/g, '<br>') + '</div>';
    html += '</div>';
  }

  html += extHtml;

  // 笔记
  html += '<div class="note-section">';
  html +=   '<div class="section-label">📝 我的笔记</div>';
  html +=   '<div class="note-box" contenteditable="true" id="noteBox" data-id="' + article.id + '">' + escapeHtml(article.notes || '') + '</div>';
  html += '</div>';

  // 上下篇
  html += '<div class="prev-next" id="prevNext">' + prevHtml + nextHtml + '</div>';

  html +=   '</div>'; // detail-container
  html += '</div>'; // detail-page

  $('#app').innerHTML = html;

  // 字号点击
  var fsBtns = document.querySelectorAll('.font-size-btn');
  for (var fbi = 0; fbi < fsBtns.length; fbi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        state.fontSizeIndex = parseInt(btn.dataset.fs);
        renderDetail(article);
      });
    })(fsBtns[fbi]);
  }

  // 笔记保存
  var nb = $('#noteBox');
  if (nb) {
    nb.addEventListener('blur', function () {
      var a = state.articles.find(function (x) { return x.id === nb.dataset.id; });
      if (a) {
        a.notes = nb.innerText.trim();
        a.updatedAt = new Date().toISOString().slice(0, 10);
        saveOverrides();
      }
    });
  }

  $('#backBtn').addEventListener('click', function () { renderHome(); });

  // 上下篇导航
  var pn = document.getElementById('prevNext');
  if (pn) {
    pn.addEventListener('click', function (e) {
      var btn = e.target.closest('.prev-next-btn');
      if (!btn) return;
      var a = state.articles.find(function (x) { return x.id === btn.dataset.id; });
      if (a) renderDetail(a);
    });
  }

  document.title = article.title + ' - 收藏库';
}

// --- 状态切换 ---
function toggleStatus(id) {
  var a = state.articles.find(function (x) { return x.id === id; });
  if (!a) return;
  if (a.starred) {
    a.starred = false;
    a.status = 'read';
  } else if (a.status === 'unread') {
    a.status = 'read';
  } else if (a.status === 'read') {
    a.starred = true;
  }
  saveOverrides();
  renderDetail(a);
  showToast('状态已更新');
}

function handleSearch(e) {
  state.searchQuery = e.target.value;
  renderHome();
}

window.addEventListener('popstate', function (e) {
  if (e.state && e.state.view === 'detail' && e.state.id) {
    var a = state.articles.find(function (x) { return x.id === e.state.id; });
    if (a) { renderDetail(a); return; }
  }
  renderHome();
});

// --- 滚动事件 ---
(function () {
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      requestAnimationFrame(function () {
        updateProgress();
        var btn = document.getElementById('topFloat');
        if (btn) btn.classList.toggle('show', window.scrollY > 300);
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

// --- 初始化 ---
(function () {
  document.addEventListener('input', function (e) {
    if (e.target.matches('#searchInput')) handleSearch(e);
  });
  loadData();
})();

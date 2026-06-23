/* ============================================
   个人内容收藏库 - 核心逻辑
   ============================================ */

// --- 分类配色映射 ---
var CATEGORY_STYLES = {
  'AI/技术':     { color: '#2a7a9a', bg: '#e8f4f8' },
  '投资/财经':   { color: '#5a7a2a', bg: '#f0f4e8' },
  '效率/工具':   { color: '#9a6a2a', bg: '#f8eee8' },
  '阅读/文化':   { color: '#6a4a9a', bg: '#f0eaf8' },
  '个人成长':    { color: '#9a4a6a', bg: '#f8eaf0' },
  '设计/创意':   { color: '#2a7a6a', bg: '#e8f4f0' },
  '生活/随笔':   { color: '#7a7a4a', bg: '#f4f4e8' },
  '资讯/热点':   { color: '#9a5a2a', bg: '#f8f0e8' }
};

var STATUS_LABEL = { unread: '未读', read: '已读' };
var STATUS_CLASS = { unread: 'status-unread', read: 'status-read' };

var SORT_OPTIONS = [
  { key: 'dateAdded', label: '最新' },
  { key: 'title', label: '标题' },
  { key: 'rating', label: '评分' },
  { key: 'readTime', label: '阅读时长' }
];

var FONT_SIZES = [
  { label: '小', scale: 0.9 },
  { label: '中', scale: 1 },
  { label: '大', scale: 1.15 }
];

// --- 状态 ---
var state = {
  articles: [],
  filterCategory: '全部',
  searchQuery: '',
  sortBy: 'dateAdded',
  sortOrder: 'desc',
  fontSizeIndex: 1,
  currentView: 'home',
  currentArticle: null,
  theme: 'light',
  articleSearchQuery: '',
  articleSearchResults: [],
  articleSearchCurrent: -1,
  tocVisible: false
};

var STORAGE_KEY = 'my-collection-overrides';
var DELETED_KEY = 'my-collection-deleted';
var THEME_KEY = 'my-collection-theme';
var LOCAL_KEY = 'my-collection-local';

var $ = function (s, p) { return (p || document).querySelector(s); };
var $$ = function (s, p) { return [].slice.call((p || document).querySelectorAll(s)); };

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

// --- Markdown 渲染 ---
function renderMarkdown(text) {
  var html = escapeHtml(text);
  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // *italic*
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // `code`
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  // ~~strikethrough~~
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
  return html;
}

function renderContentWithMD(text) {
  var lines = text.split('\n');
  var html = '';
  var inList = false;
  var listType = null;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) {
      if (inList) { html += '</' + listType + '>'; inList = false; listType = null; }
      continue;
    }
    // 标题 #
    var hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      if (inList) { html += '</' + listType + '>'; inList = false; listType = null; }
      var level = hMatch[1].length;
      var hText = hMatch[2];
      var hId = 'h-' + hText.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
      html += '<h' + level + ' id="' + hId + '">' + renderMarkdown(hText) + '</h' + level + '>';
      continue;
    }
    // 无序列表 -
    var ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (!inList || listType !== 'ul') {
        if (inList) { html += '</' + listType + '>'; }
        html += '<ul>'; inList = true; listType = 'ul';
      }
      html += '<li>' + renderMarkdown(ulMatch[1]) + '</li>';
      continue;
    }
    // 有序列表 1.
    var olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (!inList || listType !== 'ol') {
        if (inList) { html += '</' + listType + '>'; }
        html += '<ol>'; inList = true; listType = 'ol';
      }
      html += '<li>' + renderMarkdown(olMatch[1]) + '</li>';
      continue;
    }
    // 引用 >
    var bqMatch = line.match(/^>\s*(.+)/);
    if (bqMatch) {
      if (inList) { html += '</' + listType + '>'; inList = false; listType = null; }
      html += '<blockquote>' + renderMarkdown(bqMatch[1]) + '</blockquote>';
      continue;
    }
    // 表格
    if (line.startsWith('|')) {
      if (inList) { html += '</' + listType + '>'; inList = false; listType = null; }
      var tableHtml = '';
      var headerRow = parseTableRow(line);
      i++;
      // 跳过分隔行 | --- | --- |
      while (i < lines.length && lines[i].trim().match(/^\|[\s\-:]+\|/)) { i++; }
      var bodyRows = [];
      while (i < lines.length) {
        var nextLine = lines[i].trim();
        if (!nextLine || !nextLine.startsWith('|')) break;
        bodyRows.push(parseTableRow(nextLine));
        i++;
      }
      i--;
      if (headerRow) {
        tableHtml += '<table><thead><tr>';
        for (var ti = 0; ti < headerRow.length; ti++) {
          tableHtml += '<th>' + renderMarkdown(headerRow[ti].trim()) + '</th>';
        }
        tableHtml += '</tr></thead><tbody>';
        for (var ri = 0; ri < bodyRows.length; ri++) {
          tableHtml += '<tr>';
          for (var tj = 0; tj < bodyRows[ri].length; tj++) {
            tableHtml += '<td>' + renderMarkdown(bodyRows[ri][tj].trim()) + '</td>';
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table>';
      }
      html += tableHtml;
      continue;
    }
    // 普通段落
    if (inList) { html += '</' + listType + '>'; inList = false; listType = null; }
    html += '<p>' + renderMarkdown(line) + '</p>';
  }
  if (inList) { html += '</' + listType + '>'; }
  return html;
}

function parseTableRow(line) {
  var t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  var parts = [];
  t.split('|').forEach(function(s) { parts.push(s.trim()); });
  return parts;
}

// --- 获取 TOC 条目 ---
function extractTOC(content) {
  var lines = content.split('\n');
  var toc = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var hMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (hMatch) {
      toc.push({ level: hMatch[1].length, text: hMatch[2] });
    }
  }
  return toc;
}

// --- 复制全文 ---
function copyFullText() {
  if (!state.currentArticle) return;
  var text = state.currentArticle.content;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () {
      showToast('全文已复制到剪贴板');
    }).catch(function () {
      fallbackCopy(text);
    });
  } else {
    fallbackCopy(text);
  }
}

function fallbackCopy(text) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast('全文已复制到剪贴板');
  } catch (e) {
    showToast('复制失败，请手动选择复制');
  }
  document.body.removeChild(ta);
}

// --- 随机一篇 ---
function randomArticle() {
  var list = state.articles;
  if (!list.length) return showToast('还没有收藏文章');
  renderDetail(list[Math.floor(Math.random() * list.length)]);
}

// --- localStorage ---
function loadOverrides() {
  try { var raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
  catch (e) { return {}; }
}

function loadDeleted() {
  try { var raw = localStorage.getItem(DELETED_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}

function loadLocalArticles() {
  try { var raw = localStorage.getItem(LOCAL_KEY); return raw ? JSON.parse(raw) : []; }
  catch (e) { return []; }
}

function saveLocalArticles() {
  var locals = state.articles.filter(function (a) { return a._local; });
  localStorage.setItem(LOCAL_KEY, JSON.stringify(locals));
}

function saveOverrides() {
  var map = {};
  state.articles.forEach(function (a) {
    if (a._local) return;
    var now = new Date().toISOString().slice(0, 10);
    var ov = {};
    if (a.notes) ov.notes = a.notes;
    if (a.status !== 'unread') ov.status = a.status;
    if (a.starred) ov.starred = true;
    if (a.rating) ov.rating = a.rating;
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
      if (ov.rating !== undefined) a.rating = ov.rating;
      if (ov.updatedAt) a.updatedAt = ov.updatedAt;
    }
  });
  return articles;
}

function deleteArticle(id) {
  showConfirmModal('确定删除这篇文章吗？删除后不可恢复。', function () {
    var deleted = loadDeleted();
    if (deleted.indexOf(id) === -1) deleted.push(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(deleted));
    state.articles = state.articles.filter(function (a) { return a.id !== id; });
    showToast('已删除');
    renderHome();
  });
}

// --- 确认弹窗 ---
function showConfirmModal(desc, onConfirm) {
  var existing = document.querySelector('.modal-overlay');
  if (existing) existing.remove();
  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<div class="modal-icon">⚠</div>' +
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

// --- 添加文章弹窗 ---
function showAddArticleModal() {
  var cats = Object.keys(CATEGORY_STYLES);
  var catOpts = '';
  for (var ci = 0; ci < cats.length; ci++) {
    catOpts += '<option value="' + cats[ci] + '">' + cats[ci] + '</option>';
  }

  var overlay = document.createElement('div');
  overlay.className = 'modal-overlay add-article-modal';
  overlay.innerHTML =
    '<div class="modal-box">' +
      '<div class="modal-icon">📝</div>' +
      '<div class="modal-title">添加文章</div>' +
      '<div class="form-group">' +
        '<label class="form-label">文章标题 *</label>' +
        '<input type="text" id="addTitle" placeholder="输入文章标题">' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label class="form-label">分类 *</label>' +
          '<select id="addCategory">' + catOpts + '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">作者</label>' +
          '<input type="text" id="addAuthor" placeholder="作者名（可选）">' +
        '</div>' +
      '</div>' +
      '<div class="form-row">' +
        '<div class="form-group">' +
          '<label class="form-label">来源</label>' +
          '<input type="text" id="addSource" placeholder="来源网站（可选）">' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label">标签（逗号分隔）</label>' +
          '<input type="text" id="addTags" placeholder="标签1, 标签2">' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">原文链接</label>' +
        '<input type="url" id="addUrl" placeholder="https://...（可选）">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">正文内容 *</label>' +
        '<textarea id="addContent" placeholder="粘贴或输入文章正文..."></textarea>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">一句话摘要</label>' +
        '<input type="text" id="addSummary" placeholder="可选，不填则自动取正文前80字">' +
      '</div>' +
      '<div class="modal-actions">' +
        '<button class="modal-btn modal-btn-cancel" id="addCancel">取消</button>' +
        '<button class="modal-btn modal-btn-confirm" style="background:var(--text);color:white" id="addConfirm">添加</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);
  requestAnimationFrame(function () { overlay.classList.add('show'); });

  var close = function () {
    overlay.classList.remove('show');
    setTimeout(function () { overlay.remove(); }, 200);
  };

  overlay.querySelector('#addCancel').addEventListener('click', close);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) close();
  });

  overlay.querySelector('#addConfirm').addEventListener('click', function () {
    var title = document.getElementById('addTitle').value.trim();
    var category = document.getElementById('addCategory').value;
    var author = document.getElementById('addAuthor').value.trim();
    var source = document.getElementById('addSource').value.trim() || '手动添加';
    var tagsStr = document.getElementById('addTags').value.trim();
    var url = document.getElementById('addUrl').value.trim();
    var content = document.getElementById('addContent').value.trim();
    var summary = document.getElementById('addSummary').value.trim();

    if (!title) { showToast('请输入文章标题'); return; }
    if (!content) { showToast('请输入正文内容'); return; }

    var tags = tagsStr ? tagsStr.split(/[,，、]/).map(function (t) { return t.trim(); }).filter(function (t) { return t; }) : [];
    if (!summary) summary = content.replace(/[#*`\n]/g, ' ').slice(0, 80) + '…';

    // 估算阅读时长
    var charCount = content.length;
    var readTime = Math.max(1, Math.round(charCount / 500));

    var newArticle = {
      id: 'a-local-' + Date.now(),
      title: title,
      author: author,
      url: url || '#',
      content: content,
      summary: summary,
      category: category,
      tags: tags,
      source: source,
      sourceUrl: '',
      dateAdded: new Date().toISOString().slice(0, 10),
      readTime: readTime,
      readTimeMinutes: readTime,
      status: 'unread',
      rating: null,
      aiReview: '',
      relatedLinks: [],
      notes: '',
      starred: false,
      updatedAt: new Date().toISOString().slice(0, 10),
      _local: true
    };

    state.articles.push(newArticle);
    saveLocalArticles();
    close();
    showToast('已添加：《' + title + '》');
    renderHome();
  });
}

// --- 数据加载 ---
async function loadData() {
  try {
    var res = await fetch('data.json?' + Date.now());
    var data = await res.json();
    state.articles = applyOverrides(data.articles);
    // 合并本地添加的文章
    var locals = loadLocalArticles();
    locals.forEach(function (a) { a._local = true; });
    state.articles = state.articles.concat(locals);
    renderHome();
  } catch (e) {
    console.error('数据加载失败:', e);
    $('#app').innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>数据加载失败</h3><p style="margin-top:8px;color:#999">请确保 data.json 文件存在且格式正确</p></div>';
  }
}

// --- 暗色模式 ---
function initTheme() {
  var saved = localStorage.getItem(THEME_KEY);
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    state.theme = 'dark';
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    state.theme = 'light';
    document.documentElement.removeAttribute('data-theme');
  }
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  if (state.theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(THEME_KEY, state.theme);
  var btn = $('#themeToggleBtn');
  if (btn) btn.textContent = state.theme === 'dark' ? '☀️' : '🌙';
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
  html +=     '<div class="toolbar-extras">';
  html +=       '<button class="btn-icon" onclick="exportBackup()" title="导出备份">📦</button>';
  html +=       '<button class="btn-icon" onclick="document.getElementById(\'importInput\').click()" title="导入备份">📥</button>';
  html +=       '<input type="file" id="importInput" accept=".json" style="display:none" onchange="importBackup(event)">';
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

  // 恢复滚动位置
  var savedScroll = sessionStorage.getItem('home-scroll');
  if (savedScroll) {
    requestAnimationFrame(function () { window.scrollTo(0, parseInt(savedScroll)); });
    sessionStorage.removeItem('home-scroll');
  }
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
        a.summary.toLowerCase().indexOf(q) !== -1 ||
        (a.content && a.content.toLowerCase().indexOf(q) !== -1);
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
    if (sortBy === 'readTime') { va = a.readTimeMinutes || a.readTime || 0; vb = b.readTimeMinutes || b.readTime || 0; }
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
  var localTag = article._local ? ' 📝' : '';

  var html = '';
  html += '<div class="card' + starredCls + '" data-id="' + article.id + '">';
  html +=   '<div class="card-header">';
  html +=     '<span class="card-badge" style="background:' + catStyle.bg + ';color:' + catStyle.color + '">' + escapeHtml(article.category) + '</span>';
  html +=     '<span class="card-date">' + article.dateAdded + (article._local ? ' (本地)' : '') + '</span>';
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
  html +=     '<span>📌 ' + escapeHtml(article.source) + ' · ' + (article.readTimeMinutes || article.readTime || 0) + 'min</span>';
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
        if (article) {
          sessionStorage.setItem('home-scroll', window.scrollY);
          renderDetail(article);
        }
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

// --- 文章内搜索 ---
function searchInArticle(e) {
  var q = e.target.value;
  state.articleSearchQuery = q;
  var content = $('#detailContent');
  if (!content || !q.trim()) {
    state.articleSearchResults = [];
    state.articleSearchCurrent = -1;
    updateSearchNav();
    clearHighlights(content);
    return;
  }

  // 清除旧高亮
  clearHighlights(content);

  // 搜索并高亮
  var textNodes = [];
  var walker = document.createTreeWalker(content, 4, null, false);
  var node;
  while (node = walker.nextNode()) {
    if (node.parentNode.tagName !== 'SCRIPT' && node.parentNode.tagName !== 'STYLE') {
      textNodes.push(node);
    }
  }

  var regex = new RegExp(escapeRegex(q.trim()), 'gi');
  var matches = [];
  var totalLen = 0;

  for (var ni = 0; ni < textNodes.length; ni++) {
    var tn = textNodes[ni];
    var text = tn.textContent;
    var frag = document.createDocumentFragment();
    var lastIdx = 0;
    var match;
    var localMatches = 0;

    while ((match = regex.exec(text)) !== null) {
      var before = document.createTextNode(text.slice(lastIdx, match.index));
      if (before.textContent) frag.appendChild(before);
      var mark = document.createElement('mark');
      mark.textContent = match[0];
      mark.dataset.searchMatch = '';
      frag.appendChild(mark);
      lastIdx = regex.lastIndex;
      matches.push({ el: mark, index: totalLen + localMatches });
      localMatches++;
    }
    if (lastIdx < text.length) {
      frag.appendChild(document.createTextNode(text.slice(lastIdx)));
    }
    if (localMatches > 0) {
      tn.parentNode.replaceChild(frag, tn);
      // 跳过后面的文本节点
      while (localMatches > 0) {
        ni++;
        localMatches--;
      }
    }
    totalLen += localMatches;
  }

  state.articleSearchResults = matches;
  state.articleSearchCurrent = matches.length > 0 ? 0 : -1;
  updateSearchNav();
  scrollToSearchMatch();
}

function clearHighlights(container) {
  if (!container) return;
  var marks = container.querySelectorAll('mark[data-search-match]');
  for (var mi = marks.length - 1; mi >= 0; mi--) {
    var m = marks[mi];
    var parent = m.parentNode;
    var text = document.createTextNode(m.textContent);
    parent.replaceChild(text, m);
    parent.normalize();
  }
}

function updateSearchNav() {
  var countEl = $('#searchCount');
  var prevBtn = $('#searchPrevBtn');
  var nextBtn = $('#searchNextBtn');
  if (countEl) {
    countEl.textContent = state.articleSearchResults.length > 0 ?
      (state.articleSearchCurrent + 1) + '/' + state.articleSearchResults.length :
      (state.articleSearchQuery ? '0 条结果' : '');
  }
  if (prevBtn) prevBtn.disabled = state.articleSearchResults.length === 0;
  if (nextBtn) nextBtn.disabled = state.articleSearchResults.length === 0;
}

function scrollToSearchMatch() {
  var results = state.articleSearchResults;
  var idx = state.articleSearchCurrent;
  if (idx < 0 || idx >= results.length) return;
  results[idx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // 移除旧 active
  for (var i = 0; i < results.length; i++) {
    results[i].el.style.background = '#fff3b0';
  }
  results[idx].el.style.background = '#ffd700';
}

function searchNav(dir) {
  var results = state.articleSearchResults;
  if (results.length === 0) return;
  if (dir === 'prev') {
    state.articleSearchCurrent = (state.articleSearchCurrent - 1 + results.length) % results.length;
  } else {
    state.articleSearchCurrent = (state.articleSearchCurrent + 1) % results.length;
  }
  updateSearchNav();
  scrollToSearchMatch();
}

// --- 渲染详情页 ---
function renderDetail(article) {
  state.currentView = 'detail';
  state.currentArticle = article;
  window.history.pushState({ view: 'detail', id: article.id }, '', '#article-' + article.id);

  initProgressBar();
  updateProgress();

  state.articleSearchQuery = '';
  state.articleSearchResults = [];
  state.articleSearchCurrent = -1;

  var catStyle = CATEGORY_STYLES[article.category] || { color: '#666', bg: '#eee' };

  // 渲染正文（支持 MD）
  var contentHtml = renderContentWithMD(article.content);

  // TOC
  var toc = extractTOC(article.content);

  // 拓展阅读
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
  html += ' · 收藏于 ' + article.dateAdded + ' · ' + (article.readTimeMinutes || article.readTime || 0) + ' 分钟阅读';
  // 评分
  html += ' · <span class="rating-stars" id="ratingStars">';
  var displayRating = article.rating || 0;
  for (var ri = 0; ri < 5; ri++) {
    html += '<span class="star' + (ri < displayRating ? ' active' : '') + '" data-rating="' + (ri + 1) + '">★</span>';
  }
  html += '</span>';
  html += '</div>';

  // 字号
  html += '<div class="font-size-bar">';
  html +=   '<span class="font-size-label">字号</span>';
  for (var fi = 0; fi < FONT_SIZES.length; fi++) {
    html += '<button class="font-size-btn' + (fi === state.fontSizeIndex ? ' active' : '') + '" data-fs="' + fi + '">' + FONT_SIZES[fi].label + '</button>';
  }
  html += '</div>';

  // TOC 切换 & 文章内搜索
  if (toc.length > 0) {
    html += '<div class="toc-wrapper">';
    html +=   '<button class="toc-toggle-btn" id="tocToggleBtn">📑 目录 (' + toc.length + ')</button>';
    html += '</div>';
  }

  // 文章内搜索框
  html += '<div class="article-search-bar">';
  html +=   '<span>🔍</span>';
  html +=   '<input type="text" id="articleSearchInput" placeholder="搜索本文内容…" autocomplete="off">';
  html +=   '<span class="search-count" id="searchCount"></span>';
  html +=   '<span class="search-nav">';
  html +=     '<button class="search-nav-btn" id="searchPrevBtn" onclick="searchNav(\'prev\')" disabled>▲</button>';
  html +=     '<button class="search-nav-btn" id="searchNextBtn" onclick="searchNav(\'next\')" disabled>▼</button>';
  html +=   '</span>';
  html += '</div>';

  html += '<div id="detailContent" class="detail-content" style="' + fsStyle + '">' + contentHtml + '</div>';

  // 操作栏
  html += '<div class="detail-actions">';
  html +=   '<button class="btn btn-primary" onclick="copyFullText()">📋 复制全文</button>';
  if (article.url && article.url !== '#') {
    html += '<button class="btn btn-secondary" onclick="window.open(\'' + escapeHtml(article.url) + '\',\'_blank\')">🔗 查看原文</button>';
  }
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

  // TOC 侧边栏
  if (toc.length > 0) {
    html += '<div class="toc-sidebar" id="tocSidebar">';
    for (var tci = 0; tci < toc.length; tci++) {
      var t = toc[tci];
      var pad = (t.level - 1) * 12;
      var tid = 'h-' + t.text.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
      html += '<div class="toc-item" data-href="#' + tid + '" data-toc-idx="' + tci + '" style="padding-left:' + (8 + pad) + 'px">' + escapeHtml(t.text) + '</div>';
    }
    html += '</div>';
  }

  $('#app').innerHTML = html;

  // 绑定事件

  // 字号
  var fsBtns = document.querySelectorAll('.font-size-btn');
  for (var fbi = 0; fbi < fsBtns.length; fbi++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        state.fontSizeIndex = parseInt(btn.dataset.fs);
        renderDetail(article);
      });
    })(fsBtns[fbi]);
  }

  // 笔记
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

  // 返回
  $('#backBtn').addEventListener('click', function () { renderHome(); });

  // 上下篇
  var pn = document.getElementById('prevNext');
  if (pn) {
    pn.addEventListener('click', function (e) {
      var btn = e.target.closest('.prev-next-btn');
      if (!btn) return;
      var a = state.articles.find(function (x) { return x.id === btn.dataset.id; });
      if (a) renderDetail(a);
    });
  }

  // TOC 切换
  var tocBtn = document.getElementById('tocToggleBtn');
  var tocSidebar = document.getElementById('tocSidebar');
  if (tocBtn && tocSidebar) {
    tocBtn.addEventListener('click', function () {
      tocSidebar.classList.toggle('show');
    });
    // TOC 条目点击
    tocSidebar.addEventListener('click', function (e) {
      var item = e.target.closest('.toc-item');
      if (!item) return;
      var href = item.dataset.href;
      if (href) {
        var el = document.getElementById(href.slice(1));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      tocSidebar.classList.remove('show');
    });
  }

  // 文章内搜索
  var asInput = document.getElementById('articleSearchInput');
  if (asInput) {
    asInput.addEventListener('input', searchInArticle);
  }

  // 评分
  var ratingStars = document.getElementById('ratingStars');
  if (ratingStars) {
    ratingStars.addEventListener('click', function (e) {
      var star = e.target.closest('.star');
      if (!star) return;
      var r = parseInt(star.dataset.rating);
      article.rating = r;
      // 更新显示
      var stars = ratingStars.querySelectorAll('.star');
      for (var sri = 0; sri < stars.length; sri++) {
        stars[sri].className = sri < r ? 'star active' : 'star';
      }
      showToast('评分：' + r + '/5');
      saveOverrides();
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

// --- 搜索 ---
var searchTimer;
function handleSearch(e) {
  state.searchQuery = e.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(function () { renderHome(); }, 300);
}

// --- 键盘快捷键 ---
function initKeyboardShortcuts() {
  document.addEventListener('keydown', function (e) {
    // 不在输入框中才触发
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      // s 在输入框中也可以聚焦搜索
      if (e.key === 's' && !e.ctrlKey && !e.metaKey && tag === 'INPUT' && e.target.id !== 'searchInput') return;
      return;
    }

    if (state.currentView === 'detail') {
      if (e.key === 'Escape') { renderHome(); e.preventDefault(); }
      if (e.key === 'ArrowLeft' && !e.ctrlKey && !e.metaKey) {
        var prevBtn = document.querySelector('.prev-next-btn:not(.next)');
        if (prevBtn && prevBtn.dataset.id) {
          var a = state.articles.find(function (x) { return x.id === prevBtn.dataset.id; });
          if (a) renderDetail(a);
        }
        e.preventDefault();
      }
      if (e.key === 'ArrowRight' && !e.ctrlKey && !e.metaKey) {
        var nextBtn = document.querySelector('.prev-next-btn.next');
        if (nextBtn && nextBtn.dataset.id) {
          var a = state.articles.find(function (x) { return x.id === nextBtn.dataset.id; });
          if (a) renderDetail(a);
        }
        e.preventDefault();
      }
    }

    if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
      var searchInput = document.getElementById('searchInput');
      if (searchInput) { searchInput.focus(); e.preventDefault(); }
    }
  });
}

// --- 导出备份 ---
function exportBackup() {
  var overrides = loadOverrides();
  var deleted = loadDeleted();
  var localArticles = loadLocalArticles();

  var backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    articleCount: state.articles.length,
    overrides: overrides,
    deleted: deleted,
    localArticles: localArticles
  };

  var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'collection-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('备份已导出');
}

// --- 导入备份 ---
function importBackup(event) {
  var file = event.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.version) { showToast('无效的备份文件'); return; }
      if (data.overrides) localStorage.setItem(STORAGE_KEY, JSON.stringify(data.overrides));
      if (data.deleted) localStorage.setItem(DELETED_KEY, JSON.stringify(data.deleted));
      if (data.localArticles) localStorage.setItem(LOCAL_KEY, JSON.stringify(data.localArticles));
      showToast('备份已导入，刷新页面生效');
      setTimeout(function () { location.reload(); }, 1000);
    } catch (err) {
      showToast('备份导入失败：文件格式错误');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// --- 导航 ---
window.addEventListener('popstate', function (e) {
  if (e.state && e.state.view === 'detail' && e.state.id) {
    var a = state.articles.find(function (x) { return x.id === e.state.id; });
    if (a) { renderDetail(a); return; }
  }
  renderHome();
});

// --- 滚动 ---
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
  initTheme();
  initKeyboardShortcuts();
  document.addEventListener('input', function (e) {
    if (e.target.matches('#searchInput')) handleSearch(e);
  });
  loadData();
})();

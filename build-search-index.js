#!/usr/bin/env node
/* ============================================================
 * 构建全文检索索引 + 数据校验
 * 扫描 data.json + articles/*.md，生成 search-index.json
 * 供 app.js 的 ensureSearchIndex() 使用，实现跨正文的全文检索。
 *
 * 使用：node build-search-index.js
 * 校验失败（error）时退出码为 1；warning 仅提示不阻断。
 * 建议在新增/修改文章后运行一次，再提交（或部署前运行）。
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var root = __dirname;
var dataPath = path.join(root, 'data.json');
var articlesDir = path.join(root, 'articles');

// 与 app.js 的 CATEGORY_STYLES 保持一致（校验用白名单）
var VALID_CATEGORIES = ['AI/技术', '投资/财经', '效率/工具', '阅读/文化', '个人成长', '设计/创意', '生活/随笔', '资讯/热点', '健康/养生'];

if (!fs.existsSync(dataPath)) {
  console.error('未找到 data.json，请在项目根目录运行。');
  process.exit(1);
}

var raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
var articles = raw.articles || [];

var errors = [];
var warnings = [];

// --- 数据校验 ---
articles.forEach(function (a, idx) {
  var loc = '#' + idx + ' (' + (a.id || '无id') + ')';
  if (!a.id) errors.push(loc + '：缺少 id');
  if (!a.title) errors.push(loc + '：缺少 title');
  if (!a.dateAdded || !/^\d{4}-\d{2}-\d{2}$/.test(a.dateAdded)) errors.push(loc + '：dateAdded 格式应为 YYYY-MM-DD，实际「' + a.dateAdded + '」');
  if (a.category && VALID_CATEGORIES.indexOf(a.category) === -1) {
    errors.push(loc + '：分类「' + a.category + '」不在白名单，app.js 将显示为灰色且不进分类导航');
  }
  if (a.tags && !Array.isArray(a.tags)) warnings.push(loc + '：tags 应为数组');
  if (a.readTime !== undefined && a.readTimeMinutes !== undefined && a.readTime !== a.readTimeMinutes) {
    warnings.push(loc + '：readTime 与 readTimeMinutes 不一致');
  }
  var mdPath = path.join(articlesDir, a.id + '.md');
  var hasMd = fs.existsSync(mdPath);
  var hasContent = !!a.content;
  if (!hasMd && !hasContent) warnings.push(loc + '：无正文（既无 articles/' + a.id + '.md 也无内嵌 content）');
});

// 孤儿 md 检测
var mdFiles = fs.existsSync(articlesDir) ? fs.readdirSync(articlesDir).filter(function (f) { return f.endsWith('.md'); }) : [];
var idSet = {};
articles.forEach(function (a) { idSet[a.id] = true; });
mdFiles.forEach(function (f) {
  var id = f.slice(0, -3);
  if (!idSet[id]) warnings.push('孤儿文件：articles/' + f + ' 无对应 data 条目');
});

if (errors.length) {
  console.error('❌ 校验失败 ' + errors.length + ' 项：');
  errors.forEach(function (e) { console.error('  ✗ ' + e); });
  process.exit(1);
}
if (warnings.length) {
  console.warn('⚠️ 警告 ' + warnings.length + ' 项：');
  warnings.forEach(function (w) { console.warn('  ! ' + w); });
}

// --- 生成索引 ---
var withContent = 0;
var items = articles.map(function (a) {
  var content = '';
  var mdPath = path.join(articlesDir, a.id + '.md');
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf8');
  } else if (a.content) {
    content = a.content;
  }
  // 受保护文章：正文不入索引（正文文件仍公开，但索引不再承载全文）
  if (a.protected) content = '';
  if (content) withContent++;

  return {
    id: a.id,
    title: a.title || '',
    author: a.author || '',
    category: a.category || '',
    tags: a.tags || [],
    summary: a.summary || '',
    content: content
  };
});

var out = {
  generatedAt: new Date().toISOString(),
  count: items.length,
  items: items
};

fs.writeFileSync(path.join(root, 'search-index.json'), JSON.stringify(out), 'utf8');
console.log('✅ search-index.json 已生成：共 ' + items.length + ' 篇，其中含正文 ' + withContent + ' 篇。');

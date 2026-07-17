#!/usr/bin/env node
/* ============================================================
 * 构建全文检索索引
 * 扫描 data.json + articles/*.md，生成 search-index.json
 * 供 app.js 的 ensureSearchIndex() 使用，实现跨正文的全文检索。
 *
 * 使用：node build-search-index.js
 * 建议在新增/修改文章后运行一次，再提交（或部署前运行）。
 * ============================================================ */
'use strict';

var fs = require('fs');
var path = require('path');

var root = __dirname;
var dataPath = path.join(root, 'data.json');
var articlesDir = path.join(root, 'articles');

if (!fs.existsSync(dataPath)) {
  console.error('未找到 data.json，请在项目根目录运行。');
  process.exit(1);
}

var raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
var articles = raw.articles || [];

var withContent = 0;
var items = articles.map(function (a) {
  var content = '';
  var mdPath = path.join(articlesDir, a.id + '.md');
  if (fs.existsSync(mdPath)) {
    content = fs.readFileSync(mdPath, 'utf8');
  } else if (a.content) {
    content = a.content;
  }
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

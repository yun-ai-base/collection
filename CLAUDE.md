# collection — 个人内容收藏库

## 项目概述
个人内容收藏库，支持分类/搜索/排序/主题/阅读模式/PWA 离线支持/批量选择/文章编辑/稍后读筛选/删除撤销。

## 访问入口
直接打开 `index.html`（纯前端，无需服务器）

## 关键文件
| 文件 | 说明 |
|---|---|
| `index.html` | 主页面（壳，含首帧主题内联脚本防闪白） |
| `app.js` | 核心逻辑（~2300 行，分类/搜索/状态管理/编辑/撤销） |
| `style.css` | 样式（含暗色 916 行覆盖） |
| `data.json` | 收藏数据（40 篇） |
| `search-index.json` | 搜索索引（由 build 脚本生成） |
| `build-search-index.js` | 索引构建 + 数据校验（error 时退出码 1） |
| `sw.js` | PWA Service Worker（离线支持，CACHE=collection-v2） |
| `articles/` | 40 篇 md 文章 |
| `images/` | 图片资源 |
| `_archive/` | 归档的临时文件（勿删） |

## 核心逻辑要点（app.js）
- `CATEGORY_STYLES` + `CATEGORY_STYLES_DARK`：9 个分类的浅色/暗色配色；渲染统一走 `getCatStyle(cat)`（按 state.theme 自动选）
- `state` 对象管理全局状态（筛选/排序/主题/视图模式/分页/readLaterOnly）
- localStorage 键：`my-collection-overrides` / `my-collection-deleted` / `my-collection-theme` / `my-collection-local` / `my-collection-readlater` / `my-collection-content-<id>`（编辑过的正文覆盖，优先级高于 md 文件）
- 路由支持 hash query：`#/home?cat=投资/财经&q=关键词&mode=readlater`（筛选可分享/直达）
- 删除走「撤销 Toast」：`my-collection-deleted` + showUndoToast
- 受保护文章：卡片显示 🔒（card-lock-badge），口令 `PROTECTED_PASS`（atob 解码，界面层防护，非真加密）；其正文不进入 search-index

## 安全约定（2026-08-02 起强制）
- 所有动态数据拼 HTML 前必须 `escapeHtml()`（aiReview 是曾经的漏网点，已修复）
- 所有链接/图片 URL 必须过 `sanitizeUrl()`（只放行 http/https/mailto/tel）
- Markdown 渲染器支持：图片(懒加载)、[链接](url "title")、加粗、斜体、行内代码、删除线、标题、列表、引用、表格
- 新增分类必须同时维护：CATEGORY_STYLES + CATEGORY_STYLES_DARK + build-search-index.js 的 VALID_CATEGORIES

## 开发约定
- 纯前端，无 package.json
- 新增/修改文章后运行 `node build-search-index.js`（会自动校验数据一致性，error 退出码 1，warning 不阻断）
- 单元测试：`node D:\workbuddy\test-app-core.js`（36 项，Mock DOM 跑核心函数）
- 上传 GitHub 后需推送（线上走 Pages）；一次性集成 push，避免连发触发 Pages 部署陷阱

## 内容备注
- 美股指南系列 12 篇（a-usstock-01~12）2026-08-02 已入库，作者 zoudaoxingchen，分类「投资/财经」，正文在 articles/，根目录原 us_stock_*.md 为源文件可留可删
- 根目录临时文件已归档至 `_archive/`（article_content_doc.txt / tmp_article.txt / zhihu_content.txt / us_stock_full.txt）

## 相关记忆
- 个人收藏库工作流：见全局记忆 `reference_collection_workflow`

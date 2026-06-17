# 孤舟月博客后端支撑方案

## 1. 现状结论

当前项目是一个 Vite + React 单页博客应用，前端已经包含完整的公开站点和管理台雏形：

- 公开站点：首页、文章列表、札记分类、归档、文章详情、站内搜索、评论面板。
- 管理台：文章创建/编辑/删除、札记分类、专题、归档查看、首页文案、外观设置。
- 文章编辑：使用 Markdown 作为 Article Body Source，支持所见即所得、源码、分栏预览、表格、代码块、数学公式。
- 数据持久化：`SiteContent`、`SiteSettings`、编辑草稿、评论都保存在浏览器 `localStorage`。

这意味着现在的问题不是缺页面，而是缺服务端事实来源。只要换浏览器、清缓存、多人协作或正式部署，文章、设置、评论和草稿都会失去可信持久化。

## 2. 后端目标

第一版后端应该把现有前端能力从“本机浏览器状态”迁移到“可运营的站点状态”，并尽量不重写前端体验。

核心目标：

1. 让 Article、Note Section、Featured Series、Homepage Copy、Site Settings 成为服务端数据。
2. 让 Post Composer 可以保存服务端草稿、发布、更新、删除文章。
3. 让公开站点可以从 API 获取文章列表、文章详情、归档、分类、专题和站点设置。
4. 让评论从本地存储迁移到服务端，并预留审核能力。
5. 生成 RSS、sitemap、robots 和文章级 SEO 所需数据。
6. 给管理台加最小可用登录保护，避免任何访客都能改内容。

非目标：

- 第一版不做多作者复杂权限系统。
- 第一版不做富文本 HTML 存储，继续以 Markdown 为 Article Body Source。
- 第一版不引入复杂 CMS 工作流，先满足个人博客运营。

## 3. 推荐技术形态

### 3.1 服务端

当前后端已切换为轻量 Python 后端：

- Runtime：Python。
- Web 框架：FastAPI。
- 数据库：SQLite 起步，后续可迁移 PostgreSQL。
- 数据访问：当前使用标准库 `sqlite3` 和幂等 schema 初始化；后续模型复杂后可引入 SQLAlchemy/Alembic。
- 鉴权：管理员账号 + session cookie，第一版不需要开放注册。
- 部署：前端静态资源由 Vite 构建，后端同时提供 `/api/*` 和静态文件托管，或前后端分开部署。

选择 SQLite 的原因：这是个人博客，读多写少，部署和备份成本低。只要模型设计不绑定 SQLite 特性，后续迁移 PostgreSQL 不难。

选择 Python 的原因：后续知识图谱、实体抽取、Embedding、检索、文本分块和 Agent 工作流会更多依赖 Python 生态，避免继续通过 Node 子进程拼接智能能力。

### 3.2 前端改造方式

新增一个 `src/apiClient.ts`，把现有 `readSiteContent` / `saveSiteContent` / `readSiteSettings` / `saveSiteSettings` 的直接本地存储调用，逐步替换为 API 调用。

迁移期间保留默认内容作为降级数据：

- API 成功：使用服务端数据。
- API 失败：只读展示默认内容，并在管理台显示错误状态。
- 编辑草稿：服务端草稿为主，本地草稿作为断网恢复缓存。

## 4. 领域模型

### 4.1 Article

对应当前 `Post`，但需要补齐发布状态和 SEO 字段。

字段建议：

- `id`: 稳定主键。
- `slug`: 公开 URL 标识，唯一。
- `title`: 标题。
- `excerpt`: 摘要。
- `categoryId`: 所属 Note Section。
- `status`: `draft | published | archived`。
- `publishedAt`: 发布时间。
- `createdAt`: 创建时间。
- `updatedAt`: 更新时间。
- `tone`: 视觉语气，对应当前 `tone-*` 样式。
- `tags`: 标签数组或关联表。
- `bodyMarkdown`: Article Body Source，唯一正文事实来源。
- `seoTitle`: 可选，默认用标题。
- `seoDescription`: 可选，默认用摘要。
- `coverImage`: 可选，后续用于分享图。

兼容说明：

- 当前 `date` 是字符串，例如 `2026.05.15` 或 `2026.05.21 14:30`。后端应保存 ISO 时间，返回给前端时可以同时提供 `publishedAt` 和格式化后的 `dateLabel`。
- 当前 `body` 数组只应作为旧数据迁移来源，后续不再作为主字段。

### 4.2 Note Section

对应当前 `NoteSection`。

字段建议：

- `id`
- `name`
- `slug`
- `description`
- `sortOrder`
- `createdAt`
- `updatedAt`

注意：现有代码用 `category` 文本作为关联键。后端应改为 `categoryId` 关联，API 可以额外返回 `category` 文本，减少前端一次性改动。

### 4.3 Featured Series

对应当前 `FeaturedSeries`。

字段建议：

- `id`
- `title`
- `lead`
- `body`
- `sortOrder`
- `items`: 关联 Article，包含文章排序。
- `createdAt`
- `updatedAt`

### 4.4 Site Settings

对应当前 `SiteSettings`。

字段建议：

- `id`: 固定单例，例如 `site`。
- `stylePreset`: `classic | cyber`。
- `colorScheme`: `light | dark`。
- `updatedAt`

### 4.5 Homepage Copy

对应当前 `HomepageCopy`，可以作为单例配置表保存。

字段建议：

- `id`: 固定单例，例如 `homepage`。
- `siteName`
- `siteTagline`
- `heroTitle`
- `heroSubtitle`
- `primaryCta`
- `secondaryCta`
- `seasonTitle`
- `seasonText`
- `latestEyebrow`
- `latestTitle`
- `topicsEyebrow`
- `topicsTitle`
- `seriesEyebrow`
- `seriesTitle`
- `seriesLead`
- `seriesBody`
- `archiveEyebrow`
- `archiveTitle`
- `aboutEyebrow`
- `aboutTitle`
- `aboutBody`
- `footerSlogan`
- `updatedAt`

### 4.6 Comment

对应当前 `CommentItem`，补齐审核和来源信息。

字段建议：

- `id`
- `articleId`
- `authorName`
- `content`
- `status`: `pending | approved | rejected`
- `ipHash`: 可选，用于限流和追踪，不直接保存明文 IP。
- `userAgent`: 可选。
- `createdAt`
- `updatedAt`

第一版建议默认 `pending`，管理台审核通过后公开显示。若希望体验更轻，可以设置站点开关控制是否自动通过。

### 4.7 Composer Draft

对应当前 `ComposerDraft`。

字段建议：

- `id`
- `articleId`: 可空，新文章草稿为空。
- `ownerId`
- `title`
- `slug`
- `categoryId`
- `publishedAt`
- `tone`
- `excerpt`
- `tags`
- `bodyMarkdown`
- `composerMode`
- `savedAt`

说明：服务端草稿主要解决跨设备和刷新恢复。本地草稿仍可保留 700ms 自动保存能力，作为 API 失败时的临时缓存。

## 5. API 设计

### 5.1 公开 API

`GET /api/site`

返回公开站点首屏所需数据：

- `settings`
- `homepage`
- `noteSections`
- `featuredSeries`

`GET /api/articles`

查询文章列表。

参数：

- `page`
- `pageSize`
- `category`
- `tag`
- `q`
- `status` 仅管理员可用，公开侧固定为 `published`

返回：

- `items`
- `page`
- `pageSize`
- `pageCount`
- `total`

`GET /api/articles/:slug`

返回文章详情、相邻文章、公开评论数。

`GET /api/archive`

按月份返回已发布文章分组。

`GET /api/search?q=关键词`

第一版可直接查数据库标题、摘要、正文、分类、标签。文章量变大后再加全文索引。

`GET /rss.xml`

生成 RSS。

`GET /sitemap.xml`

生成 sitemap。

`GET /robots.txt`

返回 robots。

### 5.2 评论 API

`GET /api/articles/:slug/comments`

只返回 `approved` 评论。

`POST /api/articles/:slug/comments`

创建评论。

请求体：

- `authorName`
- `content`

服务端规则：

- 内容去首尾空白。
- 限制长度，例如昵称 1-40 字，内容 1-1000 字。
- 基于 IP 或 cookie 做简单限流。
- 默认状态按站点设置决定，建议第一版为 `pending`。

### 5.3 管理 API

所有 `/api/admin/*` 都需要管理员登录。

`POST /api/admin/login`

管理员登录，设置 httpOnly session cookie。

`POST /api/admin/logout`

退出登录。

`GET /api/admin/me`

返回当前管理员状态。

`GET /api/admin/content`

返回管理台完整内容，替代当前 `readSiteContent()`。

`PUT /api/admin/settings`

保存 Site Settings。

`PUT /api/admin/homepage`

保存 Homepage Copy。

`POST /api/admin/articles`

创建文章。

`PUT /api/admin/articles/:id`

更新文章。

`DELETE /api/admin/articles/:id`

删除文章。建议第一版做软删除或 `archived`，避免误删。

`POST /api/admin/articles/:id/publish`

发布文章。

`POST /api/admin/articles/:id/unpublish`

撤回文章。

`PUT /api/admin/note-sections`

批量保存分类和排序。当前前端分类编辑是即时保存，API 可以先用批量覆盖模型，前端每次变更后 debounce 调用。

`PUT /api/admin/featured-series`

批量保存专题和文章排序。

`GET /api/admin/comments?status=pending`

评论审核列表。

`PUT /api/admin/comments/:id`

更新评论状态。

`GET /api/admin/drafts/:draftKey`

读取草稿。

`PUT /api/admin/drafts/:draftKey`

保存草稿。

`DELETE /api/admin/drafts/:draftKey`

清除草稿。

## 6. 前端接入改造

### 6.1 新增 API 层

新增 `src/apiClient.ts`，统一处理：

- JSON 请求。
- UTF-8 内容类型。
- cookie 鉴权。
- 错误提示结构。
- 公开 API 和管理 API 分组。

建议所有写请求都带：

```http
Content-Type: application/json; charset=utf-8
```

### 6.2 替换 SiteContent 读写

当前入口：

- `readSiteContent()`
- `saveSiteContent(content)`
- `resetSiteContent()`

改造为：

- 应用启动时请求 `GET /api/site` + `GET /api/articles`。
- 管理台启动时请求 `GET /api/admin/content`。
- 管理台变更时调用对应管理 API。
- `defaultSiteContent` 保留为首次初始化 seed 和 API 失败降级。

### 6.3 替换 SiteSettings 读写

当前入口：

- `readSiteSettings()`
- `saveSiteSettings(settings)`

改造为：

- 公开站点从 `GET /api/site` 获取 settings。
- 管理台外观设置调用 `PUT /api/admin/settings`。
- `applySiteSettings(settings)` 保持前端职责不变。

### 6.4 替换评论读写

当前入口：

- `readPostComments(slug)`
- `savePostComments(slug, comments)`

改造为：

- 文章页展开评论时调用 `GET /api/articles/:slug/comments`。
- 提交评论调用 `POST /api/articles/:slug/comments`。
- 提交后如果进入审核，显示“评论已提交，审核后展示”。

### 6.5 替换草稿保存

当前入口：

- `readComposerDraft(key)`
- `writeComposerDraft(key, draft)`
- `clearComposerDraft(key)`

改造为：

- 仍保留本地草稿工具，但改名为 local fallback。
- 自动保存时先调用 `PUT /api/admin/drafts/:draftKey`。
- API 失败时写本地草稿，并在编辑器顶部显示“已临时保存到本机”。
- 发布成功后同时清除服务端草稿和本地草稿。

## 7. 数据迁移

第一版后端上线时需要 seed 当前默认内容：

1. 从 `src/posts.ts` 导入现有文章。
2. 从 `src/contentStore.ts` 导入默认 Note Section、Featured Series、Homepage Copy。
3. 从 `src/siteSettings.ts` 导入默认 Site Settings。
4. 把 `Post.date` 统一转换成 ISO 时间。
5. 把 `Post.category` 映射到 Note Section。
6. 把 `Post.bodyMarkdown || body.join('\n\n')` 写入 `bodyMarkdown`。

建议新增脚本：

- `server_py/seed.py`
- `server_py/seed_test_articles.py`
- `server_py/backup_db.py`

备份策略：

- SQLite 数据库每日复制一份到 `backups/`。
- 每次管理台发布或删除文章前写一条内容快照。

## 8. 实施阶段

### 阶段一：服务端骨架和只读公开数据

目标：公开站点从 API 读取数据。

任务：

1. 新增 `server_py/`。
2. 配置 FastAPI、SQLite。
3. 建立 Article、Note Section、Featured Series、Site Settings、Homepage Copy 模型。
4. 编写 seed，把当前默认内容写入数据库。
5. 实现 `GET /api/site`、`GET /api/articles`、`GET /api/articles/:slug`、`GET /api/archive`。
6. 前端新增 `apiClient`，公开站点改为 API 获取。

验收：

- 清空浏览器 localStorage 后，公开站点仍有文章和设置。
- 首页、文章列表、文章详情、归档可正常访问。
- `npm run build` 通过。

### 阶段二：管理台写入服务端

目标：文章、分类、专题、首页文案、外观设置都能保存到数据库。

任务：

1. 实现管理员登录。
2. 实现 `/api/admin/content`。
3. 实现文章创建、更新、删除、发布状态。
4. 实现分类、专题、首页文案、外观设置保存。
5. 前端管理台把 `onContentChange` 和 `onSettingsChange` 接到 API。
6. 增加保存中、保存成功、保存失败状态。

验收：

- 换浏览器或重启服务后，管理台改动仍存在。
- 未登录访问 `/admin` 会进入登录页。
- 文章 slug 冲突由服务端兜底处理。

### 阶段三：评论、草稿和搜索

目标：读者互动和编辑恢复不再依赖本地。

任务：

1. 实现评论提交、公开读取、管理审核。
2. 实现服务端草稿保存和恢复。
3. 实现搜索 API。
4. 前端替换评论、草稿和搜索数据来源。

验收：

- 评论刷新后仍存在，并按审核状态展示。
- 新文章草稿跨刷新、跨浏览器可恢复。
- 搜索能匹配标题、摘要、正文、分类和标签。

### 阶段四：SEO 和发布产物

目标：博客具备正式收录能力。

任务：

1. 生成 `rss.xml`。
2. 生成 `sitemap.xml`。
3. 生成 `robots.txt`。
4. 前端按文章更新 title、description、canonical、Open Graph。
5. 给 Article 增加结构化数据 JSON-LD。

验收：

- `/rss.xml`、`/sitemap.xml`、`/robots.txt` 可访问。
- 每篇文章详情页有独立 SEO 信息。
- 公开 API 不暴露草稿文章。

## 9. 风险和约束

### 9.1 SPA 路由和 SEO

当前是 Vite SPA，文章详情页由浏览器渲染。即使有 API，SEO 仍受限。短期可以用动态 meta 和 sitemap 先补齐基本能力；如果更重视收录，后续应考虑 SSR、SSG 或预渲染。

### 9.2 即时保存造成接口压力

当前管理台很多编辑是输入即保存。本地存储没有成本，但服务端需要 debounce、保存状态和失败重试。建议文案、分类、专题设置使用 500-1000ms debounce，文章正文草稿使用 700ms 自动保存。

### 9.3 Slug 和分类重命名

当前分类是文本关联。后端必须用 ID 关联，否则分类改名会导致文章丢分类。API 返回时可以保留 `category` 字段兼容现有 UI。

### 9.4 Markdown 安全

ADR 已明确不启用 raw HTML。后端也应把 `bodyMarkdown` 当作 Markdown 源保存，不接受或渲染未清洗 HTML。前端继续使用 `react-markdown`，不要打开不受控 HTML。

### 9.5 UTF-8

项目包含大量中文内容。所有文件、HTTP 响应、数据库连接和导入导出脚本必须使用 UTF-8。

要求：

- 源码文件保存为 UTF-8。
- JSON 响应设置 `application/json; charset=utf-8`。
- RSS 和 sitemap 设置 UTF-8 XML 声明。
- seed、backup、export 脚本显式使用 UTF-8 读写。

## 10. 建议的目录结构

```text
server_py/
  app.py
  config.py
  db.py
  content.py
  ai_agent.py
  almanac.py
  admin_commands.py
  seed.py
  seed_test_articles.py
  smoke_test.py
```

前端建议新增：

```text
src/
  apiClient.ts
  hooks/
    useSiteData.ts
    useAdminContent.ts
  localFallbackStore.ts
```

## 11. 第一批可拆任务

建议按以下顺序进入编码：

1. 新增后端项目骨架和数据库模型。
2. 编写 seed，把当前默认内容落库。
3. 实现公开只读 API。
4. 前端公开站点接入 API，保留默认内容降级。
5. 实现管理员登录和 `/api/admin/content`。
6. 文章创建/编辑/删除接入后端。
7. 分类、专题、首页文案、外观设置接入后端。
8. 评论和草稿接入后端。
9. RSS、sitemap、robots 和文章 SEO。

这样可以先把最关键的事实来源迁到服务端，再逐步替换本地存储，不需要一次性重写整个前端。

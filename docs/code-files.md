# 代码文件功能说明

本文档简单梳理 Guzhouyue Blog 项目中每个代码文件的职责，便于快速定位。

项目总体：React 19 + TypeScript + Vite 前端，FastAPI + SQLite 后端，包含公开博客、管理后台、相册、评论审核、RSS/sitemap，以及把已发布文章片段和关系可视化的 Starfield Knowledge Map。

## 前端源码（src/）

| 文件 | 功能 |
| --- | --- |
| `main.tsx` | React 入口，挂载 `App` 到 `#root`，加载全局样式。 |
| `App.tsx` | 应用主组件（约 7600 行）。负责路由分发、首页/文章列表/文章详情/归档/图库/星图公开页渲染，以及管理员登录、文章编辑器、各管理面板（文章、标签、图库、专题、首页文案、外观、LLM、指令、星图、评论、回收站）的视图与状态。 |
| `routing.ts` | 公开路由的路径解析。把 `pathname` 映射到 `home/posts/notes/archive/gallery/starfield/post/not-found`，并提供 `isAdminPath` 判断。 |
| `apiClient.ts` | 后端 API 客户端。封装 fetch、CSRF 头、cookie 处理、错误类型，以及所有公开/管理端接口的请求函数和响应归一化函数。 |
| `posts.ts` | 文章数据模型。定义 `Post`/`PostStatus` 类型，内置初始文章数据（约 2800 行的内嵌 markdown 文章），并导出 `postsPerPage`、`archive` 分组、`getPostBySlug`、`getAdjacentPosts` 等查询函数。 |
| `contentStore.ts` | 站点内容的类型与本地存储层。定义 `SiteContent`、`HomepageCopy`、`NoteSection`、`FeaturedSeries`、`GalleryAlbum`、`GalleryImage`、`AlmanacInfo`，并提供默认值、localStorage 持久化和数据归一化（含系统图库兜底）。 |
| `siteSettings.ts` | 站点设置（风格 `classic`/`cyber`、明暗配色、作者信息）的 类型、默认值、localStorage 读写，以及应用到 `<html>` 的 `data-*` 属性。 |
| `articleSeo.ts` | `useArticleHead` Hook：在文章详情页设置 `<title>`、description、Open Graph、Twitter Card、canonical 链接和 BlogPosting JSON-LD。 |
| `seasonNote.ts` | 根据当前日期推算二十四节气，生成首页"今日小记"的标题和宜忌文案。 |
| `ArticleComments.tsx` | 文章评论区组件。从 API 拉取已审核评论、提交新评论，失败时回退到 localStorage；展开/收起评论列表。 |
| `MarkdownBody.tsx` | Markdown 正文渲染器。基于 `react-markdown`，启用 GFM、KaTeX 数学公式、`rehype-highlight` 代码高亮，并把章节标题和段落锚点暴露给星图跳转。 |
| `PublicGalleryPage.tsx` | 公开图库页。展示公开相册列表，分页拉取相册图片，提供灯箱切换上一张/下一张。系统图库不会出现在公开列表中。 |
| `StarfieldPage.tsx` | 公开星图页。使用 Three.js 把 passages 渲染成星点、把 relationships 渲染成连线，支持聚焦星点、相邻星高亮、深层路径展示、相机飞行定位。 |
| `RichMarkdownEditor.tsx` | 富文本/Markdown 编辑器。基于 MDXEditor，扩展工具栏、代码块、表格、链接、图片插入，以及 KaTeX 行内/块级公式节点。被 `App.tsx` 懒加载。 |
| `AdminDashboardPanel.tsx` | 管理总览面板。展示文章/专题/图库/归档/待办统计，拉取 `/api/admin/ops` 健康度，提供快速跳转到各子面板的卡片。 |
| `AdminPostsPanel.tsx` | 文章管理面板。搜索、按分类/状态筛选、批量发布/取消/归档/移动分类/同步、分页和滚动位置恢复。 |
| `AdminTagsPanel.tsx` | 标签管理面板。展示标签使用统计，支持删除标签和把源标签合并到目标标签。 |
| `AdminCommandPanel.tsx` | 管理员指令通道面板。展示已注册指令、解析输入、运行（含 dry-run），以及把自然语言转成指令的 AI 入口。 |
| `AdminStarfieldPanel.tsx` | 星图管理面板（生成、审核、任务）。新建/增量版本、按选文章生成 passages、生成 relationships、生成 deep paths，批量或单条接受/隐藏，发布/归档/删除版本。 |
| `styles.css` | 全局样式（约 9100 行）。包含 CSS 变量、`classic`/`cyber` 双风格、亮/暗双配色、各公开页与管理面板的具体样式。 |

## 后端源码（server_py/）

| 文件 | 功能 |
| --- | --- |
| `__init__.py` | 包标识文件，标注 Python 后端模块根。 |
| `config.py` | 配置加载。从 `server/config.json` 读取，并用环境变量覆盖；强制生产环境必须改默认管理员密码。返回不可变 `Config` 对象（端口、数据库路径、上传目录、CORS、cookie、almanac 超时等）。 |
| `db.py` | SQLite 连接管理。打开 WAL 模式、提供 `get_db` 上下文与 `now_iso`/`json_parse` 辅助，执行 `SCHEMA_SQL` 建表和补列（articles、note_sections、featured_series、gallery、comments、composer_drafts、starfield_*、llm_*、admin_audit_log 等）。 |
| `app.py` | FastAPI 应用入口（约 1150 行，76 条路由）。挂载 CORS、安全响应头、CSRF、管理员会话、限流、审计日志中间件，公开端点（site/articles/article detail/archive/search/gallery/starfield/comments/rss/sitemap/robots），管理端点（文章 CRUD、标签、图库上传、首页、note sections、专题、评论审核、回收站、LLM 配置与 token usage、AI 元数据、星图生成与发布、指令解析运行、草稿、运维总览）。 |
| `content.py` | 内容数据层（约 960 行）。`slugify`、`parse_date_label`、`make_id` 等工具；文章、栏目、专题、首页、相册、图片、评论、标签、回收站的查询与变更；LLM 配置和 token usage 汇总记录。 |
| `starfield.py` | 星图业务层（约 2120 行）。版本（含增量父子版本）创建与发布/归档，passage/canonical keyword/relationship/deep path 生成与审核，任务队列（passage、relationship、deep-relationship 三阶段）以及 diff（reconfirmed/new/changed/removed）。 |
| `ai_agent.py` | LLM 调用层（约 800 行）。统一 `_chat_json_completion` 走配置中的服务商，覆盖文章元数据生成、星图 passage/keyword/relationship/deep path 生成、管理员指令自然语言规划、连接测试；记录每次调用的 token 使用。 |
| `admin_commands.py` | 管理员指令框架（约 520 行）。指令注册表、命名规则、tokenizer、parser（位置参数 + `--key=value`/`--flag`）、risk/confirmation 元数据、guide 输出，以及 `article:list-ids`、`article:get-content`、`article:set-title`、`article:set-date` 等具体指令实现。 |
| `almanac.py` | 老黄历调用。通过子进程调用 `server/scripts/cnlunar_almanac.py`，按当天日期缓存返回宜忌、干支、节气、生肖等结构化字段。 |
| `seed.py` | 初始数据种子。表为空时写入默认栏目、首页文案和一篇 Python 后端接管的样例文章。 |
| `seed_test_articles.py` | 测试文章种子。写入 Markdown 全元素、代码块、数学公式、长文、图片、搜索边界等测试文章及评论，用于兼容性测试和视觉验证。 |
| `smoke_test.py` | HTTP 冒烟测试。用 `TestClient` 走一遍公开/管理端点，覆盖登录、CSRF、安全头、上传校验、系统图库保护、RSS/sitemap 格式等关键断言。 |
| `compat_test.py` | 后端兼容性测试。在临时数据库中重新 seed，验证旧版 API 契约（分页字段、归档分组、搜索、tag/category 过滤、评论状态、robots 等）保持不变。 |

## 脚本与配置

| 文件 | 功能 |
| --- | --- |
| `scripts/audit-theme-vars.mjs` | 构建前主题审计。检查 `src/siteSettings.ts` 中 `stylePresets`、`index.html` 中内联预设、`src/styles.css` 中每个 `:root` 主题块是否齐全并包含必要的首页背景变量；缺一项即失败。 |
| `package.json` | npm 配置。定义前端依赖（React、Vite、Three.js、MDXEditor、react-markdown 等）和脚本（`dev`、`dev:server`、`seed:server`、`seed:test-articles`、`test:server`、`test:theme`、`build`、`preview`）。 |
| `vite.config.ts` | Vite 配置。启用 React 插件、把编辑器相关依赖（MDXEditor/Lexical/CodeMirror）拆成单独 chunk，开发服务把 `/api`、`/robots.txt`、`/rss.xml`、`/sitemap.xml` 代理到 `127.0.0.1:4174`。 |
| `tsconfig.json` | TypeScript 主配置。面向 `src/` 与 `vite.config.ts`，开启 `strict`、`jsx: react-jsx`、Bundler 模块解析、`resolveJsonModule`，仅做类型检查不 emit。 |
| `tsconfig.node.json` | 仅为 `vite.config.ts` 服务的 TypeScript 项目引用配置。 |
| `start-dev.bat` | Windows 一键启动脚本。激活 conda `py313` 环境、自动 `npm install`、复制 `config.json`、运行 seed，并以独立窗口启动前后端，同时打印局域网地址便于手机访问。 |
| `start-frontend.bat` | 仅启动前端开发服务的简化批处理。自动探测本机局域网 IP 并打印手机访问 URL。 |

## 文档目录（docs/）

| 文件 | 功能 |
| --- | --- |
| `blog-system-usability-review.md` | 博客系统可用性自评记录。 |
| `production-ops.md` | 生产运维手册（部署、备份、监控等）。 |
| `backend-support-plan.md` | 后端支持与迁移计划。 |
| `starfield-knowledge-map-implementation-plan.md` | 星图功能实现计划。 |
| `adr/0001-markdown-article-body-source.md` | ADR：文章正文以 markdown 作为唯一来源。 |
| `adr/0002-passage-level-starfield-knowledge-map.md` | ADR：星图下沉到 passage 层级。 |
| `adr/0003-keyword-bridged-starfield-relationship-generation.md` | ADR：用规范关键词桥接生成 passage 关系。 |
| `adr/0004-inquiry-driven-deep-relationship-mining.md` | ADR：基于 inquiry 的深层关系挖掘。 |
| `adr/0005-incremental-starfield-versioning.md` | ADR：星图增量版本与父版本保留策略。 |

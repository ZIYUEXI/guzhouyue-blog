# App.tsx

> 源路径：`src/App.tsx`
> 总行数：约 7590 行

整个前端的根组件文件：包含路由分发、公开站点所有页面、管理后台所有面板，以及一个深度定制的 Markdown 写作台（Typora 风格编辑器）。

## 文件概览

`App.tsx` 不是普通的根组件，而是项目的"页面入口 + 状态中枢 + 后台业务编排器"。它从 `./apiClient` 调用所有后端接口，从 `./contentStore`、`./siteSettings`、`./posts` 取本地数据形状，把站点的 `SiteContent`（文章 + 札记 + 系列 + 图库 + 首页文案）和 `SiteSettings`（主题预设 + 作者信息）作为顶层 state 管理。文件内部按"根 App → 公开页面 → 后台容器 → 后台子面板 → 工具函数"自上而下组织。

关键依赖：

- **apiClient**：所有 HTTP 调用（`fetchPublicSite`、`fetchAdminContent`、`createAdminArticle` 等）。
- **contentStore**：`SiteContent` 类型与本地持久化（`saveSiteContent`、`resetSiteContent`、`ensureSystemGalleryAlbums`）。
- **siteSettings**：`applySiteSettings`（写入 `document.documentElement` 的 data 属性）、`stylePresets`、`colorSchemes`。
- **子组件**：`ArticleComments`、`AdminCommandPanel`、`AdminDashboardPanel`、`AdminPostsPanel`、`AdminStarfieldPanel`、`AdminTagsPanel`、`MarkdownBody`、`PublicGalleryPage`、`StarfieldPage`、`RichMarkdownEditor`（`lazy` 加载）、`useArticleHead`（SEO）。

## 顶层导入与常量

文件开头集中导入 lucide 图标、React hooks、所有子组件、apiClient 函数、contentStore 类型、siteSettings 工具、posts 类型。定义若干常量：

- `navItems`：站点导航项（首页、文章、札记、归档、图库、星图、关于）。
- `adminPostsPerPage = 8`：后台文章分页大小。
- `composerImageAlbumSlug = 'article-images'`：写作台粘贴图片时自动归入的相册 slug。
- `supportedComposerImageMimeTypes`：写作台允许粘贴的图片类型。

`RichMarkdownEditor` 通过 `lazy(() => import('./RichMarkdownEditor'))` 异步加载，因为它依赖 mdxeditor 体积较大，只在所见即所得模式下才需要。

```ts
const RichMarkdownEditor = lazy(() =>
  import('./RichMarkdownEditor').then((module) => ({ default: module.RichMarkdownEditor })),
);
```

## 根 App 组件：路由与状态

`App()` 是默认导出的根组件。它维护以下 state：

- `settings` / `colorScheme`：站点外观设置，初始化时从 `readSiteSettings()` / `readUserColorScheme()` 读取。
- `content`：站点全部内容（文章、札记、系列、图库、首页文案）。
- `adminAuthStatus`：`'checking' | 'authenticated' | 'anonymous'`，决定是否渲染登录页。
- `ownerAuthenticated`：公开页面是否显示"后台"入口（通过静默调用 `fetchAdminMe()` 判断）。
- `menuOpen` / `searchOpen` / `query`：移动端抽屉、搜索面板、搜索关键词。

从 `window.location.pathname` 和 `window.location.search` 解析当前路由（`getRoute` 来自 `./routing`），并区分公开路由和管理路由（`isAdminPath`）。

```tsx
const pathname = window.location.pathname;
const isAdminRoute = isAdminPath(pathname);
const route = getRoute(pathname);
```

## 顶层副作用

四个 `useEffect`：

1. **popstate 监听**：监听浏览器前进后退，触发 `setLocationVersion` 强制重渲染。
2. **应用设置**：`applySiteSettings(settings, colorScheme)` 把主题预设和明暗模式写入 `<html>` 的 `data-style-preset` 与 `data-color-scheme`。
3. **owner 会话探测**：非管理路由下静默调用 `fetchAdminMe()`，成功则标记 `ownerAuthenticated`，用于在公开页导航栏显示"后台"入口。
4. **数据加载**：管理路由下调用 `fetchAdminContent()` 拉全部内容；公开路由下用 `Promise.all` 并行调用 `fetchPublicSite()`、`fetchPublicArticles()`、`fetchPublicGallery()`，再用 `normalizeApiPost` 等函数规范化为 `SiteContent`。

```tsx
const [sitePayload, articleItems, galleryItems] = await Promise.all([
  fetchPublicSite(),
  fetchPublicArticles(),
  fetchPublicGallery(),
]);
```

加载失败时，公开路由会设置 `dataSourceNotice` 提示用户内容接口不可用；管理路由会切换到 `anonymous` 并显示错误。

## 路由分发

如果是管理路由：未登录返回 `<AdminLoginPage>`，已登录返回 `<AdminPage>`。

否则按 `route.name` 渲染对应公开页面：`home` / `posts` / `notes` / `archive` / `gallery` / `starfield` / `post` / `not-found`。`SiteHeader` 和 `SiteFooter` 包裹所有公开页面，`SearchCommand` 在 `searchOpen` 时叠加。

## 管理员登录页

`AdminLoginPage` 是独立小页面：密码输入 + 登录按钮。提交时调用 `loginAdmin(password)`，成功则触发上层 `window.location.reload()` 重新挂载（确保管理态副作用完整重建）。失败时区分 401（密码错误）与其他错误（服务异常）。

```tsx
async function handleSubmit(event) {
  setLoginStatus('submitting');
  try {
    await loginAdmin(nextPassword);
    onLoginSuccess();
  } catch (error) {
    setLoginStatus(error instanceof ApiError && error.status === 401 ? 'invalid-password' : 'service-error');
  }
}
```

## 文章与归档工具函数

一组纯函数负责文章数据处理：

- `buildArchive(posts)`：按"YYYY 年 M 月"分组成 `ArchiveGroup[]`。
- `sortPosts(posts)`：按日期降序（用 `parsePostDate` 把 `"2025.06.25 14:30"` 解析为时间戳）。
- `getPostBySlug` / `getAdjacentPosts`：详情页定位与上下篇。
- `slugifyPostTitle(value)`：把标题转 slug（保留中文 + 小写英文 + 数字 + 连字符）。
- `createUniqueSlug(posts, slug, currentSlug?)`：去重，冲突时追加 `-2` / `-3`。
- `normalizeTags` / `splitTagInput`：标签清洗（去 `#` 前缀、按中英文逗号或换行分割）。
- `buildLocalAdminTags(posts)`：本地统计每个标签的文章数和出现次数，作为后台标签面板的兜底数据。
- `movePostToArchiveDate(post, dateValue)`：把文章日期移到指定归档日（保留时分）。

```ts
function slugifyPostTitle(value: string) {
  return value.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9一-龥-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `post-${Date.now()}`;
}
```

## Markdown 处理与写作台草稿

写作台相关工具：

- `getMarkdownOutline(markdown)`：从 Markdown 提取 `##`-`######` 标题生成大纲，并检测层级跳跃（如 H2 直接到 H4 会标记 warning）。
- `getHeadingBlockRange(lines, index)` / `moveMarkdownHeadingBlock(markdown, src, target)`：大纲拖拽重排时计算标题块范围并移动。
- `normalizeLooseCodeFences(markdown)`：修复"松散"代码围栏（用户粘贴时反引号被转义或语言标记错位的情况）。
- `ComposerDraft` 类型 + `readComposerDraft` / `writeComposerDraft` / `clearComposerDraft`：localStorage 草稿持久化，key 形如 `guzhouyue.composerDraft:<slug>`。
- `DraftStatus`：`'clean' | 'dirty' | 'saving' | 'draft-saved' | 'local-draft-saved' | 'published'`，决定顶栏状态文案。

```ts
function getComposerDraftKey(slug?: string) {
  return `guzhouyue.composerDraft:${slug || 'new'}`;
}
```

## 后台容器 AdminPage

`AdminPage` 是后台主容器，维护：

- `activePanel`：当前激活的子面板 ID（`'overview' | 'posts' | 'trash' | 'tags' | 'comments' | 'notes' | 'series' | 'gallery' | 'starfield' | 'archive' | 'commands' | 'llm' | 'homepage' | 'appearance'` 等）。
- `deletedPosts`：回收站文章（来自 `fetchAdminDeletedArticles`）。
- `adminTags`：标签统计（来自 `fetchAdminTags`，失败时回退 `buildLocalAdminTags`）。
- `trashNotice`：回收站错误提示。

它根据 `window.location.pathname` 判断是否处于写作台路由（`/admin/posts/new` 或 `/admin/posts/:slug/edit`），是则直接渲染 `AdminPostComposer`，否则渲染侧栏 + 当前面板。

### 文章增删改与同步

这是 AdminPage 最核心的一组 handler：

- `createPost(post)`：调 `createAdminArticle`，成功后插入到列表头部并跳转回列表；失败则降级为 `syncStatus: 'local-only'` 保留本地。
- `updatePost(originalSlug, post)`：调 `updateAdminArticle`，成功更新列表与系列中的 slug 引用；失败同样降级本地。
- `deletePosts(slugs)`：批量调 `deleteAdminArticle`，成功项从列表移除并加入 `deletedPosts`（带 `deletedAt` 时间戳）。
- `restorePosts(slugs)`：批量调 `restoreAdminArticle`，把回收站文章还原到列表。
- `syncPost(slug)`：先尝试 `updateAdminArticle`，失败再尝试 `createAdminArticle`（处理"本地 only"文章首次同步）。
- `publishPosts` / `unpublishPosts` / `archivePosts`：批量状态变更，分别走 `publishAdminArticle` / `unpublishAdminArticle` / `updateAdminArticle`。
- `movePostsToArchiveDate` / `movePostsToCategory`：批量改归档日期或分类。
- `removeTagFromPosts(tag)` / `mergePostTags(source, target)`：调 `deleteAdminTag` / `mergeAdminTags`，并用返回值更新本地文章。

所有批量操作返回 `BatchResult = { success, failed }`，由调用方拼装提示文案。

```tsx
async function syncPost(slug: string): Promise<BatchResult> {
  try {
    const savedPost = normalizeApiPost(await updateAdminArticle(slug, post));
    // ...更新列表
  } catch {
    const createdPost = normalizeApiPost(await createAdminArticle(post));
    // ...降级创建
  }
}
```

### 札记、系列、首页、图库操作

- `updateNoteSection` / `addNoteSection` / `deleteNoteSection`：札记增删改。`saveNoteSectionsSoon` 用 450ms 防抖写回（`saveAdminNoteSections`），删除则立即写回。
- `updateSeries` / `addSeries` / `deleteSeries`：系列增删改，立即调 `saveAdminFeaturedSeries`。
- `updateHomepage(homepage)`：首页文案，立即调 `saveAdminHomepage`。
- `addGalleryAlbum` / `updateGalleryAlbum` / `deleteGalleryAlbumAt`：相册增删改，调 `createAdminGalleryAlbum` / `updateAdminGalleryAlbum` / `deleteAdminGalleryAlbum`。系统图库（`isSystemGalleryAlbum`）禁止删除。
- `uploadGalleryImages(albumIndex, files)`：批量上传图片到指定相册，调 `uploadAdminGalleryImage`，单张失败跳过。
- `uploadComposerImages(files)`：写作台专用，自动找/建 `article-images` 相册并上传。
- `replaceGalleryImageFile` / `updateGalleryImage` / `deleteGalleryImageAt` / `moveGalleryImage`：单图操作。系统图库图片禁止删除，只能替换（`replaceAdminGalleryImageFile`）。

```tsx
async function uploadComposerImages(files: File[]) {
  let targetAlbum = content.galleryAlbums.find(
    (album) => !isSystemGalleryAlbum(album) && album.slug === composerImageAlbumSlug
  ) ?? content.galleryAlbums.find((album) => !isSystemGalleryAlbum(album));
  // 没有就新建 article-images 相册
}
```

### 设置与外观

- `updateStylePreset` / `updateOwnerName` / `updateOwnerAvatarUrl`：通过 `onSettingsChange` 上抛，触发 `saveAdminSettings` 持久化。
- `restoreDefaults()`：调 `resetSiteContent()` 恢复本地默认内容。

### 退出登录

`handleLogout` 调 `logoutAdmin()`，成功后清状态并跳转到 `/admin`。

## 后台子面板

AdminPage 根据路由渲染以下子面板（部分为内联组件，部分为独立文件）：

### AdminTrashPanel / AdminCommentsPanel / AdminComposerStatus

内联组件。回收站列表（含恢复按钮）、评论审核列表（调 `fetchAdminComments` + `updateAdminCommentStatus`）、写作台加载/缺失状态。

### AdminPostComposer（写作台）

文件中最大的组件（约 1700 行）。提供三种编辑模式：

- **wysiwyg**：所见即所得，渲染 `RichMarkdownEditor`（lazy 加载），深度覆盖 mdxeditor。
- **markdown**：纯 `<textarea>` + 等宽字体。
- **split**：左侧 textarea + 右侧 `MarkdownBody` 实时预览。

顶栏 `.typora-topbar` 提供模式切换、字数统计、AI 元数据生成（调 `generateAdminArticleMetadata`）、明暗切换、大纲开关、专注模式、快捷键说明、保存按钮。

左侧 `.writer-outline` 是可拖拽大纲（调 `moveMarkdownHeadingBlock`）。中间 `.typora-paper` 是标题输入 + 工具栏 + 编辑器主体。右侧 `.composer-meta` 是发布信息（slug、分类、状态、发布时间、色调、摘要、SEO 标题/描述、封面图、标签芯片输入）。

#### 草稿持久化链

写作台同时维护三套草稿：

1. **localStorage**：`writeComposerDraft` 每次内容变化时写入（key 含 slug）。
2. **服务端草稿**：`saveAdminDraft` 定期写回，`fetchAdminDraft` 在加载时读取。
3. **pendingDraft 提示**：如果检测到本地草稿与服务端不一致，弹出 `.draft-restore-panel` 让用户选择恢复或丢弃。

```tsx
type DraftStatus = 'clean' | 'dirty' | 'saving' | 'draft-saved' | 'local-draft-saved' | 'published';
```

#### 工具栏与快捷键

`.typora-toolbar` 提供 Markdown 格式按钮（标题、引用、列表、加粗、斜体、行内代码、链接、代码块、公式、图库图片、表格）。`insertMarkdown` / `wrapSelection` 操作 textarea 选区。全局快捷键：Cmd/Ctrl+S 保存、B/I/K/E 加粗斜体链接代码、P 切换预览、F 查找、H 替换、`/` 显示快捷键说明。

#### 弹层

四种弹层（共用 `.shortcut-layer` 遮罩）：

- `.shortcut-panel`：快捷键速查表。
- `.draft-restore-panel`：草稿恢复提示。
- `.formula-panel`：公式编辑器（行内/块级切换 + KaTeX 预览）。
- `.gallery-picker-panel` / `.cover-picker-panel`：从图库选图插入正文或选为封面。

#### 图片上传

写作台支持拖拽（`onDrop`）和粘贴（`onPaste`）图片，过滤后调 `uploadComposerImages`，上传中显示 `.composer-drop-layer` 进度。

### AdminNotesPanel / AdminSeriesPanel

札记分类编辑（每段札记含分类名 + 描述）与专题系列编辑（每个系列含标题、引导语、正文、文章 slug 列表 + 拖拽排序）。

### AdminGalleryPanel

左右双列布局：左侧相册列表，右侧图片网格。支持新建/删除相册、上传/删除/排序/替换图片、设置封面。系统图库（用于首页 hero 和作者头像）单独标记，只能替换不能删除。

### AdminArchivePanel

按月归档文章列表，支持批量改归档日期、改分类、归档/取消归档。

### AdminHomepagePanel

编辑首页所有文案：站名、标语、hero 标题、副标题、CTA、节气文案（可自动从 `createSeasonNote` 生成）、统计数字等。

### AdminLlmConfigPanel

LLM 服务商配置（OpenAI 兼容、Anthropic 等）+ 模型/Base URL/API Key/Temperature 表单。调 `saveAdminLlmConfig` / `fetchAdminLlmConfig`。提供"测试连接"按钮（调 `testAdminLlmConnection`），并展示 Token 消耗记录（调 `fetchAdminLlmTokenUsage`，分页表格）。

```tsx
async function handleConnectionTest() {
  setConnectionTestStatus('testing');
  const result = await testAdminLlmConnection();
  setConnectionTestStatus(result.ok ? 'success' : 'failed');
  await refreshTokenUsage(1);
}
```

### AdminAppearancePanel

外观设置：作者名 + 作者头像（从系统图库选或填 URL）+ 视觉风格预设（classic/cyber）+ 明暗模式 + 危险区（重置内容，需输入站点名确认）。下方实时预览当前预设的首页首图。

## 公开站点组件

### SiteHeader

顶栏：品牌（站名 + 标语）+ 桌面导航（`navItems`）+ 操作按钮（搜索、明暗切换、移动端菜单）。已登录 owner 时多一个"后台"入口。

### HeroMoonScene（首页 Hero）

首页第一屏：背景图（来自 `stylePresetAssets[stylePreset].heroImage` 或系统图库）+ 月轨动画 + 水面反光 + 竖排印章 + 大标题 + 副标题 + 两个 CTA 按钮 + 节气卡。节气文案优先用 `createSeasonNoteFromAlmanac(almanac)`（来自后端返回的农历/节气信息），否则回退到 `createSeasonNote()` 静态生成，再回退到用户配置的 `homepage.seasonTitle/Text`。

### 首页内容区

`HomeContent` 串联五个区块：

- **LatestPosts**：最新文章网格（`.post-grid` + `.post-card`）。
- **TopicRiver**：主题河，横向滚动的系列卡片轨道。用 `requestAnimationFrame` 自动慢速滚动，鼠标按下时暂停（指针拖拽）。
- **FeaturedEssay**：特色专题散文（`.featured-card` 大卡）。
- **ArchivePreview**：归档预览（最近 4 个月，每月最多 6 条）。
- **AboutBlock**：关于区块（作者头像 + 简介 + 统计数字）。

### PostCard / PostCover

文章卡片有两种形态：网格卡（`.post-card`，含封面 + 标题 + 摘要 + 元信息）和列表行（`.list-post`）。`PostCover` 渲染封面图，支持 `tone`（ink/pine/cinnabar/water）决定色调滤镜。

### 列表页

- **AllPostsPage**：全部文章，支持 `category` / `tag` query 参数过滤 + 分页（`postsPerPage`）。
- **AllNotesPage**：札记列表，按 `noteSections` 分组。
- **AllArchivePage**：归档时间线（`.timeline`，左侧竖线 + 圆点）。

### 图库工具与 PublicGalleryPage

`sortGalleryAlbums` / `sortGalleryImages` / `isSystemGalleryAlbum` / `withGalleryAlbumImages` / `getSystemGalleryImageUrls` 是图库数据的纯函数工具。`PublicGalleryPage`（独立组件）渲染相册网格 + 灯箱。

### StarfieldPage

星图页面（独立组件，3D 知识图谱）。本文件只负责路由渲染，实际逻辑在 `./StarfieldPage` 与后端 `server_py/starfield.py`。

### PostDetailPage

文章详情页。用 `useArticleHead`（来自 `./articleSeo`）设置 `<title>` / `<meta>` / Open Graph。渲染封面 + 标题 + 元信息 + 正文（`MarkdownBody` 渲染 Markdown）+ 目录（粘性侧栏）+ `ArticleComments`（评论）+ 上下篇导航。

支持从星图跳转时定位到文段锚点（URL 中的 `#passage-xxx`），通过 `useEffect` 在加载后滚动到对应元素。

```tsx
function PostDetailPage({ ownerAvatarUrl, posts, slug }) {
  const post = getPostBySlug(posts, slug);
  useArticleHead(post);
  // ...
}
```

### SearchCommand

全屏搜索面板（`.search-layer` 遮罩 + `.search-panel` 卡片）。输入关键词后用 `filteredPosts`（App 顶层 useMemo 过滤）展示结果，提供快捷链接。focus trap 通过 `inset 0` + `overflow: auto` 实现。

### NotFoundPage

404 页面，简洁提示 + 返回首页链接。

## 工具与辅助函数

文件末尾集中定义格式化函数：`formatToday`（当前时间 "YYYY.MM.DD HH:MM"）、`formatDeletedAt`（删除时间友好显示）、`formatDraftSavedAt`（草稿保存时间）、`formatBatchResult`（批量操作结果文案）、`formatInteger` / `formatTokenCount`（数字格式化）、`formatLlmUsageFeature` / `formatLlmUsageTime`（LLM 用量记录格式化）。

```tsx
function formatToday() {
  const date = new Date();
  return `${date.getFullYear()}.${month}.${day} ${hour}:${minute}`;
}
```

## 风险点与维护提示

- 文件超大（7590 行），新增功能时优先考虑拆分为独立组件文件（参考已拆出的 `AdminPostsPanel`、`AdminTagsPanel` 等）。
- `AdminPage` 内的 handler 数量极多，且都依赖闭包捕获的 `content` state，修改时注意闭包陈旧值问题（已用 `applyUpdatedPosts` 等辅助函数缓解）。
- 写作台草稿持久化链（localStorage + 服务端 + pendingDraft）状态机复杂，改动前务必理清 `DraftStatus` 的转换路径。
- `normalizeLooseCodeFences` 等 Markdown 清洗函数针对用户粘贴行为做了大量兼容，修改时需回归测试各种边界情况。
- 路由是手写的 `window.location` + `popstate`，没有用 react-router，新增路由需同步更新 `./routing.ts` 的 `getRoute`。

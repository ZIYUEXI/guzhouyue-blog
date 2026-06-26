# AdminDashboardPanel.tsx

> 源路径：`src/AdminDashboardPanel.tsx`
> 总行数：约 257 行

管理后台「总览」首屏：聚合统计卡片、快捷入口、运维体检与最近动态，让管理员一进后台就能看到全站概貌。

## 文件概览

本面板由 `App.tsx` 在 `panel === 'overview'` 时渲染。它不直接发起写操作，只读 `content`（`SiteContent`）、`archiveGroups`、`deletedPosts` 等上层已加载好的数据，再额外调用一次 `fetchAdminOps()` 拉取后端运维体检信息。子任务（创建文章、跳转其他面板）通过 `onSelectPanel` 回调交给父组件切面板，或直接用 `<a>` 链接到 `/admin/posts/new`、`/admin/posts/<slug>/edit` 等路由。

关键依赖：`apiClient.fetchAdminOps`、`contentStore.SiteContent`、`posts.Post`、`siteSettings.ColorScheme`。

## 类型定义：AdminPanelId 与 ArchiveGroup

`AdminPanelId` 是全后台所有子面板的字符串字面量联合类型，定义在这里是为了让 `quickActions` 数组和 `onSelectPanel` 回调共享同一套面板标识（`posts` / `gallery` / `starfield-generate` / `commands` / `llm` / `homepage` / `appearance` 等）。`ArchiveGroup` 描述归档分组（`{ month, entries }`），由上层从 `posts` 派生后传入。

```ts
type AdminPanelId =
  | 'overview' | 'posts' | 'trash' | 'comments' | 'notes' | 'series'
  | 'gallery' | 'starfield' | 'starfield-generate' | 'starfield-review'
  | 'tasks' | 'archive' | 'commands' | 'llm' | 'homepage' | 'appearance';
```

## 顶部统计卡片

从 `content` 现算文章数、分类数、专题数、相册图片数、回收站数量。`galleryImageCount` 把所有相册的 `imageCount` 累加；`unsyncedPostCount` 统计 `syncStatus === 'local-only'` 的稿件，提示作者有未同步到后端的本地稿。`待处理` 卡片显示 `ops.pendingComments`（后端返回的待审评论数）。

## 运维体检：fetchAdminOps 调用

挂载时拉取 `/api/admin/ops`，结果存到 `ops`，状态机 `opsStatus` 在 `loading / ready / error` 之间切换。该接口返回 API 存活、数据库 `quick_check` 与文件大小、LLM Token 用量、最近审计日志等。组件用 `let cancelled = false` 做卸载竞态保护，避免面板切走后还在 `setState`。

```ts
useEffect(() => {
  let cancelled = false;
  setOpsStatus('loading');
  fetchAdminOps()
    .then((payload) => { if (!cancelled) { setOps(payload); setOpsStatus('ready'); } })
    .catch(() => { if (!cancelled) setOpsStatus('error'); });
  return () => { cancelled = true; };
}, []);
```

调用的是 `apiClient.ts` 中的 `fetchAdminOps`（对应后端 `GET /api/admin/ops`）。

## 快捷入口与最近文章

`quickActions` 是一个静态数组，每项带 `label / detail / panel / icon`，渲染成跳转按钮调用 `onSelectPanel(panel)`。`detail` 会动态拼入相册数、图片数、当前主题等实时数据。最近文章列表从 `sortPosts(content.posts)` 取前 5 篇，每条直接渲染成 `/admin/posts/<slug>/edit` 链接。

## 审计日志展示

`ops.recentAudit` 是后端记录的最近成功写操作（如发布文章、合并标签等）。面板展示前 5 条，字段为 `action / target / createdAt`。空数组时显示「成功的后台写操作会记录在这里」的占位文案，方便作者确认审计链路是否启用。

## 底部工具函数

`sortPosts` / `parsePostDate` 把 `"2026.05.18 22:10"` 这种自定义日期字符串解析成时间戳后降序排列；`formatDateTime` 用 `Intl.DateTimeFormat('zh-CN')` 把 ISO 时间格式化成中文短日期；`formatBytes` 把数据库文件大小转成 B/KB/MB/GB；`formatCount` 用千分位格式化 Token 数。这些都是纯函数，无副作用。

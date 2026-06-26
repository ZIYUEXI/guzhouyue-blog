# AdminPostsPanel.tsx

> 源路径：`src/AdminPostsPanel.tsx`
> 总行数：约 540 行

管理后台「文章管理」面板：搜索、按分类/状态筛选、批量操作（发布、下架、归档、迁移分类、删除、同步）、分页以及从编辑页返回时的滚动位置恢复。

## 文件概览

这是后台最复杂的列表型面板之一。`App.tsx` 把已加载好的 `posts: Post[]` 和 `noteSections`（用于分类下拉）传进来，并把所有写操作以回调形式注入（`onPublishPosts` / `onUnpublishPosts` / `onArchivePosts` / `onDeletePosts` / `onMovePostsToCategory` / `onSyncPost`）。本组件负责筛选状态、选中集合、分页游标与滚动恢复，所有真正的 API 调用在父组件中完成。

关键依赖：`contentStore.NoteSection`、`posts.Post` / `PostStatus`。

## 常量与状态定义

`adminPostsPerPage = 8` 是写死的每页条数。`postStatusLabels` 把 `draft / published / archived` 映射成中文标签。组件状态包括：搜索关键字、当前分类、当前状态筛选、选中 slug 集合 `selectedSlugs`、批量操作目标分类 `bulkCategory`、操作提示 `batchNotice`、忙锁 `batchBusy`，以及用于滚动恢复的 `returnScrollY`。

```ts
const adminPostsPerPage = 8;
const postStatusLabels: Record<PostStatus, string> = {
  draft: '草稿', published: '已发布', archived: '已归档',
};
```

## 筛选块：分类、状态、关键字

筛选条件分三层：

- **分类**：`categories` 由 `noteSections` 的分类加上 `posts` 自身出现过的额外分类合并去重得到，开头补一个「全部」；`categoryCounts` 给每个分类算篇数用于下拉显示。
- **状态**：`statusCounts` 统计 `all / published / draft / archived` 四档；UI 上是 `admin-status-tabs` 按钮组而不是下拉。
- **关键字**：`filteredPosts` 把标题、摘要、分类、标签、日期、状态文本拼成一个字符串再做大小写不敏感 `includes`，省得为每个字段单独写匹配逻辑。

`previousFiltersRef` + 一个 effect 负责在筛选条件变化时把 `currentPage` 重置回 1，避免「在第 3 页改了筛选后看到空列表」。

## 批量操作块：runBatch 与工具栏

`runBatch(action, slugs, operation)` 是所有批量动作的统一入口：判空 + 忙锁 → 调 `operation` 拿 `{ success, failed }` → 拼 `formatBatchResult` 提示 → **成功时把刚操作的 slug 从 `selectedSlugs` 里清掉**，让作者直观地看到选中项在减少。

```ts
async function runBatch(action, slugs, operation) {
  if (slugs.length === 0 || batchBusy) return;
  setBatchBusy(true);
  try {
    const result = await operation(slugs);
    setBatchNotice(formatBatchResult(action, result));
    if (result.success > 0) {
      setSelectedSlugs((curr) => curr.filter((s) => !slugs.includes(s)));
    }
  } finally { setBatchBusy(false); }
}
```

工具栏提供「选中本页」复选框、批量发布/下架/归档、批量迁移分类（下拉选 `noteSections` 中的分类）、批量删除（带 `window.confirm`）。单行操作（预览、编辑、同步、发布/下架、归档、删除）也复用 `runBatch`，只是把 `slugs` 换成单元素数组。

## 分页与当前页安全修正

`totalPages` 由 `filteredPosts.length / adminPostsPerPage` 向上取整，至少为 1；`safeCurrentPage = Math.min(currentPage, totalPages)` 防止删除文章后当前页越界。一个 effect 在 `currentPage > totalPages` 时主动调 `onPageChange(totalPages)` 把页码拉回合法区间。`currentPage` 和 `onPageChange` 都由父组件控制（通常存在 URL 里），保证刷新和返回都能恢复页码。

## 滚动恢复：returnScrollY 与 URL scroll 参数

这是本组件最精细的一段。问题场景：作者在文章列表第 3 页滚到 1200px，点「编辑」进编辑页，保存后返回列表时希望落到原来的滚动位置。

解决方案分两部分：

- **记录**：`useEffect` 监听 `window.scroll`，用 `requestAnimationFrame` 节流把 `scrollY` 写进 `returnScrollY` 状态；`createAdminPostsReturnPath` 把当前页和滚动位置编码成 `/admin/posts?panel=posts&page=3&scroll=1200`，作为编辑链接的 `returnTo` 查询参数。
- **恢复**：`getAdminPostsScrollFromUrl` 从 `window.location.search` 读 `scroll` 参数；另一个 effect 在 `posts` 加载完成后用 `requestAnimationFrame` + `window.scrollTo` 把窗口滚回去，并用 `restoreScrollKeyRef` 去重避免重复触发。

```ts
useEffect(() => {
  const target = requestedScrollY;
  if (target === null || posts.length === 0) return;
  const restoreKey = `${safeCurrentPage}:${target}`;
  if (restoreScrollKeyRef.current === restoreKey) return;
  restoreScrollKeyRef.current = restoreKey;
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: target, behavior: 'auto' });
    setReturnScrollY(target);
  });
}, [posts.length, requestedScrollY, safeCurrentPage]);
```

## 选中集合的自动清理

两个 effect 守护 `selectedSlugs` 的卫生：

- 当外部 `posts` 变化（例如删除了一篇）后，过滤掉已不存在的 slug；
- 当 `bulkCategory` 为空但 `noteSections` 有值时，把 `bulkCategory` 默认设成第一个分类。

这些「派生状态修正」保证 UI 永远不会显示已失效的选中或空分类。

## 单行操作与状态判定

`getPostStatus(post)` 把 `post.status ?? 'published'` 作为默认值——历史数据里没有 `status` 字段的老文章都视为已发布。`syncStatus === 'local-only'` 的文章额外显示「未同步」徽章和「同步」按钮（调 `onSyncPost`）。已发布文章显示「预览」链接到 `/posts/<slug>`，草稿和归档文章的预览按钮被禁用并加 `title` 解释原因。

## 调用的 apiClient 函数（间接）

所有写操作都经父组件 `App.tsx` 间接调用 `apiClient.ts`：发布/下架/归档对应 `publishAdminArticle` / `unpublishAdminArticle` 等文章状态接口，删除对应 `deleteAdminArticle`，迁移分类对应 `updateAdminArticle`，同步本地稿对应 `createAdminArticle`。

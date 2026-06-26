# AdminTagsPanel.tsx

> 源路径：`src/AdminTagsPanel.tsx`
> 总行数：约 214 行

管理后台「标签管理」面板：展示标签云、按标签搜索、删除标签、把一个标签合并到另一个标签。

## 文件概览

面板本身不直接调 API，所有写操作通过 `onDeleteTag` / `onMergeTags` 两个 prop 回调上抛到 `App.tsx`，由父组件去调 `apiClient.deleteAdminTag` / `mergeAdminTags` 并刷新数据。本组件职责是：维护搜索关键字、当前选中的源标签与目标标签、`busy` 锁、操作结果提示，以及把 `tags: ApiAdminTag[]` 与 `posts: Post[]` 渲染成可点击的卡片网格。

关键依赖：`apiClient.ApiAdminTag`（标签数据形状）、`posts.Post`（用来反查标签引用了哪些文章标题）。

## 概览与低频标签统计

顶部 `admin-post-metrics` 卡片显示三个数：标签总数、所有标签的 `articleCount` 之和（篇次引用）、`articleCount <= 1` 的低频标签数。低频标签统计是为了提示作者哪些标签几乎没人用、可以考虑合并或删除。

## 搜索与选中态联动

`visibleTags` 用 `useMemo` 按 `searchQuery` 过滤标签名。`selectedTagMeta` 是当前要操作的源标签对象——优先取 `selectedTag` 状态，否则回退到 `visibleTags[0]` 再到 `tags[0]`，保证任何时候都有一个默认选中项。两个 `useEffect` 负责：

- 当外部 `tags` 变化（如刚删了一个标签）时，把 `selectedTag` 修正到仍然存在的标签上；
- 当 `mergeTargets` 变化导致 `safeTargetTag` 失效时，把 `targetTag` 重置到第一个合法目标。

```ts
const safeTargetTag = targetTag && mergeTargets.some((t) => t.name === targetTag)
  ? targetTag
  : mergeTargets[0]?.name ?? '';
```

这种「派生值 + 修正 effect」的写法是为了避免下拉框出现已删除的脏选项。

## 删除与合并：runDelete / runMerge

两个异步函数都遵循同一套流程：先 `window.confirm` 二次确认 → `setBusy(true)` → 调上层回调拿到 `{ success, failed }` 结果 → 把结果拼成中文提示塞进 `notice` → `finally` 解锁。`busy` 锁会同时禁用所有按钮，防止并发点击触发多次后端写。

```ts
const confirmed = window.confirm(`确定删除标签「${tag.name}」吗？会从 ${tag.articleCount} 篇文章中移除。`);
if (!confirmed) return;
setBusy(true);
try {
  const result = await onDeleteTag(tag.name);
  setNotice(`删除完成：成功更新 ${result.success} 篇文章，失败 ${result.failed} 项。`);
} finally { setBusy(false); }
```

`BatchResult` 类型（`{ success, failed }`）与 `AdminPostsPanel` 共用同一约定，后端在 `server_py/content.py` 中实现标签删除/合并时返回该结构。

## 标签卡片网格与引用文章侧栏

`admin-tag-grid` 把每个标签渲染成卡片：点击卡片主体切换 `selectedTag`，右上角 `danger-action` 按钮单独触发 `runDelete(tag)`。`aria-current` 标记当前选中源标签，便于无障碍读屏。`admin-tag-detail` 侧栏展示当前选中标签引用的前 6 篇文章标题（用 `posts.filter(p => p.tags.includes(name))` 计算），让作者在合并/删除前能预览影响范围。

## 调用的 apiClient 函数（间接）

本组件不直接 import apiClient 的请求函数，但通过父组件间接调用：

- `onDeleteTag` → `apiClient.deleteAdminTag`（`DELETE /api/admin/tags/<tag>`）
- `onMergeTags` → `apiClient.mergeAdminTags`（`POST /api/admin/tags/merge`）

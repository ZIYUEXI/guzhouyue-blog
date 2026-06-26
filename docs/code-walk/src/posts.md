# posts.ts

> 源路径：`src/posts.ts`
> 总行数：约 2820 行（其中绝大部分是嵌入的中文文章数据，本说明只讲解类型与逻辑部分）

定义 `Post` 文章模型，并导出一组静态文章数组、分页常量、归档分组与按 slug 查询的辅助函数。这是项目最早的静态数据来源，目前主要作为 fallback 与本地默认内容。

## 文件概览

这个文件在前端「内容层」扮演两个角色：

1. **类型定义**：`Post` / `PostStatus` 是全站文章的权威类型，被 `App.tsx`、所有管理面板、`contentStore.ts`、`apiClient.ts` 引用。
2. **静态数据 fallback**：`posts` 数组内置了约 30 篇文章（含正文 Markdown），加上从 `importedMarkdownPosts.json` 导入的额外文章。这套数据是项目早期作为纯静态博客时写死的，现在后端 FastAPI + SQLite 已经接管了真正的文章存储（见 `server_py/content.py`），但本文件仍被保留作为：离线/未登录访问时的默认列表、本地 localStorage 的初始内容、归档与相邻文章的查询源。

> **跳过部分**：第 26 行到第 2791 行是嵌入的中文文章正文数据（每篇含 `bodyMarkdown`、`seoTitle`、`seoDescription` 等长文本字段），不在本说明范围内。

## Post 与 PostStatus 类型

`PostStatus` 是文章生命周期的三种状态：`draft`（草稿，仅作者可见）、`published`（已发布，公开）、`archived`（已归档，从公开列表撤下但保留）。`Post` 类型除了基础字段（`slug` / `title` / `excerpt` / `category` / `date` / `tags` / `body`），还包含若干可选字段：

- `id?`：后端数据库 ID，本地静态数据没有这个字段。
- `status?` / `publishedAt?`：状态与发布时间。老数据没有 `status`，下游（如 `AdminPostsPanel.getPostStatus`）默认视为 `published`。
- `body: string[]` 与 `bodyMarkdown?`：历史上正文以数组形式存储（每段一项），后来改成单一 Markdown 字符串。两个字段并存是为了兼容老数据，归一化函数会互相当作 fallback。
- `seoTitle?` / `seoDescription?` / `coverImage?`：SEO 与封面，后端版本常用。
- `deletedAt?`：软删除时间戳，回收站用。
- `syncStatus?: 'synced' | 'local-only'`：本地稿同步状态，标记是否已推送到后端。

```ts
export type Post = {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  authorName?: string;
  date: string;
  status?: PostStatus;
  publishedAt?: string | null;
  tone: string;
  tags: string[];
  body: string[];
  bodyMarkdown?: string;
  seoTitle?: string;
  seoDescription?: string;
  coverImage?: string;
  deletedAt?: string;
  syncStatus?: 'synced' | 'local-only';
};
```

## posts 数组的结构

```ts
import importedMarkdownPosts from './importedMarkdownPosts.json';
// ...
export const posts: Post[] = [
  // ...约 30 篇内联文章对象，每篇含完整的 bodyMarkdown 正文
  ...(importedMarkdownPosts as Post[])
];
```

数组分两部分：前 30 篇是直接写在源文件里的对象字面量（`{ slug, title, excerpt, ..., bodyMarkdown: "..." }`），后面用展开运算符拼接 `importedMarkdownPosts.json` 里的额外文章。`as Post[]` 是把 JSON 的宽松类型断言成 `Post[]`，跳过编译期字段校验——这也是为什么需要 `contentStore.normalizePost` 在运行时兜底。

## postsPerPage

```ts
export const postsPerPage = 2;
```

公开博客首页和列表页的默认每页条数。**值只有 2**，这是开发期为了方便调试分页逻辑保留的小数字，正式环境通常会通过 `App.tsx` 中的分页组件参数覆盖。使用方在切到后端分页 API（`fetchPublicArticles` 带 `pageSize`）后，这个常量主要影响纯静态 fallback 渲染。

## archive：按月归档分组

```ts
export const archive = posts.reduce<Array<{ month: string; entries: Post[] }>>((months, post) => {
  const [year, month] = post.date.split('.');
  const monthLabel = `${year} 年 ${Number(month)} 月`;
  const existingMonth = months.find((item) => item.month === monthLabel);
  if (existingMonth) existingMonth.entries.push(post);
  else months.push({ month: monthLabel, entries: [post] });
  return months;
}, []);
```

`archive` 在模块加载时一次性计算好，把 `posts` 按 `date` 字段（格式 `"2026.05.18 22:10"`）的「年.月」前缀分组。`Number(month)` 把 `"05"` 转成 `5` 再拼成「2026 年 5 月」，去掉前导零让中文显示更自然。这个结构被 `AdminDashboardPanel` 和归档页直接消费，用来渲染「按月份折叠」的目录。注意：因为是模块加载时计算的常量，`posts` 数组如果在运行时被修改，`archive` 不会自动更新——动态归档需要在上层重新派生。

## getPostBySlug

```ts
export function getPostBySlug(slug: string) {
  return posts.find((post) => post.slug === slug);
}
```

线性查找。文章数不大（几十篇）时性能足够。**只查静态 `posts` 数组**，不查后端——动态文章请走 `apiClient` 的文章接口。在静态 fallback 场景下使用。

## getAdjacentPosts

```ts
export function getAdjacentPosts(slug: string) {
  const index = posts.findIndex((post) => post.slug === slug);
  return {
    previousPost: index > 0 ? posts[index - 1] : undefined,
    nextPost: index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined,
  };
}
```

返回当前文章在 `posts` 数组中的前一篇和后一篇，用于文章详情页底部的「上一章 / 下一章」导航。边界处理：第一篇没有 `previousPost`，最后一篇没有 `nextPost`，slug 不存在时两个都返回 `undefined`。「上一篇/下一篇」的顺序是数组顺序而不是发表时间顺序——静态数据的数组顺序已经按发表时间排好，但动态场景下需要上层用 `sortPosts` 重新排。

## 与后端 API 的关系

这套静态数据是历史遗留：

- **过去**：项目最早是纯前端静态博客，所有文章都嵌在 `posts.ts` 和 `importedMarkdownPosts.json` 里，没有后端。
- **现在**：FastAPI + SQLite 接管了文章 CRUD（见 `server_py/content.py`、`server_py/db.py`），管理员在后台写新文章会落库；公开页面优先通过 `apiClient.fetchPublicArticles` 拉后端数据。
- **本文件的角色**：仍作为 (1) TypeScript 类型来源、(2) 后端不可用或未加载时的 fallback 内容、(3) `contentStore.normalizePost` 的默认值模板（`category` 默认值 `'人间札记'`、`tone` 默认 `'ink'` 等都来自这套数据的约定）。

因此修改 `Post` 类型会牵动整个项目；但向 `posts` 数组追加新文章对象的意义不大——新文章应该通过后端管理后台创建。

# routing

> 源路径：`src/routing.ts`
> 总行数：约 67 行

把浏览器 `pathname` 翻译成可判别的 `Route` 联合类型，并提供一个判断是否为后台路径的辅助函数。

## 文件概览

项目并没有引入 react-router 等路由库，而是采用"自定义路由 + `App.tsx` 中的 `popstate` 监听"的轻量方案。这个文件就是这条链路的第一站：给定 `window.location.pathname`，返回一个判别联合 `Route`，由调用方再做 `switch(route.name)` 分发。同时导出的 `isAdminPath` 用来在前端首次加载时识别 `/admin/*` 路径，让应用决定是渲染管理后台壳子还是公开站点壳子（具体调度见 `src/App.tsx`）。所有路由约定都是字面量字符串，没有动态参数除了分页编号和文章 slug。

## Route 类型与 isAdminPath

`Route` 是一个判别联合，每种路由对应一个固定形状。`posts`/`notes`/`archive` 共用 `page` 字段（默认 1），`post` 带 `slug`，其他都是单值。这种设计让消费方拿到 `Route` 后，TypeScript 的 narrowing 能直接帮上忙，不必再做字符串解析。

```ts
export type Route =
  | { name: 'home' }
  | { name: 'posts'; page: number }
  | { name: 'notes'; page: number }
  | { name: 'archive'; page: number }
  | { name: 'gallery' }
  | { name: 'starfield' }
  | { name: 'post'; slug: string }
  | { name: 'not-found' };
```

`isAdminPath` 列出所有后台路径前缀：`/admin`、`/admin/posts`、`/admin/posts/new`，以及形如 `/admin/posts/<id>/edit` 的编辑路径。这是应用首次渲染时区分"读者站点"和"管理后台"两套完全不同的页面树的开关。

```ts
export function isAdminPath(pathname: string) {
  return (
    pathname === '/admin' ||
    pathname === '/admin/posts' ||
    pathname === '/admin/posts/new' ||
    /^\/admin\/posts\/[^/]+\/edit$/.test(pathname)
  );
}
```

## getRoute 解析器

`getRoute` 按从特殊到一般的顺序匹配字符串，全部不命中时返回 `not-found`。对于分页列表，根路径（如 `/posts`）等价于第 1 页，分页路径用 `^\/posts\/page\/(\d+)$` 这类正则捕获；对于文章详情页 `^\/posts\/([^/]+)$`，slug 通过 `decodeURIComponent` 还原成原始字符串，以支持中文 slug 等非 ASCII 字符。

```ts
const pagedPostsMatch = pathname.match(/^\/posts\/page\/(\d+)$/);
if (pagedPostsMatch) {
  return { name: 'posts', page: Number(pagedPostsMatch[1]) };
}
// ...
const postMatch = pathname.match(/^\/posts\/([^/]+)$/);
if (postMatch) {
  return { name: 'post', slug: decodeURIComponent(postMatch[1]) };
}
```

需要注意几点：`Number(...)` 没有再做范围校验，如果 URL 写成 `/posts/page/0` 或负数，会原样返回给上层，由上层在取分页列表时再兜底；文章 slug 的正则使用 `[^/]+`，所以文章 slug 内部不能含 `/`，但允许 `.`、`-` 等字符。

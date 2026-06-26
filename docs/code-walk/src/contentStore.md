# contentStore.ts

> 源路径：`src/contentStore.ts`
> 总行数：约 548 行

定义全站内容的数据形状（`SiteContent` 及其子结构）、默认值常量，以及本地 `localStorage` 持久化与容错归一化逻辑。

## 文件概览

这是前端「内容模型」的单一事实来源。`App.tsx`、各管理面板、`apiClient.ts` 都 import 这里的类型（`SiteContent` / `HomepageCopy` / `NoteSection` / `FeaturedSeries` / `GalleryAlbum` / `GalleryImage` / `AlmanacInfo`）和默认值常量。除了类型，本文件还实现了一套「从不可信 JSON 重建 `SiteContent`」的归一化管线，用于读 `localStorage` 或解析后端返回时兜底，避免脏数据让组件崩。

关键依赖：`posts.Post`。

## 类型定义：内容模型的七个部分

- `NoteSection`：分类目录条目（技术笔记、数据分析等），`category` 是显示名，`description` 是一行说明。
- `FeaturedSeries`：首页「长夜一卷」式的专题，`postSlugs` 是有序的文章 slug 列表。
- `GalleryImage` / `GalleryAlbum`：图库的两层结构。相册有 `coverImageId` / `coverImageUrl`，图片有 `sortOrder` / `capturedAt` / `sizeBytes` 等元数据。
- `HomepageCopy`：首页所有文案字段的扁平集合（站点名、slogan、hero、各区块的 eyebrow/title/body、footer 等），共 20+ 字段。
- `AlmanacInfo`：今日小记/老黄历结构（农历、节气、干支、宜忌等），可空。
- `SiteContent`：把上述全部聚合的根类型。

```ts
export type SiteContent = {
  posts: Post[];
  noteSections: NoteSection[];
  featuredSeries: FeaturedSeries[];
  galleryAlbums: GalleryAlbum[];
  homepage: HomepageCopy;
  almanac?: AlmanacInfo | null;
};
```

## 默认值常量

`defaultNoteSections` 是 7 个固定分类（技术笔记、数据分析、网络安全、游戏开发、人工智能、生活备考、数据库），即使用户没保存过也能给出非空目录。`defaultHomepageCopy` 是站点「孤舟月」的初始文案。`defaultFeaturedSeries` 复用 homepage 的系列文案，`postSlugs` 默认空。`defaultGalleryAlbums` 内置一个「系统图库」相册（slug 为 `system`），里面预置了头像、首屏、赛博月色三张全站公共图片。

`systemGalleryAlbumId` / `systemGalleryAlbumSlug` 是常量，`ensureSystemGalleryAlbums` 强制保证任何一个 `SiteContent` 都包含这个系统相册（缺失就补、重复就修正），这样其他模块引用 `/images/guzhouyue-hero.png` 这类公共图片时永远有数据。

## localStorage 读写

`siteContentStorageKey = 'guzhouyue.siteContent'` 是存储键。三个公开函数：

- `readSiteContent()`：读 localStorage，解析失败或不存在时返回 `defaultSiteContent`；解析成功则走 `normalizeSiteContent` 兜底。
- `saveSiteContent(content)`：直接 `JSON.stringify` 写回。
- `resetSiteContent()`：删 key 并返回默认值。

```ts
export function readSiteContent(): SiteContent {
  if (typeof window === 'undefined') return defaultSiteContent;
  const stored = window.localStorage.getItem(siteContentStorageKey);
  if (!stored) return defaultSiteContent;
  try { return normalizeSiteContent(JSON.parse(stored)); }
  catch { return defaultSiteContent; }
}
```

`typeof window === 'undefined'` 的判断是为了在 SSR 或预渲染环境下不访问浏览器 API。

## 归一化管线 normalizeSiteContent

这是本文件最关键的一段防御性代码。后端返回或 localStorage 读出的 JSON 不可信（字段可能缺失、类型可能错），`normalizeSiteContent` 把它逐字段清洗成保证合法的 `SiteContent`：

- `posts` 用 `normalizePost`，缺失字段给合理默认（`category` 默认 `人间札记`、`tone` 默认 `ink`、`date` 默认 `2026.05.18 00:00`、正文缺失给占位文案）。
- `noteSections` 缺失时回退到 `defaultNoteSections`。
- `homepage` 用对象展开 + `seasonAuto` 布尔兜底，保证所有字段都有值。
- `featuredSeries` 在用户没配时用 `createDefaultFeaturedSeries` 自动取前 3 篇文章，且会把指向不存在 slug 的引用过滤掉。
- `galleryAlbums` 走 `ensureSystemGalleryAlbums` 强制包含系统相册。

```ts
featuredSeries: featuredSeries.map((series) => ({
  ...series,
  postSlugs: series.postSlugs.filter((slug) => knownPostSlugs.has(slug)),
})),
```

`knownPostSlugs` 在归一化 posts 之后建立，用来清理 series 里的悬空引用——这是数据一致性的关键一步。

## 子归一化函数与类型守卫

`normalizePost` / `normalizeNoteSection` / `normalizeFeaturedSeries` / `normalizeGalleryAlbum` / `normalizeGalleryImage` / `normalizeAlmanac` 各自负责一种结构的清洗，返回 `T | null`；对应的 `isPost` / `isNoteSection` / `isFeaturedSeries` / `isGalleryAlbum` / `isGalleryImage` 是 `value is T` 类型守卫，配合 `.filter` 把 null 丢掉。`ensureSystemGalleryImages` 在系统相册层面额外保证默认三张公共图片一定存在。

## 底层工具函数

`isRecord` / `asText` / `asBoolean` / `asNumber` 是四个微型类型转换助手——`asText` 把任何非字符串值变成 `''` 而不是抛错，`asNumber` 只接受有限数字否则回退。`slugify` 把标题转成 URL 友好的 slug，保留中文（`一-龥`）、小写字母、数字和连字符，空值兜底成 `post-<timestamp>`。这一套助手在 `apiClient.ts` 里被复制了一份，两边刻意保持独立避免循环依赖。

## 与 apiClient 的关系

`apiClient.ts` 里有平行的 `normalizeApiPost` / `normalizeApiGalleryAlbum` 等函数处理**后端返回**的 JSON；本文件处理的是**前端 localStorage 缓存**的 JSON。两套归一化逻辑相似但用途不同：后端版本会处理 `publishedAt` / `seoTitle` 等数据库字段，本版本更聚焦于本地草稿和默认值兜底。

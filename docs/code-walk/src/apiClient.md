# apiClient.ts

> 源路径：`src/apiClient.ts`
> 总行数：约 1510 行

前端访问后端 FastAPI 的统一入口：定义所有 API 的请求函数、payload 类型、错误类型，以及把不可信 JSON 归一化成强类型领域对象的助手集合。

## 文件概览

这是前后端契约的 TypeScript 投影。整个项目的 React 组件不直接调 `fetch`，而是 import 这里的函数（如 `fetchPublicSite` / `createAdminArticle` / `generateAdminStarfieldPassages`）。本文件按职责可分五大块：(1) 错误类型 `ApiError`；(2) 一长串 payload / 实体类型；(3) 公共请求函数 `requestJson`（含 CSRF、cookie、FormData）；(4) 按业务域分组的公开接口与管理接口函数；(5) 归一化函数（`normalizeApiPost` / `normalizeStarfieldPassage` 等）。

关键依赖：`contentStore` 的所有领域类型、`posts.Post` / `PostStatus`、`siteSettings.SiteSettings`。

## ApiError：统一的 HTTP 错误

```ts
export class ApiError extends Error {
  status: number;
  path: string;
  constructor(status, path) {
    super(`API ${status}: ${path}`);
    this.name = 'ApiError';
    this.status = status; this.path = path;
  }
}
```

`requestJson` 在 `!response.ok` 时抛 `ApiError`，调用方可以用 `instanceof ApiError` 区分网络错误和业务错误，并读取 `status`（401 未登录、403 无权限、404 不存在等）做相应处理。

## Payload 与实体类型

文件开头定义了几乎所有跨网络传输的类型，可按业务域归类：

- **站点**：`ApiSitePayload`（含 settings / homepage / noteSections / featuredSeries / galleryAlbums / almanac）、`ApiContentPayload`、`ApiArticlesPayload`。
- **标签**：`ApiAdminTag`（`name` / `articleCount` / `occurrenceCount`）、`ApiAdminTagMutationPayload`（删除/合并后返回 `{ updatedCount, articles }`）。
- **图库**：`ApiGalleryImagesPayload`（分页结构）。
- **星图**：这是最大的类型族。`ApiStarfieldVersion`（版本，含 `parentVersionId` / `changeMode` / 各种 count）、`ApiStarfieldPassage`（带 `article` 嵌套对象）、`ApiStarfieldRelationship`（11 种 `relationshipType` 联合 + 5 种 `changeState` 联合）、`ApiStarfieldCanonicalKeyword`（合并标签）、`ApiStarfieldDeepPath`（带 `inquiry` 嵌套和 `retrievalNotes` 数组）、`ApiAdminStarfieldVersionPayload`（管理端版本详情的聚合结构）、`ApiAdminTask`（后台任务）。
- **评论**：`ApiComment`（公开）、`ApiAdminComment`（管理端，带 `status` / `articleSlug` / `articleTitle`）、`AdminCommentStatus = 'pending' | 'approved' | 'rejected'`。
- **运维**：`ApiAdminOps`（api/database/llmTokenUsage/recentAudit 等聚合体检信息）。
- **LLM**：`LlmProvider`（8 种供应商枚举）、`ApiLlmConfig`、`ApiLlmTokenUsageSummary` / `ApiLlmTokenUsageItem` / `ApiLlmTokenUsagePayload`（分页）、`ApiLlmConnectionTestResult`、`ApiArticleMetadataSuggestion`。
- **指令**：`ApiAdminCommandInvocation` / `ApiAdminCommandDescriptor` / `ApiAdminCommandGuide` / `ApiAdminCommandAiMessage` / `ApiAdminCommandParseResult`（区分 ok 与不 ok 的判别联合）/ `ApiAdminCommandRunResult`（六种 status 的判别联合）/ `ApiAdminCommandAiResult`。
- **草稿**：`ApiComposerDraft`（编辑器草稿，含 `composerMode: 'wysiwyg' | 'markdown' | 'split'`）。

判别联合（discriminated union）在这里用得很重，让调用方在 `if (result.status === 'executed')` 后能安全访问 `result.result` 字段。

## requestJson：公共请求函数

```ts
async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const headers = new Headers(isFormData ? { Accept: 'application/json' } : jsonHeaders);
  const csrfHeader = csrfHeaderForRequest(init.method);
  if (csrfHeader) headers.set('X-CSRF-Token', csrfHeader);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(path, { credentials: 'include', ...init, headers });
  if (!response.ok) throw new ApiError(response.status, path);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
```

四件事：

1. **JSON 或 FormData**：如果是 `FormData`（图片上传场景），只设 `Accept`，让浏览器自动加 multipart 边界；否则用预设的 `jsonHeaders`。
2. **CSRF**：`csrfHeaderForRequest` 对所有非简单方法（非 GET/HEAD/OPTIONS）从 cookie `guzhouyue_csrf` 读 token，塞进 `X-CSRF-Token` 请求头。后端会校验该头与 cookie 一致，防御 CSRF 攻击。
3. **Cookie**：`credentials: 'include'` 让跨域请求带上会话 cookie（登录态依赖此）。
4. **204 处理**：DELETE 等无内容响应直接返回 `undefined`，避免 `.json()` 报错。

## 公开接口（无需登录）

```ts
fetchPublicSite()              // GET /api/site
fetchPublicArticles()          // GET /api/articles?pageSize=1000
fetchPublicGallery()           // GET /api/gallery
fetchPublicStarfield()         // GET /api/starfield（带归一化）
fetchPublicGalleryAlbumImages(albumIdOrSlug, {page, pageSize})  // 分页拉相册图片
fetchArticleComments(slug)     // GET /api/articles/<slug>/comments
submitArticleComment(slug, {authorName, content})  // POST 提交评论（公开）
```

`fetchPublicArticles` / `fetchPublicGallery` 等都做了 `Array.isArray(payload) ? payload : payload.items ?? []` 的兼容——后端可能直接返回数组，也可能返回 `{ items: [...] }` 包装，前端两种都吃。`fetchPublicStarfield` 会把 `passages` / `relationships` / `deepPaths` 三个数组分别过归一化函数过滤掉 null。

## 管理接口：认证与基础

```ts
fetchAdminMe()                 // GET /api/admin/me（检查登录态）
loginAdmin(password)           // POST /api/admin/login
logoutAdmin()                  // POST /api/admin/logout
fetchAdminContent()            // GET /api/admin/content（兼容 { content: ... } 包装）
fetchAdminOps()                // GET /api/admin/ops
```

`fetchAdminContent` 特意处理了后端可能用 `{ content: {...} }` 包装的情况，把内层 content 提出来返回。

## 管理接口：文章域

```ts
createAdminArticle(post)              // POST /api/admin/articles
updateAdminArticle(originalSlug, post) // PUT /api/admin/articles/<slug>
publishAdminArticle(slug)             // POST .../publish
unpublishAdminArticle(slug)           // POST .../unpublish
deleteAdminArticle(slug)              // DELETE
fetchAdminDeletedArticles()           // GET /api/admin/trash/articles
restoreAdminArticle(slug)             // POST .../restore
```

写操作用 `postToApiArticle(post)` 把前端 `Post` 转成后端期望的形状（补 `bodyMarkdown` fallback、`status` / `publishedAt` / `seoTitle` 等默认值）。

## 管理接口：标签域

```ts
fetchAdminTags()             // GET /api/admin/tags → 归一化成 ApiAdminTag[]
deleteAdminTag(tag)          // DELETE /api/admin/tags/<tag> → 返回 mutation payload
mergeAdminTags(source, target) // POST /api/admin/tags/merge
```

`normalizeAdminTagMutationPayload` 把不可信返回清洗成 `{ updatedCount, articles }`。

## 管理接口：笔记分区与专题

```ts
saveAdminNoteSections(sections)  // PUT /api/admin/note-sections
saveAdminFeaturedSeries(series)  // PUT /api/admin/featured-series
```

## 管理接口：图库域

```ts
fetchAdminGallery()                       // GET /api/admin/gallery
createAdminGalleryAlbum(album)            // POST /api/admin/gallery/albums
updateAdminGalleryAlbum(idOrSlug, album)  // PUT
deleteAdminGalleryAlbum(idOrSlug)         // DELETE
uploadAdminGalleryImage(albumIdOrSlug, file, payload)  // POST FormData 上传
replaceAdminGalleryImageFile(id, file)                 // POST FormData 替换图片文件
updateAdminGalleryImage(id, image)        // PUT 更新图片元数据
deleteAdminGalleryImage(id)               // DELETE
```

上传用 `FormData`：把 `image` 文件 + `title` / `description` / `capturedAt` / `isPublic` / `sortOrder` 文本字段拼一起，靠 `requestJson` 自动识别 FormData 切换 header。`albumToApi` / `imageToApi` 两个助手剥离掉前端独有的字段（如 `images` 嵌套），只送后端需要的扁平字段。

## 管理接口：评论域

```ts
fetchAdminComments(status: AdminCommentStatus)  // GET /api/admin/comments?status=...
updateAdminCommentStatus(id, status)            // PUT /api/admin/comments/<id>
```

## 管理接口：星图域（最大的一组）

```ts
// 版本
fetchAdminStarfieldVersions()
createAdminStarfieldVersion(name)
createIncrementalAdminStarfieldVersion(name, parentVersionId?)
fetchAdminStarfieldVersion(id)
publishAdminStarfieldVersion(id)
archiveAdminStarfieldVersion(id)
deleteAdminStarfieldVersion(id)

// 生成（都是 POST，返回最新的版本 payload）
generateAdminStarfieldPassages(versionId, articleIds)
generateAdminStarfieldRelationships(versionId)
generateAdminStarfieldDeepRelationships(versionId)

// 单项编辑（PUT，返回版本 payload）
updateAdminStarfieldPassage(id, payload)
updateAdminStarfieldRelationship(id, payload)
updateAdminStarfieldDeepPath(id, payload)

// 批量审核（POST，按 versionId 批量改状态）
bulkUpdateAdminStarfieldPassages(versionId, { status, passageIds?, sourceStatus? })
bulkUpdateAdminStarfieldRelationships(versionId, { status, relationshipIds?, sourceStatus?, crossArticleOnly? })
bulkUpdateAdminStarfieldDeepPaths(versionId, { status, pathIds?, sourceStatus? })

// 任务
fetchAdminTasks()  // GET /api/admin/tasks
```

所有星图写操作的返回都过 `normalizeAdminStarfieldVersionPayload`，保证前端拿到的是结构完整、字段合法的 `ApiAdminStarfieldVersionPayload`（version + passages + relationships + canonicalKeywords + deepPaths + jobs），UI 组件不需要再做 null 检查。

## 管理接口：指令域

```ts
fetchAdminCommandGuide()                  // GET /api/admin/commands
parseAdminCommand(input)                  // POST /api/admin/commands/parse
runAdminCommand(input, {confirm?, dryRun?}) // POST /api/admin/commands/run
runAdminCommandAi({message, history, recentResults}) // POST /api/admin/commands/ai
```

## 管理接口：LLM 域

```ts
fetchAdminLlmConfig()                       // GET /api/admin/llm-config
saveAdminLlmConfig(config)                  // PUT
testAdminLlmConnection()                    // POST .../test
fetchAdminLlmTokenUsage(page, pageSize)     // GET 分页拉取 token 用量
generateAdminArticleMetadata(payload)       // POST /api/admin/ai-agent/article-metadata
```

## 管理接口：草稿域

```ts
fetchAdminDraft(draftKey)    // GET  /api/admin/drafts/<key>
saveAdminDraft(draftKey, draft)  // PUT
clearAdminDraft(draftKey)    // DELETE
```

`normalizeComposerDraftResponse` 把可能被 `{ draft: {...}, savedAt: ... }` 包装的返回展开成扁平的 `ApiComposerDraft`。

## 归一化函数

文件后半段是一长串 `normalize*` 函数，把不可信的 JSON 转成强类型对象。它们的共同模式：

- 入口先 `isRecord(value)` 检查，非对象直接返回 `null`；
- 关键字段（如 `id` / `imageUrl` / `name` / `title`）缺失时返回 `null`；
- 其余字段用 `asText` / `asNumber` / `asBoolean` 兜底成默认值；
- 枚举字段用对应的 `normalize*Status` / `normalizeRelationshipType` 等窄化函数，非法值回退到默认枚举。

重要的几个：

- **`normalizeApiPost`**：后端文章转 `Post`。处理 `bodyMarkdown || body` 的双向 fallback、`date || dateLabel || formatApiDate(publishedAt)` 的多级日期 fallback、`status` 默认 `published`。导出供 `App.tsx` 在合并后端与本地数据时使用。
- **`normalizeApiNoteSections` / `normalizeApiFeaturedSeries`**：处理 series 的 `postSlugs` 或 `items[].slug` 两种来源。
- **`normalizeApiGalleryAlbums` / `normalizeApiGalleryAlbum` / `normalizeApiGalleryImage`**：图库两层结构的清洗。
- **`normalizeStarfieldVersion` / `normalizeStarfieldPassage` / `normalizeStarfieldRelationship` / `normalizeStarfieldCanonicalKeyword` / `normalizeStarfieldDeepPath`**：星图五大实体的清洗，把 `status` 收敛到 `suggested/accepted/hidden`、`relationshipType` 收敛到 11 种合法值、`changeState` 收敛到 5 种合法值。
- **`normalizeAdminStarfieldVersionPayload`**：聚合成版本 payload，version 字段缺失时给一个空对象默认值，保证下游解构不崩。
- **`normalizeStarfieldJob`**：任务清洗，`phase` / `status` 收敛到合法枚举。
- **`normalizeComment` / `normalizeAdminComment` / `normalizeAdminTag` / `normalizeAdminTagMutationPayload` / `normalizeComposerDraftResponse`**：其他领域的清洗。

## 反向转换助手

`postToApiArticle` / `albumToApi` / `imageToApi` 是「前端领域对象 → 后端 payload」的反向转换，在写操作前调用。它们剥离前端独有的派生字段（如 `album.images`），保证后端不会收到不该存的字段。

## 底层助手函数

- `formatApiDate(iso)`：把 ISO 时间转成 `YYYY.MM.DD HH:MM` 显示格式。
- `isRecord` / `asText` / `asBoolean` / `asNumber`：四个微型类型转换，与 `contentStore.ts` 里同名函数保持一致（故意重复，避免循环依赖）。
- `normalizePostStatus` / `normalizeCommentStatus` / `normalizeRelationshipType` / `normalizeRelationshipChangeState`：枚举窄化。
- `csrfHeaderForRequest(method)` / `readCookie(name)`：CSRF token 的读取链路。
- `slugify(value)`：与 `contentStore.slugify` 同实现。

## 设计要点

- **统一入口**：所有请求过 `requestJson`，保证 CSRF、cookie、错误处理一致。
- **判别联合 + 归一化**：类型层面用判别联合表达多态返回，运行时用归一化函数保证字段合法，组件层不需要写防御代码。
- **容错**：后端返回可能是数组、可能是 `{ items }`、可能是 `{ content: {...} }` 包装，每个 fetch 函数都做了多层 fallback。
- **无循环依赖**：与 `contentStore.ts` 共享的同名助手函数各自独立实现，避免 `apiClient ↔ contentStore` 循环 import。

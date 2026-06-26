# articleSeo

> 源路径：`src/articleSeo.ts`
> 总行数：约 77 行

文章详情页打开后，把 SEO 相关的 `<title>`、meta、canonical、JSON-LD 写进 `<head>` 的 React Hook。

## 文件概览

这是一个纯客户端 SEO 处理器：拿到当前文章对象 `Post`（类型见 `src/posts.ts`），在 `useEffect` 中根据字段拼出标题、描述、社交分享卡所需的 og/twitter meta、canonical link，以及一段 schema.org 的 `BlogPosting` JSON-LD，让搜索引擎和社交平台抓取文章时能拿到结构化信息。这个 Hook 通常在文章详情页组件里被调用，依赖项是 `post`：文章切换时它会重写 head 标签，不需要重新加载页面。SSR 不在本项目范围，所以这里直接操作 `document`。

## useArticleHead Hook

Hook 内部对每个字段都做了 fallback：标题优先用 `seoTitle`，否则拼 `"<标题> | 孤舟月"`；描述优先 `seoDescription`，否则用 `excerpt`；如果有 `coverImage`，把它转成绝对 URL（`new URL(post.coverImage, window.location.origin)`），用于社交分享大图，twitter 卡类型同时切换为 `summary_large_image`。canonical URL 永远用 `<origin>/posts/<encoded slug>`，与后端路由（`server_py/app.py`）保持一致。

```ts
const canonicalUrl = `${window.location.origin}/posts/${encodeURIComponent(post.slug)}`;
const title = post.seoTitle || `${post.title} | 孤舟月`;
const description = post.seoDescription || post.excerpt;
const imageUrl = post.coverImage ? new URL(post.coverImage, window.location.origin).toString() : '';

document.title = title;
setMetaTag('name', 'description', description);
setMetaTag('property', 'og:type', 'article');
setMetaTag('property', 'og:title', title);
// ...
```

依赖项只有 `[post]`：当 `post` 引用变化时整套 head 重写一次，跳转的文章的旧 meta 会被覆盖。

## head 元素的写入辅助

`setMetaTag` 是按 `meta[name="..."]` / `meta[property="..."]` 复合选择器去查或创建元素的，这样保证同 key meta 不会重复出现。`setCanonicalUrl` 同样查/建 `link[rel="canonical"]`，`setJsonLd` 给 JSON-LD 脚本一个固定 id `article-json-ld`，复用同一个 `<script>` 节点，避免每次切换文章都新增一个。

```ts
function setMetaTag(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}
```

JSON-LD 输出的是 `BlogPosting`，含 `headline`、`description`、`datePublished`/`dateModified`（都取 `publishedAt || date`）、`author`（默认 `'孤舟月'`）以及 `mainEntityOfPage`。当文章没有封面图时 `image` 字段被省略，避免输出空字符串造成 schema 解析异常。
